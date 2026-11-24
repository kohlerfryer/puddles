import { TICK_HZ } from "../kernel/clock";
import { type Kernel, createKernel } from "../kernel/kernel";
import type { PluginFolder } from "../kernel/plugins";
import { type Punchline, simulatedKid } from "./kid";
import { bitSkills, fixedPolicy, pratfall, randomPolicy } from "./policies";
import { type KidProfile, profiles } from "./profiles";

/** Gives up on a session that runs this many seconds per bit, so a stuck policy can't hang. */
const MAX_S_PER_BIT = 10;

export interface RunOptions {
  readonly seed: number;
  readonly horizon: number;
  /** Wall-clock ms for the plugins' time budgets; sessions that don't check them pass none. */
  readonly now?: () => number;
  /** Receives every event the session logs, as a JSON line. */
  readonly sink?: (line: string) => void;
}

/** How one session went: the bits that landed, and whether it crashed or never finished. */
export interface Run {
  readonly punchlines: readonly Punchline[];
  readonly crash: string | null;
  readonly hung: boolean;
  readonly ticks: number;
}

/**
 * Runs one headless session of a simulated kid against a policy, until `horizon` bits have
 * played, the kid walks away, a plugin throws, or the session runs out of time.
 */
export function run(profile: KidProfile, policy: PluginFolder, options: RunOptions): Run {
  const { seed, horizon, now = () => 0, sink } = options;
  const kid = simulatedKid(profile, () => kernel.log);
  const kernel: Kernel = createKernel({
    plugins: [kid.plugin, policy, ...bitSkills()],
    seed,
    now,
    capacity: 1000,
    ...(sink && { sink }),
  });
  const playing = () => kid.present && kid.punchlines.length < horizon;
  const maxTicks = horizon * MAX_S_PER_BIT * TICK_HZ;
  let ticks = 0;
  let crash: string | null = null;
  try {
    for (; ticks < maxTicks && playing(); ticks++) kernel.tick();
  } catch (error) {
    crash = `threw at t=${String(kernel.clock.t)}: ${String(error)}`;
  }
  const punchlines = kid.punchlines.slice(0, horizon);
  return { punchlines, crash, hung: crash === null && playing(), ticks };
}

/** The punchlines of one session; see `run`. */
export function session(
  profile: KidProfile,
  policy: PluginFolder,
  seed: number,
  horizon: number,
): readonly Punchline[] {
  return run(profile, policy, { seed, horizon }).punchlines;
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

/** Mean cumulative regret over sessions, after each of `horizon` bits. */
export function meanRegret(sessions: readonly (readonly Punchline[])[], horizon: number) {
  const sum = new Array<number>(horizon).fill(0);
  for (const punchlines of sessions) {
    const curve = cumulativeRegret(punchlines, horizon);
    curve.forEach((regret, i) => (sum[i] = (sum[i] ?? 0) + regret));
  }
  return sum.map((total) => total / sessions.length);
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

/** A named policy, made fresh for each session. */
export type Policy = readonly [string, () => PluginFolder];

/** The policies the simulator compares; the bandit brain joins them later. */
export const policies: readonly Policy[] = [
  ["random", randomPolicy],
  [`fixed ${pratfall.id}`, () => fixedPolicy(pratfall)],
];

function meanCurve(make: () => PluginFolder, profile: KidProfile, options: RegretOptions) {
  const { sessions, horizon, seed } = options;
  const runs = Array.from({ length: sessions }, (_, s) =>
    session(profile, make(), seed + s, horizon),
  );
  return meanRegret(runs, horizon);
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
