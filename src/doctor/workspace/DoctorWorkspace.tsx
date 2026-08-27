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
 */
import { useState } from 'react'
import { CommonSafetyBanner } from '../CommonSafetyBanner'
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { PainWorkspace } from './PainWorkspace'
import { HerbalWorkspace } from './HerbalWorkspace'
import { deriveViewProfile, VIEW_PROFILE_LABEL, type DoctorViewProfile } from './viewProfile'
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { HerbalPatternCandidate } from './patternCandidate'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { EvidenceItem } from './supportEngine'

export type WorkspaceSyntheticData = {
  examSuggestions?: PhysicalExamSuggestion[]
  evidence?: EvidenceItem[]
  patternCandidates?: HerbalPatternCandidate[]
  clinicianObservations?: ClinicianObservationItem[]
}

const PROFILE_ORDER: DoctorViewProfile[] = ['pain', 'herbal', 'mixed']

export function DoctorWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  synthetic,
}: {
  payload: DoctorPayload
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
  shoulderObjectiveCuffWeakness?: ClinicianJudgment['shoulder_objective_cuff_weakness']
  synthetic?: WorkspaceSyntheticData
}) {
  const basis = deriveViewProfile(payload)
  const [profileOverride, setProfileOverride] = useState<DoctorViewProfile | null>(null)
  const activeProfile = profileOverride ?? basis.derived

  const [mixedTab, setMixedTab] = useState<'pain' | 'herbal'>(basis.hasPainContent ? 'pain' : 'herbal')

  const painNode = (
    <PainWorkspace
      payload={payload}
      lbpObjectiveMotorDeficit={lbpObjectiveMotorDeficit}
      shoulderObjectiveCuffWeakness={shoulderObjectiveCuffWeakness}
      examSuggestions={synthetic?.examSuggestions}
      evidence={synthetic?.evidence}
    />
  )
  const herbalNode = (
    <HerbalWorkspace
      payload={payload}
      patternCandidates={synthetic?.patternCandidates}
      clinicianObservations={synthetic?.clinicianObservations}
    />
  )

  return (
    <div className="workspace" data-view-profile={activeProfile}>
      <CommonSafetyBanner payload={payload} />

      <div className="workspace__profileBar">
        <div>
          <span className="workspace__profileBar__label">진료 화면 프로필</span>
          <span className="workspace__profileBar__hint">
            자동 판정: {VIEW_PROFILE_LABEL[basis.derived]} — 필요 시 아래에서 다른 프로필 확인 가능
          </span>
        </div>
        <div className="workspace__segmented" role="group" aria-label="워크스페이스 프로필">
          {PROFILE_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={activeProfile === p}
              className={`workspace__segmentedBtn${activeProfile === p ? ' workspace__segmentedBtn--active' : ''}`}
              onClick={() => setProfileOverride(p)}
            >
              {VIEW_PROFILE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {activeProfile === 'mixed' && (
        <nav className="workspace__tabs" aria-label="혼합 워크스페이스 탭">
          <button
            type="button"
            role="tab"
            aria-selected={mixedTab === 'pain'}
            className={`workspace__tabBtn${mixedTab === 'pain' ? ' workspace__tabBtn--active' : ''}`}
            onClick={() => setMixedTab('pain')}
          >
            통증 진료
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mixedTab === 'herbal'}
            className={`workspace__tabBtn${mixedTab === 'herbal' ? ' workspace__tabBtn--active' : ''}`}
            onClick={() => setMixedTab('herbal')}
          >
            한약·전신
          </button>
        </nav>
      )}

      {activeProfile === 'pain' && painNode}
      {activeProfile === 'herbal' && herbalNode}
      {activeProfile === 'mixed' && (mixedTab === 'pain' ? painNode : herbalNode)}
    </div>
  )
}
