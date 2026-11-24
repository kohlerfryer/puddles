import { describe, expect, it } from "vitest";

import type { Intent } from "../../core/contracts";
import { contractValidators } from "../../core/contractsSchema";
import { BREAK_REPEAT_MS, createGuardian, type GuardianSettings } from "./guardian";

const SETTINGS: GuardianSettings = {
  skillSeconds: new Map([
    ["look_at", 1],
    ["nap", 5],
    ["dance", 2],
  ]),
  maxScaredSteps: 1,
  intentsPerSecond: 2,
  modelCallsPerMinute: 3,
  sessionSoftLimitMs: 60_000,
};

const intent = (brain = "bandit", say = "Wheee!"): Intent => ({
  brain,
  priority: 3,
  kind: "routine",
  steps: [{ skill: "dance", args: {}, say }],
  why: "kid smiled at dancing",
});

describe("check", () => {
  it("passes a safe intent unchanged and logs it", () => {
    const verdict = createGuardian(SETTINGS).check(intent(), 100);
    expect(verdict.intent).toEqual(intent());
    expect(verdict.event).toEqual({
      t: 100,
      type: "guardian.passed",
      source: "guardian",
      data: { brain: "bandit" },
    });
  });

  it("replaces an unsafe intent with a fallback at its priority and logs the reason", () => {
    const verdict = createGuardian(SETTINGS).check(intent("bandit", "you are dumb"), 5);
    expect(verdict.intent).toMatchObject({ brain: "guardian", priority: 3, kind: "routine" });
    expect(verdict.intent?.why).toContain("dumb");
    expect(verdict.event).toMatchObject({
      t: 5,
      type: "guardian.rejected",
      data: { brain: "bandit", rule: "blocklist", reason: 'blocked "dumb"' },
    });
  });

  it.each<[string, unknown, string]>([
    ["junk", "fly to the moon", "unknown"],
    ["a missing why", { brain: "planner", priority: 1, kind: "routine" }, "planner"],
    [
      "nine steps",
      { ...intent(), steps: Array.from({ length: 9 }, () => ({ skill: "look_at", args: {} })) },
      "bandit",
    ],
  ])("replaces %s that breaks the intent schema", (_name, input, brain) => {
    const verdict = createGuardian(SETTINGS).check(input, 0);
    expect(verdict.intent).toMatchObject({ brain: "guardian", priority: 0 });
    expect(verdict.event.data).toMatchObject({ brain, rule: "schema" });
  });

  it("drops a brain's intents over its per-second budget without a fallback", () => {
    const guardian = createGuardian(SETTINGS);
    guardian.check(intent(), 0);
    guardian.check(intent(), 500);
    const over = guardian.check(intent(), 999);
    expect(over.intent).toBeNull();
    expect(over.event).toMatchObject({ type: "guardian.rejected", data: { rule: "rate" } });
    expect(guardian.check(intent("reflexes"), 999).intent).not.toBeNull();
    expect(guardian.check(intent(), 1000).intent).not.toBeNull();
  });

  it("suggests a break at the session soft limit, then again every few minutes", () => {
    const guardian = createGuardian(SETTINGS);
    const limit = SETTINGS.sessionSoftLimitMs;
    expect(guardian.check(intent(), limit - 1).event.type).toBe("guardian.passed");
    const tired = guardian.check(intent(), limit);
    expect(tired.event).toMatchObject({ type: "guardian.break", data: { brain: "bandit" } });
    expect(tired.intent?.steps?.map((step) => step.skill)).toEqual(["look_at", "nap"]);
    expect(guardian.check(intent(), limit + 2000).event.type).toBe("guardian.passed");
    expect(guardian.check(intent(), limit + BREAK_REPEAT_MS).event.type).toBe("guardian.break");
  });

  it("passes its own fallback and break intents", () => {
    const fallback = createGuardian(SETTINGS).check("junk", 0).intent;
    const rest = createGuardian(SETTINGS).check(intent(), SETTINGS.sessionSoftLimitMs).intent;
    for (const own of [fallback, rest]) {
      expect(createGuardian(SETTINGS).check(own, 0).event.type).toBe("guardian.passed");
    }
  });
});

describe("modelCall", () => {
  it("allows a brain's model calls up to the per-minute budget", () => {
    const guardian = createGuardian(SETTINGS);
    const calls = [0, 1, 2, 3].map((t) => guardian.modelCall("planner", t));
    expect(calls.map((call) => call.allowed)).toEqual([true, true, true, false]);
    expect(calls[3]?.event).toMatchObject({
      t: 3,
      type: "guardian.rejected",
      source: "guardian",
      data: { brain: "planner", rule: "rate" },
    });
    expect(guardian.modelCall("matcher", 3).allowed).toBe(true);
    expect(guardian.modelCall("planner", 60_000).allowed).toBe(true);
  });

  it("logs allowed calls as passed", () => {
    const call = createGuardian(SETTINGS).modelCall("planner", 7);
    expect(call.event).toEqual({
      t: 7,
      type: "guardian.passed",
      source: "guardian",
      data: { brain: "planner", model_call: true },
    });
    expect(contractValidators.event(call.event)).toBe(true);
  });
});
