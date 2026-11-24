/** `pnpm dev [--port <n>] [--host <name>]`: the game's dev server, started through Vite's API. */

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "5173" },
    host: { type: "string", default: "localhost" },
  },
});

const server = await createServer({
  root: resolve(import.meta.dirname, ".."),
  server: { port: Number(values.port), host: values.host },
});
await server.listen();
server.printUrls();
server.bindCLIShortcuts({ print: true });
