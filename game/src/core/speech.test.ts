import { describe, expect, it } from "vitest";

import { bubbleAt, FADE_SECONDS, MIN_LINE_SECONDS } from "./speech";

const line = (seconds: number) => ({ text: "Boing!", startedAt: 1000, seconds });

describe("bubbleAt", () => {
  it("shows nothing without a line", () => {
    expect(bubbleAt(undefined, 0)).toBeUndefined();
  });

  it("shows the line fully as soon as it starts", () => {
    expect(bubbleAt(line(1), 1000)).toEqual({ text: "Boing!", alpha: 1 });
  });

  it("keeps a short step's line up for the minimum time", () => {
    expect(MIN_LINE_SECONDS).toBe(2);
    expect(bubbleAt(line(1), 1000 + 1999)?.alpha).toBe(1);
  });

  it("keeps a long step's line up for the whole step", () => {
    expect(bubbleAt(line(3), 1000 + 2999)?.alpha).toBe(1);
  });

  it("fades the line out once it has been up long enough", () => {
    const half = 1000 + (2 + FADE_SECONDS / 2) * 1000;
    expect(bubbleAt(line(1), half)?.alpha).toBeCloseTo(0.5);
  });

  it("is gone once the fade ends", () => {
    expect(bubbleAt(line(1), 1000 + (2 + FADE_SECONDS) * 1000)).toBeUndefined();
  });
});
