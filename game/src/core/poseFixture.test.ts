import { describe, expect, it } from "vitest";

import { fixtureFileName, isPoseFixture, LANDMARK_COUNT, toFrame } from "./poseFixture";

const landmark = { x: 0.123456, y: 0.5, z: -0.0000449, visibility: 0.99999 };
const frame = toFrame(
  16.7,
  Array.from({ length: LANDMARK_COUNT }, () => landmark),
);

describe("toFrame", () => {
  it("rounds time to ms and landmarks to four decimals", () => {
    expect(frame.t).toBe(17);
    expect(frame.landmarks[0]).toEqual({ x: 0.1235, y: 0.5, z: -0, visibility: 1 });
  });
});

describe("fixtureFileName", () => {
  it("names files by gesture and person", () => {
    expect(fixtureFileName("jump", "Kid 1")).toBe("jump-kid-1.json");
    expect(fixtureFileName("wave", "  ")).toBe("wave-anon.json");
  });
});

describe("isPoseFixture", () => {
  it("accepts a well-formed fixture", () => {
    expect(isPoseFixture({ gesture: "flap", who: "adult", frames: [frame] })).toBe(true);
  });

  it("rejects bad gestures, empty recordings and partial skeletons", () => {
    expect(isPoseFixture({ gesture: "spin", who: "adult", frames: [frame] })).toBe(false);
    expect(isPoseFixture({ gesture: "jump", who: "adult", frames: [] })).toBe(false);
    const partial = { ...frame, landmarks: frame.landmarks.slice(1) };
    expect(isPoseFixture({ gesture: "jump", who: "adult", frames: [partial] })).toBe(false);
    expect(isPoseFixture(null)).toBe(false);
  });
});
