import { Container, Graphics, Text } from "pixi.js";

import { GROUND } from "../core/pond";
import { type Bubble, SPEECH_WIDTH } from "../core/speech";
import type { sensingRing } from "../core/sensing";
import { THOUGHT_ICONS, THOUGHT_WIDTH, type ThoughtIcon, type thoughtAt } from "../core/thought";

const PADDING = 14;
/** How far above Puddles' feet the bubbles' tails end, clear of his head. */
const ABOVE = 140;
const TAIL = 18;
const INK = "#222222";
const PAPER = "#ffffff";
const OUTLINE = 3;
/** The cloud's puffs as [x, y, radius] in halves of the thought bubble's width, up from its bottom. */
const PUFFS = [
  [0, -0.75, 0.65],
  [-0.55, -0.65, 0.45],
  [0.55, -0.65, 0.45],
  [-0.3, -1.1, 0.45],
  [0.3, -1.1, 0.45],
  [-0.3, -0.4, 0.4],
  [0.3, -0.4, 0.4],
] as const;
/** The trailing circles' radii, from the cloud down towards Puddles. */
const TRAIL = [10, 7, 4] as const;
/** How far the middle of the cloud sits above the thought bubble's bottom. */
const CLOUD_MIDDLE = (PUFFS[0][1] * THOUGHT_WIDTH) / 2;
const SPARKLE = "#ffd23f";
/** Pixels per unit of an icon's -1 to 1 box. */
const ICON_SCALE = 26;

/** Draws the speech bubble into `scene` and returns how to show it centred at `centre` above Puddles each frame. */
export function drawBubble(
  scene: Container,
): (bubble: Bubble | undefined, centre: number, x: number, height: number) => void {
  const box = new Container();
  const back = new Graphics();
  const tail = new Graphics()
    .poly([-TAIL / 2, -2, TAIL / 2, -2, 0, TAIL])
    .fill(PAPER)
    .stroke({ width: OUTLINE, color: INK });
  const words = new Text({
    text: "",
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 24,
      fill: INK,
      align: "center",
      wordWrap: true,
      wordWrapWidth: SPEECH_WIDTH - 2 * PADDING,
    },
  });
  box.addChild(tail, back, words);
  box.visible = false;
  scene.addChild(box);
  let shownText = "";

  return (bubble, centre, x, height) => {
    box.visible = bubble !== undefined;
    if (!bubble) return;
    box.alpha = bubble.alpha;
    box.position.set(centre, GROUND - height - ABOVE - TAIL);
    tail.x = x - centre;
    if (bubble.text === shownText) return;
    shownText = bubble.text;
    words.text = bubble.text;
    const tall = words.height + 2 * PADDING;
    words.position.set(-words.width / 2, PADDING - tall);
    back
      .clear()
      .roundRect(-SPEECH_WIDTH / 2, -tall, SPEECH_WIDTH, tall, 16)
      .fill(PAPER)
      .stroke({ width: OUTLINE, color: INK });
  };
}

/** A cloud of overlapping puffs: every puff's outline first, then every fill, so only the edge shows. */
function drawCloud(): Graphics {
  const half = THOUGHT_WIDTH / 2;
  const cloud = new Graphics();
  for (const [x, y, r] of PUFFS) cloud.circle(x * half, y * half, r * half + OUTLINE).fill(INK);
  for (const [x, y, r] of PUFFS) cloud.circle(x * half, y * half, r * half).fill(PAPER);
  return cloud;
}

/** Draws `icon`'s shapes in ink, centred on the origin. */
function drawIcon(art: Graphics, icon: ThoughtIcon): void {
  const at = (points: readonly number[]) => points.map((p) => p * ICON_SCALE);
  art.clear();
  for (const shape of THOUGHT_ICONS[icon]) {
    if (shape.kind === "circle") {
      art.circle(shape.x * ICON_SCALE, shape.y * ICON_SCALE, shape.r * ICON_SCALE).fill(INK);
    } else if (shape.kind === "fill") {
      art.poly(at(shape.points)).fill(INK);
    } else {
      art.poly(at(shape.points), false).stroke({ width: 5, color: INK, cap: "round" });
    }
  }
}

/** Draws the thought bubble into `scene` and returns how to show it centred at `centre` above Puddles each frame. */
export function drawThought(
  scene: Container,
): (thought: ReturnType<typeof thoughtAt>, centre: number, x: number, height: number) => void {
  const box = new Container();
  const trail = new Graphics();
  const icon = new Graphics();
  icon.y = CLOUD_MIDDLE;
  box.addChild(trail, drawCloud(), icon);
  box.visible = false;
  scene.addChild(box);
  let shownIcon: ThoughtIcon | undefined;

  return (thought, centre, x, height) => {
    box.visible = thought !== undefined;
    if (!thought) return;
    box.alpha = thought.alpha;
    box.position.set(centre, GROUND - height - ABOVE - TAIL);
    trail.clear();
    TRAIL.forEach((r, i) => {
      const along = (i + 1) / (TRAIL.length + 1);
      trail
        .circle((x - centre) * along, TAIL * 2 * along, r)
        .fill(PAPER)
        .stroke({ width: OUTLINE, color: INK });
    });
    if (thought.icon === shownIcon) return;
    shownIcon = thought.icon;
    drawIcon(icon, thought.icon);
  };
}

/** Draws the sensing sparkles into `scene` and returns how to show them round the thought bubble at `centre` each frame. */
export function drawSensing(
  scene: Container,
): (sparkles: ReturnType<typeof sensingRing> | undefined, centre: number, height: number) => void {
  const art = new Graphics();
  scene.addChild(art);
  return (sparkles, centre, height) => {
    art.clear();
    art.position.set(centre, GROUND - height - ABOVE - TAIL + CLOUD_MIDDLE);
    for (const { x, y, r } of sparkles ?? []) {
      art
        .star(x, y, 4, r * 2, r * 0.6)
        .fill(SPARKLE)
        .stroke({ width: 1, color: INK });
    }
  };
}
