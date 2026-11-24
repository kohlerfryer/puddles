import { type Application, Container, Graphics } from "pixi.js";

import { fitScene, POND_WORLD } from "../core/pond";
import type { Thing } from "../kernel/world";

const COLOURS = {
  sky: "#cfe8f3",
  water: "#4a90c2",
  bank: "#7cb35a",
  reed: "#4f7a2e",
  reedHead: "#6b4423",
  rock: "#8a8f94",
};

type Draw = (g: Graphics, thing: Thing) => void;

const band =
  (colour: string): Draw =>
  (g, { position, size }) => {
    g.rect(position.x, position.y, size.width, size.height).fill(colour);
  };

const drawReed: Draw = (g, { position: { x, y }, size: { width, height } }) => {
  g.rect(x, y, width, height).fill(COLOURS.reed);
  g.roundRect(x, y, width, height / 4, width / 2).fill(COLOURS.reedHead);
};

/** The rock is half buried: an ellipse centred where it meets the bank. */
const drawRock: Draw = (g, { position: { x, y }, size: { width, height } }) => {
  g.ellipse(x + width / 2, y + height, width / 2, height).fill(COLOURS.rock);
};

const DRAW: Readonly<Record<string, Draw>> = {
  sky: band(COLOURS.sky),
  water: band(COLOURS.water),
  bank: band(COLOURS.bank),
  reed: drawReed,
  rock: drawRock,
};

/** Draws the pond's world, keeps it fitted to the window and returns the scene to draw Puddles into. */
export function drawPond(app: Application): Container {
  const scene = new Container();
  const g = new Graphics();
  for (const thing of POND_WORLD.entities) DRAW[thing.kind]?.(g, thing);
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
