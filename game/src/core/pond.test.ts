import { describe, expect, it } from "vitest";

import { ofKind } from "../kernel/world";
import {
  fitScene,
  GROUND,
  POND,
  POND_WORLD,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  STICKER_POND,
} from "./pond";

describe("POND layout", () => {
  it("reads the bands and props from the pond's world", () => {
    const [rock] = ofKind(POND_WORLD, "rock");
    expect(POND.rock).toEqual({ x: 1000, width: 180, height: 110 });
    expect(rock?.position).toEqual({ x: 910, y: 550 });
    expect(POND.reeds).toHaveLength(ofKind(POND_WORLD, "reed").length);
    expect(POND.water).toEqual({ top: 360, height: 300 });
  });

  it("is as big as the pond's level", () => {
    expect({ width: SCENE_WIDTH, height: SCENE_HEIGHT }).toEqual({ width: 1600, height: 900 });
  });

  it("stacks sky, water and bank to fill the scene height", () => {
    expect(POND.sky.top).toBe(0);
    expect(POND.water.top).toBe(POND.sky.top + POND.sky.height);
    expect(POND.bank.top).toBe(POND.water.top + POND.water.height);
    expect(POND.bank.top + POND.bank.height).toBe(SCENE_HEIGHT);
  });

  it("stands the reeds and rock on the bank inside the scene", () => {
    const props = [...POND.reeds, POND.rock];
    for (const prop of props) {
      expect(prop.x - prop.width / 2).toBeGreaterThanOrEqual(0);
      expect(prop.x + prop.width / 2).toBeLessThanOrEqual(SCENE_WIDTH);
      expect(prop.height).toBeLessThan(POND.bank.top);
    }
  });
});

describe("fitScene", () => {
  it("fills a window with the scene's proportions exactly", () => {
    expect(fitScene(SCENE_WIDTH / 2, SCENE_HEIGHT / 2)).toEqual({
      scale: 0.5,
      x: 0,
      y: 0,
    });
  });

  it("centres the scene horizontally in a wide window", () => {
    expect(fitScene(SCENE_WIDTH * 2, SCENE_HEIGHT)).toEqual({
      scale: 1,
      x: SCENE_WIDTH / 2,
      y: 0,
    });
  });

  it("centres the scene vertically in a tall window", () => {
    expect(fitScene(SCENE_WIDTH, SCENE_HEIGHT * 3)).toEqual({
      scale: 1,
      x: 0,
      y: SCENE_HEIGHT,
    });
  });
});

describe("STICKER_POND", () => {
  it("rests stickers on the ground Puddles stands on, all along the bank", () => {
    expect(GROUND).toBeGreaterThan(POND.bank.top);
    expect(GROUND).toBeLessThan(SCENE_HEIGHT);
    expect(STICKER_POND).toEqual({
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT,
      bankEdge: SCENE_WIDTH,
      bankTop: GROUND,
      waterline: SCENE_HEIGHT,
    });
  });
});
