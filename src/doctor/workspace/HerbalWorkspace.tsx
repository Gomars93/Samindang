/**
 * Herbal Workspace V2 (PR #24 Phase 4): 10-second systemic summary,
 * "핵심 병기 후보" (HerbalPatternCandidate list), "오늘 반드시 확인"
 * clinician checklist (tongue/pulse/abdomen/follow-up questions), Myungri
 * kept secondary and collapsed by default, and the clinician-owned final
 * variation/mechanism + reassessment targets + EMR preview.
 *
 * Systemic/herbal information is prioritized first; Myungri is always the
 * last, collapsed section (governing task Phase 2/4.4 invariant).
 *
 * Round 2 Phase 2: pattern candidates / clinician observations / final
 * assessment / follow-up targets are CONTROLLED (owned by DoctorWorkspace).
 * Round 2 Phase 3: "여성·생식 정보" only renders when
 * `reproductive_status.derived.source` is non-null.
 *
 * Round 3 (North Star): adds Care Plan (Phase A) + patient-facing preview
 * (Phase J), NextReassessmentPlan (Phase B), Structured Reassessment
 * (Phase E, "재검 항목으로 추가" promotion from an already-recorded
 * observation), and collapsed prior-visit RAW history (Phase C). No
 * herbal-pattern-mapping or rehab-suggestion content here — those remain
 * clinical-decision blockers per the absolute safety boundary.
 */
import { Field, isEmptyValue, isFlagsUsable, primaryConcernLabel, safetyIssueCategories } from '../DoctorView'
import type { DoctorPayload } from '../types'
import { PatternCandidateCard } from './PatternCandidateCard'
import { ClinicianObservationChecklist } from './ClinicianObservationChecklist'
import { HerbalFinalAssessmentCard } from './FinalAssessmentCard'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildHerbalWorkspaceEmrPreview } from './emrPreview'
import {
  HERBAL_FOLLOW_UP_OPTIONS,
  type FollowUpTarget,
  type HerbalFinalAssessment,
  type NextReassessmentPlan,
} from './finalAssessment'
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
import { PriorVisitHistoryCard } from './PriorVisitHistoryCard'
import type { MicroFollowUpResponse } from './microFollowUp'
import { microFollowUpCandidatesFromPriorTargets } from './microFollowUp'
import { MicroFollowUpCard } from './MicroFollowUpCard'

export function HerbalWorkspace({
  payload,
  patternCandidates,
  onChangePatternCandidate,
  clinicianObservations,
  onChangeClinicianObservation,
  onAddObservationToReassessment,
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
  priorVisits,
  microFollowUpResponse,
}: {
  payload: DoctorPayload
  patternCandidates: HerbalPatternCandidate[]
  onChangePatternCandidate: (next: HerbalPatternCandidate) => void
  clinicianObservations: ClinicianObservationItem[]
  onChangeClinicianObservation: (next: ClinicianObservationItem) => void
  onAddObservationToReassessment?: (item: ClinicianObservationItem) => void
  finalAssessment: HerbalFinalAssessment
  onChangeFinalAssessment: (next: HerbalFinalAssessment) => void
  followUpTargets: FollowUpTarget[]
  onChangeFollowUpTargets: (next: FollowUpTarget[]) => void
  carePlan: HerbalCarePlan
  onChangeCarePlan: (next: HerbalCarePlan) => void
  nextReassessmentPlan: NextReassessmentPlan
  onChangeNextReassessmentPlan: (next: NextReassessmentPlan) => void
  reassessment: StructuredReassessment
  onChangeReassessment: (next: StructuredReassessment) => void
  priorVisits?: PatientHistoryResult | null
  microFollowUpResponse?: MicroFollowUpResponse | null
}) {
  const r = payload.responses
  const { flags } = payload
  // 7차 독립 리뷰 HIGH-1: flags(coreSpec.ts computeFlags)는 태블릿이 제출
  // 시점에 계산해 보내고 서버는 그대로 저장할 뿐 재검증하지 않는다 --
  // 레거시/버전 skew로 이 7개 키 중 하나라도 없으면 flags.* 전부를 신뢰할
  // 수 없다(PainWorkspace.tsx와 동일한 이유).
  const flagsUsable = isFlagsUsable(flags, r)
  const safetyCats = safetyIssueCategories(flags)
  // 7차 독립 리뷰 MEDIUM-1: isEmptyValue는 wrong-typed truthy 값도 "응답함"
  // 으로 취급한다 -- red_flag_general은 required:true, showIf 없음, 항상
  // 배열이므로 배열이 아니면 손상이다.
  // 9차 독립 리뷰 자체 회귀분석: safety_flags 최상위 키 자체가 없는 레거시
  // 레코드에서 옵셔널 체이닝 없이 접근하면 여기서 throw된다.
  const safetyAnswered =
    Array.isArray(r.safety_flags?.red_flag_general) && r.safety_flags.red_flag_general.length > 0
  // 9차 독립 리뷰 HIGH-2: `derived?.source`만으로 판정하면 derived가
  // 손상돼(재계산 안 됨/레거시) source가 stale null로 남아있을 때, 환자가
  // 실제로 WOMEN_SAFETY_01에 응답했어도(reproductive_status가 배열)
  // "여성·생식 정보" 섹션 자체가 통째로 사라진다(applicability와 손상을
  // 뭉뚱그리는 문제) -- 원본 응답이 배열로 존재하는지 직접 확인하는
  // 조건을 OR로 추가한다(postpartum/pregnancy 모듈 출처처럼 원본
  // WOMEN_SAFETY_01이 null이어도 derived.source가 채워지는 경우는
  // 기존 조건이 그대로 담당한다).
  const hasReproductiveData =
    (r.reproductive_status?.derived?.source ?? null) !== null ||
    Array.isArray(r.reproductive_status?.reproductive_status)

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


  const systemicFields: Array<{ qid: string; label: string; value: unknown }> = [
    { qid: 'SLEEP_01', label: '수면', value: r.modules.sleep?.problems },
    { qid: 'GI_01', label: '소화', value: r.modules.gi?.problems },
    { qid: 'BOWEL_01', label: '대변', value: r.modules.bowel?.problems },
    { qid: 'URINARY_01', label: '소변', value: r.modules.urinary?.problems },
    { qid: 'HERB_APPETITE', label: '식욕', value: r.constitution_basics.appetite_level },
    { qid: 'WEIGHT_03', label: '체중 변화', value: r.modules.weight?.recent_weight_change },
    { qid: 'HERB_THERMAL', label: '한열 경향', value: r.constitution_basics.thermal_tendency },
    { qid: 'HERB_SWEAT', label: '땀', value: r.constitution_basics.sweat_pattern },
    { qid: 'HERB_THIRST', label: '갈증', value: r.constitution_basics.thirst_level },
  ]
  const populatedSystemic = systemicFields.filter((f) => !isEmptyValue(f.value as never))
  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(priorVisits?.visits[0]?.herbalFollowUpTargets ?? [])

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

      {/*
        LAYER 2 -- 오늘 확인할 것. The clinician observation checklist is the
        herbal side's "what must I confirm today?", so it stays visible.
        Pattern candidates are a production-empty suggestion list until
        clinically approved rules exist, so the block appears only when it
        actually holds something rather than sitting empty on every record.
      */}
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

      {/*
        LAYER 3 -- 오늘 판단·처치, with follow-up target selection directly
        beneath it and today's reassessment collapsed unless already used.
      */}
      <p className="workspace__layerLabel">오늘 판단·처치</p>
      <HerbalFinalAssessmentCard value={finalAssessment} onChange={onChangeFinalAssessment} />

      <FollowUpTargetPicker
        options={HERBAL_FOLLOW_UP_OPTIONS}
        selected={followUpTargets}
        onChange={onChangeFollowUpTargets}
      />

      <details className="workspace__optional" open={reassessment.items.length > 0}>
        <summary>오늘 재검(Structured Reassessment) — 필요할 때 펼치기</summary>
        <StructuredReassessmentCard
          title="오늘 재검(Structured Reassessment)"
          value={reassessment}
          onChange={onChangeReassessment}
        />
      </details>

      {/* LAYER 4 -- 다음 액션, with the full forms one click away. */}
      <p className="workspace__layerLabel">다음 액션</p>
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

      {/*
        One reference drawer. 여성·생식 정보 and 약물·병력 are read-only
        patient facts already captured elsewhere in the record, so they move
        here with the rest of the reference material rather than sitting
        between the clinician's action areas.

        Myungri is NOT here and no longer appears anywhere in the clinical
        workspace: round 11 makes it a separate record surface entirely (see
        DoctorView's 명리 tab), per the standing rule that it must be
        completely separated from the clinical flow.
      */}
      <details className="workspace__optional workspace__optional--reference">
        <summary>참고 자료 (환자 배경 · 이전 방문 · 환자 전달문 · EMR 미리보기)</summary>
        {hasReproductiveData && (
          <section className="workspace__block">
            <h3>여성·생식 정보</h3>
            <div className="doctor__grid">
              <Field
                qid="WOMEN_SAFETY_01"
                label="환자가 답한 것"
                value={r.reproductive_status.reproductive_status as never}
              />
            </div>
          </section>
        )}
        <section className="workspace__block">
          <h3>약물·병력</h3>
          <div className="doctor__grid">
            <Field qid="MED_USE" value={r.medication.medication_use} />
            <Field qid="MED_TYPES" value={r.medication.medication_types} />
            <Field qid="HISTORY_01" value={r.medical_history.medical_history_flags as never} />
          </div>
        </section>
        <PriorVisitHistoryCard history={priorVisits} profile="herbal" />
        <PatientCarePlanPreviewCard title="환자 전달용 관리 계획" text={patientCarePlanText} />
        <EmrPreviewCard text={emrText} />
        </details>
    </div>
  )
}
