import type { KernelEvent } from "../core/contracts";
import { contractValidators } from "../core/contractsSchema";

export interface EventLogOptions {
  /** How many events stay in memory; older ones are forgotten. */
  readonly capacity?: number;
  /** Receives each event as a JSON line, e.g. to write it to the save for replay. */
  readonly sink?: (line: string) => void;
}

/** The kernel's append-only log of typed events, kept in a ring buffer. */
export interface EventLog {
  /** Events appended so far, including forgotten ones. */
  readonly count: number;
  append(event: KernelEvent): void;
  /** Copies of the events still in memory, oldest first. */
  events(): KernelEvent[];
  /** Copies of the events in memory that were appended after the first `count`. */
  since(count: number): KernelEvent[];
}

export function createEventLog({ capacity = 10_000, sink }: EventLogOptions = {}): EventLog {
  const buffer: string[] = [];
  let count = 0;
  let lastT = 0;
  const since = (from: number) => {
    const skip = Math.max(0, from - (count - buffer.length));
    return buffer.slice(skip).map((line) => JSON.parse(line) as KernelEvent);
  };
  return {
    get count() {
      return count;
    },
    append(event) {
      if (!contractValidators.event(event)) {
        throw new Error(`invalid event: ${JSON.stringify(contractValidators.event.errors)}`);
      }
      if (event.t < lastT)
        throw new Error(`event at ${String(event.t)} is before ${String(lastT)}`);
      const line = JSON.stringify(event);
      buffer.push(line);
      if (buffer.length > capacity) buffer.shift();
      count += 1;
      lastT = event.t;
      sink?.(line);
    },
    events: () => since(0),
    since,
  };
}
