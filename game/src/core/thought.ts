/** Puddles' thought bubble: a picture of what he's thinking, for kids who can't read yet. */

import { ASK_TIMEOUT_MS } from "./ask";
import { ASK_MS } from "../plugins/brains/copyMe";
import type { Step } from "./contracts";
import type { BodyGesture } from "../plugins/sense/gestures/gestures";
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
  sense: [
    line(-0.15, -0.85, 0.25, -0.7, 0.4, -0.3, 0.25, 0.1, -0.15, 0.25),
    line(-0.15, 0.25, -0.55, 0.1, -0.7, -0.3, -0.55, -0.7, -0.15, -0.85),
    line(0.2, 0.15, 0.75, 0.75),
  ],
} satisfies Record<string, readonly IconShape[]>;

export type ThoughtIcon = keyof typeof THOUGHT_ICONS;

/** A picture Puddles starts thinking of at `startedAt` ms and holds for `seconds`. */
interface Thought {
  readonly icon: ThoughtIcon;
  readonly startedAt: number;
  readonly seconds: number;
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
  return { icon: GESTURE_ICONS[gesture], startedAt: now, seconds: THOUGHT_SECONDS };
}

/** The thought Puddles has from `now` ms while he waits to find out what he was shown. */
export function senseThought(now: number): Thought {
  return { icon: "sense", startedAt: now, seconds: ASK_TIMEOUT_MS / 1000 };
}

const isIcon = (icon: unknown): icon is ThoughtIcon =>
  typeof icon === "string" && Object.hasOwn(THOUGHT_ICONS, icon);

const endsAt = ({ startedAt, seconds }: Thought) => startedAt + seconds * 1000;

/**
 * The thought once the kernel starts `step` at `now` ms: the gesture Puddles waits for the kid to
 * copy, held for the whole wait; the gesture a step thinks of, briefly, unless he already holds it
 * in mind for longer; or none, which pops the bubble when a request ends.
 */
export function thoughtAfter(
  current: Thought | undefined,
  { skill, args, think }: Step,
  now: number,
): Thought | undefined {
  if (skill === "copy_gesture") {
    return isIcon(args.gesture)
      ? { icon: args.gesture, startedAt: now, seconds: ASK_MS / 1000 }
      : undefined;
  }
  if (!isIcon(think)) return undefined;
  const brief = { icon: think, startedAt: now, seconds: THOUGHT_SECONDS };
  return current?.icon === think && endsAt(current) > endsAt(brief) ? current : brief;
}

/** The thought bubble at `now` ms: its icon and how opaque it is. */
export function thoughtAt(
  thought: Thought | undefined,
  now: number,
): { readonly icon: ThoughtIcon; readonly alpha: number } | undefined {
  if (!thought) return undefined;
  const alpha = fadeAlpha(thought.startedAt, thought.seconds, now);
  return alpha > 0 ? { icon: thought.icon, alpha } : undefined;
}

/** Where the speech and thought bubbles centre for Puddles at `x`: side by side, both in the scene. */
export function bubbleCentres(x: number): { readonly speech: number; readonly thought: number } {
  const speech = Math.min(Math.max(x, SPEECH_WIDTH / 2), SCENE_WIDTH - SPEECH_WIDTH / 2);
  const apart = (SPEECH_WIDTH + THOUGHT_WIDTH) / 2 + GAP;
  const right = speech + apart;
  return { speech, thought: right + THOUGHT_WIDTH / 2 <= SCENE_WIDTH ? right : speech - apart };
}
