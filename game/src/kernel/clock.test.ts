import { describe, expect, it } from "vitest";

import { TICK_HZ, createClock } from "./clock";

describe("createClock", () => {
  it("starts at zero", () => {
    expect(createClock().t).toBe(0);
  });

  it("ticks at 30 Hz with whole-millisecond times", () => {
    const clock = createClock();
    const times = Array.from({ length: TICK_HZ }, () => clock.tick());
    expect(times.slice(0, 3)).toEqual([33, 67, 100]);
    expect(times.at(-1)).toBe(1000);
  });

  it("never goes backwards", () => {
    const clock = createClock();
    let last = clock.t;
    for (let i = 0; i < 10_000; i++) {
      const t = clock.tick();
      expect(t).toBeGreaterThan(last);
      last = t;
    }
  });

  it("stands still while paused and carries on after resuming", () => {
    const clock = createClock();
    clock.tick();
    clock.pause();
    expect(clock.paused).toBe(true);
    expect(clock.tick()).toBe(33);
    clock.resume();
    expect(clock.paused).toBe(false);
    expect(clock.tick()).toBe(67);
  });
});
