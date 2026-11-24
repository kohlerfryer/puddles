import { describe, expect, it } from "vitest";

import type { Intent, Step } from "../../core/contracts";
import { type Limits, violation } from "./rules";

const LIMITS: Limits = {
  skillSeconds: new Map([
    ["look_at", 1],
    ["dance", 2],
    ["ask_for", 2],
    ["nap", 5],
  ]),
  maxScaredSteps: 1,
};

const routine = (...steps: Step[]): Intent => ({
  brain: "test",
  priority: 1,
  kind: "routine",
  steps: steps as [Step, ...Step[]],
  why: "test",
});

const look = (extra: Partial<Step> = {}): Step => ({
  skill: "look_at",
  args: { target: "camera" },
  ...extra,
});

describe("violation", () => {
  it.each<[string, Intent]>([
    ["a short kind line", routine(look({ say: "Ooh, a banana! Yum yum!" }))],
    ["a vetted color request", routine({ skill: "ask_for", args: { request: "red" } })],
    ["a vetted gesture request", routine({ skill: "ask_for", args: { request: "wave" } })],
    ["one scared step", routine(look({ mood: "scared" }), look())],
    [
      "exactly twenty seconds",
      routine(...Array.from({ length: 4 }, () => ({ skill: "nap", args: {} }))),
    ],
    [
      "a behavior",
      {
        brain: "b",
        priority: 0,
        kind: "behavior",
        behavior: { id: "copy_me", params: {} },
        why: "w",
      },
    ],
    ["a blocked word inside another word", routine(look({ say: "What a skilled duck!" }))],
  ])("passes %s", (_name, intent) => {
    expect(violation(intent, LIMITS)).toBeNull();
  });

  it.each<[string, Intent, string]>([
    [
      "a 13-word line",
      routine(
        look({ say: "one two three four five six seven eight nine ten eleven twelve thirteen" }),
      ),
      "line_length",
    ],
    ["an unkind word", routine(look({ say: "You are STUPID." })), "blocklist"],
    [
      "a request for personal information",
      routine(look({ say: "What's your name?" })),
      "blocklist",
    ],
    ["a physical risk", routine(look({ say: "Let's go outside!" })), "blocklist"],
    ["a blocked thought icon", routine(look({ think: "knife" })), "blocklist"],
    ["a blocked arg", routine({ skill: "look_at", args: { target: "the_stove" } }), "blocklist"],
    [
      "a blocked behavior param",
      {
        brain: "b",
        priority: 0,
        kind: "behavior",
        behavior: { id: "x", params: { line: "climb up" } },
        why: "w",
      },
      "blocklist",
    ],
    ["an unvetted request", routine({ skill: "ask_for", args: { request: "rock" } }), "request"],
    ["a request without an id", routine({ skill: "ask_for", args: { request: 3 } }), "request"],
    ["too many scared steps", routine(look({ mood: "scared" }), look({ mood: "scared" })), "scary"],
    ["an unknown skill", routine({ skill: "fly", args: {} }), "unknown_skill"],
    [
      "a routine over twenty seconds",
      routine(...Array.from({ length: 5 }, () => ({ skill: "nap", args: {} }))),
      "routine_duration",
    ],
  ])("rejects %s", (_name, intent, rule) => {
    expect(violation(intent, LIMITS)?.rule).toBe(rule);
  });

  it("gives a reason that names what broke the rule", () => {
    expect(violation(routine(look({ say: "you are dumb" })), LIMITS)?.reason).toContain("dumb");
  });
});
