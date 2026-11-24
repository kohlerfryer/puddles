import { describe, expect, it } from "vitest";

import blocklist from "../../../../shared/blocklist.json";
import requests from "../../../../shared/requests.json";
import reaction from "../../../../shared/reaction.schema.json";
import { contractValidators } from "../../core/contractsSchema";
import { type Random, seededRandom } from "../../core/random";
import { createGuardian, type GuardianSettings } from "./guardian";
import { violation } from "./rules";

const RUNS = 3000;
const SEED = 115;
const SETTINGS: GuardianSettings = {
  skillSeconds: new Map([
    ["look_at", 1],
    ["nap", 5],
    ["dance", 2],
    ["ask_for", 2],
  ]),
  maxScaredSteps: 1,
  intentsPerSecond: 3,
  modelCallsPerMinute: 10,
  sessionSoftLimitMs: 120_000,
};

const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;

const WORDS = ["quack", "hi", "banana", "!", ...blocklist.unkind, ...blocklist.physical_risk];
const REQUESTS = [...requests.color, ...requests.gesture, "rock", "phone", 7];
const SKILLS = ["look_at", "nap", "dance", "ask_for", "fly"];
const JUNK: readonly unknown[] = [null, 0, -1, "", "Dance", true, [], {}, "🦆"];

const line = (random: Random): string =>
  Array.from({ length: Math.floor(random() * 16) }, () => pick(random, WORDS)).join(" ");

function step(random: Random): Record<string, unknown> {
  const skill = pick(random, SKILLS);
  const value: Record<string, unknown> = {
    skill,
    args: skill === "ask_for" ? { request: pick(random, REQUESTS) } : { target: line(random) },
  };
  if (random() < 0.5) value.say = line(random);
  if (random() < 0.3) value.mood = pick(random, reaction.$defs.Mood.enum);
  if (random() < 0.1) value.think = line(random);
  return value;
}

function intent(random: Random): unknown {
  const value: Record<string, unknown> = {
    brain: pick(random, ["bandit", "planner", "reflexes"]),
    priority: Math.floor(random() * 5),
    kind: pick(random, ["routine", "behavior", "goal"]),
    steps: Array.from({ length: 1 + Math.floor(random() * 9) }, () => step(random)),
    why: "fuzz",
  };
  if (random() < 0.2) value[pick(random, Object.keys(value))] = pick(random, JUNK);
  return random() < 0.05 ? pick(random, JUNK) : value;
}

describe("guardian fuzz", () => {
  it("never lets an invalid or unsafe intent through", () => {
    const random = seededRandom(SEED);
    const guardian = createGuardian(SETTINGS);
    const seen = new Set<string>();
    let t = 0;
    for (let run = 0; run < RUNS; run += 1) {
      t += Math.floor(random() * 400);
      const verdict = guardian.check(intent(random), t);
      seen.add(verdict.event.type);
      expect(contractValidators.event(verdict.event)).toBe(true);
      if (verdict.intent === null) continue;
      expect(contractValidators.intent(verdict.intent)).toBe(true);
      expect(violation(verdict.intent, SETTINGS)).toBeNull();
    }
    expect(seen).toEqual(new Set(["guardian.passed", "guardian.rejected", "guardian.break"]));
  });
});
