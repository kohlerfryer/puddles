/** Posterior draws for Thompson sampling, from the kernel's seeded random source only. */

import type { Random } from "../../../core/random";

/** A standard normal draw (Box–Muller). */
export function normal(random: Random): number {
  const u = 1 - random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** A Gamma(shape, 1) draw for shape ≥ 1 (Marsaglia–Tsang). */
export function gamma(shape: number, random: Random): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(random);
    const v = (1 + c * x) ** 3;
    if (v > 0 && Math.log(1 - random()) < (x * x) / 2 + d - d * v + d * Math.log(v)) return d * v;
  }
}

/** A Beta(a, b) draw for a, b ≥ 1. */
export function beta(a: number, b: number, random: Random): number {
  const x = gamma(a, random);
  return x / (x + gamma(b, random));
}
