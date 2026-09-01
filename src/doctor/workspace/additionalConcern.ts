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
// 11차 독립 리뷰 LOW-1: additional_detail_concern이 wrong-typed일 때 이
// 카드 전체를 null 처리하면(과거 10차 수정), 자료 보기 탭의 추가
// 상세상담 섹션은 optionLabel을 통해 이 필드에 "확인 필요(값 형식 오류)"를
// 그대로 보여주는데(DoctorView.tsx의 `optionLabel('ADDITIONAL_DETAIL_01', ...)`)
// 같은 레코드의 진료 탭 추가 문제 카드는 통째로 사라져 두 화면이 모순된다.
// 실제로 렌더 시 예외를 던지는 값은 additional_module(카드의 유일한
// 텍스트 폴백)뿐이므로, additional_detail_concern은 wrong-typed일 때
// 이 상수로 대체해 module은 그대로 보존한다.
const ADDITIONAL_DETAIL_UNREADABLE_LABEL = '확인 필요(값 형식 오류)'

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
  // fallback으로 바뀌었다 -- additional_module이 wrong-typed면(카드가
  // 표시할 텍스트가 전혀 없다) "추가 문제 없음"과 동일하게 조용히
  // 건너뛴다.
  if (typeof routing.additional_module !== 'string' || routing.additional_module === '') return null
  const detailConcernLabel =
    routing.additional_detail_concern === null || routing.additional_detail_concern === undefined
      ? null
      : typeof routing.additional_detail_concern === 'string'
        ? routing.additional_detail_concern
        : ADDITIONAL_DETAIL_UNREADABLE_LABEL
  return {
    role: 'ADDITIONAL',
    module: routing.additional_module,
    detailConcernLabel,
    source: 'DERIVED',
  }
}
