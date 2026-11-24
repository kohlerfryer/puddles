/** The reflexes brain (spec §8): every tick, Puddles mirrors the kid's latest gesture one to one. */

import type { Intent, Step } from "../../../core/contracts";
import type { PluginFolder } from "../../../kernel/plugins";
import { gestureOf } from "../../sense/gestures";
import type { BodyGesture } from "../../sense/gestures/gestures";
import manifest from "./manifest.json";

/** Below the behaviors brains start, so a running copy-me keeps the kid's gestures as answers. */
const PRIORITY = 1;

/** What Puddles does when the kid makes each gesture, thinking of the gesture as he does it. */
export const MIRRORS: Record<BodyGesture, Step> = {
  jump: { skill: "jump", args: {}, mood: "happy", say: "Boing!", think: "jump" },
  wave: {
    skill: "look_at",
    args: { target: "camera" },
    mood: "happy",
    say: "Hi friend!",
    think: "wave",
  },
  flap: { skill: "flap", args: {}, mood: "silly", say: "Flap flap flap!", think: "flap" },
  crouch: { skill: "freeze", args: {}, mood: "curious", say: "Where did you go?", think: "crouch" },
};

export function reflexesBrain(): PluginFolder {
  return {
    manifest,
    code: {
      decide: ({ events }): Intent | null => {
        const gesture = events
          .map(gestureOf)
          .filter((seen) => seen !== undefined)
          .at(-1);
        if (!gesture) return null;
        return {
          brain: manifest.id,
          priority: PRIORITY,
          kind: "routine",
          steps: [MIRRORS[gesture]],
          why: `mirror the kid's ${gesture}`,
          features: ["copies_kid"],
        };
      },
    },
  };
}
