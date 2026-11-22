import type { Mood } from "./reaction";
import type { RunnerStatus } from "./runner";
import type { Line } from "./speech";
import { VERB_SECONDS } from "./validator";
import {
  type Duck,
  type Frame,
  frameAt,
  type Nudge,
  type Plan,
  planVerb,
  type Scene,
} from "./verbs";

/**
 * What Puddles shows this frame, the push to give the object sticker if one lands now,
 * and the line to start saying if a step that speaks has just started.
 */
interface Cue {
  readonly frame: Frame;
  readonly mood: Mood;
  readonly nudge?: Nudge;
  readonly line?: Line;
}

interface Acting {
  readonly startedAt: number;
  readonly plan: Plan;
  nudged: boolean;
}

/** Acts out what the runner plays: plans each step as it starts, says its line and lands its nudge once. */
export function createActing() {
  let acting: Acting | undefined;

  return {
    /** Puddles' cue `now` ms on the runner's clock, from `duck` when a step starts; none when idle. */
    update(status: RunnerStatus, now: number, duck: Duck, scene: Scene): Cue | undefined {
      if (status.state === "idle") {
        acting = undefined;
        return undefined;
      }
      const { step, startedAt } = status;
      let line: Line | undefined;
      if (acting?.startedAt !== startedAt) {
        acting = { startedAt, plan: planVerb(step, duck, scene), nudged: false };
        if (step.say) line = { text: step.say, startedAt, seconds: VERB_SECONDS[step.do] };
      }
      const elapsed = (now - startedAt) / 1000;
      const cue = {
        frame: frameAt(acting.plan, elapsed),
        mood: status.mood,
        ...(line && { line }),
      };
      const { nudge } = acting.plan;
      if (!nudge || acting.nudged || elapsed < nudge.at) return cue;
      acting.nudged = true;
      return { ...cue, nudge };
    },
  };
}
