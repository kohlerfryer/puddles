import { type Application, type Container, Graphics } from "pixi.js";

import { createActing } from "../core/acting";
import { DEMO_SCRIPT, DEMO_TRAITS, demoDrop } from "../core/demo";
import { createGlass, facingKid, freeToWatch } from "../core/glass";
import { advanceIdle, idlePosition, startIdle } from "../core/idle";
import { createPhysics } from "../core/physics";
import { heldScale } from "../core/objectVerbs";
import { GROUND, SCENE_WIDTH, STICKER_POND } from "../core/pond";
import type { Step, Traits } from "../core/reaction";
import { createRunner } from "../core/runner";
import type { BodyGesture } from "../core/gestures";
import type { PoseFrame } from "../core/poseFixture";
import { bubbleAt, type Line } from "../core/speech";
import { bubbleCentres, gestureThought, thoughtAt } from "../core/thought";
import type { Duck, Facing, Hold } from "../core/verbs";
import { drawBubble, drawThought } from "./bubble";
import { type AtWindow, drawPuddles, holdPoint, type Shown } from "./puddles";

type IdleState = ReturnType<typeof startIdle>;

const STICKER_COLOUR = "#e0457b";
/** Longest physics step, so a slow frame can't drop the sticker through the ground. */
const MAX_STEP_MS = 1000 / 60;
/** How big a sticker shows once Puddles holds it, so a hat fits the head. */
const HELD_SCALE = 0.6;

function idleFacing(idle: IdleState, facing: Facing): Facing {
  const { from, to } = idle.action;
  if (to === from) return facing;
  return to > from ? 1 : -1;
}

type Body = ReturnType<ReturnType<typeof createPhysics>["addSticker"]>;

interface Drawn {
  readonly body: Body;
  readonly art: Graphics;
  held?: { readonly on: Hold; readonly since: number };
}

/** Draws a sticker loose where its body is, or scaled at `at` when Puddles holds it. */
function drawSticker({ body, art }: Drawn, at?: { x: number; y: number }, scale = 1): void {
  const offset = at ? body.position : { x: 0, y: 0 };
  art
    .clear()
    .poly(body.vertices.flatMap((v) => [v.x - offset.x, v.y - offset.y]))
    .fill(STICKER_COLOUR);
  art.position.set(at?.x ?? 0, at?.y ?? 0);
  art.scale.set(scale);
}

/** Drops stickers into one physics world and draws each wherever its body is, or Puddles holds it. */
function stickers(scene: Container) {
  const physics = createPhysics(STICKER_POND);
  const drawn: Drawn[] = [];
  const forget = (sticker: Drawn): void => {
    drawn.splice(drawn.indexOf(sticker), 1);
    sticker.art.destroy();
  };
  return {
    physics,
    /** Drops a sticker from the sky near Puddles at `x` and returns its body. */
    drop(traits: Traits, x: number) {
      const at = demoDrop(x);
      const body = physics.addSticker(traits, at.x, at.y);
      const art = new Graphics();
      scene.addChild(art);
      drawn.push({ body, art });
      return body;
    },
    /** Puddles takes `body` out of the world into the beak or onto the head, dropping anything held before. */
    take(body: Body, on: Hold, now: number): void {
      physics.remove(body);
      for (const sticker of drawn.filter((other) => other.held && other.body !== body)) {
        forget(sticker);
      }
      const sticker = drawn.find((other) => other.body === body);
      if (sticker) sticker.held = { on, since: now };
    },
    step(deltaMs: number, now: number, puddles: Parameters<typeof holdPoint>[0]): void {
      physics.step(Math.min(deltaMs, MAX_STEP_MS));
      for (const sticker of drawn) {
        const { held } = sticker;
        if (!held) {
          drawSticker(sticker);
          continue;
        }
        const scale = heldScale(held.on, (now - held.since) / 1000);
        if (scale === 0) forget(sticker);
        else drawSticker(sticker, holdPoint(puddles, held.on), scale * HELD_SCALE);
      }
    },
  };
}

/** Puddles' speech and thought bubbles, side by side above him. */
function talk(scene: Container) {
  const say = drawBubble(scene);
  const think = drawThought(scene);
  let line: Line | undefined;
  let thought: ReturnType<typeof gestureThought> | undefined;
  return {
    think(gesture: BodyGesture, now: number): void {
      thought = gestureThought(gesture, now);
    },
    /** Shows both bubbles at `now` ms above Puddles at `x`, `height` off the ground, starting `next` if he has a new line. */
    draw(x: number, height: number, now: number, next?: Line): void {
      if (next) line = next;
      const centres = bubbleCentres(x);
      say(bubbleAt(line, now), centres.speech, x, height);
      think(thoughtAt(thought, now), centres.thought, x, height);
    },
  };
}

type Cue = ReturnType<ReturnType<typeof createActing>["update"]>;

/** Shows Puddles acting out a cue, or idling on the bank between cues, turned towards a kid watching through the window. */
function posing() {
  let idle: IdleState | undefined;
  return (cue: Cue, duck: Duck, dt: number, glass: AtWindow): Shown => {
    if (cue) {
      idle = undefined;
      const { x, facing, height, wing, pose } = cue.frame;
      return { x, facing, height, wing, look: pose, mood: cue.mood, glass };
    }
    idle = idle ? advanceIdle(idle, dt, Math.random) : startIdle(duck.x, Math.random);
    const walking = idleFacing(idle, duck.facing);
    const facing = glass.watching ? facingKid(glass.gaze, walking) : walking;
    const look = idle.action.kind;
    return { x: idlePosition(idle), facing, height: 0, wing: 0, look, mood: "happy", glass };
  };
}

/** Lets other inputs (the camera, the dev panel) drive Puddles on the same clock as the demo. */
export interface Actor {
  react(step: Step): void;
  /** Drops a new sticker for Puddles to react to. */
  spawn(traits: Traits): void;
  /** Plays `script` now, replacing the running one. */
  play(script: readonly Step[]): void;
  /** Shows Puddles thinking of the gesture the player just made. */
  think(gesture: BodyGesture): void;
  /** Shows Puddles the latest camera frame, or that nobody is in view. */
  see(frame: PoseFrame | undefined): void;
}

/** Plays the six-verb demo, then idles: Puddles follows plans from core and decides nothing here. */
export function playDemo(app: Application, scene: Container): Actor {
  const show = drawPuddles(scene);
  const bubbles = talk(scene);
  const runner = createRunner();
  const acting = createActing();
  const glass = createGlass();
  let duck: Duck = { x: SCENE_WIDTH / 2, facing: 1 };
  const pose = posing();
  let clockMs = 0;
  const sticker = stickers(scene);
  let target = sticker.drop(DEMO_TRAITS, duck.x);
  runner.play(DEMO_SCRIPT, clockMs);

  app.ticker.add((ticker) => {
    clockMs += ticker.deltaMS;
    const status = runner.update(clockMs);
    const objectHeight = GROUND - target.bounds.min.y;
    const cue = acting.update(status, clockMs, duck, { object: target.position.x, objectHeight });
    const atWindow = glass.update(ticker.deltaMS / 1000, freeToWatch(cue?.frame.pose));
    if (cue?.nudge) sticker.physics.nudge(target, cue.nudge);
    if (cue?.take) sticker.take(target, cue.take.to, clockMs);
    const shown = pose(cue, duck, ticker.deltaMS / 1000, atWindow);
    duck = { x: shown.x, facing: shown.facing };
    show(shown, clockMs / 1000);
    bubbles.draw(shown.x, shown.height, clockMs, cue?.line);
    sticker.step(ticker.deltaMS, clockMs, shown);
  });
  return {
    react(step: Step): void {
      runner.react(step, clockMs);
    },
    spawn(traits: Traits): void {
      target = sticker.drop(traits, duck.x);
    },
    play(script: readonly Step[]): void {
      runner.play(script, clockMs);
    },
    think(gesture: BodyGesture): void {
      bubbles.think(gesture, clockMs);
    },
    see(frame: PoseFrame | undefined): void {
      glass.see(frame);
    },
  };
}
