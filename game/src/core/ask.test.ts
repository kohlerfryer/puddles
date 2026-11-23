import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ask, ASK_TIMEOUT_MS, type Post, reactUrl, scriptMs, toBase64 } from "./ask";
import { DEFAULT_SCRIPT, DEFAULT_TRAITS } from "./validator";

const TRAITS = { size: "small", weight: "light", shape: "long", edible: true } as const;
const SCRIPT = [
  { do: "sniff", target: "object", mood: "curious" },
  { do: "eat", target: "object", mood: "happy", say: "Yum!" },
] as const;
const VALID = JSON.stringify({ holding: true, object: "banana", traits: TRAITS, script: SCRIPT });
const CONFUSED = { valid: false, traits: DEFAULT_TRAITS, script: DEFAULT_SCRIPT };
const URL = "http://server/react";
const LATENCY = 420;

/** A server that answers `body` with `status` after `LATENCY` ms. */
function replying(body: string, status = 200): Post {
  return () =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({ ok: status < 400, status, text: () => Promise.resolve(body) });
      }, LATENCY);
    });
}

/** A server that never answers, but gives up when the request is aborted. */
const hanging: Post = (_url, _body, signal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      reject(new Error("aborted"));
    });
  });

async function asking(post: Post, ms = ASK_TIMEOUT_MS) {
  const answer = ask("aW1hZ2U=", post, URL, () => Date.now());
  await vi.advanceTimersByTimeAsync(ms);
  return answer;
}

describe("ask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts the photo as JSON to the react URL", async () => {
    const post = vi.fn(replying(VALID));
    await asking(post);
    expect(post).toHaveBeenCalledWith(URL, '{"image":"aW1hZ2U="}', expect.any(AbortSignal));
  });

  it("plays a valid reply's traits and script, with its status and latency", async () => {
    expect(await asking(replying(VALID))).toEqual({
      reaction: { valid: true, traits: TRAITS, script: SCRIPT },
      readout: `200 in ${String(LATENCY)} ms`,
    });
  });

  it("plays the confused script for an invalid reply", async () => {
    expect(await asking(replying('{"holding": true}'))).toEqual({
      reaction: CONFUSED,
      readout: `200, invalid reply in ${String(LATENCY)} ms`,
    });
  });

  it("plays the confused script when the server answers with an error status", async () => {
    expect(await asking(replying('{"detail": "model failed"}', 502))).toEqual({
      reaction: CONFUSED,
      readout: `error 502 in ${String(LATENCY)} ms`,
    });
  });

  it("plays the confused script when the request fails", async () => {
    const failing: Post = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await asking(failing)).toEqual({
      reaction: CONFUSED,
      readout: "error (TypeError: Failed to fetch) in 0 ms",
    });
  });

  it("gives up and plays the confused script after the timeout, aborting the request", async () => {
    const post = vi.fn(hanging);
    const answer = await asking(post);
    expect(answer).toEqual({
      reaction: CONFUSED,
      readout: `timed out after ${String(ASK_TIMEOUT_MS)} ms`,
    });
    expect(post.mock.calls[0]?.[2].aborted).toBe(true);
  });

  it("waits until the timeout for a slow server", async () => {
    const slow: Post = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: true, status: 200, text: () => Promise.resolve(VALID) });
        }, ASK_TIMEOUT_MS - 1);
      });
    expect((await asking(slow)).reaction.valid).toBe(true);
  });

  it("times out on a server that ignores the abort", async () => {
    const deaf: Post = () => new Promise(() => undefined);
    expect((await asking(deaf)).readout).toBe(`timed out after ${String(ASK_TIMEOUT_MS)} ms`);
  });
});

describe("reactUrl", () => {
  it("defaults to the local server", () => {
    expect(reactUrl(undefined)).toBe("http://localhost:8000/react");
  });

  it("uses the configured server, with or without a trailing slash", () => {
    expect(reactUrl("https://puddles.example")).toBe("https://puddles.example/react");
    expect(reactUrl("https://puddles.example/")).toBe("https://puddles.example/react");
  });
});

describe("toBase64", () => {
  it("encodes bytes as base64", () => {
    expect(toBase64(new TextEncoder().encode("image"))).toBe("aW1hZ2U=");
    expect(toBase64(new Uint8Array([0, 255, 128]))).toBe("AP+A");
  });
});

describe("scriptMs", () => {
  it("adds up how long each step of the script takes", () => {
    expect(scriptMs(SCRIPT)).toBe(2500);
    expect(scriptMs([])).toBe(0);
  });
});
