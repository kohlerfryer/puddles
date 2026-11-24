import { describe, expect, it } from "vitest";

import { type CameraSample, replayCamera } from "../../../core/cameraSample";
import { LANDMARK_COUNT, type PoseFrame } from "../../../core/poseFixture";
import { runSense } from "../../../kernel/testing";
import { poseSense } from "./index";

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

/** A pose with every landmark in the middle, then the given heights by landmark index. */
const poseAt = (t: number, heights: Record<number, number> = {}): PoseFrame => ({
  t,
  landmarks: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
    x: 0.5,
    y: heights[i] ?? 0.5,
    z: 0,
    visibility: 1,
  })),
});

const observed = (samples: CameraSample[], ms: number) =>
  runSense(poseSense(replayCamera(samples)), ms).map(({ type, data }) => ({ type, data }));

describe("the pose sense", () => {
  it("says where the kid is on each new sample, and when nobody is there", () => {
    const samples = [
      { t: 0, pose: poseAt(0), hands: [] },
      { t: 66, pose: undefined, hands: [] },
    ];
    expect(observed(samples, 200)).toEqual([
      { type: "observation.kid", data: { present: true, pose: { x: 0.5, y: 0.5 } } },
      { type: "observation.kid", data: { present: false } },
    ]);
  });

  it("keeps the kid inside the window when they lean out of it", () => {
    const leaning = poseAt(0, {
      [LEFT_SHOULDER]: -0.4,
      [RIGHT_SHOULDER]: -0.4,
      [LEFT_HIP]: -0.2,
      [RIGHT_HIP]: -0.2,
    });
    expect(observed([{ t: 0, pose: leaning, hands: [] }], 100)).toEqual([
      { type: "observation.kid", data: { present: true, pose: { x: 0.5, y: 0 } } },
    ]);
  });
});
