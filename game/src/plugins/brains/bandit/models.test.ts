import { describe, expect, it } from "vitest";

import { seededRandom } from "../../../core/random";
import { betaModel } from "./beta";
import { context, linearModel } from "./linear";
import type { Arm, Model, Payoff, Recency } from "./model";

const pratfall: Arm = { id: "pratfall", features: ["slapstick"], skills: ["fall_over"] };
const song: Arm = { id: "song", features: ["musical"], skills: ["quack"] };
const nap: Arm = { id: "nap", features: ["sleepy"], skills: ["nap"] };
const arms = [pratfall, song, nap];
const fresh: Recency = new Map();

const hit: Payoff = { hit: true, value: 0.8 };
const miss: Payoff = { hit: false, value: 0 };

/** Mean of many posterior draws per arm. */
function means(model: Model, recency: Recency = fresh): number[] {
  const sample = model.posterior(arms, recency);
  const random = seededRandom(7);
  const sums = arms.map(() => 0);
  for (let i = 0; i < 2000; i++) {
    sample(random).forEach((draw, a) => (sums[a] = (sums[a] ?? 0) + draw));
  }
  return sums.map((sum) => sum / 2000);
}

function teach(model: Model, times: number, arm: Arm, payoff: Payoff) {
  for (let i = 0; i < times; i++) model.update(arm, payoff, fresh);
}

describe.each([
  ["beta", betaModel],
  ["linear", linearModel],
])("%s model", (_name, make) => {
  it("draws one value per arm", () => {
    expect(make().posterior(arms, fresh)(seededRandom(1))).toHaveLength(3);
  });

  it("learns which arm pays", () => {
    const model = make();
    teach(model, 10, pratfall, miss);
    teach(model, 10, song, hit);
    const [p, s] = means(model);
    expect(s).toBeGreaterThan((p ?? 0) + 0.3);
  });

  it("forgets old payoffs, so it follows a kid whose taste drifts", () => {
    const model = make();
    teach(model, 40, song, hit);
    teach(model, 40, song, miss);
    teach(model, 4, nap, hit);
    const [, s, n] = means(model);
    expect(n).toBeGreaterThan(s ?? 1);
  });
});

describe("betaModel", () => {
  it("starts every arm at a uniform prior", () => {
    for (const mean of means(betaModel())) expect(mean).toBeCloseTo(0.5, 1);
  });
});

describe("linearModel", () => {
  it("describes an arm by its features, their recency and a bias", () => {
    const x = context(song, new Map([["musical", 2]]));
    expect(x).toHaveLength(19);
    expect(x.filter((v) => v !== 0)).toEqual([1, 2, 1]);
  });

  it("ignores the recency of features the arm does not have", () => {
    expect(context(nap, new Map([["musical", 2]]))).toEqual(context(nap, fresh));
  });

  it("learns that a feature goes stale with repetition", () => {
    const model = linearModel();
    const stale: Recency = new Map([["slapstick", 3]]);
    for (let i = 0; i < 15; i++) {
      model.update(pratfall, hit, fresh);
      model.update(pratfall, miss, stale);
    }
    const [freshPratfall] = means(model);
    const [stalePratfall] = means(model, stale);
    expect(freshPratfall).toBeGreaterThan((stalePratfall ?? 1) + 0.3);
  });
});
