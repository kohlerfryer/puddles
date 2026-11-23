import { type Application, type Container, Graphics } from "pixi.js";

import { createActing } from "../core/acting";
import { DEMO_SCRIPT, DEMO_TRAITS, demoDrop } from "../core/demo";
import { advanceIdle, idlePosition, startIdle } from "../core/idle";
import { createPhysics } from "../core/physics";
import { heldScale } from "../core/objectVerbs";
import { GROUND, SCENE_WIDTH, STICKER_POND } from "../core/pond";
import type { Step, Traits } from "../core/reaction";
import { createRunner } from "../core/runner";
import { type Sound, soundFor } from "../core/sounds";
import { bubbleAt, type Line } from "../core/speech";
import type { Duck, Facing, Hold } from "../core/verbs";
import { drawBubble } from "./bubble";
import { drawPuddles, holdPoint } from "./puddles";

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
function stickers(scene: Container, play: (sound: Sound | undefined) => void) {
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
    /** Moves and draws the stickers, splashing those that land in the water. */
    step(deltaMs: number, now: number, puddles: Parameters<typeof holdPoint>[0]): void {
      const splashes = physics.step(Math.min(deltaMs, MAX_STEP_MS));
      splashes.forEach(() => {
        play(soundFor({ kind: "landed" }));
      });
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

/** Puddles idling between scripts, starting afresh after each one. */
function idler() {
  let idle: IdleState | undefined;
  return {
    stop(): void {
      idle = undefined;
    },
    /** Moves the idle on `deltaMs` from `duck` and returns Puddles as shown. */
    next(deltaMs: number, duck: Duck) {
      idle = idle ? advanceIdle(idle, deltaMs / 1000, Math.random) : startIdle(duck.x, Math.random);
      const facing = idleFacing(idle, duck.facing);
      const look = idle.action.kind;
      return {
        x: idlePosition(idle),
        facing,
        height: 0,
        wing: 0,
        look,
        mood: "happy",
        shake: 0,
      } as const;
    },
  };
}

/** Lets other inputs (the camera, the dev panel) drive Puddles on the same clock as the demo. */
export interface Actor {
  react(step: Step): void;
  /** Drops a new sticker for Puddles to react to. */
  spawn(traits: Traits): void;
  /** Plays `script` now, replacing the running one. */
  play(script: readonly Step[]): void;
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
  const say = drawBubble(scene);
  let line: Line | undefined;
  const runner = createRunner();
  const acting = createActing();
  let duck: Duck = { x: SCENE_WIDTH / 2, facing: 1 };
  const idling = idler();
  let clockMs = 0;
  const sticker = stickers(scene, play);
  let target = sticker.drop(DEMO_TRAITS, duck.x);
  runner.play(DEMO_SCRIPT, clockMs);

  app.ticker.add((ticker) => {
    clockMs += ticker.deltaMS;
    const objectHeight = GROUND - target.bounds.min.y;
    const where = { object: target.position.x, objectHeight };
    const cue = acting.update(runner.update(clockMs), clockMs, duck, where);
    if (cue?.line) line = cue.line;
    for (const sound of cue?.sounds ?? []) play(sound);
    if (cue) {
      if (cue.nudge) sticker.physics.nudge(target, cue.nudge);
      if (cue.take) sticker.take(target, cue.take.to, clockMs);
      idling.stop();
    }
    const shown = cue
      ? { ...cue.frame, look: cue.frame.pose, mood: cue.mood, shake: cue.shake }
      : idling.next(ticker.deltaMS, duck);
    duck = { x: shown.x, facing: shown.facing };
    show(shown, clockMs / 1000);
    say(bubbleAt(line, clockMs), shown.x, shown.height);
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
  };
}
