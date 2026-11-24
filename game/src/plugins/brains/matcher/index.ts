/**
 * The object matcher brain (spec §8), game half: the server's `/react` is the only part that sees
 * the held-up crop; its reply reaches the log as an `observation.object` event, and this brain
 * turns the reaction it carries into a routine for the guardian to check.
 */

import type { KernelEvent, Intent, Step } from "../../../core/contracts";
import type { Step as ReactionStep } from "../../../core/reaction";
import { isScript } from "../../../core/reactionSchema";
import type { PluginFolder } from "../../../kernel/plugins";
import manifest from "./manifest.json";

/** Above copy-me, so a held-up object interrupts whatever Puddles is doing, as it always has. */
const PRIORITY = 3;

/** A reaction step as a skill call: `do` is the skill and `target` is `args.target`. */
export function skillStep({ do: skill, target, mood, say }: ReactionStep): Step {
  return {
    skill,
    args: target === undefined ? {} : { target },
    mood,
    ...(say !== undefined && { say }),
  };
}

/** The script of the reaction an `observation.object` event carries, if it has a playable one. */
function scriptOf({ type, data }: KernelEvent): ReactionStep[] | undefined {
  const { reaction } = data;
  if (type !== manifest.cadence.on || typeof reaction !== "object" || reaction === null) {
    return undefined;
  }
  const script: unknown = Reflect.get(reaction, "script");
  return isScript(script) ? script : undefined;
}

export function matcherBrain(): PluginFolder {
  return {
    manifest,
    code: {
      decide: ({ events }): Intent | null => {
        const [first, ...rest] =
          events
            .map(scriptOf)
            .filter((script) => script !== undefined)
            .at(-1) ?? [];
        if (!first) return null;
        return {
          brain: manifest.id,
          priority: PRIORITY,
          kind: "routine",
          steps: [skillStep(first), ...rest.map(skillStep)],
          why: "react to the object the kid held up",
          features: ["uses_object"],
        };
      },
    },
  };
}
