/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the sync backend. Empty in builds that ship without sync. */
  readonly VITE_SYNC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
