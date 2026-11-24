import type { Intent, Outcome, Step } from "../core/contracts";
import type { Activity, Emitted, Finished, PluginContext, SkillPlugin } from "./plugins";

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
  readonly steps: readonly Step[];
  step: number;
  activity: Activity | null;
}

interface Player {
  readonly skills: ReadonlyMap<string, SkillPlugin>;
  readonly emit: (event: Emitted) => void;
  running: Running | null;
}

function outcome(player: Player, data: Outcome) {
  player.emit({ type: `outcome.${data.status}`, data: { ...data } });
}

function end(player: Player, run: Running, how: "done" | "failed") {
  player.running = null;
  const { brain } = run.intent;
  player.emit({
    type: `intent.${how}`,
    data: how === "done" ? { brain } : { brain, step: run.step },
  });
}

function finish(player: Player, run: Running, finished: Finished, ctx: PluginContext) {
  outcome(player, { step: run.step, ...finished });
  if (finished.status === "failed") {
    end(player, run, "failed");
    return;
  }
  run.step += 1;
  startStep(player, run, ctx);
}

function startStep(player: Player, run: Running, ctx: PluginContext) {
  const step = run.steps[run.step];
  if (!step) {
    end(player, run, "done");
    return;
  }
  const skill = player.skills.get(step.skill);
  if (!skill) {
    finish(player, run, { status: "failed", reason: `unknown skill: ${step.skill}` }, ctx);
    return;
  }
  run.activity = skill.start(step.args, ctx);
}

function refusal(running: Running | null, intent: Intent): string | null {
  if (intent.kind !== "routine" || !intent.steps) return "the executor plays routines only";
  if (running && running.intent.priority >= intent.priority) {
    return `${running.intent.brain} is running at priority ${String(running.intent.priority)}`;
  }
  return null;
}

function offer(player: Player, intent: Intent, ctx: PluginContext): boolean {
  const reason = refusal(player.running, intent);
  if (reason) {
    player.emit({ type: "intent.dropped", data: { brain: intent.brain, reason } });
    return false;
  }
  const { running } = player;
  if (running) {
    outcome(player, {
      step: running.step,
      status: "interrupted",
      reason: `preempted by ${intent.brain}`,
    });
    player.emit({
      type: "intent.preempted",
      data: { brain: running.intent.brain, by: intent.brain },
    });
  }
  const run: Running = { intent, steps: intent.steps ?? [], step: 0, activity: null };
  player.running = run;
  const { brain, priority, why } = intent;
  player.emit({ type: "intent.started", data: { brain, priority, why } });
  startStep(player, run, ctx);
  return true;
}

export function createExecutor(
  skills: ReadonlyMap<string, SkillPlugin>,
  emit: (event: Emitted) => void,
): Executor {
  const player: Player = { skills, emit, running: null };
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
