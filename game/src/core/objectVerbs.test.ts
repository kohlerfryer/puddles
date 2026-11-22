import { describe, expect, it } from "vitest";

import { heldScale } from "./objectVerbs";
import { createPhysics } from "./physics";
import { planVerb } from "./planVerb";
import { STICKER_POND } from "./pond";
import type { Step, Target, Traits, Verb } from "./reaction";
import { frameAt } from "./verbs";

const step = (verb: Verb, target?: Target): Step =>
  target ? { do: verb, target, mood: "happy" } : { do: verb, mood: "happy" };

describe("eat", () => {
  it("pecks at a nearby object the whole time and takes it into the beak", () => {
    const plan = planVerb(step("eat", "object"), { x: 600, facing: 1 }, { object: 500 });
    expect(plan.moves).toEqual([
      { pose: "peck", from: 600, to: 600, seconds: 1.5, facing: -1, lift: 0 },
    ]);
    expect(plan.take).toEqual({ at: 0.5, to: "beak" });
  });

  it.each([
    ["an object out of reach", "object", 721],
    ["something other than the object", "reeds", 600],
  ] as const)("takes nothing when eating %s", (_name, target, object) => {
    const plan = planVerb(step("eat", target), { x: 600, facing: 1 }, { object });
    expect(plan.moves[0].pose).toBe("peck");
    expect(plan.take).toBeUndefined();
  });

  it("shrinks an eaten sticker to nothing", () => {
    expect(heldScale("beak", 0)).toBe(1);
    expect(heldScale("beak", 0.375)).toBeCloseTo(0.5);
    expect(heldScale("beak", 0.75)).toBe(0);
    expect(heldScale("beak", 5)).toBe(0);
  });
});

describe("wear", () => {
  it("picks up a nearby object with the beak, puts it on its head and stands", () => {
    const plan = planVerb(step("wear", "object"), { x: 600, facing: -1 }, { object: 700 });
    expect(plan.moves).toEqual([
      { pose: "peck", from: 600, to: 600, seconds: 0.5, facing: 1, lift: 0 },
      { pose: "stand", from: 600, to: 600, seconds: 1, facing: 1, lift: 0 },
    ]);
    expect(plan.take).toEqual({ at: 0.5, to: "head" });
  });

  it("takes nothing when the object is out of reach", () => {
    const plan = planVerb(step("wear", "object"), { x: 600, facing: -1 }, { object: 721 });
    expect(plan.take).toBeUndefined();
  });

  it("keeps a worn sticker full size", () => {
    expect(heldScale("head", 0)).toBe(1);
    expect(heldScale("head", 5)).toBe(1);
  });
});

describe("push", () => {
  it("walks up to the object and shoves it on arrival, then stands", () => {
    const plan = planVerb(step("push", "object"), { x: 400, facing: -1 }, { object: 700 });
    expect(plan.moves).toEqual([
      { pose: "walk", from: 400, to: 630, seconds: 230 / 300, facing: 1, lift: 0 },
      { pose: "stand", from: 630, to: 630, seconds: 1.5 - 230 / 300, facing: 1, lift: 0 },
    ]);
    expect(plan.nudge).toEqual({ at: 230 / 300, x: 16, y: -2 });
  });

  it("shoves straight away, leftwards, when the object is already within reach", () => {
    const plan = planVerb(step("push", "object"), { x: 700, facing: 1 }, { object: 650 });
    expect(plan.nudge).toEqual({ at: 0, x: -16, y: -2 });
  });

  it("does not shove an object it never reaches", () => {
    const plan = planVerb(step("push", "object"), { x: 100, facing: 1 }, { object: 1500 });
    expect(plan.nudge).toBeUndefined();
  });

  it("does not shove when pushing something other than the object", () => {
    const plan = planVerb(step("push", "reeds"), { x: 1300, facing: 1 }, { object: 1300 });
    expect(plan.nudge).toBeUndefined();
  });

  const ball: Traits = { size: "small", weight: "medium", shape: "round", edible: false };
  const book: Traits = { size: "medium", weight: "medium", shape: "flat", edible: false };

  /** Pushes a settled sticker of `traits` and returns how far it moved and turned in a second. */
  function shove(traits: Traits): { moved: number; turned: number } {
    const physics = createPhysics(STICKER_POND);
    const sticker = physics.addSticker(traits, 800, STICKER_POND.bankTop - 100);
    for (let i = 0; i < 120; i++) physics.step(1000 / 60);
    const { x } = sticker.position;
    const { angle } = sticker;
    const { nudge } = planVerb(step("push", "object"), { x: 700, facing: 1 }, { object: x });
    if (!nudge) throw new Error("push planned no shove");
    physics.nudge(sticker, nudge);
    for (let i = 0; i < 60; i++) physics.step(1000 / 60);
    return { moved: sticker.position.x - x, turned: Math.abs(sticker.angle - angle) };
  }

  it("rolls a round sticker away", () => {
    const { moved, turned } = shove(ball);
    expect(moved).toBeGreaterThan(50);
    expect(turned).toBeGreaterThan(1);
  });

  it("slides a flat sticker without rolling it", () => {
    const { moved, turned } = shove(book);
    expect(moved).toBeGreaterThan(0);
    expect(turned).toBeLessThan(0.2);
  });
});

describe("sit_on", () => {
  const scene = { object: 700, objectHeight: 40 };

  it("hops up onto a nearby object, sits on it, then hops off the far side", () => {
    const plan = planVerb(step("sit_on", "object"), { x: 630, facing: -1 }, scene);
    expect(plan.moves).toEqual([
      { pose: "hop", from: 630, to: 700, seconds: 0.4, facing: 1, lift: 40, perch: [0, 40] },
      { pose: "stand", from: 700, to: 700, seconds: 0.7, facing: 1, lift: 0, perch: [40, 40] },
      { pose: "hop", from: 700, to: 770, seconds: 0.4, facing: 1, lift: 40, perch: [40, 0] },
    ]);
  });

  it("is on top of the object while sitting", () => {
    const plan = planVerb(step("sit_on", "object"), { x: 630, facing: 1 }, scene);
    expect(frameAt(plan, 0.8)).toMatchObject({ x: 700, height: 40 });
  });

  it("climbs and drops as it hops on and off", () => {
    const plan = planVerb(step("sit_on", "object"), { x: 630, facing: 1 }, scene);
    expect(frameAt(plan, 0).height).toBeCloseTo(0);
    expect(frameAt(plan, 0.2).height).toBeCloseTo(20 + 40);
    expect(frameAt(plan, 1.5).height).toBeCloseTo(0);
  });

  it("sits at ground level on an object of unknown height", () => {
    const plan = planVerb(step("sit_on", "object"), { x: 630, facing: 1 }, { object: 700 });
    expect(frameAt(plan, 0.8)).toMatchObject({ x: 700, height: 0 });
  });

  it("stays on the bank when hopping off near its edge", () => {
    const plan = planVerb(step("sit_on", "object"), { x: 1500, facing: 1 }, { object: 1560 });
    expect(plan.moves[2]?.to).toBe(1520);
  });

  it.each([
    ["an object out of reach", "object", 721],
    ["something other than the object", "camera", 600],
  ] as const)("stands still when sitting on %s", (_name, target, object) => {
    const plan = planVerb(step("sit_on", target), { x: 600, facing: 1 }, { object });
    expect(plan.moves).toEqual([
      { pose: "stand", from: 600, to: 600, seconds: 1.5, facing: 1, lift: 0 },
    ]);
  });
});
