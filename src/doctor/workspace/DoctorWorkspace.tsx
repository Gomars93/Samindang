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
 * of every piece of clinician-entered workspace state (exam results,
 * herbal pattern-candidate review, clinician observations, both Final
 * Assessment cards, both follow-up target lists) instead of PainWorkspace/
 * HerbalWorkspace each holding their own local useState. Owning it here is
 * what makes debounced save-to-server possible from one place, and is what
 * makes "switch record -> old record's edits never leak into the new one"
 * a single well-tested reset path instead of N separate ones.
 *
 * Round 2 Phase 5 (profile override UX): the segmented control always
 * shows which profile was auto-derived ("자동 분류: ...") separately from
 * which one is currently on screen, and manual overrides get an explicit,
 * dismissable "수동 보기" banner naming the auto-derived profile — a
 * clinician glancing at the screen should never mistake "I clicked to a
 * different tab" for "the system reclassified this patient."
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CommonSafetyBanner } from '../CommonSafetyBanner'
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
import {
  deserializeWorkspaceState,
  emptyWorkspaceState,
  workspaceStateEquals,
  type WorkspaceState,
} from './persistence'

export type WorkspaceSyntheticData = {
  examSuggestions?: PhysicalExamSuggestion[]
  evidence?: EvidenceItem[]
  patternCandidates?: HerbalPatternCandidate[]
  clinicianObservations?: ClinicianObservationItem[]
}

const PROFILE_ORDER: DoctorViewProfile[] = ['pain', 'herbal', 'mixed']
const SAVE_DEBOUNCE_MS = 900

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  }
}

export function DoctorWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  synthetic,
  submissionId,
  initialWorkspaceState,
  onSaveWorkspace,
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
  onSaveWorkspace?: (state: WorkspaceState) => Promise<{ ok: boolean }>
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
    if (workspaceStateEquals(workspaceState, lastSavedRef.current)) return

    setSaveStatus('saving')
    const timer = setTimeout(async () => {
      const toSave: WorkspaceState = { ...workspaceState, updated_at: new Date().toISOString() }
      const result = await onSaveWorkspace(toSave)
      if (result.ok) {
        lastSavedRef.current = toSave
        setSaveStatus('saved')
      } else {
        setSaveStatus('error')
      }
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState, submissionId])

  const activeProfile = profileOverride ?? basis.derived
  const isManualOverride = profileOverride !== null && profileOverride !== basis.derived

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
      evidence={synthetic?.evidence}
      finalAssessment={workspaceState.painFinalAssessment}
      onChangeFinalAssessment={(next) => setWorkspaceState((s) => ({ ...s, painFinalAssessment: next }))}
      followUpTargets={workspaceState.painFollowUpTargets}
      onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, painFollowUpTargets: next }))}
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
      finalAssessment={workspaceState.herbalFinalAssessment}
      onChangeFinalAssessment={(next) => setWorkspaceState((s) => ({ ...s, herbalFinalAssessment: next }))}
      followUpTargets={workspaceState.herbalFollowUpTargets}
      onChangeFollowUpTargets={(next) => setWorkspaceState((s) => ({ ...s, herbalFollowUpTargets: next }))}
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
          {saveStatus === 'idle' && ' '}
        </p>
      )}
    </div>
  )
}
