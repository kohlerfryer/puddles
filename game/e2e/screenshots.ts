/**
 * `pnpm screenshots <recording> [--out <folder>]`: runs the real game on a recording in Chromium
 * and saves a screenshot at the start, at each key moment the HUD names, and at the end. The
 * pictures are for people reviewing a change; nothing here checks pixels or fails on them.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { chromium, type Page } from "@playwright/test";

import { fromCaller, serveGame } from "./serve.ts";

/** How long the duck gets to react before a moment's screenshot. */
const REACT_MS = 600;
const POLL_MS = 100;
/** Gives up on a page that never says the replay ended, e.g. one that failed to load. */
const LIMIT_MS = 5 * 60_000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string", default: "screenshots" } },
});
const [input] = positionals;
if (input === undefined) throw new Error("usage: pnpm screenshots <recording> [--out <folder>]");
const out = fromCaller(values.out);
mkdirSync(out, { recursive: true });

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Saves screenshots of `page` as the recording plays; returns their file names. */
async function capture(page: Page): Promise<string[]> {
  const saved: string[] = [];
  const snap = async (name: string) => {
    const file = `${String(saved.length).padStart(2, "0")}-${slug(name)}.png`;
    await page.screenshot({ path: join(out, file) });
    saved.push(file);
  };
  const finished = page.getByText(/^Camera: replay (finished|failed)/);
  const moment = page.locator("#hud-moment");
  const deadline = Date.now() + LIMIT_MS;
  let last = "";
  await snap("start");
  while (!(await finished.isVisible()) && Date.now() < deadline) {
    const now = (await moment.textContent()) ?? "";
    if (now !== last) {
      last = now;
      await page.waitForTimeout(REACT_MS);
      await snap(now);
    }
    await page.waitForTimeout(POLL_MS);
  }
  await snap("end");
  return saved;
}

const server = await serveGame({ input, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(server.resolvedUrls?.local[0] ?? "");
  const saved = await capture(page);
  console.log(`saved ${String(saved.length)} screenshots to ${out}:\n${saved.join("\n")}`);
} finally {
  await browser.close();
  await server.close();
}
