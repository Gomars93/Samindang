/**
 * Additional Concern presentation model (round 3 Phase H). North Star
 * principle: "Primary = Depth, Additional = Coverage" — this file only
 * builds a compact PRESENTATION of the Additional module the patient
 * already answered (`routing.additional_module`/`additional_detail_concern`,
 * both already computed by coreSpec.ts) plus a clinician-owned, manual,
 * workspace-local "flag this for deeper evaluation today" annotation.
 *
 * This is explicitly NOT a promotion mechanism: setting
 * AdditionalConcernPromotionState never mutates `payload.routing`, never
 * changes which regional SafetyPanel renders, and never selects a new
 * Safety Mini-Gate question. It is a sticky note the clinician can attach
 * to the Additional Concern card, nothing more — the actual, deeper
 * regional evaluation still happens through the module's own existing
 * fields/SafetyPanel (unchanged).
 */
import type { Provenance } from './provenance'

export type ConcernRole = 'PRIMARY' | 'ADDITIONAL'

export const CONCERN_ROLE_LABEL: Record<ConcernRole, string> = {
  PRIMARY: '주호소',
  ADDITIONAL: '추가 문제',
}

/** Pure display projection of the already-computed Additional module/concern — invents nothing. */
export type AdditionalConcernSummary = {
  role: ConcernRole
  module: string | null
  detailConcernLabel: string | null
  /** Always PATIENT_FACT or DERIVED — this is a read of already-computed routing, never a new inference. */
  source: Provenance
}

export type AdditionalConcernPromotionStatus = 'NOT_FLAGGED' | 'MANUALLY_FLAGGED'

/**
 * Clinician-owned, workspace-local only. `MANUALLY_FLAGGED` means "the
 * clinician decided, today, to look at this Additional concern more
 * closely" — it is a note for THIS visit's record-keeping, not a system
 * decision and not a change to any safety computation.
 */
export type AdditionalConcernPromotionState = {
  status: AdditionalConcernPromotionStatus
  clinicianNote: string
  promotedAt: string | null
}

export function emptyAdditionalConcernPromotion(): AdditionalConcernPromotionState {
  return { status: 'NOT_FLAGGED', clinicianNote: '', promotedAt: null }
}

/**
 * Pure projection of already-computed routing fields — reads
 * `routing.additional_module`/`additional_detail_concern` exactly as
 * coreSpec.ts computed them. Returns null when there is no Additional
 * concern at all (nothing to summarize), which the card component treats
 * as "render nothing."
 */
export function deriveAdditionalConcernSummary(routing: {
  additional_module: string | null
  additional_detail_concern: string | null
}): AdditionalConcernSummary | null {
  // 10차 독립 리뷰 MEDIUM-1: routing.additional_module/additional_detail_concern
  // 타입은 string|null이라고 주장하지만 검증되지 않은 저장된 JSON에서 그대로
  // 오므로, 레거시/손상 데이터는 이를 지키지 않을 수 있다 -- 이전 구현은
  // truthy 체크만 해서 wrong-typed 객체가 그대로 JSX 자식으로 흘러들어가
  // "Objects are not valid as a React child" 예외를 던졌고,
  // DoctorRecordErrorBoundary가 이를 잡아도 이 카드 하나가 아니라 전체
  // 임상 화면(CommonSafetyBanner/모든 SafetyPanel 포함)이 통째로
  // fallback으로 바뀌었다 -- wrong-typed면 "추가 문제 없음"과 동일하게
  // 조용히 건너뛴다(이 카드는 프레젠테이션 전용이며 실제 안전 표면은 각
  // 지역 SafetyPanel이 그대로 담당하므로 안전정보 손실이 아니다).
  if (typeof routing.additional_module !== 'string' || routing.additional_module === '') return null
  if (
    routing.additional_detail_concern !== null &&
    typeof routing.additional_detail_concern !== 'string'
  ) {
    return null
  }
  return {
    role: 'ADDITIONAL',
    module: routing.additional_module,
    detailConcernLabel: routing.additional_detail_concern,
    source: 'DERIVED',
  }
}
