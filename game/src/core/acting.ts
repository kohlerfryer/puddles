import type { Mood } from "./reaction";
import { planVerb } from "./planVerb";
import type { RunnerStatus } from "./runner";
import {
  type Duck,
  type Frame,
  frameAt,
  type Nudge,
  type Plan,
  type Scene,
  type Take,
} from "./verbs";

/** What Puddles shows this frame, and what happens to the object sticker if it happens now. */
interface Cue {
  readonly frame: Frame;
  readonly mood: Mood;
  readonly nudge?: Nudge;
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

/** Acts out what the runner plays: plans each step as it starts and lands its nudge and take once. */
export function createActing() {
  let acting: Acting | undefined;

  return {
    /** Puddles' cue `now` ms on the runner's clock, from `duck` when a step starts; none when idle. */
    update(status: RunnerStatus, now: number, duck: Duck, scene: Scene): Cue | undefined {
      if (status.state === "idle") {
        acting = undefined;
        return undefined;
      }
      if (acting?.startedAt !== status.startedAt) {
        const plan = planVerb(status.step, duck, scene);
        acting = { startedAt: status.startedAt, plan, landed: new Set() };
      }
      const elapsed = (now - status.startedAt) / 1000;
      const nudge = landing(acting, "nudge", acting.plan.nudge, elapsed);
      const take = landing(acting, "take", acting.plan.take, elapsed);
      return {
        frame: frameAt(acting.plan, elapsed),
        mood: status.mood,
        ...(nudge && { nudge }),
        ...(take && { take }),
      };
    },
  };
}
