/**
 * A recorded camera session replayed against the reflexes and copy-me brains: the same mirrors and
 * copy-me answers the game gave before they moved behind the kernel.
 */

import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../../core/contracts";
import { replay } from "../../kernel/replay";
import { SKILLS } from "../skill";
import { IDLE_BEFORE_ASK_MS, copyMe, copyMeBrain } from "./copyMe";
import { reflexesBrain } from "./reflexes";

const observed = (t: number, type: string, data: Record<string, unknown>): KernelEvent => ({
  t,
  type,
  source: type === "observation.kid" ? "pose" : "gestures",
  data,
});
const kid = (t: number) => observed(t, "observation.kid", { present: true });
const gesture = (t: number, name: string) => observed(t, "observation.gesture", { gesture: name });

/** The seed the session was recorded with; with it, copy-me asks for a jump, then a wave. */
const SEED = 7;
/** When the flap mirror ends and copy-me starts counting. */
const IDLE_FROM = 5000;
const FIRST_ASK = IDLE_FROM + IDLE_BEFORE_ASK_MS;

const RECORDED = [
  kid(0),
  gesture(2000, "jump"),
  gesture(4000, "flap"),
  gesture(FIRST_ASK + 2000, "wave"),
  gesture(FIRST_ASK + 4000, "jump"),
  kid(FIRST_ASK + 30_000),
];

function session() {
  const plugins = [reflexesBrain(), copyMeBrain(), ...SKILLS];
  const behaviors = new Map([["copy_me", copyMe]]);
  return replay(RECORDED, { plugins, seed: SEED, behaviors }).events;
}

describe("a recorded gesture session", () => {
  const events = session();
  const lines = events
    .filter((e) => e.type === "action.started" && e.data.say !== undefined)
    .map((e) => `${String(e.data.brain)}: ${String(e.data.say)}`);

  it("gives the same mirrors and copy-me answers as before the port", () => {
    expect(lines).toEqual([
      "reflexes: Boing!",
      "reflexes: Flap flap flap!",
      "copy_me: Can you jump?",
      "copy_me: Not that one!",
      "copy_me: You did it!",
      "copy_me: Can you wave?",
      "copy_me: Maybe next time.",
    ]);
  });

  it("asks after idling with the kid in view, and answers while it runs instead of mirroring", () => {
    const asked = events.find((e) => e.type === "intent.started" && e.data.brain === "copy_me");
    expect(asked?.t).toBeGreaterThanOrEqual(FIRST_ASK);
    expect(asked?.t).toBeLessThan(FIRST_ASK + 100);
    const dropped = events.filter((e) => e.type === "intent.dropped");
    expect(dropped.map((e) => e.data.brain)).toEqual(["reflexes", "reflexes"]);
  });

  it("ends each copy-me with one outcome saying how it went", () => {
    const outcomes = events.filter((e) => e.source === "executor" && e.type.startsWith("outcome."));
    const ofCopyMe = outcomes.filter((e) => e.data.effects !== undefined);
    expect(ofCopyMe.map((e) => e.data.effects)).toEqual([{ answer: "yes" }, { answer: "timeout" }]);
  });
});
