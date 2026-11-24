/** The guardian the live game runs, with its limits and the parents' session limit. */

import type { Manifest, SkillManifest } from "../../core/contracts";
import { createGuardian, type Guardian } from "./guardian";
import { MAX_SCARED_STEPS } from "./rules";

/** Most intents one brain may send a second; more are dropped. */
const INTENTS_PER_SECOND = 2;
/** Most model calls one brain may make a minute. */
const MODEL_CALLS_PER_MINUTE = 6;
const MINUTE_MS = 60_000;

/** A guardian for the installed `skills`, suggesting a break after `sessionLimitMin` minutes. */
export function liveGuardian(
  skills: readonly { readonly manifest: Manifest & SkillManifest }[],
  sessionLimitMin: number,
): Guardian {
  return createGuardian({
    skillSeconds: new Map(skills.map(({ manifest }) => [manifest.id, manifest.duration_s])),
    maxScaredSteps: MAX_SCARED_STEPS,
    intentsPerSecond: INTENTS_PER_SECOND,
    modelCallsPerMinute: MODEL_CALLS_PER_MINUTE,
    sessionSoftLimitMs: sessionLimitMin * MINUTE_MS,
  });
}
