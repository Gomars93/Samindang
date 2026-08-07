/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 로컬 핸드오프 서버 주소 (예: http://192.168.0.10:4317). 미설정 시 서버 미사용. */
  readonly VITE_SAMINDANG_SERVER_URL?: string
  /**
   * 환자 대기 화면 안내 문구. 정확한 분 단위 약속(예: "5분 후")은 절대 넣지
   * 말 것 — 미설정 시 기본값(순서대로 안내 문구) 사용.
   */
  readonly VITE_SAMINDANG_WAIT_MESSAGE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
