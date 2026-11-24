import { describe, expect, it } from "vitest";

import type { KernelEvent } from "../core/contracts";
import { createEventLog } from "./eventLog";

const event = (t: number, type = "observation.smile"): KernelEvent => ({
  t,
  type,
  source: "smile",
  data: { level: t },
});

describe("createEventLog", () => {
  it("keeps events in the order they were appended", () => {
    const log = createEventLog();
    log.append(event(0));
    log.append(event(33, "outcome.done"));
    expect(log.events()).toEqual([event(0), event(33, "outcome.done")]);
    expect(log.count).toBe(2);
  });

  it("rejects events that break the event contract", () => {
    const log = createEventLog();
    expect(() => {
      log.append(event(0, "made_up.thing"));
    }).toThrow(/event/);
    expect(log.count).toBe(0);
  });

  it("rejects events from before the last one", () => {
    const log = createEventLog();
    log.append(event(33));
    expect(() => {
      log.append(event(0));
    }).toThrow(/before/);
  });

  it("forgets the oldest events past its capacity but keeps counting", () => {
    const log = createEventLog({ capacity: 2 });
    [0, 33, 67].forEach((t) => {
      log.append(event(t));
    });
    expect(log.events().map((e) => e.t)).toEqual([33, 67]);
    expect(log.count).toBe(3);
  });

  it("returns the events appended since a count", () => {
    const log = createEventLog({ capacity: 2 });
    [0, 33, 67].forEach((t) => {
      log.append(event(t));
    });
    expect(log.since(2).map((e) => e.t)).toEqual([67]);
    expect(log.since(0).map((e) => e.t)).toEqual([33, 67]);
    expect(log.since(3)).toEqual([]);
  });

  it("writes each event to the sink as a JSON line", () => {
    const lines: string[] = [];
    const log = createEventLog({ sink: (line) => lines.push(line) });
    log.append(event(0));
    expect(lines).toEqual([JSON.stringify(event(0))]);
  });

  it("hands out copies, so callers can't rewrite history", () => {
    const log = createEventLog();
    log.append(event(0));
    const [first] = log.events();
    if (first) first.data.level = 99;
    expect(log.events()[0]?.data.level).toBe(0);
  });
});
