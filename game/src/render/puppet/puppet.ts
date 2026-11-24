import { Container, Graphics } from "pixi.js";

import type { PuppetPose } from "../../core/puppet";
import type { Mood } from "../../core/reaction";
import { drawFace } from "./face";
import { BILL_FILL, fluff, fluffFill, OUTLINE, PALETTE, quads } from "./paths";

/** How far the concept art's head centre sits above the feet, in concept units. */
export const HEAD_HEIGHT = 138;
const BODY = { x: 0, y: 70 - HEAD_HEIGHT, rx: 66, ry: 58, count: 22, puff: 12 } as const;
const HEAD = { x: 0, y: 0, rx: 76, ry: 70, count: 26, puff: 13 } as const;
/** The wing hangs from its shoulder, so raising it swings it up and out. */
const SHOULDER = { x: -48, y: 54 - HEAD_HEIGHT } as const;
const WING = { x: -12, y: 16, rx: 16, ry: 20, count: 8, puff: 7 } as const;
const TUFT = [
  [-14, -26, 2, -38],
  [4, 16, 12, 20],
  [2, -20, 22, -22],
  [-10, 16, -8, 36],
] as const;
const FOOT = [
  [-14, 8, -26, 9],
  [12, 6, 24, 2],
  [6, 3, 12, 1],
  [-6, -5, -4, -12],
] as const;
const FEET_AT = [-30, 22] as const;

function drawBody(): Graphics {
  const g = new Graphics();
  fluff(g, BODY, fluffFill(PALETTE.body, 0.7), OUTLINE.width);
  return g;
}

function drawFeet(): Graphics {
  const g = new Graphics();
  for (const x of FEET_AT) {
    quads(g, x, -10, FOOT)
      .closePath()
      .fill(BILL_FILL)
      .stroke({ width: OUTLINE.small, color: PALETTE.outline, join: "round" });
  }
  return g;
}

function drawWing(): Graphics {
  const g = new Graphics();
  fluff(g, WING, fluffFill(PALETTE.body, 0.7), OUTLINE.small);
  g.position.set(SHOULDER.x, SHOULDER.y);
  return g;
}

function drawHead(): Graphics {
  const g = new Graphics();
  const fill = fluffFill(PALETTE.head, 0.6);
  quads(g, -12, -70, TUFT)
    .fill(fill)
    .stroke({ width: OUTLINE.width, color: PALETTE.outline, join: "round", cap: "round" });
  fluff(g, HEAD, fill, OUTLINE.width);
  return g;
}

/** Puddles as layered parts in concept units with the feet at the origin, and how to pose them. */
export function buildPuppet(): {
  root: Container;
  head: Container;
  face: Graphics;
  pose: (pose: PuppetPose, mood: Mood) => void;
} {
  const root = new Container();
  const wing = drawWing();
  const head = new Container();
  const face = new Graphics();
  head.position.set(0, -HEAD_HEIGHT);
  head.addChild(drawHead(), face);
  root.addChild(drawBody(), wing, drawFeet(), head);
  let drawn = "";

  const pose = (now: PuppetPose, mood: Mood): void => {
    root.scale.set(now.squash.x, now.squash.y);
    root.rotation = now.lean;
    head.rotation = now.headTilt;
    wing.rotation = now.wing;
    const bill = Math.round(now.bill * 20) / 20;
    const wanted = `${now.eyes} ${String(bill)} ${mood}`;
    if (wanted === drawn) return;
    drawn = wanted;
    drawFace(face, now.eyes, bill, mood);
  };
  return { root, head, face, pose };
}
