import { describe, expect, it } from "vitest";

import { seededRandom } from "../../../core/random";
import { beta, gamma, normal } from "./sampling";

const DRAWS = 20_000;

function moments(draw: () => number) {
  const xs = Array.from({ length: DRAWS }, draw);
  const mean = xs.reduce((sum, x) => sum + x, 0) / DRAWS;
  const variance = xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / DRAWS;
  return { mean, variance, min: Math.min(...xs), max: Math.max(...xs) };
}

describe("normal", () => {
  it("draws with mean 0 and variance 1", () => {
    const random = seededRandom(1);
    const { mean, variance } = moments(() => normal(random));
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 1);
  });
});

describe("gamma", () => {
  it.each([1, 3, 10])("draws Gamma(%f, 1): mean and variance equal the shape", (shape) => {
    const random = seededRandom(2);
    const { mean, variance, min } = moments(() => gamma(shape, random));
    expect(mean / shape).toBeCloseTo(1, 1);
    expect(variance / shape).toBeCloseTo(1, 1);
    expect(min).toBeGreaterThan(0);
  });
});

describe("beta", () => {
  it.each([
    [1, 1],
    [2, 8],
    [30, 5],
  ])("draws Beta(%f, %f) in (0, 1) around a / (a + b)", (a, b) => {
    const random = seededRandom(3);
    const { mean, min, max } = moments(() => beta(a, b, random));
    expect(mean).toBeCloseTo(a / (a + b), 1);
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThan(1);
  });

  it("repeats for the same seed", () => {
    const [first, second] = [seededRandom(4), seededRandom(4)];
    expect(beta(2, 3, first)).toBe(beta(2, 3, second));
  });
});
