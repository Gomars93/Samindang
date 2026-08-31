/**
 * Herbal Workspace content (PR #24 Phase 4, restructured Core Reduction
 * P2/P3 for the V3 shell -- same split rationale as PainWorkspace.tsx's
 * header comment: DoctorWorkspace.tsx now owns the shell's lane
 * boundaries, so this file exports `HerbalWorkspaceLane2` (오늘 한눈에 +
 * 오늘 확인할 것/핵심 병기 후보) and `HerbalWorkspaceNext` (재평가 대상/다음
 * 방문 확인 메모 + 다음 액션 + 관리 계획 disclosure + reference drawer).
 * `HerbalFinalAssessmentCard` moved out entirely -- it renders directly in
 * DoctorWorkspace.tsx's shared 판단·처치 lane (§2.4).
 *
 * Core Reduction P4 (Phase 5 Synthesis v1.2 §2.11): the reference drawer's
 * 여성·생식 정보/약물·병력 sections were dropped from here -- they
 * duplicated the fuller versions (with the derived pregnancy/postpartum
 * calc box) that already live in DoctorView.tsx's 참고 screen accordions,
 * and Phase 7 explicitly calls for resolving that duplication in favor of
 * the fuller copy. Nothing was deleted: both sections are still reachable,
 * one click away, in 참고.
 *
 * Systemic/herbal information stays prioritized first; Myungri remains
 * completely outside the clinical workspace (governing task Phase 2/4.4
 * invariant, unchanged -- see DoctorView.tsx's separate 명리 accordion).
 */
import { Field, isEmptyValue, isFlagsUsable, primaryConcernLabel, safetyIssueCategories } from '../DoctorView'
import type { DoctorPayload } from '../types'
import { PatternCandidateCard } from './PatternCandidateCard'
import { ClinicianObservationChecklist } from './ClinicianObservationChecklist'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildHerbalWorkspaceEmrPreview } from './emrPreview'
import { HERBAL_FOLLOW_UP_OPTIONS, type FollowUpTarget, type HerbalFinalAssessment, type NextReassessmentPlan } from './finalAssessment'
import type { HerbalPatternCandidate } from './patternCandidate'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { HerbalCarePlan } from './carePlan'
import { HerbalCarePlanCard } from './CarePlanCard'
import { NextActionCard, isHerbalCarePlanEmpty } from './NextActionCard'
import { PatientCarePlanPreviewCard } from './PatientCarePlanPreviewCard'
import { buildHerbalPatientCarePlanPreview } from './patientCarePlanPreview'
import { NextReassessmentPlanCard } from './NextReassessmentPlanCard'
import type { StructuredReassessment } from './reassessmentExam'
import { StructuredReassessmentCard } from './StructuredReassessmentCard'
import type { PatientHistoryResult } from './longitudinal'
import { asPriorVisitArray } from './longitudinal'
import { PriorVisitHistoryCard } from './PriorVisitHistoryCard'
import type { MicroFollowUpResponse } from './microFollowUp'
import { microFollowUpCandidatesFromPriorTargets } from './microFollowUp'
import { MicroFollowUpCard } from './MicroFollowUpCard'

export function HerbalWorkspaceLane2({
  payload,
  patternCandidates,
  onChangePatternCandidate,
  clinicianObservations,
  onChangeClinicianObservation,
  onAddObservationToReassessment,
  reassessment,
  onChangeReassessment,
  microFollowUpResponse,
  priorVisits,
  finalAssessment,
  onChangeFinalAssessment,
}: {
  payload: DoctorPayload
  patternCandidates: HerbalPatternCandidate[]
  onChangePatternCandidate: (next: HerbalPatternCandidate) => void
  clinicianObservations: ClinicianObservationItem[]
  onChangeClinicianObservation: (next: ClinicianObservationItem) => void
  onAddObservationToReassessment?: (item: ClinicianObservationItem) => void
  reassessment: StructuredReassessment
  onChangeReassessment: (next: StructuredReassessment) => void
  microFollowUpResponse?: MicroFollowUpResponse | null
  priorVisits?: PatientHistoryResult | null
  /**
   * Adopt-to-final ("최종 판단에 가져오기") still lives on this card even
   * though the Final Assessment card it writes into now renders in a
   * different lane (판단·처치, DoctorWorkspace.tsx) -- these two are passed
   * through only so that one button keeps working, never rendered here.
   */
  finalAssessment: HerbalFinalAssessment
  onChangeFinalAssessment: (next: HerbalFinalAssessment) => void
}) {
  const r = payload.responses
  const { flags } = payload
  const flagsUsable = isFlagsUsable(flags, r)
  const safetyCats = safetyIssueCategories(flags)
  const safetyAnswered =
    Array.isArray(r.safety_flags?.red_flag_general) && r.safety_flags.red_flag_general.length > 0

  const populatedSystemic = [
    { qid: 'SLEEP_01', label: '수면', value: r.modules.sleep?.problems },
    { qid: 'GI_01', label: '소화', value: r.modules.gi?.problems },
    { qid: 'BOWEL_01', label: '대변', value: r.modules.bowel?.problems },
    { qid: 'URINARY_01', label: '소변', value: r.modules.urinary?.problems },
    { qid: 'HERB_APPETITE', label: '식욕', value: r.constitution_basics.appetite_level },
    { qid: 'WEIGHT_03', label: '체중 변화', value: r.modules.weight?.recent_weight_change },
    { qid: 'HERB_THERMAL', label: '한열 경향', value: r.constitution_basics.thermal_tendency },
    { qid: 'HERB_SWEAT', label: '땀', value: r.constitution_basics.sweat_pattern },
    { qid: 'HERB_THIRST', label: '갈증', value: r.constitution_basics.thirst_level },
  ].filter((f) => !isEmptyValue(f.value as never))

  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(
    asPriorVisitArray<PatientHistoryResult['visits'][number]>(priorVisits?.visits)[0]?.herbalFollowUpTargets,
  )

  function handleAdoptToFinal(candidate: HerbalPatternCandidate) {
    const existing = finalAssessment.finalPatternOrMechanism.trim()
    const next = existing ? `${existing}\n${candidate.displayName}` : candidate.displayName
    onChangeFinalAssessment({ ...finalAssessment, finalPatternOrMechanism: next, recordedAt: new Date().toISOString() })
  }

  return (
    <div className="workspace__herbal">
      <p className="workspace__layerLabel">오늘 한눈에</p>
      <section className="workspace__hero">
        <div className="workspace__hero__head">
          <h3>한약·전신</h3>
          <span className="workspace__hero__hint">전신 상태와 한약 상담 정보를 먼저</span>
        </div>
        <div className="workspace__systemicGrid">
          {populatedSystemic.length === 0 && <p className="workspace__empty">전신 문진 응답이 없습니다.</p>}
          {populatedSystemic.map((f) => (
            <div key={f.qid} className="workspace__systemCard">
              <Field qid={f.qid} label={f.label} value={f.value as never} />
            </div>
          ))}
        </div>
        <div className="workspace__heroRow">
          <span>상담 목적</span>
          <strong>{primaryConcernLabel(r)}</strong>
        </div>
        <div className="workspace__heroRow">
          <span>안전이슈</span>
          <strong
            className={!flagsUsable || safetyCats.length > 0 ? 'workspace__heroRow__value--danger' : undefined}
          >
            {!flagsUsable
              ? '확인 필요 — 계산값 읽기 불가'
              : safetyCats.length > 0
                ? safetyCats.join(', ')
                : safetyAnswered
                  ? '없음'
                  : '미확인'}
          </strong>
        </div>
      </section>

      <MicroFollowUpCard candidates={microFollowUpCandidates} response={microFollowUpResponse ?? null} />

      <p className="workspace__layerLabel">오늘 확인할 것</p>
      <section className="workspace__block">
        <h3>오늘 확인할 것</h3>
        <ClinicianObservationChecklist
          items={clinicianObservations}
          onChangeItem={onChangeClinicianObservation}
          onAddToReassessment={onAddObservationToReassessment}
        />
      </section>

      {patternCandidates.length > 0 && (
        <section className="workspace__block">
          <h3>핵심 병기 후보</h3>
          {patternCandidates.map((c) => (
            <PatternCandidateCard
              key={c.id}
              candidate={c}
              onChange={onChangePatternCandidate}
              onAdoptToFinal={() => handleAdoptToFinal(c)}
            />
          ))}
        </section>
      )}

      {/* Core Reduction P2 (§2.6-1): StructuredReassessment moves into 레인2. */}
      <details className="workspace__optional" open={reassessment.items.length > 0}>
        <summary>오늘 재검(Structured Reassessment) — 필요할 때 펼치기</summary>
        <StructuredReassessmentCard
          title="오늘 재검(Structured Reassessment)"
          value={reassessment}
          onChange={onChangeReassessment}
        />
      </details>
    </div>
  )
}

export function HerbalWorkspaceNext({
  payload,
  clinicianObservations,
  finalAssessment,
  followUpTargets,
  onChangeFollowUpTargets,
  carePlan,
  onChangeCarePlan,
  nextReassessmentPlan,
  onChangeNextReassessmentPlan,
  reassessment,
  priorVisits,
}: {
  payload: DoctorPayload
  /** EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 레인2(확인)에 있다. */
  clinicianObservations: ClinicianObservationItem[]
  finalAssessment: HerbalFinalAssessment
  followUpTargets: FollowUpTarget[]
  onChangeFollowUpTargets: (next: FollowUpTarget[]) => void
  carePlan: HerbalCarePlan
  onChangeCarePlan: (next: HerbalCarePlan) => void
  nextReassessmentPlan: NextReassessmentPlan
  onChangeNextReassessmentPlan: (next: NextReassessmentPlan) => void
  /** EMR 미리보기 조립에만 쓰인다. */
  reassessment: StructuredReassessment
  priorVisits?: PatientHistoryResult | null
}) {
  const r = payload.responses

  const emrText = buildHerbalWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    clinicianObservations,
    finalAssessment,
    followUpTargets,
    carePlan,
    reassessment,
    nextReassessmentPlan,
  })
  const patientCarePlanText = buildHerbalPatientCarePlanPreview({ primaryConcern: primaryConcernLabel(r), carePlan })

  return (
    <div className="workspace__herbal workspace__herbal--next">
      <div className="doctor__nextPairRow">
        <div className="doctor__nextPairRow__col">
          <p className="doctor__nextPairRow__label">재평가 대상 (측정 추적)</p>
          <FollowUpTargetPicker options={HERBAL_FOLLOW_UP_OPTIONS} selected={followUpTargets} onChange={onChangeFollowUpTargets} />
        </div>
        <div className="doctor__nextPairRow__col">
          <p className="doctor__nextPairRow__label">다음 방문 확인 메모 (자유 기록)</p>
          <textarea
            className="workspace__noteInput doctor__nextVisitCheckMemo"
            rows={3}
            value={carePlan.nextVisitCheckItem}
            placeholder="원장이 직접 입력"
            onChange={(e) => onChangeCarePlan({ ...carePlan, nextVisitCheckItem: e.target.value, recordedAt: new Date().toISOString() })}
            aria-label="다음 방문 확인 메모"
          />
        </div>
      </div>

      <NextActionCard
        homeAction={carePlan.homeLifestyleManagement}
        nextCheck={carePlan.nextVisitCheckItem}
        nextReassessmentPlan={nextReassessmentPlan}
        homeActionLabel="환자가 생활에서 할 일"
      />

      <details
        className="workspace__optional"
        open={!isHerbalCarePlanEmpty(carePlan) || nextReassessmentPlan.status !== 'UNSET'}
      >
        <summary>관리 계획 · 다음 재평가 — 자세히 입력</summary>
        <HerbalCarePlanCard value={carePlan} onChange={onChangeCarePlan} />
        <NextReassessmentPlanCard value={nextReassessmentPlan} onChange={onChangeNextReassessmentPlan} />
      </details>

      <details className="workspace__optional workspace__optional--reference">
        <summary>참고 자료 (이전 방문 · 환자 전달문 · EMR 미리보기)</summary>
        {/*
          Core Reduction P4 (Phase 5 Synthesis v1.2 §2.11): 여성·생식
          정보/약물·병력은 DoctorView.tsx의 참고 화면에 이미 별도
          아코디언으로 존재한다(그쪽은 파생 계산 박스까지 포함하는 더
          완전한 버전 -- 여기서는 raw 필드만 반복했었다). 두 곳에 같은
          내용이 있던 중복을 여기서 해소하고, 더 완전한 쪽(참고 화면)
          하나로 합친다 -- 이 drawer의 나머지(이전 방문/환자 전달문/EMR
          미리보기)는 dedup 대상이 아니므로 그대로 둔다.
        */}
        <PriorVisitHistoryCard history={priorVisits} profile="herbal" />
        <PatientCarePlanPreviewCard title="환자 전달용 관리 계획" text={patientCarePlanText} />
        <EmrPreviewCard text={emrText} />
        </details>
    </div>
  )
}
