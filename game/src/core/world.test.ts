import { describe, expect, it } from "vitest";

import { POND } from "./pond";
import { BANK, farSideOf, HIDING_SPOTS, nearestHidingSpot } from "./world";

describe("BANK", () => {
  it("spans the pond's width in world units", () => {
    expect(BANK).toEqual({ left: 0, right: 1600 });
  });
});

describe("HIDING_SPOTS", () => {
  it("places the reeds and the rock where the pond draws them", () => {
    expect(HIDING_SPOTS).toEqual([
      { kind: "reed", x: POND.reeds[0]?.x, halfWidth: 30 },
      { kind: "reed", x: POND.reeds[1]?.x, halfWidth: 35 },
      { kind: "rock", x: POND.rock.x, halfWidth: 90 },
    ]);
  });

  it("keeps every spot on the bank", () => {
    for (const spot of HIDING_SPOTS) {
      expect(spot.x - spot.halfWidth).toBeGreaterThanOrEqual(BANK.left);
      expect(spot.x + spot.halfWidth).toBeLessThanOrEqual(BANK.right);
    }
  });
});

describe("farSideOf", () => {
  it("mirrors a position across the middle of the bank", () => {
    expect(farSideOf(200)).toBe(1400);
    expect(farSideOf(1400)).toBe(200);
  });

  it("maps each bank edge to the other", () => {
    expect(farSideOf(BANK.left)).toBe(BANK.right);
    expect(farSideOf(BANK.right)).toBe(BANK.left);
  });

  it("treats positions off the bank as the nearest edge", () => {
    expect(farSideOf(-50)).toBe(BANK.right);
    expect(farSideOf(1700)).toBe(BANK.left);
  });
});

describe("nearestHidingSpot", () => {
  it("hides behind the nearest spot on the side away from the threat", () => {
    const hide = nearestHidingSpot(900, 1200);
    expect(hide.spot.kind).toBe("rock");
    expect(hide.x).toBeLessThan(POND.rock.x - 90);
  });

  it("hides on the right of a spot when the threat is to its left", () => {
    const hide = nearestHidingSpot(1100, 600);
    expect(hide.spot.kind).toBe("rock");
    expect(hide.x).toBeGreaterThan(POND.rock.x + 90);
  });

  it("prefers a farther spot when the nearest one's safe side is far away", () => {
    const hide = nearestHidingSpot(1150, BANK.right);
    expect(hide.spot.x).toBe(POND.reeds[1]?.x);
    expect(hide.x).toBeLessThan(hide.spot.x);
  });

  it("stays on the bank when hiding behind a spot near an edge", () => {
    const left = nearestHidingSpot(BANK.left, BANK.right);
    expect(left.spot.x).toBe(POND.reeds[0]?.x);
    expect(left.x).toBeGreaterThanOrEqual(BANK.left);
    expect(left.x).toBeLessThan(left.spot.x);

    const right = nearestHidingSpot(BANK.right, BANK.left);
    expect(right.spot.x).toBe(POND.reeds[1]?.x);
    expect(right.x).toBeLessThanOrEqual(BANK.right);
    expect(right.x).toBeGreaterThan(right.spot.x);
  });
});
