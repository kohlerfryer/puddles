import { describe, expect, it } from "vitest";

import { fakeBrain, routine } from "../kernel/testing";
import { type GateCurve, type GateOptions, simulationGate } from "./gate";
import { profiles } from "./profiles";

const options: GateOptions = { sessions: 2, horizon: 4, seed: 1 };

function only(curves: GateCurve[]): GateCurve {
  const [first] = curves;
  if (!first) throw new Error("no curves");
  return first;
}

const brain = (decide: Parameters<typeof fakeBrain>[2]) => [
  ["broken", () => fakeBrain("broken", { every_s: 3 }, decide)] as const,
];

describe("simulationGate", () => {
  it("reports a clean run of the simulator's policies", () => {
    const curves = simulationGate(options);
    expect(curves).toHaveLength(2 * profiles.length);
    for (const curve of curves) {
      expect(curve).toMatchObject({ crashes: [], hangs: 0, unsafe: [], over_budget_share: 0 });
      expect(curve.regret).toHaveLength(4);
      expect(curve.smiles_per_bit).toBeGreaterThanOrEqual(0);
      expect(curve.smiles_per_bit).toBeLessThanOrEqual(1);
    }
    expect(curves.some((curve) => curve.smiles_per_bit > 0)).toBe(true);
  });

  it("reports a brain that throws as a crash", () => {
    const policies = brain(({ t }) => {
      if (t > 4000) throw new Error("oops");
      return routine("broken", 1, "walk_to", "fall_over");
    });
    const curve = only(simulationGate({ ...options, policies }));
    expect(curve.crashes).toHaveLength(1);
    expect(curve.crashes[0]).toMatch(/^threw at t=\d+: Error: oops$/);
  });

  it("reports a session that never finishes its bits as a hang", () => {
    const curve = only(simulationGate({ ...options, policies: brain(() => null) }));
    expect(curve.hangs).toBe(options.sessions);
    expect(curve.crashes).toEqual([]);
  });

  it("reports an intent the guardian's rules reject as unsafe", () => {
    const step = { skill: "walk_to", args: {}, say: "Go climb the stairs" };
    const policies = brain(() => ({ ...routine("broken", 1, "walk_to"), steps: [step] }));
    const curve = only(simulationGate({ ...options, policies }));
    expect(curve.unsafe).toEqual(['blocklist: blocked "climb"']);
  });

  it("reports the share of ticks over a plugin's time budget", () => {
    let ms = 0;
    const curves = simulationGate({ ...options, now: () => (ms += 10) });
    expect(curves.every((curve) => curve.over_budget_share > 0)).toBe(true);
  });

  it("is the same for the same seed", () => {
    expect(simulationGate(options)).toEqual(simulationGate(options));
  });
});
