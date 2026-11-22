import { describe, expect, it } from "vitest";

import { IDLE_MARGIN } from "./idle";
import { POND } from "./pond";
import type { Step, Target, Verb } from "./reaction";
import { VERB_SECONDS } from "./validator";
import { type Plan, frameAt, planVerb } from "./verbs";
import { BANK } from "./world";

const step = (verb: Verb, target?: Target): Step =>
  target ? { do: verb, target, mood: "curious" } : { do: verb, mood: "curious" };

const total = (plan: Plan): number => plan.moves.reduce((sum, move) => sum + move.seconds, 0);

describe("planVerb", () => {
  const verbs = Object.keys(VERB_SECONDS) as Verb[];

  it.each(verbs)("plans %s to last exactly its verb time", (verb) => {
    for (const target of ["object", "camera", "reeds", "none"] as const) {
      const plan = planVerb(step(verb, target), { x: 400, facing: 1 }, { object: 1200 });
      expect(total(plan)).toBeCloseTo(VERB_SECONDS[verb]);
    }
  });

  it("stands still for verbs it has no plan for yet", () => {
    const plan = planVerb(step("eat"), { x: 400, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 400, to: 400, seconds: VERB_SECONDS.eat, facing: -1, lift: 0 },
    ]);
    expect(plan.nudge).toBeUndefined();
  });
});

describe("walk_to", () => {
  it("walks to just short of the object, then stands", () => {
    const plan = planVerb(step("walk_to", "object"), { x: 400, facing: -1 }, { object: 700 });
    expect(plan.moves).toEqual([
      { pose: "walk", from: 400, to: 630, seconds: 230 / 300, facing: 1, lift: 0 },
      { pose: "stand", from: 630, to: 630, seconds: 1.5 - 230 / 300, facing: 1, lift: 0 },
    ]);
  });

  it("walks leftwards to a target on the left", () => {
    const plan = planVerb(step("walk_to", "object"), { x: 700, facing: 1 }, { object: 400 });
    expect(plan.moves[0]).toMatchObject({ pose: "walk", from: 700, to: 470, facing: -1 });
  });

  it("walks the whole time towards a far target, never past its speed", () => {
    const plan = planVerb(step("walk_to", "object"), { x: 100, facing: 1 }, { object: 1500 });
    expect(plan.moves).toEqual([
      { pose: "walk", from: 100, to: 550, seconds: 1.5, facing: 1, lift: 0 },
    ]);
  });

  it("walks to the nearest reed", () => {
    expect(POND.reeds.map((reed) => reed.x)).toEqual([180, 1380]);
    const plan = planVerb(step("walk_to", "reeds"), { x: 1200, facing: -1 }, { object: 400 });
    expect(plan.moves[0]).toMatchObject({ pose: "walk", to: 1310, facing: 1 });
  });

  it("stands still when already within reach", () => {
    const plan = planVerb(step("walk_to", "object"), { x: 400, facing: -1 }, { object: 450 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 400, to: 400, seconds: 1.5, facing: 1, lift: 0 },
    ]);
  });

  it.each(["camera", "none"] as const)("stands still for a target with no place (%s)", (target) => {
    const plan = planVerb(step("walk_to", target), { x: 400, facing: -1 }, { object: 1200 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 400, to: 400, seconds: 1.5, facing: -1, lift: 0 },
    ]);
  });
});

describe("run_away", () => {
  it("runs away from the object at run speed, then stands", () => {
    const plan = planVerb(step("run_away", "object"), { x: 800, facing: 1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 800, to: 80, seconds: 720 / 600, facing: -1, lift: 0 },
      { pose: "stand", from: 80, to: 80, seconds: 1.5 - 720 / 600, facing: -1, lift: 0 },
    ]);
  });

  it("runs the whole time when the bank edge is far", () => {
    const plan = planVerb(step("run_away", "object"), { x: 300, facing: 1 }, { object: 200 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 300, to: 1200, seconds: 1.5, facing: 1, lift: 0 },
    ]);
  });

  it("runs away from the nearest reed", () => {
    const plan = planVerb(step("run_away", "reeds"), { x: 1280, facing: 1 }, { object: 0 });
    expect(plan.moves[0]).toMatchObject({ pose: "run", facing: -1 });
  });

  it.each(["camera", "none"] as const)("falls back to the object for %s", (target) => {
    const plan = planVerb(step("run_away", target), { x: 1000, facing: -1 }, { object: 900 });
    expect(plan.moves[0]).toMatchObject({ pose: "run", to: BANK.right - IDLE_MARGIN, facing: 1 });
  });

  it("stands its ground when already at the bank edge", () => {
    const plan = planVerb(step("run_away", "object"), { x: 40, facing: 1 }, { object: 300 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 40, to: 40, seconds: 1.5, facing: -1, lift: 0 },
    ]);
  });
});

describe("on-the-spot verbs", () => {
  it.each([
    ["sniff", "sniff"],
    ["peck", "peck"],
    ["look_at", "look"],
  ] as const)("%s turns towards the target with pose %s", (verb, pose) => {
    const plan = planVerb(step(verb, "object"), { x: 600, facing: 1 }, { object: 300 });
    expect(plan.moves).toEqual([{ pose, from: 600, to: 600, seconds: 1, facing: -1, lift: 0 }]);
  });

  it("looks at the camera with its own pose, keeping its facing", () => {
    const plan = planVerb(step("look_at", "camera"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "look_camera", from: 600, to: 600, seconds: 1, facing: -1, lift: 0 },
    ]);
  });

  it("jumps on the spot, lifting 80", () => {
    const plan = planVerb(step("jump", "object"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "hop", from: 600, to: 600, seconds: 1, facing: 1, lift: 80 },
    ]);
  });

  it("keeps facing when the target is right underfoot", () => {
    const plan = planVerb(step("sniff", "object"), { x: 600, facing: -1 }, { object: 600 });
    expect(plan.moves[0].facing).toBe(-1);
  });
});

describe("peck nudge", () => {
  it("nudges a nearby object halfway through, in the facing direction", () => {
    const plan = planVerb(step("peck", "object"), { x: 600, facing: 1 }, { object: 500 });
    expect(plan.nudge).toEqual({ at: 0.5, x: -4, y: -6 });
  });

  it("nudges an object exactly 120 away", () => {
    const plan = planVerb(step("peck", "object"), { x: 600, facing: -1 }, { object: 720 });
    expect(plan.nudge).toEqual({ at: 0.5, x: 4, y: -6 });
  });

  it("does not nudge an object out of reach", () => {
    const plan = planVerb(step("peck", "object"), { x: 600, facing: 1 }, { object: 721 });
    expect(plan.nudge).toBeUndefined();
  });

  it("does not nudge when pecking something other than the object", () => {
    const plan = planVerb(step("peck", "reeds"), { x: 600, facing: 1 }, { object: 600 });
    expect(plan.nudge).toBeUndefined();
  });
});

describe("frameAt", () => {
  const walk = planVerb(step("walk_to", "object"), { x: 400, facing: -1 }, { object: 700 });

  it("starts at the plan's first position", () => {
    expect(frameAt(walk, 0)).toEqual({ pose: "walk", x: 400, facing: 1, height: 0 });
  });

  it("moves along a move in proportion to time", () => {
    expect(frameAt(walk, 115 / 300).x).toBeCloseTo(515);
  });

  it("switches to the next move once one ends", () => {
    expect(frameAt(walk, 1)).toEqual({ pose: "stand", x: 630, facing: 1, height: 0 });
  });

  it("holds the last frame after the plan ends, and the first before it starts", () => {
    expect(frameAt(walk, 5)).toEqual({ pose: "stand", x: 630, facing: 1, height: 0 });
    expect(frameAt(walk, -1)).toEqual({ pose: "walk", x: 400, facing: 1, height: 0 });
  });

  it("ends a one-move plan where the move ends", () => {
    const far = planVerb(step("walk_to", "object"), { x: 100, facing: 1 }, { object: 1500 });
    expect(frameAt(far, 1.5)).toEqual({ pose: "walk", x: 550, facing: 1, height: 0 });
  });

  it("follows a sine arc on a hop", () => {
    const hop = planVerb(step("jump"), { x: 600, facing: 1 }, { object: 900 });
    expect(frameAt(hop, 0).height).toBeCloseTo(0);
    expect(frameAt(hop, 0.25).height).toBeCloseTo(80 * Math.sin(Math.PI / 4));
    expect(frameAt(hop, 0.5).height).toBeCloseTo(80);
    expect(frameAt(hop, 1).height).toBeCloseTo(0);
  });
});
