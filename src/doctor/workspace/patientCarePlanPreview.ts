/**
 * Patient-facing Care Plan preview composer (round 3 Phase A/J).
 *
 * This is a THIRD distinct output, separate from both the internal
 * decision-support view and the clinician EMR preview (see this round's
 * north-star doc, "EMR / Patient Output Separation"). It must never
 * include:
 *  - Myungri/사주 content of any kind
 *  - unconfirmed PhysicalExamSuggestion/HerbalPatternCandidate/
 *    RehabSuggestion items (only the clinician's own Care Plan free text)
 *  - contradiction/unknown engine internals
 *  - NOT_YET_CHECKED (or anything else) rendered as a negative finding
 *
 * Only the clinician-authored Care Plan fields (and, minimally, the
 * primary concern label for context) ever appear here. An empty field is
 * simply omitted — never rendered as "없음"/negative.
 */
import type { PainCarePlan, HerbalCarePlan } from './carePlan'

const CRLF = '\r\n'

function fieldLines(pairs: Array<{ label: string; value: string }>): string[] {
  return pairs.filter((p) => p.value.trim() !== '').map((p) => `${p.label}: ${p.value.trim()}`)
}

export function buildPainPatientCarePlanPreview(input: { primaryConcern: string | null; carePlan: PainCarePlan }): string {
  const lines = [
    `주호소: ${input.primaryConcern ?? ''}`,
    ...fieldLines([
      { label: '치료 목표', value: input.carePlan.currentTreatmentGoal },
      { label: '재활 목표', value: input.carePlan.rehabilitationGoal },
      { label: '집에서 할 일', value: input.carePlan.homeActionPlan },
      { label: '주의할 점', value: input.carePlan.activityPrecaution },
      { label: '안내사항', value: input.carePlan.patientInstruction },
      { label: '다음 방문 확인', value: input.carePlan.nextVisitCheckItem },
    ]),
  ]
  return lines.join(CRLF)
}

export function buildHerbalPatientCarePlanPreview(input: { primaryConcern: string | null; carePlan: HerbalCarePlan }): string {
  const lines = [
    `상담 목적: ${input.primaryConcern ?? ''}`,
    ...fieldLines([
      { label: '관리 목표', value: input.carePlan.currentManagementGoal },
      { label: '처방/한약 안내', value: input.carePlan.medicationPlanNote },
      { label: '집·생활 관리', value: input.carePlan.homeLifestyleManagement },
      { label: '관찰할 증상', value: input.carePlan.symptomsToObserve },
      { label: '이상반응/연락 안내', value: input.carePlan.adverseEffectContactInstruction },
      { label: '다음 방문 확인', value: input.carePlan.nextVisitCheckItem },
    ]),
  ]
  return lines.join(CRLF)
}
