import { describe, expect, it } from "vitest";

import type { Event } from "../core/contracts";
import { createKernel } from "./kernel";
import type { PluginFolder } from "./plugins";
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

const run = (seed: number): Event[] => {
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
});
