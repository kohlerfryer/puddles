import type { Mood } from "./reaction";
import type { RunnerStatus } from "./runner";
import {
  type Duck,
  type Frame,
  frameAt,
  type Nudge,
  type Plan,
  planVerb,
  type Scene,
} from "./verbs";

/** What Puddles shows this frame, and the push to give the object sticker if one lands now. */
interface Cue {
  readonly frame: Frame;
  readonly mood: Mood;
  readonly nudge?: Nudge;
}

interface Acting {
  readonly startedAt: number;
  readonly plan: Plan;
  nudged: boolean;
}

/** Acts out what the runner plays: plans each step as it starts and lands its nudge once. */
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
        acting = { startedAt: status.startedAt, plan, nudged: false };
      }
      const elapsed = (now - status.startedAt) / 1000;
      const cue = { frame: frameAt(acting.plan, elapsed), mood: status.mood };
      const { nudge } = acting.plan;
      if (!nudge || acting.nudged || elapsed < nudge.at) return cue;
      acting.nudged = true;
      return { ...cue, nudge };
    },
  };
}
