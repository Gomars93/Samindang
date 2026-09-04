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
import type { LbpRecommendationCandidate } from './lbpExerciseRecommendation'
import { LBP_EXERCISE_CAPABILITY_LABEL_KO } from './lbpEligibilityContext'
import type { LbpExerciseCapability } from './lbpExerciseEligibility'
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

/** CD-3 (`DECISIONS.md` 2026-09-02 "CD-3 승인..."): the genuine 3-state a capability chip can be set to — 'UNKNOWN' is the default (never tap-confirmed either way), never a value the clinician "chose" until they explicitly reset it back. */
type LbpCapabilityStatus = 'YES' | 'NO' | 'UNKNOWN'

const LBP_CAPABILITY_STATUS_OPTIONS: LbpCapabilityStatus[] = ['YES', 'NO', 'UNKNOWN']
const LBP_CAPABILITY_STATUS_LABEL_KO: Record<LbpCapabilityStatus, string> = {
  YES: '확인함',
  NO: '지금은 안 됨',
  UNKNOWN: '미확인',
}

/** One capability's 3-button status group, mirroring `ExamSuggestionCard`'s `STATUS_OPTIONS` button convention (`aria-pressed` + `workspace__statusBtn`/`--active`). */
function LbpCapabilityStatusButtons({
  capabilityId,
  status,
  onSetStatus,
  ariaLabel,
}: {
  capabilityId: LbpExerciseCapability
  status: LbpCapabilityStatus
  onSetStatus: (capabilityId: LbpExerciseCapability, status: LbpCapabilityStatus) => void
  ariaLabel: string
}) {
  return (
    <div className="workspace__examCard__statusRow" role="group" aria-label={ariaLabel}>
      {LBP_CAPABILITY_STATUS_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={status === s}
          className={`workspace__statusBtn${status === s ? ' workspace__statusBtn--active' : ''}`}
          onClick={() => onSetStatus(capabilityId, s)}
        >
          {LBP_CAPABILITY_STATUS_LABEL_KO[s]}
        </button>
      ))}
    </div>
  )
}

/**
 * LBP v1 Batch 2 (CD-1, PO-approved option B) + Batch 2.5a (CD-3, PO-approved
 * 3-state, `DECISIONS.md` 2026-09-02 "CD-3 승인..."): exercises deferred
 * ONLY because a capability the clinician has not yet tap-confirmed either
 * way is UNKNOWN — never DEFER caused by a directional-response mismatch or
 * an unresolved neuro judgment (`lbpExerciseRecommendation.ts` already
 * filters those out before this candidate list is built). Distinct from
 * `RehabSuggestionCard` on purpose: there is no accept/hold/reject decision
 * to make on an item that is not yet a real suggestion — tapping a status
 * button here only records the capability's own 확인함/지금은 안 됨/미확인
 * state (`WorkspaceState.lbpConfirmedCapabilities`/`lbpDeniedCapabilities`).
 *
 * Each awaiting candidate's still-blocking capabilities get their own
 * 3-button group so the clinician can genuinely record 'NO' (not only
 * 'YES') right where the exercise it blocks is visible. The "확인함/지금은
 * 안 됨으로 표시한 준비 조건" row below additionally lists every capability
 * currently set to YES or NO on this record (Opus delta review defect 5's
 * scope, unchanged: it stays visible even once no candidate awaiting it is
 * left on screen, so a mistaken tap stays reversible) — never the full
 * 15-capability catalog unprompted.
 */
function LbpAwaitingCapabilitySection({
  candidates,
  confirmedCapabilities,
  deniedCapabilities,
  onSetStatus,
}: {
  candidates: LbpRecommendationCandidate[]
  /** Raw `WorkspaceState.lbpConfirmedCapabilities` — filtered to known `LbpExerciseCapability` ids before rendering (defensive against a legacy/unknown persisted member). */
  confirmedCapabilities: string[]
  /** Raw `WorkspaceState.lbpDeniedCapabilities` — same defensive filtering. */
  deniedCapabilities: string[]
  onSetStatus?: (capabilityId: LbpExerciseCapability, status: LbpCapabilityStatus) => void
}) {
  if (!onSetStatus) return null
  const isKnownCapability = (cap: string): cap is LbpExerciseCapability =>
    Object.prototype.hasOwnProperty.call(LBP_EXERCISE_CAPABILITY_LABEL_KO, cap)
  const knownConfirmed = confirmedCapabilities.filter(isKnownCapability)
  const knownDenied = deniedCapabilities.filter(isKnownCapability)
  const decidedIds = Array.from(new Set([...knownConfirmed, ...knownDenied]))
  const statusOf = (cap: LbpExerciseCapability): LbpCapabilityStatus =>
    knownConfirmed.includes(cap) ? 'YES' : knownDenied.includes(cap) ? 'NO' : 'UNKNOWN'

  if (candidates.length === 0 && decidedIds.length === 0) return null
  return (
    <section className="workspace__block">
      {candidates.length > 0 && (
        <>
          <h3>확인하면 시작 가능</h3>
          <p className="workspace__block__hint">
            아래 준비 조건이 아직 확인되지 않아 보류 중입니다. "미확인"은 "아니오"가 아니라 "아직 확인하지
            않음"입니다 — 이 운동의 조건이 모두 확인함(YES)이 되면 추천 목록에 올라갑니다. "지금은 안 됨(NO)"은
            그 조건이 실제로 안 된다는 기록이며, 쉬운 단계로 대체할 수 있는 조건일 때만 쉬운 단계로 시작 가능해집니다
            — 꼭 필요한 조건이면 계속 보류됩니다.
          </p>
          {candidates.map((c) => (
            <div key={c.exerciseId} className="workspace__examCard">
              <strong className="workspace__examCard__title">{c.title}</strong>
              {c.unconfirmedCapabilities.map((cap) => (
                <div key={cap} className="workspace__examCard__row">
                  <span>{LBP_EXERCISE_CAPABILITY_LABEL_KO[cap]}</span>
                  <LbpCapabilityStatusButtons
                    capabilityId={cap}
                    status={statusOf(cap)}
                    onSetStatus={onSetStatus}
                    ariaLabel={`${c.title} — ${LBP_EXERCISE_CAPABILITY_LABEL_KO[cap]}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      {decidedIds.length > 0 && (
        <div className="workspace__examCard">
          <strong className="workspace__examCard__title">확인함/지금은 안 됨으로 표시한 준비 조건</strong>
          <p className="workspace__block__hint">다시 눌러 미확인으로 되돌릴 수 있습니다.</p>
          {decidedIds.map((cap) => (
            <div key={cap} className="workspace__examCard__row">
              <span>{LBP_EXERCISE_CAPABILITY_LABEL_KO[cap]}</span>
              <LbpCapabilityStatusButtons
                capabilityId={cap}
                status={statusOf(cap)}
                onSetStatus={onSetStatus}
                ariaLabel={`${LBP_EXERCISE_CAPABILITY_LABEL_KO[cap]} 상태`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

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
const VISIBLE_REHAB_CANDIDATE_COUNT = 3

export function PainExerciseSection({
  isLbp,
  rehabSuggestions,
  onChangeRehabSuggestion,
  onAdoptRehabSuggestionToCarePlan,
  lbpRecommendationBlockedMessageKo,
  lbpTreatmentSafetyLockedReasonKo,
  lbpAwaitingCapabilityCandidates,
  lbpConfirmedCapabilities,
  lbpDeniedCapabilities,
  onSetLbpCapabilityStatus,
  lbpTargetFunctionGap,
}: {
  /** LBP v1 Batch 1: only an LBP record gets the safety-lock/capability/empty-state extras below -- every other pain region renders exactly the plain SYNTHETIC-preview candidate list it always has. */
  isLbp: boolean
  rehabSuggestions: RehabSuggestion[]
  onChangeRehabSuggestion: (next: RehabSuggestion) => void
  /** LBP v1 Batch 2 (G10/RF-8): "adopt, never automatic" into PainCarePlan.homeActionPlan. */
  onAdoptRehabSuggestionToCarePlan?: (suggestion: RehabSuggestion) => void
  /** LBP v1 Batch 2 (RF-3b): non-null/non-empty means the exercise section renders this one line instead of any candidate cards. */
  lbpRecommendationBlockedMessageKo?: string | null
  /** LBP v1 Batch 2 (CD-2): non-null/non-empty disables every candidate's adopt action (never the card) with this reason. Opus delta review defect 9: rendered once at the top of this section, common to both the READY cards and the awaiting-capability group, not nested only inside the READY block. */
  lbpTreatmentSafetyLockedReasonKo?: string | null
  /** LBP v1 Batch 2 (CD-1): candidates deferred only for an unconfirmed capability. */
  lbpAwaitingCapabilityCandidates?: LbpRecommendationCandidate[]
  /** Opus delta review defect 5: raw `WorkspaceState.lbpConfirmedCapabilities`, so the "확인함/지금은 안 됨" row can render even once every candidate that needed it has already moved to READY. */
  lbpConfirmedCapabilities?: string[]
  /** CD-3: raw `WorkspaceState.lbpDeniedCapabilities` — same scope as `lbpConfirmedCapabilities` above, the genuine 'NO' half. */
  lbpDeniedCapabilities?: string[]
  /** CD-3 (`DECISIONS.md` 2026-09-02 "CD-3 승인..."): 3-way setter — 'YES'/'NO'/'UNKNOWN', mutual exclusivity enforced by the caller (`DoctorWorkspace.tsx`). */
  onSetLbpCapabilityStatus?: (capabilityId: LbpExerciseCapability, status: LbpCapabilityStatus) => void
  /** LBP v1 Batch 2 §8.2-1(c): non-null only when both candidate lists are empty because no (matching) target function is selected yet. */
  lbpTargetFunctionGap?: 'NONE_SELECTED' | 'CUSTOM_ONLY' | null
}) {
  if (isLbp && lbpRecommendationBlockedMessageKo) {
    return (
      <section className="workspace__block">
        <h3>재활/운동 제안</h3>
        <p className="workspace__block__hint">{lbpRecommendationBlockedMessageKo}</p>
      </section>
    )
  }

  // (c): both candidate lists are empty purely because no (matching) target
  // function has been picked yet -- distinct from "picked, but genuinely no
  // eligible exercise", which is out of this correction's scope and simply
  // renders nothing, same as before.
  if (
    isLbp &&
    lbpTargetFunctionGap &&
    rehabSuggestions.length === 0 &&
    (lbpAwaitingCapabilityCandidates ?? []).length === 0
  ) {
    return (
      <section className="workspace__block">
        <h3>재활/운동 제안</h3>
        <p className="workspace__block__hint">
          목표 기능을 먼저 고르면 그 기능에 맞는 운동 후보가 나타납니다 — &apos;다음&apos; 레인의 재평가 대상에서
          선택하세요.
          {lbpTargetFunctionGap === 'CUSTOM_ONLY' &&
            ' "기타 목표 동작"은 자유 기록이라 대응하는 카탈로그 운동이 없습니다 — 목록에 있는 목표 기능도 함께 골라주세요.'}
        </p>
      </section>
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
      {/*
        Opus delta review defect 9 (CD-2): rendered once here, common to
        both the READY cards below and the awaiting-capability group in
        `LbpAwaitingCapabilitySection` -- a treatment-safety-locked patient
        with zero READY candidates but at least one awaiting-capability
        candidate must still see why adoption is blocked, not only once a
        READY card happens to exist.
      */}
      {isLbp && lbpTreatmentSafetyLockedReasonKo && (
        <p className="workspace__block__hint">{lbpTreatmentSafetyLockedReasonKo}</p>
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
      {isLbp && (
        <LbpAwaitingCapabilitySection
          candidates={lbpAwaitingCapabilityCandidates ?? []}
          confirmedCapabilities={lbpConfirmedCapabilities ?? []}
          deniedCapabilities={lbpDeniedCapabilities ?? []}
          onSetStatus={onSetLbpCapabilityStatus}
        />
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
