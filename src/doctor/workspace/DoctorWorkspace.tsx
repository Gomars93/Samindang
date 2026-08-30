/**
 * Doctor Clinical Workspace shell (PR #24 Phase 2). Renders, in order:
 * Common Safety (never behind a tab) -> profile switcher -> Pain and/or
 * Herbal workspace depending on view_profile.
 *
 * The derived view_profile is always shown pre-selected, but the
 * clinician can freely switch to the other profile at any time (manual
 * override) -- this is a UI convenience, never a hidden data change: both
 * workspaces read from the exact same `payload`, so switching tabs never
 * loses or fabricates information.
 *
 * Round 2 Phase 2 (persistence): this component is now the single owner
 * of every piece of clinician-entered workspace state instead of
 * PainWorkspace/HerbalWorkspace each holding their own local useState.
 * Owning it here is what makes debounced save-to-server possible from one
 * place, and is what makes "switch record -> old record's edits never
 * leak into the new one" a single well-tested reset path instead of N
 * separate ones.
 *
 * Round 2 Phase 5 (profile override UX): the segmented control always
 * shows which profile was auto-derived ("자동 분류: ...") separately from
 * which one is currently on screen, and manual overrides get an explicit,
 * dismissable "수동 보기" banner naming the auto-derived profile.
 *
 * Round 3: adds Care Plan (Phase A), NextReassessmentPlan (Phase B),
 * Structured Reassessment (Phase E) with an explicit per-item "재검 항목으로
 * 추가" promotion from an already-recorded exam/observation, a Rehab
 * suggestion framework (Phase I, empty in production), an Additional
 * Concern compact card + manual flag (Phase H, never mutates routing), a
 * Clinical Loop Status cue (Phase G), and prior-visit RAW history display
 * (Phase C, `priorVisits` is fetched by the caller -- this component stays
 * free of network code, same pattern as everything else here).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CommonSafetyBanner } from '../CommonSafetyBanner'
import { ConflictBanner } from '../ConflictBanner'
import './workspace.css'
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { PainWorkspace } from './PainWorkspace'
import { HerbalWorkspace } from './HerbalWorkspace'
import { deriveViewProfile, VIEW_PROFILE_LABEL, type DoctorViewProfile } from './viewProfile'
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { HerbalPatternCandidate } from './patternCandidate'
import { defaultClinicianObservations, type ClinicianObservationItem } from './clinicianObservation'
import type { EvidenceItem } from './supportEngine'
import type { RehabSuggestion } from './rehabSuggestion'
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

const PROFILE_ORDER: DoctorViewProfile[] = ['pain', 'herbal', 'mixed']
const SAVE_DEBOUNCE_MS = 900

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

function seedWorkspaceState(
  initial: WorkspaceState | null | undefined,
  synthetic: WorkspaceSyntheticData | undefined,
): WorkspaceState {
  if (initial) return deserializeWorkspaceState(initial)
  const empty = emptyWorkspaceState()
  return {
    ...empty,
    painExamSuggestions: synthetic?.examSuggestions ?? [],
    herbalPatternCandidates: synthetic?.patternCandidates ?? [],
    herbalClinicianObservations: synthetic?.clinicianObservations ?? defaultClinicianObservations(),
    painRehabSuggestions: synthetic?.rehabSuggestions ?? [],
  }
}

export function DoctorWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  synthetic,
  submissionId,
  initialWorkspaceState,
  initialRecordUpdatedAt,
  onSaveWorkspace,
  priorVisits,
  microFollowUpResponse,
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
  /** Round 3 Phase C: already-fetched prior-visit RAW history for this exact patient_id, or undefined/null when unavailable (fixtures mode, no server, or nothing prior). */
  priorVisits?: PatientHistoryResult | null
  /** Round 3 Phase D: already-fetched micro follow-up response for THIS visit, or undefined/null when unavailable/not yet answered. */
  microFollowUpResponse?: MicroFollowUpResponse | null
}) {
  const basis = deriveViewProfile(payload)
  const [profileOverride, setProfileOverride] = useState<DoctorViewProfile | null>(null)
  const [mixedTab, setMixedTab] = useState<'pain' | 'herbal'>(basis.hasPainContent ? 'pain' : 'herbal')

  // The strongest available stable identity for "is this still the same
  // record" — the server record id when we have one (server mode), falling
  // back to session_id only for fixtures/synthetic previews that have no
  // server id at all. Never a patient-identifying field (name/phone/DOB).
  const recordKey = submissionId ?? payload.session_id

  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() =>
    seedWorkspaceState(initialWorkspaceState, synthetic),
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

  // Reset the manual profile override / mixed-tab choice / all
  // clinician-entered workspace state whenever the underlying record
  // changes (a different real submission, or a different SYNTHETIC preview
  // scenario/fixture) -- otherwise a clinician's earlier edits on record A
  // would silently carry over to record B. This is React's documented
  // "adjusting state when a prop changes" pattern (a plain state update
  // during render, guarded by comparing against the last-seen id) rather
  // than a `key`-based remount: keying this component was tried first and
  // triggered an unrelated React reconciliation issue where the previous
  // instance was not removed from the DOM (two `.workspace` roots stayed
  // mounted simultaneously) -- confirmed via headless-browser inspection,
  // not assumed. This render-time-reset approach does not have that
  // problem and was verified fixed the same way.
  const [lastSeenRecordKey, setLastSeenRecordKey] = useState(recordKey)
  if (recordKey !== lastSeenRecordKey) {
    setLastSeenRecordKey(recordKey)
    setProfileOverride(null)
    setMixedTab(basis.hasPainContent ? 'pain' : 'herbal')
    const seeded = seedWorkspaceState(initialWorkspaceState, synthetic)
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
  }

  // Round 18 fix (caught by real two-browser-context QA): `initialRecordUpdatedAt`
  // legitimately advances for the SAME record without DoctorWorkspace ever
  // saving anything -- e.g. the automatic "mark as viewed" status write
  // that fires the instant a submission is opened, or an independent
  // JudgmentPanel save on the same submission. Without tracking that,
  // DoctorWorkspace's very first autosave attempt on almost every record
  // would 409 against a sibling's write.
  //
  // Closing-review finding (HIGH): the first version of this fix adopted
  // the newer TOKEN without also adopting the CONTENT it came with. A
  // per-record `updated_at` cannot certify per-FIELD freshness across two
  // independently-seeded editors of the same record (this panel owns
  // `workspace`, JudgmentPanel owns `judgment`) -- adopting a token that
  // was actually bumped by a SIBLING's write, while this panel's own
  // `workspace` content stays whatever was seeded at mount/last save, lets
  // a LATER save from this panel pass CAS while silently overwriting
  // whatever a different writer (another tab, or this same tab's own
  // sibling panel round-tripping through DoctorView) had written to
  // `workspace` in between. Repro: tab B saves workspace (v0->v1); tab A's
  // JudgmentPanel independently reloads-and-saves its OWN field, which
  // bumps v1->v2 and hands DoctorWorkspace a fresh `initialRecordUpdatedAt`
  // of v2 -- if DoctorWorkspace blindly adopted v2 while still holding its
  // OWN stale pre-B `workspaceState`, tab A's next keystroke would save
  // that stale content at v2 and succeed, discarding tab B's real edit
  // with no conflict ever shown.
  //
  // Fixed by only ever adopting the newer token TOGETHER with the fresh
  // content it came with (`initialWorkspaceState`), and ONLY when this
  // panel has no unsaved local edits of its own
  // (`workspaceStateEquals(workspaceState, lastSavedRef.current)`). If
  // edits ARE pending, this deliberately does nothing and lets the
  // ordinary save-time CAS check catch it -- an occasional false-positive
  // conflict banner (nothing lost: the draft is preserved, per
  // ConflictBanner) is the correct fail-closed outcome; silently adopting
  // a token while keeping stale content is not.
  //
  // Empirical fix (caught by re-running the real-browser QA against the
  // closing review's exact repro, not by reasoning alone): this effect
  // must depend ONLY on `initialRecordUpdatedAt`, never on `workspaceState`
  // itself. `handleReloadFromConflict` below also calls `setWorkspaceState`
  // -- if this effect also re-ran on every `workspaceState` change, that
  // very setWorkspaceState call would immediately re-trigger it, and since
  // `initialRecordUpdatedAt` (DoctorView's OWN prop, untouched by this
  // panel's purely-local reload) is still the OLD stale value while
  // `lastKnownUpdatedAtRef.current` now correctly holds the fresh
  // `conflict.currentUpdatedAt`, the effect's inequality check
  // (`!==`, not "is initialRecordUpdatedAt actually NEWER") would pass and
  // silently regress the just-reloaded token back down to the stale prop
  // value -- undoing the reload and reproducing the exact 409-loop this
  // whole mechanism exists to prevent. The pristine check inside still
  // reads the current `workspaceState`/`lastSavedRef` via closure every
  // time the effect actually runs; it does not need to be a dependency.
  useEffect(() => {
    if (initialRecordUpdatedAt == null || initialRecordUpdatedAt === lastKnownUpdatedAtRef.current) return
    if (!workspaceStateEquals(workspaceState, lastSavedRef.current)) return
    const fresh = seedWorkspaceState(initialWorkspaceState, synthetic)
    lastKnownUpdatedAtRef.current = initialRecordUpdatedAt
    lastSavedRef.current = fresh
    skipNextSaveRef.current = true
    setWorkspaceState(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecordUpdatedAt])

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
    const timer = setTimeout(async () => {
      const toSave: WorkspaceState = { ...workspaceState, updated_at: new Date().toISOString() }
      const result = await onSaveWorkspace(toSave, lastKnownUpdatedAtRef.current)
      if (result.ok) {
        lastSavedRef.current = toSave
        lastKnownUpdatedAtRef.current = result.updatedAt
        setSaveStatus('saved')
      } else if (result.conflict) {
        setPreConflictDraft(toSave)
        setConflict(result.conflict)
        setSaveStatus('conflict')
      } else {
        setSaveStatus('error')
      }
    }, SAVE_DEBOUNCE_MS)
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

  const activeProfile = profileOverride ?? basis.derived
  const isManualOverride = profileOverride !== null && profileOverride !== basis.derived

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

  const painNode = (
    <PainWorkspace
      payload={payload}
      lbpObjectiveMotorDeficit={lbpObjectiveMotorDeficit}
      shoulderObjectiveCuffWeakness={shoulderObjectiveCuffWeakness}
      examSuggestions={workspaceState.painExamSuggestions}
      onChangeExamSuggestion={(next) =>
        setWorkspaceState((s) => ({
          ...s,
          painExamSuggestions: s.painExamSuggestions.map((i) => (i.id === next.id ? next : i)),
        }))
      }
      onAddExamToReassessment={addPainExamToReassessment}
      evidence={synthetic?.evidence}
      finalAssessment={workspaceState.painFinalAssessment}
      onChangeFinalAssessment={(next) => setWorkspaceState((s) => ({ ...s, painFinalAssessment: next }))}
      followUpTargets={workspaceState.painFollowUpTargets}
      onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, painFollowUpTargets: next }))}
      carePlan={workspaceState.painCarePlan}
      onChangeCarePlan={(next) => setWorkspaceState((s) => ({ ...s, painCarePlan: next }))}
      nextReassessmentPlan={workspaceState.nextReassessmentPlan}
      onChangeNextReassessmentPlan={(next) => setWorkspaceState((s) => ({ ...s, nextReassessmentPlan: next }))}
      reassessment={workspaceState.painReassessment}
      onChangeReassessment={(next) => setWorkspaceState((s) => ({ ...s, painReassessment: next }))}
      rehabSuggestions={workspaceState.painRehabSuggestions}
      onChangeRehabSuggestion={(next) =>
        setWorkspaceState((s) => ({
          ...s,
          painRehabSuggestions: s.painRehabSuggestions.map((r) => (r.id === next.id ? next : r)),
        }))
      }
      additionalConcernPromotion={workspaceState.additionalConcernPromotion}
      onChangeAdditionalConcernPromotion={(next) => setWorkspaceState((s) => ({ ...s, additionalConcernPromotion: next }))}
      priorVisits={priorVisits}
      microFollowUpResponse={microFollowUpResponse}
    />
  )
  const herbalNode = (
    <HerbalWorkspace
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
      finalAssessment={workspaceState.herbalFinalAssessment}
      onChangeFinalAssessment={(next) => setWorkspaceState((s) => ({ ...s, herbalFinalAssessment: next }))}
      followUpTargets={workspaceState.herbalFollowUpTargets}
      onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, herbalFollowUpTargets: next }))}
      carePlan={workspaceState.herbalCarePlan}
      onChangeCarePlan={(next) => setWorkspaceState((s) => ({ ...s, herbalCarePlan: next }))}
      nextReassessmentPlan={workspaceState.nextReassessmentPlan}
      onChangeNextReassessmentPlan={(next) => setWorkspaceState((s) => ({ ...s, nextReassessmentPlan: next }))}
      reassessment={workspaceState.herbalReassessment}
      onChangeReassessment={(next) => setWorkspaceState((s) => ({ ...s, herbalReassessment: next }))}
      priorVisits={priorVisits}
      microFollowUpResponse={microFollowUpResponse}
    />
  )

  const painTabId = useId()
  const herbalTabId = useId()
  const painPanelId = useId()
  const herbalPanelId = useId()
  const tabRefs = useRef<Record<'pain' | 'herbal', HTMLButtonElement | null>>({ pain: null, herbal: null })

  function handleTabKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const order: Array<'pain' | 'herbal'> = ['pain', 'herbal']
    const currentIndex = order.indexOf(mixedTab)
    let nextIndex = currentIndex
    if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + order.length) % order.length
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % order.length
    if (e.key === 'Home') nextIndex = 0
    if (e.key === 'End') nextIndex = order.length - 1
    const next = order[nextIndex]
    setMixedTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="workspace" data-view-profile={activeProfile}>
      <CommonSafetyBanner payload={payload} />

      {conflict && (
        <ConflictBanner
          onReload={handleReloadFromConflict}
          draftJson={preConflictDraft ? JSON.stringify(preConflictDraft, null, 2) : null}
        />
      )}

      <div className="workspace__profileBar">
        <div>
          <span className="workspace__profileBar__label">진료 화면 프로필</span>
          <span className="workspace__profileBar__hint">
            자동 분류: {VIEW_PROFILE_LABEL[basis.derived]} — 필요 시 아래에서 다른 프로필 확인 가능
          </span>
        </div>
        <div className="workspace__segmented" role="group" aria-label="워크스페이스 프로필 — 현재 보는 화면">
          {PROFILE_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={activeProfile === p}
              className={`workspace__segmentedBtn${activeProfile === p ? ' workspace__segmentedBtn--active' : ''}`}
              onClick={() => setProfileOverride(p === basis.derived ? null : p)}
            >
              {VIEW_PROFILE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {isManualOverride && (
        <p className="workspace__overrideNotice" role="status">
          수동 보기 · 원래 자동 분류: {VIEW_PROFILE_LABEL[basis.derived]}
          <button
            type="button"
            className="workspace__overrideNotice__reset"
            onClick={() => setProfileOverride(null)}
          >
            자동 분류로 되돌리기
          </button>
        </p>
      )}

      {activeProfile === 'mixed' && (
        <nav
          className="workspace__tabs"
          role="tablist"
          aria-label="혼합 워크스페이스 탭"
          onKeyDown={handleTabKeyDown}
        >
          <button
            ref={(el) => {
              tabRefs.current.pain = el
            }}
            type="button"
            id={painTabId}
            role="tab"
            aria-selected={mixedTab === 'pain'}
            aria-controls={painPanelId}
            tabIndex={mixedTab === 'pain' ? 0 : -1}
            className={`workspace__tabBtn${mixedTab === 'pain' ? ' workspace__tabBtn--active' : ''}`}
            onClick={() => setMixedTab('pain')}
          >
            통증 진료
          </button>
          <button
            ref={(el) => {
              tabRefs.current.herbal = el
            }}
            type="button"
            id={herbalTabId}
            role="tab"
            aria-selected={mixedTab === 'herbal'}
            aria-controls={herbalPanelId}
            tabIndex={mixedTab === 'herbal' ? 0 : -1}
            className={`workspace__tabBtn${mixedTab === 'herbal' ? ' workspace__tabBtn--active' : ''}`}
            onClick={() => setMixedTab('herbal')}
          >
            한약·전신
          </button>
        </nav>
      )}

      {activeProfile === 'pain' && painNode}
      {activeProfile === 'herbal' && herbalNode}
      {activeProfile === 'mixed' && (
        <>
          <div id={painPanelId} role="tabpanel" aria-labelledby={painTabId} hidden={mixedTab !== 'pain'}>
            {mixedTab === 'pain' && painNode}
          </div>
          <div id={herbalPanelId} role="tabpanel" aria-labelledby={herbalTabId} hidden={mixedTab !== 'herbal'}>
            {mixedTab === 'herbal' && herbalNode}
          </div>
        </>
      )}

      {submissionId && onSaveWorkspace && (
        <p className="workspace__saveStatus" role="status" data-status={saveStatus}>
          {saveStatus === 'saving' && '저장 중…'}
          {saveStatus === 'saved' && '저장됨'}
          {saveStatus === 'error' && '저장 실패 — 다시 시도해주세요 (아래 내용은 아직 서버에 반영되지 않았습니다)'}
          {saveStatus === 'conflict' && '저장 중단됨 — 위 안내를 확인해주세요'}
          {saveStatus === 'idle' && ' '}
        </p>
      )}
    </div>
  )
}
