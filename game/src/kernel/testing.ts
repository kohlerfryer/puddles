import type { Event, Intent } from "../core/contracts";
import { createKernel } from "./kernel";
import type { Activity, Emitted, PluginContext, PluginFolder } from "./plugins";

const common = { contract: "1", authors: ["Puddles"], license: "MIT" };

/** A skill that finishes after `ticks` ticks with `status`, for headless kernel tests. */
export function fakeSkill(
  id: string,
  ticks: number,
  status: "done" | "failed" = "done",
): PluginFolder {
  return {
    manifest: {
      ...common,
      kind: "skill",
      id,
      name: id,
      params: {},
      needs: [],
      duration_s: ticks / 30,
      energy: 0,
      outcomes: ["done"],
    },
    code: {
      start: (): Activity => {
        let left = ticks;
        return {
          tick: () => (--left > 0 ? "running" : { status, reason: `${id} ${status}` }),
        };
      },
    },
  };
}

/** A sense that emits whatever `emit` returns each tick. */
export function fakeSense(id: string, emit: (ctx: PluginContext) => Emitted[]): PluginFolder {
  return {
    manifest: {
      ...common,
      kind: "sense",
      id,
      name: id,
      inputs: ["recording"],
      emits: ["observation.fake"],
      budget_ms: 2,
    },
    code: { sense: emit },
  };
}

/** Ticks a headless kernel running only `sense` until `ms` of kernel time have passed. */
export function runSense(sense: PluginFolder, ms: number): Event[] {
  const kernel = createKernel({ plugins: [sense], now: () => 0 });
  while (kernel.clock.t <= ms) kernel.tick();
  return kernel.log.events();
}

/** A brain with the given cadence that decides with `decide`. */
export function fakeBrain(
  id: string,
  cadence: unknown,
  decide: (ctx: PluginContext) => Intent | null,
): PluginFolder {
  return {
    manifest: {
      ...common,
      kind: "brain",
      id,
      name: id,
      cadence,
      autonomy: 1,
      latency_budget_ms: 5,
      intents: ["routine"],
    },
    code: { decide },
  };
}

/** A routine intent from `brain` that plays the named skills in order. */
export function routine(brain: string, priority: number, ...skills: string[]): Intent {
  const [first, ...rest] = skills.map((skill) => ({ skill, args: {} }));
  if (!first) throw new Error("a routine needs a step");
  return { brain, priority, kind: "routine", steps: [first, ...rest], why: "test" };
}
