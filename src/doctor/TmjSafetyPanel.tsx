import { computeTmjRow } from './safetyModules'
import { SafetyModuleRowView } from './SafetyModuleRowView'
import type { DoctorPayload } from './types'

/**
 * TMJ_V1 DoctorView safety panel (턱관절/얼굴).
 *
 * Presentation-only, standalone-testable wrapper around `computeTmjRow`
 * (safetyModules.ts) — the same computation the integrated safety list
 * (SafetySection.tsx) uses (Doctor View redesign v0.2 §11.1, Opus B1/B2).
 * It never invents a diagnosis, abscess confirmation, GCA diagnosis,
 * occlusion/ROM/cranial-nerve finding, or imaging result.
 */
export function TmjSafetyPanel({ payload }: { payload: DoctorPayload }) {
  const row = computeTmjRow(payload)
  if (!row) return null
  return <SafetyModuleRowView row={row} />
}
