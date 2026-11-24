import { describe, expect, it } from "vitest";

import { type CameraSample, replayCamera } from "../../../core/cameraSample";
import type { KernelEvent } from "../../../core/contracts";
import { LANDMARK_COUNT, type PoseFrame } from "../../../core/poseFixture";
import { safeReaction } from "../../../core/validator";
import { createKernel } from "../../../kernel/kernel";
import { runSense } from "../../../kernel/testing";
import { COOLDOWN_MS, cropBox, HOLD_MS } from "./hold";
import { heldHand, heldObjectSense } from "./index";

const LEFT_ELBOW = 13;
const LEFT_WRIST = 15;
const STEP_MS = 66;
const RAISED: Record<number, number> = { [LEFT_ELBOW]: 0.5, [LEFT_WRIST]: 0.3 };
const hand = [
  { x: 0.4, y: 0.2 },
  { x: 0.5, y: 0.2 },
  { x: 0.45, y: 0.32 },
];
const lowHand = [{ x: 0.1, y: 0.6 }];
/** What the server's fake model replies for any photo. */
const REPLY = {
  holding: true,
  object: "rubber duck",
  traits: { size: "small", weight: "light", shape: "round", edible: false },
  script: [
    { do: "look_at", target: "object", mood: "curious", say: "Who is that?" },
    { do: "dance", target: "none", mood: "happy", say: "A friend!" },
  ],
};

/** A pose with every landmark in the middle, then the given heights by landmark index. */
const poseAt = (t: number, heights: Record<number, number>): PoseFrame => ({
  t,
  landmarks: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
    x: 0.5,
    y: heights[i] ?? 0.5,
    z: 0,
    visibility: 1,
  })),
});

/** A kid holding `hand` up still, or with the arm down, sampled every 66 ms for `ms`. */
const holding = (ms: number, raised = true): CameraSample[] =>
  Array.from({ length: Math.ceil(ms / STEP_MS) }, (_, i) => {
    const t = i * STEP_MS;
    return { t, pose: poseAt(t, raised ? RAISED : {}), hands: [lowHand, hand] };
  });

const holds = (events: readonly KernelEvent[]) =>
  events.filter((e) => e.type === "observation.held");

describe("the held_object sense", () => {
  it("reports a raised hand held still, framing the same photo as before", () => {
    const events = holds(runSense(heldObjectSense(replayCamera(holding(3000))).folder, 3000));
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) throw new Error("no hold");
    expect(event.t).toBeGreaterThanOrEqual(HOLD_MS);
    const box = heldHand(event);
    if (!box) throw new Error("no hand in the hold");
    expect(cropBox(box, 1280, 720)).toEqual(cropBox(hand, 1280, 720));
  });

  it("reports nothing while the arm is down", () => {
    const sense = heldObjectSense(replayCamera(holding(3000, false)));
    expect(holds(runSense(sense.folder, 3000))).toEqual([]);
  });

  it("stays quiet until the reaction finishes, then for the cooldown", () => {
    const sense = heldObjectSense(replayCamera(holding(12_000)));
    const kernel = createKernel({ plugins: [sense.folder], now: () => 0 });
    const holdsBy = (ms: number) => {
      while (kernel.clock.t <= ms) kernel.tick();
      return holds(kernel.log.events()).map((event) => event.t);
    };
    expect(holdsBy(5000)).toHaveLength(1);
    sense.finished(5000);
    expect(holdsBy(5000 + COOLDOWN_MS)).toHaveLength(1);
    const [, again] = holdsBy(12_000);
    expect(again).toBeGreaterThanOrEqual(5000 + COOLDOWN_MS + HOLD_MS);
  });

  it("reads nothing but its own hold events", () => {
    expect(heldHand({ t: 0, type: "observation.kid", source: "pose", data: {} })).toBeUndefined();
    const odd = { t: 0, type: "observation.held", source: "held_object", data: { hand: 1 } };
    expect(heldHand(odd)).toBeUndefined();
  });

  it("logs the server's reply once as an observation.object carrying only the reaction", () => {
    const sense = heldObjectSense(replayCamera([]));
    const kernel = createKernel({ plugins: [sense.folder], now: () => 0 });
    const reaction = safeReaction(JSON.stringify(REPLY));
    kernel.tick();
    sense.reacted(reaction);
    kernel.tick();
    kernel.tick();
    const objects = kernel.log.events().filter((e) => e.type === "observation.object");
    expect(objects.map(({ source, data }) => ({ source, data }))).toEqual([
      { source: "held_object", data: { reaction } },
    ]);
    expect(JSON.stringify(objects)).not.toMatch(/image|base64|photo|crop/i);
  });
});
