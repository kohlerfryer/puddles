import { describe, expect, it } from "vitest";

import reactionSchema from "../../../shared/reaction.schema.json";
import type { Contracts, Manifest } from "./contracts";
import { contractValidators } from "./contractsSchema";

const common = (
  id: string,
  name: string,
): Pick<Manifest, "id" | "contract" | "name" | "authors" | "license"> => ({
  id,
  contract: "1",
  name,
  authors: ["Puddles"],
  license: "MIT",
});

const valid: Contracts = {
  event: { t: 1033.3, type: "observation.smile", source: "smile", data: { level: 0.6 } },
  observation: {
    kid: {
      present: true,
      pose: { x: 0.4, y: 0.5 },
      gesture: "wave",
      attention: 0.9,
      distance: 1.8,
    },
    held_object: { id: "banana", confidence: 0.8 },
    smile: { level: 0.6, delta: 0.2 },
    laugh: false,
    speech: { active: true, command: "jump" },
    world: { near: [{ id: "reeds", affords: ["hide_in"] }] },
    self: { mood: "curious", needs: { rest: 0.2 }, doing: "idle" },
  },
  intent: {
    brain: "object-matcher",
    priority: 2,
    kind: "routine",
    steps: [
      { skill: "look_at", args: { target: "object" }, mood: "curious", think: "cat" },
      { skill: "run_away", args: { target: "object" }, say: "NOPE." },
    ],
    why: "a toy cat was held up",
    features: ["slapstick", "uses_object"],
  },
  step: { skill: "wear", args: { target: "hat", seconds: 2, wobble: true } },
  outcome: { step: 1, status: "failed", reason: "dropped", effects: { hat: "floor" } },
  reward: {
    bit_id: "wear-hat",
    smile_delta: 0.35,
    laugh: true,
    talk: false,
    attention: 0.8,
    window_ms: 4000,
  },
  manifest: {
    ...common("wear", "Wear"),
    kind: "skill",
    tags: ["silly", "uses_object"],
    params: { target: "prop" },
    needs: ["target.affords:wear", "target.size<=small"],
    duration_s: 1.5,
    energy: -0.02,
    outcomes: ["done", "dropped"],
  },
};

const manifests: Manifest[] = [
  {
    ...common("smile", "Smile"),
    kind: "sense",
    inputs: ["camera"],
    emits: ["observation.smile"],
    budget_ms: 4,
  },
  {
    ...common("reflexes", "Reflexes"),
    kind: "brain",
    cadence: "tick",
    autonomy: 1,
    latency_budget_ms: 2,
    intents: ["routine", "behavior"],
  },
  {
    ...common("object-matcher", "Object matcher"),
    kind: "brain",
    cadence: { on: "observation.held_object" },
    autonomy: 1,
    latency_budget_ms: 3000,
    intents: ["routine"],
  },
  {
    ...common("planner", "Planner"),
    kind: "brain",
    cadence: { every_s: 20 },
    autonomy: 3,
    latency_budget_ms: 8000,
    intents: ["routine", "goal"],
  },
  { ...common("christmas-tree", "Christmas tree"), kind: "content", type: "prop" },
];

const invalid: [keyof Contracts, unknown][] = [
  ["event", { ...valid.event, type: "chat.hello" }],
  ["event", { ...valid.event, type: "observation" }],
  ["event", { ...valid.event, t: -1 }],
  ["observation", { ...valid.observation, smile: { level: 1.5, delta: 0 } }],
  ["observation", { ...valid.observation, photo: "data:image/jpeg;base64,..." }],
  ["intent", { ...valid.intent, kind: "whim" }],
  ["intent", { ...valid.intent, steps: [] }],
  ["intent", { ...valid.intent, steps: Array<unknown>(9).fill(valid.step) }],
  ["step", { skill: "wear" }],
  ["step", { ...valid.step, mood: "angry" }],
  ["step", { ...valid.step, args: { target: { nested: true } } }],
  ["outcome", { ...valid.outcome, status: "dropped" }],
  ["reward", { ...valid.reward, smile_delta: 2 }],
  ["reward", { ...valid.reward, window_ms: 0 }],
  ["manifest", { ...valid.manifest, kind: "gadget" }],
  ["manifest", { ...valid.manifest, emits: ["observation.smile"] }],
  ["manifest", { ...manifests[0], emits: ["chat.hi"] }],
  ["manifest", { ...manifests[1], cadence: "sometimes" }],
  ["manifest", { ...manifests[4], type: "weather" }],
];

describe("contract schemas", () => {
  it.each(Object.entries(valid))("accepts a valid %s", (contract, example) => {
    expect(contractValidators[contract as keyof Contracts](example)).toBe(true);
  });

  it("accepts one of each contract in the index", () => {
    expect(contractValidators.contracts(valid)).toBe(true);
  });

  it.each(manifests)("accepts the $kind manifest $id", (manifest) => {
    expect(contractValidators.manifest(manifest)).toBe(true);
  });

  it.each(invalid)("rejects an invalid %s %#", (contract, example) => {
    expect(contractValidators[contract](example)).toBe(false);
  });

  it("accepts every reaction verb as a step's skill", () => {
    for (const verb of reactionSchema.$defs.Verb.enum) {
      expect(contractValidators.step({ skill: verb, args: { target: "object" } })).toBe(true);
    }
  });
});
