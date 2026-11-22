/** Recorded pose-landmark sequences used to test gesture detection. */

export const GESTURES = ["jump", "wave", "flap", "crouch", "idle"] as const;
export type Gesture = (typeof GESTURES)[number];

/** MediaPipe Pose returns 33 landmarks per person. */
export const LANDMARK_COUNT = 33;

/** Normalized image coordinates (outside [0, 1] for off-frame joints); z is relative to the hips. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  /** Milliseconds since recording started. */
  t: number;
  landmarks: Landmark[];
}

export interface PoseFixture {
  gesture: Gesture;
  who: string;
  frames: PoseFrame[];
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

/** Keep four decimals so fixture files stay small. */
export function toFrame(t: number, landmarks: readonly Landmark[]): PoseFrame {
  return {
    t: Math.round(t),
    landmarks: landmarks.map((l) => ({
      x: round(l.x),
      y: round(l.y),
      z: round(l.z),
      visibility: round(l.visibility),
    })),
  };
}

export function fixtureFileName(gesture: Gesture, who: string): string {
  const slug = who
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${gesture}-${slug || "anon"}.json`;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isLandmark(value: unknown): value is Landmark {
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  return isNumber(l.x) && isNumber(l.y) && isNumber(l.z) && isNumber(l.visibility);
}

function isFrame(value: unknown): value is PoseFrame {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    isNumber(f.t) &&
    Array.isArray(f.landmarks) &&
    f.landmarks.length === LANDMARK_COUNT &&
    f.landmarks.every(isLandmark)
  );
}

export function isPoseFixture(value: unknown): value is PoseFixture {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    GESTURES.includes(f.gesture as Gesture) &&
    typeof f.who === "string" &&
    Array.isArray(f.frames) &&
    f.frames.length > 0 &&
    f.frames.every(isFrame)
  );
}
