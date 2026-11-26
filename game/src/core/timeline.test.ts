import { describe, expect, it } from "vitest";

import { createKernel } from "../kernel/kernel";
import { replay } from "../kernel/replay";
import { WINDOW_MS } from "../plugins/brains/bandit/attribution";
import { gameOptions } from "../plugins/game";
import { recordedSenses } from "../plugins/sense/recorded";
import type { KernelEvent } from "./contracts";
import { rowText, timeline } from "./timeline";

const event = (t: number, type: string, source: string, data: KernelEvent["data"]) => ({
  t,
  type,
  source,
  data,
});

/** A bandit bit at 1 s with a calm kid before it and a big smile after its punchline at 2 s. */
const bit: KernelEvent[] = [
  event(900, "observation.smile", "smile", { level: 0.05, delta: 0 }),
  event(1000, "intent.proposed", "bandit", { brain: "bandit", why: "bit pratfall, p 0.40" }),
  event(1000, "guardian.passed", "guardian", { brain: "bandit" }),
  event(1000, "intent.started", "executor", { brain: "bandit", priority: 1, why: "x" }),
  event(2000, "intent.done", "executor", { brain: "bandit" }),
  event(3000, "observation.smile", "smile", { level: 0.75, delta: 0.7 }),
  event(2000 + WINDOW_MS, "observation.kid", "pose", { present: true }),
];

describe("the dev overlay timeline", () => {
  it("follows a bit from what was seen to how the kid took it", () => {
    expect(timeline(bit).map(rowText)).toEqual([
      "1.0s bandit · smile 0.05 0 → bit pratfall, p 0.40 → passed → done → smile +0.70",
    ]);
  });

  it("shows a rejection's reason, an unfinished bit and no reward for other brains", () => {
    const events = [
      event(500, "intent.proposed", "reflexes", { brain: "reflexes", why: "copy wave" }),
      event(500, "guardian.rejected", "guardian", { brain: "reflexes", reason: "too long" }),
      event(500, "intent.started", "executor", { brain: "reflexes", priority: 1, why: "x" }),
      event(800, "intent.done", "executor", { brain: "reflexes" }),
      ...bit.slice(1, 5),
    ];
    expect(timeline(events).map(rowText)).toEqual([
      "0.5s reflexes · – → copy wave → rejected: too long → done",
      "1.0s bandit · – → bit pratfall, p 0.40 → passed → done → waiting",
    ]);
  });

  it("says when no face saw a bit", () => {
    const unseen = bit.filter((e) => e.type !== "observation.smile");
    expect(timeline(unseen).map(rowText)).toEqual([
      "1.0s bandit · – → bit pratfall, p 0.40 → passed → done → no face",
    ]);
  });

  it("names a bit that never played and one that a stronger brain cut short", () => {
    const events = [
      event(0, "intent.proposed", "bandit", { brain: "bandit", why: "a" }),
      event(0, "intent.dropped", "executor", { brain: "bandit", reason: "busy" }),
      event(100, "intent.proposed", "bandit", { brain: "bandit", why: "b" }),
      event(100, "intent.started", "executor", { brain: "bandit", priority: 1, why: "b" }),
      event(200, "intent.preempted", "executor", { brain: "bandit", by: "matcher" }),
      event(300, "intent.proposed", "bandit", { brain: "bandit", why: "c" }),
    ];
    expect(timeline(events).map(rowText)).toEqual([
      "0.0s bandit · – → a → unchecked → dropped",
      "0.1s bandit · – → b → unchecked → preempted",
      "0.3s bandit · – → c → unchecked → playing",
    ]);
  });

  it("is reproduced, rewards and all, by replaying a live session", () => {
    const smile = Array.from({ length: 900 }, (_, i) => {
      const level = i % 50 > 30 ? 0.8 : 0.02;
      return { t: i * 100, level, delta: level - 0.02 };
    });
    const recording = { pose: [], hands: [], smile, voice: [] };
    const options = gameOptions(recordedSenses(recording).folders, 20, 7);
    const lines: string[] = [];
    const kernel = createKernel({ ...options, now: () => 0, sink: (line) => lines.push(line) });
    while (kernel.clock.t <= 90_000) kernel.tick();
    const live = lines.map((line) => JSON.parse(line) as KernelEvent);

    const again = replay(live, { ...gameOptions([], 20, 7), seed: 7 });
    const rewards = (events: KernelEvent[]) =>
      timeline(events).flatMap((row) => (row.reward ? [row.reward] : []));
    expect(rewards(live).length).toBeGreaterThan(2);
    expect(rewards(live).some((reward) => reward.smileDelta > 0.5)).toBe(true);
    expect(rewards(again.events)).toEqual(rewards(live));
    expect(again.diffs).toEqual([]);
  });
});
