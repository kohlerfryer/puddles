import { describe, expect, it } from "vitest";

import { checkPlugin } from "../../../kernel/harness";
import { affording, createWorld, loadScene, ofKind } from "../../../kernel/world";
import manifest from "./manifest.json";
import scene from "./pond.ldtk?raw";

describe("pond content plugin", () => {
  it("passes the plugin harness", () => {
    expect(checkPlugin(() => ({ manifest }))).toEqual([]);
  });

  it("loads its scene from its manifest", () => {
    const { size, things } = loadScene(manifest, scene);
    expect(size).toEqual({ width: 1600, height: 900 });
    expect(things.map((t) => t.kind)).toEqual(["sky", "water", "bank", "reed", "reed", "rock"]);
  });

  it("lets Puddles hide behind the reeds and the rock, and sit on the rock", () => {
    const world = createWorld(loadScene(manifest, scene).things);
    expect(affording(world, "hide_behind").map((t) => t.kind)).toEqual(["reed", "reed", "rock"]);
    expect(affording(world, "sit_on").map((t) => t.kind)).toEqual(["rock"]);
    expect(ofKind(world, "rock")[0]?.slots).toEqual(["top"]);
  });

  it("stands every prop on the bank", () => {
    const world = createWorld(loadScene(manifest, scene).things);
    const bankTop = ofKind(world, "bank")[0]?.position.y;
    for (const prop of world.with("affords").entities) {
      expect(prop.position.y + prop.size.height).toBe(bankTop);
    }
  });
});
