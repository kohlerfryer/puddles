import { describe, expect, it } from "vitest";

import type { Intent } from "../core/contracts";
import { createKernel } from "./kernel";
import type { PluginContext, PluginFolder } from "./plugins";
import { parseLog, replay } from "./replay";
import { fakeBrain, fakeSense, fakeSkill, routine } from "./testing";

type Decide = (ctx: PluginContext) => Intent | null;

/** Hands see an object every 10 ticks and pose every 7; a matcher answers objects at random. */
function hands(): PluginFolder {
  let ticks = 0;
  return fakeSense("hands", () =>
    ++ticks % 10 === 0 ? [{ type: "observation.held", data: { n: ticks } }] : [],
  );
}

function pose(): PluginFolder {
  let ticks = 0;
  return fakeSense("pose", () =>
    ++ticks % 7 === 0 ? [{ type: "observation.pose", data: { n: ticks } }] : [],
  );
}

const matcher: Decide = ({ random }) =>
  routine("matcher", 2, random() < 0.5 ? "peck" : "walk", "peck");

const bandit: Decide = () => routine("bandit", 1, "walk", "walk", "walk");

function brains(decideMatcher = matcher, decideBandit = bandit): PluginFolder[] {
  return [
    fakeBrain("matcher", { on: "observation.held" }, decideMatcher),
    fakeBrain("bandit", { every_s: 1 }, decideBandit),
    fakeSkill("walk", 4),
    fakeSkill("peck", 2),
  ];
}

/** Records a 10 s session to JSON lines, as the kernel writes it to the save. */
function record(seed = 7): string {
  const lines: string[] = [];
  const kernel = createKernel({
    plugins: [hands(), pose(), ...brains()],
    seed,
    now: () => 0,
    sink: (line) => lines.push(line),
  });
  for (let i = 0; i < 300; i++) kernel.tick();
  return lines.join("\n") + "\n";
}

const noSense = fakeSense("hands", () => {
  throw new Error("recorded senses are played back, not re-run");
});

describe("parseLog", () => {
  it("reads back the lines the kernel recorded", () => {
    const events = parseLog(record());
    expect(events.length).toBeGreaterThan(0);
    expect(events.find((e) => e.source === "pose")).toEqual({
      t: 233,
      type: "observation.pose",
      source: "pose",
      data: { n: 7 },
    });
  });

  it("names the line that isn't a valid event", () => {
    const text = `${record().split("\n")[0] ?? ""}\n{"t":1}\n`;
    expect(() => parseLog(text)).toThrow(/line 2/);
  });

  it("names the line that isn't JSON", () => {
    expect(() => parseLog("nope")).toThrow(/line 1/);
  });
});

describe("replay", () => {
  it("makes the same decisions with the same plugins and seed", () => {
    const recorded = parseLog(record());
    const result = replay(recorded, { plugins: [noSense, ...brains()], seed: 7 });
    expect(result.diffs).toEqual([]);
    expect(result.events).toEqual(recorded);
  });

  it("plays observations back with their source, time and order", () => {
    const recorded = parseLog(record());
    const { events } = replay(recorded, { plugins: [], seed: 7 });
    expect(events).toEqual(recorded.filter((e) => e.type.startsWith("observation.")));
  });

  it("reports where a changed brain decides differently", () => {
    const recorded = parseLog(record());
    const bolder: Decide = (ctx) => ({ ...bandit(ctx), priority: 3 }) as Intent;
    const { diffs } = replay(recorded, { plugins: brains(matcher, bolder), seed: 7 });
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((d) => d.brain === "bandit")).toBe(true);
    expect(diffs[0]).toEqual({
      t: 33,
      brain: "bandit",
      recorded: routine("bandit", 1, "walk", "walk", "walk"),
      replayed: routine("bandit", 3, "walk", "walk", "walk"),
    });
  });

  it("reports decisions only one side made", () => {
    const recorded = parseLog(record());
    const quiet = replay(recorded, { plugins: brains(matcher, () => null), seed: 7 });
    expect(quiet.diffs[0]).toEqual({
      t: 33,
      brain: "bandit",
      recorded: routine("bandit", 1, "walk", "walk", "walk"),
      replayed: null,
    });
    const { diffs } = replay(quiet.events, { plugins: brains(), seed: 7 });
    expect(diffs[0]).toEqual({
      t: 33,
      brain: "bandit",
      recorded: null,
      replayed: routine("bandit", 1, "walk", "walk", "walk"),
    });
  });

  it("shows a random brain's diffs under another seed", () => {
    const recorded = parseLog(record());
    const { diffs } = replay(recorded, { plugins: brains(), seed: 8 });
    expect(diffs.some((d) => d.brain === "matcher")).toBe(true);
  });

  it("ignores the order of keys inside an intent", () => {
    const recorded = parseLog(record());
    const reordered: Decide = (ctx) => {
      const { why, steps, kind, priority, brain } = bandit(ctx) as Required<Intent>;
      return { why, steps, kind, priority, brain };
    };
    const { diffs } = replay(recorded, { plugins: brains(matcher, reordered), seed: 7 });
    expect(diffs).toEqual([]);
  });

  it("replays an empty log to nothing", () => {
    expect(replay([], { plugins: brains() })).toEqual({ events: [], diffs: [] });
  });
});
