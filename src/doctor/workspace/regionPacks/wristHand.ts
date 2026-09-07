/**
 * 손목/손(WRIST_HAND) 부위 팩 — 빈 DRAFT (`productionApproved: false`).
 *
 * 2026-09-06 조사에서 Notion·Drive 어디에도 손목·손 패턴/운동 문서를 찾지 못했다.
 * 원장 문서가 생기기 전까지 패턴 0 · 운동 0 · 목표 기능은 자유 입력 하나뿐이다.
 */
import { buildDraftPack } from './draftPack'
import { evaluateWristHandSafety } from './regionSafety'

export const WRIST_HAND_REGION_PACK = buildDraftPack({
  region: 'wrist_hand',
  sourceDocument: 'DRAFT(빈 팩) — 원장 문서 없음 (2026-09-06 조사). 원장 승인 전.',
  hypothesisPatterns: [],
  targetFunctions: [{ id: 'wrist_hand_tf_custom', label: '기타 목표 동작', placeholder: '목표 동작을 적어주세요' }],
  exercises: [],
  clinicianAddableExams: [],
  // E-3: PR #30 범위 밖 부위 — 도메인 표 없음(원장 ② 문서에서 정한다). 운동 행은 전부 도메인 미배정으로 빈 칸에 오른다.
  rehabDomains: [],
  // 출처 표기(요통 동등성 설계 §4) — 승인 게이트. 빈 팩 — 원장 문서 없음.
  provenance: {
    hypothesisPatterns: 'CLAUDE_DRAFT',
    targetFunctions: 'CLAUDE_DRAFT',
    coreExercises: 'CLAUDE_DRAFT',
    stageTable: 'CLAUDE_DRAFT',
    clinicianAddableExams: 'CLAUDE_DRAFT',
    directSupportByExam: 'CLAUDE_DRAFT',
  },
  evaluateSafety: (payload) => evaluateWristHandSafety(payload),
})
