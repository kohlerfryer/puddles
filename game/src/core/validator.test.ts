import { describe, expect, it } from "vitest";

import type { Step, Traits, Verb } from "./reaction";
import { DEFAULT_SCRIPT, DEFAULT_TRAITS, safeReaction, safeScript } from "./validator";

const smallSnack: Traits = { size: "small", weight: "light", shape: "round", edible: true };

function reaction(script: unknown[], traits: Traits = smallSnack): string {
  return JSON.stringify({ holding: true, object: "thing", traits, script });
}

function verbs(script: Step[]): Verb[] {
  return script.map((step) => step.do);
}

describe("default script", () => {
  it("sniffs, then looks at the camera puzzled and asks what it is", () => {
    expect(DEFAULT_SCRIPT).toEqual([
      { do: "sniff", target: "object", mood: "curious" },
      { do: "look_at", target: "camera", mood: "curious", say: "Hmm... what IS that?" },
    ]);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a non-object", "42"],
    ["missing traits", JSON.stringify({ holding: true, object: "x", script: [] })],
    [
      "a bad mood",
      reaction([
        { do: "sniff", mood: "angry" },
        { do: "flap", mood: "happy" },
      ]),
    ],
    ["a step without a verb", reaction([{ mood: "happy" }, { do: "flap", mood: "happy" }])],
    ["a single step", reaction([{ do: "flap", mood: "happy" }])],
    ["a script that is not a list", reaction(["flap"]).replace('["flap"]', '"flap"')],
  ])("is played for %s", (_, raw) => {
    expect(safeScript(raw)).toEqual(DEFAULT_SCRIPT);
  });
});

describe("condition swaps", () => {
  it.each<[string, Verb, Traits, Verb]>([
    ["eat a tiny edible", "eat", { ...smallSnack, size: "tiny" }, "eat"],
    ["eat a small edible", "eat", smallSnack, "eat"],
    ["eat a medium edible", "eat", { ...smallSnack, size: "medium" }, "peck"],
    ["eat a small inedible", "eat", { ...smallSnack, edible: false }, "peck"],
    ["sit on a medium flat", "sit_on", { ...smallSnack, size: "medium", shape: "flat" }, "sit_on"],
    ["sit on a big other", "sit_on", { ...smallSnack, size: "big", shape: "other" }, "sit_on"],
    ["sit on a big round", "sit_on", { ...smallSnack, size: "big", shape: "round" }, "circle"],
    ["sit on a big long", "sit_on", { ...smallSnack, size: "big", shape: "long" }, "circle"],
    ["sit on a small flat", "sit_on", { ...smallSnack, shape: "flat" }, "circle"],
    ["wear a tiny", "wear", { ...smallSnack, size: "tiny" }, "wear"],
    ["wear a small", "wear", smallSnack, "wear"],
    ["wear a medium", "wear", { ...smallSnack, size: "medium" }, "push"],
    ["wear a big", "wear", { ...smallSnack, size: "big" }, "push"],
  ])("%s", (_, verb, traits, expected) => {
    const script = safeScript(
      reaction(
        [
          { do: verb, mood: "happy" },
          { do: "flap", mood: "happy" },
        ],
        traits,
      ),
    );
    expect(verbs(script)).toEqual([expected, "flap"]);
  });

  it("keeps the rest of the step when swapping", () => {
    const step = { do: "eat", target: "object", mood: "proud", say: "Yum" };
    const [first] = safeScript(
      reaction([step, { do: "flap", mood: "happy" }], { ...smallSnack, size: "big" }),
    );
    expect(first).toEqual({ ...step, do: "peck" });
  });
});

describe("caps", () => {
  it("drops steps with unknown verbs", () => {
    const script = [
      { do: "teleport", mood: "silly" },
      { do: "sniff", mood: "curious" },
      { do: "moonwalk", mood: "silly" },
      { do: "flap", mood: "happy" },
    ];
    expect(verbs(safeScript(reaction(script)))).toEqual(["sniff", "flap"]);
  });

  it("falls back when too few known verbs remain", () => {
    const script = [
      { do: "teleport", mood: "silly" },
      { do: "sniff", mood: "curious" },
    ];
    expect(safeScript(reaction(script))).toEqual(DEFAULT_SCRIPT);
  });

  it("keeps at most 5 steps", () => {
    const script = Array.from({ length: 7 }, () => ({ do: "flap", mood: "happy" }));
    expect(safeScript(reaction(script))).toHaveLength(5);
  });

  it.each<[string, Verb[], Verb[]]>([
    [
      "keeps a script that fits in 6 s",
      ["sniff", "look_at", "flap", "freeze", "peck"],
      ["sniff", "look_at", "flap", "freeze", "peck"],
    ],
    ["cuts steps past 6 s", ["dance", "circle", "dance", "flap"], ["dance", "circle", "dance"]],
    [
      "stops at the first step that overruns",
      ["flap", "dance", "dance", "circle", "flap"],
      ["flap", "dance", "dance"],
    ],
  ])("%s", (_, input, expected) => {
    const script = safeScript(reaction(input.map((verb) => ({ do: verb, mood: "happy" }))));
    expect(verbs(script)).toEqual(expected);
  });

  it.each([
    ["leaves short lines alone", "Is that... a CAT?", "Is that... a CAT?"],
    [
      "leaves exactly 12 words alone",
      "one two three four five six seven eight nine ten eleven twelve",
      "one two three four five six seven eight nine ten eleven twelve",
    ],
    [
      "cuts to 12 words",
      "one two three four five six seven eight nine ten eleven twelve thirteen",
      "one two three four five six seven eight nine ten eleven twelve",
    ],
    ["collapses extra spaces", "  so   many\nspaces  ", "so many spaces"],
  ])("say %s", (_, say, expected) => {
    const [first] = safeScript(
      reaction([
        { do: "flap", mood: "happy", say },
        { do: "flap", mood: "happy" },
      ]),
    );
    expect(first?.say).toBe(expected);
  });
});

describe("safeReaction", () => {
  it("keeps a valid reply's traits with its safe script", () => {
    const raw = reaction([
      { do: "sniff", target: "object", mood: "curious" },
      { do: "eat", target: "object", mood: "happy" },
    ]);
    expect(safeReaction(raw)).toEqual({ valid: true, traits: smallSnack, script: safeScript(raw) });
  });

  it("falls back to default traits and the confused script for an invalid reply", () => {
    expect(safeReaction("{not json")).toEqual({
      valid: false,
      traits: DEFAULT_TRAITS,
      script: DEFAULT_SCRIPT,
    });
  });
});
