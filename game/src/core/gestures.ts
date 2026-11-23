/** Recognize body gestures from MediaPipe Pose landmark sequences. */

import { GESTURES, type Gesture, type Landmark, type PoseFrame } from "./poseFixture";

export type BodyGesture = Exclude<Gesture, "idle">;

export const BODY_GESTURES = GESTURES.filter((g): g is BodyGesture => g !== "idle");

/** MediaPipe Pose landmark indices. */
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

/*
 * Heights are measured in torso lengths (shoulder midpoint to hip midpoint) so
 * thresholds hold at any distance from the camera.
 */
/** How far a wrist must be above its shoulder to count as raised. */
const RAISED = 0.1;
/** How far feet and hips must rise above their lowest point in the last second to count as a jump. */
const JUMP_LIFT = 0.2;
const JUMP_LOOKBACK_MS = 1000;
/** Crouching when the hips sit below this share of the shoulders' height above the feet. */
const CROUCH_HIP_SHARE = 0.45;
/** How long a wave or crouch must be held. */
const HOLD_MS = 1000;
/** How many times both arms must go up together to count as flapping. */
const FLAPS = 2;
/** Below this ankle visibility MediaPipe is guessing where the feet are. */
const FEET_VISIBLE = 0.3;

const HIDDEN: Landmark = { x: 0, y: 0, z: 0, visibility: 0 };

/** One frame reduced to the heights the detectors use; image y grows downward. */
interface Sample {
  t: number;
  shoulders: number;
  hips: number;
  feet: number;
  feetVisible: boolean;
  leftRaise: number;
  rightRaise: number;
}

const landmark = (frame: PoseFrame, index: number): Landmark => frame.landmarks[index] ?? HIDDEN;
const y = (frame: PoseFrame, index: number): number => landmark(frame, index).y;
const midY = (frame: PoseFrame, left: number, right: number): number =>
  (y(frame, left) + y(frame, right)) / 2;
const torso = (frame: PoseFrame): number =>
  midY(frame, LEFT_HIP, RIGHT_HIP) - midY(frame, LEFT_SHOULDER, RIGHT_SHOULDER);

/** Upper median, so one odd frame can't skew the scale. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Whether both ankles are in view; jump and crouch can't be judged without them. */
export function feetInView(frame: PoseFrame): boolean {
  const visibility = Math.min(
    landmark(frame, LEFT_ANKLE).visibility,
    landmark(frame, RIGHT_ANKLE).visibility,
  );
  return visibility >= FEET_VISIBLE;
}

function toSample(frame: PoseFrame, scale: number): Sample {
  return {
    t: frame.t,
    shoulders: midY(frame, LEFT_SHOULDER, RIGHT_SHOULDER) / scale,
    hips: midY(frame, LEFT_HIP, RIGHT_HIP) / scale,
    feet: midY(frame, LEFT_ANKLE, RIGHT_ANKLE) / scale,
    feetVisible: feetInView(frame),
    leftRaise: (y(frame, LEFT_SHOULDER) - y(frame, LEFT_WRIST)) / scale,
    rightRaise: (y(frame, RIGHT_SHOULDER) - y(frame, RIGHT_WRIST)) / scale,
  };
}

/** Longest time, in ms, that `holds` stays true across consecutive samples. */
function longestHoldMs(samples: readonly Sample[], holds: (s: Sample) => boolean): number {
  let start: number | undefined;
  let longest = 0;
  for (const s of samples) {
    if (!holds(s)) {
      start = undefined;
      continue;
    }
    start ??= s.t;
    longest = Math.max(longest, s.t - start);
  }
  return longest;
}

/** How far `height` has risen above its lowest point in the lookback window. */
function rise(samples: readonly Sample[], now: Sample, height: (s: Sample) => number): number {
  const recent = samples.filter((s) => s.t <= now.t && s.t >= now.t - JUMP_LOOKBACK_MS);
  return Math.max(...recent.map(height)) - height(now);
}

function isJump(samples: readonly Sample[]): boolean {
  return samples.some(
    (s) =>
      s.feetVisible &&
      Math.min(
        rise(samples, s, (p) => p.feet),
        rise(samples, s, (p) => p.hips),
      ) > JUMP_LIFT,
  );
}

function isWave(samples: readonly Sample[]): boolean {
  const oneHandUp = (s: Sample): boolean => s.leftRaise > RAISED !== s.rightRaise > RAISED;
  return longestHoldMs(samples, oneHandUp) >= HOLD_MS;
}

function isFlap(samples: readonly Sample[]): boolean {
  let flaps = 0;
  let wasUp = false;
  for (const s of samples) {
    const up = s.leftRaise > RAISED && s.rightRaise > RAISED;
    if (up && !wasUp) flaps += 1;
    wasUp = up;
  }
  return flaps >= FLAPS;
}

function isCrouch(samples: readonly Sample[]): boolean {
  const crouched = (s: Sample): boolean =>
    s.feetVisible && (s.feet - s.hips) / (s.feet - s.shoulders) < CROUCH_HIP_SHARE;
  return longestHoldMs(samples, crouched) >= HOLD_MS;
}

const DETECTORS: Record<BodyGesture, (samples: readonly Sample[]) => boolean> = {
  jump: isJump,
  wave: isWave,
  flap: isFlap,
  crouch: isCrouch,
};

/** Every body gesture performed anywhere in `frames`, in `GESTURES` order. */
export function detectGestures(frames: readonly PoseFrame[]): BodyGesture[] {
  const scale = median(frames.map(torso));
  const samples = frames.map((frame) => toSample(frame, scale));
  return BODY_GESTURES.filter((gesture) => DETECTORS[gesture](samples));
}
