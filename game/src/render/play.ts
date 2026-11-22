import { type Application, type Container, Graphics } from "pixi.js";

import { createActing } from "../core/acting";
import { DEMO_SCRIPT, DEMO_TRAITS, demoDrop } from "../core/demo";
import { advanceIdle, idlePosition, startIdle } from "../core/idle";
import { createPhysics } from "../core/physics";
import { SCENE_WIDTH, STICKER_POND } from "../core/pond";
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

/** Drops the demo sticker and draws it wherever its body is. */
function demoSticker(scene: Container, x: number) {
  const physics = createPhysics(STICKER_POND);
  const drop = demoDrop(x);
  const body = physics.addSticker(DEMO_TRAITS, drop.x, drop.y);
  const art = new Graphics();
  scene.addChild(art);
  return {
    body,
    physics,
    step(deltaMs: number): void {
      physics.step(Math.min(deltaMs, MAX_STEP_MS));
      art
        .clear()
        .poly(body.vertices.flatMap((v) => [v.x, v.y]))
        .fill(STICKER_COLOUR);
    },
  };
}

/** Plays the six-verb demo, then idles: Puddles follows plans from core and decides nothing here. */
export function playDemo(app: Application, scene: Container): void {
  const show = drawPuddles(scene);
  const runner = createRunner();
  const acting = createActing();
  let duck: Duck = { x: SCENE_WIDTH / 2, facing: 1 };
  let idle: IdleState | undefined;
  let clockMs = 0;
  const sticker = demoSticker(scene, duck.x);
  runner.play(DEMO_SCRIPT, clockMs);

  app.ticker.add((ticker) => {
    clockMs += ticker.deltaMS;
    sticker.step(ticker.deltaMS);
    const status = runner.update(clockMs);
    const cue = acting.update(status, clockMs, duck, { object: sticker.body.position.x });
    if (cue) {
      idle = undefined;
      if (cue.nudge) sticker.physics.nudge(sticker.body, cue.nudge);
      duck = { x: cue.frame.x, facing: cue.frame.facing };
      show(
        { ...duck, height: cue.frame.height, look: cue.frame.pose, mood: cue.mood },
        clockMs / 1000,
      );
      return;
    }
    idle = idle
      ? advanceIdle(idle, ticker.deltaMS / 1000, Math.random)
      : startIdle(duck.x, Math.random);
    duck = { x: idlePosition(idle), facing: idleFacing(idle, duck.facing) };
    show({ ...duck, height: 0, look: idle.action.kind, mood: "happy" }, clockMs / 1000);
  });
}
