/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 로컬 핸드오프 서버 주소 (예: http://192.168.0.10:4317). 미설정 시 서버 미사용. */
  readonly VITE_SAMINDANG_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
