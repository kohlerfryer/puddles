import { describe, expect, it } from "vitest";

import { isReaction, isScript } from "./reactionSchema";

const toyCat = {
  holding: true,
  object: "toy cat",
  traits: { size: "small", weight: "light", shape: "other", edible: false },
  script: [
    { do: "look_at", target: "object", mood: "curious" },
    { do: "freeze", mood: "scared", say: "Is that... a CAT?" },
    { do: "run_away", target: "object", mood: "scared" },
    { do: "hide_behind", target: "reeds", mood: "scared", say: "NOPE. Nope nope nope." },
  ],
};

describe("reaction schema", () => {
  it("accepts the PRD's toy cat example", () => {
    expect(isReaction(toyCat)).toBe(true);
  });

  it("rejects an unknown verb", () => {
    const script = [{ do: "teleport", mood: "silly" }, toyCat.script[0]];
    expect(isReaction({ ...toyCat, script })).toBe(false);
  });

  it("rejects scripts outside 2 to 5 steps", () => {
    expect(isReaction({ ...toyCat, script: [toyCat.script[0]] })).toBe(false);
    expect(isReaction({ ...toyCat, script: [...toyCat.script, ...toyCat.script] })).toBe(false);
  });

  it("rejects an empty object name", () => {
    expect(isReaction({ ...toyCat, object: "" })).toBe(false);
  });

  it("rejects extra fields and missing traits", () => {
    expect(isReaction({ ...toyCat, x: 1 })).toBe(false);
    expect(isReaction({ ...toyCat, traits: { size: "small" } })).toBe(false);
  });
});

describe("script schema", () => {
  it("accepts one or more reaction steps and nothing else", () => {
    expect(isScript(toyCat.script.slice(0, 1))).toBe(true);
    expect(isScript([])).toBe(false);
    expect(isScript([{ do: "teleport", mood: "silly" }])).toBe(false);
    expect(isScript("look_at")).toBe(false);
  });
});
