import { describe, expect, it } from "vitest";

import {
  armRaised,
  COOLDOWN_MS,
  createHoldWatch,
  cropBox,
  HOLD_MS,
  type HandSample,
  highestHand,
} from "./hold";
import type { Point } from "../../../core/cameraSample";
import { LANDMARK_COUNT, type PoseFrame } from "../../../core/poseFixture";

const STEP_MS = 66;

/** A hand 0.1 wide and tall with its top-left corner at (x, y). */
const hand = (x: number, y: number): Point[] => [
  { x, y },
  { x: x + 0.1, y },
  { x, y: y + 0.1 },
  { x: x + 0.1, y: y + 0.1 },
];

/** `count` samples one frame apart from `start`, with the hand at `place(i)`. */
function track(
  start: number,
  count: number,
  place: (i: number) => Point[] | undefined,
  raised = true,
): HandSample[] {
  return Array.from({ length: count }, (_, i) => ({
    t: start + i * STEP_MS,
    raised,
    hand: place(i),
  }));
}

/** Times at which the watch fires while `samples` stream in. */
function fires(samples: readonly HandSample[], watch = createHoldWatch()): number[] {
  return samples.flatMap((s) => (watch.push(s) ? [s.t] : []));
}

const framesFor = (ms: number): number => Math.ceil(ms / STEP_MS) + 1;

describe("hold watch", () => {
  it("fires once a raised hand has been still for the hold time", () => {
    const times = fires(track(0, framesFor(HOLD_MS), () => hand(0.4, 0.3)));
    expect(times).toHaveLength(1);
    expect(times[0]).toBeGreaterThanOrEqual(HOLD_MS);
  });

  it("does not fire before the hold time", () => {
    expect(fires(track(0, framesFor(HOLD_MS) - 1, () => hand(0.4, 0.3)))).toEqual([]);
  });

  it("does not fire for a hand that keeps moving", () => {
    expect(fires(track(0, 60, (i) => hand(0.1 + (i % 2) * 0.08, 0.3)))).toEqual([]);
  });

  it("allows a little jitter", () => {
    expect(
      fires(track(0, framesFor(HOLD_MS), (i) => hand(0.4 + (i % 2) * 0.01, 0.3))),
    ).toHaveLength(1);
  });

  it("does not fire while the arm is lowered", () => {
    expect(fires(track(0, 60, () => hand(0.4, 0.3), false))).toEqual([]);
  });

  it("does not fire with no hand in view", () => {
    expect(fires(track(0, 60, () => undefined))).toEqual([]);
  });

  it("starts the hold over when the hand drops out of view", () => {
    const half = framesFor(HOLD_MS / 2);
    const samples = [
      ...track(0, half, () => hand(0.4, 0.3)),
      ...track(half * STEP_MS, 1, () => undefined),
      ...track((half + 1) * STEP_MS, half, () => hand(0.4, 0.3)),
    ];
    expect(fires(samples)).toEqual([]);
  });

  it("starts the hold over when the hand moves, then fires once it settles", () => {
    const samples = [
      ...track(0, 10, () => hand(0.1, 0.3)),
      ...track(10 * STEP_MS, framesFor(HOLD_MS), () => hand(0.6, 0.3)),
    ];
    const times = fires(samples);
    expect(times).toHaveLength(1);
    expect(times[0]).toBeGreaterThanOrEqual(10 * STEP_MS + HOLD_MS);
  });

  it("stays quiet until the reaction finishes, then for the cooldown", () => {
    const watch = createHoldWatch();
    const still = (start: number, count: number): HandSample[] =>
      track(start, count, () => hand(0.4, 0.3));
    expect(fires(still(0, framesFor(HOLD_MS)), watch)).toHaveLength(1);
    expect(fires(still(2000, 100), watch)).toEqual([]);

    const finishedAt = 9000;
    watch.finished(finishedAt);
    expect(fires(still(finishedAt, framesFor(COOLDOWN_MS) - 2), watch)).toEqual([]);
    const after = fires(still(finishedAt + COOLDOWN_MS, framesFor(HOLD_MS)), watch);
    expect(after).toHaveLength(1);
    expect(after[0]).toBeGreaterThanOrEqual(finishedAt + COOLDOWN_MS + HOLD_MS);
  });
});

/** A pose with every landmark in the middle, then the given overrides by index. */
function pose(overrides: Record<number, number>): PoseFrame {
  return {
    t: 0,
    landmarks: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
      x: 0.5,
      y: overrides[i] ?? 0.5,
      z: 0,
      visibility: 1,
    })),
  };
}

describe("armRaised", () => {
  const LEFT_ELBOW = 13;
  const RIGHT_ELBOW = 14;
  const LEFT_WRIST = 15;
  const RIGHT_WRIST = 16;

  it("is true when either wrist is above its elbow", () => {
    expect(armRaised(pose({ [LEFT_ELBOW]: 0.5, [LEFT_WRIST]: 0.3, [RIGHT_WRIST]: 0.7 }))).toBe(
      true,
    );
    expect(armRaised(pose({ [RIGHT_ELBOW]: 0.5, [RIGHT_WRIST]: 0.3, [LEFT_WRIST]: 0.7 }))).toBe(
      true,
    );
  });

  it("is false when both wrists hang below their elbows", () => {
    expect(armRaised(pose({ [LEFT_WRIST]: 0.7, [RIGHT_WRIST]: 0.7 }))).toBe(false);
  });

  it("is false when the arms are out of the frame", () => {
    expect(armRaised({ t: 0, landmarks: [] })).toBe(false);
  });
});

describe("highestHand", () => {
  it("picks the hand nearest the top of the frame", () => {
    const low = hand(0.2, 0.6);
    const high = hand(0.7, 0.2);
    expect(highestHand([low, high])).toBe(high);
    expect(highestHand([high, low])).toBe(high);
  });

  it("is undefined with no hands", () => {
    expect(highestHand<Point[]>([])).toBeUndefined();
  });
});

describe("cropBox", () => {
  const WIDTH = 1280;
  const HEIGHT = 720;

  it("is a square centred on the hand, sized to it", () => {
    const small = cropBox(hand(0.45, 0.45), WIDTH, HEIGHT);
    const big = cropBox(
      [
        { x: 0.4, y: 0.3 },
        { x: 0.6, y: 0.5 },
      ],
      WIDTH,
      HEIGHT,
    );
    expect(small.size).toBeGreaterThan(0.1 * WIDTH);
    expect(big.size).toBeGreaterThan(small.size);
    expect(small.x + small.size / 2).toBeCloseTo(0.5 * WIDTH);
    expect(small.y + small.size / 2).toBeCloseTo(0.5 * HEIGHT);
  });

  it("sizes to the longer side of the hand", () => {
    const tall = cropBox(
      [
        { x: 0.5, y: 0.3 },
        { x: 0.52, y: 0.5 },
      ],
      WIDTH,
      HEIGHT,
    );
    const wide = cropBox(
      [
        { x: 0.4, y: 0.4 },
        { x: 0.4 + (0.2 * HEIGHT) / WIDTH, y: 0.42 },
      ],
      WIDTH,
      HEIGHT,
    );
    expect(tall.size).toBeCloseTo(wide.size);
  });

  it("is pushed back inside the frame near an edge", () => {
    const box = cropBox(hand(0, 0), WIDTH, HEIGHT);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    const corner = cropBox(hand(0.9, 0.9), WIDTH, HEIGHT);
    expect(corner.x + corner.size).toBe(WIDTH);
    expect(corner.y + corner.size).toBe(HEIGHT);
  });

  it("never grows past the frame's shorter side", () => {
    const box = cropBox(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ],
      WIDTH,
      HEIGHT,
    );
    expect(box.size).toBe(HEIGHT);
    expect(box.y).toBe(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.size).toBeLessThanOrEqual(WIDTH);
  });
});
