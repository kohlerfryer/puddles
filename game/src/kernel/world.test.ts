import { describe, expect, it } from "vitest";

import { affording, createWorld, loadScene, ofKind, only, type Thing } from "./world";

const manifest = {
  kind: "content",
  type: "scene",
  id: "meadow",
  contract: "1",
  name: "Meadow",
  authors: ["P"],
  license: "MIT",
};

interface Field {
  readonly __identifier: string;
  readonly __type: string;
  readonly __value: unknown;
}

const int = (name: string, value: number): Field => ({
  __identifier: name,
  __type: "Int",
  __value: value,
});
const strings = (name: string, value: string[]): Field => ({
  __identifier: name,
  __type: "Array<String>",
  __value: value,
});

function entity(kind: string, px: [number, number], pivot: [number, number], fields: Field[]) {
  return {
    __identifier: kind,
    __grid: [0, 0],
    __pivot: pivot,
    __tile: null,
    px,
    defUid: 1,
    fieldInstances: fields,
  };
}

/** A layer of painted tiles, which holds no entities. */
const tiles = { __identifier: "Ground", __type: "Tiles", __tilesetDefUid: null, gridTiles: [] };

/** A one-level LDtk project holding `entities` on its entity layer, over a tile layer. */
function project(level: string, entities: unknown[]): string {
  const layer = {
    __identifier: "Entities",
    __type: "Entities",
    __cWid: 40,
    __cHei: 30,
    __gridSize: 10,
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __tilesetDefUid: null,
    entityInstances: entities,
  };
  return JSON.stringify({
    jsonVersion: "0.7.2",
    externalLevels: false,
    defs: { tilesets: [], enums: [], entities: [] },
    levels: [{ identifier: level, uid: 0, pxWid: 400, pxHei: 300, layerInstances: [layer, tiles] }],
  });
}

const box = (width: number, height: number) => [int("width", width), int("height", height)];
const log = entity(
  "Log",
  [100, 200],
  [0.5, 1],
  [...box(80, 20), strings("affords", ["sit_on", "hide_behind"]), strings("slots", ["top"])],
);
const grass = entity("Grass", [0, 200], [0, 0], box(400, 100));

describe("loadScene", () => {
  it("reads the level named by the manifest as entities with their components", () => {
    const scene = loadScene(manifest, project("meadow", [grass, log]));
    expect(scene.size).toEqual({ width: 400, height: 300 });
    expect(scene.things).toEqual([
      {
        id: "grass-0",
        kind: "grass",
        position: { x: 0, y: 200 },
        size: { width: 400, height: 100 },
      },
      {
        id: "log-1",
        kind: "log",
        position: { x: 60, y: 180 },
        size: { width: 80, height: 20 },
        affords: ["sit_on", "hide_behind"],
        slots: ["top"],
      },
    ]);
  });

  it("refuses a manifest that is not a scene", () => {
    const prop = { ...manifest, type: "prop" };
    expect(() => loadScene(prop, project("meadow", []))).toThrow("meadow is not a scene");
    expect(() => loadScene({ kind: "content" }, project("meadow", []))).toThrow(
      "not a valid manifest",
    );
  });

  it("refuses a scene with no level named after its manifest", () => {
    expect(() => loadScene(manifest, project("forest", []))).toThrow("no level named meadow");
  });

  it("refuses an entity without a size", () => {
    const stone = entity("Stone", [0, 0], [0, 0], [int("width", 10)]);
    expect(() => loadScene(manifest, project("meadow", [stone]))).toThrow(
      'Stone needs a number field "height"',
    );
  });
});

const thing = (id: string, kind: string, extra: Partial<Thing> = {}): Thing => ({
  id,
  kind,
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  ...extra,
});

describe("world queries", () => {
  const world = createWorld([
    thing("sky", "sky"),
    thing("reed-1", "reed", { affords: ["hide_behind"] }),
    thing("rock", "rock", { affords: ["sit_on", "hide_behind"], slots: ["top"] }),
    thing("reed-2", "reed", { affords: ["hide_behind"] }),
  ]);

  it("finds everything that affords an action, in scene order", () => {
    expect(affording(world, "hide_behind").map((t) => t.id)).toEqual(["reed-1", "rock", "reed-2"]);
    expect(affording(world, "sit_on").map((t) => t.id)).toEqual(["rock"]);
    expect(affording(world, "fly")).toEqual([]);
  });

  it("finds things by kind", () => {
    expect(ofKind(world, "reed").map((t) => t.id)).toEqual(["reed-1", "reed-2"]);
    expect(ofKind(world, "cloud")).toEqual([]);
  });

  it("finds the one thing of a kind, and refuses none or several", () => {
    expect(only(world, "sky").id).toBe("sky");
    expect(() => only(world, "cloud")).toThrow("the scene needs exactly one cloud");
    expect(() => only(world, "reed")).toThrow("the scene needs exactly one reed");
  });

  it("sees things added after it was made", () => {
    world.add(thing("box", "box", { affords: ["hide_in"] }));
    expect(affording(world, "hide_in").map((t) => t.id)).toEqual(["box"]);
  });
});
