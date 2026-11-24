import { FillGradient, type Graphics } from "pixi.js";

/** The style guide's palette (`docs/art/style-guide.md`), taken from the concept art. */
export const PALETTE = {
  outline: "#7a5230",
  eye: "#2b1d12",
  iris: "#4a2f1c",
  highlight: "#ffffff",
  blush: "#ff8fa3",
  tongue: "#ff6b81",
  gross: "#7fae3c",
  head: ["#fffbe0", "#ffeb94", "#ffdb5c"],
  body: ["#fff6c4", "#ffe372", "#ffd24d"],
  bill: ["#ffb46b", "#ff8a3d"],
} as const;

/** Outline widths in concept units: fluff and tuft, then the smaller bill, feet and wing. */
export const OUTLINE = { width: 5, small: 4.5 } as const;

/** A soft radial fill lit from the upper left, like the concept's fluff gradients. */
export function fluffFill(stops: readonly [string, string, string], middle: number): FillGradient {
  return new FillGradient({
    type: "radial",
    center: { x: 0.45, y: 0.33 },
    innerRadius: 0,
    outerCenter: { x: 0.45, y: 0.33 },
    outerRadius: 0.72,
    colorStops: [
      { offset: 0, color: stops[0] },
      { offset: middle, color: stops[1] },
      { offset: 1, color: stops[2] },
    ],
    textureSpace: "local",
  });
}

/** The bill's top-to-bottom orange fill, built once: each gradient owns a texture, and the face redraws often. */
export const BILL_FILL = new FillGradient({
  type: "linear",
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: PALETTE.bill[0] },
    { offset: 1, color: PALETTE.bill[1] },
  ],
  textureSpace: "local",
});

/**
 * Traces SVG-style relative quadratic curves (`q cx cy ex ey`, both points from the current one)
 * from `x`, `y`, ready to fill or stroke.
 */
export function quads(
  g: Graphics,
  x: number,
  y: number,
  curves: readonly (readonly number[])[],
): Graphics {
  g.moveTo(x, y);
  let at = { x, y };
  for (const [cx = 0, cy = 0, ex = 0, ey = 0] of curves) {
    g.quadraticCurveTo(at.x + cx, at.y + cy, at.x + ex, at.y + ey);
    at = { x: at.x + ex, y: at.y + ey };
  }
  return g;
}

/** An ellipse of `count` outlined puffs of radius `puff` around an ellipse fill: the scalloped fluff. */
export interface Fluff {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly count: number;
  readonly puff: number;
}

/** Draws scalloped fluff: outlined puffs, then their insides and the middle without outlines. */
export function fluff(g: Graphics, shape: Fluff, fill: FillGradient, outline: number): void {
  const puffs = Array.from({ length: shape.count }, (_, index) => {
    const angle = (2 * Math.PI * index) / shape.count;
    return { x: shape.x + shape.rx * Math.cos(angle), y: shape.y + shape.ry * Math.sin(angle) };
  });
  for (const at of puffs) {
    g.circle(at.x, at.y, shape.puff).fill(fill).stroke({ width: outline, color: PALETTE.outline });
  }
  for (const at of puffs) g.circle(at.x, at.y, shape.puff - outline / 2).fill(fill);
  g.ellipse(shape.x, shape.y, shape.rx, shape.ry).fill(fill);
}
