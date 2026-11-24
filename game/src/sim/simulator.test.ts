import { describe, expect, it } from "vitest";

import { bits, fixedPolicy, randomPolicy } from "./policies";
import { type KidProfile, profiles } from "./profiles";
import { cumulativeRegret, regretCurves, session } from "./simulator";

const [slapstickFan, scaredOfLoud] = profiles as [KidProfile, KidProfile];
const [pratfall] = bits;

describe("session", () => {
  it("plays bits until the horizon when the kid stays", () => {
    const punchlines = session(slapstickFan, randomPolicy(), 5, 8);
    expect(punchlines).toHaveLength(8);
  });

  it("ends early when the kid walks away", () => {
    const spooky = bits.find((b) => b.id === "spooky");
    if (!spooky) throw new Error("no spooky bit");
    const punchlines = session(scaredOfLoud, fixedPolicy(spooky), 5, 20);
    expect(punchlines.length).toBeLessThan(20);
    expect(punchlines.at(-1)?.walkedAway).toBe(true);
  });

  it("is the same session for the same seed", () => {
    expect(session(slapstickFan, randomPolicy(), 9, 10)).toEqual(
      session(slapstickFan, randomPolicy(), 9, 10),
    );
  });
});

describe("cumulativeRegret", () => {
  const line = (worth: number, best: number, walkedAway = false) => ({
    t: 0,
    features: [],
    worth,
    best,
    smiled: false,
    walkedAway,
  });

  it("adds up the gap between the best bit and the one played", () => {
    expect(cumulativeRegret([line(0.8, 0.8), line(0.1, 0.5), line(0.5, 0.5)], 3)).toEqual([
      0, 0.4, 0.4,
    ]);
  });

  it("counts the best bit as lost for every slot after the kid walks away", () => {
    expect(cumulativeRegret([line(0.5, 0.5), line(0.25, 0.75, true)], 4)).toEqual([
      0, 0.5, 1.25, 2,
    ]);
  });
});

describe("regretCurves", () => {
  const curves = regretCurves({ sessions: 6, horizon: 12, seed: 1 });
  const curve = (policy: string, profile: string) => {
    const found = curves.find((c) => c.policy === policy && c.profile === profile);
    if (!found) throw new Error(`no curve for ${policy} on ${profile}`);
    return found.regret;
  };

  it("gives a curve for each policy and simulated kid", () => {
    expect(curves.map((c) => `${c.policy} ${c.profile}`)).toEqual(
      ["random", `fixed ${pratfall?.id ?? ""}`].flatMap((policy) =>
        profiles.map((p) => `${policy} ${p.id}`),
      ),
    );
    expect(curves.every((c) => c.regret.length === 12)).toBe(true);
  });

  it("never lets regret go down", () => {
    for (const { regret } of curves) {
      expect(regret.every((r, i) => i === 0 || r >= (regret[i - 1] ?? 0) - 1e-9)).toBe(true);
    }
  });

  it("has no regret for a fixed bit the kid loves until the kid is bored of it", () => {
    const fixed = curve(`fixed ${pratfall?.id ?? ""}`, slapstickFan.id);
    expect(fixed.slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixed.at(-1)).toBeGreaterThan(0);
  });

  it("loses smiles from the start when playing at random", () => {
    expect(curve("random", slapstickFan.id)[2]).toBeGreaterThan(0);
  });

  it("is the same for the same seed", () => {
    expect(regretCurves({ sessions: 6, horizon: 12, seed: 1 })).toEqual(curves);
  });
});
