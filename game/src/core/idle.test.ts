import { describe, expect, it } from "vitest";

import {
  advanceIdle,
  IDLE_MARGIN,
  idleFacing,
  type IdleKind,
  idlePosition,
  pickIdle,
  startIdle,
  WALK_SPEED,
} from "./idle";
import { seededRandom } from "./random";
import { BANK } from "./world";

/** A random source that returns `values` in turn. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("pickIdle", () => {
  it("wanders to a spot on the bank at walking pace", () => {
    const action = pickIdle(400, sequence(0.1, 0.5));
    expect(action.kind).toBe("wander");
    expect(action.from).toBe(400);
    expect(action.to).toBe((BANK.left + BANK.right) / 2);
    expect(action.seconds).toBeCloseTo(Math.abs(action.to - 400) / WALK_SPEED);
  });

  it("preens in place for a few seconds", () => {
    const action = pickIdle(400, sequence(0.6, 0));
    expect(action).toEqual({ kind: "preen", from: 400, to: 400, seconds: 2 });
  });

  it("naps in place for longer than a preen", () => {
    const action = pickIdle(400, sequence(0.9, 0.999));
    expect(action.kind).toBe("nap");
    expect(action.from).toBe(400);
    expect(action.to).toBe(400);
    expect(action.seconds).toBeGreaterThan(4);
    expect(action.seconds).toBeLessThan(8);
  });

  it("keeps wander targets inside the bank's margins", () => {
    expect(pickIdle(400, sequence(0, 0)).to).toBe(BANK.left + IDLE_MARGIN);
    expect(pickIdle(400, sequence(0, 0.9999)).to).toBeCloseTo(BANK.right - IDLE_MARGIN, 0);
  });

  it("brings Puddles back onto the bank from off its edge", () => {
    expect(pickIdle(-100, sequence(0.6, 0)).to).toBe(BANK.left + IDLE_MARGIN);
  });

  it("mostly wanders, sometimes preens and naps, with a seeded source", () => {
    const random = seededRandom(2026);
    const counts: Record<IdleKind, number> = { wander: 0, preen: 0, nap: 0 };
    for (let i = 0; i < 1000; i++) {
      const action = pickIdle(800, random);
      counts[action.kind]++;
      expect(action.to).toBeGreaterThanOrEqual(BANK.left + IDLE_MARGIN);
      expect(action.to).toBeLessThanOrEqual(BANK.right - IDLE_MARGIN);
    }
    expect(counts.wander).toBeGreaterThan(counts.preen);
    expect(counts.preen).toBeGreaterThan(counts.nap);
    expect(counts.nap).toBeGreaterThan(0);
  });

  it("makes the same choices for the same seed", () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    expect([pickIdle(800, a), pickIdle(800, a)]).toEqual([pickIdle(800, b), pickIdle(800, b)]);
  });
});

describe("advanceIdle", () => {
  it("walks Puddles toward the wander target over time", () => {
    const state = startIdle(400, sequence(0.1, 0.5));
    const half = advanceIdle(state, state.action.seconds / 2, sequence(0));
    expect(idlePosition(half)).toBeCloseTo(600);
  });

  it("places Puddles at the target of a wander that has no distance to cover", () => {
    const state = startIdle(800, sequence(0.1, 0.5));
    expect(state.action.seconds).toBe(0);
    expect(idlePosition(state)).toBe(800);
  });

  it("holds Puddles still while preening", () => {
    const state = startIdle(400, sequence(0.6, 0));
    expect(idlePosition(advanceIdle(state, 1, sequence(0)))).toBe(400);
  });

  it("picks the next action from where the last one ended", () => {
    const state = startIdle(400, sequence(0.1, 0.5));
    const next = advanceIdle(state, state.action.seconds, sequence(0.6, 0));
    expect(next.action).toEqual({ kind: "preen", from: 800, to: 800, seconds: 2 });
    expect(next.elapsed).toBe(0);
  });
});

describe("idleFacing", () => {
  const wander = (from: number, to: number) => ({
    action: { kind: "wander" as const, from, to, seconds: 2 },
    elapsed: 0,
  });

  it("faces the way Puddles is walking", () => {
    expect(idleFacing(wander(600, 300), 1)).toBe(-1);
    expect(idleFacing(wander(300, 600), -1)).toBe(1);
  });

  it("keeps facing the same way while staying put", () => {
    expect(idleFacing(wander(400, 400), -1)).toBe(-1);
  });
});
