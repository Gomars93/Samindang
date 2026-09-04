/**
 * Micro Follow-up display (round 3 Phase D). Shows two RAW, read-only
 * things -- never a computed judgment:
 *  1. `candidates`: the PREVIOUS visit's own Follow-up Targets, carried
 *     forward as what a short next-visit check-in would ask about.
 *  2. `response`: the patient's actual short answers for THIS visit, if
 *     any exist yet -- entered either by staff/doctor directly, or (since
 *     round 4) submitted by the patient's own device via the one-time
 *     `#follow-up=<token>` link (see microFollowUp.ts's doc comment).
 *
 * A reported new symptom/adverse effect only opens the card and shows an
 * "추가 확인 필요" flag -- it never changes any routing, safety computation,
 * or Safety Mini-Gate question.
 */
import type { MicroFollowUpCandidateItem, MicroFollowUpResponse } from './microFollowUp'
import { microFollowUpNeedsAttention, readableMicroFollowUpResponse } from './microFollowUp'

export function MicroFollowUpCard({
  candidates,
  response: rawResponse,
}: {
  candidates: MicroFollowUpCandidateItem[]
  response: MicroFollowUpResponse | null
}) {
  // 13차 독립 리뷰 MEDIUM-1: rawResponse는 서버가 검증 없이 저장한
  // MicroFollowUpResponse를 그대로 넘겨받는다 -- 원소/leaf 단위로 다시
  // 검증한다(microFollowUp.ts의 readableMicroFollowUpResponse 참고).
  const response = readableMicroFollowUpResponse(rawResponse)
  if (candidates.length === 0 && !response) return null
  const needsAttention = response ? microFollowUpNeedsAttention(response) : false

  return (
    <details className="workspace__microFollowUp" open={needsAttention}>
      <summary>
        간단 재확인(Micro Follow-up)
        {needsAttention && <span className="workspace__microFollowUp__flag">추가 확인 필요</span>}
        <span className="workspace__microFollowUp__hint">· 참고용 raw 값, 자동 판단 없음</span>
      </summary>
      {/* Batch 2.6 (E-14/C-9): the candidate list (this visit's carried-
          forward prior Follow-up Targets) is intentionally not rendered
          here anymore -- the revisit screen's own "이전 방문 참고" block
          already shows the same targets (RevisitWorkspace.tsx). `candidates`
          is still accepted and still decides whether this card renders at
          all (below) and whether it counts as needing attention elsewhere;
          only the duplicate list display is gone. Everything about the
          patient's own responses is unchanged. */}
      <div className="workspace__microFollowUp__body">
        {response ? (
          <div className="workspace__microFollowUp__section">
            <p className="workspace__microFollowUp__label">환자 응답 (오늘)</p>
            {response.targetRatings.map((r) => (
              <div key={r.targetId} className="workspace__microFollowUp__row">
                <strong>{r.label}</strong>
                <span>{r.patientReportedValue.trim() || '응답 없음'}</span>
              </div>
            ))}
            {response.overallChange.trim() && (
              <p className="workspace__microFollowUp__line">전반적 변화: {response.overallChange.trim()}</p>
            )}
            {response.newSymptomReported && (
              <p className="workspace__microFollowUp__line workspace__microFollowUp__line--alert">
                새로운 증상 보고: {response.newSymptomNote.trim() || '(내용 없음)'}
              </p>
            )}
            {response.adverseEffectReported && (
              <p className="workspace__microFollowUp__line workspace__microFollowUp__line--alert">
                이상반응 보고: {response.adverseEffectNote.trim() || '(내용 없음)'}
              </p>
            )}
          </div>
        ) : (
          <p className="workspace__empty">이번 방문에 대한 간단 재확인 응답이 아직 없습니다.</p>
        )}
      </div>
    </details>
  )
}
