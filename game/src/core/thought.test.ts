import { describe, expect, it } from "vitest";

import { ASK_MS, COPY_STEPS } from "./copyMe";
import { BODY_GESTURES } from "./gestures";
import { SCENE_WIDTH } from "./pond";
import { FADE_SECONDS, SPEECH_WIDTH } from "./speech";
import {
  bubbleCentres,
  gestureThought,
  THOUGHT_ICONS,
  THOUGHT_SECONDS,
  THOUGHT_WIDTH,
  thoughtAfter,
  thoughtAt,
} from "./thought";

const thought = { icon: "jump", startedAt: 1000, seconds: THOUGHT_SECONDS } as const;

describe("THOUGHT_ICONS", () => {
  it("has a picture for every gesture", () => {
    for (const gesture of BODY_GESTURES) {
      expect(THOUGHT_ICONS[gestureThought(gesture, 0).icon].length).toBeGreaterThan(0);
    }
  });

  it("draws every icon inside its unit box", () => {
    for (const shapes of Object.values(THOUGHT_ICONS)) {
      for (const shape of shapes) {
        const coords =
          shape.kind === "circle"
            ? [shape.x - shape.r, shape.x + shape.r, shape.y - shape.r, shape.y + shape.r]
            : shape.points;
        for (const c of coords) expect(Math.abs(c)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("gestureThought", () => {
  it("pictures the gesture Puddles just saw, from now", () => {
    expect(gestureThought("flap", 500)).toEqual({
      icon: "flap",
      startedAt: 500,
      seconds: THOUGHT_SECONDS,
    });
    expect(gestureThought("crouch", 0).icon).toBe("crouch");
  });

  it("gives each gesture its own picture", () => {
    const icons = BODY_GESTURES.map((gesture) => gestureThought(gesture, 0).icon);
    expect(new Set(icons).size).toBe(BODY_GESTURES.length);
  });
});

describe("thoughtAt", () => {
  it("shows nothing without a thought", () => {
    expect(thoughtAt(undefined, 0)).toBeUndefined();
  });

  it("shows the icon fully while Puddles thinks", () => {
    expect(thoughtAt(thought, 1000)).toEqual({ icon: "jump", alpha: 1 });
    expect(thoughtAt(thought, 1000 + THOUGHT_SECONDS * 1000 - 1)?.alpha).toBe(1);
  });

  it("fades the icon out after the thinking time", () => {
    const half = 1000 + (THOUGHT_SECONDS + FADE_SECONDS / 2) * 1000;
    expect(thoughtAt(thought, half)?.alpha).toBeCloseTo(0.5);
  });

  it("is gone once the fade ends", () => {
    expect(thoughtAt(thought, 1000 + (THOUGHT_SECONDS + FADE_SECONDS) * 1000)).toBeUndefined();
  });
});

describe("thoughtAfter", () => {
  const ask = { kind: "ask", gesture: "wave", step: COPY_STEPS.ask.wave } as const;

  it("holds the asked-for gesture for the whole wait", () => {
    const asking = thoughtAfter(undefined, ask, 1000);
    expect(thoughtAt(asking, 1000 + ASK_MS - 1)).toEqual({ icon: "wave", alpha: 1 });
  });

  it("keeps the request in mind through a wrong guess", () => {
    const asking = thoughtAfter(undefined, ask, 1000);
    expect(thoughtAfter(asking, { kind: "no", step: COPY_STEPS.no }, 2000)).toBe(asking);
  });

  it("pops the bubble when the kid copies or the wait runs out", () => {
    const asking = thoughtAfter(undefined, ask, 1000);
    expect(thoughtAfter(asking, { kind: "yes", step: COPY_STEPS.yes }, 2000)).toBeUndefined();
    expect(
      thoughtAfter(asking, { kind: "timeout", step: COPY_STEPS.timeout }, 2000),
    ).toBeUndefined();
  });

  it("pictures a mirrored gesture briefly", () => {
    const mirror = { kind: "mirror", gesture: "flap", step: COPY_STEPS.yes } as const;
    expect(thoughtAfter(undefined, mirror, 500)).toEqual(gestureThought("flap", 500));
  });
});

describe("bubbleCentres", () => {
  const apart = (x: number) => {
    const { speech, thought } = bubbleCentres(x);
    return Math.abs(speech - thought) >= (SPEECH_WIDTH + THOUGHT_WIDTH) / 2;
  };
  const inScene = (centre: number, width: number) =>
    centre - width / 2 >= 0 && centre + width / 2 <= SCENE_WIDTH;

  it("centres the speech bubble over Puddles", () => {
    expect(bubbleCentres(800).speech).toBe(800);
  });

  it("keeps the speech bubble in the scene at the edges", () => {
    expect(bubbleCentres(0).speech).toBe(SPEECH_WIDTH / 2);
    expect(bubbleCentres(SCENE_WIDTH).speech).toBe(SCENE_WIDTH - SPEECH_WIDTH / 2);
  });

  it("puts the thought beside the speech bubble, never on it", () => {
    for (let x = 0; x <= SCENE_WIDTH; x += 10) {
      expect(apart(x)).toBe(true);
      expect(inScene(bubbleCentres(x).thought, THOUGHT_WIDTH)).toBe(true);
    }
  });

  it("thinks to the right unless that runs off the scene", () => {
    const middle = bubbleCentres(800);
    expect(middle.thought).toBeGreaterThan(middle.speech);
    const edge = bubbleCentres(SCENE_WIDTH);
    expect(edge.thought).toBeLessThan(edge.speech);
  });
});
