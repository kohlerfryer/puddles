import { describe, expect, it } from "vitest";

import type { KernelEvent, Step } from "../../../core/contracts";
import type { Random } from "../../../core/random";
import { seededRandom } from "../../../core/random";
import { checkPlugin } from "../../../kernel/harness";
import type { Finished } from "../../../kernel/plugins";
import { BODY_GESTURES } from "../../sense/gestures/gestures";
import { ASK_MS, COPY_STEPS, IDLE_BEFORE_ASK_MS, copyMe, copyMeBrain } from "./index";

const event = (type: string, data: Record<string, unknown> = {}): KernelEvent => ({
  t: 0,
  type,
  source: "test",
  data,
});

const kid = (present: boolean) => event("observation.kid", { present });
const started = event("intent.started", { brain: "reflexes" });
const done = event("intent.done", { brain: "reflexes" });

/** A copy-me brain driven tick by tick, rolling `roll` whenever it picks a gesture. */
function brain(roll = 0) {
  const { decide } = copyMeBrain().code ?? {};
  if (!decide) throw new Error("copy-me has no brain");
  const random: Random = () => roll;
  return (t: number, ...events: KernelEvent[]) => decide({ t, events, random });
}

/** The gesture the brain asks for once it has idled long enough with the kid in view. */
function askedFor(roll: number) {
  const decide = brain(roll);
  decide(0, kid(true));
  return decide(IDLE_BEFORE_ASK_MS)?.behavior?.params.gesture;
}

describe("copy-me brain", () => {
  it("starts copy-me above the reflexes after idling about 15 s with the kid in view", () => {
    expect(IDLE_BEFORE_ASK_MS).toBe(15_000);
    const decide = brain();
    expect(decide(0, kid(true))).toBeNull();
    expect(decide(IDLE_BEFORE_ASK_MS - 1)).toBeNull();
    expect(decide(IDLE_BEFORE_ASK_MS)).toEqual({
      brain: "copy_me",
      priority: 2,
      kind: "behavior",
      behavior: { id: "copy_me", params: { gesture: "jump" } },
      why: "idled with the kid in view",
      features: ["copies_kid"],
    });
  });

  it("waits while nobody is in view, counting afresh once someone appears", () => {
    const decide = brain();
    decide(0, kid(false));
    expect(decide(IDLE_BEFORE_ASK_MS)).toBeNull();
    decide(IDLE_BEFORE_ASK_MS + 1, kid(true));
    expect(decide(2 * IDLE_BEFORE_ASK_MS - 1)).toBeNull();
    expect(decide(2 * IDLE_BEFORE_ASK_MS)?.kind).toBe("behavior");
  });

  it("waits while Puddles plays an intent, counting from when it ends", () => {
    const decide = brain();
    decide(0, kid(true), started);
    expect(decide(IDLE_BEFORE_ASK_MS)).toBeNull();
    decide(5000 + IDLE_BEFORE_ASK_MS, done);
    expect(decide(5000 + 2 * IDLE_BEFORE_ASK_MS - 1)).toBeNull();
    expect(decide(5000 + 2 * IDLE_BEFORE_ASK_MS)?.kind).toBe("behavior");
  });

  it("counts afresh when its intent didn't start", () => {
    const decide = brain();
    decide(0, kid(true));
    decide(IDLE_BEFORE_ASK_MS);
    expect(decide(IDLE_BEFORE_ASK_MS + 1)).toBeNull();
    expect(decide(2 * IDLE_BEFORE_ASK_MS)?.kind).toBe("behavior");
  });

  it("asks for a different gesture from last time", () => {
    const decide = brain();
    decide(0, kid(true));
    const picks = [1, 2, 3, 4].map((n) => decide(n * IDLE_BEFORE_ASK_MS)?.behavior?.params.gesture);
    picks.slice(1).forEach((pick, i) => {
      expect(pick).not.toBe(picks[i]);
    });
  });

  it("can ask for every gesture", () => {
    const rolls = [0, 0.3, 0.6, 0.99];
    expect(new Set(rolls.map(askedFor))).toEqual(new Set(BODY_GESTURES));
  });

  it("passes the plugin harness", () => {
    const inputs = (t: number) =>
      t % 990 === 0 ? [{ type: "observation.kid", data: { present: true } }] : [];
    expect(checkPlugin(copyMeBrain, { inputs, now: () => 0 })).toEqual([]);
  });
});

/** Plays the copy-me behavior from `t`, asking for `gesture`; `next` feeds it how each step ended. */
function behavior(gesture: string, t = 1000) {
  const run = copyMe({ gesture }, { t, events: [], random: seededRandom(1) });
  const first = run(null);
  return { first, next: (last: Finished) => run(last) };
}

const ended: Finished = { status: "done" };
const saw = (gesture: string): Finished => ({ status: "done", effects: { gesture } });
const wait = (gesture: string, t = 1000): Step => ({
  skill: "copy_gesture",
  args: { gesture, until: t + ASK_MS },
});

describe("copy-me behavior", () => {
  it("does the gesture with an asking line, then waits 8 s from the ask for the kid", () => {
    expect(ASK_MS).toBe(8000);
    const { first, next } = behavior("wave");
    expect(first).toEqual(COPY_STEPS.ask.wave);
    expect(COPY_STEPS.ask.wave).toMatchObject({ say: "Can you wave?", think: "wave" });
    expect(next(ended)).toEqual(wait("wave"));
  });

  it("dances when the kid copies, then ends with one yes", () => {
    const { next } = behavior("jump");
    next(ended);
    expect(next(saw("jump"))).toEqual(COPY_STEPS.yes);
    expect(COPY_STEPS.yes).toMatchObject({ skill: "dance", say: "You did it!" });
    expect(next(ended)).toEqual({ status: "done", effects: { answer: "yes" } });
  });

  it("shakes no at a wrong gesture, still thinking of the asked one, and keeps waiting", () => {
    const { next } = behavior("jump");
    next(ended);
    expect(next(saw("flap"))).toEqual({ ...COPY_STEPS.no, think: "jump" });
    expect(COPY_STEPS.no).toMatchObject({ say: "Not that one!", mood: "grossed_out" });
    expect(next(ended)).toEqual(wait("jump"));
    expect(next(saw("jump"))).toEqual(COPY_STEPS.yes);
  });

  it("gives up once the wait is over, then ends with one timeout", () => {
    const { next } = behavior("crouch");
    next(ended);
    expect(next(ended)).toEqual(COPY_STEPS.timeout);
    expect(COPY_STEPS.timeout).toMatchObject({ say: "Maybe next time.", mood: "curious" });
    expect(next(ended)).toEqual({ status: "done", effects: { answer: "timeout" } });
  });

  it("asks for a jump when told a gesture it doesn't know", () => {
    expect(behavior("cartwheel").first).toEqual(COPY_STEPS.ask.jump);
  });

  it("fails the way a failed step did", () => {
    const { next } = behavior("jump");
    const failed: Finished = { status: "failed", reason: "unknown skill: jump" };
    expect(next(failed)).toEqual(failed);
  });
});
