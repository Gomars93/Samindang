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
import { isMidlifeRecord } from '../MidlifeSafetyPanel'
import { toMidlifeStateFromDoctorPayload } from '../../spec/midlifeAdapter'
import { computeMidlifeSafety, type MidlifeSafetyStatus } from '../../spec/midlifeLogic'
import type { DoctorPayload } from '../types'
import { PatternCandidateCard } from './PatternCandidateCard'
import { ClinicianObservationChecklist } from './ClinicianObservationChecklist'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildHerbalWorkspaceEmrPreview } from './emrPreview'
import {
  HERBAL_FOLLOW_UP_OPTIONS,
  HERBAL_NRS_TARGET_IDS,
  type FollowUpTarget,
  type HerbalFinalAssessment,
  type NextReassessmentPlan,
} from './finalAssessment'
import type { HerbalPatternCandidate } from './patternCandidate'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { HerbalCarePlan } from './carePlan'
import { HerbalCarePlanCard } from './CarePlanCard'
import { NextActionCard, isHerbalCarePlanEmpty } from './NextActionCard'
import { PatientCarePlanPreviewCard, type IssueCarePlanLink } from './PatientCarePlanPreviewCard'
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

/**
 * 전신 문진 값(응답이 있는 항목만). 확인 레인의 hero(SYSTEMIC)와 스냅샷의 "응답 n항목"이
 * **같은 목록**을 읽는다 -- 두 곳이 따로 세면 어긋난다.
 */
export function herbalSystemicFields(payload: DoctorPayload) {
  const r = payload.responses
  return [
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
}

/**
 * 안전이슈 한 줄의 문구와 위험 여부. hero 행(mixed)과 스냅샷 칩(한약 단독)이 **같은 계산**을 쓴다.
 *
 * Midlife v0.2: 공통 flags만 읽으면 갱년기 판정(폐경 후 출혈 등)이 있어도 "없음"을 띄운다 --
 * 레인1은 경고하는데 여기는 안전하다고 말하는 모순(fail-open). 갱년기 기록이면 레인1과
 * **같은 계산**의 결과를 한 항목으로 합친다(CLEAR면 추가 없음).
 */
export function herbalSafetyIssue(payload: DoctorPayload): {
  text: string
  danger: boolean
  /** 스냅샷 칩 색: 공통 위험신호는 urgent, 그 밖의 확인 필요/읽기 불가는 review, 답했고 이상 없음은 clear, 아직 안 물음은 unknown. */
  level: 'urgent' | 'review' | 'clear' | 'unknown'
} {
  const r = payload.responses
  const { flags } = payload
  const flagsUsable = isFlagsUsable(flags, r)
  const MIDLIFE_CAT: Record<Exclude<MidlifeSafetyStatus, 'CLEAR'>, string> = {
    URGENT_REVIEW: '갱년기 URGENT',
    PRIORITY_EVALUATION: '갱년기 우선 외부평가',
    INCOMPLETE: '갱년기 안전 계산 불가',
  }
  const midlifeStatus = isMidlifeRecord(payload)
    ? computeMidlifeSafety(toMidlifeStateFromDoctorPayload(r)).status
    : 'CLEAR'
  const safetyCats = [
    ...safetyIssueCategories(flags),
    ...(midlifeStatus === 'CLEAR' ? [] : [MIDLIFE_CAT[midlifeStatus]]),
  ]
  const safetyAnswered =
    Array.isArray(r.safety_flags?.red_flag_general) && r.safety_flags.red_flag_general.length > 0
  const danger = !flagsUsable || safetyCats.length > 0
  return {
    text: !flagsUsable
      ? '확인 필요 — 계산값 읽기 불가'
      : safetyCats.length > 0
        ? safetyCats.join(', ')
        : safetyAnswered
          ? '없음'
          : '미확인',
    danger,
    level: danger
      ? flagsUsable && (flags.general_red || midlifeStatus === 'URGENT_REVIEW')
        ? 'urgent'
        : 'review'
      : safetyAnswered
        ? 'clear'
        : 'unknown',
  }
}

/** "최종 판단에 가져오기" -- 후보 이름을 최종 변증·병기에 한 줄 덧붙인다. 확인 레인(mixed)과 판단 레인(한약 단독)이 같은 함수를 쓴다. */
function adoptCandidateToFinal(finalAssessment: HerbalFinalAssessment, candidate: HerbalPatternCandidate): HerbalFinalAssessment {
  const existing = finalAssessment.finalPatternOrMechanism.trim()
  const next = existing ? `${existing}\n${candidate.displayName}` : candidate.displayName
  return { ...finalAssessment, finalPatternOrMechanism: next, recordedAt: new Date().toISOString() }
}

/**
 * 한약 단독 진료 화면의 맨 위 「A · Clinical Snapshot」 (Figma `03 · Herbal Doctor View v0.1`, 프레임 44:3).
 * 값을 새로 계산하지 않는다 -- 상담 목적은 `primaryConcernLabel`, 안전이슈는 `herbalSafetyIssue`,
 * 응답 항목 수는 `herbalSystemicFields`가 이미 만든 값을 그대로 읽는다.
 */
export function HerbalSnapshot({ payload }: { payload: DoctorPayload }) {
  const issue = herbalSafetyIssue(payload)
  const answered = herbalSystemicFields(payload).length
  return (
    <section className="painClinical herbalSnapshot" aria-label="환자 요약">
      <div className="painSnapshot herbalSnapshot__body">
        <div className="painSnapshot__lead">
          <h2 className="painSnapshot__title">{primaryConcernLabel(payload.responses)}</h2>
          <p className="painSnapshot__subtitle">{`상담 목적 · 전신 문진 응답 ${answered}항목`}</p>
        </div>
        <span className={`painSafety painSafety--${issue.level}`}>
          <span aria-hidden="true">{issue.level === 'clear' ? '✓' : issue.level === 'unknown' ? '—' : '⚠'}</span>
          <span>안전이슈</span>
          <strong>{issue.text}</strong>
        </span>
      </div>
    </section>
  )
}

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
  split = false,
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
  /**
   * 한약 단독 두 칼럼 배치(Figma `03 · Herbal Doctor View v0.1`, 프레임 44:3). true면 이 레인은
   * 왼쪽 칼럼(SYSTEMIC + EXAM)만 그린다: 상담 목적·안전이슈 행은 스냅샷(HerbalSnapshot)으로,
   * 핵심 병기 후보·오늘 재검은 오른쪽 칼럼(HerbalWorkspaceDecisionExtras)으로 옮겨 갔다.
   * false(기본, mixed)는 옛 구성 그대로다.
   */
  split?: boolean
}) {
  const r = payload.responses
  const issue = herbalSafetyIssue(payload)
  const populatedSystemic = herbalSystemicFields(payload)

  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(
    asPriorVisitArray<PatientHistoryResult['visits'][number]>(priorVisits?.visits)[0]?.herbalFollowUpTargets,
  )

  function handleAdoptToFinal(candidate: HerbalPatternCandidate) {
    onChangeFinalAssessment(adoptCandidateToFinal(finalAssessment, candidate))
  }

  return (
    <div className={`workspace__herbal${split ? ' workspace__herbal--split' : ''}`}>
      {!split && <p className="workspace__layerLabel">오늘 한눈에</p>}
      <section className="workspace__hero">
        <div className="workspace__hero__head">
          {split ? (
            <>
              <h3 className="workspace__cardEyebrow">SYSTEMIC</h3>
              <p className="workspace__cardQuestion">전신 상태는 어떤가?</p>
            </>
          ) : (
            <>
              <h3>한약·전신</h3>
              <span className="workspace__hero__hint">전신 상태와 한약 상담 정보를 먼저</span>
            </>
          )}
        </div>
        <div className="workspace__systemicGrid">
          {populatedSystemic.length === 0 && <p className="workspace__empty">전신 문진 응답이 없습니다.</p>}
          {populatedSystemic.map((f) => (
            <div key={f.qid} className="workspace__systemCard">
              <Field qid={f.qid} label={f.label} value={f.value as never} />
            </div>
          ))}
        </div>
        {/*
          P5 (Core Reduction, Phase 5 Synthesis v1.2 §6): wrapped in the
          SAME `.workspace__heroRows` container PainWorkspace.tsx already
          uses for its own conditional detail rows (not a new pattern) --
          purely structural, no field/label/content change. At the
          1024-1279px 그리드 재배열 breakpoint this lets the two rows sit
          side by side instead of stacking, removing one full row of
          height from the tallest card in this lane; every other viewport
          keeps the original stacked flex-column layout unchanged.

          split(한약 단독 두 칼럼): 이 두 행은 스냅샷(HerbalSnapshot)이 같은 값(primaryConcernLabel,
          herbalSafetyIssue)으로 그린다 -- 두 곳에 그리지 않는다.
        */}
        {!split && (
          <div className="workspace__heroRows">
            <div className="workspace__heroRow">
              <span>상담 목적</span>
              <strong>{primaryConcernLabel(r)}</strong>
            </div>
            <div className="workspace__heroRow">
              <span>안전이슈</span>
              <strong className={issue.danger ? 'workspace__heroRow__value--danger' : undefined}>{issue.text}</strong>
            </div>
          </div>
        )}
      </section>

      <MicroFollowUpCard candidates={microFollowUpCandidates} response={microFollowUpResponse ?? null} />

      {!split && <p className="workspace__layerLabel">오늘 확인할 것</p>}
      <section
        className={`workspace__block${split ? ' workspace__examCard' : ''}`}
        aria-label={split ? '오늘 확인할 것' : undefined}
      >
        {split ? (
          <header className="workspace__cardHead">
            <h3 className="workspace__cardEyebrow">EXAM</h3>
            <p className="workspace__cardQuestion">오늘 직접 확인할 것은?</p>
          </header>
        ) : (
          <h3>오늘 확인할 것</h3>
        )}
        <ClinicianObservationChecklist
          items={clinicianObservations}
          onChangeItem={onChangeClinicianObservation}
          onAddToReassessment={onAddObservationToReassessment}
        />
      </section>

      {!split && patternCandidates.length > 0 && (
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
      {!split && (
        <details className="workspace__optional" open={reassessment.items.length > 0}>
          <summary>오늘 재검(Structured Reassessment) — 필요할 때 펼치기</summary>
          <StructuredReassessmentCard
            title="오늘 재검(Structured Reassessment)"
            value={reassessment}
            onChange={onChangeReassessment}
          />
        </details>
      )}
    </div>
  )
}

/**
 * 한약 단독 진료의 「재평가 대상」 (PO 지시 2026-09-25).
 *
 * PR-A(2026-09-21, PO 승인)가 herbal 단독의 `다음` 레인을 통째로 폐기하면서
 * 이 picker도 같이 사라졌다 -- 그 picker가 `HerbalWorkspaceNext` 안에 있었고,
 * 그 컴포넌트는 mixed에서만 렌더되기 때문이다(PR #56 검수 F5가 그 사실을
 * 뒤늦게 짚었다). PO 판단은 **레인은 그대로 없애두고 이 한 칸만 되살린다**
 * 이다.
 *
 * 자리는 「판단·처치」 레인, `HerbalFinalAssessmentCard` 바로 뒤다 -- 그 카드의
 * 마지막 칸이 `추적할 증상`(자유 기록)이라, 그 옆에 `재평가 대상`(측정 추적)이
 * 오는 것이 읽는 순서와 맞는다. 확인 레인이 아닌 이유: 재평가 대상은 "오늘
 * 확인할 것"이 아니라 "다음에 볼 것"이다.
 *
 * 2026-09-26 갱신: 이 자리를 고른 **원래 이유 중 하나**는 "herbal 단독에는
 * `다음`도 「마무리」도 없으니 한 칸 때문에 단계 전환을 새로 만들지 않는다"
 * 였는데, 그 전제는 **더 이상 사실이 아니다** -- PO 지시(안 1)로 herbal 단독도
 * 「마무리」 단계를 갖게 됐다. 그래도 자리는 그대로 둔다: 위의 읽는 순서
 * 근거가 단독으로 성립하고, 「마무리」는 그 방문을 *끝내는* 자리(EMR·발급·완료)
 * 이지 판단을 적는 자리가 아니다.
 *
 * mixed는 건드리지 않는다 -- 거기는 `HerbalWorkspaceNext`의 picker가 그대로
 * 살아 있다. 이 컴포넌트는 herbal 단독에서만 렌더된다(두 군데 렌더되면 같은
 * 값을 두 곳에서 고치게 된다).
 *
 * EMR 짝: 화면을 되살렸으므로 `DoctorView.tsx`의 slim 경로도 이 키를 다시
 * 넘긴다. 안 넘기면 원장이 고른 값이 EMR에 안 간다 -- PR-A가 막았던
 * D-1("빈 값을 복사하고 복사됨을 띄움")의 **거울상**이다.
 */
export function HerbalFollowUpTargetsCard({
  followUpTargets,
  onChangeFollowUpTargets,
  withCardHead = false,
}: {
  followUpTargets: FollowUpTarget[]
  onChangeFollowUpTargets: (next: FollowUpTarget[]) => void
  /** 한약 단독 두 칼럼(Figma 프레임 44:3): 영문 라벨 + 한글 질문 머리. 선택 값·저장 키는 그대로다. */
  withCardHead?: boolean
}) {
  return (
    <section
      className="workspace__block workspace__herbalFollowUp"
      aria-label={withCardHead ? '재평가 대상 (측정 추적)' : undefined}
    >
      {withCardHead ? (
        <header className="workspace__cardHead">
          <h3 className="workspace__cardEyebrow">FOLLOW-UP</h3>
          <p className="workspace__cardQuestion">다음에 무엇을 다시 잴까?</p>
        </header>
      ) : (
        <h3>재평가 대상 (측정 추적)</h3>
      )}
      <FollowUpTargetPicker
        options={HERBAL_FOLLOW_UP_OPTIONS}
        selected={followUpTargets}
        onChange={onChangeFollowUpTargets}
        nrsTargetIds={HERBAL_NRS_TARGET_IDS}
      />
    </section>
  )
}

/**
 * 한약 단독 두 칼럼의 오른쪽 칼럼 아래쪽: 핵심 병기 후보(조건부) + 오늘 재검.
 *
 * 옛 구성에서는 확인 레인(HerbalWorkspaceLane2)에 있던 두 블록이다. 후보의 "최종 판단에 가져오기"가
 * 쓰는 곳(최종 변증·병기)이 같은 칼럼 바로 위로 와서, 가져오기 버튼과 그 결과가 한 화면에 붙는다.
 * 값·저장 키는 그대로다(`herbalPatternCandidates`, `herbalReassessment`, `herbalFinalAssessment`).
 */
export function HerbalWorkspaceDecisionExtras({
  patternCandidates,
  onChangePatternCandidate,
  finalAssessment,
  onChangeFinalAssessment,
  reassessment,
  onChangeReassessment,
}: {
  patternCandidates: HerbalPatternCandidate[]
  onChangePatternCandidate: (next: HerbalPatternCandidate) => void
  finalAssessment: HerbalFinalAssessment
  onChangeFinalAssessment: (next: HerbalFinalAssessment) => void
  reassessment: StructuredReassessment
  onChangeReassessment: (next: StructuredReassessment) => void
}) {
  return (
    <>
      {patternCandidates.length > 0 && (
        <section className="workspace__block workspace__patternCard">
          <header className="workspace__cardHead">
            <h3 className="workspace__cardEyebrow">PATTERN</h3>
            <p className="workspace__cardQuestion">핵심 병기 후보</p>
          </header>
          {patternCandidates.map((c) => (
            <PatternCandidateCard
              key={c.id}
              candidate={c}
              onChange={onChangePatternCandidate}
              onAdoptToFinal={() => onChangeFinalAssessment(adoptCandidateToFinal(finalAssessment, c))}
            />
          ))}
        </section>
      )}
      <details className="workspace__optional" open={reassessment.items.length > 0}>
        <summary>오늘 재검(Structured Reassessment) — 필요할 때 펼치기</summary>
        <StructuredReassessmentCard
          title="오늘 재검(Structured Reassessment)"
          value={reassessment}
          onChange={onChangeReassessment}
        />
      </details>
    </>
  )
}

export function HerbalWorkspaceNext({
  payload,
  clinicianObservations,
  safetyObservation,
  finalAssessment,
  followUpTargets,
  onChangeFollowUpTargets,
  carePlan,
  onChangeCarePlan,
  nextReassessmentPlan,
  onChangeNextReassessmentPlan,
  reassessment,
  priorVisits,
  copyHint,
  onIssueCarePlanLink,
}: {
  payload: DoctorPayload
  /** EMR 미리보기 조립에만 쓰인다 -- 편집 UI는 레인2(확인)에 있다. */
  clinicianObservations: ClinicianObservationItem[]
  /** PR-B2: EMR 미리보기 조립에만 쓰인다 — 편집 UI는 레인1(안전 확인)에 있다. */
  safetyObservation?: ClinicianObservationItem
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
  /** Opus closing review C-5: forwarded to EmrPreviewCard's `copyHint` -- the caller decides whether 종결 is actually on screen for this record; omitted (no hint rendered) when it is not. */
  copyHint?: string
  /** 플로우 정렬 4/5: server mode only -- turns the preview text into a read-only patient link (PatientCarePlanPreviewCard). */
  onIssueCarePlanLink?: IssueCarePlanLink
}) {
  const r = payload.responses

  const emrText = buildHerbalWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    clinicianObservations,
    safetyObservation,
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
          {/*
            2026-09-25 (PO 승인): 통증이 2026-09-06부터 쓰던 NRS 스위치를
            한약에도 켠다 -- 같은 prop, 같은 컴포넌트. 이 한 줄로 원장
            화면과 환자 재진 링크가 둘 다 0~10 버튼이 된다.
          */}
          <FollowUpTargetPicker
            options={HERBAL_FOLLOW_UP_OPTIONS}
            selected={followUpTargets}
            onChange={onChangeFollowUpTargets}
            nrsTargetIds={HERBAL_NRS_TARGET_IDS}
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
        <PatientCarePlanPreviewCard title="환자 전달용 관리 계획" text={patientCarePlanText} onIssueLink={onIssueCarePlanLink} />
        <EmrPreviewCard text={emrText} copyHint={copyHint} />
        </details>
    </div>
  )
}
