import { describe, expect, it } from "vitest";

import type { Event } from "../../../core/contracts";
import { checkPlugin } from "../../../kernel/harness";
import { type Kernel, createKernel } from "../../../kernel/kernel";
import type { Emitted, PluginFolder } from "../../../kernel/plugins";
import { fakeBrain, fakeSense, fakeSkill, routine } from "../../../kernel/testing";
import { WINDOW_MS } from "./attribution";
import { betaModel } from "./beta";
import { type Bandit, bandit } from "./index";
import { linearModel } from "./linear";
import type { Arm, Model } from "./model";

const arms: Arm[] = [
  { id: "pratfall", features: ["slapstick"], skills: ["walk_to", "fall_over"] },
  { id: "song", features: ["musical"], skills: ["quack"] },
  { id: "nap", features: ["sleepy"], skills: ["nap"] },
];
const SKILL_TICKS = 15;
const skills = () => ["walk_to", "fall_over", "quack", "nap"].map((id) => fakeSkill(id, 15));

/** A kid who smiles big after every punchline of `loved`, and barely at anything else. */
function kid(loved: string, log: () => Kernel["log"]): PluginFolder {
  let read = 0;
  let playing = "";
  return fakeSense("kid", () => {
    const events = log().since(read);
    read = log().count;
    return events.flatMap(({ type, data }): Emitted[] => {
      if (type === "intent.proposed") playing = String(data.why);
      if (type !== "intent.done") return [];
      const level = playing.startsWith(`bit ${loved},`) ? 0.9 : 0.05;
      return [{ type: "observation.smile", data: { level, delta: level } }];
    });
  });
}

function run(brain: Bandit, extra: (log: () => Kernel["log"]) => PluginFolder[], seconds = 60) {
  const kernel: Kernel = createKernel({
    plugins: [brain.plugin, ...skills(), ...extra(() => kernel.log)],
    seed: 4,
    now: () => 0,
  });
  for (let i = 0; i < seconds * 30; i++) kernel.tick();
  return kernel.log.events();
}

const proposals = (events: readonly Event[]) =>
  events.filter((e) => e.type === "intent.proposed" && e.source === "bandit");

describe("bandit", () => {
  it.each([
    ["beta", betaModel],
    ["linear", linearModel],
  ])("passes the plugin harness with the %s model", (_name, model) => {
    const durations = Object.fromEntries(
      ["walk_to", "fall_over", "quack", "nap"].map((id) => [id, SKILL_TICKS / 30]),
    );
    expect(checkPlugin(() => bandit({ arms, model }).plugin, { skills: durations })).toEqual([]);
  });

  it("plays each arm as a routine with its comedy features", () => {
    const [first] = proposals(run(bandit({ arms, model: betaModel }), () => [], 2));
    const arm = arms.find((a) => String(first?.data.why).startsWith(`bit ${a.id},`));
    expect(first?.data).toMatchObject({
      brain: "bandit",
      kind: "routine",
      steps: arm?.skills.map((skill) => ({ skill, args: {} })),
      features: arm?.features,
    });
  });

  it("logs every choice with its propensity, and the reward once the window closes", () => {
    const brain = bandit({ arms, model: betaModel });
    const events = run(brain, (log) => [kid("song", log)]);
    const why = proposals(events).map((e) => String(e.data.why));
    expect(brain.choices.map((c) => `bit ${c.arm}, propensity ${c.propensity.toFixed(2)}`)).toEqual(
      why,
    );
    for (const choice of brain.choices.slice(0, -1)) {
      expect(choice.propensity).toBeGreaterThan(0);
      expect(choice.propensity).toBeLessThanOrEqual(1);
      expect(choice.reward?.bit).toBe(choice.arm);
    }
  });

  it("waits for the attribution window to close before the next bit", () => {
    const events = proposals(run(bandit({ arms, model: betaModel }), () => [], 20));
    const gaps = events.slice(1).map((e, i) => e.t - (events[i]?.t ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(WINDOW_MS);
  });

  it.each([
    ["beta", betaModel],
    ["linear", linearModel],
  ])("learns to play what the kid loves with the %s model", (_name, model) => {
    const brain = bandit({ arms, model });
    run(brain, (log) => [kid("song", log)], 120);
    const late = brain.choices.slice(-8);
    expect(late.filter((c) => c.arm === "song").length).toBeGreaterThanOrEqual(6);
  });

  it("learns per object archetype", () => {
    const brain = bandit({ arms, model: betaModel });
    const ball = () => [{ type: "observation.held_object", data: { archetype: "ball" } }];
    run(brain, (log) => [kid("song", log), fakeSense("held", ball)], 30);
    expect(brain.choices.every((c) => c.archetype === "ball")).toBe(true);
    const none = bandit({ arms, model: betaModel });
    run(none, () => [], 10);
    expect(none.choices.every((c) => c.archetype === "none")).toBe(true);
  });

  it("gives up a preempted bit without a reward and waits while another brain plays", () => {
    const brain = bandit({ arms, model: betaModel });
    const naps = Array.from({ length: 8 }, () => "nap");
    const busy = fakeBrain("reflexes", { every_s: 100 }, () => routine("reflexes", 5, ...naps));
    const events = run(brain, () => [busy], 3);
    expect(events.some((e) => e.type === "intent.preempted" && e.data.brain === "bandit")).toBe(
      true,
    );
    expect(brain.choices).toHaveLength(1);
    expect(brain.choices[0]?.reward).toBeNull();
  });

  it("takes back the turn once the other brain's intent ends", () => {
    const brain = bandit({ arms, model: betaModel });
    const busy = fakeBrain("reflexes", { every_s: 100 }, () => routine("reflexes", 5, "nap"));
    run(brain, () => [busy], 2);
    expect(brain.choices).toHaveLength(2);
  });

  it("carries what it learned into the household's next session", () => {
    const household = new Map<string, Model>();
    run(bandit({ arms, model: betaModel, household }), (log) => [kid("song", log)], 120);
    expect([...household.keys()]).toEqual(["none"]);
    const next = bandit({ arms, model: betaModel, household });
    run(next, (log) => [kid("song", log)], 30);
    expect(next.choices.filter((c) => c.arm === "song").length).toBeGreaterThanOrEqual(5);
  });

  it("refuses an arm with no skills", () => {
    expect(() =>
      bandit({ arms: [{ id: "x", features: [], skills: [] }], model: betaModel }),
    ).toThrow(/no skills/);
  });
});
