import { computeHipRow } from './safetyModules'
import { SafetyModuleRowView } from './SafetyModuleRowView'
import type { DoctorPayload } from './types'

/**
 * HIP_V1 DoctorView safety panel (고관절/사타구니).
 *
 * Presentation-only, standalone-testable wrapper around `computeHipRow`
 * (safetyModules.ts) — the same computation the integrated safety list
 * (SafetySection.tsx) uses (Doctor View redesign v0.2 §11.1, Opus B1/B2).
 * HIP shares the `low_back_pelvis` population with LBP by design (H1/H7) —
 * its gate (`safety_flags.hip === null`) is independent of LBP's, so both
 * can be non-null simultaneously for a HIP_GROIN_DOMINANT patient.
 */
export function HipSafetyPanel({ payload }: { payload: DoctorPayload }) {
  const row = computeHipRow(payload)
  if (!row) return null
  return <SafetyModuleRowView row={row} />
}
