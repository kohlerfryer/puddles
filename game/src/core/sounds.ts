import type { Mood, Step } from "./reaction";

/** What Puddles means without words, like a dog's barks. */
export type Intent = "hello" | "asking" | "yes" | "no";
export type Quack = Intent | "scared" | "curious";
export type Sound = Quack | "splash" | "boing";

/** Something that happens in the game and may make a sound. */
export type GameEvent =
  | { readonly kind: "step"; readonly step: Step }
  | { readonly kind: "intent"; readonly intent: Intent }
  | { readonly kind: "landed" }
  | { readonly kind: "jump" };

/**
 * One sound `at` seconds into a cue, sliding from `from` to `to` Hz: a quack's buzz, a noise
 * burst's filter, or a plain tone.
 */
export interface Note {
  readonly voice: "quack" | "noise" | "tone";
  readonly at: number;
  readonly seconds: number;
  readonly from: number;
  readonly to: number;
  readonly volume: number;
}

const MOOD_QUACKS: Record<Mood, Quack> = {
  happy: "yes",
  proud: "yes",
  silly: "hello",
  curious: "curious",
  scared: "scared",
  grossed_out: "no",
};

function stepQuack(step: Step): Quack | undefined {
  const say = step.say?.trim();
  if (!say) return undefined;
  if (say.endsWith("?")) return "asking";
  if (step.do === "look_at" && step.target === "camera") return "hello";
  return MOOD_QUACKS[step.mood];
}

/** The sound for a game event; a step quacks only when it says something. */
export function soundFor(event: GameEvent): Sound | undefined {
  switch (event.kind) {
    case "step":
      return stepQuack(event.step);
    case "intent":
      return event.intent;
    case "landed":
      return "splash";
    case "jump":
      return "boing";
  }
}

/** A quack `at` seconds in, sliding between the `pitch` pair in Hz. */
const quack = (
  at: number,
  seconds: number,
  pitch: readonly [number, number],
  volume = 0.7,
): Note => ({
  voice: "quack",
  at,
  seconds,
  from: pitch[0],
  to: pitch[1],
  volume,
});

export const SOUND_NOTES: Record<Sound, readonly Note[]> = {
  hello: [quack(0, 0.18, [640, 580])],
  asking: [quack(0, 0.12, [500, 520]), quack(0.12, 0.16, [520, 820])],
  yes: [quack(0, 0.1, [680, 640]), quack(0.15, 0.1, [720, 680])],
  no: [quack(0, 0.18, [560, 480]), quack(0.25, 0.22, [440, 320])],
  scared: [quack(0, 0.08, [1300, 1500], 0.5)],
  curious: [quack(0, 0.22, [260, 290], 0.35)],
  splash: [{ voice: "noise", at: 0, seconds: 0.4, from: 2000, to: 400, volume: 0.6 }],
  boing: [{ voice: "tone", at: 0, seconds: 0.3, from: 160, to: 480, volume: 0.5 }],
};

/** How long Puddles shakes his head for "no": the length of the no quack and a little after. */
export const SHAKE_SECONDS = 0.6;
const SHAKE_TURNS = 3;
const SHAKE_ANGLE = 0.4;

/** Head turn in radians `elapsed` seconds into a head shake: side to side, dying away. */
export function shakeHead(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= SHAKE_SECONDS) return 0;
  const progress = elapsed / SHAKE_SECONDS;
  return SHAKE_ANGLE * (1 - progress) * Math.sin(2 * Math.PI * SHAKE_TURNS * progress);
}
