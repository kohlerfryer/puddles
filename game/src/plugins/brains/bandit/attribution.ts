/**
 * Reward attribution (spec §12): how the kid took a bit, from the observations around it. The
 * smile delta is the best smile in the window after the punchline minus the smile just before
 * the bit started; with no face in the window there is no data.
 */

import type { KernelEvent } from "../../../core/contracts";
import type { Payoff } from "./model";

/** How long after the punchline a smile, laugh or walk-away counts for the bit. */
export const WINDOW_MS = 4000;
/** How old a smile before the bit may be and still count as its baseline. */
const BASELINE_MS = 1000;
/** A smile delta this big is a hit for the Beta model. */
const HIT_DELTA = 0.3;
const LAUGH_BONUS = 0.5;
const WALK_AWAY_COST = 1;

/** One bit as it played: its arm, and kernel times it started and reached its punchline. */
export interface Played {
  readonly id: string;
  readonly startedAt: number;
  readonly doneAt: number;
}

export interface Attributed {
  readonly bit: string;
  readonly smileDelta: number;
  readonly laugh: boolean;
  readonly walkedAway: boolean;
  readonly windowMs: number;
}

const smiles = (events: readonly KernelEvent[]) =>
  events.filter((e) => e.type === "observation.smile").map((e) => Number(e.data.level));

/** How the kid took `bit`, from the events around it; null when no face was seen after it. */
export function attribute(bit: Played, events: readonly KernelEvent[]): Attributed | null {
  const after = events.filter((e) => e.t > bit.doneAt && e.t <= bit.doneAt + WINDOW_MS);
  const walkedAway = after.some((e) => e.type === "observation.walk_away");
  const reactions = smiles(after);
  if (reactions.length === 0 && !walkedAway) return null;
  const before = events.filter((e) => e.t <= bit.startedAt && e.t > bit.startedAt - BASELINE_MS);
  const baseline = smiles(before).at(-1) ?? 0;
  return {
    bit: bit.id,
    smileDelta: reactions.length > 0 ? Math.max(...reactions) - baseline : 0,
    laugh: after.some((e) => e.type === "observation.laugh"),
    walkedAway,
    windowMs: WINDOW_MS,
  };
}

/** The binary hit and the full value the models learn from; walking away is a costly miss. */
export function payoff({ smileDelta, laugh, walkedAway }: Attributed): Payoff {
  if (walkedAway) return { hit: false, value: -WALK_AWAY_COST };
  return {
    hit: smileDelta >= HIT_DELTA || laugh,
    value: smileDelta + (laugh ? LAUGH_BONUS : 0),
  };
}
