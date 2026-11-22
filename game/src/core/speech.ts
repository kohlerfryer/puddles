/** A line Puddles starts saying at `startedAt` ms, during a step `seconds` long. */
export interface Line {
  readonly text: string;
  readonly startedAt: number;
  readonly seconds: number;
}

/** The speech bubble as shown at one moment: its text and how opaque it is. */
export interface Bubble {
  readonly text: string;
  readonly alpha: number;
}

/** A line stays up at least this long, so short steps can still be read. */
export const MIN_LINE_SECONDS = 2;
export const FADE_SECONDS = 0.4;

/** The bubble for `line` at `now` ms: fully shown for the step or the minimum, then fading out. */
export function bubbleAt(line: Line | undefined, now: number): Bubble | undefined {
  if (!line) return undefined;
  const shown = Math.max(line.seconds, MIN_LINE_SECONDS);
  const goneAt = line.startedAt + (shown + FADE_SECONDS) * 1000;
  const alpha = Math.min(1, (goneAt - now) / (FADE_SECONDS * 1000));
  return alpha > 0 ? { text: line.text, alpha } : undefined;
}
