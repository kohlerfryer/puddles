import { describe, expect, it } from "vitest";

import schema from "../../../../shared/reaction.schema.json";
import { VERB_SECONDS } from "../../core/validator";
import { createGuardian } from "../../kernel/guardian/guardian";
import { MAX_SCARED_STEPS } from "../../kernel/guardian/rules";
import { checkPlugin } from "../../kernel/harness";
import { SKILLS } from "./index";

/** The bandit's comedy features (docs/spec/m3-kernel.md §12): the only tags a skill may carry. */
const COMEDY_FEATURES = new Set([
  "slapstick",
  "surprise",
  "callback",
  "uses_object",
  "copies_kid",
  "gross",
  "scary_light",
  "musical",
  "sleepy",
]);

/** Expressive skills a reaction can't name: brains and the guardian call them in intents. */
const EXPRESSIVE = ["nap"];

const ids = SKILLS.map(({ manifest }) => manifest.id);
const verbs = SKILLS.filter(({ manifest }) => !EXPRESSIVE.includes(manifest.id));

describe("skill plugins", () => {
  it("has one skill for each verb a reaction can use, plus the expressive ones", () => {
    expect([...ids].sort()).toEqual([...schema.$defs.Verb.enum, ...EXPRESSIVE].sort());
  });

  it("installs every skill the guardian's own intents use", () => {
    const skillSeconds = new Map(SKILLS.map(({ manifest }) => [manifest.id, manifest.duration_s]));
    expect(() =>
      createGuardian({
        skillSeconds,
        maxScaredSteps: MAX_SCARED_STEPS,
        intentsPerSecond: 2,
        modelCallsPerMinute: 6,
        sessionSoftLimitMs: 20 * 60_000,
      }),
    ).not.toThrow();
  });

  it("naps for a few seconds with nothing to target, then ends with one outcome", () => {
    const nap = SKILLS.find(({ manifest }) => manifest.id === "nap");
    expect(nap?.manifest).toMatchObject({ params: {}, needs: [], tags: ["sleepy"] });
    expect(nap?.manifest.duration_s).toBeGreaterThanOrEqual(3);
  });

  it.each(SKILLS.map((skill) => [skill.manifest.id, skill] as const))(
    "%s passes the plugin harness",
    (_id, skill) => {
      expect(checkPlugin(() => skill, { args: { target: "object" }, now: () => 0 })).toEqual([]);
    },
  );

  it("tags each skill with comedy features only", () => {
    const tags = SKILLS.flatMap(({ manifest }) => manifest.tags ?? []);
    expect(tags.filter((tag) => !COMEDY_FEATURES.has(tag))).toEqual([]);
    expect(new Set(tags).size).toBeGreaterThan(4);
  });

  it("states needs as a target trait and the values it may have", () => {
    const traits = Object.keys(schema.$defs.Traits.properties).join("|");
    const need = new RegExp(`^target\\.(${traits}):[a-z]+(\\|[a-z]+)*$`);
    const needs = SKILLS.flatMap(({ manifest }) => manifest.needs);
    expect(needs.filter((n) => !need.test(n))).toEqual([]);
    expect(needs).toContain("target.size:tiny|small");
  });

  it("times each verb by its manifest's duration", () => {
    for (const { manifest } of verbs) {
      expect(VERB_SECONDS[manifest.id as keyof typeof VERB_SECONDS]).toBe(manifest.duration_s);
    }
  });
});
