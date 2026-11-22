import { OBJECT_PLANNERS } from "./objectVerbs";
import type { Step } from "./reaction";
import { type Duck, onTheSpot, type Plan, type Scene, VERB_PLANNERS } from "./verbs";

const PLANNERS = { ...VERB_PLANNERS, ...OBJECT_PLANNERS };

/** Turns a script step into timed moves for Puddles at `duck`; the moves add up to the verb's time. */
export function planVerb(step: Step, duck: Duck, scene: Scene): Plan {
  return (PLANNERS[step.do] ?? onTheSpot)(step, duck, scene);
}
