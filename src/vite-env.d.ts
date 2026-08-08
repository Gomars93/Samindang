/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 로컬 핸드오프 서버 주소 (예: http://192.168.0.10:4317). 미설정 시 서버 미사용. */
  readonly VITE_SAMINDANG_SERVER_URL?: string
  /**
   * 환자 대기 화면 안내 문구. 정확한 분 단위 약속(예: "5분 후")은 절대 넣지
   * 말 것 — 미설정 시 기본값(순서대로 안내 문구) 사용.
   */
  readonly VITE_SAMINDANG_WAIT_MESSAGE?: string
  /**
   * 문진 화면(question phase) 유휴 타임아웃(분). 미설정 시 기본 10분.
   * 완료 화면/원장 화면에서는 절대 동작하지 않는다.
   */
  readonly VITE_SAMINDANG_IDLE_MINUTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
