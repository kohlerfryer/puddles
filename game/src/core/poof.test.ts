import { describe, expect, it } from "vitest";

import { POOF_MS, poofAt } from "./poof";

describe("poofAt", () => {
  it("bursts puffs outward that fade away", () => {
    const early = poofAt(POOF_MS * 0.1);
    const late = poofAt(POOF_MS * 0.9);
    expect(early.length).toBeGreaterThan(0);
    expect(late).toHaveLength(early.length);
    const reach = (puffs: typeof early): number =>
      Math.max(...puffs.map((puff) => Math.hypot(puff.x, puff.y)));
    const alpha = (puffs: typeof early): number => Math.max(...puffs.map((puff) => puff.alpha));
    expect(reach(late)).toBeGreaterThan(reach(early));
    expect(alpha(late)).toBeLessThan(alpha(early));
  });

  it("is gone once the poof is over", () => {
    expect(poofAt(POOF_MS)).toEqual([]);
    expect(poofAt(POOF_MS * 3)).toEqual([]);
  });

  it("spreads the puffs all the way round", () => {
    const puffs = poofAt(POOF_MS / 2);
    expect(puffs.some((puff) => puff.x < 0)).toBe(true);
    expect(puffs.some((puff) => puff.x > 0)).toBe(true);
    expect(puffs.some((puff) => puff.y < 0)).toBe(true);
    expect(puffs.some((puff) => puff.y > 0)).toBe(true);
  });
});
