import { computeHipRow } from './safetyModules'
import { SafetyModuleRowView } from './SafetyModuleRowView'
import type { DoctorPayload } from './types'

/**
 * HIP_V1 DoctorView safety panel (고관절/사타구니).
 *
 * v0.2 A8/Opus MINOR: 통합 안전 리스트(SafetySection.tsx) 도입 이후
 * DoctorView.tsx 렌더 트리에서는 더 이상 이 컴포넌트를 직접 쓰지 않는다
 * — **테스트 전용 standalone wrapper**로만 남겨둔다(삭제하지 않는 이유:
 * 기존 회귀 테스트가 이 컴포넌트를 독립적으로 렌더해 `computeHipRow`
 * 계산 결과를 검증한다 — 삭제하면 그 테스트 커버리지가 사라진다).
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
