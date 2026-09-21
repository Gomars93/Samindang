/**
 * Reusable clinician-observation model for the Herbal Workspace's
 * "오늘 반드시 확인" checklist (PR #24 Phase 4.3): follow-up questions,
 * tongue, pulse, abdominal exam, and other clinician-only observations.
 *
 * Structured enough to later support approved interpretation rules, but
 * this file contains no rule that interprets a tongue/pulse/abdomen
 * finding — it only records what the clinician entered.
 */
export type ClinicianObservationCategory =
  | 'FOLLOW_UP_QUESTION'
  | 'TONGUE'
  | 'PULSE'
  | 'ABDOMEN'
  /**
   * PR-B2(2026-09-21): 설진·복진 중에 눈·손에 걸리는 소견 가운데, 의미가
   * "변증 참고"가 아니라 **"한약 상담을 멈추고 보내야 함"**인 것들.
   * 나머지 카테고리와 같은 타입·직렬화를 쓰지만 **렌더 위치가 다르다** --
   * 레인2(오늘 확인할 것)가 아니라 레인1(안전 확인)에 있다. 접히는 서랍에
   * 안전장치를 넣는 것은 안전장치를 넣지 않은 것과 같기 때문이다.
   */
  | 'RED_FLAG'
  | 'OTHER'

export const CLINICIAN_OBSERVATION_CATEGORY_LABEL: Record<ClinicianObservationCategory, string> = {
  FOLLOW_UP_QUESTION: '추가 문진',
  TONGUE: '설진',
  PULSE: '맥진',
  ABDOMEN: '복진',
  RED_FLAG: '안전',
  OTHER: '기타 소견',
}

export type ClinicianObservationItem = {
  id: string
  category: ClinicianObservationCategory
  title: string
  /** True once the clinician has entered a value (empty string counts as not-yet-checked). */
  checked: boolean
  /** Free-text finding. Structured enough to extend later without a rewrite. */
  value: string
  recordedAt: string | null
}

export function emptyClinicianObservation(
  id: string,
  category: ClinicianObservationCategory,
  title: string,
): ClinicianObservationItem {
  return { id, category, title, checked: false, value: '', recordedAt: null }
}

/**
 * Standard herbal-visit checklist (round 2 Phase 2/8): 설진/맥진/복진 are
 * the three exam actions every herbal visit involves, plus a generic
 * follow-up-question slot. This is NOT a clinical inference — it does not
 * read any patient fact or branch on anything; it is the same fixed four
 * checklist items every time, exactly like a paper visit-note template.
 * Populating it by default (instead of only in SYNTHETIC preview data) is
 * what makes "오늘 반드시 확인" show real, usable checklist rows for a
 * real production submission instead of an empty state.
 */
export function defaultClinicianObservations(): ClinicianObservationItem[] {
  return [
    emptyClinicianObservation('obs_tongue', 'TONGUE', '설진 소견'),
    emptyClinicianObservation('obs_pulse', 'PULSE', '맥진 소견'),
    emptyClinicianObservation('obs_abdomen', 'ABDOMEN', '복진 소견'),
    emptyClinicianObservation('obs_followup', 'FOLLOW_UP_QUESTION', '추가 확인문진'),
  ]
}

/**
 * 안전 확인 레인에 렌더되는 red flag 항목 (PR-B2). 체크리스트(레인2)와
 * **별도 필드**로 저장된다 -- 같은 배열에 넣으면 "확인 필요 N건" 카운터와
 * 접기 규칙이 안전 항목까지 함께 접어버린다.
 */
export function emptyHerbalSafetyObservation(): ClinicianObservationItem {
  return emptyClinicianObservation('obs_red_flag', 'RED_FLAG', '전원 고려 소견')
}

export function countStillNeedsCheck(items: ClinicianObservationItem[]): number {
  return items.filter((i) => !i.checked).length
}
