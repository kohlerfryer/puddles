import { describe, expect, it } from "vitest";

import { type CameraSample, replayCamera } from "../../../core/cameraSample";
import { checkPlugin } from "../../../kernel/harness";
import { runSense } from "../../../kernel/testing";
import { SUSTAIN_MS, smileSense } from "./index";

const SAMPLE_MS = 66;

/** Camera samples every 66 ms from `from`, each with the smile level `level(t)` gives, if any. */
function face(from: number, to: number, level: (t: number) => number | undefined): CameraSample[] {
  const samples: CameraSample[] = [];
  for (let t = from; t < to; t += SAMPLE_MS) {
    const smile = level(t);
    samples.push({ t, pose: undefined, hands: [], ...(smile !== undefined && { smile }) });
  }
  return samples;
}

const smiles = (samples: CameraSample[]) =>
  runSense(smileSense(replayCamera(samples)), samples.at(-1)?.t ?? 0).map(({ t, data }) => ({
    t,
    level: Number(data.level),
    delta: Number(data.delta),
  }));

const peak = (events: ReturnType<typeof smiles>) => Math.max(...events.map((e) => e.level));

describe("the smile sense", () => {
  it("passes the plugin harness", () => {
    const samples = face(0, 2000, (t) => (t > 1000 ? 0.7 : 0.01));
    expect(checkPlugin(() => smileSense(replayCamera(samples)), { now: () => 0 })).toEqual([]);
  });

  it("counts a smile once it has stayed up for half a second", () => {
    const events = smiles(face(0, 3000, (t) => (t >= 1000 ? 0.7 : 0.01)));
    expect(peak(events)).toBeCloseTo(0.7);
    const counted = events.find((e) => e.level > 0.3);
    expect(counted?.t).toBeGreaterThanOrEqual(1000 + SUSTAIN_MS);
    expect(counted?.t).toBeLessThan(1000 + SUSTAIN_MS + 2 * SAMPLE_MS);
  });

  it("ignores a smile that flickers for less than half a second", () => {
    const events = smiles(face(0, 3000, (t) => (t >= 1000 && t < 1300 ? 0.7 : 0.01)));
    expect(peak(events)).toBeLessThan(0.3);
  });

  it("measures the delta from the kid's calm level", () => {
    const events = smiles(face(0, 4000, (t) => (t >= 2000 ? 0.8 : 0.2)));
    expect(events.at(-1)?.delta).toBeCloseTo(0.6);
    expect(events[0]?.delta).toBe(0);
  });

  it("says nothing without a face, and starts over when the face comes back", () => {
    const events = smiles(face(0, 3000, (t) => (t < 1000 || t >= 2000 ? 0.7 : undefined)));
    expect(events.every((e) => e.t < 1000 + SAMPLE_MS || e.t >= 2000 + SUSTAIN_MS)).toBe(true);
    expect(events.some((e) => e.t >= 2000)).toBe(true);
  });
});
