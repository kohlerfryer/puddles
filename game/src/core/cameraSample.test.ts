import { describe, expect, it } from "vitest";

import { type CameraSample, newSamples, replayCamera } from "./cameraSample";

const at = (t: number): CameraSample => ({ t, pose: undefined, hands: [] });

describe("replayCamera", () => {
  it("gives the latest sample taken by kernel time t, and nothing before the first", () => {
    const read = replayCamera([at(0), at(66), at(132)]);
    expect(read(-1)).toBeUndefined();
    expect(read(0)?.t).toBe(0);
    expect(read(100)?.t).toBe(66);
    expect(read(5000)?.t).toBe(132);
  });
});

describe("newSamples", () => {
  it("gives each sample once, however many ticks read it", () => {
    const read = newSamples(replayCamera([at(0), at(66)]));
    expect([0, 33, 66, 99].map((t) => read(t)?.t)).toEqual([0, undefined, 66, undefined]);
  });
});
