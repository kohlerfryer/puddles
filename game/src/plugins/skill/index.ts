import type { Manifest, SkillManifest, Step } from "../../core/contracts";
import { TICK_HZ } from "../../kernel/clock";
import type { Activity, PluginContext } from "../../kernel/plugins";

const TICK_MS = 1000 / TICK_HZ;

const manifests = import.meta.glob<Manifest & SkillManifest>("./*/manifest.json", {
  eager: true,
  import: "default",
});

/** Plays the skill for `seconds`, finishing on the last tick that still fits in that time. */
function timed(seconds: number) {
  return (_args: Step["args"], { t }: PluginContext): Activity => {
    const endsAt = t + seconds * 1000;
    return { tick: (now) => (now + TICK_MS > endsAt ? { status: "done" } : "running") };
  };
}

/**
 * Today's verbs as skill plugins, one folder per verb holding its manifest.json. The kernel times
 * each step by the manifest's duration; rendering still moves Puddles by the verb's plan
 * (`planVerb`), until world state reaches the kernel.
 */
export const SKILLS = Object.values(manifests).map((manifest) => ({
  manifest,
  code: { start: timed(manifest.duration_s) },
}));
