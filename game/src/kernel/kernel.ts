import { seededRandom } from "../core/random";
import { type Clock, createClock } from "./clock";
import { type EventLog, type EventLogOptions, createEventLog } from "./eventLog";
import { type Executor, createExecutor } from "./executor";
import type { Emitted, PluginContext, PluginFolder } from "./plugins";
import { type Registry, createRegistry } from "./registry";

export interface KernelOptions extends EventLogOptions {
  readonly plugins: readonly PluginFolder[];
  /** Seeds the only random source plugins get, so a session replays exactly. */
  readonly seed?: number;
  /** Wall-clock ms, used only to check plugin time budgets. */
  readonly now?: () => number;
}

/** The headless kernel: no camera and no rendering, just the loop over plugins. */
export interface Kernel {
  readonly clock: Clock;
  readonly log: EventLog;
  readonly registry: Registry;
  readonly executor: Executor;
  /** Runs one 30 Hz tick: senses emit, due brains decide, the executor plays. */
  tick(): void;
}

export function createKernel({
  plugins,
  seed = 0,
  now = () => performance.now(),
  ...logOptions
}: KernelOptions): Kernel {
  const clock = createClock();
  const log = createEventLog(logOptions);
  const registry = createRegistry(plugins);
  const random = seededRandom(seed);
  const append = (source: string, { type, data }: Emitted) => {
    log.append({ t: clock.t, type, source, data });
  };
  const executor = createExecutor(registry.skills, (event) => {
    append("executor", event);
  });
  let seen = 0;

  const timed = <T>(plugin: string, budgetMs: number, run: () => T): T => {
    const start = now();
    const result = run();
    const ms = now() - start;
    if (ms > budgetMs)
      append("kernel", { type: "guardian.over_budget", data: { plugin, ms, budget_ms: budgetMs } });
    return result;
  };

  const tick = () => {
    if (clock.paused) return;
    const t = clock.tick();
    for (const { manifest, sense } of registry.senses) {
      const emitted = timed(manifest.id, manifest.budget_ms, () =>
        sense({ t, events: [], random }),
      );
      for (const event of emitted) append(manifest.id, event);
    }
    const ctx: PluginContext = { t, events: log.since(seen), random };
    seen = log.count;
    for (const { manifest, decide } of registry.due(t, ctx.events)) {
      const intent = timed(manifest.id, manifest.latency_budget_ms, () => decide(ctx));
      if (!intent) continue;
      append(manifest.id, { type: "intent.proposed", data: { ...intent } });
      executor.offer(intent, ctx);
    }
    executor.tick(ctx);
  };

  return { clock, log, registry, executor, tick };
}
