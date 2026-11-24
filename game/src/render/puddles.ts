import { Container, Graphics } from "pixi.js";

import type { createGlass } from "../core/glass";
import { GROUND } from "../core/pond";
import { type Look, puppetPose } from "../core/puppet";
import type { Mood } from "../core/reaction";
import type { Facing, Hold } from "../plugins/skill/verbs";
import { PALETTE } from "./puppet/paths";
import { buildPuppet, HEAD_HEIGHT } from "./puppet/puppet";

/** How Puddles stands at the window this frame, as worked out in core. */
export type AtWindow = Pick<
  ReturnType<ReturnType<typeof createGlass>["update"]>,
  "watching" | "gaze" | "depth" | "scale" | "walking" | "tap"
>;

/** Puddles as drawn this frame, `height` above the ground with one wing raised `wing` radians. */
export interface Shown {
  readonly x: number;
  readonly facing: Facing;
  readonly height: number;
  readonly wing: number;
  readonly look: Look;
  readonly mood: Mood;
  /** How far the head is turned in a head shake, in radians. */
  readonly shake: number;
  readonly glass: AtWindow;
}

/** Screen pixels per concept-art unit: the puppet is drawn in the concept's coordinates. */
const SIZE = 0.5;
/** How far the head sits forward while Puddles faces sideways, in concept units. */
const HEAD_SIDE = 8;
/** Where a held sticker sits from Puddles' feet when facing right, in concept units: at the bill or on the head. */
const HOLD_AT: Record<Hold, { x: number; y: number }> = {
  beak: { x: HEAD_SIDE + 10, y: 34 - HEAD_HEIGHT },
  head: { x: 0, y: -HEAD_HEIGHT - 90 },
};
/** How narrow Puddles looks once he has turned to face the viewer. */
const TURNED_WIDTH = 0.9;
/** How far the head and face turn towards a kid at the edge of the window, and how far a tap pushes the face. */
const HEAD_TURN = 16;
const FACE_TURN = 12;
const TAP_REACH = 24;
/** The ring a tap leaves on the glass, spreading from the bill, in concept units. */
const RING = { from: 12, to: 80, width: 6, color: PALETTE.highlight };

/** Where on screen a sticker Puddles holds `on` the beak or head sits this frame. */
export function holdPoint(
  shown: Pick<Shown, "x" | "facing" | "height" | "glass">,
  on: Hold,
): { x: number; y: number } {
  const at = HOLD_AT[on];
  const { depth, scale } = shown.glass;
  return {
    x: shown.x + shown.facing * at.x * SIZE * scale,
    y: GROUND - shown.height + depth + at.y * SIZE * scale,
  };
}

/** Draws the ring a tap leaves on the glass, `spread` from 0 to 1, or nothing. */
function drawRing(ring: Graphics, spread: number | undefined): void {
  ring.clear();
  if (spread === undefined) return;
  ring
    .circle(0, 0, RING.from + spread * (RING.to - RING.from))
    .stroke({ width: RING.width, color: RING.color, alpha: 1 - spread });
}

/** Draws the Puddles puppet into `scene` and returns how to show Puddles each frame. */
export function drawPuddles(scene: Container): (shown: Shown, clock: number) => void {
  const duck = new Container();
  const puppet = buildPuppet();
  const ring = new Graphics();
  ring.position.set(HOLD_AT.beak.x, HOLD_AT.beak.y);
  duck.addChild(puppet.root, ring);
  scene.addChild(duck);

  return (shown, clock) => {
    const { gaze, depth, scale, walking, tap } = shown.glass;
    puppet.pose(puppetPose({ ...shown, walking }, clock), shown.mood);
    duck.position.set(shown.x, GROUND - shown.height + depth);
    const turned = shown.look === "look_camera";
    duck.scale.set(shown.facing * (turned ? TURNED_WIDTH : 1) * scale * SIZE, scale * SIZE);
    const towards = gaze * shown.facing;
    puppet.head.position.x = (turned ? 0 : HEAD_SIDE) + towards * HEAD_TURN;
    puppet.face.position.x = towards * FACE_TURN + tap.bob * TAP_REACH;
    drawRing(ring, tap.ring);
  };
}
