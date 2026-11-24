import { describe, expect, it } from "vitest";

import { type CameraSample, replayCamera } from "../../core/cameraSample";
import { isPoseFixture, type PoseFixture } from "../../core/poseFixture";
import { checkPlugin } from "../../kernel/harness";
import { runSense } from "../../kernel/testing";
import { gestureOf, gesturesSense } from "./gestures";
import { createGestureWatch } from "./gestures/watch";
import { heldObjectSense } from "./held_object";
import { poseSense } from "./pose";

const files = import.meta.glob<unknown>("../../core/fixtures/*.json", {
  eager: true,
  import: "default",
});
const fixtures = Object.entries(files).map(([path, data]): [string, PoseFixture] => {
  if (!isPoseFixture(data)) throw new Error(`${path} is not a pose fixture`);
  return [path, data];
});

const recording = (fixture: PoseFixture): CameraSample[] =>
  fixture.frames.map((pose) => ({ t: pose.t, pose, hands: [] }));

const zero = () => 0;

const lastT = (samples: readonly CameraSample[]) => samples.at(-1)?.t ?? 0;

describe.each([
  ["pose", poseSense],
  ["gestures", gesturesSense],
  ["held_object", (read: Parameters<typeof poseSense>[0]) => heldObjectSense(read).folder],
])("the %s sense", (_id, make) => {
  it.each(fixtures)("passes the plugin harness on %s", (_path, fixture) => {
    expect(checkPlugin(() => make(replayCamera(recording(fixture))), { now: zero })).toEqual([]);
  });
});

describe("the gestures sense", () => {
  it.each(fixtures)("%s gives the same gestures as the watch did", (_path, fixture) => {
    const samples = recording(fixture);
    const watch = createGestureWatch();
    const expected = fixture.frames.flatMap((frame) => watch.push(frame));
    const events = runSense(gesturesSense(replayCamera(samples)), lastT(samples));
    expect(events.map((event) => gestureOf(event))).toEqual(expected);
    expect(new Set(expected)).toEqual(new Set(fixture.gesture === "idle" ? [] : [fixture.gesture]));
  });

  it("reads nothing but its own gesture events", () => {
    expect(gestureOf({ t: 0, type: "observation.kid", source: "pose", data: {} })).toBeUndefined();
    const odd = { t: 0, type: "observation.gesture", source: "gestures", data: { gesture: "x" } };
    expect(gestureOf(odd)).toBeUndefined();
  });
});
