/**
 * Workspace EMR preview composer (PR #24 Phase 9).
 *
 * This is additive to, and does NOT replace, the existing production EMR
 * flow (src/doctor/emrSummary.ts's buildEmrSummary, driven by
 * ClinicianJudgment + RecorderStructuredNote, saved through the existing
 * server-wired JudgmentPanel). That flow is untouched by this PR. This
 * composer instead previews what the NEW workspace's own Final
 * Assessment/Plan/Follow-up fields would look like as EMR text, so the new
 * fields are demonstrably real and copy-pasteable even before they get
 * production server persistence (tracked as a follow-up, not a clinical
 * blocker — see the governing task's Phase 9 scoping).
 *
 * Rules enforced here, matching src/doctor/emrSummary.ts's own rules:
 * 1. A SUGGESTED item (PhysicalExamSuggestion/HerbalPatternCandidate) is
 *    never written into this text as if it were a clinician-confirmed
 *    finding — only OBSERVED exam results and the clinician's own
 *    FINAL_ASSESSMENT/PLAN/FOLLOW_UP_TARGET text ever appear here.
 * 2. NOT_YET_CHECKED items are never listed as negative findings — they
 *    are simply omitted (an empty line), never rendered as "음성".
 * 3. Patient-reported and clinician-observed findings stay on clearly
 *    separate, clearly labeled lines.
 */
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { FollowUpTarget, HerbalFinalAssessment, PainFinalAssessment } from './finalAssessment'
import { EXAM_CHECK_STATUS_LABEL, LATERALITY_LABEL } from './provenance'

const CRLF = '\r\n'

function examFindingsLines(items: PhysicalExamSuggestion[]): string[] {
  return items
    .filter((i) => i.result.status !== 'NOT_YET_CHECKED') // rule 2: never render a pending item as a negative
    .map((i) => {
      const lat = i.result.laterality && i.result.laterality !== 'NOT_APPLICABLE' ? ` (${LATERALITY_LABEL[i.result.laterality]})` : ''
      const note = i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''
      return `${i.title}: ${EXAM_CHECK_STATUS_LABEL[i.result.status]}${lat}${note}`
    })
}

function observationLines(items: ClinicianObservationItem[]): string[] {
  return items.filter((i) => i.checked).map((i) => `${i.title}: ${i.value.trim()}`)
}

export function buildPainWorkspaceEmrPreview(input: {
  primaryConcern: string | null
  examSuggestions: PhysicalExamSuggestion[]
  finalAssessment: PainFinalAssessment
  followUpTargets: FollowUpTarget[]
}): string {
  const lines: Array<{ label: string; value: string }> = [
    { label: '주호소', value: input.primaryConcern ?? '' },
    { label: '진찰 소견', value: examFindingsLines(input.examSuggestions).join('; ') },
    { label: 'Assessment', value: input.finalAssessment.finalWorkingAssessment },
    { label: '치료 초점', value: input.finalAssessment.treatmentFocus },
    { label: '시행/예정 처치', value: input.finalAssessment.interventionPerformedOrPlanned },
    { label: '즉시 재검 대상', value: input.finalAssessment.immediateRetestTarget },
    { label: '재평가 대상', value: input.followUpTargets.map((t) => t.label).join(', ') },
  ]
  return lines.map(({ label, value }) => (value.trim() ? `${label}: ${value.trim()}` : `${label}:`)).join(CRLF)
}

export function buildHerbalWorkspaceEmrPreview(input: {
  primaryConcern: string | null
  clinicianObservations: ClinicianObservationItem[]
  finalAssessment: HerbalFinalAssessment
  followUpTargets: FollowUpTarget[]
}): string {
  const lines: Array<{ label: string; value: string }> = [
    { label: '상담 목적', value: input.primaryConcern ?? '' },
    { label: '설진/맥진/복진 소견', value: observationLines(input.clinicianObservations).join('; ') },
    { label: '최종 변증·병기', value: input.finalAssessment.finalPatternOrMechanism },
    { label: '치법', value: input.finalAssessment.treatmentPrinciple },
    { label: '처방/계획 메모', value: input.finalAssessment.prescriptionPlanNote },
    { label: '추적할 증상', value: input.finalAssessment.symptomsToTrack },
    { label: '재평가 대상', value: input.followUpTargets.map((t) => t.label).join(', ') },
  ]
  return lines.map(({ label, value }) => (value.trim() ? `${label}: ${value.trim()}` : `${label}:`)).join(CRLF)
}
