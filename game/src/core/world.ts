import { POND, SCENE_WIDTH } from "./pond";

/**
 * Puddles' world is one line along the bank, in the pond scene's units (`SCENE_WIDTH`
 * wide), so positions don't depend on the window size.
 */
export const BANK = { left: 0, right: SCENE_WIDTH } as const;

interface HidingSpot {
  readonly kind: "reed" | "rock";
  readonly x: number;
  readonly halfWidth: number;
}

interface Hide {
  readonly spot: HidingSpot;
  /** Where Puddles stands to be hidden from the threat. */
  readonly x: number;
}

/** Space left between Puddles and the spot Puddles hides behind. */
const HIDE_GAP = 20;

export const HIDING_SPOTS: readonly HidingSpot[] = [
  ...POND.reeds.map((reed) => ({ kind: "reed" as const, x: reed.x, halfWidth: reed.width / 2 })),
  { kind: "rock", x: POND.rock.x, halfWidth: POND.rock.width / 2 },
];

/** The point mirrored across the middle of the bank; positions off the bank count as its nearest edge. */
export function farSideOf(x: number): number {
  const onBank = Math.min(Math.max(x, BANK.left), BANK.right);
  return BANK.left + BANK.right - onBank;
}

function hideBehind(spot: HidingSpot, threatX: number): Hide {
  const away = threatX < spot.x ? 1 : -1;
  return { spot, x: spot.x + away * (spot.halfWidth + HIDE_GAP) };
}

/** The hiding place Puddles at `x` reaches soonest, on the side of its spot away from the threat. */
export function nearestHidingSpot(x: number, threatX: number): Hide {
  const hides = HIDING_SPOTS.map((spot) => hideBehind(spot, threatX));
  return hides.reduce((best, hide) => (Math.abs(hide.x - x) < Math.abs(best.x - x) ? hide : best));
}

/** The hiding place behind the spot farthest from the threat, on the side away from it. */
export function farthestHidingSpot(threatX: number): Hide {
  const hides = HIDING_SPOTS.map((spot) => hideBehind(spot, threatX));
  const distance = (hide: Hide): number => Math.abs(hide.spot.x - threatX);
  return hides.reduce((best, hide) => (distance(hide) > distance(best) ? hide : best));
}
