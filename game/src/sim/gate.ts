/**
 * The simulation gate (spec §14.1): every policy plays sessions against every simulated kid in
 * the headless kernel, and each curve reports what the gate fails on: crashes, hangs, intents
 * the guardian's rules reject, and time-budget overruns, beside its regret and smiles per bit.
 */

import type { Event, Manifest, SkillManifest } from "../core/contracts";
import { contractValidators } from "../core/contractsSchema";
import { type Limits, type Violation, violation } from "../kernel/guardian/rules";
import type { Punchline } from "./kid";
import { bitSkills } from "./policies";
import { type KidProfile, profiles } from "./profiles";
import {
  type Curve,
  type Policy,
  type RegretOptions,
  type Run,
  meanRegret,
  policies as simulated,
  run,
} from "./simulator";

/** The scared-step cap intents are checked against until settings set one per personality. */
const MAX_SCARED_STEPS = 1;

export interface GateOptions extends RegretOptions {
  /** The policies to check; the simulator's own by default. */
  readonly policies?: readonly Policy[];
  /** Wall-clock ms for the time budgets; tests pass a fake one. */
  readonly now?: () => number;
}

/** One policy against one simulated kid, over every session; snake_case for the gate script. */
export interface GateCurve extends Curve {
  readonly smiles_per_bit: number;
  /** Each distinct crash. */
  readonly crashes: readonly string[];
  /** Sessions that ran out of time before their bits played. */
  readonly hangs: number;
  /** Each distinct reason the guardian's rules gave for rejecting a proposed intent. */
  readonly unsafe: readonly string[];
  /** Plugin time-budget overruns per tick. */
  readonly over_budget_share: number;
}

const limits: Limits = {
  skillSeconds: new Map(
    bitSkills().map(({ manifest }) => {
      const { id, duration_s } = manifest as Manifest & SkillManifest;
      return [id, duration_s];
    }),
  ),
  maxScaredSteps: MAX_SCARED_STEPS,
};

function unsafety(intent: unknown): Violation | null {
  if (!contractValidators.intent(intent)) return { rule: "schema", reason: "not a valid intent" };
  return violation(intent, limits);
}

interface Checked extends Run {
  readonly unsafe: readonly string[];
  readonly overBudget: number;
}

/** One session, watching every event it logs for unsafe intents and budget overruns. */
function checked(profile: KidProfile, policy: Policy, seed: number, options: GateOptions) {
  const unsafe: string[] = [];
  let overBudget = 0;
  const sink = (line: string) => {
    const { type, data } = JSON.parse(line) as Event;
    if (type === "guardian.over_budget") overBudget += 1;
    const broken = type === "intent.proposed" ? unsafety(data) : null;
    if (broken) unsafe.push(`${broken.rule}: ${broken.reason}`);
  };
  const { horizon, now } = options;
  const result = run(profile, policy[1](), { seed, horizon, sink, ...(now && { now }) });
  return { ...result, unsafe, overBudget } satisfies Checked;
}

const distinct = (lists: readonly (readonly string[])[]) => [...new Set(lists.flat())];

function smilesPerBit(punchlines: readonly Punchline[]): number {
  if (punchlines.length === 0) return 0;
  return punchlines.filter((line) => line.smiled).length / punchlines.length;
}

function curve(policy: Policy, profile: KidProfile, options: GateOptions): GateCurve {
  const { sessions, horizon, seed } = options;
  const runs = Array.from({ length: sessions }, (_, s) =>
    checked(profile, policy, seed + s, options),
  );
  const ticks = runs.reduce((sum, r) => sum + r.ticks, 0);
  return {
    policy: policy[0],
    profile: profile.id,
    regret: meanRegret(
      runs.map((r) => r.punchlines),
      horizon,
    ),
    smiles_per_bit: smilesPerBit(runs.flatMap((r) => r.punchlines)),
    crashes: distinct(runs.map((r) => (r.crash === null ? [] : [r.crash]))),
    hangs: runs.filter((r) => r.hung).length,
    unsafe: distinct(runs.map((r) => r.unsafe)),
    over_budget_share: ticks === 0 ? 0 : runs.reduce((sum, r) => sum + r.overBudget, 0) / ticks,
  };
}

/** Checks every policy against every simulated kid over `sessions` sessions each. */
export function simulationGate(options: GateOptions): GateCurve[] {
  const { policies = simulated } = options;
  return policies.flatMap((policy) => profiles.map((profile) => curve(policy, profile, options)));
}
