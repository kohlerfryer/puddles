import type { Application, Container } from "pixi.js";

import { createActing } from "../core/acting";
import { type CopyCue, createCopyMe } from "../core/copyMe";
import { DEMO_SCRIPT, DEMO_TRAITS, demoDrop } from "../core/demo";
import { createGlass, freeToWatch, idleFacingKid } from "../core/glass";
import { advanceIdle, type IdleState, idlePosition, startIdle } from "../core/idle";
import { createPhysics } from "../core/physics";
import { heldScale } from "../plugins/skill/objectVerbs";
import { GROUND, SCENE_WIDTH, STICKER_POND } from "../core/pond";
import type { Step, Traits } from "../core/reaction";
import { createRunner } from "../core/runner";
import { sensingRing } from "../core/sensing";
import { createStickers } from "../core/stickers";
import type { BodyGesture } from "../core/gestures";
import type { PoseFrame } from "../core/poseFixture";
import { type Sound, soundFor } from "../core/sounds";
import { bubbleAt, type Line } from "../core/speech";
import { bubbleCentres, senseThought, thoughtAfter, thoughtAt } from "../core/thought";
import type { Duck } from "../plugins/skill/verbs";
import { drawBubble, drawSensing, drawThought } from "./bubble";
import { type AtWindow, drawPuddles, holdPoint, type Shown } from "./puddles";
import { type Look, placeLook, releaseLook, stickerLook } from "./sticker";

/** Longest physics step, so a slow frame can't drop the sticker through the ground. */
const MAX_STEP_MS = 1000 / 60;
/** How big a sticker shows once Puddles holds it, so a hat fits the head. */
const HELD_SCALE = 0.6;

/** Drops stickers into one physics world and draws each wherever its body is, or Puddles holds it. */
function stickers(scene: Container, play: (sound: Sound | undefined) => void) {
  const shelf = createStickers<Look>(createPhysics(STICKER_POND), releaseLook);
  return {
    ...shelf,
    /** Drops a sticker from the sky near Puddles at `x` at `now` ms, showing `photo` if given. */
    drop(traits: Traits, x: number, now: number, photo?: ImageBitmap) {
      return shelf.drop(traits, demoDrop(x), now, (frame) => stickerLook(scene, frame, photo));
    },
    /** Moves and draws the stickers, splashing those that land in the water. */
    step(deltaMs: number, now: number, puddles: Parameters<typeof holdPoint>[0]): void {
      const splashes = shelf.physics.step(Math.min(deltaMs, MAX_STEP_MS));
      splashes.forEach(() => {
        play(soundFor({ kind: "landed" }));
      });
      shelf.settle(now);
      for (const { body, look, born, held } of shelf.all()) {
        const at = held
          ? {
              ...holdPoint(puddles, held.on),
              angle: 0,
              scale: heldScale(held.on, (now - held.since) / 1000) * HELD_SCALE,
            }
          : { x: body.position.x, y: body.position.y, angle: body.angle, scale: 1 };
        placeLook(look, at, now - born);
      }
    },
  };
}

/** Puddles' speech and thought bubbles, side by side above him. */
function talk(scene: Container) {
  const say = drawBubble(scene);
  const think = drawThought(scene);
  const sparkle = drawSensing(scene);
  let line: Line | undefined;
  let thought: ReturnType<typeof thoughtAfter>;
  let sensingSince: number | undefined;
  return {
    /** Changes what Puddles thinks of as a copy-me `cue` happens at `now` ms. */
    follow(cue: CopyCue, now: number): void {
      thought = thoughtAfter(thought, cue, now);
    },
    /** Starts or stops Puddles sensing a photo at `now` ms. */
    sense(on: boolean, now: number): void {
      sensingSince = on ? now : undefined;
      thought = on ? senseThought(now) : undefined;
    },
    /** Whether Puddles is waiting to find out what he was shown. */
    sensing: (): boolean => sensingSince !== undefined,
    /** Shows both bubbles at `now` ms above Puddles at `x`, `height` off the ground, starting `next` if he has a new line. */
    draw(x: number, height: number, now: number, next?: Line): void {
      if (next) line = next;
      const centres = bubbleCentres(x);
      say(bubbleAt(line, now), centres.speech, x, height);
      think(thoughtAt(thought, now), centres.thought, x, height);
      const ring = sensingSince === undefined ? undefined : sensingRing(now - sensingSince);
      sparkle(ring, centres.thought, height);
    },
  };
}

type Cue = ReturnType<ReturnType<typeof createActing>["update"]>;

/**
 * Shows Puddles acting out a cue, or idling on the bank between cues, turned towards a kid
 * watching through the window, and curious while `sensing` a photo.
 */
function posing(sensing: () => boolean) {
  let idle: IdleState | undefined;
  return (cue: Cue, duck: Duck, dt: number, glass: AtWindow): Shown => {
    if (cue) {
      idle = undefined;
      const { x, facing, height, wing, pose } = cue.frame;
      return { x, facing, height, wing, look: pose, mood: cue.mood, shake: cue.shake, glass };
    }
    idle = idle ? advanceIdle(idle, dt, Math.random) : startIdle(duck.x, Math.random);
    const facing = idleFacingKid(idle, duck.facing, glass);
    const look = idle.action.kind;
    return {
      x: idlePosition(idle),
      facing,
      height: 0,
      wing: 0,
      look,
      mood: sensing() ? "curious" : "happy",
      shake: 0,
      glass,
    };
  };
}

/** The copy-me game, played through the runner and the thought bubble; core decides every move. */
function copier(runner: ReturnType<typeof createRunner>, bubbles: ReturnType<typeof talk>) {
  const copy = createCopyMe(Math.random);
  let inView = false;
  const follow = (cue: CopyCue, now: number): CopyCue => {
    runner.react(cue.step, now);
    bubbles.follow(cue, now);
    return cue;
  };
  return {
    /** Moves the game on to `now` ms, asking or giving up when core says; `busy` while Puddles acts. */
    tick: (now: number, busy: boolean): void => {
      const cue = copy.tick(now, { inView, busy });
      if (cue) follow(cue, now);
    },
    see: (gesture: BodyGesture, now: number): CopyCue => follow(copy.see(gesture, now), now),
    watching: (seen: boolean): void => {
      inView = seen;
    },
  };
}

/** Lets other inputs (the camera, the dev panel) drive Puddles on the same clock as the demo. */
export interface Actor {
  /** Drops a new sticker for Puddles to react to, showing the held-up `photo` if there is one. */
  spawn(traits: Traits, photo?: ImageBitmap): void;
  /** Plays `script` now, replacing the running one. */
  play(script: readonly Step[]): void;
  /** Reacts to the gesture the player just made, as an answer while Puddles is asking, and says how. */
  see(gesture: BodyGesture): CopyCue;
  /** Shows Puddles the latest camera frame, or that nobody is in view. */
  watching(frame: PoseFrame | undefined): void;
  /** Starts or stops Puddles sensing a photo while the server works out his reaction. */
  sense(on: boolean): void;
}

/**
 * Plays the six-verb demo, then idles: Puddles follows plans from core and decides nothing here,
 * and `play` sounds the cues core gives.
 */
export function playDemo(
  app: Application,
  scene: Container,
  play: (sound: Sound | undefined) => void,
): Actor {
  const show = drawPuddles(scene);
  const bubbles = talk(scene);
  const runner = createRunner();
  const acting = createActing();
  const glass = createGlass();
  let duck: Duck = { x: SCENE_WIDTH / 2, facing: 1 };
  const pose = posing(bubbles.sensing);
  let clockMs = 0;
  const sticker = stickers(scene, play);
  const copying = copier(runner, bubbles);
  let target = sticker.drop(DEMO_TRAITS, duck.x, clockMs).body;
  runner.play(DEMO_SCRIPT, clockMs);

  app.ticker.add((ticker) => {
    clockMs += ticker.deltaMS;
    const where = { object: target.position.x, objectHeight: GROUND - target.bounds.min.y };
    const cue = acting.update(runner.update(clockMs), clockMs, duck, where);
    for (const sound of cue?.sounds ?? []) play(sound);
    const atWindow = glass.update(ticker.deltaMS / 1000, freeToWatch(cue?.frame.pose));
    if (cue?.nudge) sticker.physics.nudge(target, cue.nudge);
    if (cue?.take) sticker.take(target, cue.take.to, clockMs);
    copying.tick(clockMs, cue !== undefined);
    const shown = pose(cue, duck, ticker.deltaMS / 1000, atWindow);
    duck = { x: shown.x, facing: shown.facing };
    show(shown, clockMs / 1000);
    bubbles.draw(shown.x, shown.height, clockMs, cue?.line);
    sticker.step(ticker.deltaMS, clockMs, shown);
  });
  return {
    spawn(traits: Traits, photo?: ImageBitmap): void {
      target = sticker.drop(traits, duck.x, clockMs, photo).body;
    },
    play(script: readonly Step[]): void {
      runner.play(script, clockMs);
    },
    see: (gesture: BodyGesture): CopyCue => copying.see(gesture, clockMs),
    watching(frame: PoseFrame | undefined): void {
      glass.see(frame);
      copying.watching(frame !== undefined);
    },
    sense(on: boolean): void {
      bubbles.sense(on, clockMs);
    },
  };
}
