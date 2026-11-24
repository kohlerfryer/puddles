import { TICK_HZ } from "../kernel/clock";
import { type Kernel, createKernel } from "../kernel/kernel";
import type { PluginFolder } from "../kernel/plugins";
import { type Punchline, simulatedKid } from "./kid";
import { bitSkills, fixedPolicy, pratfall, randomPolicy } from "./policies";
import { type KidProfile, profiles } from "./profiles";

/** Gives up on a session that runs this many seconds per bit, so a stuck policy can't hang. */
const MAX_S_PER_BIT = 10;

/**
 * Runs one headless session of a simulated kid against a policy, until `horizon` bits have
 * played or the kid walks away, and returns how each bit landed.
 */
export function session(
  profile: KidProfile,
  policy: PluginFolder,
  seed: number,
  horizon: number,
): readonly Punchline[] {
  const kid = simulatedKid(profile, () => kernel.log);
  const kernel: Kernel = createKernel({
    plugins: [kid.plugin, policy, ...bitSkills()],
    seed,
    now: () => 0,
    capacity: 1000,
  });
  const maxTicks = horizon * MAX_S_PER_BIT * TICK_HZ;
  for (let i = 0; i < maxTicks && kid.present && kid.punchlines.length < horizon; i++) {
    kernel.tick();
  }
  return kid.punchlines.slice(0, horizon);
}

/**
 * Regret after each of `horizon` bits: the best bit's worth minus the played one's, added up.
 * Once the kid has walked away every remaining bit is lost, so each adds the last best worth.
 */
export function cumulativeRegret(punchlines: readonly Punchline[], horizon: number): number[] {
  const last = punchlines.at(-1);
  const lost = last?.walkedAway ? last.best : 0;
  let total = 0;
  return Array.from({ length: horizon }, (_, i) => {
    const line = punchlines[i];
    total += line ? line.best - line.worth : lost;
    return total;
  });
}

/** Mean cumulative regret of one policy on one simulated kid. */
export interface Curve {
  readonly policy: string;
  readonly profile: string;
  readonly regret: number[];
}

export interface RegretOptions {
  readonly sessions: number;
  readonly horizon: number;
  readonly seed: number;
}

/** The policies the simulator compares; the bandit brain joins them later. */
const policies: readonly (readonly [string, () => PluginFolder])[] = [
  ["random", randomPolicy],
  [`fixed ${pratfall.id}`, () => fixedPolicy(pratfall)],
];

function meanCurve(make: () => PluginFolder, profile: KidProfile, options: RegretOptions) {
  const { sessions, horizon, seed } = options;
  const sum = new Array<number>(horizon).fill(0);
  for (let s = 0; s < sessions; s++) {
    const curve = cumulativeRegret(session(profile, make(), seed + s, horizon), horizon);
    curve.forEach((regret, i) => (sum[i] = (sum[i] ?? 0) + regret));
  }
  return sum.map((total) => total / sessions);
}

/** Regret curves for every policy against every simulated kid, averaged over sessions. */
export function regretCurves(options: RegretOptions): Curve[] {
  return policies.flatMap(([policy, make]) =>
    profiles.map((profile) => ({
      policy,
      profile: profile.id,
      regret: meanCurve(make, profile, options),
    })),
  );
}
