import { describe, expect, it } from "vitest";

import schema from "../../../shared/reaction.schema.json";
import { DEMO_SCRIPT, DEMO_TRAITS } from "./demo";
import { DEV_PRESETS, parsePastedReaction, TRAIT_CHOICES } from "./devPanel";
import { safeScript } from "./validator";

const VALID = {
  holding: true,
  object: "banana",
  traits: { size: "small", weight: "light", shape: "long", edible: true },
  script: [
    { do: "sniff", target: "object", mood: "curious" },
    { do: "eat", target: "object", mood: "happy", say: "Yum!" },
  ],
};

describe("TRAIT_CHOICES", () => {
  it("offers every size, weight and shape the schema allows", () => {
    expect(TRAIT_CHOICES.size).toEqual(schema.$defs.Size.enum);
    expect(TRAIT_CHOICES.weight).toEqual(schema.$defs.Weight.enum);
    expect(TRAIT_CHOICES.shape).toEqual(schema.$defs.Shape.enum);
  });
});

describe("DEV_PRESETS", () => {
  it("has unique names", () => {
    const names = DEV_PRESETS.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("starts with the six-verb demo", () => {
    expect(DEV_PRESETS[0]).toEqual({ name: "demo", traits: DEMO_TRAITS, script: DEMO_SCRIPT });
  });

  it.each(DEV_PRESETS.slice(1).map((preset) => [preset.name, preset] as const))(
    "%s plays unchanged through the validator",
    (name, { traits, script }) => {
      const raw = JSON.stringify({ holding: true, object: name, traits, script });
      expect(safeScript(raw)).toEqual(script);
    },
  );
});

describe("parsePastedReaction", () => {
  it("returns the traits and the validated script of a valid reaction", () => {
    expect(parsePastedReaction(JSON.stringify(VALID))).toEqual({
      ok: true,
      traits: VALID.traits,
      script: VALID.script,
    });
  });

  it("plays what the validator would, swapping verbs the object can't support", () => {
    const big = { ...VALID, traits: { ...VALID.traits, size: "big" } };
    const result = parsePastedReaction(JSON.stringify(big));
    expect(result.ok && result.script.map((step) => step.do)).toEqual(["sniff", "peck"]);
  });

  it("rejects text that isn't JSON", () => {
    const result = parsePastedReaction("{ not json");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/^Not JSON: /);
  });

  it("lists where a reaction breaks the schema", () => {
    const broken = { ...VALID, script: [{ do: "moonwalk", mood: "happy" }] };
    const result = parsePastedReaction(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual(
      expect.arrayContaining([
        "/script must NOT have fewer than 2 items",
        "/script/0/do must be equal to one of the allowed values",
      ]),
    );
  });

  it("names the root when the whole value is wrong", () => {
    const result = parsePastedReaction("[]");
    expect(!result.ok && result.errors).toEqual(["(root) must be object"]);
  });
});
