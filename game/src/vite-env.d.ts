interface ImportMetaEnv {
  /** Base URL of the Puddles server; the game asks `http://localhost:8000` when unset. */
  readonly VITE_PUDDLES_SERVER?: string;
  /** A recording's JSON, set by `pnpm dev --input <recording>`; the senses read it, not the camera. */
  readonly VITE_PUDDLES_INPUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
