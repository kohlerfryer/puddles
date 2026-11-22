export const SCENE_WIDTH = 1600;
export const SCENE_HEIGHT = 900;

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

export const POND: PondLayout = {
  sky: { top: 0, height: 360 },
  water: { top: 360, height: 300 },
  bank: { top: 660, height: 240 },
  reeds: [
    { x: 180, width: 60, height: 220 },
    { x: 1380, width: 70, height: 260 },
  ],
  rock: { x: 1000, width: 180, height: 110 },
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
