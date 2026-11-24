import { describe, expect, it } from "vitest";

import type { Intent, Step } from "../core/contracts";
import { checkPlugin } from "./harness";
import type { PluginFolder } from "./plugins";
import { fakeBrain, fakeSense, fakeSkill, routine } from "./testing";

const pond: PluginFolder = {
  manifest: {
    kind: "content",
    type: "scene",
    id: "pond",
    contract: "1",
    name: "Pond",
    authors: ["P"],
    license: "MIT",
  },
};

/** A wall clock that advances `ms` every time a plugin is timed. */
const ticking = (ms: number) => {
  let clock = 0;
  return () => (clock += ms);
};

const zero = () => 0;
/** The skills the test brains' routines use. */
const skills = { peck: 1 };

describe("checkPlugin on good plugins", () => {
  it("passes a plugin of each kind", () => {
    expect(checkPlugin(() => fakeSense("pose", () => []), { now: zero })).toEqual([]);
    expect(
      checkPlugin(() => fakeBrain("bandit", { every_s: 1 }, () => routine("bandit", 1, "peck")), {
        skills,
        now: zero,
      }),
    ).toEqual([]);
    expect(checkPlugin(() => fakeSkill("peck", 3), { now: zero })).toEqual([]);
    expect(checkPlugin(() => pond)).toEqual([]);
  });

  it("passes a sense whose events are more specific than the ones it declares", () => {
    const sense = () => fakeSense("pose", () => [{ type: "observation.fake.left", data: {} }]);
    expect(checkPlugin(sense, { now: zero })).toEqual([]);
  });

  it("feeds inputs to a brain that waits for an event, and passes skill args", () => {
    const seen: Intent[] = [];
    const matcher = () =>
      fakeBrain("matcher", { on: "observation.held" }, () => {
        const intent = routine("matcher", 1, "peck");
        seen.push(intent);
        return intent;
      });
    const inputs = (t: number) => (t === 1000 ? [{ type: "observation.held", data: {} }] : []);
    expect(checkPlugin(matcher, { inputs, skills, now: zero })).toEqual([]);
    expect(seen).toHaveLength(2);

    const args: Step["args"][] = [];
    const wear = (): PluginFolder => {
      const { manifest, code } = fakeSkill("wear", 2);
      const start = code?.start;
      if (!start) throw new Error("fakeSkill has start()");
      return { manifest, code: { start: (a, ctx) => (args.push(a), start(a, ctx)) } };
    };
    expect(checkPlugin(wear, { args: { target: "hat" }, now: zero })).toEqual([]);
    expect(args[0]).toEqual({ target: "hat" });
  });
});

describe("checkPlugin on schema", () => {
  it("reports a broken manifest and checks nothing else", () => {
    expect(checkPlugin(() => ({ manifest: { id: "broken", kind: "skill" } }))).toEqual([
      expect.stringMatching(/^manifest: invalid manifest/),
    ]);
    expect(checkPlugin(() => ({ manifest: fakeSkill("peck", 1).manifest }))).toEqual([
      "manifest: skill plugin has no start()",
    ]);
  });

  it("reports sense events it did not declare, and a crash on ones that break the contract", () => {
    const sense = () =>
      fakeSense("pose", ({ t }) =>
        t === 33
          ? [
              { type: "observation.smile", data: {} },
              { type: "Observation.Fake", data: {} },
            ]
          : [],
      );
    expect(checkPlugin(sense, { now: zero })).toEqual([
      expect.stringMatching(/^crash: threw at t=33: Error: invalid event/),
      "schema: emitted observation.smile, which the manifest does not declare",
    ]);
  });

  it("reports intents that break the contract, the manifest or the brain's name", () => {
    const loop: Intent = { ...routine("bandit", 1, "peck"), kind: "goal" };
    const spoof = routine("reflexes", 1, "peck");
    const bad = { brain: "bandit", priority: 1, kind: "routine", why: "" } as unknown as Intent;
    const brain = (intent: Intent) => () => fakeBrain("bandit", { every_s: 60 }, () => intent);
    expect(checkPlugin(brain(loop), { skills, now: zero })).toEqual([
      "schema: proposed a goal intent, which the manifest does not declare",
    ]);
    expect(checkPlugin(brain(spoof), { skills, now: zero })).toEqual([
      "schema: proposed an intent as reflexes",
    ]);
    expect(checkPlugin(brain(bad), { skills, now: zero })).toEqual([
      expect.stringMatching(/^schema: proposed an intent that breaks the intent contract/),
    ]);
  });
});

describe("checkPlugin on budgets", () => {
  it("reports a sense or brain that often runs over its time budget", () => {
    expect(checkPlugin(() => fakeSense("pose", () => []), { now: ticking(3) })).toEqual([
      "budget: over 2 ms on 300 of 300 ticks",
    ]);
    const brain = () => fakeBrain("reflexes", "tick", () => null);
    expect(checkPlugin(brain, { now: ticking(6) })).toEqual([
      "budget: over 5 ms on 300 of 300 ticks",
    ]);
  });

  it("forgives the odd slow tick", () => {
    let calls = 0;
    const now = () => (++calls % 100 === 0 ? 3 * calls : 0);
    expect(checkPlugin(() => fakeSense("pose", () => []), { now })).toEqual([]);
  });

  it("reports a skill that runs past its duration or never finishes", () => {
    const slow = () => {
      const folder = fakeSkill("walk", 10);
      return { ...folder, manifest: { ...(folder.manifest as object), duration_s: 0.1 } };
    };
    expect(checkPlugin(slow, { now: zero })).toEqual([
      "budget: ran 300 ms, over its 0.1 s duration",
    ]);
    expect(checkPlugin(() => fakeSkill("nap", 400), { now: zero })).toEqual([
      "budget: never finished in 10 s",
    ]);
  });
});

describe("checkPlugin on the guardian", () => {
  const brain = (decide: () => Intent) => () => fakeBrain("bandit", { every_s: 1 }, decide);

  it("passes a brain whose intents use the skills it expects and pass the content rules", () => {
    const peck = brain(() => routine("bandit", 1, "peck"));
    expect(checkPlugin(peck, { skills, now: zero })).toEqual([]);
  });

  it("reports intents with skills the brain doesn't expect", () => {
    const dance = brain(() => routine("bandit", 1, "dance"));
    expect(checkPlugin(dance, { skills, now: zero })).toEqual([
      "guardian: rejected 10 of 10 intents (unknown_skill), first: no skill dance",
    ]);
  });

  it("reports intents the content rules reject, counted against all the brain proposed", () => {
    const long = () => {
      let calls = 0;
      return brain(() =>
        ++calls % 2 === 0 ? routine("bandit", 1, "nap", "nap") : routine("bandit", 1, "peck"),
      )();
    };
    expect(checkPlugin(long, { skills: { peck: 1, nap: 15 }, now: zero })).toEqual([
      "guardian: rejected 5 of 10 intents (routine_duration), first: routine lasts 30 s",
    ]);
  });
});

describe("checkPlugin on cadence", () => {
  it("reports a brain whose cadence never fires", () => {
    const matcher = () =>
      fakeBrain("matcher", { on: "observation.held" }, () => routine("matcher", 1, "peck"));
    expect(checkPlugin(matcher, { now: zero })).toEqual(["cadence: never decided in 10 s"]);
  });
});

describe("checkPlugin on determinism", () => {
  it("reports a plugin that ignores the kernel's seeded random", () => {
    const brain = () =>
      fakeBrain("bandit", "tick", () =>
        Math.random() < 0.5 ? routine("bandit", 1, "peck") : null,
      );
    expect(checkPlugin(brain, { skills, now: zero })).toEqual([
      expect.stringMatching(/^determinism: the same seed and inputs gave a different event at t=/),
    ]);
  });

  it("reports a plugin that keeps state between sessions", () => {
    let ticks = 0;
    const sense = () =>
      fakeSense("pose", () => (++ticks === 1 ? [{ type: "observation.fake", data: {} }] : []));
    expect(checkPlugin(sense, { now: zero })).toEqual([
      "determinism: the same seed and inputs gave a different event at t=33",
    ]);
  });

  it("passes a plugin that uses the kernel's seeded random", () => {
    const brain = () =>
      fakeBrain("bandit", "tick", ({ random }) =>
        random() < 0.1 ? routine("bandit", 1, "peck") : null,
      );
    expect(checkPlugin(brain, { skills, now: zero })).toEqual([]);
  });
});
