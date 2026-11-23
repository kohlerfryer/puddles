import { describe, expect, it } from "vitest";

import { ASK_MS, COPY_STEPS, createCopyMe, IDLE_BEFORE_ASK_MS } from "./copyMe";
import { GESTURE_REACTIONS } from "./gestureWatch";
import { BODY_GESTURES } from "./gestures";
import { soundFor } from "./sounds";

/** A random source that always rolls `roll`. */
const always =
  (roll: number): (() => number) =>
  () =>
    roll;

const calm = { inView: true, busy: false };

/** A copy-me loop that has just asked for the first gesture, at `IDLE_BEFORE_ASK_MS`. */
function asked(roll = 0) {
  const copy = createCopyMe(always(roll));
  copy.tick(0, calm);
  const cue = copy.tick(IDLE_BEFORE_ASK_MS, calm);
  if (cue?.kind !== "ask") throw new Error("expected an ask");
  return { copy, gesture: cue.gesture };
}

describe("copy me", () => {
  it("asks after idling with a body in view, doing the gesture with an asking quack", () => {
    const copy = createCopyMe(always(0));
    expect(copy.tick(0, calm)).toBeUndefined();
    expect(copy.tick(IDLE_BEFORE_ASK_MS - 1, calm)).toBeUndefined();
    const cue = copy.tick(IDLE_BEFORE_ASK_MS, calm);
    expect(cue).toEqual({ kind: "ask", gesture: "jump", step: COPY_STEPS.ask.jump });
    expect(copy.phase()).toBe("asking");
    expect(soundFor({ kind: "step", step: COPY_STEPS.ask.jump })).toBe("asking");
  });

  it("asks only after about 15 seconds", () => {
    expect(IDLE_BEFORE_ASK_MS).toBe(15_000);
    expect(ASK_MS).toBe(8000);
  });

  it("waits while no body is in view, counting afresh once one appears", () => {
    const copy = createCopyMe(always(0));
    copy.tick(0, { inView: false, busy: false });
    expect(copy.tick(IDLE_BEFORE_ASK_MS, { inView: false, busy: false })).toBeUndefined();
    expect(copy.tick(IDLE_BEFORE_ASK_MS + 1, calm)).toBeUndefined();
    expect(copy.tick(2 * IDLE_BEFORE_ASK_MS - 1, calm)).toBeUndefined();
    expect(copy.tick(2 * IDLE_BEFORE_ASK_MS, calm)?.kind).toBe("ask");
  });

  it("waits while Puddles is busy acting, counting from when he stops", () => {
    const copy = createCopyMe(always(0));
    copy.tick(0, { inView: true, busy: true });
    copy.tick(5000, { inView: true, busy: true });
    expect(copy.tick(IDLE_BEFORE_ASK_MS, calm)).toBeUndefined();
    expect(copy.tick(5000 + IDLE_BEFORE_ASK_MS, calm)?.kind).toBe("ask");
  });

  it("says yes with a dance when the kid copies in time, then idles", () => {
    const { copy, gesture } = asked();
    const cue = copy.see(gesture, IDLE_BEFORE_ASK_MS + ASK_MS - 1);
    expect(cue).toEqual({ kind: "yes", step: COPY_STEPS.yes });
    expect(COPY_STEPS.yes.do).toBe("dance");
    expect(soundFor({ kind: "step", step: COPY_STEPS.yes })).toBe("yes");
    expect(copy.phase()).toBe("idle");
  });

  it("shakes no at a wrong gesture and keeps waiting for the right one", () => {
    const { copy, gesture } = asked();
    const wrong = BODY_GESTURES.find((g) => g !== gesture);
    if (!wrong) throw new Error("need two gestures");
    expect(copy.see(wrong, IDLE_BEFORE_ASK_MS + 1000)).toEqual({ kind: "no", step: COPY_STEPS.no });
    expect(soundFor({ kind: "step", step: COPY_STEPS.no })).toBe("no");
    expect(copy.phase()).toBe("asking");
    expect(copy.tick(IDLE_BEFORE_ASK_MS + 2000, { inView: true, busy: true })).toBeUndefined();
    expect(copy.see(gesture, IDLE_BEFORE_ASK_MS + 3000).kind).toBe("yes");
  });

  it("gives up with a soft quack after 8 seconds and goes back to idling", () => {
    const { copy, gesture } = asked();
    expect(copy.tick(IDLE_BEFORE_ASK_MS + ASK_MS - 1, calm)).toBeUndefined();
    const cue = copy.tick(IDLE_BEFORE_ASK_MS + ASK_MS, calm);
    expect(cue).toEqual({ kind: "timeout", step: COPY_STEPS.timeout });
    expect(soundFor({ kind: "step", step: COPY_STEPS.timeout })).toBe("curious");
    expect(copy.phase()).toBe("idle");
    expect(copy.see(gesture, IDLE_BEFORE_ASK_MS + ASK_MS + 1).kind).toBe("mirror");
  });

  it("counts idling afresh after a request ends", () => {
    const { copy } = asked();
    const over = IDLE_BEFORE_ASK_MS + ASK_MS;
    copy.tick(over, calm);
    expect(copy.tick(over + IDLE_BEFORE_ASK_MS - 1, calm)).toBeUndefined();
    expect(copy.tick(over + IDLE_BEFORE_ASK_MS, calm)?.kind).toBe("ask");
  });

  it("picks a different gesture from last time", () => {
    const copy = createCopyMe(always(0));
    let now = 0;
    const picks = Array.from({ length: 4 }, () => {
      copy.tick(now, calm);
      now += IDLE_BEFORE_ASK_MS;
      const cue = copy.tick(now, calm);
      if (cue?.kind !== "ask") throw new Error("expected an ask");
      now += ASK_MS;
      copy.tick(now, calm);
      return cue.gesture;
    });
    picks.slice(1).forEach((pick, i) => {
      expect(pick).not.toBe(picks[i]);
    });
  });

  it("can ask for every gesture", () => {
    const rolls = [0, 0.3, 0.6, 0.99];
    expect(new Set(rolls.map((roll) => asked(roll).gesture))).toEqual(new Set(BODY_GESTURES));
  });

  it("mirrors gestures one to one when not asking", () => {
    const copy = createCopyMe(always(0));
    expect(copy.see("flap", 0)).toEqual({
      kind: "mirror",
      gesture: "flap",
      step: GESTURE_REACTIONS.flap,
    });
  });

  it("answers a request instead of mirroring the gesture", () => {
    const { copy, gesture } = asked();
    expect(copy.see(gesture, IDLE_BEFORE_ASK_MS + 1).kind).not.toBe("mirror");
  });
});
