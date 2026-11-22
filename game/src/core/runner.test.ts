import { describe, expect, it } from "vitest";

import type { Step } from "./reaction";
import { createRunner } from "./runner";
import { VERB_SECONDS } from "./validator";

const sniff: Step = { do: "sniff", target: "object", mood: "curious" };
const dance: Step = { do: "dance", mood: "happy", say: "Wheee!" };
const flap: Step = { do: "flap", mood: "silly" };
const hop: Step = { do: "jump", mood: "proud" };
const duck: Step = { do: "run_away", target: "reeds", mood: "scared" };

const ms = (step: Step): number => VERB_SECONDS[step.do] * 1000;

describe("script runner", () => {
  it("is idle before any script plays", () => {
    expect(createRunner().update(0)).toEqual({ state: "idle" });
  });

  it("reports the first step and its mood as soon as a script plays", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 1000);
    expect(runner.update(1000)).toEqual({
      state: "playing",
      step: sniff,
      mood: "curious",
      startedAt: 1000,
    });
  });

  it("reports when the current step started", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 1000);
    expect(runner.update(1000)).toMatchObject({ startedAt: 1000 });
    expect(runner.update(1000 + ms(sniff) + 10)).toMatchObject({
      step: dance,
      startedAt: 1000 + ms(sniff),
    });
  });

  it("keeps the step until its time is up, then advances", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 0);
    expect(runner.update(ms(sniff) - 1)).toMatchObject({ step: sniff });
    expect(runner.update(ms(sniff))).toEqual({
      state: "playing",
      step: dance,
      mood: "happy",
      startedAt: ms(sniff),
    });
  });

  it("goes idle when the last step ends", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 0);
    expect(runner.update(ms(sniff) + ms(dance))).toEqual({ state: "idle" });
  });

  it("keeps the schedule when a frame skips past several steps", () => {
    const runner = createRunner();
    runner.play([sniff, flap, dance], 0);
    expect(runner.update(ms(sniff) + ms(flap) + 1)).toMatchObject({ step: dance });
    expect(runner.update(ms(sniff) + ms(flap) + ms(dance) - 1)).toMatchObject({ step: dance });
  });

  it("replaces the running script when a new one plays", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 0);
    runner.play([flap, hop], 500);
    expect(runner.update(500)).toMatchObject({ step: flap });
    expect(runner.update(500 + ms(flap))).toMatchObject({ step: hop });
  });

  it("does not change the script it was given", () => {
    const script = [sniff, dance];
    const runner = createRunner();
    runner.play(script, 0);
    runner.update(ms(sniff) + ms(dance));
    expect(script).toEqual([sniff, dance]);
  });
});

describe("gesture reactions", () => {
  it("wait for the current step to end, then play before the rest of the script", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 0);
    runner.react(hop, 100);
    expect(runner.update(ms(sniff) - 1)).toMatchObject({ step: sniff });
    expect(runner.update(ms(sniff))).toEqual({
      state: "playing",
      step: hop,
      mood: "proud",
      startedAt: ms(sniff),
    });
    expect(runner.update(ms(sniff) + ms(hop))).toMatchObject({ step: dance });
  });

  it("play in the order they arrived", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 0);
    runner.react(hop, 100);
    runner.react(duck, 200);
    expect(runner.update(ms(sniff))).toMatchObject({ step: hop });
    expect(runner.update(ms(sniff) + ms(hop))).toMatchObject({ step: duck });
    expect(runner.update(ms(sniff) + ms(hop) + ms(duck))).toMatchObject({ step: dance });
  });

  it("play straight away when the runner is idle", () => {
    const runner = createRunner();
    runner.react(hop, 300);
    expect(runner.update(300)).toMatchObject({ step: hop });
    expect(runner.update(300 + ms(hop))).toEqual({ state: "idle" });
  });

  it("play before a new script, since replacing the script ends the current step", () => {
    const runner = createRunner();
    runner.play([sniff, dance], 0);
    runner.react(hop, 100);
    runner.play([flap, sniff], 200);
    expect(runner.update(200)).toMatchObject({ step: hop });
    expect(runner.update(200 + ms(hop))).toMatchObject({ step: flap });
  });
});
