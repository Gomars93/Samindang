/**
 * Pain Workspace content (PR #24 Phase 3, restructured Core Reduction P2/P3
 * for the V3 shell -- Phase 5 Synthesis v1.2 §2.1/§2.3, Phase 7 UI spec
 * §2.3). This file used to return one long JSX tree that was the entire
 * pain-profile screen; DoctorWorkspace.tsx now owns the shell's lane
 * boundaries (레인1 안전 확인 / 레인2 확인 / 판단·처치 / 다음), so this file
 * exports two plain render functions instead of a single component --
 * `PainWorkspaceLane2` (오늘 한눈에 + 오늘 확인할 것, everything that used to
 * sit above the clinician's Final Assessment) and `PainWorkspaceNext`
 * (재평가 대상/다음 방문 확인 메모 + 다음 액션 + 관리 계획 disclosure +
 * reference drawer). The Final Assessment card itself moved OUT of this
 * file entirely -- DoctorWorkspace.tsx renders `PainFinalAssessmentCard`
 * directly in the shared 판단·처치 lane (§2.4) alongside its Herbal sibling
 * and the "+ 다른 유형 입력 추가" toggle, since that lane's derived-profile
 * rendering rule applies identically to both profiles and does not belong
 * to either workspace file.
 *
 * Neither function is a React component (no hooks used, none needed) --
 * DoctorWorkspace.tsx calls them as plain functions, same as it already
 * calls the regional SafetyPanels, so nothing here changes which values
 * are safe to compute directly during render.
 *
 * No Myungri/saju/birth-time/herbal-only systemic content anywhere in this
 * file (governing task Phase 2 invariant, unchanged).
 */
import { useId, useState } from 'react'
import {
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
import { ExamSuggestionList } from './ExamSuggestionList'
import { SupportContradictionPanel } from './SupportContradictionPanel'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildPainWorkspaceEmrPreview } from './emrPreview'
import { PAIN_FOLLOW_UP_OPTIONS, type FollowUpTarget, type PainFinalAssessment, type NextReassessmentPlan } from './finalAssessment'
import type { PhysicalExamSuggestion } from './examSuggestion'
import {
  LBP_CLINICIAN_ADDABLE_EXAMS,
  LBP_DIRECTIONAL_RESPONSE_HELP,
  LBP_DIRECTIONAL_RESPONSE_OPTIONS,
  type LbpDirectionalResponse,
} from './lbpExamSuggestions'
import {
  LBP_TARGET_FUNCTION_OPTIONS,
  LBP_TARGET_FUNCTION_PLACEHOLDERS,
} from './lbpTargetFunction'
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
import { asPriorVisitArray } from './longitudinal'
import { PriorVisitHistoryCard } from './PriorVisitHistoryCard'
import type { MicroFollowUpResponse } from './microFollowUp'
import { microFollowUpCandidatesFromPriorTargets } from './microFollowUp'
import { MicroFollowUpCard } from './MicroFollowUpCard'

/**
 * LBP v1 Batch 1 (G3/G4): "허리 움직임 반응" -- the clinician's own
 * directional-response observation. Record-only (no computed judgment);
 * default 'NOT_ASSESSED' is always the first, non-highlighted chip.
 */
function LbpDirectionalResponseCard({
  value,
  onChange,
}: {
  value: LbpDirectionalResponse
  onChange: (next: LbpDirectionalResponse) => void
}) {
  const helpId = useId()
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <div className="workspace__examCard workspace__examCard--directional">
      <div className="workspace__examCard__head">
        <strong className="workspace__examCard__title">허리 움직임 반응</strong>
        <button
          type="button"
          className="workspace__helpToggle"
          aria-expanded={helpOpen}
          aria-controls={helpId}
          aria-label="허리 움직임 반응 도움말"
          title={`어떻게: ${LBP_DIRECTIONAL_RESPONSE_HELP.howKo}\n왜: ${LBP_DIRECTIONAL_RESPONSE_HELP.whyKo}`}
          onClick={() => setHelpOpen((o) => !o)}
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
      </div>
      {helpOpen && (
        <div id={helpId} className="workspace__examCard__help">
          <p>어떻게: {LBP_DIRECTIONAL_RESPONSE_HELP.howKo}</p>
          <p>왜: {LBP_DIRECTIONAL_RESPONSE_HELP.whyKo}</p>
        </div>
      )}
      <div className="workspace__examCard__statusRow" role="group" aria-label="허리 움직임 반응 선택">
        {LBP_DIRECTIONAL_RESPONSE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            className={`workspace__statusBtn${value === opt.value ? ' workspace__statusBtn--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * LBP v1 Batch 1 (G5): "확인 추가" -- the clinician's own escape hatch to
 * add a fixed exam (고관절/천장관절/SLR·슬럼프/보행/신경 기본검사) that the
 * automatic rules did not surface, e.g. because safety is not CLEAR.
 * Already-present ids are hidden; renders nothing once every addable item
 * has been added.
 */
function LbpAddExamDisclosure({
  existing,
  onAdd,
}: {
  existing: PhysicalExamSuggestion[]
  onAdd?: (id: string) => void
}) {
  if (!onAdd) return null
  const existingIds = new Set(existing.map((i) => i.id))
  const addable = LBP_CLINICIAN_ADDABLE_EXAMS.filter((e) => !existingIds.has(e.id))
  if (addable.length === 0) return null
  return (
    <details className="workspace__optional">
      <summary>확인 추가</summary>
      <div className="workspace__addExamList">
        {addable.map((e) => (
          <button key={e.id} type="button" className="workspace__addExamBtn" onClick={() => onAdd(e.id)}>
            + {e.title}
          </button>
        ))}
      </div>
    </details>
  )
}

export function PainWorkspaceLane2({
  payload,
  examSuggestions,
  onChangeExamSuggestion,
  onAddExamToReassessment,
  evidence = [],
  rehabSuggestions,
  onChangeRehabSuggestion,
  additionalConcernPromotion,
  onChangeAdditionalConcernPromotion,
  reassessment,
  onChangeReassessment,
  microFollowUpResponse,
  priorVisits,
  lbpDirectionalResponse,
  onChangeLbpDirectionalResponse,
  onAddLbpExam,
}: {
  payload: DoctorPayload
  examSuggestions: PhysicalExamSuggestion[]
  onChangeExamSuggestion: (next: PhysicalExamSuggestion) => void
  onAddExamToReassessment?: (item: PhysicalExamSuggestion) => void
  evidence?: EvidenceItem[]
  rehabSuggestions: RehabSuggestion[]
  onChangeRehabSuggestion: (next: RehabSuggestion) => void
  additionalConcernPromotion: AdditionalConcernPromotionState
  onChangeAdditionalConcernPromotion: (next: AdditionalConcernPromotionState) => void
  reassessment: StructuredReassessment
  onChangeReassessment: (next: StructuredReassessment) => void
  microFollowUpResponse?: MicroFollowUpResponse | null
  priorVisits?: PatientHistoryResult | null
  /** LBP v1 Batch 1 (G3): only meaningful when the payload is LBP — ignored (block not rendered) otherwise. */
  lbpDirectionalResponse?: LbpDirectionalResponse
  onChangeLbpDirectionalResponse?: (next: LbpDirectionalResponse) => void
  /** LBP v1 Batch 1 (G5): adds one of LBP_CLINICIAN_ADDABLE_EXAMS by id, no-op if already present. */
  onAddLbpExam?: (id: string) => void
}) {
  const r = payload.responses
  const { flags, routing } = payload
  const isLbp = r.safety_flags.lbp != null

  const durFreq = durationFrequencyText(r, routing.primary_module)
  const aggravatingText = aggravatingSummaryText(routing.primary_module, r.modules)
  const flagsUsable = isFlagsUsable(flags, r)
  const safetyCats = safetyIssueCategories(flags)
  const safetyAnswered =
    Array.isArray(r.safety_flags?.red_flag_general) && r.safety_flags.red_flag_general.length > 0
  const recoveryScore = r.safety_flags?.lbp != null ? (r.modules?.lbp?.recovery_expectation ?? null) : null
  const recoveryScoreUnreadable =
    recoveryScore != null &&
    (typeof recoveryScore !== 'number' ||
      !Number.isFinite(recoveryScore) ||
      !Number.isInteger(recoveryScore) ||
      recoveryScore < 0 ||
      recoveryScore > 10)

  const freq = frequencyField(routing.primary_module, r.modules)
  const agg = aggravatingField(routing.primary_module, r.modules)
  const additionalConcern = deriveAdditionalConcernSummary(routing)
  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(
    asPriorVisitArray<PatientHistoryResult['visits'][number]>(priorVisits?.visits)[0]?.painFollowUpTargets,
  )

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
          {(!isEmptyValue(recoveryScore) || recoveryScoreUnreadable) && (
            <div className="workspace__metric">
              <span className="workspace__metric__label">회복 기대</span>
              <strong className="workspace__metric__value">
                {recoveryScoreUnreadable ? (
                  '확인 필요(값 형식 오류)'
                ) : (
                  <>
                    {recoveryScore} / 10 <span className="workspace__rawTag">원점수</span>
                  </>
                )}
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
        LBP v1 Batch 1 (§2.3): the LBP block renders whenever the payload is
        an LBP patient (safety_flags.lbp != null) -- even when
        examSuggestions/evidence are both empty (safety not CLEAR yet, or a
        CLEAR patient with everything still unset), because the directional-
        response chip row and "확인 추가" affordance must stay reachable
        regardless. Every other pain region keeps the original
        content-driven gate untouched.
      */}
      {isLbp ? (
        <>
          <p className="workspace__layerLabel">오늘 확인할 것</p>
          <section className="workspace__block">
            <LbpDirectionalResponseCard
              value={lbpDirectionalResponse ?? 'NOT_ASSESSED'}
              onChange={onChangeLbpDirectionalResponse ?? (() => {})}
            />
            {examSuggestions.length > 0 && (
              <ExamSuggestionList
                items={examSuggestions}
                onChangeItem={onChangeExamSuggestion}
                onAddToReassessment={onAddExamToReassessment}
              />
            )}
            <LbpAddExamDisclosure existing={examSuggestions} onAdd={onAddLbpExam} />
            {evidence.length > 0 && <SupportContradictionPanel items={evidence} emptyText="" />}
          </section>
        </>
      ) : (
        (examSuggestions.length > 0 || evidence.length > 0) && (
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
        )
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
        Core Reduction P2 (Phase 5 Synthesis v1.2 §2.6-1): StructuredReassessment
        moves into 레인2 ("확인") -- it used to sit between the Final
        Assessment card and Follow-up target picker, both of which are now
        in different lanes (판단·처치 / 다음).
      */}
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

export function PainWorkspaceNext({
  payload,
  examSuggestions,
  finalAssessment,
  followUpTargets,
  onChangeFollowUpTargets,
  carePlan,
  onChangeCarePlan,
  nextReassessmentPlan,
  onChangeNextReassessmentPlan,
  reassessment,
  priorVisits,
  lbpDirectionalResponse,
}: {
  payload: DoctorPayload
  /** EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 레인2(확인)에 있다. */
  examSuggestions: PhysicalExamSuggestion[]
  finalAssessment: PainFinalAssessment
  followUpTargets: FollowUpTarget[]
  onChangeFollowUpTargets: (next: FollowUpTarget[]) => void
  carePlan: PainCarePlan
  onChangeCarePlan: (next: PainCarePlan) => void
  nextReassessmentPlan: NextReassessmentPlan
  onChangeNextReassessmentPlan: (next: NextReassessmentPlan) => void
  /** EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 레인2(확인)에 있다. */
  reassessment: StructuredReassessment
  priorVisits?: PatientHistoryResult | null
  /** LBP v1 Batch 1 (G3): EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 레인2(확인)에 있다. */
  lbpDirectionalResponse?: LbpDirectionalResponse
}) {
  const r = payload.responses
  const isLbp = r.safety_flags.lbp != null
  const emrText = buildPainWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    examSuggestions,
    finalAssessment,
    followUpTargets,
    carePlan,
    reassessment,
    nextReassessmentPlan,
    lbpDirectionalResponse,
  })
  const patientCarePlanText = buildPainPatientCarePlanPreview({ primaryConcern: primaryConcernLabel(r), carePlan })
  const followUpOptions = isLbp ? [...LBP_TARGET_FUNCTION_OPTIONS, ...PAIN_FOLLOW_UP_OPTIONS] : PAIN_FOLLOW_UP_OPTIONS
  const followUpGroups = isLbp
    ? [{ label: '목표 기능(다음 방문에 같은 동작으로 비교)', ids: LBP_TARGET_FUNCTION_OPTIONS.map((o) => o.id) }]
    : undefined

  return (
    <div className="workspace__pain workspace__pain--next">
      {/*
        Phase 7 §2.5: 재평가 대상(측정 추적)과 다음 방문 확인 메모(자유
        기록)를 관계 라벨과 함께 나란히 배치한다 (게이트 B-2, delta:
        nextVisitCheckItem 제거 철회 -- 필드는 CarePlanCard 안에도 그대로
        남는다, 이건 추가 배치일 뿐 대체가 아니다).
      */}
      <div className="doctor__nextPairRow">
        <div className="doctor__nextPairRow__col">
          <p className="doctor__nextPairRow__label">재평가 대상 (측정 추적)</p>
          <FollowUpTargetPicker
            options={followUpOptions}
            selected={followUpTargets}
            onChange={onChangeFollowUpTargets}
            showPostTreatmentField
            groups={followUpGroups}
            placeholders={isLbp ? LBP_TARGET_FUNCTION_PLACEHOLDERS : undefined}
          />
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

      <details className="workspace__optional workspace__optional--reference">
        <summary>참고 자료 (이전 방문 · 환자 전달문 · EMR 미리보기)</summary>
        <PriorVisitHistoryCard history={priorVisits} profile="pain" />
        <PatientCarePlanPreviewCard title="환자 전달용 치료 계획" text={patientCarePlanText} />
        <EmrPreviewCard text={emrText} />
        </details>
    </div>
  )
}
