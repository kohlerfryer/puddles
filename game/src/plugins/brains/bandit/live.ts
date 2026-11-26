import type { PluginFolder } from "../../../kernel/plugins";
import { betaModel } from "./beta";
import { bandit } from "./index";
import type { Arm } from "./model";

/** The bits the live game's bandit picks from, made of skills that need no target. */
export const LIVE_BITS: readonly Arm[] = [
  { id: "pratfall", features: ["slapstick"], skills: ["jump", "fall_over"] },
  { id: "dance_party", features: ["musical"], skills: ["dance", "flap"] },
  { id: "freeze_flop", features: ["surprise", "slapstick"], skills: ["freeze", "fall_over"] },
  { id: "nap", features: ["sleepy"], skills: ["nap"] },
];

/** Longer than copy-me waits idle before asking, so copy-me and the bandit take turns. */
const REST_MS = 20_000;

/**
 * The live game's bandit: Thompson sampling over a Beta model on whether a bit got a smile, played
 * only with a face in view, and resting between bits.
 */
export function banditBrain(): PluginFolder {
  return bandit({ arms: LIVE_BITS, model: betaModel, restMs: REST_MS, needsFace: true }).plugin;
}
