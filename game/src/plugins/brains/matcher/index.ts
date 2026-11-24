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

interface Seen {
  readonly script: ReactionStep[];
  /** The bandit's features: the spawned prop and its archetype, when there is one. */
  readonly features: string[];
}

/** `prop:<id>` and `archetype:<archetype>` for the prop the reaction spawned, if any. */
function propFeatures(prop: unknown): string[] {
  if (typeof prop !== "object" || prop === null) return [];
  const id: unknown = Reflect.get(prop, "id");
  const archetype: unknown = Reflect.get(prop, "archetype");
  if (typeof id !== "string" || typeof archetype !== "string") return [];
  return [`prop:${id}`, `archetype:${archetype}`];
}

/** The reaction an `observation.object` event carries, if it has a playable script. */
function seenIn({ type, data }: KernelEvent): Seen | undefined {
  const { reaction } = data;
  if (type !== manifest.cadence.on || typeof reaction !== "object" || reaction === null) {
    return undefined;
  }
  const script: unknown = Reflect.get(reaction, "script");
  if (!isScript(script)) return undefined;
  return { script, features: ["uses_object", ...propFeatures(Reflect.get(reaction, "prop"))] };
}

export function matcherBrain(): PluginFolder {
  return {
    manifest,
    code: {
      decide: ({ events }): Intent | null => {
        const seen = events
          .map(seenIn)
          .filter((reaction) => reaction !== undefined)
          .at(-1);
        const [first, ...rest] = seen?.script ?? [];
        if (!seen || !first) return null;
        return {
          brain: manifest.id,
          priority: PRIORITY,
          kind: "routine",
          steps: [skillStep(first), ...rest.map(skillStep)],
          why: "react to the object the kid held up",
          features: seen.features,
        };
      },
    },
  };
}
