/**
 * Prior visit RAW history (round 3 Phase C). Collapsed by default (North
 * Star Phase K: "Longitudinal history should default compact/collapsed").
 * Shows only what the clinician themselves recorded on prior visits for
 * this exact patient_id — never a computed percentage, never a "호전/악화"
 * interpretation. `profile` selects which follow-up target list/final
 * assessment field to read from each prior visit (Pain vs Herbal).
 */
import { NEXT_REASSESSMENT_PLAN_STATUS_LABEL } from './finalAssessment'
import type { PatientHistoryResult } from './longitudinal'

export function PriorVisitHistoryCard({
  history,
  profile,
}: {
  history: PatientHistoryResult | null | undefined
  profile: 'pain' | 'herbal'
}) {
  if (!history || history.visits.length === 0) {
    return null
  }
  const latest = history.visits[0]
  // A no-submission revisit visit has no Pain-vs-Herbal split (by design —
  // see visitWorkspace.ts) -- when the most recent prior visit is one of
  // those, fall back to the profile-agnostic union instead of showing an
  // empty list just because it happens not to match the CURRENT
  // submission's profile.
  const isRevisit = latest.submissionId === null
  const targets = isRevisit ? latest.followUpTargets : profile === 'pain' ? latest.painFollowUpTargets : latest.herbalFollowUpTargets
  const finalAssessmentSummary = isRevisit
    ? latest.painFinalAssessmentSummary
    : profile === 'pain'
      ? latest.painFinalAssessmentSummary
      : latest.herbalFinalAssessmentSummary

  return (
    <details className="workspace__priorVisit">
      <summary>
        이전 방문 기록 <span className="workspace__priorVisit__hint">· {history.visits.length}건 · 참고용 raw 값, 자동 판단 없음</span>
      </summary>
      <div className="workspace__priorVisit__body">
        <p className="workspace__priorVisit__date">
          최근 방문: {new Date(latest.createdAt).toLocaleDateString('ko-KR')}
          {latest.primaryConcern ? ` · ${latest.primaryConcern}` : ''}
        </p>

        {targets.length > 0 ? (
          <div className="workspace__priorVisit__targets">
            {targets.map((t) => (
              <div key={t.id} className="workspace__priorVisit__targetRow">
                <strong>{t.label}</strong>
                <span>{t.baseline.trim() ? `이전 baseline: ${t.baseline.trim()}` : '이전 baseline: 기록 없음'}</span>
                {t.postTreatmentValue.trim() && <span>이전 치료직후: {t.postTreatmentValue.trim()}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="workspace__empty">이전 방문에 기록된 재평가 대상이 없습니다.</p>
        )}

        {finalAssessmentSummary && (
          <p className="workspace__priorVisit__assessment">
            <strong>이전 최종 판단</strong> {finalAssessmentSummary}
          </p>
        )}

        {latest.nextReassessmentPlan && latest.nextReassessmentPlan.status !== 'UNSET' && (
          <p className="workspace__priorVisit__assessment">
            <strong>이전에 계획한 다음 재평가</strong>{' '}
            {NEXT_REASSESSMENT_PLAN_STATUS_LABEL[latest.nextReassessmentPlan.status]}
            {latest.nextReassessmentPlan.targetDate ? ` (${latest.nextReassessmentPlan.targetDate})` : ''}
            {latest.nextReassessmentPlan.note ? ` — ${latest.nextReassessmentPlan.note}` : ''}
          </p>
        )}
      </div>
    </details>
  )
}
