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
 */
import { useEffect, useRef, useState } from 'react'
import {
  getVisit,
  saveVisitWorkspace,
  getPatientHistory,
  getSubmission,
  getMicroFollowUpResponse,
  type SubmissionRecord,
} from '../../lib/serverClient'
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
import { PainFinalAssessmentCard } from './FinalAssessmentCard'
import { PainCarePlanCard } from './CarePlanCard'
import { StructuredReassessmentCard } from './StructuredReassessmentCard'
import { NextReassessmentPlanCard } from './NextReassessmentPlanCard'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { ClinicalLoopStatusBar, type ClinicalLoopStatusItem } from './ClinicalLoopStatus'
import { PAIN_FOLLOW_UP_OPTIONS, HERBAL_FOLLOW_UP_OPTIONS } from './finalAssessment'
import { EXAM_CHECK_STATUS_LABEL } from './provenance'

const SAVE_DEBOUNCE_MS = 900
const COMBINED_FOLLOW_UP_OPTIONS = [...PAIN_FOLLOW_UP_OPTIONS, ...HERBAL_FOLLOW_UP_OPTIONS]

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function priorVisitRecapLines(priorSubmission: SubmissionRecord | null) {
  const ws = priorSubmission?.workspace
  const examLines = (ws?.painExamSuggestions ?? [])
    .filter((i) => i.result.status !== 'NOT_YET_CHECKED')
    .map((i) => `${i.title}: ${EXAM_CHECK_STATUS_LABEL[i.result.status]}${i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''}`)
  const observationLines = (ws?.herbalClinicianObservations ?? [])
    .filter((i) => i.checked)
    .map((i) => `${i.title}: ${i.value.trim()}`)
  const carePlanLines = [
    ws?.painCarePlan?.currentTreatmentGoal ? `치료 목표: ${ws.painCarePlan.currentTreatmentGoal}` : null,
    ws?.painCarePlan?.homeActionPlan ? `집에서 할 일: ${ws.painCarePlan.homeActionPlan}` : null,
    ws?.herbalCarePlan?.currentManagementGoal ? `관리 목표: ${ws.herbalCarePlan.currentManagementGoal}` : null,
  ].filter((l): l is string => l !== null)
  return { examLines, observationLines, carePlanLines }
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
  const examLines = (priorVisitWorkspace?.reassessment.items ?? [])
    .filter((i) => i.result.status !== 'NOT_YET_CHECKED')
    .map((i) => `${i.title}: ${EXAM_CHECK_STATUS_LABEL[i.result.status]}${i.result.note.trim() ? ` — ${i.result.note.trim()}` : ''}`)
  const carePlanLines = [
    priorVisitWorkspace?.carePlan.currentTreatmentGoal ? `치료 목표: ${priorVisitWorkspace.carePlan.currentTreatmentGoal}` : null,
    priorVisitWorkspace?.carePlan.homeActionPlan ? `집에서 할 일: ${priorVisitWorkspace.carePlan.homeActionPlan}` : null,
  ].filter((l): l is string => l !== null)
  // No observationLines equivalent -- a revisit's own VisitWorkspaceState
  // has no herbal-observation field (see visitWorkspace.ts's doc comment:
  // one generic set of clinician fields, not a new clinical data shape).
  return { examLines, observationLines: [] as string[], carePlanLines }
}

export function RevisitWorkspace({ visitId, patientId }: { visitId: string; patientId: string }) {
  const [loading, setLoading] = useState(true)
  const [workspaceState, setWorkspaceState] = useState<VisitWorkspaceState>(emptyVisitWorkspaceState())
  const [priorHistory, setPriorHistory] = useState<PatientHistoryResult | null>(null)
  const [priorSubmission, setPriorSubmission] = useState<SubmissionRecord | null>(null)
  const [priorVisitWorkspace, setPriorVisitWorkspace] = useState<VisitWorkspaceState | null>(null)
  const [microFollowUpResponse, setMicroFollowUpResponse] = useState<MicroFollowUpResponse | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const skipNextSaveRef = useRef(false)
  const lastSavedRef = useRef<VisitWorkspaceState>(workspaceState)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
    setMicroFollowUpResponse(null)

    async function load() {
      const [visitResult, historyResult, mfuResult] = await Promise.all([
        getVisit(visitId),
        getPatientHistory(patientId, visitId),
        getMicroFollowUpResponse(visitId),
      ])
      if (cancelled) return
      const seeded = visitResult.ok ? deserializeVisitWorkspaceState(visitResult.data.workspace) : emptyVisitWorkspaceState()
      setWorkspaceState(seeded)
      lastSavedRef.current = seeded
      if (historyResult.ok) {
        setPriorHistory(historyResult.data)
        const latest = historyResult.data.visits[0]
        if (latest?.submissionId) {
          const submissionResult = await getSubmission(latest.submissionId)
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
      }
      if (mfuResult.ok) setMicroFollowUpResponse(mfuResult.data.response)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [visitId, patientId])

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (visitWorkspaceStateEquals(workspaceState, lastSavedRef.current)) return
    setSaveStatus('saving')
    const timer = setTimeout(async () => {
      const toSave: VisitWorkspaceState = { ...workspaceState, updated_at: new Date().toISOString() }
      const result = await saveVisitWorkspace(visitId, toSave)
      if (result.ok) {
        lastSavedRef.current = toSave
        setSaveStatus('saved')
      } else {
        setSaveStatus('error')
      }
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState, visitId])

  if (loading) {
    return (
      <div className="workspace__revisit">
        <p className="workspace__empty">재진 정보를 불러오는 중…</p>
      </div>
    )
  }

  const latestPrior = priorHistory?.visits[0] ?? null
  const microFollowUpCandidates = microFollowUpCandidatesFromPriorTargets(
    latestPrior ? latestPrior.followUpTargets : [],
  )
  const { examLines, observationLines, carePlanLines } = !latestPrior
    ? { examLines: [], observationLines: [], carePlanLines: [] }
    : latestPrior.submissionId
      ? priorVisitRecapLines(priorSubmission)
      : priorVisitRecapLinesFromVisitWorkspace(priorVisitWorkspace)

  const loopStatus: ClinicalLoopStatusItem[] = [
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

      <section className="workspace__block">
        <h3>오늘 환자 입력</h3>
        <MicroFollowUpCard candidates={microFollowUpCandidates} response={microFollowUpResponse} />
      </section>

      <section className="workspace__block">
        <h3>이전 방문 참고 <span className="workspace__block__hint">읽기 전용 · 오늘 데이터로 표시하지 않습니다</span></h3>
        {!latestPrior && <p className="workspace__empty">이 환자의 이전 문진 방문 기록이 없습니다.</p>}
        {latestPrior && (
          <div className="workspace__revisit__priorRecap">
            <p className="workspace__priorVisit__date">
              최근 방문: {new Date(latestPrior.createdAt).toLocaleDateString('ko-KR')}
              {latestPrior.primaryConcern ? ` · ${latestPrior.primaryConcern}` : ''}
            </p>
            {(latestPrior.painFinalAssessmentSummary || latestPrior.herbalFinalAssessmentSummary) && (
              <p className="workspace__priorVisit__assessment">
                <strong>이전 최종 판단</strong>{' '}
                {[latestPrior.painFinalAssessmentSummary, latestPrior.herbalFinalAssessmentSummary].filter(Boolean).join(' / ')}
              </p>
            )}
            {latestPrior.followUpTargets.length > 0 && (
              <div className="workspace__priorVisit__targets">
                {latestPrior.followUpTargets.map((t) => (
                  <div key={t.id} className="workspace__priorVisit__targetRow">
                    <strong>{t.label}</strong>
                    <span>{t.baseline.trim() ? `이전 baseline: ${t.baseline.trim()}` : '이전 baseline: 기록 없음'}</span>
                    {t.postTreatmentValue.trim() && <span>이전 치료직후: {t.postTreatmentValue.trim()}</span>}
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
            {latestPrior.nextReassessmentPlan && latestPrior.nextReassessmentPlan.status !== 'UNSET' && (
              <p className="workspace__priorVisit__assessment">
                <strong>이전에 계획한 다음 재평가</strong> {latestPrior.nextReassessmentPlan.note || latestPrior.nextReassessmentPlan.status}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="workspace__block">
        <h3>오늘 원장 입력</h3>
        <StructuredReassessmentCard
          title="오늘 재검(Structured Reassessment)"
          value={workspaceState.reassessment}
          onChange={(next) => setWorkspaceState((s) => ({ ...s, reassessment: next }))}
        />
      </section>

      <ClinicalLoopStatusBar items={loopStatus} />

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
      />

      <NextReassessmentPlanCard
        value={workspaceState.nextReassessmentPlan}
        onChange={(next) => setWorkspaceState((s) => ({ ...s, nextReassessmentPlan: next }))}
      />

      <p className="workspace__saveStatus" role="status" data-status={saveStatus}>
        {saveStatus === 'saving' && '저장 중…'}
        {saveStatus === 'saved' && '저장됨'}
        {saveStatus === 'error' && '저장 실패 — 다시 시도해주세요 (아래 내용은 아직 서버에 반영되지 않았습니다)'}
        {saveStatus === 'idle' && ' '}
      </p>
    </div>
  )
}
