/** Turns a live stream of pose frames into gestures, and gestures into Puddles' reactions. */

import { type BodyGesture, detectGestures } from "./gestures";
import type { PoseFrame } from "./poseFixture";
import type { Step } from "./reaction";

/** What Puddles does when the player makes each gesture. */
export const GESTURE_REACTIONS: Record<BodyGesture, Step> = {
  jump: { do: "jump", mood: "happy", say: "Boing!" },
  wave: { do: "look_at", target: "camera", mood: "happy", say: "Hi friend!" },
  flap: { do: "flap", mood: "silly", say: "Flap flap flap!" },
  crouch: { do: "freeze", mood: "curious", say: "Where did you go?" },
};

/** How much recent movement the detector sees: long enough for a held wave or two flaps. */
const WINDOW_MS = 2500;
/** After reporting, the watch forgets what it saw and waits this long, so one gesture fires once. */
export const WATCH_COOLDOWN_MS = 1500;

/** Watches pose frames as they arrive, with `t` in milliseconds on a steady clock. */
export function createGestureWatch() {
  let frames: PoseFrame[] = [];
  let quietUntil = -Infinity;

  return {
    /** Adds the latest frame and returns any gestures it completes. */
    push(frame: PoseFrame): BodyGesture[] {
      if (frame.t < quietUntil) return [];
      frames = [...frames.filter((f) => f.t > frame.t - WINDOW_MS), frame];
      const gestures = detectGestures(frames);
      if (gestures.length > 0) {
        frames = [];
        quietUntil = frame.t + WATCH_COOLDOWN_MS;
      }
      return gestures;
    },
  };
}
