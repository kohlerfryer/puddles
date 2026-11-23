import { describe, expect, it } from "vitest";

import {
  APPROACH_SECONDS,
  closeness,
  createGlass,
  ease,
  facingKid,
  freeToWatch,
  gazeTarget,
  glassPlacement,
  glassTap,
  idleFacingKid,
  LOST_SECONDS,
  stepApproach,
  TAP_EVERY,
  wantsGlass,
} from "./glass";
import { GROUND, POND } from "./pond";
import { isPoseFixture, LANDMARK_COUNT, type PoseFrame } from "./poseFixture";

const files = import.meta.glob<unknown>("./fixtures/*.json", { eager: true, import: "default" });
const fixture = (name: string) => {
  const data = files[`./fixtures/${name}.json`];
  if (!isPoseFixture(data)) throw new Error(`${name} is not a pose fixture`);
  return data;
};
const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** A person centred at `x` in the camera image whose torso spans `torso` of the frame's height. */
function person(x: number, torso: number, t = 0): PoseFrame {
  const landmarks = Array.from({ length: LANDMARK_COUNT }, () => ({
    x,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  const at = (index: number, dx: number, y: number) => {
    landmarks[index] = { x: x + dx, y, z: 0, visibility: 1 };
  };
  at(11, 0.05, 0.3);
  at(12, -0.05, 0.3);
  at(23, 0.04, 0.3 + torso);
  at(24, -0.04, 0.3 + torso);
  return { t, landmarks };
}

const FAR = 0.25;
const NEAR = 0.5;

describe("gazeTarget", () => {
  it("is straight ahead when the kid stands in the middle", () => {
    expect(gazeTarget(person(0.5, FAR))).toBeCloseTo(0);
  });

  it("is mirrored: the kid moving to their left shows on the image's right and looks left", () => {
    expect(gazeTarget(person(0.9, FAR))).toBeCloseTo(-0.8);
    expect(gazeTarget(person(0.1, FAR))).toBeCloseTo(0.8);
  });

  it("stays within the window when the kid steps out of frame", () => {
    expect(gazeTarget(person(1.4, FAR))).toBe(-1);
    expect(gazeTarget(person(-0.4, FAR))).toBe(1);
  });

  it("follows the kid across a recording", () => {
    const frames = fixture("wave-adult-close").frames;
    const gazes = frames.map(gazeTarget);
    expect(Math.min(...gazes)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...gazes)).toBeLessThanOrEqual(1);
    expect(Math.max(...gazes) - Math.min(...gazes)).toBeGreaterThan(0.1);
  });
});

describe("closeness", () => {
  it("rises as the body grows taller in frame", () => {
    expect(closeness(person(0.5, FAR))).toBe(0);
    expect(closeness(person(0.5, NEAR))).toBe(1);
    const between = closeness(person(0.5, 0.39));
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
  });

  it("is higher in the close recordings than the far ones", () => {
    const typical = (name: string) => median(fixture(name).frames.map(closeness));
    for (const far of ["idle-adult", "wave-adult", "flap-adult"]) {
      expect(typical(far)).toBe(0);
    }
    expect(typical("wave-adult-close")).toBeGreaterThan(0.7);
    expect(typical("flap-adult-close")).toBeGreaterThan(0.7);
  });
});

describe("ease", () => {
  it("moves part of the way towards the target each step", () => {
    const next = ease(0, 1, 0.1);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("does not jitter when the target flickers", () => {
    let value = 0;
    for (let i = 0; i < 30; i += 1) value = ease(value, i % 2 === 0 ? 1 : -1, 1 / 15);
    expect(Math.abs(value)).toBeLessThan(0.3);
  });

  it("settles on a steady target", () => {
    let value = 0;
    for (let i = 0; i < 60; i += 1) value = ease(value, 0.6, 1 / 15);
    expect(value).toBeCloseTo(0.6, 2);
  });
});

describe("wantsGlass", () => {
  it("comes up to the glass only once the kid is close", () => {
    expect(wantsGlass(false, 0.5)).toBe(false);
    expect(wantsGlass(false, 0.8)).toBe(true);
  });

  it("stays at the glass until the kid has clearly stepped back", () => {
    expect(wantsGlass(true, 0.5)).toBe(true);
    expect(wantsGlass(true, 0.2)).toBe(false);
  });
});

describe("stepApproach", () => {
  it("waddles to the glass and back over a fixed time", () => {
    expect(stepApproach(0, true, APPROACH_SECONDS / 2)).toBeCloseTo(0.5);
    expect(stepApproach(0.5, true, APPROACH_SECONDS)).toBe(1);
    expect(stepApproach(0.5, false, APPROACH_SECONDS / 4)).toBeCloseTo(0.25);
    expect(stepApproach(0.1, false, APPROACH_SECONDS)).toBe(0);
  });
});

describe("glassPlacement", () => {
  it("stands on the bank as usual when away from the glass", () => {
    expect(glassPlacement(0)).toEqual({ depth: 0, scale: 1 });
  });

  it("stands at the front of the bank and looks bigger at the glass", () => {
    const { depth, scale } = glassPlacement(1);
    expect(depth).toBeGreaterThan(0);
    expect(GROUND + depth).toBeLessThan(POND.bank.top + POND.bank.height);
    expect(scale).toBeGreaterThan(1);
  });
});

describe("glassTap", () => {
  it("does not tap straight away", () => {
    expect(glassTap(0)).toEqual({ bob: 0 });
  });

  it("taps now and then, with a ring that spreads after the beak hits", () => {
    const taps = Array.from({ length: 300 }, (_, i) => glassTap((i * 3 * TAP_EVERY) / 300));
    expect(taps.some((tap) => tap.bob > 0.9)).toBe(true);
    expect(taps.filter((tap) => tap.ring !== undefined).length).toBeGreaterThan(0);
    expect(taps.filter((tap) => tap.bob === 0 && tap.ring === undefined).length).toBeGreaterThan(
      150,
    );
    for (const { ring } of taps) if (ring !== undefined) expect(ring).toBeLessThanOrEqual(1);
  });
});

describe("freeToWatch", () => {
  it("watches the kid while idle or looking at the camera, and not while busy with a verb", () => {
    expect(freeToWatch(undefined)).toBe(true);
    expect(freeToWatch("look_camera")).toBe(true);
    expect(freeToWatch("walk")).toBe(false);
    expect(freeToWatch("look")).toBe(false);
  });
});

describe("facingKid", () => {
  it("turns towards the side the kid is on", () => {
    expect(facingKid(-0.6, 1)).toBe(-1);
    expect(facingKid(0.6, -1)).toBe(1);
  });

  it("keeps facing the same way when the kid is straight ahead", () => {
    expect(facingKid(0.05, -1)).toBe(-1);
    expect(facingKid(-0.05, 1)).toBe(1);
  });
});

describe("idleFacingKid", () => {
  const idle = (from: number, to: number) => ({
    action: { kind: from === to ? ("preen" as const) : ("wander" as const), from, to, seconds: 2 },
    elapsed: 0,
  });
  const kidOnRight = { watching: true, gaze: 0.6 };

  it("keeps facing the way he walks while wandering, wherever the kid is", () => {
    expect(idleFacingKid(idle(600, 300), 1, kidOnRight)).toBe(-1);
  });

  it("turns to the kid while resting", () => {
    expect(idleFacingKid(idle(400, 400), -1, kidOnRight)).toBe(1);
  });

  it("keeps his facing while resting with nobody watching", () => {
    expect(idleFacingKid(idle(400, 400), -1, { watching: false, gaze: 0.6 })).toBe(-1);
  });
});

describe("createGlass", () => {
  /** Shows `frame` (or nobody) to the glass every camera tick for `seconds` and returns the last view. */
  const run = (
    glass: ReturnType<typeof createGlass>,
    frame: PoseFrame | undefined,
    seconds: number,
    free = true,
  ) => {
    let view = glass.update(0, free);
    for (let t = 0; t < seconds; t += 1 / 30) {
      glass.see(frame);
      view = glass.update(1 / 30, free);
    }
    return view;
  };

  it("is not watching anyone until a kid is seen", () => {
    const view = run(createGlass(), undefined, 1);
    expect(view.watching).toBe(false);
    expect(view.gaze).toBe(0);
    expect(view.near).toBe(0);
  });

  it("follows a kid standing to one side", () => {
    const view = run(createGlass(), person(0.8, FAR), 2);
    expect(view.watching).toBe(true);
    expect(view.gaze).toBeCloseTo(-0.6, 1);
    expect(view.near).toBe(0);
  });

  it("comes up to the glass when the kid comes close and returns when they step back", () => {
    const glass = createGlass();
    const arriving = run(glass, person(0.5, NEAR), APPROACH_SECONDS / 2 + 0.5);
    expect(arriving.near).toBeGreaterThan(0);
    expect(arriving.walking).toBe(true);
    expect(run(glass, person(0.5, NEAR), APPROACH_SECONDS + 1).near).toBe(1);
    expect(run(glass, person(0.5, 0.4), 3).near).toBe(1);
    const gone = run(glass, person(0.5, FAR), APPROACH_SECONDS + 2);
    expect(gone.near).toBe(0);
    expect(gone.walking).toBe(false);
  });

  it("taps the glass now and then once there", () => {
    const glass = createGlass();
    run(glass, person(0.5, NEAR), APPROACH_SECONDS + 1);
    let tapped = false;
    for (let t = 0; t < 2 * TAP_EVERY; t += 1 / 30) {
      glass.see(person(0.5, NEAR));
      if (glass.update(1 / 30, true).tap.bob > 0.5) tapped = true;
    }
    expect(tapped).toBe(true);
  });

  it("stays on the bank and keeps his eyes to himself while busy with something else", () => {
    const view = run(createGlass(), person(0.1, NEAR), APPROACH_SECONDS + 2, false);
    expect(view.near).toBe(0);
    expect(view.gaze).toBe(0);
  });

  it("stops watching once the kid has been gone a while, and wanders back", () => {
    const glass = createGlass();
    run(glass, person(0.2, NEAR), APPROACH_SECONDS + 2);
    expect(run(glass, undefined, LOST_SECONDS / 2).watching).toBe(true);
    const view = run(glass, undefined, APPROACH_SECONDS + LOST_SECONDS + 2);
    expect(view.watching).toBe(false);
    expect(view.near).toBe(0);
    expect(Math.abs(view.gaze)).toBeLessThan(0.05);
  });
});
