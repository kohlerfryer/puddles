import { createWorld, loadScene, ofKind, only, type Thing } from "../kernel/world";
import manifest from "../plugins/content/pond/manifest.json";
import ldtk from "../plugins/content/pond/pond.ldtk?raw";
import type { Pond } from "./physics";

const scene = loadScene(manifest, ldtk);

/** The pond's entities, loaded from the pond content plugin's scene. */
export const POND_WORLD = createWorld(scene.things);

export const SCENE_WIDTH = scene.size.width;
export const SCENE_HEIGHT = scene.size.height;

interface Band {
  readonly top: number;
  readonly height: number;
}

/** A prop standing on the bank, centred on `x`, rising `height` above it. */
interface Prop {
  readonly x: number;
  readonly width: number;
  readonly height: number;
}

interface PondLayout {
  readonly sky: Band;
  readonly water: Band;
  readonly bank: Band;
  readonly reeds: readonly Prop[];
  readonly rock: Prop;
}

const band = (kind: string): Band => {
  const { position, size } = only(POND_WORLD, kind);
  return { top: position.y, height: size.height };
};

const prop = ({ position, size }: Thing): Prop => ({
  x: position.x + size.width / 2,
  width: size.width,
  height: size.height,
});

export const POND: PondLayout = {
  sky: band("sky"),
  water: band("water"),
  bank: band("bank"),
  reeds: ofKind(POND_WORLD, "reed").map(prop),
  rock: prop(only(POND_WORLD, "rock")),
};

/** The line along the bank where Puddles stands and stickers come to rest. */
export const GROUND = POND.bank.top + POND.bank.height / 3;

/** The scene as sticker physics sees it: stickers land on the ground anywhere along the bank. */
export const STICKER_POND: Pond = {
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT,
  bankEdge: SCENE_WIDTH,
  bankTop: GROUND,
  waterline: SCENE_HEIGHT,
};

interface SceneFit {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Scales the scene to fit the window without stretching, centred. */
export function fitScene(windowWidth: number, windowHeight: number): SceneFit {
  const scale = Math.min(windowWidth / SCENE_WIDTH, windowHeight / SCENE_HEIGHT);
  return {
    scale,
    x: (windowWidth - SCENE_WIDTH * scale) / 2,
    y: (windowHeight - SCENE_HEIGHT * scale) / 2,
  };
}
