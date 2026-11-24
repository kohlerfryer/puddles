import { DISCOUNT, type Model } from "./model";
import { beta } from "./sampling";

/** Pseudo-counts of the uniform prior every arm starts from. */
const PRIOR = 1;

interface Counts {
  hits: number;
  misses: number;
}

/**
 * Beta-Bernoulli Thompson sampling per arm on a binary payoff (a hit or not), with discounted
 * counts: every update first fades all counts towards the prior.
 */
export function betaModel(): Model {
  const counts = new Map<string, Counts>();
  return {
    posterior(arms) {
      const params = arms.map((arm) => counts.get(arm.id) ?? { hits: 0, misses: 0 });
      return (random) =>
        params.map(({ hits, misses }) => beta(PRIOR + hits, PRIOR + misses, random));
    },
    update(arm, { hit }) {
      for (const c of counts.values()) {
        c.hits *= DISCOUNT;
        c.misses *= DISCOUNT;
      }
      const c = counts.get(arm.id) ?? { hits: 0, misses: 0 };
      if (hit) c.hits += 1;
      else c.misses += 1;
      counts.set(arm.id, c);
    },
  };
}
