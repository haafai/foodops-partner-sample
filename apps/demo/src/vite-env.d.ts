/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTNER_API_BASE_URL?: string;
  readonly VITE_PARTNER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
