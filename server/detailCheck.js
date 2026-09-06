// 플로우 정렬 5/5 (세부문진 배선): "적정 치료 횟수·주기를 채우면 세부문진
// 진행". The doctor already ADOPTED the rule when they set the visit's
// nextReassessmentPlan (DATE / VISIT_COUNT); this module only reads that
// plan back and says whether today is the planned point -- no clinical
// inference, no new threshold (same posture as the doctor-side
// computeDetailCheckDue in src/doctor/workspace/revisitQuickCheck.ts).
//
// This is a deliberate PORT of that TypeScript function onto the server's
// own history shape ({created_at, next_reassessment_plan} instead of
// {createdAt, nextReassessmentPlan}); the two must agree case-for-case, and
// tests/detail-check.spec.mjs runs both against one fixture table so any
// drift between them fails loudly instead of quietly diverging.
//
// Question ids are the INITIAL questionnaire's own ids (src/spec/coreSpec.ts),
// so the doctor can compare today's answer with the first-visit answer
// like-for-like. The patient screen resolves wording/options from coreSpec
// by id; the server never carries question text.
export const DETAIL_CHECK_COMMON_QUESTION_IDS = Object.freeze(['VISIT_04_SYMPTOM_IMPACT'])
export const DETAIL_CHECK_LBP_QUESTION_IDS = Object.freeze(['LBP_12', 'LBP_13', 'LBP_14'])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Local calendar date (the clinic's own clock), never UTC -- a plan due "today" must be due on the clinic's today. */
export function localTodayISO(now = new Date()) {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * @param historyVisits newest-first visit summaries as produced by store.js's
 *   getPatientHistory ({created_at, next_reassessment_plan, ...}).
 * @returns {{reason:'DATE'|'VISIT_COUNT', plan_label:string, source_visit_created_at:string}|null}
 */
export function computeDetailCheckDue(historyVisits, todayISO) {
  const visits = Array.isArray(historyVisits) ? historyVisits : []
  for (let k = 0; k < visits.length; k++) {
    const visit = visits[k]
    if (!isRecord(visit)) continue
    const planRaw = visit.next_reassessment_plan
    if (planRaw === null || planRaw === undefined) continue
    if (!isRecord(planRaw)) return null
    if (planRaw.status === undefined || planRaw.status === 'UNSET') continue

    const sourceVisitCreatedAt = typeof visit.created_at === 'string' ? visit.created_at : ''

    if (typeof planRaw.status !== 'string') return null

    if (planRaw.status === 'DATE') {
      const targetDate = planRaw.targetDate
      if (typeof targetDate !== 'string' || !ISO_DATE_RE.test(targetDate)) return null
      if (todayISO >= targetDate) {
        return { reason: 'DATE', plan_label: `날짜 지정 ${targetDate}`, source_visit_created_at: sourceVisitCreatedAt }
      }
      return null
    }

    if (planRaw.status === 'VISIT_COUNT') {
      const n = planRaw.afterVisitCount
      if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return null
      if (k + 1 >= n) {
        return { reason: 'VISIT_COUNT', plan_label: `방문 ${n}회 후`, source_visit_created_at: sourceVisitCreatedAt }
      }
      return null
    }

    // CLINICIAN_DECIDES, or an unrecognized status string -- never due, never guessed.
    return null
  }
  return null
}

/** The detail questions to ask when due: the common item plus the LBP set only for an LBP patient. */
export function detailCheckQuestionIds({ isLbp }) {
  return [...DETAIL_CHECK_COMMON_QUESTION_IDS, ...(isLbp ? DETAIL_CHECK_LBP_QUESTION_IDS : [])]
}
