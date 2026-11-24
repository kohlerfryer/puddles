/** `pnpm dev [--input <recording>] [--port <n>] [--host <name>]`: the dev server, on a recording if given. */

import { parseArgs } from "node:util";

import { serveGame } from "./serve.ts";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    port: { type: "string", default: "5173" },
    host: { type: "string", default: "localhost" },
  },
});

const server = await serveGame({
  input: values.input,
  port: Number(values.port),
  host: values.host,
});
server.printUrls();
server.bindCLIShortcuts({ print: true });
