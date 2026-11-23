/**
 * The screen is a window Puddles sees through: where the kid stands, how close they are,
 * and whether Puddles comes up to the glass to meet them.
 */

import type { Landmark, PoseFrame } from "./poseFixture";
import { POND } from "./pond";
import type { Facing, Pose } from "./verbs";

/** MediaPipe Pose landmark indices. */
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

/** Torso length, as a share of the camera image's height, of a kid standing back and of one at the glass. */
const FAR_TORSO = 0.32;
const NEAR_TORSO = 0.45;
/** Puddles comes up to the glass above this closeness and goes back below the lower one, so he doesn't dither. */
const APPROACH_ABOVE = 0.7;
const RETURN_BELOW = 0.3;
/** How quickly gaze and closeness catch up with the kid: about two thirds of the way in this many seconds. */
const SMOOTH_SECONDS = 0.25;
/** How long the kid can be out of sight before Puddles stops watching for them. */
export const LOST_SECONDS = 1;
/** How long the waddle between the bank and the glass takes. */
export const APPROACH_SECONDS = 1.2;
/** How far towards the front of the bank Puddles stands at the glass, and how much bigger he looks. */
const FRONT_DEPTH = POND.bank.height / 2;
const GLASS_SCALE = 1.5;
/** Puddles doesn't turn round for a kid this close to straight ahead. */
const TURN_ABOVE = 0.15;
/** Seconds at the glass before the first tap, then between taps. */
const FIRST_TAP = 1.5;
export const TAP_EVERY = 4;
/** How long the beak's tap forward and back takes; it hits the glass halfway. */
const TAP_SECONDS = 0.3;
/** How long the ring from a tap takes to spread and fade. */
const RING_SECONDS = 0.6;

const HIDDEN: Landmark = { x: 0.5, y: 0, z: 0, visibility: 0 };

const landmark = (frame: PoseFrame, index: number): Landmark => frame.landmarks[index] ?? HIDDEN;
const mid = (frame: PoseFrame, left: number, right: number, axis: "x" | "y"): number =>
  (landmark(frame, left)[axis] + landmark(frame, right)[axis]) / 2;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Where the kid stands across the window, from -1 (screen left) to 1 (screen right).
 * The camera faces the kid, so its image is mirrored: their left is the image's right.
 */
export function gazeTarget(frame: PoseFrame): number {
  return clamp(1 - 2 * mid(frame, LEFT_SHOULDER, RIGHT_SHOULDER, "x"), -1, 1);
}

/** How close the kid is to the glass, from 0 (standing back) to 1 (right up to it), by how tall their body looks. */
export function closeness(frame: PoseFrame): number {
  const torso =
    mid(frame, LEFT_HIP, RIGHT_HIP, "y") - mid(frame, LEFT_SHOULDER, RIGHT_SHOULDER, "y");
  return clamp((torso - FAR_TORSO) / (NEAR_TORSO - FAR_TORSO), 0, 1);
}

/** Moves `current` smoothly towards `target` over `dt` seconds, so a jittery camera doesn't jitter Puddles. */
export function ease(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / SMOOTH_SECONDS));
}

/** Whether Puddles wants to be at the glass, given whether he already is and how close the kid is. */
export function wantsGlass(atGlass: boolean, closenessNow: number): boolean {
  return atGlass ? closenessNow > RETURN_BELOW : closenessNow > APPROACH_ABOVE;
}

/** How far Puddles has waddled from the bank (0) to the glass (1) after `dt` more seconds. */
export function stepApproach(near: number, toGlass: boolean, dt: number): number {
  const step = dt / APPROACH_SECONDS;
  return clamp(near + (toGlass ? step : -step), 0, 1);
}

/** How far in front of the usual ground line Puddles stands, and how big he looks, `near` the glass. */
export function glassPlacement(near: number): { depth: number; scale: number } {
  return { depth: near * FRONT_DEPTH, scale: 1 + near * (GLASS_SCALE - 1) };
}

/**
 * Puddles' beak tapping the glass, `seconds` after he got there: `bob` is how far the beak is
 * forward (0 to 1) and `ring` how far the ring from the last tap has spread (0 to 1), if one shows.
 */
export function glassTap(seconds: number): { bob: number; ring?: number } {
  if (seconds < FIRST_TAP) return { bob: 0 };
  const phase = (seconds - FIRST_TAP) % TAP_EVERY;
  const bob = phase < TAP_SECONDS ? Math.sin((Math.PI * phase) / TAP_SECONDS) : 0;
  const sinceHit = phase - TAP_SECONDS / 2;
  if (sinceHit < 0 || sinceHit > RING_SECONDS) return { bob };
  return { bob, ring: sinceHit / RING_SECONDS };
}

/** Whether Puddles is free to watch the kid: idle (no verb `pose`) or looking at the camera. */
export function freeToWatch(pose: Pose | undefined): boolean {
  return pose === undefined || pose === "look_camera";
}

/** Which way Puddles faces to look at a kid at `gaze`; he keeps `facing` when they are straight ahead. */
export function facingKid(gaze: number, facing: Facing): Facing {
  if (Math.abs(gaze) < TURN_ABOVE) return facing;
  return gaze > 0 ? 1 : -1;
}

/** Watches the kid through the window and walks Puddles to the glass and back. */
export function createGlass() {
  let seen = { gaze: 0, closeness: 0 };
  let lostFor = Infinity;
  let gaze = 0;
  let near = 0;
  let closer = 0;
  let atGlass = false;
  let glassFor = 0;

  return {
    /** The latest camera frame, or none when nobody is in view. */
    see(frame: PoseFrame | undefined): void {
      if (!frame) return;
      seen = { gaze: gazeTarget(frame), closeness: closeness(frame) };
      lostFor = 0;
    },
    /** Moves on `dt` seconds; Puddles only follows the kid and comes to the glass while `free` of other things to do. */
    update(dt: number, free: boolean) {
      lostFor += dt;
      const watching = lostFor < LOST_SECONDS;
      gaze = ease(gaze, watching ? seen.gaze : 0, dt);
      closer = ease(closer, watching ? seen.closeness : 0, dt);
      atGlass = free && wantsGlass(atGlass, closer);
      const was = near;
      near = stepApproach(near, atGlass, dt);
      glassFor = near === 1 ? glassFor + dt : 0;
      return {
        watching,
        gaze: free ? gaze : 0,
        near,
        walking: near !== was,
        tap: glassTap(glassFor),
        ...glassPlacement(near),
      };
    },
  };
}
