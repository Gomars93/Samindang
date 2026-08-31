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
 *   CLEAR   ⟸ 그 외
 *
 * (module.status 자체가 이미 "any(*Locked===true)"를 REVIEW_REQUIRED로
 * 반영하고 있으므로 — safetyModules.ts의 bumpToReview — 여기서 다시 lock을
 * 따로 확인하지 않는다.)
 */
import { computeSafetyModuleRows, type SafetyClinicianInputs } from './safetyModules'
import type { DoctorPayload } from './types'

export type SafetyOverview = 'URGENT' | 'REVIEW' | 'CLEAR'

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
  return 'CLEAR'
}
