/**
 * Pain Workspace content (PR #24 Phase 3, restructured Core Reduction P2/P3
 * for the V3 shell -- Phase 5 Synthesis v1.2 §2.1/§2.3, Phase 7 UI spec
 * §2.3). This file used to return one long JSX tree that was the entire
 * pain-profile screen; DoctorWorkspace.tsx now owns the shell's lane
 * boundaries (레인1 안전 확인 / 레인2 확인 / 판단·처치 / 다음), so this file
 * exports three plain render functions instead of a single component --
 * `PainWorkspaceLane2` (오늘 한눈에 + 오늘 확인할 것, everything that used to
 * sit above the clinician's Final Assessment), `PainExerciseSection`
 * (LBP v1 Batch 2 exercise candidates -- see below), and `PainWorkspaceNext`
 * (재평가 대상/다음 방문 확인 메모 + 다음 액션 + 관리 계획 disclosure +
 * reference drawer). The Final Assessment card itself moved OUT of this
 * file entirely -- DoctorWorkspace.tsx renders `PainFinalAssessmentCard`
 * directly in the shared 판단·처치 lane (§2.4) alongside its Herbal sibling
 * and the "+ 다른 유형 입력 추가" toggle, since that lane's derived-profile
 * rendering rule applies identically to both profiles and does not belong
 * to either workspace file.
 *
 * LBP v1 Batch 2 §8.2-1(a) integration correction: the exercise
 * candidate/adoption section (재활/운동 제안 + 확인하면 시작 가능) used to
 * render inside `PainWorkspaceLane2`, i.e. inside 레인2(확인) -- BEFORE the
 * clinician's Working Hypothesis/치료 방향/최종 판단. The PO's canonical
 * pain route (architecture doc §8.1 C6) puts exercise selection AFTER the
 * final assessment, in 판단·처치. `PainExerciseSection` below is that block
 * extracted verbatim (including the pre-existing synthetic-scenario
 * rendering path -- there is exactly one render site now, never two),
 * exported so DoctorWorkspace.tsx can place it immediately after
 * `PainFinalAssessmentCard` in the shared judgment lane. Same props as
 * before; only the call site moved.
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
import { answerLabel } from '../labels'
import type { ClinicianJudgment } from '../judgment'
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
import type { LbpWorkingHypothesis } from './lbpWorkingHypothesis'
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
import {
  LBP_EXERCISE_STAGE_LABEL_KO,
  LBP_STAGE_0_GUIDANCE_KO,
  type LbpExerciseStage,
  type LbpStageSuggestion,
} from './lbpExerciseStage'
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

/*
 * 2026-09-05 (원장 결정): 준비조건 확인 UI(`LbpCapabilityStatusButtons`,
 * `LbpAwaitingCapabilitySection`)를 제거했다.
 *
 * 원장 지적: "준비조건 15개를 내가 육안으로 빠르게 처리하면 되는 거 아닌가?"
 * — 맞다. 그 탭이 만들던 기록은 EMR·재진·환자 안내문 어디에도 도달하지
 * 않았고(확인함), 유일한 효과가 "시스템이 목록을 열어주는 것"이었다. 그리고
 * 원장이 어떤 운동을 **채택하는 행위 자체가 이미 그 운동의 시작 조건을
 * 판단했다는 뜻**이다 — 채택 전에 같은 것을 또 묻고 있었다.
 *
 * 대체 경로: 각 후보 카드의 첫 근거 소견에 `startingCriteriaKo`(한국어 원문)가
 * **시작 기준**으로 표시된다(`lbpExerciseRecommendation.ts`의
 * `candidateToRehabSuggestion`). 원장은 그것을 읽고 환자를 보고 고른다.
 * 자세한 이유는 `lbpExerciseEligibility.ts` 헤더와 `DECISIONS.md` 2026-09-05
 * "준비조건 게이트 제거" 항목.
 */

export function PainWorkspaceLane2({
  payload,
  examSuggestions,
  onChangeExamSuggestion,
  onAddExamToReassessment,
  evidence = [],
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

/**
 * LBP v1 Batch 2 exercise candidate/adoption section, extracted out of
 * `PainWorkspaceLane2` per architecture §8.2-1(a) so DoctorWorkspace.tsx can
 * place it in the shared 판단·처치 lane, immediately after
 * `PainFinalAssessmentCard`, instead of inside 레인2(확인) -- the PO's
 * canonical route is 확인 → Working Hypothesis → 치료 방향 → Exercise
 * Eligibility → 운동, not before the clinician's final assessment. Same
 * render logic/props as before the move (including the pre-existing
 * synthetic-scenario `재활/운동 제안` path -- exactly one render site).
 */
/** Opus delta review defect 4 (§2.2): 3 candidate cards visible, the rest behind a "더 보기 (N)" disclosure — nothing is ever dropped, so there is no tie/cutoff problem to solve. */
const LBP_STAGE_OPTIONS: readonly LbpExerciseStage[] = [0, 1, 2, 3]

/**
 * 2026-09-05: 운동 단계 카드 — 제안(`suggestLbpExerciseStage`) + 원장 확정.
 *
 * "adopt, never automatic": 제안은 저장되지 않고 매 렌더 재계산된다. 저장되는
 * 것은 원장이 누른 확정값(`WorkspaceState.lbpConfirmedStage`)뿐이다. 확정
 * 없이는 단계 필터도 준비조건 추정도 켜지지 않는다.
 *
 * 0단계 요구사항(`docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.4.md` §2): 0단계 옆에
 * **"1단계로 올리기"가 한 번의 조작**으로 있어야 한다. 안전한 쪽이 기본값이고
 * 올리는 것이 의식적 행위다. 그래서 "제안대로 확정"은 1탭, 0단계에서
 * 올리기도 1탭이다.
 */
function LbpStageCard({
  suggestion,
  confirmedStage,
  onSetConfirmedStage,
}: {
  suggestion: LbpStageSuggestion
  confirmedStage: LbpExerciseStage | null
  onSetConfirmedStage: (next: LbpExerciseStage | null) => void
}) {
  const suggested = suggestion.suggestedStage
  const showGuidance = confirmedStage === 0 || (confirmedStage === null && suggested === 0)
  return (
    <section className="workspace__block" aria-labelledby="lbp-stage-h3">
      <h3 id="lbp-stage-h3">운동 단계</h3>
      <div className="workspace__examCard">
        <p className="workspace__examCard__reason">
          <strong>제안</strong>{' '}
          {suggested === null
            ? '단계를 제안하지 않습니다 — 원장이 직접 정해주세요.'
            : LBP_EXERCISE_STAGE_LABEL_KO[suggested]}
          {suggested !== null &&
            suggestion.baseStage !== null &&
            suggestion.baseStage !== suggested &&
            ` (일상지장도만 보면 ${LBP_EXERCISE_STAGE_LABEL_KO[suggestion.baseStage]} → 낮춤)`}
        </p>
        <ul className="workspace__candidateFacts workspace__candidateFacts--support">
          {suggestion.reasons.map((r, i) => (
            <li key={i} data-reason-kind={r.kind}>
              {r.text}
            </li>
          ))}
        </ul>
        {showGuidance && <p className="workspace__block__hint">{LBP_STAGE_0_GUIDANCE_KO}</p>}
        <div className="workspace__examCard__statusRow" role="group" aria-label="운동 단계 확정">
          {LBP_STAGE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={confirmedStage === s}
              className={`workspace__statusBtn${confirmedStage === s ? ' workspace__statusBtn--active' : ''}`}
              onClick={() => onSetConfirmedStage(confirmedStage === s ? null : s)}
            >
              {`${s}단계${suggested === s ? ' (제안)' : ''}`}
            </button>
          ))}
        </div>
        {confirmedStage === null && suggested !== null && (
          <button type="button" className="workspace__stageBtn" onClick={() => onSetConfirmedStage(suggested)}>
            {`제안대로 확정 → ${LBP_EXERCISE_STAGE_LABEL_KO[suggested]}`}
          </button>
        )}
        {confirmedStage === 0 && (
          <button type="button" className="workspace__stageBtn" onClick={() => onSetConfirmedStage(1)}>
            1단계로 올리기
          </button>
        )}
        {confirmedStage === null ? (
          <p className="workspace__block__hint">
            단계를 확정하면 그 단계 이하의 운동만 후보로 좁혀집니다. 확정하지 않으면 모든 단계의 운동이 후보로
            나옵니다 — 각 후보 카드의 &quot;시작 기준&quot;을 보고 직접 고르시면 됩니다.
          </p>
        ) : (
          <p className="workspace__block__hint">
            확정 {LBP_EXERCISE_STAGE_LABEL_KO[confirmedStage]}. 같은 버튼을 다시 누르면 미확정으로 돌아갑니다.
          </p>
        )}
      </div>
    </section>
  )
}

const VISIBLE_REHAB_CANDIDATE_COUNT = 3

export function PainExerciseSection({
  isLbp,
  rehabSuggestions,
  onChangeRehabSuggestion,
  onAdoptRehabSuggestionToCarePlan,
  lbpRecommendationBlockedMessageKo,
  lbpTreatmentSafetyLockedReasonKo,
  lbpTargetFunctionGap,
  lbpNeuroUnrecorded = false,
  lbpStageSuggestion,
  lbpConfirmedStage = null,
  onSetLbpConfirmedStage,
}: {
  /** LBP v1 Batch 1: only an LBP record gets the safety-lock/capability/empty-state extras below -- every other pain region renders exactly the plain SYNTHETIC-preview candidate list it always has. */
  isLbp: boolean
  /** 2026-09-05: 오늘 문진 답변으로 계산한 단계 제안(매 렌더 재계산, 저장 안 됨). LBP 기록에서만 전달된다. */
  lbpStageSuggestion?: LbpStageSuggestion | null
  /** 2026-09-05: `WorkspaceState.lbpConfirmedStage` — 원장 확정값. null = 미확정. */
  lbpConfirmedStage?: LbpExerciseStage | null
  /** 2026-09-05: 단계 확정/해제 setter. 없으면 단계 카드를 렌더하지 않는다(읽기 전용 미리보기 경로). */
  onSetLbpConfirmedStage?: (next: LbpExerciseStage | null) => void
  rehabSuggestions: RehabSuggestion[]
  onChangeRehabSuggestion: (next: RehabSuggestion) => void
  /** LBP v1 Batch 2 (G10/RF-8): "adopt, never automatic" into PainCarePlan.homeActionPlan. */
  onAdoptRehabSuggestionToCarePlan?: (suggestion: RehabSuggestion) => void
  /** LBP v1 Batch 2 (RF-3b): non-null/non-empty means the exercise section renders this one line instead of any candidate cards. */
  lbpRecommendationBlockedMessageKo?: string | null
  /** LBP v1 Batch 2 (CD-2): non-null/non-empty disables every candidate's adopt action (never the card) with this reason. */
  lbpTreatmentSafetyLockedReasonKo?: string | null
  /** LBP v1 Batch 2 §8.2-1(c): non-null only when the candidate list is empty because no (matching) target function is selected yet. */
  lbpTargetFunctionGap?: 'NONE_SELECTED' | 'CUSTOM_ONLY' | null
  /**
   * 2026-09-05: 신경학적 상태 미기록 때문에 후보 대부분이 보류된 상태
   * (`LbpRecommendationResult.neuroUnrecorded`). 이유 없이 빈 목록을 보여주지
   * 않기 위해 한 줄 안내를 띄운다 — 원장이 1탭으로 해소할 수 있는 유일한 사유다.
   */
  lbpNeuroUnrecorded?: boolean
}) {
  // 2026-09-05: 단계 카드는 아래 어느 분기(안전 블록·0단계 블록·목표기능
  // 미선택)보다도 먼저, 항상 렌더된다 — 0단계로 블록이 접혀 있을 때 원장이
  // 여기서 1단계로 올릴 수 있어야 하기 때문이다.
  const stageCard =
    isLbp && lbpStageSuggestion && onSetLbpConfirmedStage ? (
      <LbpStageCard
        suggestion={lbpStageSuggestion}
        confirmedStage={lbpConfirmedStage}
        onSetConfirmedStage={onSetLbpConfirmedStage}
      />
    ) : null

  if (isLbp && lbpRecommendationBlockedMessageKo) {
    return (
      <>
        {stageCard}
        <section className="workspace__block">
          <h3>재활/운동 제안</h3>
          <p className="workspace__block__hint">{lbpRecommendationBlockedMessageKo}</p>
        </section>
      </>
    )
  }

  // (c): both candidate lists are empty purely because no (matching) target
  // function has been picked yet -- distinct from "picked, but genuinely no
  // eligible exercise", which is out of this correction's scope and simply
  // renders nothing, same as before.
  if (isLbp && lbpTargetFunctionGap && rehabSuggestions.length === 0) {
    return (
      <>
        {stageCard}
        <section className="workspace__block">
          <h3>재활/운동 제안</h3>
          <p className="workspace__block__hint">
            목표 기능을 먼저 고르면 그 기능에 맞는 운동 후보가 나타납니다 — &apos;다음&apos; 레인의 재평가 대상에서
            선택하세요.
            {lbpTargetFunctionGap === 'CUSTOM_ONLY' &&
              ' "기타 목표 동작"은 자유 기록이라 대응하는 카탈로그 운동이 없습니다 — 목록에 있는 목표 기능도 함께 골라주세요.'}
          </p>
        </section>
      </>
    )
  }

  const visibleSuggestions = rehabSuggestions.slice(0, VISIBLE_REHAB_CANDIDATE_COUNT)
  const moreSuggestions = rehabSuggestions.slice(VISIBLE_REHAB_CANDIDATE_COUNT)

  const renderCard = (s: RehabSuggestion) => (
    <RehabSuggestionCard
      key={s.id}
      suggestion={s}
      onChange={onChangeRehabSuggestion}
      onAdoptToCarePlan={onAdoptRehabSuggestionToCarePlan ? () => onAdoptRehabSuggestionToCarePlan(s) : undefined}
      adoptDisabledReasonKo={isLbp ? (lbpTreatmentSafetyLockedReasonKo ?? undefined) : undefined}
    />
  )

  return (
    <>
      {stageCard}
      {/*
        Opus delta review defect 9 (CD-2): rendered once here, above the
        candidate cards -- a treatment-safety-locked patient must see why
        adoption is blocked before scanning the cards themselves.
      */}
      {isLbp && lbpTreatmentSafetyLockedReasonKo && (
        <p className="workspace__block__hint">{lbpTreatmentSafetyLockedReasonKo}</p>
      )}
      {isLbp && lbpNeuroUnrecorded && (
        <p className="workspace__block__hint">
          신경학적 이상 소견(레인2 &quot;객관적 검사 소견&quot;)을 먼저 기록하면 나머지 운동 후보가 나타납니다 — 미확인을
          &quot;이상 없음&quot;으로 가정하지 않습니다.
        </p>
      )}
      {rehabSuggestions.length > 0 && (
        <section className="workspace__block">
          <h3>재활/운동 제안</h3>
          {visibleSuggestions.map(renderCard)}
          {moreSuggestions.length > 0 && (
            <details className="workspace__optional">
              <summary>더 보기 ({moreSuggestions.length})</summary>
              {moreSuggestions.map(renderCard)}
            </details>
          )}
        </section>
      )}
    </>
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
  lbpWorkingHypothesis,
  lbpObjectiveMotorDeficit,
  microFollowUpText,
  copyHint,
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
  /** LBP v1 Batch 2.5c (G16): EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 판단·처치 레인(DoctorWorkspace.tsx)에 있다. */
  lbpWorkingHypothesis?: LbpWorkingHypothesis
  /** LBP v1 Batch 4 (§14.1, EMR O "객관적 근력저하"): EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 레인2(확인)의 ObjectiveExamFindingsCard. */
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
  /** Opus delta review defect #7 (§14.1 S "micro follow-up"): the patient's own MicroFollowUpResponse quote line -- EMR 미리보기 조립에만 쓰인다, patient self-report, S only. */
  microFollowUpText?: string | null
  /** Opus closing review C-5: forwarded to EmrPreviewCard's `copyHint` -- the caller decides whether 종결 is actually on screen for this record; omitted (no hint rendered) when it is not. */
  copyHint?: string
}) {
  const r = payload.responses
  const { routing } = payload
  const isLbp = r.safety_flags.lbp != null
  // LBP v1 Batch 4 (§14.1 O/S·S): patient tablet self-report only -- never
  // reaches the O key (see emrPreview.ts's own header for the O boundary).
  const onsetDurationText = durationFrequencyText(r, routing.primary_module)
  const aggravatingTextForEmr = aggravatingSummaryText(routing.primary_module, r.modules)
  const impactTextForEmr = isEmptyValue(r.visit_goal.chief_impact)
    ? null
    : answerLabel('VISIT_04_SYMPTOM_IMPACT', r.visit_goal.chief_impact)
  const emrText = buildPainWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    examSuggestions,
    finalAssessment,
    followUpTargets,
    carePlan,
    reassessment,
    nextReassessmentPlan,
    lbpDirectionalResponse,
    lbpWorkingHypothesis,
    onsetDurationText,
    aggravatingText: aggravatingTextForEmr,
    impactText: impactTextForEmr,
    microFollowUpText,
    lbpObjectiveMotorDeficit,
  })
  const patientCarePlanText = buildPainPatientCarePlanPreview({ primaryConcern: primaryConcernLabel(r), carePlan })
  const followUpOptions = isLbp ? [...LBP_TARGET_FUNCTION_OPTIONS, ...PAIN_FOLLOW_UP_OPTIONS] : PAIN_FOLLOW_UP_OPTIONS
  const followUpGroups = isLbp
    ? [{ label: '목표 기능(다음 방문에 같은 동작으로 비교)', ids: LBP_TARGET_FUNCTION_OPTIONS.map((o) => o.id) }]
    : undefined
  // Batch 2.6 (E-16/C-2): drives the disclosure's `open` attribute (auto-
  // opens once there is content, per the existing convention) -- but is
  // NOT what gates NextActionCard below (see `planOpen`, delta fix D-3).
  const carePlanDetailsOpen = !isCarePlanEmpty(carePlan) || nextReassessmentPlan.status !== 'UNSET'
  // Batch 2.6 delta fix (Opus review D-3): `<details>` is an uncontrolled
  // element, so `carePlanDetailsOpen` -- "does the Care Plan have content"
  // -- is not the same thing as "is the disclosure open right now". Gating
  // NextActionCard on the computed value instead of the real DOM state had
  // two symptoms: (a) a clinician who hand-collapsed an auto-opened
  // disclosure lost the "다음 액션" read-back entirely (carePlanDetailsOpen
  // stayed true, so the gate never flipped), and (b) opening the disclosure
  // by hand and then typing the first character into a field made
  // NextActionCard (which sits above the disclosure) unmount out from under
  // the cursor, shifting the page. `planOpen` tracks the disclosure's own
  // `toggle` event -- initialized to the same value used for the first
  // render's `open` attribute, then updated only by real open/close
  // transitions (by hand or by `carePlanDetailsOpen` itself changing) --
  // so NextActionCard's visibility always matches what is actually on
  // screen.
  const [planOpen, setPlanOpen] = useState(carePlanDetailsOpen)

  return (
    <div className="workspace__pain workspace__pain--next">
      {/*
        Phase 7 §2.5: 재평가 대상(측정 추적)과 다음 방문 확인 메모(자유
        기록)를 관계 라벨과 함께 나란히 배치한다 (게이트 B-2).

        Closing review correction (Opus N-3a): this textarea is now the
        ONLY editable path for `nextVisitCheckItem` on the initial-visit
        screen -- the Care Plan card below opts out of rendering the field
        (`showNextVisitCheckItem={false}` at `:769`), so this IS a
        replacement, not an additional placement. The revisit screen
        (`RevisitWorkspace.tsx`) has no lane-4 textarea like this one, so
        there the card keeps its default and renders the field itself.
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

      {!planOpen && (
        <NextActionCard
          homeAction={carePlan.homeActionPlan}
          nextCheck={carePlan.nextVisitCheckItem}
          nextReassessmentPlan={nextReassessmentPlan}
        />
      )}

      <details
        className="workspace__optional"
        open={carePlanDetailsOpen}
        onToggle={(e) => setPlanOpen(e.currentTarget.open)}
      >
        <summary>관리 계획 · 다음 재평가 — 자세히 입력</summary>
        {/* Batch 2.6 delta fix (D-1): `showNextVisitCheckItem={false}` only
            here, where the lane-4 "다음 방문 확인 메모" textarea above is
            the field's one editable home already. RevisitWorkspace.tsx has
            no such textarea, so it keeps the card's default (field shown). */}
        <PainCarePlanCard value={carePlan} onChange={onChangeCarePlan} showNextVisitCheckItem={false} />
        <NextReassessmentPlanCard value={nextReassessmentPlan} onChange={onChangeNextReassessmentPlan} />
      </details>

      <details className="workspace__optional workspace__optional--reference">
        <summary>참고 자료 (이전 방문 · 환자 전달문 · EMR 미리보기)</summary>
        <PriorVisitHistoryCard history={priorVisits} profile="pain" />
        <PatientCarePlanPreviewCard title="환자 전달용 치료 계획" text={patientCarePlanText} />
        <EmrPreviewCard text={emrText} copyHint={copyHint} />
        </details>
    </div>
  )
}
