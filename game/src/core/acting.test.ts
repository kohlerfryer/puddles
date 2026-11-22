import { describe, expect, it } from "vitest";

import { createActing } from "./acting";
import type { Mood, Step } from "./reaction";

const playing = (step: Step, startedAt: number) =>
  ({ state: "playing", step, mood: step.mood, startedAt }) as const;

const walk: Step = { do: "walk_to", target: "object", mood: "curious" };
const peck: Step = { do: "peck", target: "object", mood: "silly" };
const duck = { x: 400, facing: 1 } as const;
const scene = { object: 700 };

describe("createActing", () => {
  it("shows nothing while the runner is idle", () => {
    expect(createActing().update({ state: "idle" }, 0, duck, scene)).toBeUndefined();
  });

  it("plays the step's plan from when the step started, with its mood", () => {
    const cue = createActing().update(playing(walk, 1000), 1500, duck, scene);
    expect(cue?.frame).toMatchObject({ pose: "walk", x: 550, facing: 1 });
    expect(cue?.mood).toBe<Mood>("curious");
  });

  it("plans a step once, from where Puddles stood when it started", () => {
    const acting = createActing();
    acting.update(playing(walk, 0), 0, duck, scene);
    const cue = acting.update(playing(walk, 0), 500, { x: 900, facing: -1 }, scene);
    expect(cue?.frame).toMatchObject({ x: 550, facing: 1 });
  });

  it("plans again when the next step starts", () => {
    const acting = createActing();
    acting.update(playing(walk, 0), 0, duck, scene);
    const cue = acting.update(playing(walk, 1500), 1500, { x: 760, facing: 1 }, scene);
    expect(cue?.frame).toMatchObject({ pose: "stand", x: 760, facing: -1 });
  });

  it("fires the peck's nudge once, when it is due", () => {
    const acting = createActing();
    const near = { object: 460 };
    const cues = [0, 400, 500, 600, 900].map((now) =>
      acting.update(playing(peck, 0), now, duck, near),
    );
    expect(cues.map((cue) => cue?.nudge)).toEqual([
      undefined,
      undefined,
      { at: 0.5, x: 4, y: -6 },
      undefined,
      undefined,
    ]);
  });

  it("gives the step's line once, when the step starts, timed to the step", () => {
    const acting = createActing();
    const hello: Step = { ...peck, say: "Hi friend!" };
    const cues = [1000, 1500].map((now) => acting.update(playing(hello, 1000), now, duck, scene));
    expect(cues.map((cue) => cue?.line)).toEqual([
      { text: "Hi friend!", startedAt: 1000, seconds: 1 },
      undefined,
    ]);
  });

  it("takes the sticker once, when the take is due", () => {
    const acting = createActing();
    const eat: Step = { do: "eat", target: "object", mood: "happy" };
    const cues = [0, 400, 500, 600, 1400].map((now) =>
      acting.update(playing(eat, 0), now, duck, { object: 460 }),
    );
    expect(cues.map((cue) => cue?.take)).toEqual([
      undefined,
      undefined,
      { at: 0.5, to: "beak" },
      undefined,
      undefined,
    ]);
  });

  it("gives no line for a step that says nothing", () => {
    expect(createActing().update(playing(walk, 0), 0, duck, scene)?.line).toBeUndefined();
  });

  it("forgets the step once the runner goes idle", () => {
    const acting = createActing();
    acting.update(playing(peck, 0), 600, duck, { object: 460 });
    acting.update({ state: "idle" }, 1000, duck, scene);
    const cue = acting.update(playing(peck, 0), 600, duck, { object: 460 });
    expect(cue?.nudge).toEqual({ at: 0.5, x: 4, y: -6 });
  });
});
