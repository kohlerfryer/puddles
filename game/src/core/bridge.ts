/** How render plays the kernel's steps with today's runner and idle loop. */

import schema from "../../../shared/reaction.schema.json";
import nap from "../plugins/skill/nap/manifest.json";
import type { KernelEvent, Step as SkillStep } from "./contracts";
import { contractValidators } from "./contractsSchema";
import type { Step, Target, Verb } from "./reaction";

/** A reaction step for the runner, or a nap in the idle loop's nap pose for `seconds`. */
type Played =
  | { readonly kind: "step"; readonly step: Step }
  | { readonly kind: "nap"; readonly seconds: number };

const isVerb = (skill: string): skill is Verb => schema.$defs.Verb.enum.includes(skill);
const isTarget = (target: unknown): target is Target =>
  typeof target === "string" && schema.$defs.Target.enum.includes(target);

/** The step an `action.started` event starts, or nothing for any other event. */
export function startedStep({ type, data }: KernelEvent): SkillStep | undefined {
  if (type !== "action.started") return undefined;
  const step = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "brain"));
  return contractValidators.step(step) ? step : undefined;
}

/**
 * What render plays for a kernel step: the reaction verb of the same name (`do` is the skill,
 * `target` is `args.target`), a nap, or nothing for a skill it has no move for.
 */
export function played({ skill, args, mood = "happy", say }: SkillStep): Played | undefined {
  if (skill === nap.id) return { kind: "nap", seconds: nap.duration_s };
  if (!isVerb(skill)) return undefined;
  const { target } = args;
  return {
    kind: "step",
    step: {
      do: skill,
      mood,
      ...(isTarget(target) && { target }),
      ...(say !== undefined && { say }),
    },
  };
}
