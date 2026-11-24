/** Starts the game's dev server, optionally on a recording instead of the camera. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";

export interface ServeOptions {
  /** A recording or gesture fixture for the senses to read instead of the camera. */
  readonly input: string | undefined;
  readonly port: number;
  readonly host: string;
}

/** Resolves a path given on the command line from where pnpm was called, since `pnpm -C game` runs in game/. */
export const fromCaller = (path: string): string =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path);

/**
 * The recording goes in through `define`, not the environment: recordings run to hundreds of
 * kilobytes, past what child processes can inherit.
 */
export async function serveGame({ input, port, host }: ServeOptions): Promise<ViteDevServer> {
  const recording = input === undefined ? undefined : readFileSync(fromCaller(input), "utf8");
  const server = await createServer({
    root: resolve(import.meta.dirname, ".."),
    server: { port, host },
    define:
      recording === undefined
        ? {}
        : { "import.meta.env.VITE_PUDDLES_INPUT": JSON.stringify(recording) },
  });
  return server.listen();
}
