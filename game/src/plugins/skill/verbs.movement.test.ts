import { describe, expect, it } from "vitest";

import { IDLE_MARGIN } from "../../core/idle";
import type { Step, Target, Verb } from "../../core/reaction";
import { planVerb } from "./planVerb";
import { BANK } from "../../core/world";

const step = (verb: Verb, target?: Target): Step =>
  target ? { do: verb, target, mood: "curious" } : { do: verb, mood: "curious" };

describe("run_to", () => {
  it("runs to just short of the object, then stands", () => {
    const plan = planVerb(step("run_to", "object"), { x: 400, facing: -1 }, { object: 1000 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 400, to: 930, seconds: 530 / 600, facing: 1, lift: 0 },
      { pose: "stand", from: 930, to: 930, seconds: 1 - 530 / 600, facing: 1, lift: 0 },
    ]);
  });

  it("runs the whole time towards a far target, never past its speed", () => {
    const plan = planVerb(step("run_to", "object"), { x: 100, facing: 1 }, { object: 1500 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 100, to: 700, seconds: 1, facing: 1, lift: 0 },
    ]);
  });

  it("stands still, turned to the target, when already within reach", () => {
    const plan = planVerb(step("run_to", "object"), { x: 400, facing: 1 }, { object: 350 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 400, to: 400, seconds: 1, facing: -1, lift: 0 },
    ]);
  });

  it("stands still for a target with no place", () => {
    const plan = planVerb(step("run_to", "camera"), { x: 400, facing: -1 }, { object: 1200 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 400, to: 400, seconds: 1, facing: -1, lift: 0 },
    ]);
  });
});

describe("hide_behind", () => {
  it("runs to the far side of the spot farthest from the object, then stands", () => {
    const plan = planVerb(step("hide_behind", "object"), { x: 900, facing: 1 }, { object: 1200 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 900, to: 130, seconds: 770 / 600, facing: -1, lift: 0 },
      { pose: "stand", from: 130, to: 130, seconds: 1.5 - 770 / 600, facing: -1, lift: 0 },
    ]);
  });

  it("hides behind the right-hand reed from an object on the left", () => {
    const plan = planVerb(step("hide_behind", "object"), { x: 1000, facing: -1 }, { object: 300 });
    expect(plan.moves[0]).toEqual({
      pose: "run",
      from: 1000,
      to: 1435,
      seconds: 435 / 600,
      facing: 1,
      lift: 0,
    });
  });

  it.each(["camera", "none"] as const)("hides from the object for %s", (target) => {
    const plan = planVerb(step("hide_behind", target), { x: 900, facing: 1 }, { object: 1200 });
    expect(plan.moves[0]).toMatchObject({ pose: "run", to: 130, facing: -1 });
  });

  it("stays put when already hidden", () => {
    const plan = planVerb(step("hide_behind", "object"), { x: 130, facing: 1 }, { object: 1200 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 130, to: 130, seconds: 1.5, facing: 1, lift: 0 },
    ]);
  });
});

describe("jump_over", () => {
  it("runs up to the object, hops over it, then stands where it lands", () => {
    const plan = planVerb(step("jump_over", "object"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 600, to: 830, seconds: 230 / 600, facing: 1, lift: 0 },
      { pose: "hop", from: 830, to: 970, seconds: 0.75, facing: 1, lift: 80 },
      { pose: "stand", from: 970, to: 970, seconds: 1.5 - 230 / 600 - 0.75, facing: 1, lift: 0 },
    ]);
  });

  it("hops wherever the run-up ends when the object is far", () => {
    const plan = planVerb(step("jump_over", "object"), { x: 100, facing: 1 }, { object: 1500 });
    expect(plan.moves).toEqual([
      { pose: "run", from: 100, to: 550, seconds: 0.75, facing: 1, lift: 0 },
      { pose: "hop", from: 550, to: 690, seconds: 0.75, facing: 1, lift: 80 },
    ]);
  });

  it("hops straight away when already within reach", () => {
    const plan = planVerb(step("jump_over", "object"), { x: 950, facing: 1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "hop", from: 950, to: 810, seconds: 0.75, facing: -1, lift: 80 },
      { pose: "stand", from: 810, to: 810, seconds: 0.75, facing: -1, lift: 0 },
    ]);
  });

  it("lands on the bank when the object is near an edge", () => {
    const plan = planVerb(step("jump_over", "object"), { x: 1400, facing: 1 }, { object: 1500 });
    expect(plan.moves[1]).toMatchObject({ pose: "hop", from: 1430, to: BANK.right - IDLE_MARGIN });
  });

  it("hops on the spot for a target with no place", () => {
    const plan = planVerb(step("jump_over", "camera"), { x: 600, facing: -1 }, { object: 900 });
    expect(plan.moves).toEqual([
      { pose: "hop", from: 600, to: 600, seconds: 1.5, facing: -1, lift: 80 },
    ]);
  });
});

describe("circle", () => {
  it("walks round to the far side of the object and back", () => {
    const plan = planVerb(step("circle", "object"), { x: 600, facing: -1 }, { object: 700 });
    expect(plan.moves).toEqual([
      { pose: "walk", from: 600, to: 770, seconds: 170 / 300, facing: 1, lift: 0 },
      { pose: "stand", from: 770, to: 770, seconds: 1 - 170 / 300, facing: 1, lift: 0 },
      { pose: "walk", from: 770, to: 600, seconds: 170 / 300, facing: -1, lift: 0 },
      { pose: "stand", from: 600, to: 600, seconds: 1 - 170 / 300, facing: -1, lift: 0 },
    ]);
  });

  it("walks out and back for a far object, never past its speed", () => {
    const plan = planVerb(step("circle", "object"), { x: 100, facing: 1 }, { object: 1500 });
    expect(plan.moves).toEqual([
      { pose: "walk", from: 100, to: 400, seconds: 1, facing: 1, lift: 0 },
      { pose: "walk", from: 400, to: 100, seconds: 1, facing: -1, lift: 0 },
    ]);
  });

  it("circles a spot just ahead when the target has no place", () => {
    const plan = planVerb(step("circle", "none"), { x: 600, facing: -1 }, { object: 1200 });
    expect(plan.moves.map((move) => [move.pose, move.to, move.facing])).toEqual([
      ["walk", 460, -1],
      ["stand", 460, -1],
      ["walk", 600, 1],
      ["stand", 600, 1],
    ]);
  });

  it("stays on the bank when circling near an edge", () => {
    const plan = planVerb(step("circle", "none"), { x: 1520, facing: 1 }, { object: 300 });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 1520, to: 1520, seconds: 1, facing: 1, lift: 0 },
      { pose: "stand", from: 1520, to: 1520, seconds: 1, facing: 1, lift: 0 },
    ]);
  });
});
