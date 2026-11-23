import { Container, Graphics } from "pixi.js";

import type { createGlass } from "../core/glass";
import type { IdleKind } from "../core/idle";
import { GROUND } from "../core/pond";
import type { Mood } from "../core/reaction";
import type { Facing, Hold, Pose } from "../core/verbs";

/** What Puddles is doing: a verb's pose or an idle action. */
type Look = Pose | IdleKind;

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
  readonly glass: AtWindow;
}

const COLOURS = {
  body: "#f7d84a",
  wing: "#e8c23a",
  beak: "#f08a24",
  eye: "#222222",
  white: "#ffffff",
  tongue: "#e86a8a",
  gross: "#7fae3c",
};

const LINE = { width: 3, color: COLOURS.eye, cap: "round" } as const;
/** Eye centres in head space; the head is a circle of radius 30 around the origin. */
const EYES = [
  { x: -6, y: -8 },
  { x: 12, y: -8 },
] as const;
const PREEN_SWAY = 0.35;
const WADDLE = 0.06;
/** How fast Puddles rocks side to side while moving, in radians per second. */
const WADDLE_SPEED: Partial<Record<Look, number>> = { wander: 10, walk: 10, run: 22 };
/** Head tilt over time for looks that move the head; the head is upright otherwise. */
const HEAD_TILT: Partial<Record<Look, (clock: number) => number>> = {
  preen: (clock) => 1.2 + Math.sin(clock * 6) * PREEN_SWAY,
  sniff: (clock) => 0.5 + Math.sin(clock * 24) * 0.08,
  peck: (clock) => 0.9 * Math.abs(Math.sin(clock * 8)),
  look_camera: () => -0.25,
};
/** Where the head sits on the body: side-on, or turned to face the viewer. */
const HEAD_AT = { side: { x: 34, y: -92 }, viewer: { x: -12, y: -96 } } as const;
/** Where a held sticker sits relative to Puddles' feet when facing right: in the beak or on the head. */
const HOLD_AT: Record<Hold, { x: number; y: number }> = {
  beak: { x: HEAD_AT.side.x + 40, y: HEAD_AT.side.y + 4 },
  head: { x: HEAD_AT.side.x, y: HEAD_AT.side.y - 40 },
};
/** How narrow the body looks once Puddles has turned to face the viewer. */
const TURNED_WIDTH = 0.8;
/** How far the head and face turn towards a kid at the edge of the window, and how far a tap pushes the face. */
const HEAD_TURN = 8;
const FACE_TURN = 6;
const TAP_REACH = 12;
/** The ring a tap leaves on the glass, spreading from the beak. */
const RING = { from: 6, to: 40, width: 3, color: COLOURS.white };

function beak(g: Graphics, open: boolean): void {
  if (open) {
    g.poly([22, 0, 46, -4, 26, 4]).fill(COLOURS.beak);
    g.poly([22, 8, 44, 12, 26, 4]).fill(COLOURS.beak);
    return;
  }
  g.ellipse(36, 4, 14, 6).fill(COLOURS.beak);
}

function tongue(g: Graphics, colour: string): void {
  g.ellipse(34, 12, 5, 8).fill(colour);
}

function dotEyes(g: Graphics, radius: number, pupilShift: (side: number) => number): void {
  EYES.forEach((eye, side) => {
    g.circle(eye.x, eye.y, radius)
      .fill(COLOURS.white)
      .stroke({ ...LINE, width: 1.5 });
    g.circle(eye.x + pupilShift(side), eye.y, Math.max(radius / 3, 2)).fill(COLOURS.eye);
  });
}

const FACES: Record<Mood, (g: Graphics) => void> = {
  happy: (g) => {
    for (const eye of EYES) g.arc(eye.x, eye.y + 3, 5, Math.PI, 2 * Math.PI).stroke(LINE);
    beak(g, false);
  },
  curious: (g) => {
    g.circle(EYES[0].x, EYES[0].y, 3).fill(COLOURS.eye);
    g.circle(EYES[1].x, EYES[1].y, 7)
      .fill(COLOURS.white)
      .stroke({ ...LINE, width: 1.5 });
    g.circle(EYES[1].x + 2, EYES[1].y, 3).fill(COLOURS.eye);
    g.moveTo(EYES[1].x - 7, EYES[1].y - 12)
      .lineTo(EYES[1].x + 7, EYES[1].y - 16)
      .stroke(LINE);
    beak(g, false);
  },
  scared: (g) => {
    dotEyes(g, 7, () => 0);
    for (const eye of EYES)
      g.moveTo(eye.x - 6, eye.y - 10)
        .lineTo(eye.x + 4, eye.y - 15)
        .stroke(LINE);
    beak(g, true);
  },
  silly: (g) => {
    dotEyes(g, 6, (side) => (side === 0 ? 3 : -3));
    beak(g, true);
    tongue(g, COLOURS.tongue);
  },
  proud: (g) => {
    for (const eye of EYES) {
      g.circle(eye.x, eye.y, 5).fill(COLOURS.eye);
      g.rect(eye.x - 6, eye.y - 6, 12, 6).fill(COLOURS.body);
      g.moveTo(eye.x - 6, eye.y)
        .lineTo(eye.x + 6, eye.y)
        .stroke(LINE);
    }
    beak(g, false);
  },
  grossed_out: (g) => {
    for (const [eye, dir] of [
      [EYES[0], 1],
      [EYES[1], -1],
    ] as const) {
      g.moveTo(eye.x - 4 * dir, eye.y - 4)
        .lineTo(eye.x + 4 * dir, eye.y)
        .stroke(LINE);
      g.lineTo(eye.x - 4 * dir, eye.y + 4).stroke(LINE);
    }
    beak(g, true);
    tongue(g, COLOURS.gross);
  },
};

function sleepFace(g: Graphics): void {
  for (const eye of EYES) g.arc(eye.x, eye.y - 2, 5, 0, Math.PI).stroke(LINE);
  beak(g, false);
}

function drawBody(): Graphics {
  const g = new Graphics();
  g.ellipse(0, -45, 55, 38).fill(COLOURS.body);
  g.poly([-50, -60, -72, -78, -56, -44]).fill(COLOURS.body);
  g.rect(-12, -10, 5, 10).fill(COLOURS.beak);
  g.rect(10, -10, 5, 10).fill(COLOURS.beak);
  return g;
}

/** The near wing, pivoting at its shoulder so it can be raised to wave. */
function drawWing(): Graphics {
  const g = new Graphics();
  g.ellipse(-22, 0, 30, 18).fill(COLOURS.wing);
  g.position.set(14, -48);
  return g;
}

function drawHead(): { head: Container; face: Graphics } {
  const head = new Container();
  head.addChild(new Graphics().circle(0, 0, 30).fill(COLOURS.body));
  const face = new Graphics();
  head.addChild(face);
  return { head, face };
}

/** Where on screen a sticker Puddles holds `on` the beak or head sits this frame. */
export function holdPoint(
  shown: Pick<Shown, "x" | "facing" | "height" | "glass">,
  on: Hold,
): { x: number; y: number } {
  const at = HOLD_AT[on];
  const { depth, scale } = shown.glass;
  return {
    x: shown.x + shown.facing * at.x * scale,
    y: GROUND - shown.height + depth + at.y * scale,
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

/** Draws placeholder Puddles into `scene` and returns how to show Puddles each frame. */
export function drawPuddles(scene: Container): (shown: Shown, clock: number) => void {
  const duck = new Container();
  const body = drawBody();
  const wing = drawWing();
  const { head, face } = drawHead();
  const ring = new Graphics();
  ring.position.set(HOLD_AT.beak.x, HOLD_AT.beak.y);
  duck.addChild(body, head, wing, ring);
  scene.addChild(duck);
  let shownFace = "";

  return (shown, clock) => {
    const { gaze, depth, scale, walking, tap } = shown.glass;
    duck.position.set(shown.x, GROUND - shown.height + depth);
    const turned = shown.look === "look_camera";
    duck.scale.set(shown.facing * (turned ? TURNED_WIDTH : 1) * scale, scale);
    const at = turned ? HEAD_AT.viewer : HEAD_AT.side;
    const towards = gaze * shown.facing;
    head.position.set(at.x + towards * HEAD_TURN, at.y);
    face.position.x = towards * FACE_TURN + tap.bob * TAP_REACH;
    drawRing(ring, tap.ring);
    wing.rotation = shown.wing;
    const waddle = WADDLE_SPEED[walking ? "walk" : shown.look];
    duck.rotation = waddle === undefined ? 0 : Math.sin(clock * waddle) * WADDLE;
    head.rotation = HEAD_TILT[shown.look]?.(clock) ?? 0;

    const wanted = shown.look === "nap" ? "nap" : shown.mood;
    if (wanted === shownFace) return;
    shownFace = wanted;
    face.clear();
    if (wanted === "nap") sleepFace(face);
    else FACES[wanted](face);
  };
}
