import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../../../core/contracts";
import { seededRandom } from "../../../core/random";
import { SKILLS } from "../index";

const gesture = (t: number, name: string): KernelEvent => ({
  t,
  type: "observation.gesture",
  source: "gestures",
  data: { gesture: name },
});

function start(args: Record<string, string | number>) {
  const skill = SKILLS.find(({ manifest }) => manifest.id === "copy_gesture");
  if (!skill) throw new Error("copy_gesture is not installed");
  return skill.code.start(args, { t: 1000, events: [], random: seededRandom(1) });
}

describe("copy_gesture skill", () => {
  it("ends with the first gesture the kid makes", () => {
    const waiting = start({ gesture: "jump", until: 9000 });
    expect(waiting.tick(1033, [])).toBe("running");
    const other = { t: 1066, type: "observation.kid", source: "pose", data: { present: true } };
    expect(waiting.tick(1066, [other, gesture(1066, "wave")])).toEqual({
      status: "done",
      effects: { gesture: "wave" },
    });
  });

  it("ignores gestures it doesn't know", () => {
    const waiting = start({ gesture: "jump", until: 9000 });
    expect(waiting.tick(1033, [gesture(1033, "cartwheel")])).toBe("running");
  });

  it("ends with no gesture once the wait is over", () => {
    const waiting = start({ gesture: "jump", until: 9000 });
    expect(waiting.tick(8999, [])).toBe("running");
    expect(waiting.tick(9000, [])).toEqual({ status: "done" });
  });

  it("waits for its manifest's duration when not told until when", () => {
    const waiting = start({});
    expect(waiting.tick(8999, [])).toBe("running");
    expect(waiting.tick(9000, [])).toEqual({ status: "done" });
  });
});
