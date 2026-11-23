interface ImportMetaEnv {
  /** Base URL of the Puddles server; the game asks `http://localhost:8000` when unset. */
  readonly VITE_PUDDLES_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
