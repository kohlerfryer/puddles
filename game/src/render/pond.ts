import { type Application, Container, Graphics } from "pixi.js";

import { fitScene, POND, SCENE_WIDTH } from "../core/pond";

const COLOURS = {
  sky: "#cfe8f3",
  water: "#4a90c2",
  bank: "#7cb35a",
  reed: "#4f7a2e",
  reedHead: "#6b4423",
  rock: "#8a8f94",
};

function drawBands(g: Graphics): void {
  for (const name of ["sky", "water", "bank"] as const) {
    const band = POND[name];
    g.rect(0, band.top, SCENE_WIDTH, band.height).fill(COLOURS[name]);
  }
}

function drawReeds(g: Graphics): void {
  const ground = POND.bank.top;
  for (const reed of POND.reeds) {
    const left = reed.x - reed.width / 2;
    g.rect(left, ground - reed.height, reed.width, reed.height).fill(COLOURS.reed);
    g.roundRect(left, ground - reed.height, reed.width, reed.height / 4, reed.width / 2).fill(
      COLOURS.reedHead,
    );
  }
}

function drawRock(g: Graphics): void {
  const { x, width, height } = POND.rock;
  g.ellipse(x, POND.bank.top, width / 2, height).fill(COLOURS.rock);
}

/** Draws the pond, keeps it fitted to the window and returns the scene to draw Puddles into. */
export function drawPond(app: Application): Container {
  const scene = new Container();
  const g = new Graphics();
  drawBands(g);
  drawReeds(g);
  drawRock(g);
  scene.addChild(g);
  app.stage.addChild(scene);

  const fit = (): void => {
    const { scale, x, y } = fitScene(app.screen.width, app.screen.height);
    scene.scale.set(scale);
    scene.position.set(x, y);
  };
  fit();
  app.renderer.on("resize", fit);
  return scene;
}
