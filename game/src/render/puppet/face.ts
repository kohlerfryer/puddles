import type { Graphics } from "pixi.js";

import type { Eyes } from "../../core/puppet";
import type { Mood } from "../../core/reaction";
import { billFill, OUTLINE, PALETTE, quads } from "./paths";

/** Eye centres in head space, as in the concept art. */
const EYES = [
  { x: -28, y: 0 },
  { x: 32, y: 0 },
] as const;
const BLUSH = [
  { x: -50, y: 30 },
  { x: 54, y: 30 },
] as const;
/** The three sparkles in an open eye, from its centre: big, small and faint. */
const SPARKLES = [
  { x: 7, y: -9, r: 9, alpha: 1 },
  { x: -8, y: 10, r: 4.5, alpha: 1 },
  { x: 9, y: 9, r: 2.5, alpha: 0.8 },
] as const;
const LASH = { width: 8, color: PALETTE.eye, cap: "round", join: "round" } as const;

/** The concept's shut and wide-open bill as one path, so opening is a blend of the two. */
const BILL = {
  shut: {
    start: [-12, 26],
    curves: [
      [14, -9, 28, 0],
      [1, 11, -14, 14],
      [-15, -3, -14, -14],
    ],
  },
  open: {
    start: [-14, 24],
    curves: [
      [16, -8, 32, 0],
      [-4, 20, -16, 22],
      [-12, -2, -16, -22],
    ],
  },
} as const;
const TONGUE_FROM = 0.3;

function sparkles(g: Graphics, x: number, y: number, size: number): void {
  for (const s of SPARKLES)
    g.circle(x + s.x * size, y + s.y * size, s.r * size).fill({
      color: PALETTE.highlight,
      alpha: s.alpha,
    });
}

/** The concept's big dark eye, its iris shifted `look` sideways. */
function openEye(g: Graphics, x: number, look: number): void {
  g.ellipse(x, 0, 21, 26).fill(PALETTE.eye);
  g.ellipse(x + look, 6, 15, 16).fill(PALETTE.iris);
  sparkles(g, x + look, 0, 1);
}

const EYE_SHAPES: Record<Eyes, (g: Graphics, x: number, side: number) => void> = {
  open: (g, x) => {
    openEye(g, x, 0);
  },
  crossed: (g, x, side) => {
    openEye(g, x, side === 0 ? 6 : -6);
  },
  wide: (g, x) => {
    g.ellipse(x, 0, 21, 26)
      .fill(PALETTE.highlight)
      .stroke({ width: OUTLINE.small, color: PALETTE.outline });
    g.circle(x, 2, 8).fill(PALETTE.eye);
    g.circle(x + 3, -1, 2.5).fill(PALETTE.highlight);
  },
  proud: (g, x) => {
    g.ellipse(x, 8, 21, 14).fill(PALETTE.eye);
    sparkles(g, x, 10, 0.6);
    g.moveTo(x - 23, 6)
      .lineTo(x + 23, 6)
      .stroke(LASH);
  },
  smile: (g, x) => {
    quads(g, x - 18, 4, [[18, -22, 36, 0]]).stroke(LASH);
  },
  shut: (g, x) => {
    quads(g, x - 18, 0, [[18, 14, 36, 0]]).stroke(LASH);
  },
  squeeze: (g, x, side) => {
    const out = side === 0 ? -1 : 1;
    g.moveTo(x + 14 * out, -12)
      .lineTo(x - 12 * out, 0)
      .lineTo(x + 14 * out, 12)
      .stroke(LASH);
  },
};

function mix(shut: readonly number[], open: readonly number[], amount: number): number[] {
  return shut.map((value, index) => value + ((open[index] ?? value) - value) * amount);
}

function bill(g: Graphics, open: number, mood: Mood): void {
  const [x = 0, y = 0] = mix(BILL.shut.start, BILL.open.start, open);
  const curves = BILL.shut.curves.map((curve, index) =>
    mix(curve, BILL.open.curves[index] ?? curve, open),
  );
  quads(g, x, y, curves)
    .closePath()
    .fill(billFill())
    .stroke({ width: OUTLINE.small, color: PALETTE.outline, join: "round" });
  if (open < TONGUE_FROM) return;
  quads(g, -6, 26 + 8 * open, [[8, 8 * open, 16, 0]]).fill(
    mood === "grossed_out" ? PALETTE.gross : PALETTE.tongue,
  );
}

/** Draws Puddles' face into `g` in head space: blush, `eyes`, and the bill `open` from 0 to 1. */
export function drawFace(g: Graphics, eyes: Eyes, open: number, mood: Mood): void {
  g.clear();
  for (const at of BLUSH) g.ellipse(at.x, at.y, 16, 10).fill({ color: PALETTE.blush, alpha: 0.55 });
  EYES.forEach((eye, side) => {
    EYE_SHAPES[eyes](g, eye.x, side);
  });
  bill(g, open, mood);
}
