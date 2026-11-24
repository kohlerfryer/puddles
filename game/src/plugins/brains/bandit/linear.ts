import { DISCOUNT, type Arm, type Model, type Recency } from "./model";
import { normal } from "./sampling";

/** The comedy features arms are described by (spec §12). */
const FEATURES = [
  "slapstick",
  "surprise",
  "callback",
  "uses_object",
  "copies_kid",
  "gross",
  "scary_light",
  "musical",
  "sleepy",
];
const DIM = 2 * FEATURES.length + 1;
/** Prior precision of each weight, which discounting fades back towards. */
const RIDGE = 1;
/** Scales the posterior spread: higher explores more. */
const SPREAD = 0.3;

type Matrix = number[][];
const at = (m: Matrix, i: number, j: number) => m[i]?.[j] ?? 0;
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);

/** An arm in context: which features it has, how recently each of them played, and a bias. */
export function context(arm: Arm, recency: Recency): number[] {
  const has = FEATURES.map((feature) => (arm.features.includes(feature) ? 1 : 0));
  const stale = FEATURES.map((feature, i) => (has[i] ?? 0) * (recency.get(feature) ?? 0));
  return [...has, ...stale, 1];
}

/** The lower-triangular L with m = L Lᵀ, for a symmetric positive definite m. */
function cholesky(m: Matrix): Matrix {
  const l: Matrix = m.map(() => new Array<number>(m.length).fill(0));
  l.forEach((row, i) => {
    for (let j = 0; j <= i; j++) {
      const sum = at(m, i, j) - dot(row.slice(0, j), l[j]?.slice(0, j) ?? []);
      row[j] = i === j ? Math.sqrt(sum) : sum / at(l, j, j);
    }
  });
  return l;
}

/** Solves L y = b by forward substitution. */
function forward(l: Matrix, b: readonly number[]): number[] {
  const y: number[] = [];
  b.forEach((value, i) => y.push((value - dot(l[i]?.slice(0, i) ?? [], y)) / at(l, i, i)));
  return y;
}

/** Solves Lᵀ x = y by back substitution. */
function backward(l: Matrix, y: readonly number[]): number[] {
  const x = new Array<number>(y.length).fill(0);
  for (let i = y.length - 1; i >= 0; i--) {
    const rest = l
      .slice(i + 1)
      .reduce((sum, row, k) => sum + (row[i] ?? 0) * (x[i + 1 + k] ?? 0), 0);
    x[i] = ((y[i] ?? 0) - rest) / at(l, i, i);
  }
  return x;
}

/**
 * Thompson sampling over a Bayesian linear model of the payoff value on each arm's features and
 * their recency, so it learns that a feature it loves goes stale with repetition. Discounted:
 * each update fades the evidence towards the prior.
 */
export function linearModel(): Model {
  const ridge = (i: number, j: number) => (i === j ? RIDGE : 0);
  let precision: Matrix = Array.from({ length: DIM }, (_, i) =>
    Array.from({ length: DIM }, (_, j) => ridge(i, j)),
  );
  let target = new Array<number>(DIM).fill(0);
  return {
    posterior(arms, recency) {
      const l = cholesky(precision);
      const y = forward(l, target);
      const xs = arms.map((arm) => context(arm, recency));
      return (random) => {
        const weights = backward(
          l,
          y.map((v) => v + SPREAD * normal(random)),
        );
        return xs.map((x) => dot(x, weights));
      };
    },
    update(arm, { value }, recency) {
      const x = context(arm, recency);
      const fade = (p: number, i: number, j: number) =>
        DISCOUNT * p + (1 - DISCOUNT) * ridge(i, j) + (x[i] ?? 0) * (x[j] ?? 0);
      precision = precision.map((row, i) => row.map((p, j) => fade(p, i, j)));
      target = target.map((f, i) => DISCOUNT * f + value * (x[i] ?? 0));
    },
  };
}
