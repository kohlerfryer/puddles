import { describe, expect, it } from "vitest";

import { type PuppetCue, puppetPose } from "./puppet";
import type { Mood } from "./reaction";

const STANDING: PuppetCue = {
  look: "stand",
  mood: "curious",
  height: 0,
  wing: 0,
  walking: false,
  shake: 0,
};
/** A moment between blinks. */
const AWAKE = 1;
const clocks = Array.from({ length: 401 }, (_, index) => index / 40);

describe("puppetPose squash and stretch", () => {
  it("keeps the body's volume however it squashes", () => {
    for (const cue of [
      STANDING,
      { ...STANDING, height: 40 },
      { ...STANDING, mood: "scared" as Mood },
    ]) {
      for (const clock of clocks) {
        const { squash } = puppetPose(cue, clock);
        expect(squash.x * squash.y).toBeCloseTo(1);
      }
    }
  });

  it("stretches tall in the air, more the higher Puddles hops", () => {
    const low = puppetPose({ ...STANDING, height: 10 }, AWAKE).squash.y;
    const high = puppetPose({ ...STANDING, height: 60 }, AWAKE).squash.y;
    expect(low).toBeGreaterThan(1.02);
    expect(high).toBeGreaterThan(low);
    expect(puppetPose({ ...STANDING, height: 600 }, AWAKE).squash.y).toBeLessThan(1.3);
  });

  it("breathes gently while standing", () => {
    const heights = clocks.map((clock) => puppetPose(STANDING, clock).squash.y);
    expect(Math.max(...heights)).toBeGreaterThan(1);
    expect(Math.min(...heights)).toBeLessThan(1);
    for (const y of heights) expect(Math.abs(y - 1)).toBeLessThan(0.05);
  });

  it("crouches when scared and puffs up when proud", () => {
    const at = (mood: Mood) => puppetPose({ ...STANDING, mood }, 0).squash.y;
    expect(at("scared")).toBeLessThan(at("curious"));
    expect(at("proud")).toBeGreaterThan(at("curious"));
  });

  it("squashes flat after falling over", () => {
    expect(puppetPose({ ...STANDING, look: "fallen" }, 0).squash.y).toBeLessThan(0.9);
  });
});

describe("puppetPose blink", () => {
  it("blinks briefly every few seconds", () => {
    const shut = clocks.filter((clock) => puppetPose(STANDING, clock).eyes === "shut");
    expect(shut.length).toBeGreaterThan(0);
    expect(shut.length / clocks.length).toBeLessThan(0.1);
  });

  it("keeps the eyes open between blinks", () => {
    expect(puppetPose(STANDING, AWAKE).eyes).toBe("open");
  });

  it("does not blink eyes that are already squeezed or smiling", () => {
    const blinkAt = clocks.find((clock) => puppetPose(STANDING, clock).eyes === "shut") ?? 0;
    expect(puppetPose({ ...STANDING, mood: "grossed_out" }, blinkAt).eyes).toBe("squeeze");
    expect(puppetPose({ ...STANDING, mood: "happy" }, blinkAt).eyes).toBe("smile");
  });

  it("shuts the eyes for a nap", () => {
    for (const clock of clocks)
      expect(puppetPose({ ...STANDING, look: "nap" }, clock).eyes).toBe("shut");
  });
});

describe("puppetPose eyes and bill by mood", () => {
  const face = (mood: Mood) => puppetPose({ ...STANDING, mood }, AWAKE);

  it("draws each mood with its own eyes", () => {
    expect(face("happy").eyes).toBe("smile");
    expect(face("curious").eyes).toBe("open");
    expect(face("scared").eyes).toBe("wide");
    expect(face("silly").eyes).toBe("crossed");
    expect(face("proud").eyes).toBe("proud");
    expect(face("grossed_out").eyes).toBe("squeeze");
  });

  it("keeps the sparkly open eyes while idling contentedly", () => {
    expect(puppetPose({ ...STANDING, look: "wander", mood: "happy" }, AWAKE).eyes).toBe("open");
    expect(puppetPose({ ...STANDING, look: "preen", mood: "happy" }, AWAKE).eyes).toBe("open");
  });

  it("opens the bill wide when scared, silly or grossed out and keeps it shut when curious", () => {
    for (const mood of ["scared", "silly", "grossed_out"] as const) expect(face(mood).bill).toBe(1);
    expect(face("curious").bill).toBe(0);
    expect(face("happy").bill).toBeGreaterThan(0);
    expect(face("happy").bill).toBeLessThan(1);
  });

  it("snaps the bill open and shut while pecking", () => {
    const bills = clocks.map((clock) => puppetPose({ ...STANDING, look: "peck" }, clock).bill);
    expect(Math.min(...bills)).toBeLessThan(0.1);
    expect(Math.max(...bills)).toBeGreaterThan(0.6);
  });
});

describe("puppetPose head tilt", () => {
  it("tilts the head when curious, like the concept art", () => {
    expect(puppetPose(STANDING, AWAKE).headTilt).toBeGreaterThan(0.1);
    expect(puppetPose({ ...STANDING, mood: "proud" }, AWAKE).headTilt).toBe(0);
  });

  it("dips the head to peck and sniff, and turns it to the camera", () => {
    expect(puppetPose({ ...STANDING, look: "sniff" }, AWAKE).headTilt).toBeGreaterThan(0.3);
    const pecks = clocks.map((clock) => puppetPose({ ...STANDING, look: "peck" }, clock).headTilt);
    expect(Math.max(...pecks)).toBeGreaterThan(0.6);
    expect(puppetPose({ ...STANDING, look: "look_camera" }, AWAKE).headTilt).toBeLessThan(0);
  });

  it("sways the head while preening", () => {
    const tilts = clocks.map((clock) => puppetPose({ ...STANDING, look: "preen" }, clock).headTilt);
    expect(Math.max(...tilts) - Math.min(...tilts)).toBeGreaterThan(0.5);
  });

  it("adds a head shake on top", () => {
    const still = puppetPose({ ...STANDING, mood: "proud" }, AWAKE).headTilt;
    expect(puppetPose({ ...STANDING, mood: "proud", shake: 0.3 }, AWAKE).headTilt).toBeCloseTo(
      still + 0.3,
    );
  });
});

describe("puppetPose wing and lean", () => {
  it("passes a raised wing through", () => {
    expect(puppetPose({ ...STANDING, wing: 1.4 }, AWAKE).wing).toBe(1.4);
    expect(puppetPose(STANDING, AWAKE).wing).toBe(0);
  });

  it("flaps the wing up and down in the flap pose", () => {
    const wings = clocks.map((clock) => puppetPose({ ...STANDING, look: "flap" }, clock).wing);
    expect(Math.min(...wings)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...wings) - Math.min(...wings)).toBeGreaterThan(0.8);
  });

  it("waddles side to side while walking and stands upright otherwise", () => {
    const leans = clocks.map((clock) => puppetPose({ ...STANDING, walking: true }, clock).lean);
    expect(Math.max(...leans)).toBeGreaterThan(0.03);
    expect(Math.min(...leans)).toBeLessThan(-0.03);
    expect(puppetPose(STANDING, AWAKE).lean).toBe(0);
  });

  it("waddles faster running than walking", () => {
    const changes = (look: PuppetCue["look"]) =>
      clocks
        .map((clock) => Math.sign(puppetPose({ ...STANDING, look }, clock).lean))
        .filter((side, index, sides) => index > 0 && side !== sides[index - 1]).length;
    expect(changes("run")).toBeGreaterThan(changes("walk"));
    expect(changes("wander")).toBeGreaterThan(0);
  });
});
