/**
 * Showcase scenario "Bring me something red" (spec §16), as far as M3 goes: the kid holds a red
 * thing up to a recorded camera, the object matcher's reply comes back with a red prop for it, and
 * Puddles plays his reaction to it. Asking for the colour, the match verdict and the yes/no quacks
 * need the `ask_for` skill (#82), so they aren't checked.
 */

import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../core/contracts";
import { LANDMARK_COUNT, type PoseFrame } from "../core/poseFixture";
import { safeReaction } from "../core/validator";
import type { HandsSample } from "../plugins/sense/recorded/recording";
import { play, said } from "./scenario";

const SAMPLE_MS = 66;
const LEFT_ELBOW = 13;
const LEFT_WRIST = 15;
const RED = "#d8312c";
const HAND = [
  { x: 0.4, y: 0.2 },
  { x: 0.5, y: 0.2 },
  { x: 0.45, y: 0.32 },
];

/** What the server answers for a photo of a red balloon: not a library prop, so a red ball. */
const REPLY = safeReaction(
  JSON.stringify({
    holding: true,
    object: "red balloon",
    traits: { size: "small", weight: "light", shape: "round", edible: false },
    script: [
      { do: "look_at", target: "object", mood: "curious", say: "Ooh, red!" },
      { do: "push", target: "object", mood: "silly", say: "Boop!" },
    ],
    prop: { id: "other", archetype: "ball", color: RED },
  }),
);

/** The kid stands with the left wrist above the elbow, holding up a still hand, for `ms`. */
function holdingUp(ms: number): { pose: PoseFrame[]; hands: HandsSample[] } {
  const times = Array.from({ length: Math.floor(ms / SAMPLE_MS) }, (_, i) => i * SAMPLE_MS);
  const pose = times.map((t) => ({
    t,
    landmarks: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
      x: 0.5,
      y: { [LEFT_ELBOW]: 0.5, [LEFT_WRIST]: 0.3 }[i] ?? 0.5,
      z: 0,
      visibility: 1,
    })),
  }));
  return { pose, hands: times.map((t) => ({ t, hands: [HAND] })) };
}

function session(): KernelEvent[] {
  const recording = { ...holdingUp(6000), smile: [], voice: [] };
  return play({ recording, seed: 1, reply: REPLY });
}

describe("Bring me something red", () => {
  const events = session();
  const ofType = (type: string) => events.filter((e) => e.type === type);

  it("takes one photo of the thing the kid holds up", () => {
    expect(ofType("observation.held")).toHaveLength(1);
  });

  it("brings it through the window as a red prop", () => {
    const [seen] = ofType("observation.object");
    expect(seen?.data.reaction).toMatchObject({
      prop: { id: "other", archetype: "ball", color: RED },
    });
  });

  it("reacts to it with the reply's script, past the guardian", () => {
    const matcher = said(events).filter((line) => line.startsWith("object_matcher:"));
    expect(matcher).toEqual(["object_matcher: Ooh, red!", "object_matcher: Boop!"]);
    const verdicts = events.filter((e) => e.source === "guardian").map((e) => e.type);
    expect(new Set(verdicts)).toEqual(new Set(["guardian.passed"]));
    const proposed = ofType("intent.proposed").find((e) => e.source === "object_matcher");
    expect(proposed?.data.features).toEqual(["uses_object", "prop:other", "archetype:ball"]);
  });
});
