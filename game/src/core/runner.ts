import type { Mood, Step } from "./reaction";
import { VERB_SECONDS } from "./validator";

type RunnerStatus =
  { state: "idle" } | { state: "playing"; step: Step; mood: Mood; startedAt: number };

const IDLE: RunnerStatus = { state: "idle" };

/** Plays a validated script one step at a time; times are in milliseconds on any steady clock. */
export function createRunner() {
  let script: Step[] = [];
  const gestures: Step[] = [];
  let current: Step | undefined;
  let startedAt = 0;
  let endsAt = 0;

  /** Gesture reactions jump ahead of the script's remaining steps. */
  function startNext(at: number): void {
    current = gestures.shift() ?? script.shift();
    if (current) {
      startedAt = at;
      endsAt = at + VERB_SECONDS[current.do] * 1000;
    }
  }

  return {
    /** Starts `script` now, replacing any running one; queued gesture reactions are kept. */
    play(steps: readonly Step[], now: number): void {
      script = [...steps];
      startNext(now);
    },
    /** Queues a gesture reaction to play once the current step ends, or now when idle. */
    react(step: Step, now: number): void {
      gestures.push(step);
      if (!current) {
        startNext(now);
      }
    },
    update(now: number): RunnerStatus {
      while (current && now >= endsAt) {
        startNext(endsAt);
      }
      return current ? { state: "playing", step: current, mood: current.mood, startedAt } : IDLE;
    },
  };
}
