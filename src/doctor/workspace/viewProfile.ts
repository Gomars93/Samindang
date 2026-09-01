/**
 * Doctor Workspace view_profile — thin wrapper around the production
 * derivation in src/spec/coreSpec.ts (doctorViewProfile), plus the
 * synthetic/manual override support the workspace shell needs for preview
 * and for a clinician who wants to check the other tab regardless of the
 * derived default (see DoctorWorkspace.tsx's profile switcher).
 */
import type { DoctorViewProfile } from '../../spec/coreSpec'
import type { DoctorPayload } from '../types'

export type { DoctorViewProfile }

export type ViewProfileBasis = {
  derived: DoctorViewProfile
  hasPainContent: boolean
  hasSystemicContent: boolean
}

/**
 * Derives the profile plus the two underlying booleans, for
 * transparency/testing/manual-override UI.
 *
 * This mirrors doctorViewProfile() in src/spec/coreSpec.ts EXACTLY (same
 * two signals, same precedence), but is implemented against the already-
 * computed `payload.routing` (DoctorPayload's shape) instead of calling
 * that function with a raw `Responses` object -- DoctorPayload does not
 * carry the raw patient Responses, only the already-built routing payload.
 * coreSpec.ts's doctorViewProfile() remains the canonical source used by
 * fixture-construction-time tests against real Responses; this is the
 * DoctorView-side read of the exact same two signals.
 */
export function deriveViewProfile(payload: DoctorPayload): ViewProfileBasis {
  const { routing } = payload
  const hasPainContent = routing.primary_module === 'Pain' || routing.additional_module === 'Pain'
  const hasSystemicContent = routing.questionnaire_mode === 'expanded' || routing.questionnaire_mode === 'herbal_addon'
  const derived: DoctorViewProfile = hasPainContent && hasSystemicContent ? 'mixed' : hasPainContent ? 'pain' : 'herbal'
  return { derived, hasPainContent, hasSystemicContent }
}

export const VIEW_PROFILE_LABEL: Record<DoctorViewProfile, string> = {
  pain: '통증',
  herbal: '한약·전신',
  mixed: '혼합',
}
