import type { Step } from "./reaction";
import { VERB_SECONDS } from "./validator";
import {
  approach,
  type Duck,
  facingTowards,
  frameAt,
  type Hold,
  type Move,
  onBank,
  type Plan,
  placeOf,
  type Planner,
  REACH,
  reaches,
  type Scene,
  still,
  WALK,
} from "./verbs";

/** When the beak closes on the sticker, for eating and for picking it up to wear. */
const TAKE_AT = 0.5;
/** How long an eaten sticker takes to shrink away. */
const SWALLOW_SECONDS = 0.75;
const SHOVE = { x: 16, y: -2 };
/** Hopping on and off the object: how long each hop takes and how high it arcs. */
const PERCH_HOP_SECONDS = 0.4;
const PERCH_HOP_LIFT = 40;

/** Puddles at `duck`, turned towards the step's target. */
function turned(step: Step, duck: Duck, scene: Scene): Duck {
  return { x: duck.x, facing: facingTowards(placeOf(step.target, scene, duck.x), duck) };
}

/** Pecks at the target the whole time, taking a sticker it reaches into the beak. */
function eat(step: Step, duck: Duck, scene: Scene): Plan {
  const moves = [still("peck", turned(step, duck, scene), VERB_SECONDS.eat)] as const;
  if (!reaches(step, duck.x, scene)) return { moves };
  return { moves, take: { at: TAKE_AT, to: "beak" } };
}

/** Pecks the target up and stands with it on the head, if it reached it. */
function wear(step: Step, duck: Duck, scene: Scene): Plan {
  const facing = turned(step, duck, scene);
  const moves = [
    still("peck", facing, TAKE_AT),
    still("stand", facing, VERB_SECONDS.wear - TAKE_AT),
  ] as const;
  if (!reaches(step, duck.x, scene)) return { moves };
  return { moves, take: { at: TAKE_AT, to: "head" } };
}

/** Walks up to the target and shoves it on arrival, if it gets there. */
function push(step: Step, duck: Duck, scene: Scene): Plan {
  const plan = approach(WALK, step, duck, scene);
  const end = frameAt(plan, VERB_SECONDS.push);
  if (!reaches(step, end.x, scene)) return plan;
  const [first] = plan.moves;
  const at = first.pose === "walk" ? first.seconds : 0;
  return { ...plan, nudge: { at, x: end.facing * SHOVE.x, y: SHOVE.y } };
}

/** Hops up onto a target it reaches, sits there, then hops off the far side. */
function sitOn(step: Step, duck: Duck, scene: Scene): Plan {
  const { facing } = turned(step, duck, scene);
  if (!reaches(step, duck.x, scene)) {
    return { moves: [still("stand", { x: duck.x, facing }, VERB_SECONDS.sit_on)] };
  }
  const top = scene.objectHeight ?? 0;
  const hop = (from: number, to: number, perch: readonly [number, number]): Move => ({
    pose: "hop",
    from,
    to,
    seconds: PERCH_HOP_SECONDS,
    facing,
    lift: PERCH_HOP_LIFT,
    perch,
  });
  const sitting = VERB_SECONDS.sit_on - 2 * PERCH_HOP_SECONDS;
  const seat = {
    ...still("stand", { x: scene.object, facing }, sitting),
    perch: [top, top] as const,
  };
  const off = onBank(scene.object + facing * REACH);
  return { moves: [hop(duck.x, scene.object, [0, top]), seat, hop(scene.object, off, [top, 0])] };
}

/** How big a taken sticker shows `seconds` after Puddles took it: worn stays whole, eaten shrinks away. */
export function heldScale(to: Hold, seconds: number): number {
  if (to === "head") return 1;
  return Math.max(1 - seconds / SWALLOW_SECONDS, 0);
}

export const OBJECT_PLANNERS: Partial<Record<Step["do"], Planner>> = {
  eat,
  wear,
  push,
  sit_on: sitOn,
};
