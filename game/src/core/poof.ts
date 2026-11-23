/** The little burst of puffs a sticker makes as it appears in the pond. */

export const POOF_MS = 400;
const PUFFS = 8;
/** How far the puffs fly from the sticker's middle, and how big each starts. */
const SPREAD = 60;
const PUFF_RADIUS = 14;

/** One puff, relative to the middle of the sticker; y grows downward. */
interface Puff {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly alpha: number;
}

/** The puffs `elapsed` ms after a sticker appears: flying out and fading, then none. */
export function poofAt(elapsed: number): Puff[] {
  if (elapsed >= POOF_MS) return [];
  const t = Math.max(elapsed, 0) / POOF_MS;
  const out = 1 - (1 - t) ** 2;
  return Array.from({ length: PUFFS }, (_, i) => {
    const angle = (i * 2 * Math.PI) / PUFFS;
    return {
      x: SPREAD * out * Math.cos(angle),
      y: SPREAD * out * Math.sin(angle),
      r: PUFF_RADIUS * (1 - t / 2),
      alpha: 1 - t,
    };
  });
}
