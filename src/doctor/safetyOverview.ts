/**
 * Doctor View 재설계 v0.2 §11.1 — 안전 상태 단일 출처.
 *
 * 헤더 pill · URGENT 전폭 배너 · 통합 안전 리스트의 행 정렬 · 목록 화면
 * 배지 · 태블릿 pill 스트립 전부 이 selector만 읽는다(invariant). 다른
 * 계산 경로를 새로 만들지 않는다 — `computeSafetyModuleRows`(safetyModules.ts)
 * 가 이미 계산한 모듈별 `status`(disease/treatment lock을 합친 display
 * status)를 그대로 재사용한다.
 *
 *   URGENT  ⟸ flags.requires_staff_check || any(module.status === 'URGENT_REVIEW')
 *   REVIEW  ⟸ any(module.status === 'REVIEW_REQUIRED')
 *             || flags.response_consistency_review
 *             || flags.sleep_disorder_priority_review || flags.sleep_disorder_review
 *   UNKNOWN ⟸ (그 외) 안전 문진에 실제 응답이 전혀 없다 —
 *             `red_flag_general === null && rows.length === 0`
 *   CLEAR   ⟸ 그 외 (안전 문진에 실제 응답이 있음이 확인된 경우만)
 *
 * (module.status 자체가 이미 "any(*Locked===true)"를 REVIEW_REQUIRED로
 * 반영하고 있으므로 — safetyModules.ts의 bumpToReview — 여기서 다시 lock을
 * 따로 확인하지 않는다.)
 *
 * Opus MAJOR(fail-open 미응답): 이전에는 안전 문진에 아무 응답이 없어도
 * (SAFETY_01 미응답 + 부위별 안전 모듈 전부 null) 무조건 CLEAR('안전
 * 확인됨')로 표시했다 — "확인한 적 없음"과 "확인해서 안전함"을 구분하지
 * 못하는 fail-open이었다. `red_flag_general !== null || rows.length > 0`
 * (일반 안전 문항에 응답했거나 부위 모듈 중 하나라도 계산됐음)일 때만
 * CLEAR를 반환하고, 그렇지 않으면 UNKNOWN을 반환해 헤더 pill이 중립
 * "안전정보 없음"으로 fail-closed 표시하게 한다(PatientHeader).
 */
import { computeSafetyModuleRows, type SafetyClinicianInputs } from './safetyModules'
import type { DoctorPayload } from './types'

export type SafetyOverview = 'URGENT' | 'REVIEW' | 'CLEAR' | 'UNKNOWN'

export function deriveSafetyOverview(payload: DoctorPayload, clinicianInputs: SafetyClinicianInputs = {}): SafetyOverview {
  const rows = computeSafetyModuleRows(payload, clinicianInputs)
  const { flags } = payload

  if (flags.requires_staff_check || rows.some((r) => r.status === 'URGENT_REVIEW')) {
    return 'URGENT'
  }
  if (
    rows.some((r) => r.status === 'REVIEW_REQUIRED') ||
    flags.response_consistency_review ||
    flags.sleep_disorder_priority_review ||
    flags.sleep_disorder_review
  ) {
    return 'REVIEW'
  }
  const redFlagGeneral = payload.responses.safety_flags.red_flag_general
  if (redFlagGeneral !== null || rows.length > 0) {
    return 'CLEAR'
  }
  return 'UNKNOWN'
}
