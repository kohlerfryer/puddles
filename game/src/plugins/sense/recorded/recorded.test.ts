import { describe, expect, it } from "vitest";

import { replayCamera } from "../../../core/cameraSample";
import type { KernelEvent } from "../../../core/contracts";
import { isPoseFixture, LANDMARK_COUNT, type PoseFrame } from "../../../core/poseFixture";
import { checkPlugin } from "../../../kernel/harness";
import { createKernel } from "../../../kernel/kernel";
import { runSense } from "../../../kernel/testing";
import { gestureOf, gesturesSense } from "../gestures";
import { momentOf, recordedSense, recordedSenses } from "./index";
import { cameraSamples, parseRecording, type Recording, recordingEnd } from "./recording";

const files = import.meta.glob<unknown>("../../../core/fixtures/*.json", {
  eager: true,
  import: "default",
});
const fixtures = Object.entries(files).map(([path, data]): [string, unknown] => [path, data]);

const LEFT_WRIST = 15;

/** A pose with every landmark in the middle, the left wrist raised above its elbow when `raised`. */
const poseAt = (t: number, raised = false): PoseFrame => ({
  t,
  landmarks: Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
    x: 0.5,
    y: raised && i === LEFT_WRIST ? 0.3 : 0.5,
    z: 0,
    visibility: 1,
  })),
});

const empty: Recording = { pose: [], hands: [], smile: [], voice: [] };

/** Every event the recorded senses log in a headless kernel until `ms` of kernel time. */
function replay(recording: Recording, ms: number): KernelEvent[] {
  const { folders, held } = recordedSenses(recording);
  const kernel = createKernel({ plugins: folders, now: () => 0 });
  while (kernel.clock.t <= ms) {
    const seen = kernel.log.count;
    kernel.tick();
    if (kernel.log.since(seen).some((event) => event.type === "observation.held")) {
      held.finished(kernel.clock.t);
    }
  }
  return kernel.log.events();
}

const brief = (events: readonly KernelEvent[]) =>
  events.map(({ t, type, data }) => ({ t, type, data }));

describe("parseRecording", () => {
  it("reads a gesture fixture as a pose-only recording", () => {
    const [, fixture] = fixtures[0] ?? [];
    if (!isPoseFixture(fixture)) throw new Error("no pose fixture");
    expect(parseRecording(JSON.stringify(fixture))).toEqual({ ...empty, pose: fixture.frames });
  });

  it("reads each stream and puts it in time order", () => {
    const text = JSON.stringify({
      pose: [poseAt(66), poseAt(0)],
      hands: [{ t: 0, hands: [[{ x: 0.4, y: 0.3 }]] }],
      smile: [
        { t: 200, level: 0.9, delta: 0.7 },
        { t: 100, level: 0.2, delta: 0 },
      ],
      voice: [
        { t: 50, active: true, command: "jump" },
        { t: 80, active: false },
      ],
    });
    expect(parseRecording(text)).toEqual({
      pose: [poseAt(0), poseAt(66)],
      hands: [{ t: 0, hands: [[{ x: 0.4, y: 0.3 }]] }],
      smile: [
        { t: 100, level: 0.2, delta: 0 },
        { t: 200, level: 0.9, delta: 0.7 },
      ],
      voice: [
        { t: 50, active: true, command: "jump" },
        { t: 80, active: false },
      ],
    });
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["a smile level out of range", JSON.stringify({ smile: [{ t: 0, level: 2, delta: 0 }] })],
    ["a voice sample without activity", JSON.stringify({ voice: [{ t: 0 }] })],
    ["a pose frame without landmarks", JSON.stringify({ pose: [{ t: 0 }] })],
    ["hands that are not points", JSON.stringify({ hands: [{ t: 0, hands: [[1]] }] })],
    ["an unknown stream", JSON.stringify({ laugh: [] })],
  ])("rejects %s", (_why, text) => {
    expect(() => parseRecording(text)).toThrow(/recording/);
  });
});

describe("cameraSamples", () => {
  it("pairs each pose frame with the hands seen last at or before it", () => {
    const hand = [{ x: 0.4, y: 0.3 }];
    const recording = {
      ...empty,
      pose: [poseAt(0), poseAt(66)],
      hands: [{ t: 50, hands: [hand] }],
    };
    expect(cameraSamples(recording)).toEqual([
      { t: 0, pose: poseAt(0), hands: [] },
      { t: 66, pose: poseAt(66), hands: [hand] },
    ]);
  });
});

describe("recordingEnd", () => {
  it("is the time of the last sample in any stream", () => {
    expect(recordingEnd(empty)).toBe(0);
    const recording = { ...empty, pose: [poseAt(66)], voice: [{ t: 900, active: false }] };
    expect(recordingEnd(recording)).toBe(900);
  });
});

describe("the recorded senses", () => {
  it.each(fixtures)("give the same gestures as the live sense on %s", (_path, fixture) => {
    const recording = parseRecording(JSON.stringify(fixture));
    const end = recordingEnd(recording);
    const live = runSense(gesturesSense(replayCamera(cameraSamples(recording))), end);
    const recorded = replay(recording, end).filter((event) => gestureOf(event));
    expect(brief(recorded)).toEqual(brief(live));
  });

  it("see a hand held up still in recorded hand landmarks", () => {
    const hand = [
      { x: 0.4, y: 0.3 },
      { x: 0.45, y: 0.35 },
    ];
    const pose = Array.from({ length: 20 }, (_, i) => poseAt(i * 66, true));
    const recording = { ...empty, pose, hands: [{ t: 0, hands: [hand] }] };
    const held = replay(recording, recordingEnd(recording)).filter(
      (event) => event.type === "observation.held",
    );
    // The frame at 1056 ms completes the one-second hold; the kernel's next 30 Hz tick sees it.
    expect(brief(held)).toEqual([{ t: 1067, type: "observation.held", data: { hand } }]);
  });

  it("replay smiles and voice activity once each, at their recorded times", () => {
    const recording: Recording = {
      ...empty,
      smile: [{ t: 100, level: 0.9, delta: 0.7 }],
      voice: [
        { t: 100, active: true, command: "jump" },
        { t: 400, active: false },
      ],
    };
    expect(brief(runSense(recordedSense(recording), 1000))).toEqual([
      { t: 100, type: "observation.smile", data: { level: 0.9, delta: 0.7 } },
      { t: 100, type: "observation.speech", data: { active: true, command: "jump" } },
      { t: 400, type: "observation.speech", data: { active: false } },
    ]);
  });

  it("pass the plugin harness", () => {
    const recording: Recording = {
      ...empty,
      smile: [{ t: 0, level: 0.1, delta: 0 }],
      voice: [{ t: 2000, active: true }],
    };
    expect(checkPlugin(() => recordedSense(recording), { now: () => 0 })).toEqual([]);
  });
});

describe("momentOf", () => {
  const event = (type: string, data: Record<string, unknown>): KernelEvent => ({
    t: 0,
    type,
    source: "test",
    data,
  });

  it.each([
    [event("observation.gesture", { gesture: "wave" }), "wave"],
    [event("observation.held", { hand: [{ x: 0, y: 0 }] }), "held something up"],
    [event("observation.speech", { active: true, command: "jump" }), 'heard "jump"'],
    [event("observation.smile", { level: 0.9, delta: 0.5 }), "big smile"],
  ])("names the key moment %j", (input, moment) => {
    expect(momentOf(input)).toBe(moment);
  });

  it.each([
    event("observation.kid", { present: true }),
    event("observation.speech", { active: true }),
    event("observation.smile", { level: 0.3, delta: 0.1 }),
  ])("skips everyday events like %j", (input) => {
    expect(momentOf(input)).toBeUndefined();
  });
});
