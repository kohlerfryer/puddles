import schema from "../../../shared/reaction.schema.json";
import type { Step, Traits, Verb } from "./reaction";
import { isReaction } from "./reactionSchema";

const MAX_STEPS = 5;
const MAX_SECONDS = 6;
const MAX_SAY_WORDS = 12;

/** Rough length of each verb, used only to cap a script near MAX_SECONDS. */
const VERB_SECONDS: Record<Verb, number> = {
  walk_to: 1.5,
  run_to: 1,
  run_away: 1.5,
  hide_behind: 1.5,
  look_at: 1,
  sniff: 1,
  peck: 1,
  eat: 1.5,
  push: 1.5,
  jump: 1,
  jump_over: 1.5,
  sit_on: 1.5,
  wear: 1.5,
  circle: 2,
  dance: 2,
  flap: 1,
  freeze: 1,
  fall_over: 1.5,
};

const KNOWN_VERBS = new Set<unknown>(schema.$defs.Verb.enum);

/** The schema has no "confused" mood, so curious stands in for the puzzled look. */
export const DEFAULT_SCRIPT: readonly Step[] = [
  { do: "sniff", target: "object", mood: "curious" },
  { do: "look_at", target: "camera", mood: "curious", say: "Hmm... what IS that?" },
];

const isSmall = (traits: Traits): boolean => traits.size === "tiny" || traits.size === "small";

/** A verb the object can't support, with the verb Puddles does instead. */
const SWAPS: Partial<Record<Verb, { allowed: (traits: Traits) => boolean; instead: Verb }>> = {
  eat: { allowed: (t) => t.edible && isSmall(t), instead: "peck" },
  sit_on: {
    allowed: (t) => !isSmall(t) && (t.shape === "flat" || t.shape === "other"),
    instead: "circle",
  },
  wear: { allowed: isSmall, instead: "push" },
};

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
  const swap = SWAPS[step.do];
  return swap && !swap.allowed(traits) ? { ...step, do: swap.instead } : step;
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

/** Turns raw model output into a script the game can always play. */
export function safeScript(raw: string): Step[] {
  const reaction = trimScript(parse(raw));
  if (!isReaction(reaction)) return [...DEFAULT_SCRIPT];
  const steps = reaction.script.map((step) => cutSay(swapVerb(step, reaction.traits)));
  return fitTime(steps);
}
