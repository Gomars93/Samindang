import { computeTmjRow } from './safetyModules'
import { SafetyModuleRowView } from './SafetyModuleRowView'
import type { DoctorPayload } from './types'

/**
 * TMJ_V1 DoctorView safety panel (턱관절/얼굴).
 *
 * v0.2 A8/Opus MINOR: 통합 안전 리스트(SafetySection.tsx) 도입 이후
 * DoctorView.tsx 렌더 트리에서는 더 이상 이 컴포넌트를 직접 쓰지 않는다
 * — **테스트 전용 standalone wrapper**로만 남겨둔다(삭제하지 않는 이유:
 * 기존 회귀 테스트가 이 컴포넌트를 독립적으로 렌더해 `computeTmjRow`
 * 계산 결과를 검증한다 — 삭제하면 그 테스트 커버리지가 사라진다).
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
