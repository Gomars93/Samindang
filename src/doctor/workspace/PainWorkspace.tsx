/**
 * Pain Workspace V2 (PR #24 Phase 3): 10-second summary, "지금 확인할 것"
 * (PhysicalExamSuggestion list), the existing regional SafetyPanels reused
 * unchanged, a support/contradiction panel, clinician exam input (folded
 * into the exam suggestion cards themselves), and the clinician-owned
 * Final Assessment + reassessment targets + EMR preview.
 *
 * No Myungri/saju/birth-time/herbal-only systemic content anywhere in this
 * component (governing task Phase 2 invariant).
 *
 * Round 2 Phase 2: exam results / final assessment / follow-up targets are
 * CONTROLLED (owned by DoctorWorkspace, which debounce-saves them to the
 * server) rather than local useState.
 *
 * Round 3 (North Star: Treatment -> Care Plan/Rehab -> Micro Follow-up ->
 * Structured Reassessment -> Plan Update): adds, after the clinician's
 * Final Assessment (Phase K ordering -- decision-support stays first
 * viewport, plan/history sits after judgment) --
 *  - a compact Additional Concern card (Phase H, presentation only)
 *  - Rehab suggestions (Phase I, empty in production)
 *  - Structured Reassessment (Phase E, today's recheck always starts
 *    NOT_YET_CHECKED, previous value shown as a raw fact only)
 *  - Care Plan (Phase A) + its patient-facing preview (Phase J)
 *  - NextReassessmentPlan (Phase B, distinct from ordinary follow-up
 *    targets)
 *  - collapsed prior-visit RAW history (Phase C)
 */
import {
  AnkleFootSafetyPanel,
} from '../AnkleFootSafetyPanel'
import { TmjSafetyPanel } from '../TmjSafetyPanel'
import { HipSafetyPanel } from '../HipSafetyPanel'
import {
  ElbowSafetyPanel,
  KneeSafetyPanel,
  LbpSafetyPanel,
  NeckSafetyPanel,
  ShoulderSafetyPanel,
  WristHandSafetyPanel,
  aggravatingField,
  aggravatingSummaryText,
  durationFrequencyText,
  frequencyField,
  isEmptyValue,
  primaryConcernLabel,
  safetyIssueCategories,
} from '../DoctorView'
import { Field } from '../DoctorView'
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { ExamSuggestionList } from './ExamSuggestionList'
import { SupportContradictionPanel } from './SupportContradictionPanel'
import { PainFinalAssessmentCard } from './FinalAssessmentCard'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildPainWorkspaceEmrPreview } from './emrPreview'
import {
  PAIN_FOLLOW_UP_OPTIONS,
  type FollowUpTarget,
  type PainFinalAssessment,
  type NextReassessmentPlan,
} from './finalAssessment'
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { EvidenceItem } from './supportEngine'
import type { PainCarePlan } from './carePlan'
import { PainCarePlanCard } from './CarePlanCard'
import { PatientCarePlanPreviewCard } from './PatientCarePlanPreviewCard'
import { buildPainPatientCarePlanPreview } from './patientCarePlanPreview'
import { NextReassessmentPlanCard } from './NextReassessmentPlanCard'
import type { StructuredReassessment } from './reassessmentExam'
import { StructuredReassessmentCard } from './StructuredReassessmentCard'
import type { RehabSuggestion } from './rehabSuggestion'
import { RehabSuggestionCard } from './RehabSuggestionCard'
import type { AdditionalConcernPromotionState } from './additionalConcern'
import { deriveAdditionalConcernSummary } from './additionalConcern'
import { AdditionalConcernCard } from './AdditionalConcernCard'
import { ClinicalLoopStatusBar, type ClinicalLoopStatusItem } from './ClinicalLoopStatus'
import type { PatientHistoryResult } from './longitudinal'
import { PriorVisitHistoryCard } from './PriorVisitHistoryCard'
import type { MicroFollowUpResponse } from './microFollowUp'
import { microFollowUpCandidatesFromPriorTargets } from './microFollowUp'
import { MicroFollowUpCard } from './MicroFollowUpCard'

export function PainWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  examSuggestions,
  onChangeExamSuggestion,
  onAddExamToReassessment,
  evidence = [],
  finalAssessment,
  onChangeFinalAssessment,
  followUpTargets,
  onChangeFollowUpTargets,
  carePlan,
  onChangeCarePlan,
  nextReassessmentPlan,
  onChangeNextReassessmentPlan,
  reassessment,
  onChangeReassessment,
  rehabSuggestions,
  onChangeRehabSuggestion,
  additionalConcernPromotion,
  onChangeAdditionalConcernPromotion,
  priorVisits,
  microFollowUpResponse,
}: {
  payload: DoctorPayload
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
  shoulderObjectiveCuffWeakness?: ClinicianJudgment['shoulder_objective_cuff_weakness']
  examSuggestions: PhysicalExamSuggestion[]
  onChangeExamSuggestion: (next: PhysicalExamSuggestion) => void
  onAddExamToReassessment?: (item: PhysicalExamSuggestion) => void
  evidence?: EvidenceItem[]
  finalAssessment: PainFinalAssessment
  onChangeFinalAssessment: (next: PainFinalAssessment) => void
  followUpTargets: FollowUpTarget[]
  onChangeFollowUpTargets: (next: FollowUpTarget[]) => void
  carePlan: PainCarePlan
  onChangeCarePlan: (next: PainCarePlan) => void
  nextReassessmentPlan: NextReassessmentPlan
  onChangeNextReassessmentPlan: (next: NextReassessmentPlan) => void
  reassessment: StructuredReassessment
  onChangeReassessment: (next: StructuredReassessment) => void
  rehabSuggestions: RehabSuggestion[]
  onChangeRehabSuggestion: (next: RehabSuggestion) => void
  additionalConcernPromotion: AdditionalConcernPromotionState
  onChangeAdditionalConcernPromotion: (next: AdditionalConcernPromotionState) => void
  priorVisits?: PatientHistoryResult | null
  microFollowUpResponse?: MicroFollowUpResponse | null
}) {
  const r = payload.responses
  const { flags, routing } = payload

  const durFreq = durationFrequencyText(r, routing.primary_module)
  const aggravatingText = aggravatingSummaryText(routing.primary_module, r.modules)
  const safetyCats = safetyIssueCategories(flags)
  const safetyAnswered = !isEmptyValue(r.safety_flags.red_flag_general)
  // LBP_12: only exists for the LBP regional module — recovery expectation raw score,
  // never an inferred risk/yellow-flag bucket (governing task invariant).
  const recoveryScore = routing.primary_module_detail === 'LBP' ? r.modules.lbp.recovery_expectation : null

  const freq = frequencyField(routing.primary_module, r.modules)
  const agg = aggravatingField(routing.primary_module, r.modules)

  const additionalConcern = deriveAdditionalConcernSummary(routing)
  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(priorVisits?.visits[0]?.painFollowUpTargets ?? [])

  const emrText = buildPainWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    examSuggestions,
    finalAssessment,
    followUpTargets,
    carePlan,
    reassessment,
    nextReassessmentPlan,
  })

  const patientCarePlanText = buildPainPatientCarePlanPreview({ primaryConcern: primaryConcernLabel(r), carePlan })

  const loopStatus: ClinicalLoopStatusItem[] = [
    { key: 'assessment', label: '최종 판단 입력', done: finalAssessment.recordedAt !== null },
    { key: 'plan', label: '치료 계획 입력', done: carePlan.recordedAt !== null },
    { key: 'followup', label: '재평가 대상 선택', done: followUpTargets.length > 0 },
    { key: 'reassessPlan', label: '다음 재평가 계획', done: nextReassessmentPlan.status !== 'UNSET' },
  ]

  return (
    <div className="workspace__pain">
      <section className="workspace__hero">
        <div className="workspace__hero__head">
          <h3>통증 진료</h3>
          <span className="workspace__hero__hint">통증 환자에게 필요한 정보만 우선</span>
        </div>
        <div className="workspace__heroGrid">
          <div className="workspace__metric workspace__metric--primary">
            <span className="workspace__metric__label">주호소</span>
            <strong className="workspace__metric__value">{primaryConcernLabel(r)}</strong>
          </div>
          {durFreq && (
            <div className="workspace__metric">
              <span className="workspace__metric__label">기간</span>
              <strong className="workspace__metric__value">{durFreq}</strong>
            </div>
          )}
          {!isEmptyValue(recoveryScore) && (
            <div className="workspace__metric">
              <span className="workspace__metric__label">회복 기대</span>
              <strong className="workspace__metric__value">
                {String(recoveryScore)} / 10 <span className="workspace__rawTag">원점수</span>
              </strong>
            </div>
          )}
          <div className={`workspace__metric${safetyCats.length > 0 ? ' workspace__metric--danger' : ''}`}>
            <span className="workspace__metric__label">안전이슈</span>
            <strong className="workspace__metric__value">
              {safetyCats.length > 0 ? safetyCats.join(', ') : safetyAnswered ? '없음' : '미확인'}
            </strong>
          </div>
        </div>
        {(aggravatingText || freq || agg) && (
          <div className="workspace__heroRows">
            {aggravatingText && (
              <div className="workspace__heroRow">
                <span>핵심 악화·유발요인</span>
                <strong>{aggravatingText}</strong>
              </div>
            )}
            {freq && (
              <div className="workspace__heroRow">
                <span>빈도</span>
                <Field qid={freq.qid} value={freq.value} />
              </div>
            )}
            {agg && !aggravatingText && (
              <div className="workspace__heroRow">
                <span>악화 요인 상세</span>
                <Field qid={agg.qid} value={agg.value} />
              </div>
            )}
          </div>
        )}
      </section>

      <MicroFollowUpCard candidates={microFollowUpCandidates} response={microFollowUpResponse ?? null} />

      <section className="workspace__block">
        <h3>기존 통증 모듈 안전패널</h3>
        <p className="workspace__block__hint">
          현재 계산된 flag와 안전 잠금 의미를 그대로 표시합니다 — 새 cutoff나 해석을 추가하지 않습니다.
        </p>
        <LbpSafetyPanel payload={payload} lbpObjectiveMotorDeficit={lbpObjectiveMotorDeficit} />
        <HipSafetyPanel payload={payload} />
        <NeckSafetyPanel payload={payload} />
        <ShoulderSafetyPanel payload={payload} shoulderObjectiveCuffWeakness={shoulderObjectiveCuffWeakness} />
        <KneeSafetyPanel payload={payload} />
        <ElbowSafetyPanel payload={payload} />
        <WristHandSafetyPanel payload={payload} />
        <AnkleFootSafetyPanel payload={payload} />
        <TmjSafetyPanel payload={payload} />
      </section>

      <section className="workspace__block">
        <h3>지금 확인할 것</h3>
        <ExamSuggestionList
          items={examSuggestions}
          onChangeItem={onChangeExamSuggestion}
          onAddToReassessment={onAddExamToReassessment}
        />
      </section>

      <section className="workspace__block">
        <h3>확인 필요 / 서로 맞지 않는 정보</h3>
        <SupportContradictionPanel items={evidence} emptyText="현재 확인된 지지/반증/미확인 항목이 없습니다." />
      </section>

      {additionalConcern && (
        <AdditionalConcernCard
          summary={additionalConcern}
          promotion={additionalConcernPromotion}
          onChangePromotion={onChangeAdditionalConcernPromotion}
        />
      )}

      {rehabSuggestions.length > 0 && (
        <section className="workspace__block">
          <h3>재활/운동 제안</h3>
          {rehabSuggestions.map((s) => (
            <RehabSuggestionCard key={s.id} suggestion={s} onChange={onChangeRehabSuggestion} />
          ))}
        </section>
      )}

      <PainFinalAssessmentCard value={finalAssessment} onChange={onChangeFinalAssessment} />

      <StructuredReassessmentCard title="오늘 재검(Structured Reassessment)" value={reassessment} onChange={onChangeReassessment} />

      <ClinicalLoopStatusBar items={loopStatus} />

      <PainCarePlanCard value={carePlan} onChange={onChangeCarePlan} />

      <FollowUpTargetPicker
        options={PAIN_FOLLOW_UP_OPTIONS}
        selected={followUpTargets}
        onChange={onChangeFollowUpTargets}
        showPostTreatmentField
      />

      <NextReassessmentPlanCard value={nextReassessmentPlan} onChange={onChangeNextReassessmentPlan} />

      <PriorVisitHistoryCard history={priorVisits} profile="pain" />

      <PatientCarePlanPreviewCard title="환자 전달용 치료 계획" text={patientCarePlanText} />

      <EmrPreviewCard text={emrText} />
    </div>
  )
}
