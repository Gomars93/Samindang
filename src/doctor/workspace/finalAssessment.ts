/**
 * Clinician-owned Final Assessment / Plan / Follow-up Targets (PR #24
 * Phase 7-8). Pure types + tiny helpers, no React.
 *
 * These are entirely separate from the existing ClinicianJudgment
 * (src/doctor/judgment.ts), which is the Myungri shadow-mode audit trail
 * (saju-only prediction vs revised-after-exam, debrief) plus the two
 * FROZEN-logic-linked objective exam fields
 * (lbp_objective_motor_deficit / shoulder_objective_cuff_weakness).
 * ClinicianJudgment is untouched by this PR and continues to drive
 * lbpLogic.ts/shoulderLogic.ts safety computation exactly as before.
 *
 * A system SUGGESTED item (PhysicalExamSuggestion, HerbalPatternCandidate)
 * must NEVER be auto-copied into these fields — every field here starts
 * empty and is filled only by explicit clinician typing/selection.
 */

export type PainFinalAssessment = {
  /** 최종 임상 판단(원장) — free text, starts empty. */
  finalWorkingAssessment: string
  /** 치료 초점. */
  treatmentFocus: string
  /** 시행/예정 처치. */
  interventionPerformedOrPlanned: string
  /** 즉시 재검 대상 (예: "숙일 때 통증 재현 여부"). */
  immediateRetestTarget: string
  recordedAt: string | null
}

export function emptyPainFinalAssessment(): PainFinalAssessment {
  return {
    finalWorkingAssessment: '',
    treatmentFocus: '',
    interventionPerformedOrPlanned: '',
    immediateRetestTarget: '',
    recordedAt: null,
  }
}

export function isPainFinalAssessmentRecorded(a: PainFinalAssessment): boolean {
  return a.recordedAt !== null
}

export type HerbalFinalAssessment = {
  /** 최종 변증·병기 — 원장 판단. Free text, starts empty. */
  finalPatternOrMechanism: string
  /** 치법(치료 원칙). */
  treatmentPrinciple: string
  /** 처방/계획 메모 — 자동 처방 생성 없음, 원장이 직접 기록. */
  prescriptionPlanNote: string
  /** 추적할 증상. */
  symptomsToTrack: string
  recordedAt: string | null
}

export function emptyHerbalFinalAssessment(): HerbalFinalAssessment {
  return {
    finalPatternOrMechanism: '',
    treatmentPrinciple: '',
    prescriptionPlanNote: '',
    symptomsToTrack: '',
    recordedAt: null,
  }
}

export function isHerbalFinalAssessmentRecorded(a: HerbalFinalAssessment): boolean {
  return a.recordedAt !== null
}

/**
 * Reassessment target the clinician nominates to track at next visit
 * (Phase 8). Max 3 per workspace. `baseline`/`postTreatmentValue` are both
 * optional free-text the clinician may record for THIS visit only — never
 * an auto-computed number, never an inferred improvement/worsening
 * judgment (see REPEAT_VISIT_AUTO_COMPARE_STATUS below for why no actual
 * prior-visit comparison happens here).
 */
export type FollowUpTarget = {
  id: string
  label: string
  baseline: string
  postTreatmentValue: string
}

export function followUpTarget(id: string, label: string): FollowUpTarget {
  return { id, label, baseline: '', postTreatmentValue: '' }
}

export const MAX_FOLLOW_UP_TARGETS = 3

/** Example option sets from the governing task — clinician picks, does not have to use these exact labels. */
export const PAIN_FOLLOW_UP_OPTIONS: FollowUpTarget[] = [
  followUpTarget('pain_intensity', '통증 강도'),
  followUpTarget('movement_function', '움직임·기능'),
  followUpTarget('symptom_reproduction', '증상 재현 여부'),
]

/**
 * 2026-09-06 (원장 지시 "재진시 추적항목만 체크 — NRS라던지", "자유입력을 최대한
 * 피하고"): 통증 강도의 기준값·직후값은 0~10 버튼(NRS)으로 입력한다.
 *
 * 저장 타입은 그대로 `string`이다 — 버튼은 그 문자열('7')을 만드는 구조화 입력일
 * 뿐이고(처치 chip과 같은 원칙, §14.2), EMR("기준 7")·이전 방문 표시("이전
 * baseline: 7")·이어받기 경로는 한 줄도 바뀌지 않는다. 이 문항 도입 전에 적힌
 * 자유값('7/10', '심함')은 `isNrsValue`가 false를 돌려주고, 화면은 그 값을 담은
 * 텍스트 칸을 버튼 위에 그대로 남긴다 — 절대 조용히 버리지 않는다.
 */
export const PAIN_NRS_TARGET_IDS: ReadonlySet<string> = new Set(['pain_intensity'])
export const NRS_VALUES: readonly string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
export function isNrsValue(v: string): boolean {
  return NRS_VALUES.includes(v)
}

export const HERBAL_FOLLOW_UP_OPTIONS: FollowUpTarget[] = [
  followUpTarget('sleep', '수면'),
  followUpTarget('digestion', '소화'),
  followUpTarget('stool', '대변'),
  followUpTarget('fatigue', '피로·기력'),
]

/**
 * This string means specifically "no automatic interpretation of the
 * comparison" (no computed %/개선/악화 judgment) — it does NOT mean "no
 * prior-visit data is ever shown." Round 3 Phase C adds a real, narrow,
 * patient_id-scoped prior-visit RAW value lookup (see
 * `src/doctor/workspace/longitudinal.ts`) that displays the previous
 * baseline/post-treatment value next to today's input field, purely as
 * read-only reference facts — never as a computed delta, percentage, or
 * "호전/악화" judgment. This constant still correctly describes why that
 * interpretation step itself is not implemented: no clinician-approved
 * improvement-threshold rule exists to interpret the numbers with.
 *
 * Copy note (round 3 QA fix): this text renders directly in the clinician
 * UI (FollowUpTargetPicker.tsx) — it must stay pure Korean, matching every
 * other on-screen hint here. Earlier it literally contained the English
 * internal-tracking phrase "OPERATIONAL INTEGRATION REQUIRED", which real
 * headless QA caught leaking into the rendered page.
 */
export const REPEAT_VISIT_AUTO_COMPARE_STATUS = '재진 자동 비교: 자동 판단 없음 — 이전 방문 기록은 아래에서 원장이 직접 확인'

/**
 * NextReassessmentPlan (round 3 Phase B, North Star "Structured
 * Reassessment"): the clinician explicitly decides how this patient's next
 * detailed re-evaluation should be scheduled/tracked. No default "2 weeks"
 * or any other clinical timing rule is invented here — `status` starts
 * `UNSET`, and the clinician must pick one of the other three states
 * (a literal date, a visit count, or a free-text note when neither a date
 * nor a count is practical to commit to yet).
 */
export type NextReassessmentPlanStatus = 'UNSET' | 'DATE' | 'VISIT_COUNT' | 'CLINICIAN_DECIDES'

export type NextReassessmentPlan = {
  status: NextReassessmentPlanStatus
  /** ISO date string (yyyy-mm-dd), meaningful only when status === 'DATE'. */
  targetDate: string
  /** Meaningful only when status === 'VISIT_COUNT'. */
  afterVisitCount: number | null
  note: string
}

export function emptyNextReassessmentPlan(): NextReassessmentPlan {
  return { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' }
}

export const NEXT_REASSESSMENT_PLAN_STATUS_LABEL: Record<NextReassessmentPlanStatus, string> = {
  UNSET: '미정',
  DATE: '날짜 지정',
  VISIT_COUNT: '방문 횟수 지정',
  CLINICIAN_DECIDES: '원장 판단(추후 결정)',
}
