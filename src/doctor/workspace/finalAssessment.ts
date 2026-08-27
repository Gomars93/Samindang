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

export const HERBAL_FOLLOW_UP_OPTIONS: FollowUpTarget[] = [
  followUpTarget('sleep', '수면'),
  followUpTarget('digestion', '소화'),
  followUpTarget('stool', '대변'),
  followUpTarget('fatigue', '피로·기력'),
]

/**
 * OPERATIONAL INTEGRATION REQUIRED: there is no secure, stable patient/visit
 * linkage in this codebase today (confirmed by grep across src/doctor and
 * server/ during Phase 0 audit — no repeat-visit matching exists). Rather
 * than fake a match (e.g. on name+phone, a real patient-safety risk from
 * collisions), the reassessment UI records the *targets* only and displays
 * this constant string wherever an automatic prior-visit comparison would
 * otherwise go.
 */
export const REPEAT_VISIT_AUTO_COMPARE_STATUS = '재진 자동 비교: OPERATIONAL INTEGRATION REQUIRED'
