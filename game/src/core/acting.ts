import type { Mood } from "./reaction";
import { planVerb } from "./planVerb";
import type { RunnerStatus } from "./runner";
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
 * and the line to start saying if a step that speaks has just started.
 */
interface Cue {
  readonly frame: Frame;
  readonly mood: Mood;
  readonly nudge?: Nudge;
  readonly line?: Line;
  readonly take?: Take;
}

interface Acting {
  readonly startedAt: number;
  readonly plan: Plan;
  /** The plan's nudge and take that have already landed. */
  readonly landed: Set<"nudge" | "take">;
}

/** `happening` if it falls due by `elapsed` and hasn't landed yet, marking it landed. */
function landing<T extends { readonly at: number }>(
  acting: Acting,
  event: "nudge" | "take",
  happening: T | undefined,
  elapsed: number,
): T | undefined {
  if (!happening || acting.landed.has(event) || elapsed < happening.at) return undefined;
  acting.landed.add(event);
  return happening;
}

/** Acts out what the runner plays: plans each step as it starts, says its line and lands its nudge and take once. */
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
        acting = { startedAt, plan: planVerb(step, duck, scene), landed: new Set() };
        if (step.say) line = { text: step.say, startedAt, seconds: VERB_SECONDS[step.do] };
      }
      const elapsed = (now - startedAt) / 1000;
      const nudge = landing(acting, "nudge", acting.plan.nudge, elapsed);
      const take = landing(acting, "take", acting.plan.take, elapsed);
      return {
        frame: frameAt(acting.plan, elapsed),
        mood: status.mood,
        ...(line && { line }),
        ...(nudge && { nudge }),
        ...(take && { take }),
      };
    },
  };
}
