import type { Random } from "../../../core/random";

/** An arm: a bit Puddles can play, the skills it runs and its comedy features. */
export interface Arm {
  readonly id: string;
  readonly features: readonly string[];
  readonly skills: readonly string[];
}

/** How many of the last few bits had each comedy feature; repetition goes stale. */
export type Recency = ReadonlyMap<string, number>;

/** How a bit landed: a hit for the Beta model, a value for the linear one. */
export interface Payoff {
  readonly hit: boolean;
  readonly value: number;
}

/** A posterior over each arm's payoff; Thompson sampling plays the arm with the best draw. */
export interface Model {
  /** Draws one posterior sample per arm, in order, for this context. */
  posterior(arms: readonly Arm[], recency: Recency): (random: Random) => number[];
  update(arm: Arm, payoff: Payoff, recency: Recency): void;
}

/** How fast old payoffs fade, so the bandit follows a kid whose taste drifts. */
export const DISCOUNT = 0.98;
