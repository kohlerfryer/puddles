import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../../../core/contracts";
import { seededRandom } from "../../../core/random";
import type { Step } from "../../../core/reaction";
import { safeReaction } from "../../../core/validator";
import { checkPlugin } from "../../../kernel/harness";
import { matcherBrain, skillStep } from "./index";

const SCRIPT: Step[] = [
  { do: "look_at", target: "object", mood: "curious", say: "Who is that?" },
  { do: "dance", mood: "happy" },
];

const object = (data: Record<string, unknown>): KernelEvent => ({
  t: 0,
  type: "observation.object",
  source: "held_object",
  data,
});

const seen = (script: unknown) => object({ reaction: { valid: true, script } });

function decide(events: KernelEvent[]) {
  const { decide: brain } = matcherBrain().code ?? {};
  return brain?.({ t: 0, events, random: seededRandom(1) }) ?? null;
}

describe("the object matcher brain", () => {
  it("turns the reaction to a held-up object into a routine of the same steps", () => {
    expect(decide([seen(SCRIPT)])).toEqual({
      brain: "object_matcher",
      priority: 3,
      kind: "routine",
      steps: [
        { skill: "look_at", args: { target: "object" }, mood: "curious", say: "Who is that?" },
        { skill: "dance", args: {}, mood: "happy" },
      ],
      why: "react to the object the kid held up",
      features: ["uses_object"],
    });
  });

  it("maps a reaction step's verb to the skill and its target to args.target", () => {
    expect(skillStep({ do: "eat", target: "object", mood: "silly" })).toEqual({
      skill: "eat",
      args: { target: "object" },
      mood: "silly",
    });
  });

  it("plays the confused reaction the game falls back on", () => {
    const { script } = safeReaction("not json");
    expect(decide([seen(script)])?.steps).toEqual(script.map(skillStep));
  });

  it("reacts only to the latest object since it last ran", () => {
    const later: Step[] = [{ do: "flap", mood: "silly" }];
    expect(decide([seen(SCRIPT), seen(later)])?.steps).toEqual([
      { skill: "flap", args: {}, mood: "silly" },
    ]);
  });

  it("ignores other events and replies without a playable script", () => {
    expect(decide([])).toBeNull();
    expect(decide([{ ...seen(SCRIPT), type: "observation.held" }])).toBeNull();
    expect(decide([object({})])).toBeNull();
    expect(decide([object({ reaction: "banana" })])).toBeNull();
    expect(decide([seen([])])).toBeNull();
    expect(decide([seen([{ do: "teleport", mood: "happy" }])])).toBeNull();
  });

  it("passes the plugin harness", () => {
    const inputs = (t: number) =>
      t % 3000 === 0
        ? [{ type: "observation.object", data: { reaction: { script: SCRIPT } } }]
        : [];
    const skills = { look_at: 1, dance: 2 };
    expect(checkPlugin(matcherBrain, { inputs, skills, now: () => 0 })).toEqual([]);
  });
});
