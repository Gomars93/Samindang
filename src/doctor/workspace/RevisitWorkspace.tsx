/**
 * Revisit Workspace shell (round 3: revisit linkage). Renders a
 * no-questionnaire revisit visit -- a visit with submission_id === null,
 * created via "재진 간단 문진 시작".
 *
 * This is deliberately NOT DoctorWorkspace/PainWorkspace/HerbalWorkspace.
 * Those all take a full DoctorPayload built from a real questionnaire
 * submission. A revisit has no questionnaire, so there is no
 * `responses`/`routing`/`flags` to build one from -- faking a DoctorPayload
 * by copying the prior visit's would silently present yesterday's patient
 * answers as if they were answered today, which this codebase's provenance
 * model forbids. Instead this component owns its own, much smaller state
 * machine with three clearly separated sections matching the mandated
 * provenance boundary:
 *
 *   오늘 환자 입력   -- MicroFollowUpCard (today's patient-reported facts only)
 *   이전 방문 참고   -- read-only recap of the LATEST prior visit's own
 *                     recorded final assessment / follow-up targets /
 *                     exam-observation findings / Care Plan -- whether that
 *                     latest prior visit is a submission-backed visit (its
 *                     detail comes from SubmissionRecord.workspace) or
 *                     itself a no-submission revisit (round 6 review fix:
 *                     its detail comes from its own visit-owned
 *                     VisitWorkspaceState, loaded read-only via getVisit).
 *                     Never editable here, never presented as today's data.
 *   오늘 원장 입력   -- the clinician's own new judgment for THIS visit,
 *                     persisted via the visit-owned VisitWorkspaceState
 *                     (PUT /api/visits/:id/workspace), completely separate
 *                     from the prior visit's own (submission-owned)
 *                     WorkspaceState -- editing here never overwrites it.
 *
 * Round 9 (routine-revisit compression): an ordinary revisit where nothing
 * has changed should cost a clinician a few clicks, not a re-typing of
 * yesterday's judgment into five open forms. Three changes, none of which
 * touch clinical meaning:
 *
 *   - the patient's own reported change is read FIRST, before anything the
 *     clinician has to fill in;
 *   - "이전 내용 이어가기" offers carry-forward of the prior visit's
 *     judgment / care plan / Follow-up Target selection, committed ONLY on
 *     an explicit click and never overwriting text already entered today
 *     (see revisitCarryForward.ts -- in particular, prior objective
 *     findings and prior measured baselines are deliberately NOT carried);
 *   - Structured Reassessment and the next-reassessment plan are collapsed
 *     behind disclosures. They are still one click away and still saved
 *     the same way; they simply stop looking mandatory on a visit where
 *     the answer is "unchanged, continue".
 */
import { useEffect, useRef, useState } from 'react'
import {
  getVisit,
  saveVisitWorkspace,
  getPatientHistory,
  getSubmission,
  getMicroFollowUpResponse,
  type SubmissionRecord,
  type VisitRecord,
} from '../../lib/serverClient'
import {
  asPriorVisitArray,
  findLatestSubmissionBackedPriorVisit,
  readablePriorVisitDateLabel,
  readablePriorVisitFollowUpTarget,
  readablePriorVisitPrimaryConcern,
  readablePriorVisitReassessmentStatusLabel,
  readablePriorVisitText,
} from './longitudinal'
import type { PatientHistoryResult } from './longitudinal'
import type { MicroFollowUpResponse } from './microFollowUp'
import { microFollowUpCandidatesFromPriorTargets } from './microFollowUp'
import { MicroFollowUpCard } from './MicroFollowUpCard'
import {
  deserializeVisitWorkspaceState,
  emptyVisitWorkspaceState,
  visitWorkspaceStateEquals,
  type VisitWorkspaceState,
} from './visitWorkspace'
import { deserializeWorkspaceState } from './persistence'
import { ConflictBanner } from '../ConflictBanner'
import { PainFinalAssessmentCard } from './FinalAssessmentCard'
import { PainCarePlanCard } from './CarePlanCard'
import { StructuredReassessmentCard } from './StructuredReassessmentCard'
import { NextReassessmentPlanCard } from './NextReassessmentPlanCard'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { ClinicalLoopStatusBar, type ClinicalLoopStatusItem } from './ClinicalLoopStatus'
import { RevisitQuickCheckCard } from './RevisitQuickCheckCard'
import { computeDetailCheckDue, summarizeRevisitQuickCheckKo } from './revisitQuickCheck'
import { LbpWorkingHypothesisCard } from './LbpWorkingHypothesisCard'
import {
  appendLbpHypothesisSentenceToPatientInstruction,
  applyLbpWorkingHypothesisCarryForward,
  isLbpWorkingHypothesisBlank,
  summarizeLbpWorkingHypothesisKo,
  type LbpWorkingHypothesis,
} from './lbpWorkingHypothesis'
import { PAIN_FOLLOW_UP_OPTIONS, HERBAL_FOLLOW_UP_OPTIONS } from './finalAssessment'
import { LBP_TARGET_FUNCTION_OPTIONS } from './lbpTargetFunction'
import { EXAM_CHECK_STATUS_LABEL, isValidExamStatus, type ExamCheckStatus } from './provenance'
import {
  applyFollowUpTargetsCarryForward,
  applyJudgmentCarryForward,
  applyTreatmentPlanCarryForward,
  carryForwardSourceFromSubmission,
  carryForwardSourceFromVisitWorkspace,
  emptyCarryForwardSource,
  isJudgmentBlank,
  isTreatmentPlanBlank,
} from './revisitCarryForward'

const SAVE_DEBOUNCE_MS = 900
// LBP v1 Batch 1 delta fix (Opus review item 1): a prior visit's carried-
// forward Follow-up Targets can include lbp_tf_* ids (revisitCarryForward.ts's
// trackingOnly() passes every target through regardless of id) -- those
// must have a chip here too, or a carried lbp_tf_* target is selected with
// no way to see/deselect it. LBP_TARGET_FUNCTION_OPTIONS goes first so its
// group renders first, matching PainWorkspaceNext.
const COMBINED_FOLLOW_UP_OPTIONS = [...LBP_TARGET_FUNCTION_OPTIONS, ...PAIN_FOLLOW_UP_OPTIONS, ...HERBAL_FOLLOW_UP_OPTIONS]
const COMBINED_FOLLOW_UP_GROUPS = [
  { label: '목표 기능(다음 방문에 같은 동작으로 비교)', ids: LBP_TARGET_FUNCTION_OPTIONS.map((o) => o.id) },
]

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

/**
 * 15차 독립 리뷰 HIGH-1: `priorSubmission.workspace`는 인증되지 않은 PUT
 * `/api/submissions/:id/workspace`가 검증 없이 저장한 원본을 그대로
 * 담고 있다 -- `deserializeVisitWorkspaceState`를 거치는 형제 분기
 * (아래 `priorVisitRecapLinesFromVisitWorkspace`, priorVisitWorkspace는
 * 로드 시점에 이미 sanitize됨)와 달리 이 함수는 그 원본을 한 번도
 * 검증하지 않고 바로 읽었다 -- 원소가 null/undefined/필드 누락이면
 * `.result`/`.status`/`.trim()` 등에서 그대로 크래시했다. 게다가 이
 * 컴포넌트는 `DoctorRecordErrorBoundary`(DoctorView.tsx) 바깥에
 * 마운트되므로, 크래시가 나면 원장이 보던 화면이 아니라 환자용
 * PatientErrorBoundary(App.tsx)의 "태블릿을 직원에게 보여주세요"로
 * 떨어지고 전체 원장 세션이 리셋됐다. deserializeWorkspaceState로
 * 먼저 정화한다.
 */
function priorVisitRecapLines(priorSubmission: SubmissionRecord | null) {
  const ws = priorSubmission?.workspace ? deserializeWorkspaceState(priorSubmission.workspace) : null
  const examLines = (ws?.painExamSuggestions ?? [])
    .filter((i) => isValidExamStatus(i.result.status) && i.result.status !== 'NOT_YET_CHECKED')
    .map((i) => `${i.title}: ${EXAM_CHECK_STATUS_LABEL[i.result.status as ExamCheckStatus]}${i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''}`)
  const observationLines = (ws?.herbalClinicianObservations ?? [])
    .filter((i) => i.checked)
    .map((i) => `${i.title}: ${i.value.trim()}`)
  const carePlanLines = [
    ws?.painCarePlan?.currentTreatmentGoal ? `치료 목표: ${ws.painCarePlan.currentTreatmentGoal}` : null,
    ws?.painCarePlan?.homeActionPlan ? `집에서 할 일: ${ws.painCarePlan.homeActionPlan}` : null,
    ws?.herbalCarePlan?.currentManagementGoal ? `관리 목표: ${ws.herbalCarePlan.currentManagementGoal}` : null,
  ].filter((l): l is string => l !== null)
  // LBP v1 Batch 2.5c (G16, §11.4): `ws` already passed through
  // `deserializeWorkspaceState` above, so `lbpWorkingHypothesis` is always a
  // well-formed (possibly all-UNJUDGED) value here, never raw/untrusted.
  const hypothesis: LbpWorkingHypothesis | null = ws?.lbpWorkingHypothesis ?? null
  return { examLines, observationLines, carePlanLines, hypothesis }
}

/**
 * §10.2 (Batch 3.1): "이전에 채택한 운동" no longer reads from whichever
 * SubmissionRecord `priorVisitRecapLines` happened to be given (that is
 * always the IMMEDIATELY PRIOR visit, which stops being submission-backed
 * from the patient's 3rd revisit onward) -- it reads from
 * `rehabSourceSubmission`, the latest SUBMISSION-BACKED visit anywhere in
 * the history (found via `findLatestSubmissionBackedPriorVisit`). Same
 * `deserializeWorkspaceState` pass as `priorVisitRecapLines` above, same
 * reasoning (never read the raw untrusted PUT body directly).
 */
function acceptedRehabTitlesFromSubmission(sub: SubmissionRecord | null): string[] {
  const ws = sub?.workspace ? deserializeWorkspaceState(sub.workspace) : null
  return (ws?.painRehabSuggestions ?? []).filter((i) => i.status === 'ACCEPTED').map((i) => i.title)
}

// Round 6 review fix (revisit-of-revisit prior context): the function above
// only reads a SUBMISSION-owned WorkspaceState (painExamSuggestions/
// herbalClinicianObservations/painCarePlan/herbalCarePlan). When the latest
// prior visit is itself a no-submission revisit, its clinician-entered data
// lives in a visit-owned VisitWorkspaceState instead (see visitWorkspace.ts)
// -- a different, generic (non Pain/Herbal-split) shape with no
// herbal-observation equivalent field by design. Without this, revisit N+1
// silently lost revisit N's Structured Reassessment/Care Plan detail even
// though the summary-level fields (final assessment text, follow-up
// targets, next reassessment plan) already carried over correctly via
// getPatientHistory's `follow_up_targets` field (round 5 fix).
function priorVisitRecapLinesFromVisitWorkspace(priorVisitWorkspace: VisitWorkspaceState | null) {
  // 15차 독립 리뷰 MEDIUM-2: priorVisitWorkspace는 이미
  // deserializeVisitWorkspaceState를 거쳤지만(컨테이너/leaf는 안전), 그
  // sanitize는 `result.status`가 문자열이라는 것만 보장할 뿐 알려진
  // ExamCheckStatus 값인지는 보장하지 않는다 -- 손상된 status가
  // `EXAM_CHECK_STATUS_LABEL[status]`에서 undefined가 되어 "이전 소견:
  // undefined"로 그대로 노출됐다.
  const examLines = (priorVisitWorkspace?.reassessment.items ?? [])
    .filter((i) => isValidExamStatus(i.result.status) && i.result.status !== 'NOT_YET_CHECKED')
    .map((i) => `${i.title}: ${EXAM_CHECK_STATUS_LABEL[i.result.status as ExamCheckStatus]}${i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''}`)
  const carePlanLines = [
    priorVisitWorkspace?.carePlan.currentTreatmentGoal ? `치료 목표: ${priorVisitWorkspace.carePlan.currentTreatmentGoal}` : null,
    priorVisitWorkspace?.carePlan.homeActionPlan ? `집에서 할 일: ${priorVisitWorkspace.carePlan.homeActionPlan}` : null,
  ].filter((l): l is string => l !== null)
  // No observationLines equivalent -- a revisit's own VisitWorkspaceState
  // has no herbal-observation field (see visitWorkspace.ts's doc comment:
  // one generic set of clinician fields, not a new clinical data shape).
  // acceptedRehabTitles no longer belongs here either (§10.2) -- a
  // revisit's own workspace has no rehab-suggestion field anyway
  // (RehabSuggestion generation is the documented LBP-submission-only
  // exception, see rehabSuggestion.ts); it now comes from
  // `acceptedRehabTitlesFromSubmission(rehabSourceSubmission?.submission)`.
  // LBP v1 Batch 2.5c (G16, §11.4): `priorVisitWorkspace` already passed
  // through `deserializeVisitWorkspaceState` when it was loaded (see the
  // load effect below), so this is never raw/untrusted.
  const hypothesis: LbpWorkingHypothesis | null = priorVisitWorkspace?.lbpWorkingHypothesis ?? null
  return { examLines, observationLines: [] as string[], carePlanLines, hypothesis }
}

// LBP v1 Batch 3 (§9.2(c)): local date, yyyy-mm-dd -- pulled into its own
// function (rather than inlined at the computeDetailCheckDue call site) so
// "today" is a single, named, replaceable seam rather than a bare
// `new Date()` scattered through the render body.
function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function RevisitWorkspace({ visitId, patientId }: { visitId: string; patientId: string }) {
  const [loading, setLoading] = useState(true)
  const [workspaceState, setWorkspaceState] = useState<VisitWorkspaceState>(emptyVisitWorkspaceState())
  const [priorHistory, setPriorHistory] = useState<PatientHistoryResult | null>(null)
  const [priorSubmission, setPriorSubmission] = useState<SubmissionRecord | null>(null)
  const [priorVisitWorkspace, setPriorVisitWorkspace] = useState<VisitWorkspaceState | null>(null)
  // §10.2 (Batch 3.1): the latest SUBMISSION-BACKED visit anywhere in the
  // history (not necessarily the immediately prior visit) -- source for
  // "이전에 채택한 운동" so that line survives past the patient's 2nd
  // revisit. `createdAt` is carried alongside so the recap can date-label
  // it without a second lookup into `priorHistory`.
  const [rehabSourceSubmission, setRehabSourceSubmission] = useState<{
    submission: SubmissionRecord
    createdAt: unknown
  } | null>(null)
  const [microFollowUpResponse, setMicroFollowUpResponse] = useState<MicroFollowUpResponse | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const skipNextSaveRef = useRef(false)
  const lastSavedRef = useRef<VisitWorkspaceState>(workspaceState)
  // Round 18: mirrors DoctorWorkspace.tsx's identical fields -- see its
  // comments. Seeded/reset entirely inside the [visitId, patientId] load
  // effect below, since this component (unlike DoctorWorkspace) owns its
  // own fetch cycle rather than receiving state from a parent.
  const lastKnownUpdatedAtRef = useRef<string | null>(null)
  const [conflict, setConflict] = useState<{ current: VisitWorkspaceState; currentUpdatedAt: string } | null>(null)
  const [preConflictDraft, setPreConflictDraft] = useState<VisitWorkspaceState | null>(null)
  // Round 18 (closing review, MEDIUM): non-null exactly when getVisit
  // failed to load this visit. Without this, a transient load failure
  // (network blip -- the visit itself still exists and still has real
  // stored content) rendered a fully editable, empty form with
  // lastKnownUpdatedAtRef left at null, and the first save then went out
  // with NO x-expected-updated-at precondition at all -- true unconditional
  // last-write-wins, silently overwriting whatever was really stored.
  // Blocking editing until a successful (re)load establishes a real
  // baseline is the fail-closed choice; `reloadNonce` lets the retry button
  // re-run the load effect without duplicating its logic.
  const [loadError, setLoadError] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    skipNextSaveRef.current = true
    // Round 7 review fix (cross-record stale-data safety): reset every
    // record-scoped piece of state BEFORE the async load starts, not just
    // on a successful fetch. Without this, if a NEW visitId/patientId's
    // getSubmission()/getVisit()/getMicroFollowUpResponse() call fails
    // after `loading` is set back to false, the PREVIOUS patient's prior-
    // visit detail/response could still be sitting in state and render
    // under the new patient -- the loading spinner only hides the window
    // while everything succeeds, it does not protect a partial failure.
    setPriorHistory(null)
    setPriorSubmission(null)
    setPriorVisitWorkspace(null)
    setRehabSourceSubmission(null)
    setMicroFollowUpResponse(null)
    // Round 18: a stale-write conflict (and its preserved draft) is scoped
    // to the PREVIOUS visit -- never let it survive into a newly-opened one.
    setConflict(null)
    setPreConflictDraft(null)

    async function load() {
      const [visitResult, historyResult, mfuResult] = await Promise.all([
        getVisit(visitId),
        getPatientHistory(patientId, visitId),
        getMicroFollowUpResponse(visitId),
      ])
      if (cancelled) return
      if (!visitResult.ok) {
        setLoadError(true)
        setLoading(false)
        return
      }
      const seeded = deserializeVisitWorkspaceState(visitResult.data.workspace)
      setWorkspaceState(seeded)
      lastSavedRef.current = seeded
      lastKnownUpdatedAtRef.current = visitResult.data.updated_at
      if (historyResult.ok) {
        setPriorHistory(historyResult.data)
        const latest = historyResult.data.visits[0]
        let latestSubmission: SubmissionRecord | null = null
        if (latest?.submissionId) {
          const submissionResult = await getSubmission(latest.submissionId)
          if (submissionResult.ok) latestSubmission = submissionResult.data
          if (!cancelled && submissionResult.ok) setPriorSubmission(submissionResult.data)
        } else if (latest) {
          // Round 6 review fix: latest prior visit is itself a no-submission
          // revisit -- load its visit-owned workspace read-only (never
          // fabricating a DoctorPayload from it) so its Structured
          // Reassessment/Care Plan detail isn't silently lost.
          const priorVisitResult = await getVisit(latest.visitId)
          if (!cancelled && priorVisitResult.ok) {
            setPriorVisitWorkspace(deserializeVisitWorkspaceState(priorVisitResult.data.workspace))
          }
        }
        // §10.2: find the latest submission-backed visit anywhere in the
        // history for "이전에 채택한 운동" -- reuse `latestSubmission` above
        // (no second fetch) when it IS that visit, otherwise one extra
        // `getSubmission` call, guarded by `cancelled` like every other
        // load-effect fetch here. A failure here is silent (stays null) --
        // it must never affect the other prior-visit recap lines above.
        const rehabSource = findLatestSubmissionBackedPriorVisit(historyResult.data.visits)
        if (rehabSource) {
          if (latest && rehabSource.visitId === latest.visitId && latestSubmission) {
            if (!cancelled) {
              setRehabSourceSubmission({ submission: latestSubmission, createdAt: rehabSource.createdAt })
            }
          } else {
            const rehabSubmissionResult = await getSubmission(rehabSource.submissionId)
            if (!cancelled && rehabSubmissionResult.ok) {
              setRehabSourceSubmission({ submission: rehabSubmissionResult.data, createdAt: rehabSource.createdAt })
            }
          }
        }
      }
      if (mfuResult.ok) setMicroFollowUpResponse(mfuResult.data.response)
      setLoading(false)
    }
    // 16차 독립 리뷰 MEDIUM-1: load()는 catch 없이 호출됐다 -- 응답 매퍼가
    // (예: serverClient.ts getPatientHistory의 `visits.map`) throw하면 그
    // rejection이 여기서 잡히지 않은 채 사라져, `loading`은 계속 true로
    // 남고 `loadError`는 절대 set되지 않았다. 이 화면이 위해 만든 명시적
    // fail-closed 경로(loadError 배너)가 그 rejection 경로에서는 아예
    // 발동하지 못하고, 원장은 "재진 정보를 불러오는 중…" 스피너에 영원히
    // 갇혔다.
    load().catch(() => {
      if (!cancelled) {
        setLoadError(true)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [visitId, patientId, reloadNonce])

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    // Round 18: fail closed on a pending conflict -- see DoctorWorkspace.tsx's
    // identical guard.
    if (conflict) return
    if (visitWorkspaceStateEquals(workspaceState, lastSavedRef.current)) return
    setSaveStatus('saving')
    const timer = setTimeout(async () => {
      const toSave: VisitWorkspaceState = { ...workspaceState, updated_at: new Date().toISOString() }
      const result = await saveVisitWorkspace(visitId, toSave, lastKnownUpdatedAtRef.current ?? undefined)
      if (result.ok) {
        lastSavedRef.current = toSave
        lastKnownUpdatedAtRef.current = result.data.updated_at
        setSaveStatus('saved')
      } else {
        // Round 18: a 409 stale-write conflict carries the server's CURRENT
        // visit record in errorBody.current (server/index.js's visit
        // workspace route) -- offer an explicit reload instead of silently
        // retrying or overwriting. Any other failure keeps the pre-existing
        // "will retry on next edit" behavior.
        const current = result.errorBody?.current as VisitRecord | undefined
        if (current) {
          setPreConflictDraft(toSave)
          setConflict({ current: deserializeVisitWorkspaceState(current.workspace), currentUpdatedAt: current.updated_at })
          setSaveStatus('conflict')
        } else {
          setSaveStatus('error')
        }
      }
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState, visitId, conflict])

  // Round 18: the only recovery action -- see DoctorWorkspace.tsx's
  // identical handler for the full reasoning.
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

  if (loading) {
    return (
      <div className="workspace__revisit">
        <p className="workspace__empty">재진 정보를 불러오는 중…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="workspace__revisit">
        <div className="doctor__banner doctor__banner--warning" role="alert">
          <strong>재진 정보를 불러오지 못했습니다</strong>
          <p>
            이 상태에서는 편집/저장을 진행할 수 없습니다 — 실제 저장된 내용을 불러오기 전에 저장을 시도하면
            기존 내용을 덮어쓸 수 있기 때문입니다. 다시 시도해주세요.
          </p>
          <button type="button" className="doctor__banner__reloadBtn" onClick={() => setReloadNonce((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  // 12차 독립 리뷰 MEDIUM-3: priorHistory.visits 자체가 배열이 아닐 수
  // 있다 -- `priorHistory?.visits[0]`은 visits가 undefined/null이면 `[0]`
  // non-optional 인덱싱에서 그대로 throw한다. 배열 원소 자체가
  // null/문자열 등 wrong-typed일 수도 있어(PriorVisitHistoryCard.tsx와
  // 동일한 이유) 한 번 더 걸러낸다.
  const latestPriorRaw = asPriorVisitArray<unknown>(priorHistory?.visits)[0]
  const latestPrior =
    latestPriorRaw !== null && typeof latestPriorRaw === 'object'
      ? (latestPriorRaw as PatientHistoryResult['visits'][number])
      : null
  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(
    latestPrior ? latestPrior.followUpTargets : [],
  )
  const {
    examLines,
    observationLines,
    carePlanLines,
    hypothesis: priorHypothesis,
  } = !latestPrior
    ? { examLines: [], observationLines: [], carePlanLines: [], hypothesis: null as LbpWorkingHypothesis | null }
    : latestPrior.submissionId
      ? priorVisitRecapLines(priorSubmission)
      : priorVisitRecapLinesFromVisitWorkspace(priorVisitWorkspace)
  const priorHypothesisSummary = priorHypothesis ? summarizeLbpWorkingHypothesisKo(priorHypothesis) : null

  // §10.2 (Batch 3.1): sourced from the latest submission-backed visit
  // ANYWHERE in the history, not just when the immediately prior visit
  // happens to be one -- see `rehabSourceSubmission`'s load-effect comment.
  const acceptedRehabTitles = acceptedRehabTitlesFromSubmission(rehabSourceSubmission?.submission ?? null)

  // LBP v1 Batch 3 (§9.2(e)): a prior REVISIT's own quick check, read
  // through the already-sanitized priorVisitWorkspace (deserializeVisitWorkspaceState
  // ran when it was loaded above) -- never the raw untrusted PUT body.
  const priorRevisitQuickCheckSummary =
    latestPrior && !latestPrior.submissionId && priorVisitWorkspace
      ? summarizeRevisitQuickCheckKo(priorVisitWorkspace.revisitQuickCheck)
      : null

  // LBP v1 Batch 3 (§9.2(c)): "세부 체크 주기 도달" -- a pure fact against a
  // plan the clinician already set on a prior visit. todayISO() is the one
  // seam a future render test could inject a fixed date through.
  const detailCheckDue = computeDetailCheckDue(priorHistory?.visits, todayISO())

  // LBP v1 Batch 2.5c (G16, §11.4): whether "이전 가설 이어받기" has
  // anything real to offer, and whether today's hypothesis is still the
  // untouched default -- both gate the button (disabled unless available
  // AND today is blank), matching the pattern the 3 carry-forward buttons
  // above already use for their own disabled/hint logic.
  const hypothesisCarryForwardAvailable = priorHypothesis !== null && !isLbpWorkingHypothesisBlank(priorHypothesis)
  const hypothesisTodayBlank = isLbpWorkingHypothesisBlank(workspaceState.lbpWorkingHypothesis)

  // Round 9: what the LATEST prior visit offers to carry forward, built
  // from whichever kind of prior visit it is. Purely a suggestion until
  // the clinician clicks -- see revisitCarryForward.ts.
  const carryForward = !latestPrior
    ? emptyCarryForwardSource()
    : latestPrior.submissionId
      ? carryForwardSourceFromSubmission(priorSubmission)
      : carryForwardSourceFromVisitWorkspace(priorVisitWorkspace)

  const judgmentBlank = isJudgmentBlank(workspaceState.finalAssessment)
  const treatmentPlanBlank = isTreatmentPlanBlank(workspaceState.finalAssessment, workspaceState.carePlan)
  const targetsBlank = workspaceState.followUpTargets.length === 0

  function carryForwardHint(available: boolean, blank: boolean): string {
    if (!available) return '이전 방문에 이어갈 기록이 없습니다'
    if (!blank) return '오늘 이미 입력된 내용이 있어 덮어쓰지 않습니다'
    return '클릭하면 오늘 기록으로 들어옵니다 (그대로 수정 가능)'
  }

  const loopStatus: ClinicalLoopStatusItem[] = [
    { key: 'quickCheck', label: '재진 간단 체크', done: workspaceState.revisitQuickCheck.recordedAt !== null },
    { key: 'assessment', label: '최종 판단 입력', done: workspaceState.finalAssessment.recordedAt !== null },
    { key: 'plan', label: '관리 계획 입력', done: workspaceState.carePlan.recordedAt !== null },
    { key: 'followup', label: '재평가 대상 선택', done: workspaceState.followUpTargets.length > 0 },
    { key: 'reassessPlan', label: '다음 재평가 계획', done: workspaceState.nextReassessmentPlan.status !== 'UNSET' },
  ]

  return (
    <div className="workspace__revisit">
      <section className="workspace__hero">
        <div className="workspace__hero__head">
          <h3>재진 · 간단 추적</h3>
          <span className="workspace__hero__hint">문진 없이 원장/직원이 개설한 재진 방문입니다</span>
        </div>
      </section>

      {conflict && (
        <ConflictBanner
          onReload={handleReloadFromConflict}
          draftJson={preConflictDraft ? JSON.stringify(preConflictDraft, null, 2) : null}
        />
      )}

      <section className="workspace__block">
        <h3>
          오늘 환자 입력{' '}
          <span className="workspace__block__hint">환자가 직접 보고한 변화 — 먼저 읽고 판단하세요</span>
        </h3>
        <MicroFollowUpCard candidates={microFollowUpCandidates} response={microFollowUpResponse} />
      </section>

      <section className="workspace__block">
        <h3>이전 방문 참고 <span className="workspace__block__hint">읽기 전용 · 오늘 데이터로 표시하지 않습니다</span></h3>
        {!latestPrior && <p className="workspace__empty">이 환자의 이전 문진 방문 기록이 없습니다.</p>}
        {latestPrior &&
          (() => {
            // 12차 독립 리뷰 MEDIUM-3: 이 블록 전체가 인증되지 않은 PUT으로
            // 검증 없이 저장된 workspace를 그대로 읽는다 --
            // PriorVisitHistoryCard.tsx와 동일한 이유로 배열 컨테이너/개별
            // target/재평가 계획 필드를 각각 방어한다.
            const finalAssessmentSummary = [
              readablePriorVisitText(latestPrior.painFinalAssessmentSummary),
              readablePriorVisitText(latestPrior.herbalFinalAssessmentSummary),
            ]
              .filter((v): v is string => Boolean(v))
              .join(' / ')
            const targets = asPriorVisitArray<unknown>(latestPrior.followUpTargets).map((t, i) =>
              readablePriorVisitFollowUpTarget(t, i),
            )
            const planValue: unknown = latestPrior.nextReassessmentPlan
            const plan =
              planValue !== null && typeof planValue === 'object' ? (planValue as Record<string, unknown>) : null
            const planShowable = plan !== null && plan.status !== 'UNSET'
            const planStatusLabel = plan ? readablePriorVisitReassessmentStatusLabel(plan.status) : null
            const planNote = plan ? readablePriorVisitText(plan.note) : null
            return (
              <div className="workspace__revisit__priorRecap">
                <p className="workspace__priorVisit__date">
                  최근 방문: {readablePriorVisitDateLabel(latestPrior.createdAt)}
                  {readablePriorVisitPrimaryConcern(latestPrior.primaryConcern)
                    ? ` · ${readablePriorVisitPrimaryConcern(latestPrior.primaryConcern)}`
                    : ''}
                </p>
                {finalAssessmentSummary && (
                  <p className="workspace__priorVisit__assessment">
                    <strong>이전 최종 판단</strong> {finalAssessmentSummary}
                  </p>
                )}
                {/* LBP v1 Batch 3 (§9.2(e)): only when the LATEST prior visit is
                    itself a revisit (submissionId === null) and its quick check
                    has at least one non-NOT_ASSESSED item. */}
                {priorRevisitQuickCheckSummary && (
                  <p className="workspace__priorVisit__assessment">{priorRevisitQuickCheckSummary}</p>
                )}
                {targets.length > 0 && (
                  <div className="workspace__priorVisit__targets">
                    {targets.map((t) => (
                      <div key={t.id} className="workspace__priorVisit__targetRow">
                        <strong>{t.label}</strong>
                        <span>{t.baselineText}</span>
                        {t.postTreatmentText && <span>이전 치료직후: {t.postTreatmentText}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {examLines.length > 0 && (
                  <p className="workspace__priorVisit__assessment">
                    <strong>이전 진찰/관찰 소견</strong> {examLines.join('; ')}
                  </p>
                )}
                {observationLines.length > 0 && (
                  <p className="workspace__priorVisit__assessment">
                    <strong>이전 설진/맥진/복진 등</strong> {observationLines.join('; ')}
                  </p>
                )}
                {carePlanLines.length > 0 && (
                  <p className="workspace__priorVisit__assessment">
                    <strong>이전 관리 계획</strong> {carePlanLines.join('; ')}
                  </p>
                )}
                {/* LBP v1 Batch 2.5c (G16, §11.4): "그 위에 이전 방문 가설
                    1줄 읽기 전용 표시" -- omitted entirely when the prior
                    visit's hypothesis is null/all-UNJUDGED. */}
                {priorHypothesisSummary && (
                  <p className="workspace__priorVisit__assessment">{priorHypothesisSummary}</p>
                )}
                {/* §10.2 (Batch 3.1): shown whenever ANY submission-backed
                    visit exists in the history with ACCEPTED
                    painRehabSuggestions -- not only when the immediately
                    prior visit is one -- so this line survives past the
                    patient's 2nd revisit. Date-labelled with the source
                    visit's own createdAt so it reads correctly even when
                    that source is several revisits back. */}
                {acceptedRehabTitles.length > 0 && (
                  <p className="workspace__priorVisit__assessment">
                    <strong>이전에 채택한 운동({readablePriorVisitDateLabel(rehabSourceSubmission?.createdAt)} 초진)</strong>{' '}
                    {acceptedRehabTitles.join(', ')}
                  </p>
                )}
                {planShowable && (
                  <p className="workspace__priorVisit__assessment">
                    <strong>이전에 계획한 다음 재평가</strong> {planNote || planStatusLabel}
                  </p>
                )}
              </div>
            )
          })()}
      </section>

      <section className="workspace__block workspace__revisit__carryForward">
        {/* The mandated third provenance section. Round 9 gives it a
            carry-forward header row, but it is still "오늘 원장 입력" --
            everything below this heading is the clinician's own record for
            THIS visit. */}
        <h3>
          오늘 원장 입력{' '}
          <span className="workspace__block__hint">
            이전 내용 이어가기 — 누를 때만 오늘 기록에 들어갑니다 · 이전 진찰 소견과 이전 측정값은 이어가지
            않습니다
          </span>
        </h3>
        <div className="workspace__revisit__carryForward__actions">
          {/* Round 10 review fix: each action writes EXACTLY the fields its
              label names. 시행/예정 처치 and 즉시 재검 대상 are treatment
              records, so they moved out of the judgment action and under
              the 처치·관리계획 one -- a judgment-labelled click can no
              longer author today's treatment text. */}
          <button
            type="button"
            className="workspace__btn"
            disabled={!carryForward.judgment || !judgmentBlank}
            title={`최종 임상 판단 · 치료 초점만 채웁니다 — ${carryForwardHint(Boolean(carryForward.judgment), judgmentBlank)}`}
            onClick={() =>
              setWorkspaceState((s) => applyJudgmentCarryForward(s, carryForward, new Date().toISOString()))
            }
          >
            이전 판단 유지
          </button>
          <button
            type="button"
            className="workspace__btn"
            disabled={!carryForward.treatmentPlan || !treatmentPlanBlank}
            title={`시행/예정 처치 · 즉시 재검 대상 · 관리 계획을 채웁니다 — ${carryForwardHint(Boolean(carryForward.treatmentPlan), treatmentPlanBlank)}`}
            onClick={() =>
              setWorkspaceState((s) => applyTreatmentPlanCarryForward(s, carryForward, new Date().toISOString()))
            }
          >
            이전 처치·관리계획 유지
          </button>
          <button
            type="button"
            className="workspace__btn"
            disabled={carryForward.followUpTargets.length === 0 || !targetsBlank}
            title={`추적 항목 선택만 이어갑니다(이전 측정값은 가져오지 않습니다) — ${carryForwardHint(carryForward.followUpTargets.length > 0, targetsBlank)}`}
            onClick={() => setWorkspaceState((s) => applyFollowUpTargetsCarryForward(s, carryForward))}
          >
            기존 Follow-up Target 유지
          </button>
        </div>
        <p className="workspace__revisit__carryForward__note">
          변화가 없는 일상적인 재진이면 위 버튼으로 이어간 뒤 필요한 부분만 고치면 됩니다. 각 버튼은 이름에
          적힌 항목만 채웁니다 — <strong>이전 판단 유지</strong>는 최종 임상 판단·치료 초점만,
          <strong>이전 처치·관리계획 유지</strong>가 시행/예정 처치·즉시 재검 대상·관리 계획을 담당합니다.
          오늘 새로 확인한 진찰 소견은 아래 &quot;오늘 재검&quot;에 직접 기록하세요 — 이전 소견이나 이전
          측정값이 오늘 기록으로 복사되는 일은 없습니다.
        </p>
      </section>

      <ClinicalLoopStatusBar items={loopStatus} />

      <RevisitQuickCheckCard
        value={workspaceState.revisitQuickCheck}
        onChange={(next) => setWorkspaceState((s) => ({ ...s, revisitQuickCheck: next }))}
      />

      {/*
        LBP v1 Batch 2.5c (G16, §11.4): "재진: 같은 카드 재사용... 기존
        이어받기 행 관례로 '이전 가설 이어받기' 버튼(오늘 값이 전부
        UNJUDGED일 때만 활성). 자동 적용 없음." -- a DEDICATED action, never
        folded into the generic "이전 내용 이어가기" row above (that row's
        source, revisitCarryForward.ts, never references the hypothesis at
        all -- see lbpWorkingHypothesis.ts's file header). The prior visit's
        own hypothesis summary already rendered read-only in "이전 방문
        참고" above (`priorHypothesisSummary`); this is only the carry-
        forward action itself.
      */}
      <div className="workspace__revisit__carryForward__actions">
        <button
          type="button"
          className="workspace__btn"
          disabled={!hypothesisCarryForwardAvailable || !hypothesisTodayBlank}
          title={`임상 가설만 채웁니다 — ${carryForwardHint(hypothesisCarryForwardAvailable, hypothesisTodayBlank)}`}
          onClick={() =>
            setWorkspaceState((s) => ({
              ...s,
              lbpWorkingHypothesis: applyLbpWorkingHypothesisCarryForward(
                s.lbpWorkingHypothesis,
                priorHypothesis,
                new Date().toISOString(),
              ),
            }))
          }
        >
          이전 가설 이어받기
        </button>
      </div>

      <LbpWorkingHypothesisCard
        value={workspaceState.lbpWorkingHypothesis}
        onChange={(next) => setWorkspaceState((s) => ({ ...s, lbpWorkingHypothesis: next }))}
        onInsertPatientSentence={(sentence) =>
          setWorkspaceState((s) => ({
            ...s,
            carePlan: {
              ...s.carePlan,
              patientInstruction: appendLbpHypothesisSentenceToPatientInstruction(s.carePlan.patientInstruction, sentence),
              recordedAt: new Date().toISOString(),
            },
          }))
        }
      />

      <PainFinalAssessmentCard
        value={workspaceState.finalAssessment}
        onChange={(next) => setWorkspaceState((s) => ({ ...s, finalAssessment: next }))}
      />

      <PainCarePlanCard
        value={workspaceState.carePlan}
        onChange={(next) => setWorkspaceState((s) => ({ ...s, carePlan: next }))}
      />

      <FollowUpTargetPicker
        options={COMBINED_FOLLOW_UP_OPTIONS}
        selected={workspaceState.followUpTargets}
        onChange={(next) => setWorkspaceState((s) => ({ ...s, followUpTargets: next }))}
        showPostTreatmentField
        groups={COMBINED_FOLLOW_UP_GROUPS}
      />

      {/* LBP v1 Batch 3 (§9.2(c)): a pure fact readout, never auto-opening
          the disclosure below it -- the clinician still decides whether to
          act on it. */}
      {detailCheckDue && (
        <p className="workspace__revisit__detailCheckDue" role="status">
          이전에 계획한 세부 재검 시점입니다({detailCheckDue.planLabel}) — 아래 &apos;오늘 재검&apos;을 펼쳐
          진행할지 원장이 정합니다.
        </p>
      )}

      {/* Round 9: collapsed by default so a routine "unchanged, continue"
          revisit does not present two more mandatory-looking forms. Both
          stay one click away and save exactly as before -- and each opens
          automatically when it already holds content, so a visit that DID
          need them never hides what was recorded. */}
      <details className="workspace__revisit__optional" open={workspaceState.reassessment.items.length > 0}>
        <summary>오늘 재검(Structured Reassessment) — 필요할 때 펼치기</summary>
        <StructuredReassessmentCard
          title="오늘 재검(Structured Reassessment)"
          value={workspaceState.reassessment}
          onChange={(next) => setWorkspaceState((s) => ({ ...s, reassessment: next }))}
        />
      </details>

      <details
        className="workspace__revisit__optional"
        open={workspaceState.nextReassessmentPlan.status !== 'UNSET'}
      >
        <summary>다음 재평가 계획 변경 — 필요할 때 펼치기</summary>
        <NextReassessmentPlanCard
          value={workspaceState.nextReassessmentPlan}
          onChange={(next) => setWorkspaceState((s) => ({ ...s, nextReassessmentPlan: next }))}
        />
      </details>

      <p className="workspace__saveStatus" role="status" data-status={saveStatus}>
        {saveStatus === 'saving' && '저장 중…'}
        {saveStatus === 'saved' && '저장됨'}
        {saveStatus === 'error' && '저장 실패 — 다시 시도해주세요 (아래 내용은 아직 서버에 반영되지 않았습니다)'}
        {saveStatus === 'conflict' && '저장 중단됨 — 위 안내를 확인해주세요'}
        {saveStatus === 'idle' && ' '}
      </p>
    </div>
  )
}
