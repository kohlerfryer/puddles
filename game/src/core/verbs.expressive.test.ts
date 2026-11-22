import { describe, expect, it } from "vitest";

import type { Step, Target, Verb } from "./reaction";
import { planVerb } from "./planVerb";
import { frameAt } from "./verbs";

const step = (verb: Verb, target?: Target): Step =>
  target ? { do: verb, target, mood: "silly" } : { do: verb, mood: "silly" };

describe("dance", () => {
  it("bounces four beats on the spot, turning each beat, starting towards the target", () => {
    const plan = planVerb(step("dance", "object"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "hop", from: 600, to: 600, seconds: 0.5, facing: 1, lift: 30 },
      { pose: "hop", from: 600, to: 600, seconds: 0.5, facing: -1, lift: 30 },
      { pose: "hop", from: 600, to: 600, seconds: 0.5, facing: 1, lift: 30 },
      { pose: "hop", from: 600, to: 600, seconds: 0.5, facing: -1, lift: 30 },
    ]);
  });

  it("starts with its own facing when the target has no place", () => {
    const plan = planVerb(step("dance", "camera"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves.map((move) => move.facing)).toEqual([-1, 1, -1, 1]);
  });

  it("is back on the ground between beats", () => {
    const plan = planVerb(step("dance"), { x: 600, facing: 1 }, { object: 900 });
    expect(frameAt(plan, 0.25).height).toBeCloseTo(30);
    expect(frameAt(plan, 0.5).height).toBeCloseTo(0);
  });
});

describe("flap", () => {
  it("flaps on the spot turned towards the target, fluttering 20 up", () => {
    const plan = planVerb(step("flap", "object"), { x: 600, facing: 1 }, { object: 300 });
    expect(plan.moves).toEqual([
      { pose: "flap", from: 600, to: 600, seconds: 1, facing: -1, lift: 20 },
    ]);
  });
});

describe("freeze", () => {
  it("holds still without turning, even towards a target", () => {
    const plan = planVerb(step("freeze", "object"), { x: 600, facing: 1 }, { object: 300 });
    expect(plan.moves).toEqual([
      { pose: "freeze", from: 600, to: 600, seconds: 1, facing: 1, lift: 0 },
    ]);
  });
});

describe("fall_over", () => {
  it("lies fallen where it stands for a second, then gets back up", () => {
    const plan = planVerb(step("fall_over", "object"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "fallen", from: 600, to: 600, seconds: 1, facing: -1, lift: 0 },
      { pose: "stand", from: 600, to: 600, seconds: 0.5, facing: -1, lift: 0 },
    ]);
  });
});
