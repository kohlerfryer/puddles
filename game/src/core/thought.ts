/** Puddles' thought bubble: a picture of what he's thinking, for kids who can't read yet. */

import type { BodyGesture } from "./gestures";
import { SCENE_WIDTH } from "./pond";
import { fadeAlpha, SPEECH_WIDTH } from "./speech";

/** One piece of an icon in a box from -1 to 1 (y grows downward): a dot, a filled shape or a stroke. */
type IconShape =
  | { readonly kind: "circle"; readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: "fill" | "line"; readonly points: readonly number[] };

const circle = (x: number, y: number, r: number): IconShape => ({ kind: "circle", x, y, r });
const fill = (...points: number[]): IconShape => ({ kind: "fill", points });
const line = (...points: number[]): IconShape => ({ kind: "line", points });

/** Every picture Puddles can think of, drawn from simple shapes; add an entry to teach him a new one. */
export const THOUGHT_ICONS = {
  jump: [
    fill(0, -0.9, 0.5, -0.3, 0.2, -0.3, 0.2, 0.4, -0.2, 0.4, -0.2, -0.3, -0.5, -0.3),
    line(-0.8, 0.8, 0.8, 0.8),
  ],
  wave: [
    circle(0, -0.5, 0.25),
    line(0, -0.25, 0, 0.5),
    line(0, -0.05, 0.45, -0.55),
    line(0, -0.05, -0.4, 0.3),
    line(0.6, -0.9, 0.85, -0.65),
    line(0.75, -0.95, 0.95, -0.8),
  ],
  flap: [
    circle(0, 0.2, 0.35),
    fill(-0.3, 0.1, -0.95, -0.6, -0.6, 0.35),
    fill(0.3, 0.1, 0.95, -0.6, 0.6, 0.35),
  ],
  crouch: [
    fill(0, 0.6, 0.5, 0, 0.2, 0, 0.2, -0.8, -0.2, -0.8, -0.2, 0, -0.5, 0),
    line(-0.8, 0.8, 0.8, 0.8),
  ],
} satisfies Record<string, readonly IconShape[]>;

export type ThoughtIcon = keyof typeof THOUGHT_ICONS;

/** A picture Puddles starts thinking of at `startedAt` ms. */
interface Thought {
  readonly icon: ThoughtIcon;
  readonly startedAt: number;
}

/** How long Puddles holds a thought before it fades. */
export const THOUGHT_SECONDS = 2;
export const THOUGHT_WIDTH = 120;
/** Space between the speech and thought bubbles. */
const GAP = 16;

/** Which picture Puddles thinks of when he sees each gesture. */
const GESTURE_ICONS: Record<BodyGesture, ThoughtIcon> = {
  jump: "jump",
  wave: "wave",
  flap: "flap",
  crouch: "crouch",
};

/** The thought Puddles has at `now` ms when the player makes `gesture`. */
export function gestureThought(gesture: BodyGesture, now: number): Thought {
  return { icon: GESTURE_ICONS[gesture], startedAt: now };
}

/** The thought bubble at `now` ms: its icon and how opaque it is. */
export function thoughtAt(
  thought: Thought | undefined,
  now: number,
): { readonly icon: ThoughtIcon; readonly alpha: number } | undefined {
  if (!thought) return undefined;
  const alpha = fadeAlpha(thought.startedAt, THOUGHT_SECONDS, now);
  return alpha > 0 ? { icon: thought.icon, alpha } : undefined;
}

/** Where the speech and thought bubbles centre for Puddles at `x`: side by side, both in the scene. */
export function bubbleCentres(x: number): { readonly speech: number; readonly thought: number } {
  const speech = Math.min(Math.max(x, SPEECH_WIDTH / 2), SCENE_WIDTH - SPEECH_WIDTH / 2);
  const apart = (SPEECH_WIDTH + THOUGHT_WIDTH) / 2 + GAP;
  const right = speech + apart;
  return { speech, thought: right + THOUGHT_WIDTH / 2 <= SCENE_WIDTH ? right : speech - apart };
}
