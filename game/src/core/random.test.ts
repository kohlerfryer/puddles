import { describe, expect, it } from "vitest";

import { seededRandom } from "./random";

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
  });

  it("gives different sequences for different seeds", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it("stays in [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
