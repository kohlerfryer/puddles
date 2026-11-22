import { IDLE_MARGIN } from "./idle";
import { POND } from "./pond";
import type { Step, Target, Verb } from "./reaction";
import { VERB_SECONDS } from "./validator";
import { waveWing } from "./wave";
import { BANK, farthestHidingSpot } from "./world";

export type Pose =
  | "stand"
  | "walk"
  | "run"
  | "sniff"
  | "peck"
  | "look"
  | "look_camera"
  | "hop"
  | "flap"
  | "freeze"
  | "fallen";
export type Facing = 1 | -1;

/** One timed stretch of a verb: Puddles in `pose` going from `from` to `to`, hopping `lift` high. */
export interface Move {
  readonly pose: Pose;
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
  readonly facing: Facing;
  readonly lift: number;
  /** How high Puddles stands at the start and end of the move, when up on the object sticker. */
  readonly perch?: readonly [number, number];
}

/** A push given to the object sticker `at` seconds into the plan. */
export interface Nudge {
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

/** Where a sticker Puddles takes goes: into the beak to be eaten, or onto the head to be worn. */
export type Hold = "beak" | "head";

/** Puddles taking the object sticker `at` seconds into the plan. */
export interface Take {
  readonly at: number;
  readonly to: Hold;
}

export interface Plan {
  readonly moves: readonly [Move, ...Move[]];
  readonly nudge?: Nudge;
  readonly take?: Take;
}

export interface Duck {
  readonly x: number;
  readonly facing: Facing;
}

export interface Scene {
  /** Where the object sticker is on the bank. */
  readonly object: number;
  /** How tall the object sticker stands above the ground; flat when not given. */
  readonly objectHeight?: number;
}

export interface Frame {
  readonly pose: Pose;
  readonly x: number;
  readonly facing: Facing;
  readonly height: number;
  /** How far one wing is raised, in radians; 0 rests it against the body. */
  readonly wing: number;
}

/** How Puddles travels, at `speed` world units per second. */
interface Gait {
  readonly pose: Pose;
  readonly speed: number;
}

export const WALK: Gait = { pose: "walk", speed: 300 };
const RUN: Gait = { pose: "run", speed: 600 };
/** How far short of a target Puddles stops walking. */
export const REACH = 70;
const HOP_LIFT = 80;
/** How close the object must be for a peck to knock it. */
const PECK_REACH = 120;
const PECK_NUDGE = { x: 4, y: -6 };
/** How long a hop over something takes, and how far it carries Puddles. */
const HOP_OVER_SECONDS = 0.75;
const HOP_SPAN = 2 * REACH;
/** A dance is this many little hops, turning round each one. */
const DANCE_BEATS = 4;
const DANCE_LIFT = 30;
const FLAP_LIFT = 20;
/** How long Puddles lies fallen before getting back up. */
const FALLEN_SECONDS = 1;

/** Where a target sits on the bank, if it has a place there. */
export function placeOf(target: Target | undefined, scene: Scene, x: number): number | undefined {
  if (target === "object") return scene.object;
  if (target !== "reeds") return undefined;
  const reeds = POND.reeds.map((reed) => reed.x);
  return reeds.reduce((best, reed) => (Math.abs(reed - x) < Math.abs(best - x) ? reed : best));
}

export function facingTowards(place: number | undefined, duck: Duck): Facing {
  if (place === undefined || place === duck.x) return duck.facing;
  return place > duck.x ? 1 : -1;
}

export function still(pose: Pose, duck: Duck, seconds: number, lift = 0): Move {
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

/** Puts `x` back on the part of the bank Puddles keeps to. */
export function onBank(x: number): number {
  return Math.min(Math.max(x, BANK.left + IDLE_MARGIN), BANK.right - IDLE_MARGIN);
}

/** Goes in `gait` to just short of the target; walk_to walks and run_to runs. */
export function approach(gait: Gait, step: Step, duck: Duck, scene: Scene): Plan {
  const seconds = VERB_SECONDS[step.do];
  const place = placeOf(step.target, scene, duck.x);
  const facing = facingTowards(place, duck);
  if (place === undefined || Math.abs(place - duck.x) <= REACH) {
    return { moves: [still("stand", { x: duck.x, facing }, seconds)] };
  }
  return travel(gait, { x: duck.x, facing }, place - facing * REACH, seconds);
}

/** Runs behind the hiding spot farthest from the target, falling back to the object. */
function hideBehind(step: Step, duck: Duck, scene: Scene): Plan {
  const threat = placeOf(step.target, scene, duck.x) ?? scene.object;
  const { x } = farthestHidingSpot(threat);
  return travel(RUN, { x: duck.x, facing: facingTowards(x, duck) }, x, VERB_SECONDS.hide_behind);
}

/** Runs up to the target and hops `HOP_SPAN` on, then stands for whatever time is left. */
function jumpOver(step: Step, duck: Duck, scene: Scene): Plan {
  const seconds = VERB_SECONDS.jump_over;
  const place = placeOf(step.target, scene, duck.x);
  if (place === undefined) return { moves: [still("hop", duck, seconds, HOP_LIFT)] };
  const facing = facingTowards(place, duck);
  const runUp = Math.max(facing * (place - facing * REACH - duck.x), 0);
  const ahead = Math.min(runUp, RUN.speed * (seconds - HOP_OVER_SECONDS));
  const running = ahead / RUN.speed;
  const takeoff = duck.x + facing * ahead;
  const landing = onBank(takeoff + facing * HOP_SPAN);
  const hop: Move = {
    pose: "hop",
    from: takeoff,
    to: landing,
    seconds: HOP_OVER_SECONDS,
    facing,
    lift: HOP_LIFT,
  };
  const left = seconds - running - HOP_OVER_SECONDS;
  const after = left > 0 ? [still("stand", { x: landing, facing }, left)] : [];
  if (ahead === 0) return { moves: [hop, ...after] };
  const run: Move = { pose: "run", from: duck.x, to: takeoff, seconds: running, facing, lift: 0 };
  return { moves: [run, hop, ...after] };
}

/** Walks round to the far side of the target and back, half the time each way. */
function circle(step: Step, duck: Duck, scene: Scene): Plan {
  const half = VERB_SECONDS.circle / 2;
  const centre = placeOf(step.target, scene, duck.x) ?? duck.x + duck.facing * REACH;
  const far = onBank(centre + facingTowards(centre, duck) * REACH);
  const outFacing = facingTowards(far, duck);
  const out = travel(WALK, { x: duck.x, facing: outFacing }, far, half);
  const turned = { x: frameAt(out, half).x, facing: outFacing };
  const back = travel(WALK, { ...turned, facing: facingTowards(duck.x, turned) }, duck.x, half);
  return { moves: [...out.moves, ...back.moves] };
}

function runAway(step: Step, duck: Duck, scene: Scene): Plan {
  const threat = placeOf(step.target, scene, duck.x) ?? scene.object;
  const facing: Facing = duck.x < threat ? -1 : 1;
  const edge = facing === 1 ? BANK.right - IDLE_MARGIN : BANK.left + IDLE_MARGIN;
  const to = facing * (edge - duck.x) > 0 ? edge : duck.x;
  return travel(RUN, { x: duck.x, facing }, to, VERB_SECONDS.run_away);
}

/** Sniffs, pecks or looks at the target where Puddles stands; anything else hops on the spot. */
export function onTheSpot(step: Step, duck: Duck, scene: Scene): Plan {
  const seconds = VERB_SECONDS[step.do];
  const place = placeOf(step.target, scene, duck.x);
  const turned = { x: duck.x, facing: facingTowards(place, duck) };
  switch (step.do) {
    case "sniff":
    case "peck":
      return { moves: [still(step.do, turned, seconds)], ...peckNudge(step, turned, scene) };
    case "look_at":
      return { moves: [still(step.target === "camera" ? "look_camera" : "look", turned, seconds)] };
    default:
      return { moves: [still("hop", turned, seconds, HOP_LIFT)] };
  }
}

/** Whether the step is about the object and Puddles at `x` can reach it with the beak. */
export function reaches(step: Step, x: number, scene: Scene): boolean {
  return step.target === "object" && Math.abs(scene.object - x) <= PECK_REACH;
}

function peckNudge(step: Step, duck: Duck, scene: Scene): { nudge?: Nudge } {
  if (step.do !== "peck" || !reaches(step, duck.x, scene)) return {};
  const at = VERB_SECONDS.peck / 2;
  return { nudge: { at, x: duck.facing * PECK_NUDGE.x, y: PECK_NUDGE.y } };
}

/** Bounces `DANCE_BEATS` little hops on the spot, turning round each beat, starting towards the target. */
function dance(step: Step, duck: Duck, scene: Scene): Plan {
  const beat = VERB_SECONDS.dance / DANCE_BEATS;
  const first = facingTowards(placeOf(step.target, scene, duck.x), duck);
  const beatAt = (index: number): Move =>
    still("hop", { x: duck.x, facing: index % 2 === 0 ? first : flip(first) }, beat, DANCE_LIFT);
  const rest = Array.from({ length: DANCE_BEATS - 1 }, (_, index) => beatAt(index + 1));
  return { moves: [beatAt(0), ...rest] };
}

function flip(facing: Facing): Facing {
  return facing === 1 ? -1 : 1;
}

function flap(step: Step, duck: Duck, scene: Scene): Plan {
  const turned = { x: duck.x, facing: facingTowards(placeOf(step.target, scene, duck.x), duck) };
  return { moves: [still("flap", turned, VERB_SECONDS.flap, FLAP_LIFT)] };
}

/** Freezes exactly as it is, not even turning to the target. */
function freeze(_step: Step, duck: Duck): Plan {
  return { moves: [still("freeze", duck, VERB_SECONDS.freeze)] };
}

/** Falls over where it stands, lies there for `FALLEN_SECONDS`, then stands back up. */
function fallOver(_step: Step, duck: Duck): Plan {
  const fallen = still("fallen", duck, FALLEN_SECONDS);
  return { moves: [fallen, still("stand", duck, VERB_SECONDS.fall_over - FALLEN_SECONDS)] };
}

export type Planner = (step: Step, duck: Duck, scene: Scene) => Plan;

/** Planners for the verbs that move Puddles about or show off; the rest are on the spot or object verbs. */
export const VERB_PLANNERS: Partial<Record<Verb, Planner>> = {
  walk_to: (step, duck, scene) => approach(WALK, step, duck, scene),
  run_to: (step, duck, scene) => approach(RUN, step, duck, scene),
  run_away: runAway,
  hide_behind: hideBehind,
  jump_over: jumpOver,
  circle,
  dance,
  flap,
  freeze,
  fall_over: fallOver,
};

/**
 * Where Puddles is `elapsed` seconds into a plan, held at the ends; hops follow a sine arc above
 * the perch and looking at the camera waves.
 */
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
    height: perchAt(move, progress) + move.lift * Math.sin(Math.PI * progress),
    wing: move.pose === "look_camera" ? waveWing(progress) : 0,
  };
}

function perchAt(move: Move, progress: number): number {
  const [from, to] = move.perch ?? [0, 0];
  return from + (to - from) * progress;
}
