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

/** The speech bubble is this wide whatever the line, so long lines wrap onto more rows. */
export const SPEECH_WIDTH = 260;
/** A line stays up at least this long, so short steps can still be read. */
export const MIN_LINE_SECONDS = 2;
export const FADE_SECONDS = 0.4;

/** How opaque a bubble is at `now` ms when shown fully for `seconds` from `startedAt`, then faded out. */
export function fadeAlpha(startedAt: number, seconds: number, now: number): number {
  const goneAt = startedAt + (seconds + FADE_SECONDS) * 1000;
  return Math.min(1, (goneAt - now) / (FADE_SECONDS * 1000));
}

/** The bubble for `line` at `now` ms: fully shown for the step or the minimum, then fading out. */
export function bubbleAt(line: Line | undefined, now: number): Bubble | undefined {
  if (!line) return undefined;
  const alpha = fadeAlpha(line.startedAt, Math.max(line.seconds, MIN_LINE_SECONDS), now);
  return alpha > 0 ? { text: line.text, alpha } : undefined;
}
