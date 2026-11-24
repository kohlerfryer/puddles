import { describe, expect, it } from "vitest";

import type { Intent, KernelEvent } from "../core/contracts";
import { seededRandom } from "../core/random";
import { createExecutor } from "./executor";
import type { Activity, Behavior, Emitted, PluginFolder } from "./plugins";
import { createRegistry } from "./registry";
import { fakeSkill, routine } from "./testing";

/** Pecks `times` times (from its params), then walks off; gives up if a step fails. */
const pecking: Behavior = ({ times }) => {
  let left = Number(times);
  return (last) => {
    if (last?.status === "failed") return { status: "failed", reason: "gave up" };
    left -= 1;
    if (left >= 0) return { skill: "peck", args: {} };
    return left === -1 ? { skill: "walk", args: {} } : { status: "done", effects: { fed: true } };
  };
};

/** Tries to trip once, which always fails, and ends the way the trip did. */
const clumsy: Behavior = () => (last) => last ?? { skill: "trip", args: {} };

/** Asks for a skill nobody installed. */
const juggling: Behavior = () => () => ({ skill: "juggle", args: {} });

/** A skill that runs until it hears a `bell` event. */
const listening: PluginFolder = {
  ...fakeSkill("listen", 1),
  code: {
    start: (): Activity => ({
      tick: (_t, events) =>
        events.some((e) => e.type === "bell") ? { status: "done" } : "running",
    }),
  },
};

const BEHAVIORS = new Map([
  ["pecking", pecking],
  ["clumsy", clumsy],
  ["juggling", juggling],
]);

const behavior = (brain: string, priority: number, id: string, params = {}): Intent => ({
  brain,
  priority,
  kind: "behavior",
  behavior: { id, params },
  why: "test",
});

function setup() {
  const emitted: Emitted[] = [];
  const actions: Emitted[] = [];
  const registry = createRegistry([
    fakeSkill("walk", 2),
    fakeSkill("peck", 1),
    fakeSkill("trip", 1, "failed"),
    listening,
  ]);
  const executor = createExecutor(
    registry.skills,
    (e) => (e.type.startsWith("action.") ? actions : emitted).push(e),
    BEHAVIORS,
  );
  let t = 0;
  let events: KernelEvent[] = [];
  const ctx = () => ({ t, events, random: seededRandom(1) });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      t += 33;
      executor.tick(ctx());
    }
  };
  const offer = (intent: Intent) => executor.offer(intent, ctx());
  const types = () => emitted.map((e) => e.type);
  const hear = (heard: KernelEvent[]) => {
    events = heard;
  };
  return { emitted, actions, executor, tick, offer, types, hear };
}

describe("createExecutor", () => {
  it("plays a routine's steps in order and reports each outcome", () => {
    const { executor, tick, offer, types, emitted } = setup();
    expect(offer(routine("bandit", 1, "walk", "peck"))).toBe(true);
    tick(3);
    expect(types()).toEqual(["intent.started", "outcome.done", "outcome.done", "intent.done"]);
    expect(emitted[1]?.data).toEqual({ step: 0, status: "done", reason: "walk done" });
    expect(emitted[2]?.data).toMatchObject({ step: 1, status: "done" });
    expect(executor.current).toBeNull();
  });

  it("stops the routine when a step fails", () => {
    const { tick, offer, types, emitted } = setup();
    offer(routine("bandit", 1, "trip", "peck"));
    tick(2);
    expect(types()).toEqual(["intent.started", "outcome.failed", "intent.failed"]);
    expect(emitted[2]?.data).toEqual({ brain: "bandit", step: 0 });
  });

  it("fails a step whose skill isn't installed", () => {
    const { offer, emitted } = setup();
    offer(routine("bandit", 1, "juggle"));
    expect(emitted[1]?.data).toEqual({
      step: 0,
      status: "failed",
      reason: "unknown skill: juggle",
    });
    expect(emitted[2]?.type).toBe("intent.failed");
  });

  it("lets a higher priority intent interrupt the running one", () => {
    const { executor, tick, offer, types, emitted } = setup();
    offer(routine("bandit", 1, "walk"));
    expect(offer(routine("reflexes", 5, "peck"))).toBe(true);
    expect(types()).toEqual([
      "intent.started",
      "outcome.interrupted",
      "intent.preempted",
      "intent.started",
    ]);
    expect(emitted[1]?.data).toEqual({
      step: 0,
      status: "interrupted",
      reason: "preempted by reflexes",
    });
    expect(executor.current?.brain).toBe("reflexes");
    tick();
    expect(types().slice(-2)).toEqual(["outcome.done", "intent.done"]);
  });

  it("drops an intent that doesn't outrank the running one", () => {
    const { executor, offer, emitted } = setup();
    offer(routine("bandit", 3, "walk"));
    expect(offer(routine("planner", 3, "peck"))).toBe(false);
    expect(emitted.at(-1)).toEqual({
      type: "intent.dropped",
      data: { brain: "planner", reason: "bandit is running at priority 3" },
    });
    expect(executor.current?.brain).toBe("bandit");
  });

  it("drops goals, which it can't play yet", () => {
    const { offer, emitted } = setup();
    const goal: Intent = { brain: "planner", priority: 1, kind: "goal", why: "x" };
    expect(offer(goal)).toBe(false);
    expect(emitted).toEqual([
      {
        type: "intent.dropped",
        data: { brain: "planner", reason: "the executor plays routines and behaviors only" },
      },
    ]);
  });

  it("plays a behavior through its skills and reports one outcome at the end", () => {
    const { executor, tick, offer, types, emitted } = setup();
    expect(offer(behavior("bandit", 1, "pecking", { times: 2 }))).toBe(true);
    tick(3);
    expect(executor.current?.brain).toBe("bandit");
    tick();
    expect(types()).toEqual(["intent.started", "outcome.done", "intent.done"]);
    expect(emitted[1]?.data).toEqual({ step: 0, status: "done", effects: { fed: true } });
    expect(executor.current).toBeNull();
  });

  it("lets the behavior decide what a failed skill means", () => {
    const { tick, offer, types, emitted } = setup();
    offer(behavior("bandit", 1, "clumsy"));
    tick();
    expect(types()).toEqual(["intent.started", "outcome.failed", "intent.failed"]);
    expect(emitted[1]?.data).toEqual({ step: 0, status: "failed", reason: "trip failed" });
    expect(emitted[2]?.data).toEqual({ brain: "bandit", step: 0 });
  });

  it("fails a behavior that asks for a skill that isn't installed", () => {
    const { offer, types, emitted } = setup();
    offer(behavior("bandit", 1, "juggling"));
    expect(types()).toEqual(["intent.started", "outcome.failed", "intent.failed"]);
    expect(emitted[1]?.data).toEqual({
      step: 0,
      status: "failed",
      reason: "unknown skill: juggle",
    });
  });

  it("drops a behavior that isn't registered", () => {
    const { executor, offer, emitted } = setup();
    expect(offer(behavior("copy", 1, "copy_me"))).toBe(false);
    expect(emitted).toEqual([
      { type: "intent.dropped", data: { brain: "copy", reason: "unknown behavior: copy_me" } },
    ]);
    expect(executor.current).toBeNull();
  });

  it("lets a higher priority intent interrupt a running behavior, with its one outcome", () => {
    const { executor, tick, offer, types, emitted } = setup();
    offer(behavior("bandit", 1, "pecking", { times: 3 }));
    tick(2);
    expect(offer(routine("reflexes", 4, "walk"))).toBe(true);
    expect(types()).toEqual([
      "intent.started",
      "outcome.interrupted",
      "intent.preempted",
      "intent.started",
    ]);
    expect(emitted[1]?.data).toEqual({
      step: 0,
      status: "interrupted",
      reason: "preempted by reflexes",
    });
    expect(executor.current?.brain).toBe("reflexes");
  });

  it("keeps a running behavior when an equal or lower priority intent arrives", () => {
    const { executor, offer, types } = setup();
    offer(behavior("bandit", 2, "pecking", { times: 3 }));
    expect(offer(routine("planner", 2, "walk"))).toBe(false);
    expect(offer(behavior("reflexes", 1, "clumsy"))).toBe(false);
    expect(types()).toEqual(["intent.started", "intent.dropped", "intent.dropped"]);
    expect(executor.current?.brain).toBe("bandit");
  });

  it("logs each skill step as it starts, with the brain that asked", () => {
    const { tick, offer, actions } = setup();
    const steps: Intent["steps"] = [
      { skill: "walk", args: { to: 3 }, say: "Hi!" },
      { skill: "peck", args: {} },
    ];
    offer({ ...routine("reflexes", 1, "walk"), steps });
    expect(actions).toEqual([
      {
        type: "action.started",
        data: { brain: "reflexes", skill: "walk", args: { to: 3 }, say: "Hi!" },
      },
    ]);
    tick(2);
    expect(actions[1]).toEqual({
      type: "action.started",
      data: { brain: "reflexes", skill: "peck", args: {} },
    });
  });

  it("lets a running skill hear the tick's events", () => {
    const { tick, offer, types, hear } = setup();
    offer(routine("copy", 1, "listen"));
    tick(3);
    expect(types()).toEqual(["intent.started"]);
    hear([{ t: 99, type: "bell", source: "test", data: {} }]);
    tick();
    expect(types()).toEqual(["intent.started", "outcome.done", "intent.done"]);
  });

  it("does nothing when idle", () => {
    const { tick, emitted } = setup();
    tick(3);
    expect(emitted).toEqual([]);
  });
});
