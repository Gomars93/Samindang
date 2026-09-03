/**
 * Workspace EMR preview composer (PR #24 Phase 9, extended round 3 Phases
 * A/B/E).
 *
 * This is additive to, and does NOT replace, the existing production EMR
 * flow (src/doctor/emrSummary.ts's buildEmrSummary, driven by
 * ClinicianJudgment + RecorderStructuredNote, saved through the existing
 * server-wired JudgmentPanel). That flow is untouched by this PR. This
 * composer instead previews what the workspace's own clinician-owned
 * fields would look like as EMR text.
 *
 * Rules enforced here, matching src/doctor/emrSummary.ts's own rules:
 * 1. A SUGGESTED item (PhysicalExamSuggestion/HerbalPatternCandidate/
 *    RehabSuggestion) is never written into this text as if it were a
 *    clinician-confirmed finding — only OBSERVED exam results and the
 *    clinician's own FINAL_ASSESSMENT/PLAN/FOLLOW_UP_TARGET text ever
 *    appear here.
 * 2. NOT_YET_CHECKED items are never listed as negative findings — they
 *    are simply omitted (an empty line), never rendered as "음성".
 * 3. Patient-reported and clinician-observed findings stay on clearly
 *    separate, clearly labeled lines.
 * 4. A Structured Reassessment item's PREVIOUS value is never printed as
 *    if it were today's result — only `result` (today's) feeds the
 *    "재검 소견" line; `previous` never does.
 */
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { FollowUpTarget, HerbalFinalAssessment, PainFinalAssessment, NextReassessmentPlan } from './finalAssessment'
import { lbpDirectionalResponseLabel, type LbpDirectionalResponse } from './lbpExamSuggestions'
import { summarizeLbpWorkingHypothesisKo, type LbpWorkingHypothesis } from './lbpWorkingHypothesis'
import { NEXT_REASSESSMENT_PLAN_STATUS_LABEL } from './finalAssessment'
import type { PainCarePlan, HerbalCarePlan } from './carePlan'
import type { ReassessmentExamItem, StructuredReassessment } from './reassessmentExam'
import {
  EXAM_CHECK_STATUS_LABEL,
  LATERALITY_LABEL,
  type ExamCheckStatus,
  isValidExamStatus,
  isValidLaterality,
} from './provenance'

const CRLF = '\r\n'

/**
 * A normal entry renders "label: value" (or bare "label:" when value is
 * empty — every existing line here always shows its label even blank, so a
 * clinician sees every field exists). `raw` is the escape hatch for a line
 * that is ALREADY a complete, self-labeled string — used only by the LBP
 * v1 Batch 2.5c "임상 가설" line (`summarizeLbpWorkingHypothesisKo` already
 * returns "임상 가설: ..." whole, matching the same convention
 * `summarizeRevisitQuickCheckKo` already established for revisit recap
 * text) — never double-prefixed, and (unlike every label entry) simply
 * omitted rather than shown blank when absent.
 */
type EmrLine = { label: string; value: string } | { raw: string }

function formatEmrLine(line: EmrLine): string {
  if ('raw' in line) return line.raw
  return line.value.trim() ? `${line.label}: ${line.value.trim()}` : `${line.label}:`
}

function followUpTargetsLine(targets: FollowUpTarget[]): string {
  return targets
    .map((t) => {
      const parts = [t.label]
      if (t.baseline.trim()) parts.push(`기준 ${t.baseline.trim()}`)
      if (t.postTreatmentValue.trim()) parts.push(`직후 ${t.postTreatmentValue.trim()}`)
      return parts.join(' — ')
    })
    .join(', ')
}

function examFindingsLines(items: PhysicalExamSuggestion[]): string[] {
  return items
    // rule 2: never render a pending item as a negative -- and, per the
    // same "never fabricate a finding" principle, a status this composer
    // cannot even recognize is treated the same as NOT_YET_CHECKED: omit
    // it, never print a raw/undefined value into the EMR text.
    .filter((i) => isValidExamStatus(i.result.status) && i.result.status !== 'NOT_YET_CHECKED')
    .map((i) => {
      const status = i.result.status as ExamCheckStatus
      const lat =
        isValidLaterality(i.result.laterality) && i.result.laterality !== 'NOT_APPLICABLE'
          ? ` (${LATERALITY_LABEL[i.result.laterality]})`
          : ''
      const note = i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''
      return `${i.title}: ${EXAM_CHECK_STATUS_LABEL[status]}${lat}${note}`
    })
}

function reassessmentFindingsLines(items: ReassessmentExamItem[]): string[] {
  // rule 4: only `result` (today's), never `previous`.
  return items
    .filter((i) => isValidExamStatus(i.result.status) && i.result.status !== 'NOT_YET_CHECKED')
    .map((i) => {
      const status = i.result.status as ExamCheckStatus
      const lat =
        isValidLaterality(i.result.laterality) && i.result.laterality !== 'NOT_APPLICABLE'
          ? ` (${LATERALITY_LABEL[i.result.laterality]})`
          : ''
      const note = i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''
      return `${i.title}: ${EXAM_CHECK_STATUS_LABEL[status]}${lat}${note}`
    })
}

function nextReassessmentPlanLine(plan: NextReassessmentPlan): string {
  if (plan.status === 'UNSET') return ''
  const parts = [NEXT_REASSESSMENT_PLAN_STATUS_LABEL[plan.status]]
  if (plan.status === 'DATE' && plan.targetDate) parts.push(plan.targetDate)
  if (plan.status === 'VISIT_COUNT' && plan.afterVisitCount != null) parts.push(`${plan.afterVisitCount}번째 방문 후`)
  if (plan.note.trim()) parts.push(plan.note.trim())
  return parts.join(' — ')
}

function observationLines(items: ClinicianObservationItem[]): string[] {
  return items.filter((i) => i.checked).map((i) => `${i.title}: ${i.value.trim()}`)
}

export function buildPainWorkspaceEmrPreview(input: {
  primaryConcern: string | null
  examSuggestions: PhysicalExamSuggestion[]
  finalAssessment: PainFinalAssessment
  followUpTargets: FollowUpTarget[]
  carePlan?: PainCarePlan
  reassessment?: StructuredReassessment
  nextReassessmentPlan?: NextReassessmentPlan
  /** LBP v1 Batch 1 (G3): only ever renders a line when NOT the 'NOT_ASSESSED' default — a default/unset value is never printed as if it were a normal finding. */
  lbpDirectionalResponse?: LbpDirectionalResponse
  /** LBP v1 Batch 2.5c (G16, §11.5): renders one optional "임상 가설" line immediately before Assessment, only when `summarizeLbpWorkingHypothesisKo` returns non-null (at least one pattern is not UNJUDGED) — a fully-UNJUDGED hypothesis produces no line at all, never an empty "임상 가설:" line. */
  lbpWorkingHypothesis?: LbpWorkingHypothesis
}): string {
  const hypothesisSummary = input.lbpWorkingHypothesis ? summarizeLbpWorkingHypothesisKo(input.lbpWorkingHypothesis) : null
  const lines: EmrLine[] = [
    { label: '주호소', value: input.primaryConcern ?? '' },
    { label: '진찰 소견', value: examFindingsLines(input.examSuggestions).join('; ') },
    ...(input.lbpDirectionalResponse && input.lbpDirectionalResponse !== 'NOT_ASSESSED'
      ? [{ label: '허리 움직임 반응', value: lbpDirectionalResponseLabel(input.lbpDirectionalResponse) }]
      : []),
    // §11.5: no line at all when null (a fully-UNJUDGED hypothesis) —
    // never an empty "임상 가설:" line.
    ...(hypothesisSummary ? [{ raw: hypothesisSummary }] : []),
    { label: 'Assessment', value: input.finalAssessment.finalWorkingAssessment },
    { label: '치료 초점', value: input.finalAssessment.treatmentFocus },
    { label: '시행/예정 처치', value: input.finalAssessment.interventionPerformedOrPlanned },
    { label: '즉시 재검 대상', value: input.finalAssessment.immediateRetestTarget },
    ...(input.reassessment
      ? [
          { label: '오늘 재검 소견', value: reassessmentFindingsLines(input.reassessment.items).join('; ') },
          { label: '최종 재평가', value: input.reassessment.finalReassessmentNote },
        ]
      : []),
    ...(input.carePlan
      ? [
          { label: '치료 목표', value: input.carePlan.currentTreatmentGoal },
          { label: '재활 목표', value: input.carePlan.rehabilitationGoal },
          { label: '집에서 할 일', value: input.carePlan.homeActionPlan },
          { label: '주의사항', value: input.carePlan.activityPrecaution },
          { label: '다음 방문 확인', value: input.carePlan.nextVisitCheckItem },
        ]
      : []),
    { label: '재평가 대상', value: followUpTargetsLine(input.followUpTargets) },
    ...(input.nextReassessmentPlan
      ? [{ label: '다음 상세 재평가', value: nextReassessmentPlanLine(input.nextReassessmentPlan) }]
      : []),
  ]
  return lines.map(formatEmrLine).join(CRLF)
}

export function buildHerbalWorkspaceEmrPreview(input: {
  primaryConcern: string | null
  clinicianObservations: ClinicianObservationItem[]
  finalAssessment: HerbalFinalAssessment
  followUpTargets: FollowUpTarget[]
  carePlan?: HerbalCarePlan
  reassessment?: StructuredReassessment
  nextReassessmentPlan?: NextReassessmentPlan
}): string {
  const lines: Array<{ label: string; value: string }> = [
    { label: '상담 목적', value: input.primaryConcern ?? '' },
    { label: '설진/맥진/복진 소견', value: observationLines(input.clinicianObservations).join('; ') },
    { label: '최종 변증·병기', value: input.finalAssessment.finalPatternOrMechanism },
    { label: '치법', value: input.finalAssessment.treatmentPrinciple },
    { label: '처방/계획 메모', value: input.finalAssessment.prescriptionPlanNote },
    { label: '추적할 증상', value: input.finalAssessment.symptomsToTrack },
    ...(input.reassessment
      ? [
          { label: '오늘 재검 소견', value: reassessmentFindingsLines(input.reassessment.items).join('; ') },
          { label: '최종 재평가', value: input.reassessment.finalReassessmentNote },
        ]
      : []),
    ...(input.carePlan
      ? [
          { label: '관리 목표', value: input.carePlan.currentManagementGoal },
          { label: '처방/한약 계획', value: input.carePlan.medicationPlanNote },
          { label: '집·생활 관리', value: input.carePlan.homeLifestyleManagement },
          { label: '이상반응 안내', value: input.carePlan.adverseEffectContactInstruction },
          { label: '다음 방문 확인', value: input.carePlan.nextVisitCheckItem },
        ]
      : []),
    { label: '재평가 대상', value: followUpTargetsLine(input.followUpTargets) },
    ...(input.nextReassessmentPlan
      ? [{ label: '다음 상세 재평가', value: nextReassessmentPlanLine(input.nextReassessmentPlan) }]
      : []),
  ]
  return lines.map(({ label, value }) => (value.trim() ? `${label}: ${value.trim()}` : `${label}:`)).join(CRLF)
}
