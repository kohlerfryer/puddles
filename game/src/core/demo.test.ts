import { describe, expect, it } from "vitest";

import { createActing } from "./acting";
import { DEMO_SCRIPT, DEMO_TRAITS, demoDrop } from "./demo";
import { createPhysics } from "./physics";
import { STICKER_POND } from "./pond";
import type { Verb } from "./reaction";
import { createRunner } from "./runner";
import { BANK } from "./world";

const FRAME_MS = 1000 / 60;
const END_MS = 8000;
const SIX: Verb[] = ["walk_to", "sniff", "peck", "look_at", "jump", "run_away"];

/** Plays the demo headlessly the way the game does, one 60 Hz frame at a time. */
function playDemo(startX: number) {
  const physics = createPhysics(STICKER_POND);
  const drop = demoDrop(startX);
  const sticker = physics.addSticker(DEMO_TRAITS, drop.x, drop.y);
  const runner = createRunner();
  const acting = createActing();
  let duck: { x: number; facing: 1 | -1 } = { x: startX, facing: 1 };
  const played: Verb[] = [];
  const xs: number[] = [];
  let peckedAt: { duck: number; sticker: number } | undefined;
  runner.play(DEMO_SCRIPT, 0);
  for (let now = 0; now <= END_MS; now += FRAME_MS) {
    physics.step(FRAME_MS);
    const status = runner.update(now);
    if (status.state === "playing" && played.at(-1) !== status.step.do) played.push(status.step.do);
    const cue = acting.update(status, now, duck, { object: sticker.position.x });
    if (!cue) continue;
    if (cue.nudge) {
      peckedAt = { duck: duck.x, sticker: sticker.position.x };
      physics.nudge(sticker, cue.nudge);
    }
    duck = { x: cue.frame.x, facing: cue.frame.facing };
    xs.push(duck.x);
  }
  return { played, xs, peckedAt, sticker, finished: runner.update(END_MS).state };
}

describe("DEMO_SCRIPT", () => {
  it("uses each of the six planned verbs once", () => {
    expect(DEMO_SCRIPT.map((step) => step.do).sort()).toEqual([...SIX].sort());
  });
});

describe("demoDrop", () => {
  it.each([
    [200, 500],
    [1400, 1100],
    [800, 500],
  ])("drops the sticker from the sky towards the middle of the bank from %d", (x, dropX) => {
    const drop = demoDrop(x);
    expect(drop.x).toBe(dropX);
    expect(drop.y).toBeLessThan(STICKER_POND.bankTop);
  });
});

describe("playing the demo", () => {
  it.each([200, 800, 1400])("plays all six verbs in order and ends idle from %d", (x) => {
    const { played, xs, finished } = playDemo(x);
    expect(played).toEqual(DEMO_SCRIPT.map((step) => step.do));
    expect(finished).toBe("idle");
    for (const duckX of xs) {
      expect(duckX).toBeGreaterThanOrEqual(BANK.left);
      expect(duckX).toBeLessThanOrEqual(BANK.right);
    }
  });

  it.each([200, 1400])("pecks the sticker away from Puddles from %d", (x) => {
    const { peckedAt, sticker } = playDemo(x);
    if (!peckedAt) throw new Error("the peck never nudged the sticker");
    const away = Math.sign(peckedAt.sticker - peckedAt.duck);
    expect((sticker.position.x - peckedAt.sticker) * away).toBeGreaterThan(20);
  });
});
