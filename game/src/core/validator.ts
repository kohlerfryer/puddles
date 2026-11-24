import schema from "../../../shared/reaction.schema.json";
import { type Prop, propFor } from "../plugins/content/props";
import { SKILLS } from "../plugins/skill";
import type { Step, Traits, Verb } from "./reaction";
import { isReaction } from "./reactionSchema";

const MAX_STEPS = 5;
/** Longest a played script may last, in seconds. */
export const MAX_SECONDS = 6;
const MAX_SAY_WORDS = 12;

const MANIFESTS = new Map(SKILLS.map(({ manifest }) => [manifest.id, manifest]));

/** The manifest of the skill plugin that plays `verb`; every verb must have one. */
function skillFor(verb: string) {
  const manifest = MANIFESTS.get(verb);
  if (!manifest) throw new Error(`no skill plugin for the verb ${verb}`);
  return manifest;
}

/** Each verb's skill duration in seconds: caps a script near MAX_SECONDS and times its steps. */
export const VERB_SECONDS = Object.fromEntries(
  schema.$defs.Verb.enum.map((verb) => [verb, skillFor(verb).duration_s]),
) as Record<Verb, number>;

const KNOWN_VERBS = new Set<unknown>(schema.$defs.Verb.enum);

/** The schema has no "confused" mood, so curious stands in for the puzzled look. */
export const DEFAULT_SCRIPT: readonly Step[] = [
  { do: "sniff", target: "object", mood: "curious" },
  { do: "look_at", target: "camera", mood: "curious", say: "Hmm... what IS that?" },
];

/** Traits for the sticker Puddles gets when the model's reply can't be used. */
export const DEFAULT_TRAITS: Traits = {
  size: "medium",
  weight: "medium",
  shape: "other",
  edible: false,
};

/**
 * What the game plays for a reply: its traits and script, whether the reply was valid, and the
 * prop to spawn when the matcher's answer names one; the prop's traits replace the model's.
 */
export interface SafeReaction {
  readonly valid: boolean;
  readonly traits: Traits;
  readonly script: Step[];
  readonly prop?: Prop;
}

/** What Puddles does instead of a verb whose skill needs something the object lacks. */
const INSTEAD: Partial<Record<Verb, Verb>> = { eat: "peck", sit_on: "circle", wear: "push" };

/** Whether the object's traits meet a skill's need, such as `target.size:tiny|small`. */
function meets(need: string, traits: Traits): boolean {
  const [trait, values = ""] = need.replace(/^target\./, "").split(":");
  const entries: [string, unknown][] = Object.entries(traits);
  const value = entries.find(([key]) => key === trait)?.[1];
  return values.split("|").includes(String(value));
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isUnknownVerbStep(step: unknown): boolean {
  return typeof step === "object" && step !== null && "do" in step && !KNOWN_VERBS.has(step.do);
}

/** Drops unknown-verb steps and extra steps so a near-miss can still pass the schema. */
function trimScript(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("script" in data)) return data;
  if (!Array.isArray(data.script)) return data;
  const script: unknown[] = data.script;
  const known = script.filter((step) => !isUnknownVerbStep(step));
  return { ...data, script: known.slice(0, MAX_STEPS) };
}

function swapVerb(step: Step, traits: Traits): Step {
  const instead = INSTEAD[step.do];
  const met = skillFor(step.do).needs.every((need) => meets(need, traits));
  return instead && !met ? { ...step, do: instead } : step;
}

function cutSay(step: Step): Step {
  if (step.say === undefined) return step;
  const words = step.say.split(/\s+/).filter((word) => word !== "");
  return { ...step, say: words.slice(0, MAX_SAY_WORDS).join(" ") };
}

function fitTime(script: Step[]): Step[] {
  let seconds = 0;
  const end = script.findIndex((step) => {
    seconds += VERB_SECONDS[step.do];
    return seconds > MAX_SECONDS;
  });
  return end === -1 ? script : script.slice(0, end);
}

/** Turns raw model output into traits and a script the game can always play. */
export function safeReaction(raw: string): SafeReaction {
  const reaction = trimScript(parse(raw));
  if (!isReaction(reaction)) {
    return { valid: false, traits: DEFAULT_TRAITS, script: [...DEFAULT_SCRIPT] };
  }
  const prop = reaction.prop && propFor(reaction.prop, reaction.traits.size);
  const traits = prop?.traits ?? reaction.traits;
  const steps = reaction.script.map((step) => cutSay(swapVerb(step, traits)));
  return { valid: true, traits, script: fitTime(steps), ...(prop && { prop }) };
}

/** Turns raw model output into a script the game can always play. */
export function safeScript(raw: string): Step[] {
  return safeReaction(raw).script;
}
