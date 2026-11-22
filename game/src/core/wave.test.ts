import { describe, expect, it } from "vitest";

import { waveWing } from "./wave";

const samples = Array.from({ length: 201 }, (_, index) => index / 200);

describe("waveWing", () => {
  it("rests at the start and the end of the step", () => {
    expect(waveWing(0)).toBe(0);
    expect(waveWing(1)).toBe(0);
  });

  it("holds the wing raised through the middle of the step", () => {
    for (const progress of samples.filter((p) => p >= 0.2 && p <= 0.8)) {
      expect(waveWing(progress)).toBeGreaterThan(1);
    }
  });

  it("waggles back and forth two or three times", () => {
    const middle = samples.filter((p) => p >= 0.2 && p <= 0.8).map(waveWing);
    const level = middle.reduce((sum, angle) => sum + angle) / middle.length;
    const sides = middle.map((angle) => Math.sign(angle - level));
    const crossings = sides.slice(1).filter((side, index) => side !== sides[index]).length;
    expect(crossings).toBeGreaterThanOrEqual(2);
    expect(crossings).toBeLessThanOrEqual(5);
  });

  it("holds still outside the step", () => {
    expect(waveWing(-1)).toBe(0);
    expect(waveWing(2)).toBe(0);
  });
});
