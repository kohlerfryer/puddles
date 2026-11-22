import { Container, Graphics, Text } from "pixi.js";

import { GROUND, SCENE_WIDTH } from "../core/pond";
import type { Bubble } from "../core/speech";

/** The bubble is this wide whatever the line, so long lines wrap onto more rows. */
const WIDTH = 260;
const PADDING = 14;
/** How far above Puddles' feet the bubble's tail ends, clear of his head. */
const ABOVE = 140;
const TAIL = 18;
const INK = "#222222";
const PAPER = "#ffffff";

/** Draws the speech bubble into `scene` and returns how to show it above Puddles each frame. */
export function drawBubble(
  scene: Container,
): (bubble: Bubble | undefined, x: number, height: number) => void {
  const box = new Container();
  const back = new Graphics();
  const tail = new Graphics()
    .poly([-TAIL / 2, -2, TAIL / 2, -2, 0, TAIL])
    .fill(PAPER)
    .stroke({ width: 3, color: INK });
  const words = new Text({
    text: "",
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 24,
      fill: INK,
      align: "center",
      wordWrap: true,
      wordWrapWidth: WIDTH - 2 * PADDING,
    },
  });
  box.addChild(tail, back, words);
  box.visible = false;
  scene.addChild(box);
  let shownText = "";

  return (bubble, x, height) => {
    box.visible = bubble !== undefined;
    if (!bubble) return;
    box.alpha = bubble.alpha;
    const left = Math.min(Math.max(x, WIDTH / 2), SCENE_WIDTH - WIDTH / 2);
    box.position.set(left, GROUND - height - ABOVE - TAIL);
    tail.x = x - left;
    if (bubble.text === shownText) return;
    shownText = bubble.text;
    words.text = bubble.text;
    const tall = words.height + 2 * PADDING;
    words.position.set(-words.width / 2, PADDING - tall);
    back
      .clear()
      .roundRect(-WIDTH / 2, -tall, WIDTH, tall, 16)
      .fill(PAPER)
      .stroke({ width: 3, color: INK });
  };
}
