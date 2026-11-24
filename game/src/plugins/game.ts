/** The plugins the game runs on its senses, shared by the live game, replays and scenario tests. */

import { liveGuardian } from "../kernel/guardian/live";
import type { KernelOptions } from "../kernel/kernel";
import type { PluginFolder } from "../kernel/plugins";
import { copyMe, copyMeBrain } from "./brains/copyMe";
import { matcherBrain } from "./brains/matcher";
import { reflexesBrain } from "./brains/reflexes";
import { SKILLS } from "./skill";

/**
 * Kernel options for the game on `senses`: the reflexes, copy-me and object matcher brains and the
 * skills, behind a guardian that suggests a break after `sessionLimitMin` minutes.
 */
export function gameOptions(
  senses: readonly PluginFolder[],
  sessionLimitMin: number,
  seed: number,
): KernelOptions {
  return {
    plugins: [...senses, reflexesBrain(), copyMeBrain(), matcherBrain(), ...SKILLS],
    behaviors: new Map([["copy_me", copyMe]]),
    guardian: liveGuardian(SKILLS, sessionLimitMin),
    seed,
  };
}
