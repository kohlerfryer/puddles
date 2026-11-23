import { describe, expect, it } from "vitest";

import { ASK_TIMEOUT_MS } from "./ask";
import { RING_RADIUS, SPARKLE_RADIUS, SPARKLES, sensingRing } from "./sensing";

describe("sensingRing", () => {
  it("starts with one sparkle at the top of the ring", () => {
    const [first, ...rest] = sensingRing(0);
    expect(rest).toEqual([]);
    expect(first?.x).toBeCloseTo(0);
    expect(first?.y).toBeCloseTo(-RING_RADIUS);
  });

  it("grows a sparkle at a time until the ring closes by the timeout", () => {
    const counts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (eighth) => sensingRing((eighth * ASK_TIMEOUT_MS) / 8).length,
    );
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8]);
    expect(sensingRing(ASK_TIMEOUT_MS * 3)).toHaveLength(SPARKLES);
  });

  it("pops each new sparkle in from nothing up to full size", () => {
    const step = ASK_TIMEOUT_MS / SPARKLES;
    expect(sensingRing(step).at(-1)?.r).toBe(0);
    expect(sensingRing(step + 100).at(-1)?.r).toBeGreaterThan(0);
    expect(sensingRing(step + 100).at(-1)?.r).toBeLessThan(SPARKLE_RADIUS);
    expect(sensingRing(step * 2 - 1).at(0)?.r).toBe(SPARKLE_RADIUS);
  });

  it("keeps every sparkle on the ring as it turns", () => {
    for (const elapsed of [0, 1234, 5000, ASK_TIMEOUT_MS]) {
      for (const sparkle of sensingRing(elapsed)) {
        expect(Math.hypot(sparkle.x, sparkle.y)).toBeCloseTo(RING_RADIUS);
      }
    }
  });

  it("turns the ring over time", () => {
    expect(sensingRing(1000)[0]?.x).not.toBeCloseTo(sensingRing(0)[0]?.x ?? 0);
  });
});
