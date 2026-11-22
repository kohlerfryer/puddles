import { describe, expect, it } from "vitest";

import { fixtureFileName, GESTURES, isPoseFixture } from "./poseFixture";

const files = import.meta.glob<unknown>("./fixtures/*.json", { eager: true, import: "default" });

describe("recorded gesture fixtures", () => {
  it("has a full-body adult recording of every gesture", () => {
    for (const gesture of GESTURES) {
      expect(files[`./fixtures/${fixtureFileName(gesture, "adult")}`]).toBeDefined();
    }
  });

  it.each(Object.entries(files))("%s is a valid fixture named after its gesture", (path, data) => {
    expect(isPoseFixture(data)).toBe(true);
    if (!isPoseFixture(data)) return;
    expect(path).toBe(`./fixtures/${fixtureFileName(data.gesture, data.who)}`);
    expect(data.frames.length).toBeGreaterThan(100);
  });
});
