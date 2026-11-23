/** The ring of sparkles that grows round Puddles' thought bubble while he waits for the server. */

import { ASK_TIMEOUT_MS } from "./ask";
import { THOUGHT_WIDTH } from "./thought";

/** How many sparkles close the ring; the last appears as the request times out. */
export const SPARKLES = 8;
/** How far the sparkles sit from the middle of the cloud, clear of its puffs. */
export const RING_RADIUS = THOUGHT_WIDTH * 0.6;
export const SPARKLE_RADIUS = 5;
/** A new sparkle grows to full size over this long. */
const POP_MS = 300;
/** How fast the ring turns, in radians per millisecond. */
const SPIN = 0.0008;
const APART_MS = ASK_TIMEOUT_MS / SPARKLES;

/** One sparkle, relative to the middle of the cloud; y grows downward. */
interface Sparkle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** The sparkles `elapsed` ms after Puddles starts sensing: one more every so often, starting at the top. */
export function sensingRing(elapsed: number): Sparkle[] {
  const count = Math.min(SPARKLES, Math.floor(elapsed / APART_MS) + 1);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * 2 * Math.PI) / SPARKLES + elapsed * SPIN - Math.PI / 2;
    const grown = Math.min(1, (elapsed - i * APART_MS) / POP_MS);
    return {
      x: RING_RADIUS * Math.cos(angle),
      y: RING_RADIUS * Math.sin(angle),
      r: SPARKLE_RADIUS * grown,
    };
  });
}
