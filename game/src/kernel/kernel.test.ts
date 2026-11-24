import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../core/contracts";
import { createGuardian, type GuardianSettings } from "./guardian/guardian";
import { createKernel } from "./kernel";
import type { Behavior, PluginFolder } from "./plugins";
import { fakeBrain, fakeSense, fakeSkill, routine } from "./testing";

/** A held object every 10 ticks; a matcher that answers it with a random skill; a bored bandit. */
function session(): PluginFolder[] {
  let ticks = 0;
  return [
    fakeSense("hands", () =>
      ++ticks % 10 === 0 ? [{ type: "observation.fake", data: { n: ticks } }] : [],
    ),
    fakeBrain("matcher", { on: "observation.fake" }, ({ random }) =>
      routine("matcher", 2, random() < 0.5 ? "peck" : "walk", "peck"),
    ),
    fakeBrain("bandit", { every_s: 1 }, () => routine("bandit", 1, "walk", "walk", "walk")),
    fakeSkill("walk", 4),
    fakeSkill("peck", 2),
  ];
}

const run = (seed: number): KernelEvent[] => {
  const kernel = createKernel({ plugins: session(), seed, now: () => 0 });
  for (let i = 0; i < 300; i++) kernel.tick();
  return kernel.log.events();
};

describe("createKernel", () => {
  it("runs a session headless and gives the same log for the same seed", () => {
    expect(run(7)).toEqual(run(7));
  });

  it("gives a different log for a different seed", () => {
    expect(run(7)).not.toEqual(run(8));
  });

  it("goes sense, brain, executor within a tick", () => {
    const kernel = createKernel({ plugins: session(), now: () => 0 });
    for (let i = 0; i < 10; i++) kernel.tick();
    const tenth = kernel.log.events().filter((e) => e.t === 333);
    expect(tenth.map((e) => `${e.source} ${e.type}`)).toEqual([
      "hands observation.fake",
      "matcher intent.proposed",
      "executor outcome.interrupted",
      "executor intent.preempted",
      "executor intent.started",
    ]);
  });

  it("stamps every event with the kernel clock", () => {
    const kernel = createKernel({ plugins: session(), now: () => 0 });
    for (let i = 0; i < 60; i++) kernel.tick();
    const times = kernel.log.events().map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.at(-1)).toBe(kernel.clock.t);
  });

  it("does nothing while paused", () => {
    const kernel = createKernel({ plugins: session(), now: () => 0 });
    kernel.clock.pause();
    for (let i = 0; i < 30; i++) kernel.tick();
    expect(kernel.log.count).toBe(0);
    expect(kernel.clock.t).toBe(0);
  });

  it("logs plugins that run over their time budget", () => {
    let clock = 0;
    const slow = fakeBrain("slow", "tick", () => {
      clock += 6;
      return null;
    });
    const kernel = createKernel({ plugins: [slow], now: () => clock });
    kernel.tick();
    expect(kernel.log.events()).toEqual([
      {
        t: 33,
        type: "guardian.over_budget",
        source: "kernel",
        data: { plugin: "slow", ms: 6, budget_ms: 5 },
      },
    ]);
  });

  it("lists plugins it refused", () => {
    const kernel = createKernel({ plugins: [{ manifest: {} }] });
    expect(kernel.registry.rejected).toHaveLength(1);
  });

  it("plays behaviors it was given", () => {
    const wander: Behavior = () => (last) => last ?? { skill: "walk", args: {} };
    const brain = fakeBrain("bandit", "tick", () => ({
      brain: "bandit",
      priority: 1,
      kind: "behavior",
      behavior: { id: "wander", params: {} },
      why: "test",
    }));
    const kernel = createKernel({
      plugins: [brain, fakeSkill("walk", 2)],
      behaviors: new Map([["wander", wander]]),
      now: () => 0,
    });
    for (let i = 0; i < 3; i++) kernel.tick();
    expect(executorEvents(kernel.log.events())).toEqual([
      "intent.started",
      "intent.dropped",
      "outcome.done",
      "intent.done",
      "intent.started",
    ]);
  });
});

const GUARDED: GuardianSettings = {
  skillSeconds: new Map([
    ["look_at", 1],
    ["nap", 3],
    ["walk", 1],
  ]),
  maxScaredSteps: 1,
  intentsPerSecond: 1,
  modelCallsPerMinute: 1,
  sessionSoftLimitMs: 60 * 60_000,
};

/** A kernel whose one brain says `say` every tick, checked by a guardian. */
function guarded(say: string) {
  const brain = fakeBrain("bandit", "tick", () => ({
    ...routine("bandit", 2, "walk"),
    steps: [{ skill: "walk", args: {}, say }],
  }));
  return createKernel({
    plugins: [brain, fakeSkill("walk", 30), fakeSkill("look_at", 30), fakeSkill("nap", 90)],
    guardian: createGuardian(GUARDED),
    now: () => 0,
  });
}

const executorEvents = (events: readonly KernelEvent[]) =>
  events.filter((e) => e.source === "executor").map((e) => e.type);

const started = (events: readonly KernelEvent[]) =>
  events.filter((e) => e.type === "intent.started").map((e) => e.data.brain);

describe("createKernel with a guardian", () => {
  it("plays an intent the guardian passed and logs the verdict", () => {
    const kernel = guarded("Wheee!");
    kernel.tick();
    expect(kernel.log.events().map((e) => `${e.source} ${e.type}`)).toEqual([
      "bandit intent.proposed",
      "guardian guardian.passed",
      "executor intent.started",
    ]);
    expect(started(kernel.log.events())).toEqual(["bandit"]);
  });

  it("plays the guardian's fallback instead of a rejected intent, and logs why", () => {
    const kernel = guarded("you are dumb");
    kernel.tick();
    const [, verdict] = kernel.log.events();
    expect(verdict).toMatchObject({ type: "guardian.rejected", data: { rule: "blocklist" } });
    expect(started(kernel.log.events())).toEqual(["guardian"]);
  });

  it("never offers an intent the guardian dropped", () => {
    const kernel = guarded("Wheee!");
    for (let i = 0; i < 10; i++) kernel.tick();
    const events = kernel.log.events();
    const verdicts = events.filter((e) => e.source === "guardian").map((e) => e.data.rule);
    expect(verdicts).toEqual([undefined, ...Array<string>(9).fill("rate")]);
    expect(executorEvents(events)).toEqual(["intent.started"]);
  });
});
