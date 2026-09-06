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
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CommonSafetyBanner } from '../CommonSafetyBanner'
import { ConflictBanner } from '../ConflictBanner'
import { DoctorTokenSetup } from '../DoctorTokenSetup'
import { ObjectiveExamFindingsCard, type ObjectiveExamField } from '../ObjectiveExamFindingsCard'
import { VisitSummaryAside } from './VisitSummaryAside'
import { PainFinalAssessmentCard, HerbalFinalAssessmentCard } from './FinalAssessmentCard'
import { LbpWorkingHypothesisCard } from './LbpWorkingHypothesisCard'
import { appendLbpHypothesisSentenceToPatientInstruction } from './lbpWorkingHypothesis'
import { isPainFinalAssessmentRecorded, isHerbalFinalAssessmentRecorded } from './finalAssessment'
import { computeLane1Summary, type Lane1RegionInput } from './lane1Summary'
import { lastVisitTrackedLine } from './longitudinal'
import { microFollowUpQuoteLine, readableMicroFollowUpResponse } from './microFollowUp'
import { ageFromDoctorPayload } from '../../spec/lbpAdapter'
import { answerLabel } from '../labels'
import './workspace.css'
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment, ObjectiveExamSaveOutcome } from '../judgment'
import { PainWorkspaceLane2, PainWorkspaceNext, PainExerciseSection } from './PainWorkspace'
import { useOpenOnceContent } from './FinalAssessmentCard'
import { HerbalWorkspaceLane2, HerbalWorkspaceNext } from './HerbalWorkspace'
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
import { mergeLbpExamSuggestions, LBP_CLINICIAN_ADDABLE_EXAMS } from './lbpExamSuggestions'
import type { HerbalPatternCandidate } from './patternCandidate'
import { defaultClinicianObservations, type ClinicianObservationItem } from './clinicianObservation'
import type { EvidenceItem } from './supportEngine'
import type { RehabSuggestion } from './rehabSuggestion'
import {
  buildLbpRecommendationContext,
  mergeLbpRehabSuggestions,
  appendLbpAdoptionText,
} from './lbpExerciseRecommendation'
import { suggestLbpExerciseStage, lbpStageInputFromPayload } from './lbpExerciseStage'
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
  // LBP v1 Batch 1 (G2): merges freshly-generated auto suggestions into
  // whatever is already saved (or [] for a brand-new record). A no-op for
  // any non-LBP payload (generateLbpExamSuggestions returns [] for those).
  return { ...base, painExamSuggestions: mergeLbpExamSuggestions(base.painExamSuggestions, payload) }
}

export function DoctorWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  synthetic,
  submissionId,
  resetKey,
  chartNo,
  initialWorkspaceState,
  initialRecordUpdatedAt,
  onSaveWorkspace,
  onSaveObjectiveExam,
  onReloadObjectiveExam,
  priorVisits,
  microFollowUpResponse,
  medicationCourseSlot,
  nextLaneFooter,
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
  const isLbpRecord = payload.responses.safety_flags.lbp != null
  const lbpRecommendation =
    !synthetic && isLbpRecord ? buildLbpRecommendationContext(payload, lbpObjectiveMotorDeficit, workspaceState) : null
  // 2026-09-05: 단계 제안은 오늘 문진 답변만으로 매 렌더 재계산 — 저장되지
  // 않는다. 저장되는 것은 원장 확정값(`workspaceState.lbpConfirmedStage`)뿐.
  const lbpStageSuggestion = !synthetic && isLbpRecord ? suggestLbpExerciseStage(lbpStageInputFromPayload(payload)) : null
  const displayedPainRehabSuggestions = lbpRecommendation
    ? mergeLbpRehabSuggestions(workspaceState.painRehabSuggestions, lbpRecommendation.candidates)
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
  const trackedLine = lastVisitTrackedLine(priorVisits)
  const readableMicroFollowUp = readableMicroFollowUpResponse(microFollowUpResponse ?? null)
  const deltaQuoteLine = microFollowUpQuoteLine(readableMicroFollowUp)

  // Opus closing review C-5: EmrPreviewCard's "복사는 「다음」 레인의
  // 「종결」 섹션에서 합니다." hint is only true when 종결 actually renders
  // on screen -- `nextLaneFooter` is the exact same signal DoctorView.tsx
  // already gates 종결's own render on (`nextLaneFooterNode`, gated by
  // `mode === 'server' && selectedRecord?.patient_id`), so its presence
  // here is a faithful proxy without this shell needing to know `mode`/
  // `patient_id` itself. `undefined` when absent (fixtures/preview mode,
  // legacy records with no patient_id) so EmrPreviewCard renders no hint
  // at all rather than naming a section that is not on screen.
  const emrPreviewCopyHint = nextLaneFooter != null ? '복사는 「다음」 레인의 「종결」 섹션에서 합니다.' : undefined

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
          sexAgeLine={sexAgeLine || null}
          chiefConcern={primaryConcernLabel(r)}
          durationFrequency={durationFrequencyText(r, payload.routing.primary_module)}
          lastVsDeltaLine={deltaQuoteLine}
          lane1={lane1Summary}
          saveStatus={submissionId && onSaveWorkspace ? saveStatus : undefined}
          lastSaveErrorKind={lastSaveErrorKind}
          onOpenTokenReentry={() => setTokenReentryOpen(true)}
        />

        <main className="doctor__visitWork" aria-label="진료 작업">
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
          </section>

          <section className="doctor__visitLane doctor__visitLane--lane2" aria-labelledby="lane2-h2">
            <h2 id="lane2-h2">확인</h2>
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
                microFollowUpResponse={microFollowUpResponse}
                priorVisits={priorVisits}
                lbpDirectionalResponse={workspaceState.lbpDirectionalResponse}
                onChangeLbpDirectionalResponse={(next) =>
                  setWorkspaceState((s) => ({ ...s, lbpDirectionalResponse: next }))
                }
                onAddLbpExam={(id) =>
                  setWorkspaceState((s) => {
                    if (s.painExamSuggestions.some((i) => i.id === id)) return s
                    const template = LBP_CLINICIAN_ADDABLE_EXAMS.find((i) => i.id === id)
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
                  LBP records only (the 5 patterns are LBP-specific
                  management categories, same isLbpRecord gate
                  PainExerciseSection already uses below).
                */}
                {isLbpRecord && (
                  <LbpWorkingHypothesisCard
                    value={workspaceState.lbpWorkingHypothesis}
                    onChange={(next) => setWorkspaceState((s) => ({ ...s, lbpWorkingHypothesis: next }))}
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
                  isLbp={isLbpRecord}
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
                  // Opus delta review defect 7: only an LBP record has any
                  // Care Plan adoption path to begin with (this module never
                  // generates RehabSuggestion[] for any other profile/region
                  // — see rehabSuggestion.ts's file header) -- a non-LBP pain
                  // record or a SYNTHETIC preview must never gain an adopt
                  // button that never existed before this batch.
                  onAdoptRehabSuggestionToCarePlan={
                    isLbpRecord
                      ? (suggestion) =>
                          setWorkspaceState((s) => ({
                            ...s,
                            painCarePlan: {
                              ...s.painCarePlan,
                              homeActionPlan: appendLbpAdoptionText(s.painCarePlan.homeActionPlan, suggestion),
                              recordedAt: new Date().toISOString(),
                            },
                          }))
                      : undefined
                  }
                  lbpRecommendationBlockedMessageKo={lbpRecommendation?.blockedMessageKo}
                  lbpTreatmentSafetyLockedReasonKo={lbpRecommendation?.treatmentSafetyLockedMessageKo}
                  lbpTargetFunctionGap={lbpRecommendation?.targetFunctionGap}
                  lbpNeuroUnrecorded={lbpRecommendation?.neuroUnrecorded}
                  lbpStageSuggestion={lbpStageSuggestion}
                  lbpConfirmedStage={workspaceState.lbpConfirmedStage}
                  onSetLbpConfirmedStage={(next) => setWorkspaceState((s) => ({ ...s, lbpConfirmedStage: next }))}
                />
              </>
            )}
            {(activeProfile === 'herbal' || activeProfile === 'mixed') && (
              <HerbalFinalAssessmentCard
                value={workspaceState.herbalFinalAssessment}
                onChange={(next) => setWorkspaceState((s) => ({ ...s, herbalFinalAssessment: next }))}
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

          <section className="doctor__visitLane doctor__visitLane--next" aria-labelledby="next-h2">
            <h2 id="next-h2">다음</h2>
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
                lbpDirectionalResponse={workspaceState.lbpDirectionalResponse}
                lbpWorkingHypothesis={workspaceState.lbpWorkingHypothesis}
                lbpObjectiveMotorDeficit={lbpObjectiveMotorDeficit}
                microFollowUpText={deltaQuoteLine}
                copyHint={emrPreviewCopyHint}
              />
            )}
            {(activeProfile === 'herbal' || activeProfile === 'mixed') && (
              <HerbalWorkspaceNext
                payload={payload}
                clinicianObservations={workspaceState.herbalClinicianObservations}
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
              />
            )}
            {medicationCourseSlot}
            {nextLaneFooter}
          </section>
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
