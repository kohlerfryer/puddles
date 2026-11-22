import { describe, expect, it } from "vitest";

import { fitScene, POND, SCENE_HEIGHT, SCENE_WIDTH } from "./pond";

describe("POND layout", () => {
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
