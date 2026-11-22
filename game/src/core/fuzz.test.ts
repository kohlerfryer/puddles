import { describe, expect, it } from "vitest";

import schema from "../../../shared/reaction.schema.json";
import { type Random, seededRandom } from "./random";
import { createRunner } from "./runner";
import { DEFAULT_SCRIPT, MAX_SECONDS, safeScript } from "./validator";

const RUNS = 5000;
const SEED = 39;
const CAP_MS = MAX_SECONDS * 1000;
const { Verb, Target, Mood, Size, Weight, Shape } = schema.$defs;

const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;

const between = (random: Random, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

function words(random: Random): string {
  return Array.from({ length: between(random, 0, 30) }, () =>
    pick(random, ["quack", "hi", " "]),
  ).join(pick(random, [" ", "\n", "  "]));
}

function validStep(random: Random): Record<string, unknown> {
  const step: Record<string, unknown> = {
    do: pick(random, Verb.enum),
    mood: pick(random, Mood.enum),
  };
  if (random() < 0.5) step.target = pick(random, Target.enum);
  if (random() < 0.5) step.say = words(random);
  return step;
}

function validReaction(random: Random): Record<string, unknown> {
  return {
    holding: random() < 0.5,
    object: pick(random, ["ball", "banana", "a very long name for a sock"]),
    traits: {
      size: pick(random, Size.enum),
      weight: pick(random, Weight.enum),
      shape: pick(random, Shape.enum),
      edible: random() < 0.5,
    },
    script: Array.from({ length: between(random, 2, 5) }, () => validStep(random)),
  };
}

const JUNK: readonly unknown[] = [null, 0, -1, "", "fly", true, [], {}, 1e308, "🦆"];

/** Breaks one part of a valid reaction, the way a model's near-miss output might. */
const BREAKS: readonly ((data: Record<string, unknown>, random: Random) => unknown)[] = [
  (data, random) => ({ ...data, [pick(random, Object.keys(data))]: pick(random, JUNK) }),
  (data, random) => ({ ...data, traits: { ...(data.traits as object), size: pick(random, JUNK) } }),
  (data, random) => ({
    ...data,
    script: Array.from({ length: between(random, 0, 12) }, () => validStep(random)),
  }),
  (data, random) => ({
    ...data,
    script: [...(data.script as unknown[]), { do: pick(random, JUNK), mood: "happy" }],
  }),
  (data, random) => ({
    ...data,
    script: (data.script as unknown[]).map((step) => (random() < 0.3 ? pick(random, JUNK) : step)),
  }),
  (data, random) => ({ ...data, script: pick(random, JUNK) }),
  (_, random) => pick(random, JUNK),
];

function rawReaction(random: Random): string {
  const data = validReaction(random);
  if (random() < 0.3) return JSON.stringify(data);
  const raw = JSON.stringify(pick(random, BREAKS)(data, random));
  return random() < 0.2 ? raw.slice(0, between(random, 0, raw.length)) : raw;
}

/** Plays the safe script for `raw` with uneven frames and returns when the runner went idle, or Infinity. */
function playUntilIdle(raw: string, random: Random): number {
  const runner = createRunner();
  runner.play(safeScript(raw), 0);
  for (let now = 0; now <= CAP_MS; now += between(random, 1, 100)) {
    if (runner.update(now).state === "idle") return now;
  }
  return runner.update(CAP_MS).state === "idle" ? CAP_MS : Infinity;
}

describe("script fuzz", () => {
  it(`plays ${String(RUNS)} random scripts to idle within the time cap (seed ${String(SEED)})`, () => {
    const random = seededRandom(SEED);
    for (let run = 0; run < RUNS; run++) {
      const raw = rawReaction(random);
      expect(playUntilIdle(raw, random), `run ${String(run)}: ${raw}`).toBeLessThanOrEqual(CAP_MS);
    }
  });

  it("generates both scripts that pass and scripts that fall back", () => {
    const random = seededRandom(SEED);
    const raws = Array.from({ length: 200 }, () => rawReaction(random));
    const fallback = JSON.stringify(DEFAULT_SCRIPT);
    const fallbacks = raws.filter((raw) => JSON.stringify(safeScript(raw)) === fallback);
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.length).toBeLessThan(raws.length);
  });
});
