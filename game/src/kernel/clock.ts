/** Simulation ticks per second. Rendering runs at display rate and only reads state. */
export const TICK_HZ = 30;

/** The kernel's fixed-tick clock: the only time source plugins see. */
export interface Clock {
  /** Monotonic time in whole ms. */
  readonly t: number;
  readonly paused: boolean;
  /** Advances one tick unless paused, and returns the time. */
  tick(): number;
  pause(): void;
  resume(): void;
}

export function createClock(): Clock {
  let ticks = 0;
  let paused = false;
  const now = () => Math.round((ticks * 1000) / TICK_HZ);
  return {
    get t() {
      return now();
    },
    get paused() {
      return paused;
    },
    tick() {
      if (!paused) ticks += 1;
      return now();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
  };
}
