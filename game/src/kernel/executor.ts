import type { Intent, Outcome, Step } from "../core/contracts";
import type {
  Activity,
  Behavior,
  BehaviorRun,
  Emitted,
  Finished,
  PluginContext,
  SkillPlugin,
} from "./plugins";

/** Plays intents step by step through skills, one intent at a time. */
export interface Executor {
  /** The intent playing now, or null when idle. */
  readonly current: Intent | null;
  /** Starts the intent if nothing outranks it, interrupting a lower-priority one. Returns whether it started. */
  offer(intent: Intent, ctx: PluginContext): boolean;
  /** Advances the running step by one tick. */
  tick(ctx: PluginContext): void;
}

interface Running {
  readonly intent: Intent;
  /** Picks each next step; a routine's walks its steps, a behavior's is its state machine. */
  readonly next: BehaviorRun;
  /** Index of the step playing now. */
  step: number;
  activity: Activity | null;
}

interface Player {
  readonly skills: ReadonlyMap<string, SkillPlugin>;
  readonly behaviors: ReadonlyMap<string, Behavior>;
  readonly emit: (event: Emitted) => void;
  running: Running | null;
}

const isRoutine = (run: Running) => run.intent.kind === "routine";

/** Where an outcome happened: the step for a routine, always 0 for a behavior (one choice). */
const outcomeStep = (run: Running) => (isRoutine(run) ? run.step : 0);

function outcome(player: Player, data: Outcome) {
  player.emit({ type: `outcome.${data.status}`, data: { ...data } });
}

/** Plays a routine's steps in order, stopping at the first that fails. */
function walk(steps: readonly Step[]): BehaviorRun {
  let at = -1;
  return (last) => {
    if (last?.status === "failed") return last;
    at += 1;
    return steps[at] ?? { status: "done" };
  };
}

/** Ends the intent; a behavior reports its one outcome here, a routine already did per step. */
function end(player: Player, run: Running, finished: Finished) {
  player.running = null;
  if (!isRoutine(run)) outcome(player, { step: 0, ...finished });
  const { brain } = run.intent;
  player.emit(
    finished.status === "done"
      ? { type: "intent.done", data: { brain } }
      : { type: "intent.failed", data: { brain, step: outcomeStep(run) } },
  );
}

function play(player: Player, run: Running, next: Step | Finished, ctx: PluginContext) {
  if (!("skill" in next)) {
    end(player, run, next);
    return;
  }
  const skill = player.skills.get(next.skill);
  if (skill) {
    run.activity = skill.start(next.args, ctx);
    return;
  }
  const failed: Finished = { status: "failed", reason: `unknown skill: ${next.skill}` };
  if (isRoutine(run)) outcome(player, { step: run.step, ...failed });
  end(player, run, failed);
}

function finish(player: Player, run: Running, finished: Finished, ctx: PluginContext) {
  if (isRoutine(run)) outcome(player, { step: run.step, ...finished });
  const next = run.next(finished);
  if ("skill" in next) run.step += 1;
  play(player, run, next, ctx);
}

/** How to play the intent, or why it can't be played. */
function plan(player: Player, intent: Intent, ctx: PluginContext): BehaviorRun | string {
  if (intent.kind === "routine" && intent.steps) return walk(intent.steps);
  if (intent.kind !== "behavior" || !intent.behavior) {
    return "the executor plays routines and behaviors only";
  }
  const { id, params } = intent.behavior;
  const behavior = player.behaviors.get(id);
  return behavior ? behavior(params, ctx) : `unknown behavior: ${id}`;
}

function outranked(running: Running | null, intent: Intent): string | null {
  if (running && running.intent.priority >= intent.priority) {
    return `${running.intent.brain} is running at priority ${String(running.intent.priority)}`;
  }
  return null;
}

function interrupt(player: Player, running: Running, by: string) {
  outcome(player, {
    step: outcomeStep(running),
    status: "interrupted",
    reason: `preempted by ${by}`,
  });
  player.emit({ type: "intent.preempted", data: { brain: running.intent.brain, by } });
}

function offer(player: Player, intent: Intent, ctx: PluginContext): boolean {
  const next = outranked(player.running, intent) ?? plan(player, intent, ctx);
  if (typeof next === "string") {
    player.emit({ type: "intent.dropped", data: { brain: intent.brain, reason: next } });
    return false;
  }
  if (player.running) interrupt(player, player.running, intent.brain);
  const run: Running = { intent, next, step: 0, activity: null };
  player.running = run;
  const { brain, priority, why } = intent;
  player.emit({ type: "intent.started", data: { brain, priority, why } });
  play(player, run, next(null), ctx);
  return true;
}

export function createExecutor(
  skills: ReadonlyMap<string, SkillPlugin>,
  emit: (event: Emitted) => void,
  behaviors: ReadonlyMap<string, Behavior> = new Map(),
): Executor {
  const player: Player = { skills, behaviors, emit, running: null };
  return {
    get current() {
      return player.running?.intent ?? null;
    },
    offer: (intent, ctx) => offer(player, intent, ctx),
    tick(ctx) {
      const run = player.running;
      const status = run?.activity?.tick(ctx.t);
      if (run && status && status !== "running") finish(player, run, status, ctx);
    },
  };
}
