import type { Intent } from "../core/contracts";
import { seededRandom } from "../core/random";
import { type Clock, createClock } from "./clock";
import { type EventLog, type EventLogOptions, createEventLog } from "./eventLog";
import { type Executor, createExecutor } from "./executor";
import type { Guardian } from "./guardian/guardian";
import type { Behavior, Emitted, PluginContext, PluginFolder } from "./plugins";
import { type Registry, createRegistry } from "./registry";

export interface KernelOptions extends EventLogOptions {
  readonly plugins: readonly PluginFolder[];
  /**
   * Seeds the only random sources plugins get, so a session replays exactly. Senses draw from
   * their own stream, so replaying without them leaves the brains' and skills' numbers unchanged.
   */
  readonly seed?: number;
  /** Wall-clock ms, used only to check plugin time budgets. */
  readonly now?: () => number;
  /** Checks every brain intent before the executor sees it; without one, intents go straight in. */
  readonly guardian?: Guardian;
  /** The behaviors behavior intents may name, by id. */
  readonly behaviors?: ReadonlyMap<string, Behavior>;
}

/** The headless kernel: no camera and no rendering, just the loop over plugins. */
export interface Kernel {
  readonly clock: Clock;
  readonly log: EventLog;
  readonly registry: Registry;
  readonly executor: Executor;
  /** Runs one 30 Hz tick: senses emit, due brains decide, the guardian checks, the executor plays. */
  tick(): void;
}

/** Mixed into the seed for the senses' stream, so it differs from the brains' stream. */
const SENSE_STREAM = 0x5e45e;

/** Runs a plugin call and logs it when it took longer than the plugin's time budget. */
function timer(now: () => number, append: (source: string, event: Emitted) => void) {
  return <T>(plugin: string, budgetMs: number, run: () => T): T => {
    const start = now();
    const result = run();
    const ms = now() - start;
    if (ms > budgetMs)
      append("kernel", { type: "guardian.over_budget", data: { plugin, ms, budget_ms: budgetMs } });
    return result;
  };
}

/** Has the guardian, if there is one, check a brain's intent and logs its verdict; returns what may play. */
function checker(log: EventLog, guardian: Guardian | undefined) {
  return (brain: string, intent: Intent, t: number): Intent | null => {
    if (!guardian) return intent;
    const verdict = guardian.check(brain, intent, t);
    log.append(verdict.event);
    return verdict.intent;
  };
}

export function createKernel({
  plugins,
  seed = 0,
  now = () => performance.now(),
  guardian,
  behaviors,
  ...logOptions
}: KernelOptions): Kernel {
  const clock = createClock();
  const log = createEventLog(logOptions);
  const registry = createRegistry(plugins);
  const random = seededRandom(seed);
  const senseRandom = seededRandom(seed ^ SENSE_STREAM);
  const append = (source: string, { type, data }: Emitted) => {
    log.append({ t: clock.t, type, source, data });
  };
  const executor = createExecutor(
    registry.skills,
    (event) => {
      append("executor", event);
    },
    behaviors,
  );
  const check = checker(log, guardian);
  const timed = timer(now, append);
  let seen = 0;

  const tick = () => {
    if (clock.paused) return;
    const t = clock.tick();
    for (const { manifest, sense } of registry.senses) {
      const emitted = timed(manifest.id, manifest.budget_ms, () =>
        sense({ t, events: [], random: senseRandom }),
      );
      for (const event of emitted) append(manifest.id, event);
    }
    const ctx: PluginContext = { t, events: log.since(seen), random };
    seen = log.count;
    for (const { manifest, decide } of registry.due(t, ctx.events)) {
      const intent = timed(manifest.id, manifest.latency_budget_ms, () => decide(ctx));
      if (!intent) continue;
      append(manifest.id, { type: "intent.proposed", data: { ...intent } });
      const checked = check(manifest.id, intent, t);
      if (checked) executor.offer(checked, ctx);
    }
    executor.tick(ctx);
  };

  return { clock, log, registry, executor, tick };
}
