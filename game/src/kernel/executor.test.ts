import { describe, expect, it } from "vitest";

import type { Intent } from "../core/contracts";
import { seededRandom } from "../core/random";
import { createExecutor } from "./executor";
import type { Emitted } from "./plugins";
import { createRegistry } from "./registry";
import { fakeSkill, routine } from "./testing";

function setup() {
  const emitted: Emitted[] = [];
  const registry = createRegistry([
    fakeSkill("walk", 2),
    fakeSkill("peck", 1),
    fakeSkill("trip", 1, "failed"),
  ]);
  const executor = createExecutor(registry.skills, (e) => emitted.push(e));
  let t = 0;
  const ctx = () => ({ t, events: [], random: seededRandom(1) });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      t += 33;
      executor.tick(ctx());
    }
  };
  const offer = (intent: Intent) => executor.offer(intent, ctx());
  const types = () => emitted.map((e) => e.type);
  return { emitted, executor, tick, offer, types };
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

  it("drops intents it can't play yet", () => {
    const { offer, emitted } = setup();
    const behavior: Intent = {
      brain: "copy",
      priority: 1,
      kind: "behavior",
      behavior: { id: "copy_me", params: {} },
      why: "x",
    };
    expect(offer(behavior)).toBe(false);
    expect(emitted).toEqual([
      {
        type: "intent.dropped",
        data: { brain: "copy", reason: "the executor plays routines only" },
      },
    ]);
  });

  it("does nothing when idle", () => {
    const { tick, emitted } = setup();
    tick(3);
    expect(emitted).toEqual([]);
  });
});
