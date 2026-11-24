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

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`--port takes a port number, not "${values.port}"`);
}

const server = await serveGame({ input: values.input, port, host: values.host });
server.printUrls();
server.bindCLIShortcuts({ print: true });
