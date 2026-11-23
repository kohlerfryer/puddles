/** Spots a hand held up still, so the game can take a photo of what it holds, and frames that photo. */

import type { PoseFrame } from "./poseFixture";

/** Normalized image coordinates, as MediaPipe returns them; y grows downward. */
export interface Point {
  x: number;
  y: number;
}

/** One camera sample: whether an arm is raised, and the hand landmarks most likely holding something up. */
export interface HandSample {
  t: number;
  raised: boolean;
  hand: readonly Point[] | undefined;
}

/** A square crop in pixels. */
export interface Box {
  x: number;
  y: number;
  size: number;
}

/** How long a raised hand must stay still before the photo is taken. */
export const HOLD_MS = 1000;
/** After the reaction to a photo finishes, the watch waits this long before it can fire again. */
export const COOLDOWN_MS = 3000;
/** How far the hand may drift, in hand sizes, and still count as held still. */
const STILL = 0.3;
/** The crop is this many hand sizes across, so an object in the hand fits too. */
const CROP_SCALE = 2;

/** MediaPipe Pose landmark indices. */
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

function wristAboveElbow(frame: PoseFrame, wrist: number, elbow: number): boolean {
  const w = frame.landmarks[wrist];
  const e = frame.landmarks[elbow];
  return w !== undefined && e !== undefined && w.y < e.y;
}

/** Whether either wrist is above its elbow, the way a kid holds something up to show it. */
export function armRaised(frame: PoseFrame): boolean {
  return (
    wristAboveElbow(frame, LEFT_WRIST, LEFT_ELBOW) ||
    wristAboveElbow(frame, RIGHT_WRIST, RIGHT_ELBOW)
  );
}

const top = (hand: readonly Point[]): number => Math.min(...hand.map((p) => p.y));

/** The hand reaching highest in the frame, which is the one holding something up. */
export function highestHand<H extends readonly Point[]>(hands: readonly H[]): H | undefined {
  return hands.reduce<H | undefined>(
    (best, hand) => (best === undefined || top(hand) < top(best) ? hand : best),
    undefined,
  );
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bounds(points: readonly Point[], width = 1, height = 1): Bounds {
  const xs = points.map((p) => p.x * width);
  const ys = points.map((p) => p.y * height);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** A square around the hand in a `width` by `height` frame, sized to the hand and kept inside the frame. */
export function cropBox(hand: readonly Point[], width: number, height: number): Box {
  const b = bounds(hand, width, height);
  const size = Math.round(
    Math.min(Math.max(b.maxX - b.minX, b.maxY - b.minY) * CROP_SCALE, width, height),
  );
  const x = Math.round((b.minX + b.maxX - size) / 2);
  const y = Math.round((b.minY + b.maxY - size) / 2);
  return { x: clamp(x, 0, width - size), y: clamp(y, 0, height - size), size };
}

interface Anchor {
  t: number;
  x: number;
  y: number;
}

/** Where the hand is and how big, in normalized units. */
function measure(hand: readonly Point[]): { x: number; y: number; size: number } {
  const b = bounds(hand);
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    size: Math.max(b.maxX - b.minX, b.maxY - b.minY),
  };
}

/**
 * Watches hand samples as they arrive, with `t` in milliseconds on a steady clock.
 * After it fires it stays quiet until `finished` is called, then for the cooldown.
 */
export function createHoldWatch() {
  let anchor: Anchor | undefined;
  let waiting = false;
  let quietUntil = -Infinity;

  const settled = (sample: HandSample): boolean => {
    if (waiting || sample.t < quietUntil || !sample.raised || !sample.hand) {
      anchor = undefined;
      return false;
    }
    const now = measure(sample.hand);
    if (!anchor || Math.hypot(now.x - anchor.x, now.y - anchor.y) > STILL * now.size) {
      anchor = { t: sample.t, x: now.x, y: now.y };
    }
    return sample.t - anchor.t >= HOLD_MS;
  };

  return {
    /** Adds the latest sample; true when it completes a hold and the photo should be taken. */
    push(sample: HandSample): boolean {
      if (!settled(sample)) return false;
      anchor = undefined;
      waiting = true;
      return true;
    },
    /** The reaction to the last photo finished at `t`. */
    finished(t: number): void {
      waiting = false;
      quietUntil = t + COOLDOWN_MS;
    },
  };
}
