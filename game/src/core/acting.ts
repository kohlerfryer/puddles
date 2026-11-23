import type { Mood, Step } from "./reaction";
import { planVerb } from "./planVerb";
import type { RunnerStatus } from "./runner";
import { shakeHead, type Sound, soundFor } from "./sounds";
import type { Line } from "./speech";
import { VERB_SECONDS } from "./validator";
import {
  type Duck,
  type Frame,
  frameAt,
  type Nudge,
  type Plan,
  type Scene,
  type Take,
} from "./verbs";

/**
 * What Puddles shows this frame, what happens to the object sticker if it happens now,
 * the line to start saying if a step that speaks has just started, and the sounds to play now.
 */
interface Cue {
  readonly frame: Frame;
  readonly mood: Mood;
  /** How far the head is turned in a "no" head shake, in radians. */
  readonly shake: number;
  readonly sounds?: readonly Sound[];
  readonly nudge?: Nudge;
  readonly line?: Line;
  readonly take?: Take;
}

interface Acting {
  readonly startedAt: number;
  readonly plan: Plan;
  readonly quack: Sound | undefined;
  /** When each hop in the plan takes off, in seconds. */
  readonly hops: readonly number[];
  /** The plan's nudge, take and hops that have already landed. */
  readonly landed: Set<string>;
}

/** `happening` if it falls due by `elapsed` and hasn't landed yet, marking it landed. */
function landing<T extends { readonly at: number }>(
  acting: Acting,
  event: string,
  happening: T | undefined,
  elapsed: number,
): T | undefined {
  if (!happening || acting.landed.has(event) || elapsed < happening.at) return undefined;
  acting.landed.add(event);
  return happening;
}

function hopsIn(plan: Plan): number[] {
  let start = 0;
  return plan.moves.flatMap((move) => {
    const at = start;
    start += move.seconds;
    return move.pose === "hop" ? [at] : [];
  });
}

function start(step: Step, startedAt: number, duck: Duck, scene: Scene): Acting {
  const plan = planVerb(step, duck, scene);
  const quack = soundFor({ kind: "step", step });
  return { startedAt, plan, quack, hops: hopsIn(plan), landed: new Set() };
}

/** The step's quack as it starts, then a boing as each hop takes off. */
function soundsNow(acting: Acting, starting: boolean, elapsed: number): Sound[] {
  const boings = acting.hops
    .filter((at, index) => landing(acting, `hop${String(index)}`, { at }, elapsed))
    .map(() => soundFor({ kind: "jump" }));
  return [starting ? acting.quack : undefined, ...boings].filter((sound) => sound !== undefined);
}

type Playing = Extract<RunnerStatus, { state: "playing" }>;

/** The cue `now` ms into the playing step; `starting` when the step has just begun. */
function cueAt(acting: Acting, status: Playing, now: number, starting: boolean): Cue {
  const { step, startedAt } = status;
  const elapsed = (now - startedAt) / 1000;
  const line =
    starting && step.say
      ? { text: step.say, startedAt, seconds: VERB_SECONDS[step.do] }
      : undefined;
  const nudge = landing(acting, "nudge", acting.plan.nudge, elapsed);
  const take = landing(acting, "take", acting.plan.take, elapsed);
  const sounds = soundsNow(acting, starting, elapsed);
  return {
    frame: frameAt(acting.plan, elapsed),
    mood: status.mood,
    shake: acting.quack === "no" ? shakeHead(elapsed) : 0,
    ...(line && { line }),
    ...(sounds.length > 0 && { sounds }),
    ...(nudge && { nudge }),
    ...(take && { take }),
  };
}

/**
 * Acts out what the runner plays: plans each step as it starts, says and quacks its line, and lands
 * its nudge, take and hop boings once.
 */
export function createActing() {
  let acting: Acting | undefined;

  return {
    /** Puddles' cue `now` ms on the runner's clock, from `duck` when a step starts; none when idle. */
    update(status: RunnerStatus, now: number, duck: Duck, scene: Scene): Cue | undefined {
      if (status.state === "idle") {
        acting = undefined;
        return undefined;
      }
      const starting = acting?.startedAt !== status.startedAt;
      if (!acting || starting) acting = start(status.step, status.startedAt, duck, scene);
      return cueAt(acting, status, now, starting);
    },
  };
}
