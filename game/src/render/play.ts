import { type Application, type Container, Graphics } from "pixi.js";

import { createActing } from "../core/acting";
import { DEMO_SCRIPT, DEMO_TRAITS, demoDrop } from "../core/demo";
import { advanceIdle, idlePosition, startIdle } from "../core/idle";
import { createPhysics } from "../core/physics";
import { SCENE_WIDTH, STICKER_POND } from "../core/pond";
import type { Step, Traits } from "../core/reaction";
import { createRunner } from "../core/runner";
import type { Duck, Facing } from "../core/verbs";
import { drawPuddles } from "./puddles";

type IdleState = ReturnType<typeof startIdle>;

const STICKER_COLOUR = "#e0457b";
/** Longest physics step, so a slow frame can't drop the sticker through the ground. */
const MAX_STEP_MS = 1000 / 60;

function idleFacing(idle: IdleState, facing: Facing): Facing {
  const { from, to } = idle.action;
  if (to === from) return facing;
  return to > from ? 1 : -1;
}

/** Drops stickers into one physics world and draws each wherever its body is. */
function stickers(scene: Container) {
  const physics = createPhysics(STICKER_POND);
  const drawn: { body: ReturnType<typeof physics.addSticker>; art: Graphics }[] = [];
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
    step(deltaMs: number): void {
      physics.step(Math.min(deltaMs, MAX_STEP_MS));
      for (const { body, art } of drawn) {
        art
          .clear()
          .poly(body.vertices.flatMap((v) => [v.x, v.y]))
          .fill(STICKER_COLOUR);
      }
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

/** Plays the six-verb demo, then idles: Puddles follows plans from core and decides nothing here. */
export function playDemo(app: Application, scene: Container): Actor {
  const show = drawPuddles(scene);
  const runner = createRunner();
  const acting = createActing();
  let duck: Duck = { x: SCENE_WIDTH / 2, facing: 1 };
  let idle: IdleState | undefined;
  let clockMs = 0;
  const sticker = stickers(scene);
  let target = sticker.drop(DEMO_TRAITS, duck.x);
  runner.play(DEMO_SCRIPT, clockMs);

  app.ticker.add((ticker) => {
    clockMs += ticker.deltaMS;
    sticker.step(ticker.deltaMS);
    const status = runner.update(clockMs);
    const cue = acting.update(status, clockMs, duck, { object: target.position.x });
    if (cue) {
      idle = undefined;
      if (cue.nudge) sticker.physics.nudge(target, cue.nudge);
      duck = { x: cue.frame.x, facing: cue.frame.facing };
      const { height, pose, wing } = cue.frame;
      show({ ...duck, height, wing, look: pose, mood: cue.mood }, clockMs / 1000);
      return;
    }
    idle = idle
      ? advanceIdle(idle, ticker.deltaMS / 1000, Math.random)
      : startIdle(duck.x, Math.random);
    duck = { x: idlePosition(idle), facing: idleFacing(idle, duck.facing) };
    show({ ...duck, height: 0, wing: 0, look: idle.action.kind, mood: "happy" }, clockMs / 1000);
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
