/** Logic for the hidden dev panel: sticker traits to pick, preset scripts and pasted reactions. */

import { DEMO_SCRIPT, DEMO_TRAITS } from "./demo";
import type { Shape, Size, Step, Traits, Weight } from "./reaction";
import { isReaction } from "./reactionSchema";
import { DEFAULT_SCRIPT, safeScript } from "./validator";

interface DevPreset {
  readonly name: string;
  readonly traits: Traits;
  readonly script: readonly Step[];
}

type Pasted = { ok: true; traits: Traits; script: Step[] } | { ok: false; errors: string[] };

export const TRAIT_CHOICES: {
  readonly size: readonly Size[];
  readonly weight: readonly Weight[];
  readonly shape: readonly Shape[];
} = {
  size: ["tiny", "small", "medium", "big"],
  weight: ["light", "medium", "heavy"],
  shape: ["round", "flat", "long", "other"],
};

/** The demo first, then scripts a model could send, each with an object that allows its verbs. */
export const DEV_PRESETS: readonly DevPreset[] = [
  { name: "demo", traits: DEMO_TRAITS, script: DEMO_SCRIPT },
  { name: "confused", traits: DEMO_TRAITS, script: DEFAULT_SCRIPT },
  {
    name: "snack",
    traits: { size: "small", weight: "light", shape: "round", edible: true },
    script: [
      { do: "walk_to", target: "object", mood: "curious" },
      { do: "sniff", target: "object", mood: "curious" },
      { do: "eat", target: "object", mood: "happy", say: "Crunchy!" },
      { do: "dance", target: "none", mood: "happy" },
    ],
  },
  {
    name: "scary",
    traits: { size: "big", weight: "heavy", shape: "other", edible: false },
    script: [
      { do: "freeze", target: "object", mood: "scared", say: "Uh oh." },
      { do: "run_away", target: "object", mood: "scared" },
      { do: "hide_behind", target: "reeds", mood: "scared" },
    ],
  },
  {
    name: "cushion",
    traits: { size: "big", weight: "light", shape: "flat", edible: false },
    script: [
      { do: "circle", target: "object", mood: "curious" },
      { do: "sit_on", target: "object", mood: "proud", say: "My throne!" },
      { do: "look_at", target: "camera", mood: "proud" },
    ],
  },
  {
    name: "hat",
    traits: { size: "tiny", weight: "light", shape: "other", edible: false },
    script: [
      { do: "wear", target: "object", mood: "silly" },
      { do: "look_at", target: "camera", mood: "proud", say: "How do I look?" },
      { do: "flap", target: "none", mood: "silly" },
    ],
  },
];

function parseJson(raw: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(raw) };
  } catch (error) {
    return { error: `Not JSON: ${String(error)}` };
  }
}

function schemaErrors(): string[] {
  return (isReaction.errors ?? []).map(
    (error) => `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`,
  );
}

/** Checks a pasted reaction against the schema and returns what the game would play, or why not. */
export function parsePastedReaction(raw: string): Pasted {
  const parsed = parseJson(raw);
  if ("error" in parsed) return { ok: false, errors: [parsed.error] };
  if (!isReaction(parsed.value)) return { ok: false, errors: schemaErrors() };
  return { ok: true, traits: parsed.value.traits, script: safeScript(raw) };
}
