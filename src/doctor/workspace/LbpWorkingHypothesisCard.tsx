/**
 * "임상 가설(확정 진단 아님)" — 요통 래퍼. LBP v1 Batch 2.5c (docs/
 * LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md §11.4).
 *
 * 부위 팩 일반화(2026-09-06): 카드 본체는 `WorkingHypothesisCard.tsx`(패턴
 * 목록 prop)로 옮겼고, 이 파일은 요통 5패턴(`LBP_HYPOTHESIS_PATTERNS`)을
 * 넘기는 래퍼다. 렌더 결과는 옛 카드와 같다 —
 * `tests/lbp-working-hypothesis.spec.mjs`가 고정한다.
 */
import { WorkingHypothesisCard } from './WorkingHypothesisCard'
import { LBP_HYPOTHESIS_PATTERNS, type LbpWorkingHypothesis } from './lbpWorkingHypothesis'

export function LbpWorkingHypothesisCard({
  value,
  onChange,
  onInsertPatientSentence,
  currentPatientInstruction,
}: {
  value: LbpWorkingHypothesis
  onChange: (next: LbpWorkingHypothesis) => void
  onInsertPatientSentence?: (sentence: string) => void
  currentPatientInstruction?: string
}) {
  return (
    <WorkingHypothesisCard
      patterns={LBP_HYPOTHESIS_PATTERNS}
      value={value}
      onChange={(next) => onChange(next as LbpWorkingHypothesis)}
      onInsertPatientSentence={onInsertPatientSentence}
      currentPatientInstruction={currentPatientInstruction}
    />
  )
}
