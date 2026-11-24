/**
 * Showcase scenario "Copy me" (spec §16), as far as M3 goes: the kid stands in view of a recorded
 * camera, Puddles asks for a gesture, and the kid copies it or doesn't. The exaggerate option and
 * the bandit learning whether exaggerating is funny don't exist yet, so they aren't checked.
 */

import { describe, expect, it } from "vitest";

import idle from "../core/fixtures/idle-adult.json";
import flap from "../core/fixtures/flap-adult.json";
import jump from "../core/fixtures/jump-adult.json";
import { backToBack, clip, play, said } from "./scenario";

/** With this seed, copy-me asks for a flap. */
const SEED = 1;
/**
 * Puddles asks once the kid has stood in view for fifteen seconds, then waits eight. The flap clip
 * flaps 6.6 s in and the jump clip first jumps 2.6 s in, so each answer lands inside the wait.
 */
const BEFORE = { flap: 12_000, jump: 20_000 };

/** The kid stands still for `before[gesture]` ms, then plays the gesture's clip. */
function session(gesture: keyof typeof BEFORE) {
  const standing = backToBack(clip(idle), clip(idle)).filter((frame) => frame.t < BEFORE[gesture]);
  const pose = backToBack(standing, clip({ flap, jump }[gesture]));
  return play({ recording: { pose, hands: [], smile: [], voice: [] }, seed: SEED });
}

const outcomes = (events: ReturnType<typeof session>) =>
  events
    .filter((e) => e.type.startsWith("outcome.") && e.data.effects !== undefined)
    .map((e) => e.data.effects);

describe("Copy me", () => {
  it("asks for a gesture after a while, cheers when the kid copies it, then mirrors again", () => {
    const events = session("flap");

    expect(said(events)).toEqual([
      "copy_me: Can you flap?",
      "copy_me: You did it!",
      "reflexes: Flap flap flap!",
    ]);
    expect(outcomes(events)).toEqual([{ answer: "yes" }]);
  });

  it("says no to the wrong gesture, gives up when time runs out, then mirrors again", () => {
    const events = session("jump");

    expect(said(events)).toEqual([
      "copy_me: Can you flap?",
      "copy_me: Not that one!",
      "copy_me: Maybe next time.",
      "reflexes: Boing!",
      "reflexes: Boing!",
    ]);
    expect(outcomes(events)).toEqual([{ answer: "timeout" }]);
  });

  it("gets every step past the guardian", () => {
    const verdicts = [...session("flap"), ...session("jump")].filter(
      (e) => e.source === "guardian",
    );

    expect(new Set(verdicts.map((e) => e.type))).toEqual(new Set(["guardian.passed"]));
  });
});
