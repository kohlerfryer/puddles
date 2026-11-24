/** What the camera senses read: landmarks only, never the image, so raw media stays in render. */

import type { PoseFrame } from "./poseFixture";

/** Normalized image coordinates, as MediaPipe returns them; y grows downward. */
export interface Point {
  x: number;
  y: number;
}

export interface CameraSample {
  /** When the frame was taken, in ms on a steady clock. */
  readonly t: number;
  /** The first person MediaPipe Pose found, if any. */
  readonly pose: PoseFrame | undefined;
  /** Every hand Hand Landmarker found. */
  readonly hands: readonly (readonly Point[])[];
}

/** Gives a sense the latest camera sample at kernel time `t`, or nothing before the first. */
export type ReadCamera = (t: number) => CameraSample | undefined;

/** Plays recorded samples back, each from kernel time `sample.t` on. */
export function replayCamera(samples: readonly CameraSample[]): ReadCamera {
  return (t) => samples.filter((sample) => sample.t <= t).at(-1);
}

/** Wraps `read` so each sample comes out once, however many kernel ticks see it. */
export function newSamples(read: ReadCamera): ReadCamera {
  let last = -Infinity;
  return (t) => {
    const sample = read(t);
    if (!sample || sample.t <= last) return undefined;
    last = sample.t;
    return sample;
  };
}
