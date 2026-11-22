import type { Random } from "./random";
import { BANK } from "./world";

export type IdleKind = "wander" | "preen" | "nap";

/** One idle thing Puddles does: move from `from` to `to` (the same spot when staying put) over `seconds`. */
interface IdleAction {
  readonly kind: IdleKind;
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
}

interface IdleState {
  readonly action: IdleAction;
  readonly elapsed: number;
}

/** World units per second Puddles walks while wandering. */
export const WALK_SPEED = 120;
/** How far from each bank edge Puddles stays while idle. */
export const IDLE_MARGIN = 80;

/** Rolls below these pick wander, then preen; the rest nap, so wandering is most common and napping rarest. */
const WANDER_BELOW = 0.55;
const PREEN_BELOW = 0.85;
const PREEN_SECONDS = { min: 2, max: 4 };
const NAP_SECONDS = { min: 4, max: 8 };

function pickKind(roll: number): IdleKind {
  if (roll < WANDER_BELOW) return "wander";
  return roll < PREEN_BELOW ? "preen" : "nap";
}

function clampToIdleBank(x: number): number {
  return Math.min(Math.max(x, BANK.left + IDLE_MARGIN), BANK.right - IDLE_MARGIN);
}

function between(range: { min: number; max: number }, roll: number): number {
  return range.min + roll * (range.max - range.min);
}

/** Chooses what Puddles at `x` does next: wander somewhere on the bank, preen or nap. */
export function pickIdle(x: number, random: Random): IdleAction {
  const kind = pickKind(random());
  const here = clampToIdleBank(x);
  if (kind === "wander") {
    const to = between({ min: BANK.left + IDLE_MARGIN, max: BANK.right - IDLE_MARGIN }, random());
    return { kind, from: x, to, seconds: Math.abs(to - x) / WALK_SPEED };
  }
  const seconds = between(kind === "preen" ? PREEN_SECONDS : NAP_SECONDS, random());
  return { kind, from: here, to: here, seconds };
}

export function startIdle(x: number, random: Random): IdleState {
  return { action: pickIdle(x, random), elapsed: 0 };
}

/** Moves the idle loop on by `dt` seconds, picking a new action once the current one ends. */
export function advanceIdle(state: IdleState, dt: number, random: Random): IdleState {
  const elapsed = state.elapsed + dt;
  if (elapsed < state.action.seconds) return { action: state.action, elapsed };
  return startIdle(state.action.to, random);
}

/** Where Puddles stands at this point in the idle loop. */
export function idlePosition({ action, elapsed }: IdleState): number {
  const progress = action.seconds > 0 ? Math.min(elapsed / action.seconds, 1) : 1;
  return action.from + (action.to - action.from) * progress;
}
