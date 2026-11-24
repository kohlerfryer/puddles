import { describe, expect, it } from "vitest";

import { MIRRORS } from "../plugins/brains/reflexes";
import { COPY_STEPS } from "../plugins/brains/copyMe";
import { played, startedStep } from "./bridge";
import type { KernelEvent } from "./contracts";
import { soundFor } from "./sounds";

const started = (data: Record<string, unknown>): KernelEvent => ({
  t: 100,
  type: "action.started",
  source: "executor",
  data,
});

describe("startedStep", () => {
  it("reads the step an action.started event starts, without the brain", () => {
    const event = started({ brain: "reflexes", ...MIRRORS.jump });
    expect(startedStep(event)).toEqual(MIRRORS.jump);
  });

  it("reads nothing from other events or broken steps", () => {
    expect(
      startedStep({ ...started({ ...MIRRORS.jump }), type: "intent.started" }),
    ).toBeUndefined();
    expect(startedStep(started({ brain: "reflexes", skill: "jump" }))).toBeUndefined();
  });
});

describe("played", () => {
  it("plays a skill a reaction knows as that verb, keeping its target, mood and line", () => {
    expect(played(MIRRORS.wave)).toEqual({
      kind: "step",
      step: { do: "look_at", target: "camera", mood: "happy", say: "Hi friend!" },
    });
    expect(played(MIRRORS.jump)).toEqual({
      kind: "step",
      step: { do: "jump", mood: "happy", say: "Boing!" },
    });
  });

  it("plays a step with no mood happily, and drops a target a reaction can't name", () => {
    expect(played({ skill: "peck", args: { target: "moon" } })).toEqual({
      kind: "step",
      step: { do: "peck", mood: "happy" },
    });
  });

  it("plays a nap as the idle nap pose for the skill's duration", () => {
    expect(played({ skill: "nap", args: {} })).toEqual({ kind: "nap", seconds: 4 });
  });

  it("plays nothing for a skill render has no move for, so Puddles idles while he waits", () => {
    expect(played({ skill: "copy_gesture", args: { gesture: "jump" } })).toBeUndefined();
  });

  it("keeps copy-me's quacks: asking, yes, no and a curious sigh", () => {
    const sound = (step: Parameters<typeof played>[0]) => {
      const play = played(step);
      return play?.kind === "step" ? soundFor({ kind: "step", step: play.step }) : undefined;
    };
    expect(sound(COPY_STEPS.ask.jump)).toBe("asking");
    expect(sound(COPY_STEPS.yes)).toBe("yes");
    expect(sound(COPY_STEPS.no)).toBe("no");
    expect(sound(COPY_STEPS.timeout)).toBe("curious");
  });
});
