import { describe, expect, it } from "vitest";

import type { Event } from "../../../core/contracts";
import { WINDOW_MS, attribute, payoff } from "./attribution";

const bit = { id: "pratfall", startedAt: 1000, doneAt: 2000 };
const smile = (t: number, level: number): Event => ({
  t,
  type: "observation.smile",
  source: "smile",
  data: { level, delta: 0 },
});
const seen = (t: number, type: string): Event => ({ t, type, source: "kid", data: {} });

describe("attribute", () => {
  it("is the best smile in the window after the punchline minus the smile before the bit", () => {
    const events = [smile(800, 0.2), smile(2100, 0.5), smile(2500, 0.9), smile(3000, 0.4)];
    expect(attribute(bit, events)).toEqual({
      bit: "pratfall",
      smileDelta: 0.7,
      laugh: false,
      walkedAway: false,
      windowMs: WINDOW_MS,
    });
  });

  it("ignores smiles outside the window and stale ones before the bit", () => {
    const events = [smile(-500, 0.9), smile(1500, 0.8), smile(2000, 0.8), smile(2300, 0.6)];
    const late = smile(2000 + WINDOW_MS + 1, 1);
    expect(attribute(bit, [...events, late])?.smileDelta).toBeCloseTo(0.6);
  });

  it("can be negative when the kid smiles less than before", () => {
    expect(attribute(bit, [smile(900, 0.8), smile(2200, 0.3)])?.smileDelta).toBeCloseTo(-0.5);
  });

  it("has no data when no face is seen in the window", () => {
    expect(attribute(bit, [smile(900, 0.8), seen(2500, "observation.gesture")])).toBeNull();
  });

  it("notes a laugh and a walk-away in the window", () => {
    const laughed = attribute(bit, [smile(2100, 0.2), seen(2200, "observation.laugh")]);
    expect(laughed?.laugh).toBe(true);
    const left = attribute(bit, [seen(2100, "observation.walk_away")]);
    expect(left).toMatchObject({ walkedAway: true, smileDelta: 0 });
  });
});

describe("payoff", () => {
  const attributed = { bit: "b", smileDelta: 0, laugh: false, walkedAway: false, windowMs: 1 };

  it("is a hit on a big enough smile or a laugh", () => {
    expect(payoff({ ...attributed, smileDelta: 0.5 })).toEqual({ hit: true, value: 0.5 });
    expect(payoff({ ...attributed, smileDelta: 0.1 }).hit).toBe(false);
    expect(payoff({ ...attributed, smileDelta: 0.1, laugh: true })).toEqual({
      hit: true,
      value: 0.6,
    });
  });

  it("is a miss that costs when the kid walks away", () => {
    expect(payoff({ ...attributed, smileDelta: 0.9, walkedAway: true })).toEqual({
      hit: false,
      value: -1,
    });
  });
});
