import { describe, expect, it } from "vitest";

import { SKILLS } from "../../plugins/skill";
import { liveGuardian } from "./live";

const look = {
  brain: "object_matcher",
  priority: 3,
  kind: "routine",
  steps: [{ skill: "look_at", args: { target: "object" }, mood: "curious" }],
  why: "test",
} as const;

describe("the live game's guardian", () => {
  it("passes intents that use the installed skills", () => {
    const { intent, event } = liveGuardian(SKILLS, 20).check("object_matcher", look, 0);
    expect(intent).toEqual(look);
    expect(event.type).toBe("guardian.passed");
  });

  it("rejects a skill that is not installed", () => {
    const teleport = { ...look, steps: [{ skill: "teleport", args: {} }] };
    const { event } = liveGuardian(SKILLS, 20).check("object_matcher", teleport, 0);
    expect(event.data).toMatchObject({ rule: "unknown_skill" });
  });

  it("suggests a break after the parents' session limit", () => {
    const guardian = liveGuardian(SKILLS, 5);
    expect(guardian.check("object_matcher", look, 5 * 60_000 - 1).event.type).toBe(
      "guardian.passed",
    );
    expect(guardian.check("object_matcher", look, 5 * 60_000).event.type).toBe("guardian.break");
  });

  it("needs the skills its own fallback and break intents use", () => {
    expect(() => liveGuardian([], 20)).toThrow("guardian needs skills");
  });
});
