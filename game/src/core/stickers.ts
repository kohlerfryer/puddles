import type Matter from "matter-js";

import { heldScale } from "../plugins/skill/objectVerbs";
import type { Hold } from "../plugins/skill/verbs";
import { type createPhysics, stickerProps, stickerSize } from "./physics";
import type { Traits } from "./reaction";

/** Most stickers in the pond at once; dropping another lets the oldest go. */
export const MAX_STICKERS = 10;
/** Corner radius of a photo frame, as a share of its shorter side. */
const CORNER = 0.2;

type Physics = ReturnType<typeof createPhysics>;

/** The rounded frame a sticker's picture sits in, centred on its body. */
interface Frame {
  readonly width: number;
  readonly height: number;
  readonly corner: number;
}

/** A sticker in the pond, with `look`, whatever the renderer draws it with. */
interface Sticker<Look> {
  readonly body: Matter.Body;
  readonly frame: Frame;
  readonly look: Look;
  /** When it appeared, in ms. */
  readonly born: number;
  held?: { readonly on: Hold; readonly since: number };
}

/** The frame for a sticker with these traits: as big as its body, a circle if it rolls. */
export function photoFrame(traits: Traits): Frame {
  const { width, height } = stickerSize(traits);
  const corner = stickerProps(traits).rolls ? width / 2 : Math.min(width, height) * CORNER;
  return { width, height, corner };
}

/**
 * Keeps the stickers in the pond and lets go of each one, through `release`, once it is eaten,
 * swapped for another on Puddles' head, or the oldest when the pond is full.
 */
export function createStickers<Look>(physics: Physics, release: (look: Look) => void) {
  const live: Sticker<Look>[] = [];
  const forget = (sticker: Sticker<Look>): void => {
    live.splice(live.indexOf(sticker), 1);
    physics.remove(sticker.body);
    release(sticker.look);
  };
  return {
    physics,
    /** Drops a sticker with `traits` at `at` at `now` ms, drawn with the look `draw` makes for its frame. */
    drop(
      traits: Traits,
      at: { x: number; y: number },
      now: number,
      draw: (frame: Frame) => Look,
    ): Sticker<Look> {
      const frame = photoFrame(traits);
      const sticker = {
        body: physics.addSticker(traits, at.x, at.y),
        frame,
        look: draw(frame),
        born: now,
      };
      live.push(sticker);
      for (const old of live.slice(0, -MAX_STICKERS)) forget(old);
      return sticker;
    },
    /** Puddles takes `body` out of the world into the beak or onto the head, dropping anything held before. */
    take(body: Matter.Body, on: Hold, now: number): void {
      const sticker = live.find((other) => other.body === body);
      if (!sticker) return;
      physics.remove(body);
      for (const other of live.filter((held) => held.held && held !== sticker)) forget(other);
      sticker.held = { on, since: now };
    },
    /** Lets go of stickers Puddles has finished swallowing by `now` ms. */
    settle(now: number): void {
      const swallowed = live.filter(
        ({ held }) => held && heldScale(held.on, (now - held.since) / 1000) === 0,
      );
      for (const sticker of swallowed) forget(sticker);
    },
    all: (): readonly Sticker<Look>[] => live,
  };
}
