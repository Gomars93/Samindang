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
  isFlagsUsable,
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
import { NextActionCard, isCarePlanEmpty } from './NextActionCard'
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
  // 7차 독립 리뷰 HIGH-1: flags(coreSpec.ts computeFlags)는 태블릿이 제출
  // 시점에 계산해 보내고 서버는 그대로 저장할 뿐 재검증하지 않는다 --
  // 레거시/버전 skew로 이 7개 키 중 하나라도 없으면 flags.* 전부를 신뢰할
  // 수 없다(실제로 SAFETY_01에 응급 신호가 있어도 safetyCats가 항상 빈
  // 배열이 되어 "안전이슈 없음"으로 보일 수 있다).
  const flagsUsable = isFlagsUsable(flags, r)
  const safetyCats = safetyIssueCategories(flags)
  // 7차 독립 리뷰 MEDIUM-1: isEmptyValue는 wrong-typed truthy 값(문자열/
  // 객체)도 "응답함"으로 취급한다 -- red_flag_general(SAFETY_01)은
  // required:true, showIf 없음, 항상 배열이므로 배열이 아니면 손상이다.
  const safetyAnswered = Array.isArray(r.safety_flags.red_flag_general) && r.safety_flags.red_flag_general.length > 0
  // LBP_12: only exists for the LBP regional module — recovery expectation raw score,
  // never an inferred risk/yellow-flag bucket (governing task invariant).
  // Gate on safety_flags.lbp (computed whenever IS_PRIMARY_LBP holds, which
  // covers the Additional Detailed Concern route too), not
  // routing.primary_module_detail -- that tag stays null on that route even
  // though r.modules.lbp is real data (6th independent review HIGH-1, same
  // root cause as LbpSafetyPanel's gate in DoctorView.tsx).
  const recoveryScore = r.safety_flags.lbp != null ? (r.modules.lbp?.recovery_expectation ?? null) : null

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


  return (
    <div className="workspace__pain">
      <p className="workspace__layerLabel">오늘 한눈에</p>
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
          <div
            className={`workspace__metric${!flagsUsable || safetyCats.length > 0 ? ' workspace__metric--danger' : ''}`}
          >
            <span className="workspace__metric__label">안전이슈</span>
            <strong className="workspace__metric__value">
              {!flagsUsable
                ? '확인 필요 — 계산값 읽기 불가'
                : safetyCats.length > 0
                  ? safetyCats.join(', ')
                  : safetyAnswered
                    ? '없음'
                    : '미확인'}
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

      {/*
        LAYER 1 continued -- safety. These panels are the only non-glance
        content that stays unconditionally visible: they are the answer to
        "is there a safety issue?", which the 10-second read must never
        require a click to reach. Each panel renders nothing for a region
        this record does not concern, so in practice this is one panel.
      */}
      <section className="workspace__block workspace__block--safety">
        <h3>안전 확인</h3>
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

      {/*
        LAYER 2 -- 오늘 확인할 것. Rendered ONLY when it actually holds
        something. Production suggestion lists are deliberately empty until
        clinically approved rules exist, and an always-visible empty
        "recommendations" block is exactly the kind of default-view noise
        this round removes. Nothing is lost: when a suggestion or a
        contradiction does exist, the section appears.
      */}
      {(examSuggestions.length > 0 || evidence.length > 0) && (
        <>
        <p className="workspace__layerLabel">오늘 확인할 것</p>
        <section className="workspace__block">
          {examSuggestions.length > 0 && (
            <ExamSuggestionList
              items={examSuggestions}
              onChangeItem={onChangeExamSuggestion}
              onAddToReassessment={onAddExamToReassessment}
            />
          )}
          {evidence.length > 0 && <SupportContradictionPanel items={evidence} emptyText="" />}
        </section>
        </>
      )}

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

      {/*
        LAYER 3 -- 오늘 판단·처치. The clinician's main action area, and the
        only place the default view asks for typing. Follow-up target
        selection sits immediately below it because "what am I tracking?"
        is part of the same decision, not a later form.

        오늘 재검(Structured Reassessment) stays collapsed unless it already
        holds something -- it is a real part of the loop, but presenting it
        open on every routine visit made it look mandatory.
      */}
      <p className="workspace__layerLabel">오늘 판단·처치</p>
      <PainFinalAssessmentCard value={finalAssessment} onChange={onChangeFinalAssessment} />

      <FollowUpTargetPicker
        options={PAIN_FOLLOW_UP_OPTIONS}
        selected={followUpTargets}
        onChange={onChangeFollowUpTargets}
        showPostTreatmentField
      />

      <details className="workspace__optional" open={reassessment.items.length > 0}>
        <summary>오늘 재검(Structured Reassessment) — 필요할 때 펼치기</summary>
        <StructuredReassessmentCard
          title="오늘 재검(Structured Reassessment)"
          value={reassessment}
          onChange={onChangeReassessment}
        />
      </details>

      {/*
        LAYER 4 -- 다음 액션. A compact read of what is actually recorded,
        with the full Care Plan form and the next-reassessment plan one
        click away. The forms are unchanged and still autosave; they simply
        stop occupying the default screen when nothing has been written.
      */}
      <p className="workspace__layerLabel">다음 액션</p>
      <NextActionCard
        homeAction={carePlan.homeActionPlan}
        nextCheck={carePlan.nextVisitCheckItem}
        nextReassessmentPlan={nextReassessmentPlan}
      />

      <details
        className="workspace__optional"
        open={!isCarePlanEmpty(carePlan) || nextReassessmentPlan.status !== 'UNSET'}
      >
        <summary>관리 계획 · 다음 재평가 — 자세히 입력</summary>
        <PainCarePlanCard value={carePlan} onChange={onChangeCarePlan} />
        <NextReassessmentPlanCard value={nextReassessmentPlan} onChange={onChangeNextReassessmentPlan} />
      </details>

      {/*
        One reference drawer, closed by default. Prior-visit detail, the
        patient-facing preview and the EMR preview are all real and all
        preserved -- they are simply not part of answering the five
        10-second questions, so they no longer stack under the clinical
        flow as equal-weight cards.
      */}
      <details className="workspace__optional workspace__optional--reference">
        <summary>참고 자료 (이전 방문 · 환자 전달문 · EMR 미리보기)</summary>
        <PriorVisitHistoryCard history={priorVisits} profile="pain" />
        <PatientCarePlanPreviewCard title="환자 전달용 치료 계획" text={patientCarePlanText} />
        <EmrPreviewCard text={emrText} />
        </details>
    </div>
  )
}
