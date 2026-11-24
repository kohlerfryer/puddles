import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../../../core/contracts";
import { seededRandom } from "../../../core/random";
import { checkPlugin } from "../../../kernel/harness";
import { BODY_GESTURES } from "../../sense/gestures/gestures";
import { MIRRORS, reflexesBrain } from "./index";

const event = (type: string, data: Record<string, unknown>): KernelEvent => ({
  t: 0,
  type,
  source: "gestures",
  data,
});

const gesture = (name: string) => event("observation.gesture", { gesture: name });

function decide(events: KernelEvent[]) {
  const { decide: brain } = reflexesBrain().code ?? {};
  return brain?.({ t: 0, events, random: seededRandom(1) }) ?? null;
}

describe("reflexes brain", () => {
  it("mirrors a gesture with a low-priority routine of one step", () => {
    expect(decide([gesture("jump")])).toEqual({
      brain: "reflexes",
      priority: 1,
      kind: "routine",
      steps: [MIRRORS.jump],
      why: "mirror the kid's jump",
      features: ["copies_kid"],
    });
  });

  it("jumps when the kid jumps and flaps when the kid flaps, thinking of the gesture", () => {
    expect(MIRRORS.jump).toMatchObject({ skill: "jump", think: "jump", say: "Boing!" });
    expect(MIRRORS.flap).toMatchObject({ skill: "flap", think: "flap", mood: "silly" });
    expect(MIRRORS.wave).toMatchObject({ skill: "look_at", args: { target: "camera" } });
    expect(MIRRORS.crouch).toMatchObject({ skill: "freeze", say: "Where did you go?" });
  });

  it("mirrors only the latest of the gestures since it last ran", () => {
    expect(decide([gesture("jump"), gesture("wave")])?.steps).toEqual([MIRRORS.wave]);
  });

  it("does nothing without a gesture", () => {
    expect(decide([])).toBeNull();
    expect(decide([event("observation.kid", { present: true }), gesture("cartwheel")])).toBeNull();
  });

  it("passes the plugin harness", () => {
    const inputs = (t: number) =>
      t % 990 === 0
        ? [{ type: "observation.gesture", data: { gesture: BODY_GESTURES[t % 4] } }]
        : [];
    const skills = { jump: 1, look_at: 1, flap: 1, freeze: 1 };
    expect(checkPlugin(reflexesBrain, { inputs, skills, now: () => 0 })).toEqual([]);
  });
});
