/**
 * The plugin contract harness: automatic tests every plugin gets from its manifest. It runs the
 * plugin in a headless kernel twice with the same seed and inputs, then checks its manifest and
 * outputs against the contracts, its time budgets, and that both sessions logged the same events.
 */

import type { Event, Manifest, Step } from "../core/contracts";
import { contractValidators } from "../core/contractsSchema";
import { TICK_HZ } from "./clock";
import { type Kernel, createKernel } from "./kernel";
import type { Emitted, PluginFolder } from "./plugins";
import { createRegistry } from "./registry";
import { fakeBrain, fakeSense, routine } from "./testing";

/** Ten seconds of play: long enough for skills to finish and timed brains to run a few times. */
const TICKS = 10 * TICK_HZ;
const SEED = 1;
/** Share of ticks a plugin may run over its time budget, so one GC pause doesn't fail CI. */
const SLOW_SHARE = 0.05;
const INPUT = "harness-input";
const PLAYER = "harness-player";

export interface HarnessOptions {
  /** Events fed to the kernel each tick, e.g. the ones a brain's cadence waits for. */
  readonly inputs?: (t: number) => readonly Emitted[];
  /** Arguments for each call of the skill under test. */
  readonly args?: Step["args"];
  /** Wall-clock ms for the time budgets; tests pass a fake one. */
  readonly now?: () => number;
}

/** Replays the skill under test from a brain of its own whenever the last call ended. */
function player(skill: string, args: Step["args"]): PluginFolder {
  let started = false;
  return fakeBrain(PLAYER, "tick", ({ events }) => {
    const ended = events.some((e) => e.type === "intent.done" || e.type === "intent.failed");
    if (started && !ended) return null;
    started = true;
    return { ...routine(PLAYER, 0, skill), steps: [{ skill, args }] };
  });
}

function drivers(manifest: Manifest, options: HarnessOptions): PluginFolder[] {
  const { inputs } = options;
  return [
    ...(inputs ? [fakeSense(INPUT, ({ t }) => [...inputs(t)])] : []),
    ...(manifest.kind === "skill" ? [player(manifest.id, options.args ?? {})] : []),
  ];
}

interface Session {
  readonly manifest: Manifest;
  readonly events: readonly Event[];
  /** What the plugin threw, if the session stopped early. */
  readonly crash: string | null;
}

/** Runs the whole session, or up to the tick where something threw, and says what it was. */
function play(kernel: Kernel): string | null {
  try {
    for (let i = 0; i < TICKS; i++) kernel.tick();
    return null;
  } catch (error) {
    return `crash: threw at t=${String(kernel.clock.t)}: ${String(error)}`;
  }
}

/** One headless session of the plugin, already accepted by the registry, and its drivers. */
function session(make: () => PluginFolder, options: HarnessOptions): Session {
  const folder = make();
  const manifest = folder.manifest as Manifest;
  const kernel = createKernel({
    plugins: [folder, ...drivers(manifest, options)],
    seed: SEED,
    ...(options.now && { now: options.now }),
  });
  const crash = play(kernel);
  return { manifest, events: kernel.log.events(), crash };
}

const isMoreSpecific = (type: string, declared: string) =>
  type === declared || type.startsWith(`${declared}.`);

function senseProblems(emits: readonly string[], events: readonly Event[]): string[] {
  return events
    .filter((event) => !emits.some((declared) => isMoreSpecific(event.type, declared)))
    .map((event) => `schema: emitted ${event.type}, which the manifest does not declare`);
}

function intentProblem(id: string, kinds: readonly string[], intent: unknown): string | null {
  if (!contractValidators.intent(intent)) {
    const errors = JSON.stringify(contractValidators.intent.errors);
    return `schema: proposed an intent that breaks the intent contract: ${errors}`;
  }
  if (!kinds.includes(intent.kind)) {
    return `schema: proposed a ${intent.kind} intent, which the manifest does not declare`;
  }
  return intent.brain === id ? null : `schema: proposed an intent as ${intent.brain}`;
}

function brainProblems(id: string, kinds: readonly string[], events: readonly Event[]): string[] {
  return events
    .filter((event) => event.type === "intent.proposed")
    .map((event) => intentProblem(id, kinds, event.data))
    .filter((problem) => problem !== null);
}

/** Times each call of the skill from its start to its outcome. */
function skillProblems(durationS: number, events: readonly Event[]): string[] {
  const problems: string[] = [];
  let startedAt: number | null = null;
  let finished = 0;
  for (const event of events) {
    if (event.type === "intent.started") startedAt = event.t;
    else if (startedAt !== null && /^outcome\.(done|failed)$/.test(event.type)) {
      const ms = event.t - startedAt;
      if (ms > durationS * 1000)
        problems.push(`budget: ran ${String(ms)} ms, over its ${String(durationS)} s duration`);
      startedAt = null;
      finished += 1;
    }
  }
  if (finished === 0) problems.push(`budget: never finished in ${String(TICKS / TICK_HZ)} s`);
  return problems;
}

function budgetProblems(id: string, events: readonly Event[]): string[] {
  const over = events.filter((e) => e.type === "guardian.over_budget" && e.data.plugin === id);
  const [first] = over;
  if (!first || over.length <= TICKS * SLOW_SHARE) return [];
  const budget = String(first.data.budget_ms);
  return [`budget: over ${budget} ms on ${String(over.length)} of ${String(TICKS)} ticks`];
}

function kindProblems(manifest: Manifest, events: readonly Event[]): string[] {
  const own = events.filter((event) => event.source === manifest.id);
  switch (manifest.kind) {
    case "sense":
      return senseProblems(manifest.emits, own);
    case "brain":
      return brainProblems(manifest.id, manifest.intents, own);
    case "skill":
      return skillProblems(manifest.duration_s, events);
    case "content":
      return [];
  }
}

/** Events that must replay exactly: everything but wall-clock budget measurements. */
const replayed = (events: readonly Event[]) =>
  events.filter((e) => e.type !== "guardian.over_budget");

function determinismProblems(first: readonly Event[], second: readonly Event[]): string[] {
  const [a, b] = [replayed(first), replayed(second)];
  const same = (i: number) => JSON.stringify(a[i]) === JSON.stringify(b[i]);
  const at = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i).find(
    (i) => !same(i),
  );
  if (at === undefined) return [];
  const t = String((a[at] ?? b[at])?.t);
  return [`determinism: the same seed and inputs gave a different event at t=${t}`];
}

/**
 * Checks the plugin `make` returns against its manifest and the contracts; returns each problem
 * found, or nothing. `make` is called once per session, so it must build fresh plugin state.
 */
export function checkPlugin(make: () => PluginFolder, options: HarnessOptions = {}): string[] {
  const [rejected] = createRegistry([make()]).rejected;
  if (rejected) return [`manifest: ${rejected.reason}`];
  const { manifest, events, crash } = session(make, options);
  const problems = [
    ...(crash === null ? [] : [crash]),
    ...kindProblems(manifest, events),
    ...budgetProblems(manifest.id, events),
    ...determinismProblems(events, session(make, options).events),
  ];
  return [...new Set(problems)];
}
