import { describe, expect, it } from "vitest";

import { appeal, profiles, watched, worth } from "./profiles";

const profile = (id: string) => {
  const found = profiles.find((p) => p.id === id);
  if (!found) throw new Error(`no profile ${id}`);
  return found;
};

const slapstickFan = profile("loves-slapstick");
const scaredOfLoud = profile("scared-of-loud");

describe("appeal", () => {
  it("adds what the kid loves to the baseline smile chance", () => {
    expect(appeal(slapstickFan, ["slapstick"], new Map()).smile).toBeCloseTo(0.8);
    expect(appeal(slapstickFan, ["musical"], new Map())).toEqual({ smile: 0.1, walkAway: 0 });
  });

  it("stops adding a feature once the kid has seen it enough times", () => {
    const twice = watched(watched(new Map(), ["slapstick"]), ["slapstick"]);
    expect(appeal(slapstickFan, ["slapstick"], twice).smile).toBeCloseTo(0.8);
    const thrice = watched(twice, ["slapstick"]);
    expect(appeal(slapstickFan, ["slapstick"], thrice).smile).toBe(0.1);
  });

  it("gives a chance of walking away when a bit has something the kid fears", () => {
    expect(appeal(scaredOfLoud, ["surprise"], new Map()).walkAway).toBe(0.5);
    expect(appeal(scaredOfLoud, ["sleepy"], new Map()).walkAway).toBe(0);
  });

  it("never gives a smile chance above 1", () => {
    const greedy = { ...slapstickFan, loves: { slapstick: 0.7, surprise: 0.7 } };
    expect(appeal(greedy, ["slapstick", "surprise"], new Map()).smile).toBe(1);
  });
});

describe("worth", () => {
  it("is the smile chance if the kid stays", () => {
    expect(worth({ smile: 0.8, walkAway: 0.5 })).toBe(0.4);
  });
});

describe("watched", () => {
  it("counts each feature of the bit without changing the old counts", () => {
    const before = new Map([["slapstick", 1]]);
    const after = watched(before, ["slapstick", "surprise"]);
    expect(after).toEqual(
      new Map([
        ["slapstick", 2],
        ["surprise", 1],
      ]),
    );
    expect(before.get("slapstick")).toBe(1);
  });
});
