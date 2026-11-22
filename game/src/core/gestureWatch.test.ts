import { describe, expect, it } from "vitest";

import { type BodyGesture } from "./gestures";
import { createGestureWatch, GESTURE_REACTIONS, WATCH_COOLDOWN_MS } from "./gestureWatch";
import { isPoseFixture, LANDMARK_COUNT, type PoseFixture, type PoseFrame } from "./poseFixture";
import { createRunner } from "./runner";

const files = import.meta.glob<unknown>("./fixtures/*.json", { eager: true, import: "default" });
const fixtures = Object.entries(files).map(([path, data]): [string, PoseFixture] => {
  if (!isPoseFixture(data)) throw new Error(`${path} is not a pose fixture`);
  return [path, data];
});

/** Streams `frames` through a fresh watch as if they arrived live, collecting every gesture it reports. */
function stream(frames: readonly PoseFrame[]): BodyGesture[] {
  const watch = createGestureWatch();
  return frames.flatMap((frame) => watch.push(frame));
}

const stillFrame = (t: number): PoseFrame => ({
  t,
  landmarks: Array.from({ length: LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  })),
});

describe("gesture watch", () => {
  it.each(fixtures)("%s streamed live reports only its own gesture", (_path, fixture) => {
    const seen = new Set(stream(fixture.frames));
    const expected = fixture.gesture === "idle" ? [] : [fixture.gesture];
    expect([...seen]).toEqual(expected);
  });

  it("reports a gesture once, not on every frame that still shows it", () => {
    const jump = fixtures.find(([, f]) => f.gesture === "jump")?.[1];
    if (!jump) throw new Error("no jump fixture");
    const seen = stream(jump.frames);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(jump.frames.filter((f) => f.t > 0).length / 10);
  });

  it("stays quiet for the cooldown after reporting", () => {
    const jump = fixtures.find(([, f]) => f.gesture === "jump")?.[1];
    if (!jump) throw new Error("no jump fixture");
    const watch = createGestureWatch();
    const times = jump.frames.flatMap((frame) => (watch.push(frame).length > 0 ? [frame.t] : []));
    expect(times.length).toBeGreaterThan(1);
    for (const [i, t] of times.slice(1).entries()) {
      expect(t - (times[i] ?? 0)).toBeGreaterThanOrEqual(WATCH_COOLDOWN_MS);
    }
  });

  it("reports nothing while the player stands still", () => {
    expect(stream(Array.from({ length: 100 }, (_, i) => stillFrame(i * 66)))).toEqual([]);
  });
});

describe("gesture reactions", () => {
  it("makes Puddles jump when the player jumps", () => {
    expect(GESTURE_REACTIONS.jump.do).toBe("jump");
  });

  it("makes Puddles flap when the player flaps", () => {
    expect(GESTURE_REACTIONS.flap.do).toBe("flap");
  });

  it.each(fixtures.filter(([, f]) => f.gesture !== "idle"))(
    "%s drives Puddles' reaction through the runner",
    (_path, fixture) => {
      const runner = createRunner();
      const watch = createGestureWatch();
      const gesture = fixture.gesture as BodyGesture;
      const reported = fixture.frames.find((frame) => watch.push(frame).includes(gesture));
      if (!reported) throw new Error(`${gesture} was never reported`);
      runner.react(GESTURE_REACTIONS[gesture], reported.t);
      expect(runner.update(reported.t)).toMatchObject({
        state: "playing",
        step: GESTURE_REACTIONS[gesture],
      });
    },
  );
});
