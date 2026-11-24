/**
 * A recorded session of objects held up to the camera, replayed against the matcher brain behind
 * the live guardian: render plays the same reaction steps the game played before the port.
 */

import { describe, expect, it } from "vitest";

import { played, startedStep } from "../../../core/bridge";
import type { KernelEvent } from "../../../core/contracts";
import { safeReaction } from "../../../core/validator";
import { liveGuardian } from "../../../kernel/guardian/live";
import { replay } from "../../../kernel/replay";
import { SKILLS } from "../../skill";
import { matcherBrain } from "./index";

/** The server's fake model's reply, which it gives for any photo. */
const DUCK = safeReaction(
  JSON.stringify({
    holding: true,
    object: "rubber duck",
    traits: { size: "small", weight: "light", shape: "round", edible: false },
    script: [
      { do: "look_at", target: "object", mood: "curious", say: "Who is that?" },
      { do: "dance", target: "none", mood: "happy", say: "A friend!" },
    ],
  }),
);
/** A reply the game couldn't read, so it played the confused script. */
const GARBLED = safeReaction("{ not json");

const object = (t: number, reaction: unknown): KernelEvent => ({
  t,
  type: "observation.object",
  source: "held_object",
  data: { reaction },
});

const RECORDED: KernelEvent[] = [
  object(1000, DUCK),
  object(9000, GARBLED),
  object(20_000, DUCK),
  { t: 30_000, type: "observation.kid", source: "pose", data: { present: false } },
];

function session() {
  return replay(RECORDED, {
    plugins: [matcherBrain(), ...SKILLS],
    seed: 1,
    guardian: liveGuardian(SKILLS, 20),
  }).events;
}

describe("a recorded session of held-up objects", () => {
  const events = session();

  it("plays the same reactions the game played before the port", () => {
    const steps = events
      .map(startedStep)
      .filter((step) => step !== undefined)
      .map((step) => played(step));
    const before = [DUCK, GARBLED, DUCK].flatMap(({ script }) => script);
    expect(steps).toEqual(before.map((step) => ({ kind: "step", step })));
  });

  it("passes each reaction through the guardian", () => {
    const verdicts = events.filter((e) => e.source === "guardian").map((e) => e.type);
    expect(verdicts).toEqual(["guardian.passed", "guardian.passed", "guardian.passed"]);
  });

  it("keeps the photo out of the log", () => {
    expect(JSON.stringify(events)).not.toMatch(/image|base64|photo|crop/i);
  });
});
