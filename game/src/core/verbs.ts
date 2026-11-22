import { IDLE_MARGIN } from "./idle";
import { POND } from "./pond";
import type { Step, Target } from "./reaction";
import { VERB_SECONDS } from "./validator";
import { BANK } from "./world";

type Pose = "stand" | "walk" | "run" | "sniff" | "peck" | "look" | "look_camera" | "hop";
type Facing = 1 | -1;

/** One timed stretch of a verb: Puddles in `pose` going from `from` to `to`, hopping `lift` high. */
interface Move {
  readonly pose: Pose;
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
  readonly facing: Facing;
  readonly lift: number;
}

/** A push given to the object sticker `at` seconds into the plan. */
interface Nudge {
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

export interface Plan {
  readonly moves: readonly [Move, ...Move[]];
  readonly nudge?: Nudge;
}

interface Duck {
  readonly x: number;
  readonly facing: Facing;
}

interface Scene {
  /** Where the object sticker is on the bank. */
  readonly object: number;
}

interface Frame {
  readonly pose: Pose;
  readonly x: number;
  readonly facing: Facing;
  readonly height: number;
}

/** How Puddles travels, at `speed` world units per second. */
interface Gait {
  readonly pose: Pose;
  readonly speed: number;
}

const WALK: Gait = { pose: "walk", speed: 300 };
const RUN: Gait = { pose: "run", speed: 600 };
/** How far short of a target Puddles stops walking. */
const REACH = 70;
const HOP_LIFT = 80;
/** How close the object must be for a peck to knock it. */
const PECK_REACH = 120;
const PECK_NUDGE = { x: 4, y: -6 };

/** Where a target sits on the bank, if it has a place there. */
function placeOf(target: Target | undefined, scene: Scene, x: number): number | undefined {
  if (target === "object") return scene.object;
  if (target !== "reeds") return undefined;
  const reeds = POND.reeds.map((reed) => reed.x);
  return reeds.reduce((best, reed) => (Math.abs(reed - x) < Math.abs(best - x) ? reed : best));
}

function facingTowards(place: number | undefined, duck: Duck): Facing {
  if (place === undefined || place === duck.x) return duck.facing;
  return place > duck.x ? 1 : -1;
}

function still(pose: Pose, duck: Duck, seconds: number, lift = 0): Move {
  return { pose, from: duck.x, to: duck.x, seconds, facing: duck.facing, lift };
}

/** Travels from `duck.x` towards `to` in `gait`, then stands for whatever time is left. */
function travel(gait: Gait, duck: Duck, to: number, seconds: number): Plan {
  const { pose, speed } = gait;
  const distance = Math.min(Math.abs(to - duck.x), speed * seconds);
  if (distance === 0) return { moves: [still("stand", duck, seconds)] };
  const end = duck.x + duck.facing * distance;
  const moving = distance / speed;
  const move: Move = { pose, from: duck.x, to: end, seconds: moving, facing: duck.facing, lift: 0 };
  if (moving >= seconds) return { moves: [move] };
  return { moves: [move, still("stand", { x: end, facing: duck.facing }, seconds - moving)] };
}

function walkTo(step: Step, duck: Duck, scene: Scene): Plan {
  const seconds = VERB_SECONDS.walk_to;
  const place = placeOf(step.target, scene, duck.x);
  const facing = facingTowards(place, duck);
  if (place === undefined || Math.abs(place - duck.x) <= REACH) {
    return { moves: [still("stand", { x: duck.x, facing }, seconds)] };
  }
  return travel(WALK, { x: duck.x, facing }, place - facing * REACH, seconds);
}

function runAway(step: Step, duck: Duck, scene: Scene): Plan {
  const threat = placeOf(step.target, scene, duck.x) ?? scene.object;
  const facing: Facing = duck.x < threat ? -1 : 1;
  const edge = facing === 1 ? BANK.right - IDLE_MARGIN : BANK.left + IDLE_MARGIN;
  const to = facing * (edge - duck.x) > 0 ? edge : duck.x;
  return travel(RUN, { x: duck.x, facing }, to, VERB_SECONDS.run_away);
}

function onTheSpot(step: Step, duck: Duck, scene: Scene): Plan {
  const seconds = VERB_SECONDS[step.do];
  const place = placeOf(step.target, scene, duck.x);
  const turned = { x: duck.x, facing: facingTowards(place, duck) };
  switch (step.do) {
    case "sniff":
    case "peck":
      return { moves: [still(step.do, turned, seconds)], ...peckNudge(step, turned, scene) };
    case "look_at":
      return { moves: [still(step.target === "camera" ? "look_camera" : "look", turned, seconds)] };
    case "jump":
      return { moves: [still("hop", turned, seconds, HOP_LIFT)] };
    default:
      return { moves: [still("stand", duck, seconds)] };
  }
}

function peckNudge(step: Step, duck: Duck, scene: Scene): { nudge?: Nudge } {
  const near = Math.abs(scene.object - duck.x) <= PECK_REACH;
  if (step.do !== "peck" || step.target !== "object" || !near) return {};
  const at = VERB_SECONDS.peck / 2;
  return { nudge: { at, x: duck.facing * PECK_NUDGE.x, y: PECK_NUDGE.y } };
}

/** Turns a script step into timed moves for Puddles at `duck`; the moves add up to the verb's time. */
export function planVerb(step: Step, duck: Duck, scene: Scene): Plan {
  if (step.do === "walk_to") return walkTo(step, duck, scene);
  if (step.do === "run_away") return runAway(step, duck, scene);
  return onTheSpot(step, duck, scene);
}

/** Where Puddles is `elapsed` seconds into a plan, held at the ends; hops follow a sine arc. */
export function frameAt(plan: Plan, elapsed: number): Frame {
  const [first, ...rest] = plan.moves;
  let start = 0;
  let move = first;
  for (const next of rest) {
    if (elapsed < start + move.seconds) break;
    start += move.seconds;
    move = next;
  }
  const progress = Math.min(Math.max((elapsed - start) / move.seconds, 0), 1);
  return {
    pose: move.pose,
    x: move.from + (move.to - move.from) * progress,
    facing: move.facing,
    height: move.lift * Math.sin(Math.PI * progress),
  };
}
