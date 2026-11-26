import { describe, expect, it } from "vitest";

import idle from "../../../core/fixtures/idle-adult.json";
import { checkPlugin } from "../../../kernel/harness";
import { backToBack, clip, play } from "../../../scenarios/scenario";
import { SKILLS } from "../../skill";
import { LIVE_BITS, banditBrain } from "./live";

const durations = Object.fromEntries(
  SKILLS.map(({ manifest }) => [manifest.id, manifest.duration_s]),
);
const SESSION_MS = 70_000;

describe("the live bandit", () => {
  it("plays only installed skills", () => {
    const installed = new Set(Object.keys(durations));
    expect(LIVE_BITS.flatMap((bit) => bit.skills).filter((id) => !installed.has(id))).toEqual([]);
  });

  it("passes the plugin harness on the game's skills", () => {
    expect(checkPlugin(banditBrain, { skills: durations })).toEqual([]);
  });

  it("takes turns with copy-me while a kid stands in view", () => {
    const pose = backToBack(...Array.from({ length: 20 }, () => clip(idle))).filter(
      (frame) => frame.t < SESSION_MS,
    );
    const smile = pose.map(({ t }) => ({ t, level: 0.02, delta: 0 }));
    const events = play({ recording: { pose, hands: [], smile, voice: [] }, seed: 1 });
    const started = events
      .filter((e) => e.type === "intent.started")
      .map((e) => String(e.data.brain))
      .filter((brain) => brain !== "reflexes");
    expect(started.slice(0, 4)).toEqual(["copy_me", "bandit", "copy_me", "bandit"]);
  });
});
