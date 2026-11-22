import { SCENE_WIDTH } from "./pond";
import type { Step, Traits } from "./reaction";

/** How far from Puddles the demo drops its sticker: within one walk_to, so the peck reaches it. */
const DROP_DISTANCE = 300;
const DROP_HEIGHT = 200;

/** A hand-written script that plays every verb with a plan, longer than a model script may be. */
export const DEMO_SCRIPT: readonly Step[] = [
  { do: "walk_to", target: "object", mood: "curious" },
  { do: "sniff", target: "object", mood: "curious" },
  { do: "peck", target: "object", mood: "silly" },
  { do: "look_at", target: "camera", mood: "proud" },
  { do: "jump", target: "none", mood: "happy" },
  { do: "run_away", target: "object", mood: "scared" },
];

export const DEMO_TRAITS: Traits = {
  size: "small",
  weight: "light",
  shape: "round",
  edible: false,
};

/** Where the demo sticker falls from: up in the sky, towards the middle of the bank from Puddles at `x`. */
export function demoDrop(x: number): { x: number; y: number } {
  const towardsMiddle = x < SCENE_WIDTH / 2 ? 1 : -1;
  return { x: x + towardsMiddle * DROP_DISTANCE, y: DROP_HEIGHT };
}
