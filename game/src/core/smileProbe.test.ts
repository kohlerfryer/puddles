import { describe, expect, it } from "vitest";

import { faceLandmarks, separation, smileScore, summarize, type ProbeSample } from "./smileProbe";
import type { Landmark } from "./poseFixture";

const shape = (categoryName: string, score: number) => ({ categoryName, score });

describe("smileScore", () => {
  it("averages the two mouth-smile blendshapes", () => {
    const scores = [
      shape("mouthSmileLeft", 0.6),
      shape("jawOpen", 0.9),
      shape("mouthSmileRight", 0.8),
    ];
    expect(smileScore(scores)).toBeCloseTo(0.7);
  });

  it("has no score without both smile blendshapes", () => {
    expect(smileScore([shape("mouthSmileLeft", 0.6)])).toBeUndefined();
    expect(smileScore([])).toBeUndefined();
  });
});

describe("faceLandmarks", () => {
  const point = (x: number, visibility: number): Landmark => ({ x, y: 0.2, z: 0, visibility });

  it("keeps the visible face points and drops the body", () => {
    const landmarks = [
      point(0.5, 0.9),
      point(0.4, 0.2),
      ...Array.from({ length: 31 }, () => point(0.1, 0.9)),
    ];
    const face = faceLandmarks({ t: 0, landmarks });
    expect(face).toHaveLength(10);
    expect(face).not.toContainEqual({ x: 0.4, y: 0.2 });
  });

  it("finds no face when too few face points are visible", () => {
    const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.1));
    expect(faceLandmarks({ t: 0, landmarks })).toEqual([]);
  });
});

describe("separation", () => {
  it("is 1 when every smile scores above every neutral face", () => {
    expect(separation([0.1, 0.2], [0.5, 0.6])).toBe(1);
  });

  it("is 0.5 when the scores can't tell them apart", () => {
    expect(separation([0.3, 0.3], [0.3, 0.3])).toBe(0.5);
  });

  it("has no value without both kinds of sample", () => {
    expect(separation([], [0.5])).toBeUndefined();
  });
});

describe("summarize", () => {
  const sample = (
    method: ProbeSample["method"],
    face: ProbeSample["face"],
    score?: number,
  ): ProbeSample => ({
    distanceM: 2,
    method,
    face,
    score,
  });

  it("reports detection, means and separation per distance and method", () => {
    const samples = [
      sample("crop", "neutral", 0.1),
      sample("crop", "neutral", undefined),
      sample("crop", "smile", 0.7),
      sample("crop", "smile", 0.9),
      sample("full", "smile", undefined),
    ];
    expect(summarize(samples)).toEqual([
      { distanceM: 2, method: "crop", detected: 0.75, neutral: 0.1, smile: 0.8, separation: 1 },
      {
        distanceM: 2,
        method: "full",
        detected: 0,
        neutral: undefined,
        smile: undefined,
        separation: undefined,
      },
    ]);
  });
});
