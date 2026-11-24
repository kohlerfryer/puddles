/** `pnpm dev [--input <recording>] [--port <n>] [--host <name>]`: the dev server, on a recording if given. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    port: { type: "string", default: "5173" },
    host: { type: "string", default: "localhost" },
  },
});

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`--port takes a port number, not "${values.port}"`);
}

// `pnpm -C game` runs in game/, so a path on the command line is read from where pnpm was called.
const caller = process.env.INIT_CWD ?? process.cwd();
const recording =
  values.input === undefined ? undefined : readFileSync(resolve(caller, values.input), "utf8");

// The recording goes in through `define`, not the environment: recordings run to hundreds of
// kilobytes, past what child processes can inherit.
const server = await createServer({
  root: resolve(import.meta.dirname, ".."),
  server: { port, host: values.host },
  define:
    recording === undefined
      ? {}
      : { "import.meta.env.VITE_PUDDLES_INPUT": JSON.stringify(recording) },
});
await server.listen();
server.printUrls();
server.bindCLIShortcuts({ print: true });
