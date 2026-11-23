/** Asks the server how Puddles reacts to a photo, always ending in something he can play. */

import type { Step } from "./reaction";
import { type SafeReaction, safeReaction, VERB_SECONDS } from "./validator";

/** Puddles gives up on the server after this long and plays the confused script. */
export const ASK_TIMEOUT_MS = 8000;
const DEFAULT_SERVER = "http://localhost:8000";

/** The parts of a fetch response the request flow reads. */
export interface Reply {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** Posts a JSON `body` to `url`, stopping when `signal` aborts. */
export type Post = (url: string, body: string, signal: AbortSignal) => Promise<Reply>;

/** What Puddles plays, and a line for the corner readout on how the request went. */
export interface Answer {
  readonly reaction: SafeReaction;
  readonly readout: string;
}

class TimedOut extends Error {}

/** The `/react` endpoint on `server`, or on the local server when none is configured. */
export function reactUrl(server: string | undefined): string {
  return `${(server ?? DEFAULT_SERVER).replace(/\/$/, "")}/react`;
}

/** Encodes photo bytes as base64 for the request body. */
export function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

/** How long `script` takes to play, in milliseconds. */
export function scriptMs(script: readonly Step[]): number {
  return script.reduce((ms, step) => ms + VERB_SECONDS[step.do] * 1000, 0);
}

async function request(image: string, post: Post, url: string, signal: AbortSignal) {
  const reply = await post(url, JSON.stringify({ image }), signal);
  return { reply, text: reply.ok ? await reply.text() : "" };
}

/** Resolves like `work`, or rejects with `TimedOut` and aborts after the timeout. */
async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimedOut());
    }, ASK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const confused = (readout: string): Answer => ({ reaction: safeReaction(""), readout });

/**
 * Posts the base64 `image` to `url` and validates the reply. Any error, invalid reply or
 * timeout gives the confused script; `now` is a steady clock in milliseconds for the latency.
 */
export async function ask(image: string, post: Post, url: string, now: () => number) {
  const start = now();
  const took = (): string => `in ${String(Math.round(now() - start))} ms`;
  try {
    const { reply, text } = await withTimeout((signal) => request(image, post, url, signal));
    if (!reply.ok) return confused(`error ${String(reply.status)} ${took()}`);
    const reaction = safeReaction(text);
    const status = reaction.valid ? String(reply.status) : `${String(reply.status)}, invalid reply`;
    return { reaction, readout: `${status} ${took()}` } satisfies Answer;
  } catch (error) {
    if (error instanceof TimedOut) return confused(`timed out after ${String(ASK_TIMEOUT_MS)} ms`);
    return confused(`error (${String(error)}) ${took()}`);
  }
}
