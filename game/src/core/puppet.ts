import type { Pose } from "../plugins/skill/verbs";
import type { IdleKind } from "./idle";
import type { Mood } from "./reaction";

/** What Puddles is doing: a verb's pose or an idle action. */
export type Look = Pose | IdleKind;

/** How Puddles' eyes are drawn: shut for a blink or a nap, or one shape per mood. */
export type Eyes = "open" | "shut" | "smile" | "wide" | "crossed" | "proud" | "squeeze";

/** What core says Puddles is up to this frame, the input to his puppet pose. */
export interface PuppetCue {
  readonly look: Look;
  readonly mood: Mood;
  /** How far above the ground Puddles is. */
  readonly height: number;
  /** How far one wing is raised, in radians. */
  readonly wing: number;
  readonly walking: boolean;
  /** How far the head is turned in a head shake, in radians. */
  readonly shake: number;
}

/** How each layered part of the puppet is posed this frame. */
export interface PuppetPose {
  /** Body scale about the feet; `x * y` stays 1 so Puddles keeps his volume. */
  readonly squash: { readonly x: number; readonly y: number };
  /** Whole-body rock about the feet, in radians. */
  readonly lean: number;
  readonly headTilt: number;
  readonly wing: number;
  /** How far the bill is open, from 0 (shut) to 1 (wide). */
  readonly bill: number;
  readonly eyes: Eyes;
}

/** Breathing: how much Puddles stretches and how fast, in radians per second. */
const BREATH = { size: 0.02, speed: 2.4 };
/** How much a hop stretches Puddles at `height` and above. */
const HOP = { stretch: 0.18, height: 60 };
const FALLEN_SQUASH = -0.25;
const MOOD_STRETCH: Partial<Record<Mood, number>> = { scared: -0.08, proud: 0.06 };

/** One blink every `every` seconds, with the eyes shut for `shut` seconds. */
const BLINK = { every: 3.7, shut: 0.14 };
const BLINKING: ReadonlySet<Eyes> = new Set(["open", "wide", "crossed", "proud"]);
const MOOD_EYES: Record<Mood, Eyes> = {
  happy: "smile",
  curious: "open",
  scared: "wide",
  silly: "crossed",
  proud: "proud",
  grossed_out: "squeeze",
};
/** Idle looks where a happy Puddles shows his sparkly open eyes, as in the concept's idle pose. */
const CONTENT_LOOKS: ReadonlySet<Look> = new Set(["wander", "preen"]);

const MOOD_BILL: Record<Mood, number> = {
  happy: 0.5,
  curious: 0,
  scared: 1,
  silly: 1,
  proud: 0,
  grossed_out: 1,
};
const PECK_SPEED = 8;

const PREEN_SWAY = 0.35;
/** Head tilt over time for looks that move the head. */
const LOOK_TILT: Partial<Record<Look, (clock: number) => number>> = {
  preen: (clock) => 1.2 + Math.sin(clock * 6) * PREEN_SWAY,
  sniff: (clock) => 0.5 + Math.sin(clock * 24) * 0.08,
  peck: (clock) => 0.9 * Math.abs(Math.sin(clock * PECK_SPEED)),
  look_camera: () => -0.25,
};
/** Head tilt for moods when the look leaves the head alone; curious tilts like the concept art. */
const MOOD_TILT: Partial<Record<Mood, number>> = { curious: 0.21 };

/** The flap pose beats the wing around `raise`, `swing` either way, `speed` radians per second. */
const FLAP = { raise: 0.7, swing: 0.6, speed: 18 };

const WADDLE = 0.06;
/** How fast Puddles rocks side to side while moving, in radians per second. */
const WADDLE_SPEED: Partial<Record<Look, number>> = { wander: 10, walk: 10, run: 22 };

function stretch(cue: PuppetCue, clock: number): number {
  const breath = BREATH.size * Math.sin(clock * BREATH.speed);
  const hop = HOP.stretch * Math.min(cue.height / HOP.height, 1);
  const fallen = cue.look === "fallen" ? FALLEN_SQUASH : 0;
  return 1 + breath + hop + fallen + (MOOD_STRETCH[cue.mood] ?? 0);
}

function eyes(cue: PuppetCue, clock: number): Eyes {
  if (cue.look === "nap") return "shut";
  const shown = cue.mood === "happy" && CONTENT_LOOKS.has(cue.look) ? "open" : MOOD_EYES[cue.mood];
  return BLINKING.has(shown) && clock % BLINK.every < BLINK.shut ? "shut" : shown;
}

function bill(cue: PuppetCue, clock: number): number {
  const mood = MOOD_BILL[cue.mood];
  return cue.look === "peck" ? Math.max(mood, Math.abs(Math.sin(clock * PECK_SPEED))) : mood;
}

function wing(cue: PuppetCue, clock: number): number {
  if (cue.look !== "flap") return cue.wing;
  return Math.max(cue.wing, FLAP.raise + FLAP.swing * Math.sin(clock * FLAP.speed));
}

/** Poses Puddles' layered parts for `cue` at `clock` seconds: squash, lean, tilt, wing, bill and eyes. */
export function puppetPose(cue: PuppetCue, clock: number): PuppetPose {
  const tall = stretch(cue, clock);
  const waddle = WADDLE_SPEED[cue.walking ? "walk" : cue.look];
  const tilt = LOOK_TILT[cue.look]?.(clock) ?? MOOD_TILT[cue.mood] ?? 0;
  return {
    squash: { x: 1 / tall, y: tall },
    lean: waddle === undefined ? 0 : Math.sin(clock * waddle) * WADDLE,
    headTilt: tilt + cue.shake,
    wing: wing(cue, clock),
    bill: bill(cue, clock),
    eyes: eyes(cue, clock),
  };
}
