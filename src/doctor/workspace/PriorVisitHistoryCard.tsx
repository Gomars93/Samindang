/**
 * Prior visit RAW history (round 3 Phase C). Collapsed by default (North
 * Star Phase K: "Longitudinal history should default compact/collapsed").
 * Shows only what the clinician themselves recorded on prior visits for
 * this exact patient_id — never a computed percentage, never a "호전/악화"
 * interpretation. `profile` selects which follow-up target list/final
 * assessment field to read from each prior visit (Pain vs Herbal).
 */
import {
  asPriorVisitArray,
  readablePriorVisitDateLabel,
  readablePriorVisitFollowUpTarget,
  readablePriorVisitPrimaryConcern,
  readablePriorVisitReassessmentStatusLabel,
  readablePriorVisitText,
} from './longitudinal'
import type { PatientHistoryResult } from './longitudinal'

export function PriorVisitHistoryCard({
  history,
  profile,
}: {
  history: PatientHistoryResult | null | undefined
  profile: 'pain' | 'herbal'
}) {
  const visits = asPriorVisitArray<PatientHistoryResult['visits'][number]>(history?.visits)
  if (visits.length === 0) {
    return null
  }
  const latest = visits[0]
  // 방문 배열의 컨테이너는 asPriorVisitArray로 방어했지만, 개별 원소
  // 자체가 null/문자열 등 wrong-typed일 수 있다 -- 이 경우 어떤 필드도
  // 안전하게 읽을 수 없으므로 이 카드를 통째로 조용히 건너뛴다("이전
  // 방문 기록 없음"과 동일한 폴백; 실제 안전 표면은 CommonSafetyBanner/
  // 각 지역 SafetyPanel이 별도로 담당하므로 안전정보 손실이 아니다).
  if (latest === null || typeof latest !== 'object') {
    return null
  }
  // A no-submission revisit visit has no Pain-vs-Herbal split (by design —
  // see visitWorkspace.ts) -- when the most recent prior visit is one of
  // those, fall back to the profile-agnostic union instead of showing an
  // empty list just because it happens not to match the CURRENT
  // submission's profile.
  const isRevisit = latest.submissionId === null
  const rawTargets = isRevisit
    ? latest.followUpTargets
    : profile === 'pain'
      ? latest.painFollowUpTargets
      : latest.herbalFollowUpTargets
  const targets = asPriorVisitArray<unknown>(rawTargets).map((t, i) => readablePriorVisitFollowUpTarget(t, i))
  const finalAssessmentSummary = readablePriorVisitText(
    isRevisit
      ? latest.painFinalAssessmentSummary
      : profile === 'pain'
        ? latest.painFinalAssessmentSummary
        : latest.herbalFinalAssessmentSummary,
  )
  const planValue: unknown = latest.nextReassessmentPlan
  const plan = planValue !== null && typeof planValue === 'object' ? (planValue as Record<string, unknown>) : null
  const planShowable = plan !== null && plan.status !== 'UNSET'
  const planStatusLabel = plan ? readablePriorVisitReassessmentStatusLabel(plan.status) : null
  const planTargetDate = plan ? readablePriorVisitText(plan.targetDate) : null
  const planNote = plan ? readablePriorVisitText(plan.note) : null

  return (
    <details className="workspace__priorVisit">
      <summary>
        이전 방문 기록 <span className="workspace__priorVisit__hint">· {visits.length}건 · 참고용 raw 값, 자동 판단 없음</span>
      </summary>
      <div className="workspace__priorVisit__body">
        <p className="workspace__priorVisit__date">
          최근 방문: {readablePriorVisitDateLabel(latest.createdAt)}
          {readablePriorVisitPrimaryConcern(latest.primaryConcern) ? ` · ${readablePriorVisitPrimaryConcern(latest.primaryConcern)}` : ''}
        </p>

        {targets.length > 0 ? (
          <div className="workspace__priorVisit__targets">
            {targets.map((t) => (
              <div key={t.id} className="workspace__priorVisit__targetRow">
                <strong>{t.label}</strong>
                <span>{t.baselineText}</span>
                {t.postTreatmentText && <span>이전 치료직후: {t.postTreatmentText}</span>}
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

        {planShowable && (
          <p className="workspace__priorVisit__assessment">
            <strong>이전에 계획한 다음 재평가</strong> {planStatusLabel}
            {planTargetDate ? ` (${planTargetDate})` : ''}
            {planNote ? ` — ${planNote}` : ''}
          </p>
        )}
      </div>
    </details>
  )
}
