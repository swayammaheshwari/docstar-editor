/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCRTC_WS_URL?: string;
  readonly VITE_WORKSPACE_TOKEN?: string;
  readonly VITE_WORKSPACE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
