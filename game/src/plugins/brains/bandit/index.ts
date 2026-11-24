/**
 * The bandit brain (spec §12): when Puddles is free, it picks the next bit by Thompson sampling
 * over a model per held-object archetype, waits out the attribution window after the punchline,
 * then learns from how the kid took it. Every choice is logged with its propensity.
 */

import type { Event, Intent, Step } from "../../../core/contracts";
import type { Random } from "../../../core/random";
import type { PluginContext, PluginFolder } from "../../../kernel/plugins";
import { type Attributed, WINDOW_MS, attribute, payoff } from "./attribution";
import manifest from "./manifest.json";
import type { Arm, Model, Recency } from "./model";

/** Posterior draws per choice used to estimate its propensity. */
const DRAWS = 100;
/** How many of the last bits count towards each feature's recency. */
const RECENT_BITS = 4;
const NO_OBJECT = "none";
const PRIORITY = 1;

/** One choice, logged for offline (IPS) evaluation and preference data. */
export interface Choice {
  readonly t: number;
  readonly arm: string;
  readonly archetype: string;
  /** Estimated chance that Thompson sampling picks this arm in this context. */
  readonly propensity: number;
  /** How the kid took it; null until the window closes, or if it never played or had no data. */
  reward: Attributed | null;
}

export interface Bandit {
  readonly plugin: PluginFolder;
  readonly choices: readonly Choice[];
}

export interface BanditOptions {
  readonly arms: readonly Arm[];
  /** Makes a fresh model; the bandit keeps one per object archetype. */
  readonly model: () => Model;
  /**
   * The models by archetype, kept across sessions: bandit statistics are per household (spec
   * §11). A fresh map when absent.
   */
  readonly household?: Map<string, Model>;
}

interface Open {
  readonly arm: Arm;
  readonly choice: Choice;
  readonly model: Model;
  readonly recency: Recency;
  startedAt?: number;
  doneAt?: number;
}

const ENDED = new Set(["intent.failed", "intent.dropped", "intent.preempted"]);

function argmax(values: readonly number[]): number {
  return values.reduce((best, v, i) => (v > (values[best] ?? -Infinity) ? i : best), 0);
}

/** Thompson's pick from one posterior draw, and how often other draws pick the same arm. */
function thompson(sample: (random: Random) => number[], random: Random) {
  const draws = Array.from({ length: DRAWS }, () => argmax(sample(random)));
  const [pick = 0] = draws;
  return { pick, propensity: draws.filter((d) => d === pick).length / DRAWS };
}

function recencyOf(played: readonly Arm[]): Recency {
  const counts = new Map<string, number>();
  for (const feature of played.slice(-RECENT_BITS).flatMap((arm) => arm.features))
    counts.set(feature, (counts.get(feature) ?? 0) + 1);
  return counts;
}

function routineOf(arm: Arm): [Step, ...Step[]] {
  const [first, ...rest] = arm.skills.map((skill) => ({ skill, args: {} }));
  if (!first) throw new Error(`bandit arm ${arm.id} has no skills`);
  return [first, ...rest];
}

/** Notes the bit's start and punchline; says whether it ended without playing through. */
function follow(open: Open, events: readonly Event[]): boolean {
  for (const { t, type, data } of events) {
    if (data.brain !== manifest.id) continue;
    if (ENDED.has(type)) return true;
    if (type === "intent.started") open.startedAt = t;
    if (type === "intent.done") open.doneAt = t;
  }
  return false;
}

/** What the brain remembers between ticks. */
interface State {
  readonly models: Map<string, Model>;
  readonly choices: Choice[];
  readonly played: Arm[];
  /** Recent observations, for attributing the open bit. */
  observed: Event[];
  archetype: string;
  /** The brain whose intent is playing, if any. */
  running: string | null;
  open: Open | null;
}

/** Whether the open bit is over; once its window closes, learns from how it landed. */
function settle(state: State, bit: Open, { t, events }: PluginContext): boolean {
  if (follow(bit, events)) return true;
  const { startedAt, doneAt } = bit;
  if (startedAt === undefined || doneAt === undefined || t < doneAt + WINDOW_MS) return false;
  bit.choice.reward = attribute({ id: bit.arm.id, startedAt, doneAt }, state.observed);
  if (bit.choice.reward) bit.model.update(bit.arm, payoff(bit.choice.reward), bit.recency);
  return true;
}

function choose(state: State, { arms, model }: BanditOptions, ctx: PluginContext): Intent {
  const { t, random } = ctx;
  const { archetype } = state;
  const current = state.models.get(archetype) ?? model();
  state.models.set(archetype, current);
  const recency = recencyOf(state.played);
  const { pick, propensity } = thompson(current.posterior(arms, recency), random);
  const arm = arms[pick];
  if (!arm) throw new Error("bandit has no arms");
  const choice: Choice = { t, arm: arm.id, archetype, propensity, reward: null };
  state.choices.push(choice);
  state.played.push(arm);
  state.open = { arm, choice, model: current, recency };
  const why = `bit ${arm.id}, propensity ${propensity.toFixed(2)}`;
  const { id } = manifest;
  const features = [...arm.features];
  return { brain: id, priority: PRIORITY, kind: "routine", steps: routineOf(arm), why, features };
}

function watch(state: State, events: readonly Event[]) {
  for (const { type, data } of events) {
    if (type === "observation.held_object" && typeof data.archetype === "string")
      state.archetype = data.archetype;
    if (type === "intent.started") state.running = String(data.brain);
    if (type === "intent.done" || type === "intent.failed") state.running = null;
  }
  state.observed.push(...events.filter((e) => e.type.startsWith("observation.")));
}

/** A fresh bandit brain over `arms`, and the log of its choices. */
export function bandit(options: BanditOptions): Bandit {
  options.arms.forEach(routineOf);
  const state: State = {
    models: options.household ?? new Map<string, Model>(),
    choices: [],
    played: [],
    observed: [],
    archetype: NO_OBJECT,
    running: null,
    open: null,
  };
  const decide = (ctx: PluginContext): Intent | null => {
    watch(state, ctx.events);
    if (state.open && !settle(state, state.open, ctx)) return null;
    state.open = null;
    state.observed = state.observed.filter((e) => e.t > ctx.t - WINDOW_MS);
    return state.running === null ? choose(state, options, ctx) : null;
  };
  return { plugin: { manifest, code: { decide } }, choices: state.choices };
}
