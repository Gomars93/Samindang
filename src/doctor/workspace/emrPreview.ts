/**
 * Workspace EMR preview composer (PR #24 Phase 9, extended round 3 Phases
 * A/B/E; reformatted to the fixed 6-key SOAP-style layout by LBP v1 Batch 4
 * §14.1).
 *
 * `src/doctor/emrSummary.ts`'s buildEmrSummary (driven by ClinicianJudgment +
 * RecorderStructuredNote) still exists and is untouched by this batch, but
 * as of the Opus delta review's defect #1 fix, `DoctorView.tsx`'s 종결
 * section no longer calls it for ANY record profile — `emrSummary.ts` is
 * kept only for `tests/emrSummary.spec.mjs`'s own direct unit coverage of
 * that module. This composer (both `buildPainWorkspaceEmrPreview` and
 * `buildHerbalWorkspaceEmrPreview` below) is now the ONLY EMR text source
 * `DoctorView.tsx`'s 종결 section copies, for every viewProfile (pain,
 * herbal, mixed — mixed concatenates the pain 6-key block and the herbal
 * block, separated by a blank line) — the exact same text `EmrPreviewCard`
 * shows, read-only, in each workspace's own 참고 자료 disclosure. One
 * composed text, two read sites, never two different ones.
 *
 * `buildPainWorkspaceEmrPreview` always emits exactly six lines, in this
 * fixed order (the standard this repository's other region docs already
 * use — see docs/HIP_V1_Evidence_Matrix_v0.1_HANDOFF.md's own "Sigma /
 * chart boundary" section and docs/ELBOW_V1_Tablet_Question_Set_v0.1.1.md's
 * "Sigma external_note Mapping"):
 *
 *   C/C  주호소             — primaryConcern
 *   O/S  발병 및 경과        — tablet onset/duration text (patient self-report)
 *                              + (있으면) 재진 경과 요약 (clinician-recorded,
 *                              still not the O line)
 *   S    주관적 소견         — tablet self-report (aggravating factors,
 *                              impact, micro follow-up quote)
 *   O    객관적 소견         — CLINICIAN-CONFIRMED ONLY (exam results, the
 *                              clinician's own directional-response
 *                              observation, today's structured re-check
 *                              results, the clinician-entered objective
 *                              motor-deficit finding)
 *   A    평가                — 임상 가설 + 최종 임상 판단 + 치료 초점 (+ 오늘
 *                              재검의 최종 재평가, when present)
 *   P    계획                — 시행/예정 처치 + 즉시 재검 대상 + Care Plan +
 *                              재평가 대상 + 다음 상세 재평가
 *
 * A key's line always renders, even when its value is empty (`C/C:` with
 * nothing after the colon) — the fixed shape is the point: pasting this
 * text always produces the same six-line skeleton. An empty value is never
 * rewritten as "없음"/"정상" (pre-existing repo-wide rule, unchanged).
 *
 * **The one absolute rule (repo-wide, every region doc states it
 * identically): the `O` line NEVER contains a patient self-reported value,
 * in any form.** Everything derived from a tablet answer (durFreq/
 * aggravating/impact text, micro follow-up) feeds `S`/`O/S` only. If a key
 * cannot be filled without putting a patient self-report string into `O`,
 * the correct behavior is to leave `O` empty for that fact, never to smuggle
 * it in — every value that reaches the `O` line here is either (a) a
 * PhysicalExamSuggestion/ReassessmentExamItem `.result`, both of which are
 * clinician-entered only (see examSuggestion.ts/reassessmentExam.ts's own
 * headers — `result.recordedAt` is "when the CLINICIAN entered this"), (b)
 * the clinician's own LbpDirectionalResponse record, or (c)
 * ClinicianJudgment.lbp_objective_motor_deficit, which judgment.ts's own
 * header states explicitly is "원장이 진찰 후 입력" and is a SEPARATE field
 * from the patient's own LBP_02 subjective-weakness answer.
 *
 * Other rules enforced here, matching src/doctor/emrSummary.ts's own rules:
 * 1. A SUGGESTED item (PhysicalExamSuggestion/HerbalPatternCandidate/
 *    RehabSuggestion) is never written into this text as if it were a
 *    clinician-confirmed finding — only OBSERVED exam results and the
 *    clinician's own FINAL_ASSESSMENT/PLAN/FOLLOW_UP_TARGET text ever
 *    appear here.
 * 2. NOT_YET_CHECKED items (and, for lbp_objective_motor_deficit, the
 *    equivalent 'UNKNOWN'/undefined "not yet assessed" states) are never
 *    listed as negative findings — they are simply omitted, never rendered
 *    as "음성"/"없음".
 * 3. Patient-reported and clinician-observed findings stay on clearly
 *    separate keys (S/O/S vs O).
 * 4. A Structured Reassessment item's PREVIOUS value is never printed as
 *    if it were today's result — only `result` (today's) feeds the
 *    "오늘 재검 소견" clause; `previous` never does.
 */
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { FollowUpTarget, HerbalFinalAssessment, PainFinalAssessment, NextReassessmentPlan } from './finalAssessment'
import {
  isValidLbpDirectionalResponse,
  lbpDirectionalResponseLabel,
  type LbpDirectionalResponse,
} from './lbpExamSuggestions'
import { summarizeLbpWorkingHypothesisKo, type LbpWorkingHypothesis } from './lbpWorkingHypothesis'
import { NEXT_REASSESSMENT_PLAN_STATUS_LABEL } from './finalAssessment'
import type { PainCarePlan, HerbalCarePlan } from './carePlan'
import type { ReassessmentExamItem, StructuredReassessment } from './reassessmentExam'
import type { ClinicianJudgment } from '../judgment'
import {
  EXAM_CHECK_STATUS_LABEL,
  LATERALITY_LABEL,
  type ExamCheckStatus,
  isValidExamStatus,
  isValidLaterality,
} from './provenance'

const CRLF = '\r\n'

/** A fixed-key line always renders "KEY: value" (or bare "KEY:" when value is empty — see file header). */
type EmrLine = { label: string; value: string }

function formatEmrLine(line: EmrLine): string {
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

/** §14.1 O "객관적 근력저하": 'UNKNOWN' and undefined both mean "not yet assessed" (matching NOT_YET_CHECKED) and are omitted — only an actually-recorded finding ('NONE'/'SEVERE_OR_PROGRESSIVE') renders. Kept local (not imported from JudgmentPanel.tsx, a React component file) since this composer stays plain-function-only. */
const LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL: Partial<Record<NonNullable<ClinicianJudgment['lbp_objective_motor_deficit']>, string>> = {
  NONE: '없음',
  SEVERE_OR_PROGRESSIVE: '심하거나 빠르게 진행함',
}

export function buildPainWorkspaceEmrPreview(input: {
  primaryConcern: string | null
  examSuggestions: PhysicalExamSuggestion[]
  finalAssessment: PainFinalAssessment
  followUpTargets: FollowUpTarget[]
  carePlan?: PainCarePlan
  reassessment?: StructuredReassessment
  nextReassessmentPlan?: NextReassessmentPlan
  /** LBP v1 Batch 1 (G3): only ever feeds O when NOT the 'NOT_ASSESSED' default — a default/unset value is never printed as if it were a normal finding. */
  lbpDirectionalResponse?: LbpDirectionalResponse
  /** LBP v1 Batch 2.5c (G16, §11.5): folded into A's first clause, only when `summarizeLbpWorkingHypothesisKo` returns non-null (at least one pattern is not UNJUDGED) — a fully-UNJUDGED hypothesis contributes nothing at all, never an empty "임상 가설:" clause. */
  lbpWorkingHypothesis?: LbpWorkingHypothesis
  /** §14.1 O/S "발병 및 경과": tablet-reported duration/frequency text (DoctorView.tsx's own `durationFrequencyText`) — patient self-report, NEVER O. */
  onsetDurationText?: string | null
  /** §14.1 O/S "(재진) 경과 요약": a REVISIT's clinician-recorded quick-check recap (e.g. `summarizeRevisitQuickCheckKo`'s output) — appended after `onsetDurationText` on the same O/S line, never split onto its own key. Still not the `O` line: O/S is the onset-and-course key, not the exam-findings key the file header's ONE ABSOLUTE RULE governs. */
  revisitRecapText?: string | null
  /** §14.1 S "주관적 소견": tablet-reported aggravating-factor text (`aggravatingSummaryText`'s own output) — patient self-report. */
  aggravatingText?: string | null
  /** §14.1 S: tablet VISIT_04_SYMPTOM_IMPACT answer, already label-formatted — patient self-report. */
  impactText?: string | null
  /** §14.1 S "micro follow-up": the patient's own MicroFollowUpResponse quote line (`microFollowUpQuoteLine`'s output) — patient self-report, same key as aggravatingText/impactText. */
  microFollowUpText?: string | null
  /** §14.1 O "객관적 근력저하": ClinicianJudgment.lbp_objective_motor_deficit — clinician-entered post-exam finding (judgment.ts: "원장이 진찰 후 입력"), a SEPARATE field from the patient's own LBP_02 self-report. Never derive this from LBP_02. */
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
}): string {
  const hypothesisSummary = input.lbpWorkingHypothesis ? summarizeLbpWorkingHypothesisKo(input.lbpWorkingHypothesis) : null

  // O (객관적 소견) — clinician-confirmed ONLY. See file header for why each
  // of these four sources is safe: all are clinician-entered/observed, never
  // a patient tablet answer.
  const oParts: string[] = []
  const examLines = examFindingsLines(input.examSuggestions)
  if (examLines.length) oParts.push(`검사 결과: ${examLines.join('; ')}`)
  // defect #8: match the defensive-validity convention `isValidExamStatus`/
  // `isValidLaterality` already use above -- an unrecognized status is
  // treated the same as the "not yet assessed" default (omitted), never
  // printed as an empty "허리 움직임 반응: " clause. Currently unreachable in
  // production (deserializeWorkspaceState already sanitizes this field via
  // isValidLbpDirectionalResponse -- see persistence.ts), but this composer
  // is an exported public function and the `O` line is this system's most
  // safety-sensitive one, so it defends itself too.
  if (
    isValidLbpDirectionalResponse(input.lbpDirectionalResponse) &&
    input.lbpDirectionalResponse !== 'NOT_ASSESSED'
  ) {
    oParts.push(`허리 움직임 반응: ${lbpDirectionalResponseLabel(input.lbpDirectionalResponse)}`)
  }
  const reassessLines = input.reassessment ? reassessmentFindingsLines(input.reassessment.items) : []
  if (reassessLines.length) oParts.push(`오늘 재검 소견: ${reassessLines.join('; ')}`)
  const motorDeficitLabel = input.lbpObjectiveMotorDeficit
    ? LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL[input.lbpObjectiveMotorDeficit]
    : undefined
  if (motorDeficitLabel) oParts.push(`객관적 근력저하: ${motorDeficitLabel}`)

  // S (주관적 소견) — patient self-report ONLY.
  const sParts: string[] = []
  if (input.aggravatingText?.trim()) sParts.push(`악화요인: ${input.aggravatingText.trim()}`)
  if (input.impactText?.trim()) sParts.push(`일상 영향: ${input.impactText.trim()}`)
  // §14.1 S "micro follow-up" (defect #7): still the patient's own quote
  // (MicroFollowUpResponse), so it stays on S alongside the two clauses
  // above -- never O.
  if (input.microFollowUpText?.trim()) sParts.push(`최근 경과(환자 응답): ${input.microFollowUpText.trim()}`)

  // A (평가) — 임상 가설(먼저) + 최종 임상 판단 + 치료 초점 + (있으면) 최종
  // 재평가. (Batch 4.1-A §15.3: ClinicianJudgment의 revised_after_exam/
  // final_treatment_axis를 A로 push하던 경로는 제거됨 — 대체 경로는
  // FinalAssessmentCard의 finalWorkingAssessment/treatmentFocus.)
  const aParts: string[] = []
  if (hypothesisSummary) aParts.push(hypothesisSummary)
  if (input.finalAssessment.finalWorkingAssessment.trim()) {
    aParts.push(`최종 임상 판단: ${input.finalAssessment.finalWorkingAssessment.trim()}`)
  }
  if (input.finalAssessment.treatmentFocus.trim()) aParts.push(`치료 초점: ${input.finalAssessment.treatmentFocus.trim()}`)
  if (input.reassessment?.finalReassessmentNote.trim()) {
    aParts.push(`최종 재평가: ${input.reassessment.finalReassessmentNote.trim()}`)
  }

  // P (계획) — 시행/예정 처치 + 즉시 재검 대상 + Care Plan + 재평가 대상 +
  // 다음 상세 재평가. (Batch 4.1-A §15.3: ClinicianJudgment.prescription_direction을
  // P로 push하던 경로는 제거됨 — 대체 경로는 FinalAssessmentCard의
  // interventionPerformedOrPlanned + CarePlanCard.)
  const pParts: string[] = []
  if (input.finalAssessment.interventionPerformedOrPlanned.trim()) {
    pParts.push(`시행/예정 처치: ${input.finalAssessment.interventionPerformedOrPlanned.trim()}`)
  }
  if (input.finalAssessment.immediateRetestTarget.trim()) {
    pParts.push(`즉시 재검 대상: ${input.finalAssessment.immediateRetestTarget.trim()}`)
  }
  if (input.carePlan) {
    if (input.carePlan.currentTreatmentGoal.trim()) pParts.push(`치료 목표: ${input.carePlan.currentTreatmentGoal.trim()}`)
    if (input.carePlan.rehabilitationGoal.trim()) pParts.push(`재활 목표: ${input.carePlan.rehabilitationGoal.trim()}`)
    if (input.carePlan.homeActionPlan.trim()) pParts.push(`집에서 할 일: ${input.carePlan.homeActionPlan.trim()}`)
    if (input.carePlan.activityPrecaution.trim()) pParts.push(`주의사항: ${input.carePlan.activityPrecaution.trim()}`)
    if (input.carePlan.nextVisitCheckItem.trim()) pParts.push(`다음 방문 확인: ${input.carePlan.nextVisitCheckItem.trim()}`)
  }
  const followUpLine = followUpTargetsLine(input.followUpTargets).trim()
  if (followUpLine) pParts.push(`재평가 대상: ${followUpLine}`)
  if (input.nextReassessmentPlan) {
    const planLine = nextReassessmentPlanLine(input.nextReassessmentPlan).trim()
    if (planLine) pParts.push(`다음 상세 재평가: ${planLine}`)
  }

  // §14.1 O/S "(재진) 경과 요약" (defect #7): appended after the tablet
  // onset/duration text on the SAME O/S line -- still not the `O` line.
  const osParts: string[] = []
  if (input.onsetDurationText?.trim()) osParts.push(input.onsetDurationText.trim())
  if (input.revisitRecapText?.trim()) osParts.push(input.revisitRecapText.trim())

  const lines: EmrLine[] = [
    { label: 'C/C', value: input.primaryConcern ?? '' },
    { label: 'O/S', value: osParts.join('; ') },
    { label: 'S', value: sParts.join('; ') },
    { label: 'O', value: oParts.join('; ') },
    { label: 'A', value: aParts.join('; ') },
    { label: 'P', value: pParts.join('; ') },
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
