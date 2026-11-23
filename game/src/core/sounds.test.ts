import { describe, expect, it } from "vitest";

import type { Mood, Step } from "./reaction";
import {
  type Intent,
  type Note,
  type Quack,
  SHAKE_SECONDS,
  shakeHead,
  type Sound,
  SOUND_NOTES,
  soundFor,
} from "./sounds";

const MOODS: readonly Mood[] = ["happy", "curious", "scared", "silly", "proud", "grossed_out"];
const INTENTS: readonly Intent[] = ["hello", "asking", "yes", "no"];
const QUACKS: readonly Quack[] = [...INTENTS, "scared", "curious"];
const SOUNDS: readonly Sound[] = [...QUACKS, "splash", "boing"];

const saying = (mood: Mood, say = "Ooh!"): Step => ({ do: "sniff", mood, say });
const end = (notes: readonly Note[]): number =>
  Math.max(...notes.map((note) => note.at + note.seconds));
const pitches = (notes: readonly Note[]): number[] => notes.flatMap((n) => [n.from, n.to]);
const notesOf = (sound: Sound): readonly Note[] => SOUND_NOTES[sound];

describe("soundFor", () => {
  it("quacks each mood with its own meaning when a step says something", () => {
    const quacks = Object.fromEntries(MOODS.map((mood) => [mood, soundFor(stepEvent(mood))]));
    expect(quacks).toEqual({
      happy: "yes",
      proud: "yes",
      silly: "hello",
      curious: "curious",
      scared: "scared",
      grossed_out: "no",
    });
  });

  it("asks with a rising quack when the line is a question", () => {
    expect(soundFor({ kind: "step", step: saying("curious", "Where did you go? ") })).toBe(
      "asking",
    );
  });

  it("says hello when Puddles speaks to the camera", () => {
    const wave: Step = { do: "look_at", target: "camera", mood: "happy", say: "Hi friend!" };
    expect(soundFor({ kind: "step", step: wave })).toBe("hello");
  });

  it("keeps a silent step silent", () => {
    for (const mood of MOODS) {
      expect(soundFor({ kind: "step", step: { do: "sniff", mood } })).toBeUndefined();
    }
  });

  it("quacks an intent as itself", () => {
    for (const intent of INTENTS) expect(soundFor({ kind: "intent", intent })).toBe(intent);
  });

  it("splashes when a sticker lands on the water and boings when Puddles jumps", () => {
    expect(soundFor({ kind: "landed" })).toBe("splash");
    expect(soundFor({ kind: "jump" })).toBe("boing");
  });
});

function stepEvent(mood: Mood) {
  return { kind: "step", step: saying(mood) } as const;
}

describe("SOUND_NOTES", () => {
  it("gives every sound its own pattern", () => {
    const patterns = new Set(SOUNDS.map((sound) => JSON.stringify(notesOf(sound))));
    expect(patterns.size).toBe(SOUNDS.length);
  });

  it("voices quacks as quacks, the splash as noise and the boing as a tone", () => {
    for (const quack of QUACKS) expect(notesOf(quack).every((n) => n.voice === "quack")).toBe(true);
    expect(notesOf("splash").map((n) => n.voice)).toEqual(["noise"]);
    expect(notesOf("boing").map((n) => n.voice)).toEqual(["tone"]);
  });

  it("says hello with one bright quack", () => {
    const [hello, ...rest] = notesOf("hello");
    expect(rest).toEqual([]);
    expect(hello?.from).toBeGreaterThan(Math.max(...pitches(notesOf("curious"))));
  });

  it("asks with a quack that rises at the end", () => {
    const last = notesOf("asking").at(-1);
    expect(last?.to).toBeGreaterThan((last?.from ?? Infinity) * 1.3);
  });

  it("says yes with two quick bright quacks", () => {
    const yes = notesOf("yes");
    expect(yes).toHaveLength(2);
    expect(end(yes)).toBeLessThan(0.4);
    expect(Math.min(...pitches(yes))).toBeGreaterThanOrEqual(
      Math.min(...pitches(notesOf("hello"))),
    );
  });

  it("says no with two quacks that fall", () => {
    const [first, second] = notesOf("no");
    expect(notesOf("no")).toHaveLength(2);
    expect(first?.to).toBeLessThan(first?.from ?? 0);
    expect(second?.from).toBeLessThan(first?.to ?? 0);
    expect(second?.to).toBeLessThan(second?.from ?? 0);
  });

  it("squeaks when scared: the shortest and highest quack", () => {
    const squeak = notesOf("scared");
    for (const quack of QUACKS.filter((q) => q !== "scared")) {
      expect(end(squeak)).toBeLessThan(end(notesOf(quack)));
      expect(Math.min(...pitches(squeak))).toBeGreaterThan(Math.max(...pitches(notesOf(quack))));
    }
  });

  it("wonders with the softest, lowest quack when curious", () => {
    const [soft] = notesOf("curious");
    for (const quack of QUACKS.filter((q) => q !== "curious")) {
      for (const note of notesOf(quack)) {
        expect(soft?.volume).toBeLessThan(note.volume);
        expect(Math.max(soft?.from ?? Infinity, soft?.to ?? Infinity)).toBeLessThan(
          Math.min(note.from, note.to),
        );
      }
    }
  });

  it("keeps every note audible and short", () => {
    for (const note of SOUNDS.flatMap(notesOf)) {
      expect(note.volume).toBeGreaterThan(0);
      expect(note.volume).toBeLessThanOrEqual(1);
      expect(note.at + note.seconds).toBeLessThan(1);
    }
  });
});

describe("shakeHead", () => {
  const samples = Array.from({ length: 121 }, (_, index) => (index / 120) * SHAKE_SECONDS);

  it("holds the head still before and after the shake", () => {
    for (const elapsed of [-1, 0, SHAKE_SECONDS, SHAKE_SECONDS + 1]) {
      expect(shakeHead(elapsed)).toBe(0);
    }
  });

  it("lasts as long as the no quack it goes with", () => {
    expect(SHAKE_SECONDS).toBeGreaterThanOrEqual(end(notesOf("no")));
    expect(SHAKE_SECONDS).toBeLessThan(end(notesOf("no")) + 0.5);
  });

  it("turns the head from side to side a few times", () => {
    const sides = samples.map((elapsed) => Math.sign(shakeHead(elapsed))).filter((s) => s !== 0);
    const turns = sides.slice(1).filter((side, index) => side !== sides[index]).length;
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(turns).toBeLessThanOrEqual(6);
  });

  it("turns the head clearly but not right round", () => {
    const widest = Math.max(...samples.map((elapsed) => Math.abs(shakeHead(elapsed))));
    expect(widest).toBeGreaterThan(0.2);
    expect(widest).toBeLessThan(0.8);
  });
});
