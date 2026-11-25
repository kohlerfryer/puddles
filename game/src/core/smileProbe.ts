/** Scores smiles from Face Landmarker blendshapes and sums up how well they separate from a neutral face (spike #122). */

import type { Point } from "./cameraSample";
import type { PoseFrame } from "./poseFixture";

export interface Blendshape {
  categoryName: string;
  score: number;
}

/** Whether Face Landmarker ran on the whole frame or on a crop around the face found by Pose. */
export type ProbeMethod = "full" | "crop";

export interface ProbeSample {
  distanceFt: number;
  method: ProbeMethod;
  face: "neutral" | "smile";
  /** The smile score, or nothing when no face was found. */
  score: number | undefined;
}

export interface ProbeSummary {
  distanceFt: number;
  method: ProbeMethod;
  /** Share of samples where a face was found. */
  detected: number;
  neutral: number | undefined;
  smile: number | undefined;
  /** Chance a smiling sample scores above a neutral one: 0.5 is a coin flip, 1 is perfect. */
  separation: number | undefined;
}

/** Pose landmarks 0 to 10 are the face: nose, eyes, ears and mouth corners. */
const FACE_POINTS = 11;
/** Fewer visible face points than this and the crop would be a guess. */
const MIN_FACE_POINTS = 5;
const VISIBLE = 0.5;

export function smileScore(blendshapes: readonly Blendshape[]): number | undefined {
  const left = blendshapes.find((b) => b.categoryName === "mouthSmileLeft");
  const right = blendshapes.find((b) => b.categoryName === "mouthSmileRight");
  return left && right ? (left.score + right.score) / 2 : undefined;
}

/** The visible face points of a pose, to frame a face crop, or none when too few are visible. */
export function faceLandmarks(frame: PoseFrame): Point[] {
  const face = frame.landmarks
    .slice(0, FACE_POINTS)
    .filter((l) => l.visibility >= VISIBLE)
    .map(({ x, y }) => ({ x, y }));
  return face.length >= MIN_FACE_POINTS ? face : [];
}

const mean = (values: readonly number[]): number | undefined =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;

/** The area under the ROC curve: how often a smile outscores a neutral face, ties counting half. */
export function separation(
  neutral: readonly number[],
  smile: readonly number[],
): number | undefined {
  if (!neutral.length || !smile.length) return undefined;
  let wins = 0;
  for (const s of smile) {
    for (const n of neutral) wins += s > n ? 1 : s === n ? 0.5 : 0;
  }
  return wins / (neutral.length * smile.length);
}

function summarizeGroup(samples: readonly ProbeSample[]): ProbeSummary {
  const [{ distanceFt, method }] = samples as [ProbeSample];
  const scores = (face: ProbeSample["face"]) =>
    samples.flatMap((s) => (s.face === face && s.score !== undefined ? [s.score] : []));
  const neutral = scores("neutral");
  const smile = scores("smile");
  return {
    distanceFt,
    method,
    detected: (neutral.length + smile.length) / samples.length,
    neutral: mean(neutral),
    smile: mean(smile),
    separation: separation(neutral, smile),
  };
}

/** One summary per distance and method, in the order they were first recorded. */
export function summarize(samples: readonly ProbeSample[]): ProbeSummary[] {
  const groups = new Map<string, ProbeSample[]>();
  for (const sample of samples) {
    const key = `${String(sample.distanceFt)}:${sample.method}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.values()].map(summarizeGroup);
}
