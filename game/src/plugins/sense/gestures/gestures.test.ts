import { describe, expect, it } from "vitest";

import { isPoseFixture, LANDMARK_COUNT, type PoseFixture } from "../../../core/poseFixture";
import { detectGestures, feetInView } from "./gestures";

const files = import.meta.glob<unknown>("../../../core/fixtures/*.json", {
  eager: true,
  import: "default",
});
const fixtures = Object.entries(files).map(([path, data]): [string, PoseFixture] => {
  if (!isPoseFixture(data)) throw new Error(`${path} is not a pose fixture`);
  return [path, data];
});

describe("detectGestures", () => {
  it.each(fixtures)("%s detects its gesture and none of the others", (_path, fixture) => {
    const expected = fixture.gesture === "idle" ? [] : [fixture.gesture];
    expect(detectGestures(fixture.frames)).toEqual(expected);
  });

  it("detects nothing in an empty sequence", () => {
    expect(detectGestures([])).toEqual([]);
  });

  it("detects nothing when landmarks are missing", () => {
    const frames = Array.from({ length: 30 }, (_, i) => ({ t: i * 90, landmarks: [] }));
    expect(detectGestures(frames)).toEqual([]);
  });

  it("detects nothing when every landmark sits still", () => {
    const still = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    const landmarks = Array.from({ length: LANDMARK_COUNT }, () => still);
    const frames = Array.from({ length: 30 }, (_, i) => ({ t: i * 90, landmarks }));
    expect(detectGestures(frames)).toEqual([]);
  });
});

describe("feetInView", () => {
  const frame = (ankle: number) => ({
    t: 0,
    landmarks: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: i === 27 || i === 28 ? ankle : 1,
    })),
  });

  it("needs both ankles visible", () => {
    expect(feetInView(frame(0.9))).toBe(true);
    expect(feetInView(frame(0.1))).toBe(false);
  });
});
