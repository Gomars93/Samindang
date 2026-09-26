/**
 * Doctor Clinical Workspace shell.
 *
 * Core Reduction P2/P3 (Phase 5 Synthesis v1.2 §2.1/§2.2/§2.4/§2.8, Phase 7
 * UI spec §2.3): this is now the V3 셸 -- a fixed-height, non-scrolling
 * left summary (`VisitSummaryAside`) beside a right work column of four
 * lanes (레인1 안전 확인 → 레인2 확인 → 판단·처치 → 다음), replacing the old
 * "Common Safety -> profile switcher -> one profile's whole screen"
 * top-to-bottom stack. See PainWorkspace.tsx/HerbalWorkspace.tsx's header
 * comments for how their content split across 레인2/다음.
 *
 * §2.4 retires the profile segmented control, the "자동 분류" banner, and
 * the mixed pain/herbal tab switcher from the default UI -- a `mixed`
 * record now naturally places both profiles' content in each lane (no
 * tabs), and the derived profile is the only profile a record ever shows
 * without an explicit "+ 다른 유형 입력 추가" click. There is no more
 * manual "view this record as a different single profile" override
 * (Phase 1 #38's UI successor is exactly that toggle, not a revived
 * segmented control) -- `profileOverride`/`mixedTab` are retired
 * accordingly, replaced by the single `additionalTypeOpen` per-record UI
 * flag the render-time reset below now owns instead.
 *
 * Round 2 Phase 5's original profile-override history stays in git for
 * anyone tracing Phase 1 #38 forward; this file no longer implements it.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CommonSafetyBanner } from '../CommonSafetyBanner'
import { ConflictBanner } from '../ConflictBanner'
import { DoctorTokenSetup } from '../DoctorTokenSetup'
import { ObjectiveExamFindingsCard, type ObjectiveExamField } from '../ObjectiveExamFindingsCard'
import { VisitSummaryAside } from './VisitSummaryAside'
import { PainFinalAssessmentCard, HerbalFinalAssessmentCard } from './FinalAssessmentCard'
import { WorkingHypothesisCard } from './WorkingHypothesisCard'
import { appendLbpHypothesisSentenceToPatientInstruction } from './lbpWorkingHypothesis'
import { activeDrivingPack } from './regionPacks'
import { readRegionClinical, withRegionClinical, type RegionClinicalRecord } from './regionClinicalState'
import { isPainFinalAssessmentRecorded, isHerbalFinalAssessmentRecorded } from './finalAssessment'
import { computeLane1Summary, type Lane1RegionInput } from './lane1Summary'
import { lastVisitTrackedLine, priorNrsFromHistory } from './longitudinal'
import { microFollowUpAlertKind, microFollowUpQuoteLine, readableMicroFollowUpResponse } from './microFollowUp'
import { ageFromDoctorPayload } from '../../spec/lbpAdapter'
import { answerLabel } from '../labels'
import './workspace.css'
/*
 * 토큰을 **명시적으로** 불러온다. `PainBriefing`이 같은 파일을 import하고
 * 이 셸이 그걸 렌더하므로 번들에는 어차피 들어오지만, 그 경로에 기대면
 * 브리핑을 떼는 날 워크스페이스의 `var(--pain-*)`가 통째로 해석 불가가 된다.
 */
import '../clinical/tokens.css'
/*
 * 옛 카드에 새 토큰을 입히는 레이어. `workspace.css` **뒤에** 온다 -- 선택자를
 * `.workspace`로 한 단계 올려뒀지만(그 파일 헤더 참고), 순서까지 맞춰두면
 * 둘 다 성립한다.
 */
import './painTheme.css'
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment, ObjectiveExamSaveOutcome } from '../judgment'
import { PainWorkspaceLane2, PainWorkspaceNext, PainExerciseSection, neuroUnrecordedHintForPack } from './PainWorkspace'
import { PainBriefing } from '../clinical/PainBriefing'
import type { IssueCarePlanLink } from './PatientCarePlanPreviewCard'
import { useOpenOnceContent } from './FinalAssessmentCard'
import { HerbalFollowUpTargetsCard, HerbalWorkspaceLane2, HerbalWorkspaceNext } from './HerbalWorkspace'
import { HerbalSafetyRedFlagCard } from './HerbalSafetyRedFlagCard'
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
  durationFrequencyText,
  primaryConcernLabel,
} from '../DoctorView'
import { deriveViewProfile } from './viewProfile'
import { emptyExamResult, type PhysicalExamSuggestion } from './examSuggestion'
import { mergeExamSuggestions } from './lbpExamSuggestions'
import type { HerbalPatternCandidate } from './patternCandidate'
import { defaultClinicianObservations, type ClinicianObservationItem } from './clinicianObservation'
import type { EvidenceItem } from './supportEngine'
import type { RehabSuggestion } from './rehabSuggestion'
import {
  buildRecommendationContext,
  mergeRehabSuggestions,
  appendAdoptionText,
} from './lbpExerciseRecommendation'
import { suggestExerciseStage, stageInputFromPayload } from './lbpExerciseStage'
import { reassessmentExamItemFromPrevious } from './reassessmentExam'
import type { PatientHistoryResult } from './longitudinal'
import type { MicroFollowUpResponse } from './microFollowUp'
import {
  deserializeWorkspaceState,
  emptyWorkspaceState,
  workspaceStateEquals,
  type WorkspaceState,
  type WorkspaceSaveOutcome,
} from './persistence'

export type WorkspaceSyntheticData = {
  examSuggestions?: PhysicalExamSuggestion[]
  evidence?: EvidenceItem[]
  patternCandidates?: HerbalPatternCandidate[]
  clinicianObservations?: ClinicianObservationItem[]
  rehabSuggestions?: RehabSuggestion[]
}

const SAVE_DEBOUNCE_MS = 900

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

/** Phase 7 §1.1/§3.2: short Korean region names for the lane1 union summary and the aside's truncated region list. */
const REGION_LABEL: Record<string, string> = {
  lbp: '허리',
  neck: '목',
  shoulder: '어깨',
  knee: '무릎',
  elbow: '팔꿈치',
  wrist_hand: '손목/손',
  hip: '고관절',
  ankle_foot: '발목/발',
  tmj: '턱관절',
}

function seedWorkspaceState(
  initial: WorkspaceState | null | undefined,
  synthetic: WorkspaceSyntheticData | undefined,
  payload: DoctorPayload,
): WorkspaceState {
  if (synthetic) {
    // Existing synthetic preview scenarios keep exact precedence — never
    // run the LBP generator/merge over illustrative UX fixture data.
    if (initial) return deserializeWorkspaceState(initial)
    const empty = emptyWorkspaceState()
    return {
      ...empty,
      painExamSuggestions: synthetic.examSuggestions ?? [],
      herbalPatternCandidates: synthetic.patternCandidates ?? [],
      herbalClinicianObservations: synthetic.clinicianObservations ?? defaultClinicianObservations(),
      painRehabSuggestions: synthetic.rehabSuggestions ?? [],
    }
  }
  // A brand-new (no `initial`) non-synthetic record keeps the exact same
  // default the pre-Batch-1 "no synthetic" path always seeded --
  // herbalClinicianObservations starts as the standard 설진/맥진/복진/추가
  // 문진 checklist, not [] -- this is unrelated to LBP and must not regress.
  const base = initial
    ? deserializeWorkspaceState(initial)
    : { ...emptyWorkspaceState(), herbalClinicianObservations: defaultClinicianObservations() }
  // LBP v1 Batch 1 (G2) → 부위 팩 일반화: merges the driving region pack's
  // freshly-generated auto suggestions into whatever is already saved (or []
  // for a brand-new record). A no-op for any record without an approved pack
  // (요통 이외 부위는 승인 전까지 여기서 아무것도 생성하지 않는다).
  const pack = activeDrivingPack(payload.responses)
  if (!pack) return base
  return { ...base, painExamSuggestions: mergeExamSuggestions(pack.examHelp, pack.generateExamSuggestions(payload), base.painExamSuggestions) }
}

export function DoctorWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  synthetic,
  submissionId,
  resetKey,
  chartNo,
  identityLinkSlot,
  initialWorkspaceState,
  initialRecordUpdatedAt,
  onSaveWorkspace,
  onSaveObjectiveExam,
  onReloadObjectiveExam,
  priorVisits,
  microFollowUpResponse,
  medicationCourseSlot,
  nextLaneFooter,
  onIssueCarePlanLink,
}: {
  payload: DoctorPayload
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
  shoulderObjectiveCuffWeakness?: ClinicianJudgment['shoulder_objective_cuff_weakness']
  synthetic?: WorkspaceSyntheticData
  /**
   * The SERVER record id (store.js's `id`, the same one saveJudgment
   * already uses) — never session_id, never a patient-identifying field.
   * Omitted in fixtures/preview mode, where persistence never happens.
   */
  submissionId?: string
  /**
   * Core Reduction P2 (Phase 5 Synthesis v1.2 §2.8): the unified shell
   * reset key -- `submission:<id>` / `fixture:<session_id>` -- computed
   * once by DoctorView.tsx and shared with DoctorRecordErrorBoundary's own
   * `key` prop so both mechanisms agree on record identity. Falls back to
   * `submissionId ?? payload.session_id` (the pre-P2 comparison key) when
   * omitted, so callers that have not adopted the unified key yet keep
   * their existing isolation guarantee.
   */
  resetKey?: string
  /** Resolved chart_no for the 좌측 요약 신원 block, when known (CRM identity link). Never fabricated when absent. */
  chartNo?: string | null
  /** 차트번호 연결(2026-09-21): VisitSummaryAside ①신원 블록으로 그대로 흘려보내는 슬롯 — 이 파일은 내용을 해석하지 않는다. */
  identityLinkSlot?: ReactNode
  initialWorkspaceState?: WorkspaceState | null
  /**
   * Round 18: the submission record's server-authoritative `updated_at` at
   * the moment this record was loaded -- the CAS precondition sent with the
   * FIRST autosave attempt for this record (every later attempt uses the
   * value returned by the previous successful save instead, tracked
   * internally). Only read on mount / when the underlying record changes,
   * same as initialWorkspaceState -- a later change to this prop for the
   * SAME record (e.g. the parent refreshing selectedRecord after our own
   * save) must never re-seed mid-edit, or a slow typist's in-flight edits
   * would silently start racing their own just-completed save.
   */
  initialRecordUpdatedAt?: string | null
  onSaveWorkspace?: (state: WorkspaceState, expectedUpdatedAt: string | null) => Promise<WorkspaceSaveOutcome>
  /**
   * P0-2 (Core Reduction Phase 6 gate) + P2: ObjectiveExamFindingsCard now
   * renders inside this shell's 레인2 ("확인") instead of DoctorView.tsx
   * rendering it as a standalone sibling -- same save contract, just owned
   * here so it sits next to the safety surface it feeds without DoctorView
   * having to know about lane layout.
   */
  onSaveObjectiveExam?: (field: ObjectiveExamField, value: string) => Promise<ObjectiveExamSaveOutcome>
  /**
   * 독립 검수 HIGH-2: ObjectiveExamFindingsCard의 stale-write conflict
   * 배너에서 "최신 내용 불러오기"를 눌렀을 때 호출된다 -- DoctorView.tsx가
   * 소유한 selectedRecord를 서버의 current judgment/updated_at으로 맞춰,
   * 다음 저장 시도가 같은 conflict를 반복하지 않게 한다.
   */
  onReloadObjectiveExam?: (current: ClinicianJudgment | null, currentUpdatedAt: string) => void
  /** Round 3 Phase C: already-fetched prior-visit RAW history for this exact patient_id, or undefined/null when unavailable (fixtures mode, no server, or nothing prior). */
  priorVisits?: PatientHistoryResult | null
  /** Round 3 Phase D: already-fetched micro follow-up response for THIS visit, or undefined/null when unavailable/not yet answered. */
  microFollowUpResponse?: MicroFollowUpResponse | null
  /** P2: MedicationCourseSection, already keyed `key={patient_id}` by the caller (§2.8's "그대로" row) — this shell only places it inside the 다음 레인. */
  medicationCourseSlot?: ReactNode
  /** P3: 발급/메시징/종결(EMR 검토 + 완료) — DoctorView-owned state, rendered as the tail of the 다음 레인. */
  nextLaneFooter?: ReactNode
  /** 플로우 정렬 4/5: server mode only (DoctorView supplies it with a real submission id); fixtures pass nothing. */
  onIssueCarePlanLink?: IssueCarePlanLink
}) {
  const basis = deriveViewProfile(payload)
  const activeProfile = basis.derived

  // The strongest available stable identity for "is this still the same
  // record" — prefers the unified shell reset key (§2.8) when the caller
  // supplies one, falling back to the pre-P2 comparison key otherwise.
  const recordKey = resetKey ?? submissionId ?? payload.session_id

  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() =>
    seedWorkspaceState(initialWorkspaceState, synthetic, payload),
  )
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const skipNextSaveRef = useRef(false)
  const lastSavedRef = useRef<WorkspaceState>(workspaceState)
  // Round 18: the last updated_at we know the server accepted for this
  // record (from the initial load, or from our own most recent successful
  // save) -- sent as the CAS precondition on the next save attempt.
  const lastKnownUpdatedAtRef = useRef<string | null>(initialRecordUpdatedAt ?? null)
  // Non-null exactly when the server rejected our last save as stale. While
  // set, autosave stops retrying (fail closed) until the clinician
  // explicitly reloads -- this is the ONLY code path that clears it besides
  // switching records.
  const [conflict, setConflict] = useState<{ current: WorkspaceState; currentUpdatedAt: string } | null>(null)
  // The locally-edited state we were about to save when the conflict was
  // detected, preserved verbatim so ConflictBanner can show it -- reload
  // discards it from the screen, so this is what stands between that and
  // silently losing the clinician's typing.
  const [preConflictDraft, setPreConflictDraft] = useState<WorkspaceState | null>(null)
  // P0-8 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.9): the
  // failure `kind` from the most recent unsuccessful save (never touched
  // by a conflict, which has its own dedicated UI) -- 'auth' shows the
  // inline token-reentry recovery instead of the generic "저장 실패" text.
  const [lastSaveErrorKind, setLastSaveErrorKind] = useState<'auth' | 'network' | 'other' | null>(null)
  // MAJOR-3 (Phase 10 closing review): block ⑤ in VisitSummaryAside is a
  // fixed 20px-budget row -- it can only ever hold a 1-line action
  // ("인증 만료 — 토큰 다시 입력"), never the full DoctorTokenSetup banner
  // (>=100px, was silently clipping there). This tracks whether that action
  // has been clicked; the actual token form renders OUTSIDE the left
  // summary's budget, at the top of the right work column's lane1 section
  // below, exactly where Phase 7 §3.2's "1줄 인라인 액션" note says recovery
  // belongs.
  const [tokenReentryOpen, setTokenReentryOpen] = useState(false)
  // Core Reduction P3 (Phase 5 Synthesis v1.2 §2.4/§2.10): "+ 다른 유형
  // 입력 추가" -- a manual reveal of the OPPOSITE profile's Final
  // Assessment fieldset in 판단·처치. The `<details>` still auto-opens
  // whenever the opposite side already holds a saved value regardless of
  // this flag (see `open={...||additionalTypeOpen}` below); this only
  // tracks an EXPLICIT manual open of an otherwise-empty opposite set, so
  // it is not a controlled boolean the render always forces closed --
  // `onToggle` keeps it in sync with the native disclosure, and it resets
  // with everything else on a record change below (this is the
  // "추가입력열림" state name in Phase 7 §1.2's reset-key test contract).
  const [additionalTypeOpen, setAdditionalTypeOpen] = useState(false)

  /*
    「마무리」 화면 분리 (PO 지시 2026-09-24). 오른쪽 작업 열이 두 단계로
    갈라진다: 「진료」(안전 확인 → 확인 → 판단·처치)와 「마무리」(다음 레인
    전체 -- 재평가 대상·관리 계획·이전 방문·환자 전달문·EMR 미리보기·CRM
    복약 코스·재진 발급/메시징/종결). 실측 근거: 다음 레인을 빼면 데스크톱
    1440x900 LBP 워크플로가 4182px → 3605px (4.65화면 → 4.01화면)이다.

    왜 언마운트가 아니라 `hidden`인가. 한약 축소(PR-A)는 다음 레인을 아예
    렌더하지 않는 "제거"였지만 여기는 "이동"이다. 조건부 렌더로 바꾸면
    그 안의 uncontrolled `<details>` 열림 상태, `useOpenOnceContent` latch,
    입력 중이던 커서 위치가 화면을 왔다 갔다 할 때마다 초기화된다 -- D-3
    (관리 계획 disclosure)이 정확히 그 부류의 사고였다. `hidden`은 DOM을
    그대로 두고 높이만 0으로 만들므로 화면 길이는 똑같이 줄이면서 그 상태를
    전부 보존한다. 저장 경로(`workspaceState` → autosave)도 건드리지 않는다
    -- 두 단계가 같은 state를 공유하고 같은 타이밍에 저장된다.

    `hidden`이 실제로 먹는지: `.doctor__visitStep`에는 `display` 규칙이
    없고 `.doctor__visitWork`에 자식 결합자 규칙도 없으므로 UA의
    `[hidden] { display: none }`이 그대로 적용된다(doctor.css에 확인 주석).
  */
  const [visitStep, setVisitStep] = useState<VisitStep>('consult')
  /*
    단계를 바꾸면서 동시에 스크롤해야 하는 경우(마무리에서 「안전」을 누름):
    `setVisitStep` 직후에는 아직 숨겨진 상태라 getBoundingClientRect가 0을
    돌려준다. 커밋 뒤에 재는 것이 유일하게 맞는 순서라서 pending 타깃을
    한 번 거쳐 useLayoutEffect에서 점프한다(paint 전이라 깜빡임 없음).
  */
  const [pendingJump, setPendingJump] = useState<string | null>(null)
  useIsomorphicLayoutEffect(() => {
    if (pendingJump === null) return
    jumpToLane(pendingJump)
    setPendingJump(null)
  }, [pendingJump])

  // Reset every piece of clinician-entered workspace state, plus the
  // per-record UI-only flags above, whenever the underlying record changes
  // (a different real submission, or a different SYNTHETIC preview
  // scenario/fixture) -- otherwise a clinician's earlier edits on record A
  // would silently carry over to record B. This is React's documented
  // "adjusting state when a prop changes" pattern (a plain state update
  // during render, guarded by comparing against the last-seen id) rather
  // than a `key`-based remount: keying this component was tried first and
  // triggered an unrelated React reconciliation issue where the previous
  // instance was not removed from the DOM (two `.workspace` roots stayed
  // mounted simultaneously) -- confirmed via headless-browser inspection,
  // not assumed. This render-time-reset approach does not have that
  // problem and was verified fixed the same way. Core Reduction P2 (delta
  // N-6): DoctorView.tsx no longer keys this component at all (there is no
  // `key={session_id}` on `<DoctorWorkspace>` there) -- this render-time
  // path, driven by the unified `resetKey` when the caller supplies one, is
  // the SOLE reset mechanism.
  const [lastSeenRecordKey, setLastSeenRecordKey] = useState(recordKey)
  if (recordKey !== lastSeenRecordKey) {
    setLastSeenRecordKey(recordKey)
    setAdditionalTypeOpen(false)
    // 「마무리」 화면 분리: 다른 환자를 열면 언제나 「진료」부터 시작한다 --
    // 앞 환자에서 마무리까지 갔다고 다음 환자가 마무리 화면으로 열리면
    // 안전 확인 레인을 건너뛴 채 진료가 시작된다.
    setVisitStep('consult')
    setPendingJump(null)
    const seeded = seedWorkspaceState(initialWorkspaceState, synthetic, payload)
    setWorkspaceState(seeded)
    lastSavedRef.current = seeded
    skipNextSaveRef.current = true
    setSaveStatus('idle')
    // Round 18: a stale-write conflict (and its preserved draft) belongs to
    // the OLD record -- carrying it over to a newly-selected record would
    // show patient A's conflict banner/draft over patient B's screen.
    lastKnownUpdatedAtRef.current = initialRecordUpdatedAt ?? null
    setConflict(null)
    setPreConflictDraft(null)
    // P0-8: same reasoning as conflict/preConflictDraft above -- an auth
    // failure banner belongs to the OLD record's save attempt, never to a
    // newly-selected one (defense in depth: every failure path already
    // re-sets this together with saveStatus in the same branch, so this
    // was never actually visibly stale, but an unreset per-record field is
    // exactly the kind of thing a future refactor could silently break).
    setLastSaveErrorKind(null)
    // MAJOR-3: same reasoning as lastSaveErrorKind directly above -- an
    // open token-reentry form belongs to the OLD record's failed save, not
    // a newly-selected one.
    setTokenReentryOpen(false)
  }

  // Round 18 fix (caught by real two-browser-context QA): `initialRecordUpdatedAt`
  // legitimately advances for the SAME record without DoctorWorkspace ever
  // saving anything -- e.g. the automatic "mark as viewed" status write
  // that fires the instant a submission is opened, or an independent
  // JudgmentPanel save on the same submission. Without tracking that,
  // DoctorWorkspace's very first autosave attempt on almost every record
  // would 409 against a sibling's write.
  //
  // Fixed by only ever adopting the newer token TOGETHER with the fresh
  // content it came with (`initialWorkspaceState`), and ONLY when this
  // panel has no unsaved local edits of its own
  // (`workspaceStateEquals(workspaceState, lastSavedRef.current)`).
  useEffect(() => {
    if (initialRecordUpdatedAt == null || initialRecordUpdatedAt === lastKnownUpdatedAtRef.current) return
    if (!workspaceStateEquals(workspaceState, lastSavedRef.current)) return
    const fresh = seedWorkspaceState(initialWorkspaceState, synthetic, payload)
    lastKnownUpdatedAtRef.current = initialRecordUpdatedAt
    lastSavedRef.current = fresh
    skipNextSaveRef.current = true
    setWorkspaceState(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecordUpdatedAt])

  // The actual save attempt -- extracted so it can be called both from the
  // debounced autosave effect below AND directly from the P0-8 "인증 만료 —
  // 토큰 다시 입력" recovery action (re-entering a token does not itself
  // touch `workspaceState`, so it cannot rely on the effect's own
  // dependency change to fire a retry).
  async function performSave() {
    if (!submissionId || !onSaveWorkspace) return
    const toSave: WorkspaceState = { ...workspaceState, updated_at: new Date().toISOString() }
    setSaveStatus('saving')
    const result = await onSaveWorkspace(toSave, lastKnownUpdatedAtRef.current)
    if (result.ok) {
      lastSavedRef.current = toSave
      lastKnownUpdatedAtRef.current = result.updatedAt
      setLastSaveErrorKind(null)
      setTokenReentryOpen(false)
      setSaveStatus('saved')
    } else if (result.conflict) {
      setPreConflictDraft(toSave)
      setConflict(result.conflict)
      setSaveStatus('conflict')
    } else {
      setLastSaveErrorKind(result.kind ?? 'other')
      setSaveStatus('error')
    }
  }

  // Debounced autosave: fires SAVE_DEBOUNCE_MS after the last edit, only in
  // server mode (submissionId + onSaveWorkspace both present), and never
  // for the state transition caused by switching records (skipNextSaveRef)
  // -- that transition is a LOAD, not an edit, and must never immediately
  // re-PUT the just-loaded (or freshly-empty) state back at the server.
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (!submissionId || !onSaveWorkspace) return
    // Round 18: fail closed on a pending conflict -- never silently retry
    // (and possibly clobber the version the clinician hasn't reloaded yet)
    // while ConflictBanner is up. The only way out is the explicit reload.
    if (conflict) return
    if (workspaceStateEquals(workspaceState, lastSavedRef.current)) return

    setSaveStatus('saving')
    const timer = setTimeout(performSave, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState, submissionId, conflict])

  // Round 18: the ONLY recovery action -- loads the server's current
  // version verbatim (no field-level merge) and clears the conflict. The
  // draft that was about to be saved stays visible in ConflictBanner until
  // this fires, at which point it is gone from the screen for good; the
  // clinician has already had the chance to copy anything they needed.
  function handleReloadFromConflict() {
    if (!conflict) return
    setWorkspaceState(conflict.current)
    lastSavedRef.current = conflict.current
    lastKnownUpdatedAtRef.current = conflict.currentUpdatedAt
    skipNextSaveRef.current = true
    setConflict(null)
    setPreConflictDraft(null)
    setSaveStatus('saved')
  }

  function addPainExamToReassessment(item: PhysicalExamSuggestion) {
    setWorkspaceState((s) => {
      if (s.painReassessment.items.some((i) => i.id === `reassess_${item.id}`)) return s
      const promoted = reassessmentExamItemFromPrevious(`reassess_${item.id}`, item.title, {
        status: item.result.status,
        laterality: item.result.laterality,
        note: item.result.note,
        recordedAt: item.result.recordedAt,
      })
      return { ...s, painReassessment: { ...s.painReassessment, items: [...s.painReassessment.items, promoted] } }
    })
  }

  function addHerbalObservationToReassessment(item: ClinicianObservationItem) {
    setWorkspaceState((s) => {
      if (s.herbalReassessment.items.some((i) => i.id === `reassess_${item.id}`)) return s
      const promoted = reassessmentExamItemFromPrevious(`reassess_${item.id}`, item.title, {
        status: 'UNCLEAR',
        laterality: null,
        note: item.value,
        recordedAt: item.recordedAt,
      })
      return { ...s, herbalReassessment: { ...s.herbalReassessment, items: [...s.herbalReassessment.items, promoted] } }
    })
  }

  // ---------------------------------------------------------------------
  // 레인1 안전 확인: each region panel is a pure, stateless function --
  // calling it directly (not as JSX) lets lane1Summary.ts read the SAME
  // decision every panel already renders (see that file's header comment
  // for why this, rather than re-deriving each region's status, is the
  // fail-open-safe choice). Never gated on `activeProfile` -- P0-1's whole
  // point is that a herbal-derived record with a real regional concern
  // still shows it (Phase 7 §1.1-#5).
  // ---------------------------------------------------------------------
  const regionInputs: Lane1RegionInput[] = [
    { key: 'lbp', label: REGION_LABEL.lbp, element: LbpSafetyPanel({ payload, lbpObjectiveMotorDeficit }) },
    { key: 'hip', label: REGION_LABEL.hip, element: HipSafetyPanel({ payload }) },
    { key: 'neck', label: REGION_LABEL.neck, element: NeckSafetyPanel({ payload }) },
    {
      key: 'shoulder',
      label: REGION_LABEL.shoulder,
      element: ShoulderSafetyPanel({ payload, shoulderObjectiveCuffWeakness }),
    },
    { key: 'knee', label: REGION_LABEL.knee, element: KneeSafetyPanel({ payload }) },
    { key: 'elbow', label: REGION_LABEL.elbow, element: ElbowSafetyPanel({ payload }) },
    { key: 'wrist_hand', label: REGION_LABEL.wrist_hand, element: WristHandSafetyPanel({ payload }) },
    { key: 'ankle_foot', label: REGION_LABEL.ankle_foot, element: AnkleFootSafetyPanel({ payload }) },
    { key: 'tmj', label: REGION_LABEL.tmj, element: TmjSafetyPanel({ payload }) },
  ]
  const anySafetyRegionApplicable = regionInputs.some((r) => r.element != null)
  // Phase 7 §1.1/§2.2: the union summary this shell's left-column chip and
  // (later) the Queue badge both read from -- computed fresh on every
  // render from the SAME region elements rendered below, so it can never
  // drift from what the clinician actually sees in 레인1 (§1.1-#7: this
  // recomputes at every render-time reset boundary because it is plain,
  // uncached, prop-driven computation, never a ref/memo carried forward).
  const lane1Summary = computeLane1Summary(payload, regionInputs)
  // 2026-09-06 (원장 지시 "진료최적화", 플로우 정렬 2/5): 레인1 안전 블록은
  // 합집합 상태가 CLEAR일 때 접힌다. 판정은 새로 만들지 않고 좌측 요약 chip이
  // 이미 읽는 `lane1Summary.status`를 그대로 쓴다(같은 신호, 두 화면이 어긋날 수
  // 없다). 래치(`useOpenOnceContent`): 비CLEAR가 한 번이라도 보였으면 열어두고
  // 자동으로 닫지 않는다 — 원장이 신경 소견을 SEVERE로 기록해 URGENT가 되면
  // 열리고, 다시 NONE으로 고쳐도 원장이 손으로 닫기 전까지는 열려 있다.
  // 실측 근거: LBP 초진 화면 높이 3.2~3.9뷰포트 중 레인1이 첫 화면을 통째로
  // 차지해 운동 후보가 3~4화면 아래에 있었다(DECISIONS.md 2026-09-06).
  // 비CLEAR가 한 번이라도 있었으면 래퍼 자체를 두지 않고 예전처럼 블록을 직접
  // 렌더한다(요약 줄 0px 추가 — 확인이 필요한 환자에게 한 줄을 더 얹지 않는다).
  // 실측: 래퍼를 항상 두면 비CLEAR 화면이 +70px, CLEAR 화면은 −57px였다.
  const lane1EverNonClear = useOpenOnceContent(lane1Summary.status !== 'CLEAR')
  const lane1Collapsible = !lane1EverNonClear

  // ---------------------------------------------------------------------
  // LBP v1 Batch 2 (G9/G10): recomputed every render, exactly like
  // lane1Summary above -- never cached/persisted itself (architecture §2.3).
  // Guarded on `!synthetic`, mirroring seedWorkspaceState's own guard above
  // ("Existing synthetic preview scenarios keep exact precedence -- never
  // run the LBP generator/merge over illustrative UX fixture data") so a
  // SYNTHETIC preview's hand-authored painRehabSuggestions is never
  // overwritten by a live recomputation.
  // ---------------------------------------------------------------------
  // 부위 팩 일반화(2026-09-06, R2): 구동 부위(§3.4 NS01/HIP_00 판별, 승인 전
  // 팩이면 같은 모집단의 승인 팩으로 후퇴)의 승인된 팩 하나가 L1~L8을 구동한다.
  // 승인 팩이 없으면 아래 전부 null이라 옛 비요통 화면과 같다. 요통은 요통 팩
  // = 옛 동작과 같다.
  const regionPack = activeDrivingPack(payload.responses)
  const regionState: RegionClinicalRecord | null = regionPack
    ? readRegionClinical(workspaceState, regionPack.region, regionPack.hypothesisPatterns)
    : null
  const setRegionClinical = regionPack
    ? (patch: Partial<RegionClinicalRecord>) => setWorkspaceState((s) => withRegionClinical(s, regionPack.region, patch))
    : null
  const regionRecommendation =
    !synthetic && regionPack && regionState
      ? buildRecommendationContext(
          regionPack,
          payload,
          { lbp_objective_motor_deficit: lbpObjectiveMotorDeficit, shoulder_objective_cuff_weakness: shoulderObjectiveCuffWeakness },
          regionState,
          workspaceState,
        )
      : null
  // 2026-09-05: 단계 제안은 오늘 문진 답변만으로 매 렌더 재계산 — 저장되지
  // 않는다. 저장되는 것은 원장 확정값(요통 `workspaceState.lbpConfirmedStage`,
  // 다른 부위 `regionClinical[region].confirmedStage`)뿐.
  const regionStageSuggestion = !synthetic && regionPack ? suggestExerciseStage(stageInputFromPayload(regionPack.region, payload)) : null
  const displayedPainRehabSuggestions = regionRecommendation
    ? mergeRehabSuggestions(workspaceState.painRehabSuggestions, regionRecommendation.candidates)
    : workspaceState.painRehabSuggestions

  // ---------------------------------------------------------------------
  // 좌측 요약 값 조립 (§2.1/§3.2) -- read-only formatting of already-computed
  // values, never a new clinical computation.
  // ---------------------------------------------------------------------
  const r = payload.responses
  const age = ageFromDoctorPayload(r)
  const sexAgeLine = [
    r.patient.patient_sex ? answerLabel('ID_03', r.patient.patient_sex) : null,
    typeof age === 'number' ? `${age}세` : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join(' · ')
  /*
    2026-09-25: 오늘 기준값을 함께 넘긴다 -- 「지난번 추적」 줄이 지난 값만
    싣고 있었는데, 한약 NRS가 생기면서 오른쪽 절반을 채울 수 있게 됐다.
    두 프로필 목록을 합쳐서 넘긴다: 이 줄의 출처인 지난 방문 쪽
    `followUpTargets`가 프로필 무관 union이라, 오늘 쪽만 한쪽 프로필로
    좁히면 mixed에서 짝이 안 맞는다.
  */
  const trackedLine = lastVisitTrackedLine(priorVisits, [
    ...workspaceState.painFollowUpTargets,
    ...workspaceState.herbalFollowUpTargets,
  ])
  const readableMicroFollowUp = readableMicroFollowUpResponse(microFollowUpResponse ?? null)
  const deltaQuoteLine = microFollowUpQuoteLine(readableMicroFollowUp)
  /*
    2026-09-24 (PO 지시, 「간단 재확인」 카드 이동의 짝): 좌측 요약의
    「지난 대비」는 문장 **하나**만 싣는다. 카드가 확인 레인에 있을 때는
    그 카드가 `needsAttention`으로 저절로 펼쳐지며 "이 문장은 이상반응
    신고다"를 따로 말해줬는데, 카드가 마무리로 내려가면 그 구분이 사라진다
    -- 같은 글자를 원장이 "그냥 근황"으로 읽게 된다. 그래서 종류를 배지로
    함께 싣는다. 우선순위는 `microFollowUpQuoteLine`과 같은 순서를 쓰므로
    배지와 문장이 항상 같은 신고를 가리킨다(microFollowUp.ts 주석 참고).
  */
  const deltaAlertKind = microFollowUpAlertKind(readableMicroFollowUp)

  // Opus closing review C-5: EmrPreviewCard's "복사는 「마무리」 화면의
  // 「종결」 섹션에서 합니다." hint is only true when 종결 actually renders
  // on screen -- `nextLaneFooter` is the exact same signal DoctorView.tsx
  // already gates 종결's own render on (`nextLaneFooterNode`, gated by
  // `mode === 'server' && selectedRecord?.patient_id`), so its presence
  // here is a faithful proxy without this shell needing to know `mode`/
  // `patient_id` itself. `undefined` when absent (fixtures/preview mode,
  // legacy records with no patient_id) so EmrPreviewCard renders no hint
  // at all rather than naming a section that is not on screen.
  const emrPreviewCopyHint = nextLaneFooter != null ? '복사는 「마무리」 화면의 「종결」 섹션에서 합니다.' : undefined

  const painFinalRecorded = isPainFinalAssessmentRecorded(workspaceState.painFinalAssessment)
  const herbalFinalRecorded = isHerbalFinalAssessmentRecorded(workspaceState.herbalFinalAssessment)

  const oppositeDetailsId = useId()

  return (
    <div className="workspace" data-view-profile={activeProfile}>
      {/*
        §7.1 경고 등급 4 (stale/conflict): 레인 밖, 화면 상단 -- 좌/우
        컬럼보다 먼저 렌더해 셸 레이아웃과 경합하지 않는다.
      */}
      {conflict && (
        <ConflictBanner
          onReload={handleReloadFromConflict}
          draftJson={preConflictDraft ? JSON.stringify(preConflictDraft, null, 2) : null}
        />
      )}

      <div className="doctor__visitShell">
        <VisitSummaryAside
          patientName={typeof r.patient.patient_name === 'string' ? r.patient.patient_name : ''}
          chartNo={chartNo}
          identityLinkSlot={identityLinkSlot}
          sexAgeLine={sexAgeLine || null}
          chiefConcern={primaryConcernLabel(r)}
          durationFrequency={durationFrequencyText(r, payload.routing.primary_module)}
          lastVsDeltaLine={deltaQuoteLine}
          lastVsAlertKind={deltaAlertKind}
          lane1={lane1Summary}
          saveStatus={submissionId && onSaveWorkspace ? saveStatus : undefined}
          lastSaveErrorKind={lastSaveErrorKind}
          onOpenTokenReentry={() => {
            /*
              검수 F1: `DoctorTokenSetup` 폼은 레인1 맨 위, 즉 「진료」 단계
              래퍼 **안**에 있다(MAJOR-3이 좌측 요약 20px 예산 밖으로 내보낸
              자리). 마무리 화면에서 401이 나면 좌측 요약의 "인증 만료 —
              토큰 다시 입력"은 항상 보이는데 폼은 `hidden`이라, 눌러도
              아무 일이 안 일어나고 저장은 계속 실패한다.

              폼을 두 단계 밖으로 옮기는 대신 여는 쪽에서 단계를 함께
              되돌린다 -- 폼을 밖으로 빼면 MAJOR-3이 정한 자리(레인1 상단)를
              잃고, 인증이 끊긴 상황에서 원장이 가야 할 곳은 어차피 진료
              화면이다.
            */
            setVisitStep('consult')
            setPendingJump(null)
            setTokenReentryOpen(true)
          }}
        />

        <main className="doctor__visitWork" aria-label="진료 작업">
          {/*
            「마무리」 화면 분리: 여기부터 「진료」 단계 -- 안전 확인 → 확인 →
            판단·처치. `hidden`으로만 감추고 언마운트하지 않는 이유는 위
            `visitStep` 선언부 주석 참고.
          */}
          <div className="doctor__visitStep" data-step="consult" hidden={visitStep !== 'consult'}>
          <section className="doctor__visitLane doctor__visitLane--lane1" aria-labelledby="lane1-h2">
            <h2 id="lane1-h2">안전 확인</h2>
            {/*
              MAJOR-3 (Phase 10 closing review): the left-hand summary's ⑤
              block only ever has a 20px budget for a 1-line "인증 만료 —
              토큰 다시 입력" action (VisitSummaryAside.tsx) -- the actual
              DoctorTokenSetup form (>=100px) renders here instead, at the
              top of the right work column's lane1 section, outside that
              budget entirely, only once the clinician has clicked the
              action.
            */}
            {lastSaveErrorKind === 'auth' && tokenReentryOpen && (
              <DoctorTokenSetup
                authFailed
                onSet={() => {
                  setTokenReentryOpen(false)
                  setLastSaveErrorKind(null)
                  void performSave()
                }}
              />
            )}
            <CommonSafetyBanner payload={payload} />
            {anySafetyRegionApplicable && lane1Collapsible && (
              <details className="workspace__optional doctor__lane1Collapse">
                <summary>{`안전 확인 — 전 부위 안전 (${lane1Summary.clearLabels.join(' · ')}) · 펼쳐서 상세`}</summary>
                <section className="workspace__block workspace__block--safety">
                  <p className="workspace__block__hint">
                    현재 계산된 flag와 안전 잠금 의미를 그대로 표시합니다 — 새 cutoff나 해석을 추가하지 않습니다.
                  </p>
                  {regionInputs.map((r) => (
                    <div key={r.key}>{r.element}</div>
                  ))}
                </section>
              </details>
            )}
            {anySafetyRegionApplicable && !lane1Collapsible && (
              <section className="workspace__block workspace__block--safety">
                {/*
                  P5 tablet-viewport height budget: the lane's own <h2
                  id="lane1-h2">안전 확인</h2> above already introduces this
                  block -- an inner <h3> repeating the identical text added
                  height with no new information, so it is not repeated here.
                */}
                <p className="workspace__block__hint">
                  현재 계산된 flag와 안전 잠금 의미를 그대로 표시합니다 — 새 cutoff나 해석을 추가하지 않습니다.
                </p>
                {regionInputs.map((r) => (
                  <div key={r.key}>{r.element}</div>
                ))}
              </section>
            )}

            {/*
              PR-B2(2026-09-21): 한약 상담 중단 사유(red flag)는 설진·복진 중에
              걸리지만 의미가 "변증 참고"가 아니라 "상담을 멈추고 보내야 함"
              이므로 레인2 체크리스트가 아니라 **여기** 안전 확인 레인에 있다.
              레인2는 아무것도 기록되지 않으면 한 줄로 접히는데, 접히는 자리에
              안전장치를 넣는 것은 안전장치를 넣지 않은 것과 같다.

              순서: 문진 응답에서 **계산된** flag(CommonSafetyBanner·부위별
              입력)를 먼저 보이고, 원장이 **직접 본** 소견을 그 뒤에 둔다 --
              이 레인이 이미 두 종류를 섞어 쓰던 순서 그대로다.
            */}
            {(activeProfile === 'herbal' || activeProfile === 'mixed') && (
              <HerbalSafetyRedFlagCard
                value={workspaceState.herbalSafetyObservation}
                onChange={(next) => setWorkspaceState((s) => ({ ...s, herbalSafetyObservation: next }))}
              />
            )}
          </section>

          <section className="doctor__visitLane doctor__visitLane--lane2" aria-labelledby="lane2-h2">
            <h2 id="lane2-h2">확인</h2>
            {/*
              통증 닥터뷰 재설계 배선 1단계 (2026-09-22): 읽기 4블록 + 스냅샷 띠.

              **아무것도 대체하지 않는다.** `PainBriefing`은 payload에서 파생만
              하는 순수 읽기 화면이라, 기존 카드가 나르던 값을 가로채지 않는다.
              (입력 3블록은 아직 배선하지 않는다 -- 기존 카드보다 담는 필드가
              적어서, 갈아끼우면 원장이 타이핑한 값이 사라진다. `DECISIONS.md`
              같은 날 항목의 "배선 2단계에 남은 갭" 표 참고.)

              위치: 레인2(확인)의 맨 위. 원장이 환자를 보기 시작하는 지점이고,
              아래의 검사 제안·재평가가 이 요약을 근거로 읽히기 때문이다.

              `priorNrs`는 이제 서버가 싣는다(2026-09-24). `PriorVisitSummary`에
              `painNrsNow`/`painNrsWorst`가 생겼고, 초진은 submission의 응답에서,
              재진은 재질문된 `detailAnswers`에서 읽는다. 어느 방문과 비교할지는
              `priorNrsFromHistory`가 고른다 -- **값이 있는 가장 최근 방문 하나**에서
              두 값을 함께 가져온다(필드별로 따로 찾으면 서로 다른 시점의 두 값이
              한 줄에 나란히 서게 된다).

              값이 없으면 비교 행 대신 척도 행이 나온다 -- 지어내지 않는다.
            */}
            {(activeProfile === 'pain' || activeProfile === 'mixed') && (
              <PainBriefing payload={payload} priorNrs={priorNrsFromHistory(priorVisits)} />
            )}
            {trackedLine && (
              <p className="doctor__lastVisitTracked">
                지난번 추적: {trackedLine.text}
                {trackedLine.overflowCount > 0 && ` 외 ${trackedLine.overflowCount}건`}
              </p>
            )}
            <ObjectiveExamFindingsCard
              showLbp={payload.responses.safety_flags.lbp != null}
              showShoulder={payload.responses.safety_flags.shoulder != null}
              initialLbp={lbpObjectiveMotorDeficit}
              initialShoulder={shoulderObjectiveCuffWeakness}
              onSave={onSaveObjectiveExam}
              onReloadConflict={onReloadObjectiveExam}
              // m4 (Phase 10 closing review): the same unified reset key this
              // component's own workspaceState uses above (recordKey) --
              // without it, this card's radio selections/save status
              // silently carried over from the previous patient.
              resetKey={recordKey}
            />
            {(activeProfile === 'pain' || activeProfile === 'mixed') && (
              <PainWorkspaceLane2
                payload={payload}
                examSuggestions={workspaceState.painExamSuggestions}
                onChangeExamSuggestion={(next) =>
                  setWorkspaceState((s) => ({
                    ...s,
                    painExamSuggestions: s.painExamSuggestions.map((i) => (i.id === next.id ? next : i)),
                  }))
                }
                onAddExamToReassessment={addPainExamToReassessment}
                evidence={synthetic?.evidence}
                additionalConcernPromotion={workspaceState.additionalConcernPromotion}
                onChangeAdditionalConcernPromotion={(next) =>
                  setWorkspaceState((s) => ({ ...s, additionalConcernPromotion: next }))
                }
                reassessment={workspaceState.painReassessment}
                onChangeReassessment={(next) => setWorkspaceState((s) => ({ ...s, painReassessment: next }))}
                regionPack={regionPack}
                directionalResponse={regionState?.directionalResponse}
                onChangeDirectionalResponse={(next) => setRegionClinical?.({ directionalResponse: next })}
                onAddRegionExam={(id) =>
                  setWorkspaceState((s) => {
                    if (s.painExamSuggestions.some((i) => i.id === id)) return s
                    const template = regionPack?.clinicianAddableExams.find((i) => i.id === id)
                    if (!template) return s
                    return {
                      ...s,
                      painExamSuggestions: [...s.painExamSuggestions, { ...template, result: emptyExamResult() }],
                    }
                  })
                }
              />
            )}
            {(activeProfile === 'herbal' || activeProfile === 'mixed') && (
              <HerbalWorkspaceLane2
                payload={payload}
                patternCandidates={workspaceState.herbalPatternCandidates}
                onChangePatternCandidate={(next) =>
                  setWorkspaceState((s) => ({
                    ...s,
                    herbalPatternCandidates: s.herbalPatternCandidates.map((c) => (c.id === next.id ? next : c)),
                  }))
                }
                clinicianObservations={workspaceState.herbalClinicianObservations}
                onChangeClinicianObservation={(next) =>
                  setWorkspaceState((s) => ({
                    ...s,
                    herbalClinicianObservations: s.herbalClinicianObservations.map((o) => (o.id === next.id ? next : o)),
                  }))
                }
                onAddObservationToReassessment={addHerbalObservationToReassessment}
                reassessment={workspaceState.herbalReassessment}
                onChangeReassessment={(next) => setWorkspaceState((s) => ({ ...s, herbalReassessment: next }))}
                microFollowUpResponse={microFollowUpResponse}
                priorVisits={priorVisits}
                finalAssessment={workspaceState.herbalFinalAssessment}
                onChangeFinalAssessment={(next) => setWorkspaceState((s) => ({ ...s, herbalFinalAssessment: next }))}
              />
            )}
          </section>

          {/*
            Core Reduction P3 (Phase 5 Synthesis v1.2 §2.4, 게이트 B-3):
            파생 프로필 기준으로 해당 필드 세트만 렌더한다. mixed는 양쪽을
            자연 배치(탭 없음). 반대편 세트는 `+ 다른 유형 입력 추가`
            토글로만 드러나고, 이미 저장값이 있으면 자동으로 열린다
            (Phase 7 §1.3-#4/#5, §2.10).
          */}
          <section className="doctor__visitLane doctor__visitLane--judgment" aria-labelledby="judgment-h2">
            <h2 id="judgment-h2">판단·처치</h2>
            {(activeProfile === 'pain' || activeProfile === 'mixed') && (
              <>
                {/*
                  LBP v1 Batch 2.5c (G16, §11.4): "확인 → 임상가설 →
                  치료·운동 결정" -- the clinician's own working-hypothesis
                  chips render immediately before PainFinalAssessmentCard,
                  only for a record driven by an approved region pack (the
                  patterns are that pack's management categories, same gate
                  PainExerciseSection already uses below).
                */}
                {regionPack && regionState && setRegionClinical && (
                  <WorkingHypothesisCard
                    patterns={regionPack.hypothesisPatterns}
                    value={regionState.workingHypothesis}
                    onChange={(next) => setRegionClinical({ workingHypothesis: next })}
                    currentPatientInstruction={workspaceState.painCarePlan.patientInstruction}
                    onInsertPatientSentence={(sentence) =>
                      setWorkspaceState((s) => ({
                        ...s,
                        painCarePlan: {
                          ...s.painCarePlan,
                          patientInstruction: appendLbpHypothesisSentenceToPatientInstruction(
                            s.painCarePlan.patientInstruction,
                            sentence,
                          ),
                          recordedAt: new Date().toISOString(),
                        },
                      }))
                    }
                  />
                )}
                <PainFinalAssessmentCard
                  value={workspaceState.painFinalAssessment}
                  onChange={(next) => setWorkspaceState((s) => ({ ...s, painFinalAssessment: next }))}
                />
                {/*
                  LBP v1 Batch 2 §8.2-1(a): exercise candidates/adoption render
                  here, immediately after PainFinalAssessmentCard, matching the
                  PO's canonical route (확인 → Working Hypothesis → 치료 방향 →
                  Exercise Eligibility → 운동) -- moved out of 레인2(확인).
                */}
                <PainExerciseSection
                  regionActive={regionPack != null}
                  rehabSuggestions={displayedPainRehabSuggestions}
                  onChangeRehabSuggestion={(next) =>
                    setWorkspaceState((s) => {
                      // Upsert: a freshly live-merged LBP candidate (readiness
                      // just recomputed above, not yet in persisted state)
                      // must still be recordable on first status change, not
                      // silently dropped by a map() that finds no match.
                      const exists = s.painRehabSuggestions.some((it) => it.id === next.id)
                      return {
                        ...s,
                        painRehabSuggestions: exists
                          ? s.painRehabSuggestions.map((it) => (it.id === next.id ? next : it))
                          : [...s.painRehabSuggestions, next],
                      }
                    })
                  }
                  // Opus delta review defect 7: only a record driven by an
                  // approved region pack has any Care Plan adoption path to
                  // begin with (this module never generates RehabSuggestion[]
                  // for any other profile/region — see rehabSuggestion.ts's
                  // file header) -- an unapproved region's pain record or a
                  // SYNTHETIC preview must never gain an adopt button that
                  // never existed before this batch.
                  onAdoptRehabSuggestionToCarePlan={
                    regionPack
                      ? (suggestion) =>
                          setWorkspaceState((s) => ({
                            ...s,
                            painCarePlan: {
                              ...s.painCarePlan,
                              homeActionPlan: appendAdoptionText(regionPack, s.painCarePlan.homeActionPlan, suggestion),
                              recordedAt: new Date().toISOString(),
                            },
                          }))
                      : undefined
                  }
                  recommendationBlockedMessageKo={regionRecommendation?.blockedMessageKo}
                  treatmentSafetyLockedReasonKo={regionRecommendation?.treatmentSafetyLockedMessageKo}
                  targetFunctionGap={regionRecommendation?.targetFunctionGap}
                  neuroUnrecorded={regionRecommendation?.neuroUnrecorded}
                  neuroUnrecordedHintKo={regionPack ? neuroUnrecordedHintForPack(regionPack) : undefined}
                  stageSuggestion={regionStageSuggestion}
                  confirmedStage={regionState?.confirmedStage ?? null}
                  // 확정값만 저장한다 — 제안(regionStageSuggestion)은 절대 여기로
                  // 흐르지 않는다. 요통은 withRegionClinical이 lbpConfirmedStage에 쓴다.
                  onSetConfirmedStage={setRegionClinical ? (next) => setRegionClinical({ confirmedStage: next }) : undefined}
                />
              </>
            )}
            {(activeProfile === 'herbal' || activeProfile === 'mixed') && (
              <HerbalFinalAssessmentCard
                value={workspaceState.herbalFinalAssessment}
                onChange={(next) => setWorkspaceState((s) => ({ ...s, herbalFinalAssessment: next }))}
              />
            )}
            {/*
              PO 지시 2026-09-25: herbal 단독에도 「재평가 대상」을 되살린다.
              PR-A가 `다음` 레인을 통째로 없애면서 이 picker까지 같이 사라졌고
              (PR #56 검수 F5), PO 판단은 레인은 그대로 두고 이 한 칸만
              되살리는 것이다.

              `herbal`에서만 렌더한다 -- mixed는 HerbalWorkspaceNext의 picker가
              그대로 살아 있어서, 여기에도 그리면 같은 값을 두 곳에서 고치게
              된다. 그 배타성을 herbal-workspace-slim이 단언한다.
            */}
            {activeProfile === 'herbal' && (
              <HerbalFollowUpTargetsCard
                followUpTargets={workspaceState.herbalFollowUpTargets}
                onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, herbalFollowUpTargets: next }))}
              />
            )}
            {activeProfile !== 'mixed' && (
              <details
                id={oppositeDetailsId}
                className="workspace__optional doctor__oppositeType"
                open={(activeProfile === 'pain' ? herbalFinalRecorded : painFinalRecorded) || additionalTypeOpen}
                onToggle={(e) => setAdditionalTypeOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary>+ 다른 유형 입력 추가 (한약·전신 ⇄ 통증)</summary>
                {activeProfile === 'pain' ? (
                  <HerbalFinalAssessmentCard
                    value={workspaceState.herbalFinalAssessment}
                    onChange={(next) => setWorkspaceState((s) => ({ ...s, herbalFinalAssessment: next }))}
                  />
                ) : (
                  <PainFinalAssessmentCard
                    value={workspaceState.painFinalAssessment}
                    onChange={(next) => setWorkspaceState((s) => ({ ...s, painFinalAssessment: next }))}
                  />
                )}
              </details>
            )}
          </section>

          </div>

          {/*
            한약 화면 축소(PR-A, PO 승인 2026-09-21): **당시** herbal 단독
            프로필에서는 `다음` 레인 전체를 렌더하지 않았다 -- 재평가 대상 칩,
            다음 방문 확인 메모, 다음 액션 카드, 관리 계획·다음 재평가
            disclosure, 참고 자료 drawer(이전 방문 / 환자 전달문 / 중복 EMR
            미리보기), CRM 복약 코스, 재진 간단문진이 여기에 전부 들어 있었고,
            PO 판단은 "오히려 못 써먹을 것 같다 / 정말 액기스만 남긴다"였다.
            pain·mixed는 전혀 건드리지 않았다 -- mixed는 HerbalWorkspaceNext까지
            지금 그대로 렌더된다.

            **그 목록 중 둘은 그 뒤 되돌아왔다** (아래 단계 래퍼 주석이 상세):
            `재평가 대상`은 2026-09-25에 판단·처치 레인으로, 재진 간단문진·EMR·
            진료 완료(= `nextLaneFooter`)는 2026-09-26에 「마무리」 단계로.
            나머지는 계속 herbal 단독에서 빠진다. 이 문단은 **PR-A 당시의
            기록**이라 현재 상태로 읽으면 안 된다.

            EMR 쪽 짝: DoctorView.tsx의 buildHerbalEmrTextForRecord(slim=true)가
            여기서 편집 UI를 잃은 키를 herbal 텍스트에서도 함께 뺀다. 화면만
            떼고 출력 라벨을 남기면 Batch 4 D-1("빈 값을 복사하고 복사됨을
            띄움")이 그대로 재현되기 때문이다.

            2026-09-25 갱신: 그 목록에서 **`재평가 대상`은 빠졌다** -- PO 지시로
            그 편집 UI가 판단·처치 레인에 되살아났으므로(아래
            HerbalFollowUpTargetsCard) slim도 그 키를 다시 넘긴다. 지금 slim이
            빼는 것은 `관리 계획 5필드`와 `다음 상세 재평가`뿐이고, 그 둘은
            여전히 편집 UI가 없다.

            2026-09-26 (PO 지시 안 1) 갱신: 한동안 **herbal 단독에는 그 EMR
            텍스트를 화면에 띄우는 곳이 없었다** -- EMR textarea·복사 버튼·재진
            발급·진료 완료가 전부 `nextLaneFooter`(DoctorView의
            nextLaneFooterNode) 안에 있고, 그게 아래 「마무리」 단계의 바깥
            프로필 가드에 걸렸기 때문이다. 즉 herbal 단독 방문은 그 방문 안에서
            진료를 끝낼 수 없었다(PR #57 검수 1번). **그 가드를 없애 메웠다** --
            아래 단계 래퍼의 주석을 볼 것. slim EMR 조립이 넘기는 키는 이제
            herbal 단독에서도 화면에 도달한다.
          */}
          {/*
            「마무리」 화면 분리: 이 레인이 통째로 「마무리」 단계다. 앵커 id
            (`next-h2`)와 클래스(`doctor__visitLane--next`)는 그대로 둔다 --
            선택자/앵커 정체성이라 이름을 바꾸면 doctor.spec / herbal-workspace
            -slim / doctor-workspace / tablet-viewport 네 스위트와 CSS가 같이
            움직여야 하고, 얻는 것은 표기 일관성뿐이다. 눈에 보이는 라벨만
            「다음」 → 「마무리」로 바꿨다.

            PO 지시 2026-09-26 (안 1): **이 단계를 herbal 단독에도 준다.**

            PR-A(2026-09-21)가 herbal 단독에서 이 레인을 통째로 없앴는데, 그
            안에는 화면 블록만 있는 게 아니라 `nextLaneFooter`(EMR 요약
            textarea·복사·재진 간단 문진 발급·메시징·**진료 완료**)가 함께
            들어 있었다. 그래서 herbal 단독 방문은 **그 방문 안에서 EMR을
            복사할 수도, 재진 링크를 발급할 수도, 진료를 완료할 수도 없었다**
            (PR #57 검수 1번). 「진료 완료」는 원래 항상 보이는 헤더에 있다가
            Core Reduction P3에서 이 레인으로 내려온 것이라, PR-A가 레인을
            지우면서 같이 사라진 것이다.

            그래서 바깥 프로필 가드를 없앤다 -- 세 프로필이 같은 구조
            (진료 / 마무리 2단계)가 된다. **PR-A가 지운 화면 블록들은 여전히
            안 돌아온다**: 아래 각 블록이 자기 프로필 가드를 그대로 들고 있고,
            herbal 단독에 해당하는 것은 `nextLaneFooter` 하나뿐이다.
            herbal-workspace-slim이 그 잔여 계약을 단언한다.
          */}
          <div className="doctor__visitStep" data-step="wrapup" hidden={visitStep !== 'wrapup'}>
          <section className="doctor__visitLane doctor__visitLane--next" aria-labelledby="next-h2">
            <h2 id="next-h2">마무리</h2>
            {(activeProfile === 'pain' || activeProfile === 'mixed') && (
              <PainWorkspaceNext
                payload={payload}
                examSuggestions={workspaceState.painExamSuggestions}
                finalAssessment={workspaceState.painFinalAssessment}
                followUpTargets={workspaceState.painFollowUpTargets}
                onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, painFollowUpTargets: next }))}
                carePlan={workspaceState.painCarePlan}
                onChangeCarePlan={(next) => setWorkspaceState((s) => ({ ...s, painCarePlan: next }))}
                nextReassessmentPlan={workspaceState.nextReassessmentPlan}
                onChangeNextReassessmentPlan={(next) => setWorkspaceState((s) => ({ ...s, nextReassessmentPlan: next }))}
                reassessment={workspaceState.painReassessment}
                priorVisits={priorVisits}
                regionPack={regionPack}
                regionWorkingHypothesis={regionState?.workingHypothesis}
                lbpDirectionalResponse={regionState?.directionalResponse ?? 'NOT_ASSESSED'}
                lbpWorkingHypothesis={workspaceState.lbpWorkingHypothesis}
                lbpObjectiveMotorDeficit={lbpObjectiveMotorDeficit}
                microFollowUpText={deltaQuoteLine}
                microFollowUpResponse={microFollowUpResponse}
                copyHint={emrPreviewCopyHint}
                onIssueCarePlanLink={onIssueCarePlanLink}
              />
            )}
            {/*
              PR-A(2026-09-21): `HerbalWorkspaceNext`(재평가 대상 칩 · 다음 방문
              확인 메모 · 다음 액션 · 관리 계획·다음 재평가 · 참고 자료 drawer)는
              **mixed에서만** 렌더된다. 2026-09-26에 바깥 프로필 가드가
              없어졌지만 이 가드는 그대로다 -- PO가 herbal 단독에 되살리라고 한
              것은 `nextLaneFooter`(EMR·발급·완료)뿐이고, 이 블록들에 대한
              PR-A 판단("정말 액기스만 남긴다")은 계속 유효하다.
            */}
            {activeProfile === 'mixed' && (
              <HerbalWorkspaceNext
                payload={payload}
                clinicianObservations={workspaceState.herbalClinicianObservations}
                safetyObservation={workspaceState.herbalSafetyObservation}
                finalAssessment={workspaceState.herbalFinalAssessment}
                followUpTargets={workspaceState.herbalFollowUpTargets}
                onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, herbalFollowUpTargets: next }))}
                carePlan={workspaceState.herbalCarePlan}
                onChangeCarePlan={(next) => setWorkspaceState((s) => ({ ...s, herbalCarePlan: next }))}
                nextReassessmentPlan={workspaceState.nextReassessmentPlan}
                onChangeNextReassessmentPlan={(next) => setWorkspaceState((s) => ({ ...s, nextReassessmentPlan: next }))}
                reassessment={workspaceState.herbalReassessment}
                priorVisits={priorVisits}
                copyHint={emrPreviewCopyHint}
                onIssueCarePlanLink={onIssueCarePlanLink}
              />
            )}
            {/*
              CRM 복약 코스도 PR-A가 herbal 단독에서 뺀 블록이다 -- 2026-09-26에
              되살린 것은 `nextLaneFooter`뿐이므로 이쪽 가드는 새로 명시한다
              (바깥 가드가 없어졌으니 안 적으면 조용히 herbal에도 붙는다).
            */}
            {activeProfile !== 'herbal' && medicationCourseSlot}
            {/*
              PO 지시 2026-09-26: 이것만 herbal 단독에도 렌더한다 -- EMR 요약
              textarea·복사, 재진 간단 문진 발급·메시징, 진료 완료가 전부 이
              안에 있다. 프로필 가드가 없는 것이 의도다.
            */}
            {nextLaneFooter}
          </section>
          </div>

          {/*
            「마무리」 단계에 이 프로필에서 실제로 들어가는 것이 있는가.

            검수(PR #58 1번)가 잡은 것: 바깥 프로필 가드를 떼면서 `showNext`까지 같이
            없앴는데, herbal 단독의 마무리 단계에 들어가는 것은 `nextLaneFooter`
            **하나뿐**이다. 그 푸터는 DoctorView가 `mode === 'server' && patient_id`
            에서만 만든다. 그래서 fixtures/미리보기 모드나 patient_id가 없는 기록에서는
            마무리 단계가 `<h2>마무리</h2>` 하나만 남고, 항상 노출되는 점프 버튼이
            원장을 **빈 화면**으로 데려간다(같은 클릭이 진료 단계를 접으므로 화면에
            헤딩만 남는다). PR-A 이전의 `showNext`가 막던 "죽은 버튼"이 자리만 옮겨
            되살아난 셈이다.

            조건을 되살리되 **기준을 바꾼다**: 프로필이 아니라 *내용물의 유무*다.
            옛 `showNext={activeProfile !== 'herbal'}`는 server 모드에서도 herbal의
            버튼을 빼서 틀렸다(이 PR이 고치려던 바로 그 구멍). 지금 식은 두 경우
            모두 맞다 -- 실제 진료(server + patient_id)에서는 herbal도 버튼이 있고,
            푸터가 없는 미리보기에서는 세 프로필 중 herbal만 버튼이 빠진다.

            pain·mixed는 `PainWorkspaceNext`(및 mixed의 `HerbalWorkspaceNext`)가 푸터와
            무관하게 항상 들어가므로 참이다.

            단계 래퍼 자체는 조건 없이 그대로 둔다 -- `visitStep`을 'wrapup'으로
            만드는 경로는 이 내비 하나뿐이라(다른 setVisitStep 호출부는 전부
            'consult'로 되돌린다) 버튼을 가리면 빈 화면은 **도달 불가**가 되고,
            숨겨진 빈 래퍼는 높이 0이라 화면에 아무 비용도 주지 않는다. 래퍼를 남기면
            세 프로필의 단계 구조가 그대로 같아서, `hidden`이 CSS에 먹히는지를 재는
            실측 스위트가 herbal에서도 계속 성립한다.
          */}
          <LaneJumpNav
            showExercise={activeProfile === 'pain' || activeProfile === 'mixed'}
            showWrapup={activeProfile !== 'herbal' || nextLaneFooter != null}
            visitStep={visitStep}
            onSelect={(id, step) => {
              if (step === visitStep) {
                jumpToLane(id)
                return
              }
              setVisitStep(step)
              setPendingJump(id)
            }}
          />
        </main>
      </div>

      {submissionId && onSaveWorkspace && (
        /*
          The visible save-status surface moved into VisitSummaryAside's
          block ⑤ (§3.2, incl. the P0-8 auth-recovery replacement) -- this
          hidden marker only keeps the pre-existing
          `workspace__saveStatus`/`data-status` DOM contract discoverable
          in the same place for any other code/test still looking for it
          here, without rendering the same interactive recovery form twice.
        */
        <div className="workspace__saveStatus" role="status" data-status={saveStatus} hidden />
      )}
    </div>
  )
}

/*
 * 서버 렌더에서 `useLayoutEffect`는 아무 일도 하지 않으면서 경고만 찍는다
 * (tests/doctor-workspace.spec.mjs 등은 이 셸을 renderToString으로 수백 번
 * 그린다 -- 매번 경고가 나오면 진짜 경고가 묻힌다). 단계 전환 뒤의 점프는
 * paint 전에 일어나야 깜빡이지 않으므로 브라우저에서는 layout effect가
 * 맞고, 서버에서는 어차피 실행되지 않으므로 `useEffect`로 낮춘다 -- 환경마다
 * 한 번 정해지는 별칭이라 훅 순서는 렌더 간에 바뀌지 않는다.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * PO 결정(HANDOFF 최신 29 → "추천에 따라 진행", 안 A): 운동 후보가 첫 화면에서
 * 4화면 아래에 있다는 실측 문제에 대한 최소 해법 -- 레인 헤딩으로 바로 가는
 * 점프 내비. 레이아웃·카드 밀도는 건드리지 않는다(안 B 기각).
 *
 * 왜 `position: sticky; bottom: 0`(fixed 아님)인가: 상단에는 이미 sticky 헤더
 * (.doctor__header)와 세로 태블릿의 sticky 요약(.doctor__visitSummary)이 있어
 * top 쌓기는 높이 계산이 깨지기 쉽다. 작업 영역의 마지막 자식으로 두고
 * bottom에 붙이면 스크롤 중엔 화면 하단에 떠 있고, 끝에 닿으면 제자리에
 * 앉는다 -- 내용을 가리지 않으므로 padding 보정도 필요 없다.
 *
 * 스크롤은 즉시(smooth 아님): 태블릿에서 결정적이고, 실측 테스트가 폴링 없이
 * 검증할 수 있다. 헤딩이 sticky 헤더(.doctor__header, 세로 태블릿에서는
 * sticky 요약 .doctor__visitSummary까지) 뒤로 숨지 않도록, 클릭 시점에 그
 * 요소들의 실제 높이를 읽어 그만큼 위에 여유를 두고 스크롤한다 -- 고정
 * CSS scroll-margin은 헤더가 줄바꿈되는 폭에서 틀린다(실측: 데스크톱 헤더
 * 114px vs 고정 72px → 헤딩이 42px 가려짐).
 */
function stickyTopOffset(): number {
  const header = document.querySelector('.doctor__header')
  const summary = document.querySelector('.doctor__visitSummary')
  const headerH = header ? header.getBoundingClientRect().height : 0
  const summaryH =
    summary && typeof window !== 'undefined' && window.getComputedStyle(summary).position === 'sticky'
      ? summary.getBoundingClientRect().height
      : 0
  return Math.max(headerH, summaryH) + 8
}

function jumpToLane(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - stickyTopOffset()
  window.scrollTo({ top: Math.max(0, top) })
}

/**
 * 「마무리」 화면 분리(PO 지시 2026-09-24): 이 내비가 그대로 단계 전환기가
 * 된다. 위에 탭 바를 따로 얹지 않는 이유는 그러면 같은 일을 하는 컨트롤이
 * 화면에 둘이 되기 때문이다 -- 이 저장소가 Batch 2.6/4에서 반복해서 다친
 * 지점이 정확히 "같은 것이 두 군데 있고 한쪽만 갱신된다"였다.
 *
 * 각 항목은 자기가 속한 단계를 들고 있다. 다른 단계의 항목을 누르면 단계를
 * 먼저 바꾸고(숨김 해제) 그 다음에 점프한다 -- 순서가 반대면 숨겨진 요소의
 * 좌표(0)를 읽는다.
 */
type VisitStep = 'consult' | 'wrapup'

const LANE_JUMP_ITEMS: ReadonlyArray<{
  id: string
  label: string
  step: VisitStep
  exerciseOnly?: boolean
}> = [
  { id: 'lane1-h2', label: '안전', step: 'consult' },
  { id: 'lane2-h2', label: '확인', step: 'consult' },
  { id: 'judgment-h2', label: '판단·처치', step: 'consult' },
  { id: 'exercise-h3', label: '운동', step: 'consult', exerciseOnly: true },
  { id: 'next-h2', label: '마무리', step: 'wrapup' },
]

/**
 * 2026-09-26 (PO 지시 안 1 + PR #58 검수 1번): `showNext` -> `showWrapup`.
 *
 * 이 내비의 원래 계약은 "**갈 데가 있는 버튼만 노출한다**"이다. PR-A 이후
 * herbal 단독에는 `다음` 레인 자체가 없어서 `showNext={activeProfile !==
 * 'herbal'}`로 뺐다. 안 1이 그 레인을 herbal에도 주면서 나는 이 조건을
 * 통째로 없앴는데 -- 그건 틀렸다. herbal 단독 마무리에 들어가는 것은
 * `nextLaneFooter` 하나뿐이고 그건 server 모드 전용이라, 미리보기에서는
 * 헤딩만 남은 **빈 화면**으로 가는 죽은 버튼이 된다.
 *
 * 그래서 조건을 프로필이 아니라 **내용물의 유무**로 다시 세웠다
 * (`showWrapup`의 실인자 -- 호출부의 주석에 근거를 적어뒀다). 옛 조건은
 * server 모드의 herbal에서도 버튼을 빼서 틀렸고, 새 조건은 두 경우 모두 맞다.
 *
 * `step === 'wrapup'`인 항목 전체를 거르는 것이지 `next-h2` 하나를 특별
 * 취급하지 않는다 -- 나중에 마무리 단계에 앵커가 하나 더 생겨도 같은 규칙이
 * 자동으로 적용된다.
 *
 * `showExercise`는 그대로다 -- 운동 섹션은 여전히 pain·mixed 전용이다.
 */
function LaneJumpNav({
  showExercise,
  showWrapup,
  visitStep,
  onSelect,
}: {
  showExercise: boolean
  showWrapup: boolean
  visitStep: VisitStep
  onSelect: (id: string, step: VisitStep) => void
}) {
  const items = LANE_JUMP_ITEMS.filter(
    (it) => (!it.exerciseOnly || showExercise) && (it.step !== 'wrapup' || showWrapup),
  )
  // 필터를 거친 뒤에 고른다 -- 걸러진 항목에 표시를 달면 아무 버튼에도 붙지
  // 않는 조합이 생긴다(예: 운동 섹션이 없는 프로필).
  const firstIdOfCurrentStep = items.find((it) => it.step === visitStep)?.id
  return (
    <nav className="doctor__laneNav" aria-label="진료 단계 바로가기">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="doctor__laneNav__btn"
          data-target={it.id}
          data-step={it.step}
          /*
            지금 보고 있는 단계 표시를 눈과 스크린리더에 따로 준다 -- 요구가
            다르기 때문이다.

            `data-current`(눈): 현재 단계에 속한 버튼 **전부**를 칠한다. 두
            단계가 같은 sticky 바를 공유하므로, 진료의 네 버튼이 한 덩어리로
            칠해지고 마무리 하나만 비어 있어야 "지금 두 화면 중 어느 쪽인가"가
            한눈에 읽힌다. 한 개만 칠하면 "지금 안전 레인에 있다"로 읽힌다.

            `aria-current="step"`(스크린리더): 같은 컨테이너 안에서 같은 종류의
            current는 **하나뿐**이어야 하므로(ARIA), 현재 단계의 **첫 항목**
            하나에만 준다. 네 개에 전부 주면 "현재 단계"가 네 번 읽힌다.

            2026-09-26(안 1)로 herbal 단독도 마무리 단계를 갖게 됐으므로, 옛
            주석이 적어둔 "herbal에서는 마무리 항목이 필터로 빠지고 단계도 항상
            'consult'"는 **더 이상 사실이 아니다**. 실제 진료(server 모드)의
            herbal은 네 버튼 + 두 단계로, pain·mixed와 똑같이 동작한다.
            푸터가 없는 미리보기에서만 마무리 항목이 빠지는데(`showWrapup`),
            그때는 단계도 'consult'에 머물러 두 표시가 진료 쪽에만 남는다 --
            `firstIdOfCurrentStep`을 **필터 뒤에** 고르는 것이 그 경우까지
            커버한다(걸러진 항목에 표시를 달지 않는다).
          */
          data-current={it.step === visitStep ? 'true' : undefined}
          aria-current={it.id === firstIdOfCurrentStep ? 'step' : undefined}
          onClick={() => onSelect(it.id, it.step)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  )
}
