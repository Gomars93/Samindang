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
  /**
   * 원장 화면이 LAN으로 다른 workstation의 서버에 접근할 때 보낼
   * x-doctor-token. loopback에서는 필요 없다(서버가 loopback을 이미
   * 허용하므로). 미설정 시 헤더를 아예 보내지 않는다.
   */
  readonly VITE_SAMINDANG_DOCTOR_TOKEN?: string
  /**
   * 워크스테이션 설정 화면에 보여줄 프리셋 목록, 쉼표로 구분(예:
   * "DOCTOR-A,DOCTOR-B"). 미설정 시 기본값 DOCTOR-A,DOCTOR-B 사용. 오타
   * 방지를 위해 선택형 UI에 쓰인다 — 자유 입력도 별도로 가능하다.
   */
  readonly VITE_SAMINDANG_WORKSTATIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
