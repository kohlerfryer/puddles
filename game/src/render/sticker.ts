import { Container, Graphics, Sprite, Texture } from "pixi.js";

import { poofAt } from "../core/poof";
import type { photoFrame } from "../core/stickers";

type Frame = ReturnType<typeof photoFrame>;

const STICKER_COLOUR = "#e0457b";
const OUTLINE = { width: 5, color: "#ffffff" };
/** The soft glow round a photo: rings widening outward, each fainter than the last. */
const GLOW = { color: "#fff6c8", rings: 4, step: 4, alpha: 0.18 };
const POOF_COLOUR = "#ffffff";

/** How a sticker is drawn: its art, its photo if it has one, and the poof it appears with. */
export interface Look {
  readonly art: Container;
  readonly poof: Graphics;
  readonly photo?: { readonly texture: Texture; readonly bitmap: ImageBitmap };
}

function rounded(g: Graphics, frame: Frame, grow = 0): Graphics {
  const { width, height, corner } = frame;
  return g.roundRect(
    -width / 2 - grow,
    -height / 2 - grow,
    width + 2 * grow,
    height + 2 * grow,
    corner + grow,
  );
}

/** The held-up photo in its frame: glowing, clipped to the rounded frame and outlined in white. */
function photoArt(art: Container, frame: Frame, texture: Texture): void {
  const glow = new Graphics();
  for (let ring = GLOW.rings; ring > 0; ring--) {
    rounded(glow, frame, ring * GLOW.step).fill({ color: GLOW.color, alpha: GLOW.alpha });
  }
  const picture = new Sprite(texture);
  picture.anchor.set(0.5);
  picture.setSize(Math.max(frame.width, frame.height));
  const mask = rounded(new Graphics(), frame).fill("#ffffff");
  picture.mask = mask;
  const outline = rounded(new Graphics(), frame).stroke(OUTLINE);
  art.addChild(glow, picture, mask, outline);
}

/** Draws a new sticker in `frame` into `scene`, showing `bitmap` if it came from the camera. */
export function stickerLook(scene: Container, frame: Frame, bitmap?: ImageBitmap): Look {
  const art = new Container();
  const poof = new Graphics();
  scene.addChild(art, poof);
  if (!bitmap) {
    art.addChild(rounded(new Graphics(), frame).fill(STICKER_COLOUR));
    return { art, poof };
  }
  const texture = Texture.from(bitmap, true);
  photoArt(art, frame, texture);
  return { art, poof, photo: { texture, bitmap } };
}

/** Destroys a sticker's drawing and frees its photo's texture. */
export function releaseLook({ art, poof, photo }: Look): void {
  art.destroy({ children: true });
  poof.destroy();
  if (!photo) return;
  photo.texture.destroy(true);
  photo.bitmap.close();
}

/** Puts the sticker at `at`, turned by `angle` and scaled, with its poof `age` ms after it appeared. */
export function placeLook(
  { art, poof }: Look,
  at: { x: number; y: number; angle: number; scale: number },
  age: number,
): void {
  art.position.set(at.x, at.y);
  art.rotation = at.angle;
  art.scale.set(at.scale);
  poof.clear().position.set(at.x, at.y);
  for (const puff of poofAt(age)) {
    poof.circle(puff.x, puff.y, puff.r).fill({ color: POOF_COLOUR, alpha: puff.alpha });
  }
}
