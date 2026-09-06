/**
 * 팔꿈치(ELBOW) 부위 팩 — 빈 DRAFT (`productionApproved: false`).
 *
 * 2026-09-06 조사에서 Notion·Drive 어디에도 팔꿈치 패턴/운동 문서를 찾지 못했다
 * (「매선 프로토콜 목차」에도 장이 없다). 원장 문서가 생기기 전까지 패턴 0 ·
 * 운동 0 · 목표 기능은 자유 입력 하나뿐이다. `packContentGaps`가 그 상태를
 * 나열하며, 승인은 불가능하다.
 */
import { buildDraftPack } from './draftPack'
import { evaluateElbowSafety } from './regionSafety'

export const ELBOW_REGION_PACK = buildDraftPack({
  region: 'elbow',
  sourceDocument: 'DRAFT(빈 팩) — 원장 문서 없음 (2026-09-06 조사). 원장 승인 전.',
  hypothesisPatterns: [],
  targetFunctions: [{ id: 'elbow_tf_custom', label: '기타 목표 동작', placeholder: '목표 동작을 적어주세요' }],
  exercises: [],
  clinicianAddableExams: [],
  evaluateSafety: (payload) => evaluateElbowSafety(payload),
})
