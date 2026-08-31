import { computeAnkleFootRow } from './safetyModules'
import { SafetyModuleRowView } from './SafetyModuleRowView'
import type { DoctorPayload } from './types'

/**
 * ANKLE_FOOT_V1 DoctorView safety panel.
 *
 * Presentation-only, standalone-testable wrapper around
 * `computeAnkleFootRow` (safetyModules.ts) — the same computation the
 * integrated safety list (SafetySection.tsx) uses, so this panel and the
 * list can never disagree (Doctor View redesign v0.2 §11.1, Opus B1/B2).
 * It never invents a diagnosis, Ottawa result, Wells score, Thompson
 * result, or objective finding.
 */
export function AnkleFootSafetyPanel({ payload }: { payload: DoctorPayload }) {
  const row = computeAnkleFootRow(payload)
  if (!row) return null
  return <SafetyModuleRowView row={row} />
}
