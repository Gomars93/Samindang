/**
 * NEXT ACTION card (round 11: Doctor Preview v2 -- 10-second clinical view).
 *
 * Layer 4 of the compressed default workspace. Answers the last of the five
 * questions a clinician must be able to settle in ten seconds -- "what is
 * the next follow-up target/action?" -- by *reading back* what has actually
 * been recorded, instead of presenting a full Care Plan form on every visit.
 *
 * Deliberately read-only. The editable Care Plan and next-reassessment
 * forms still exist, unchanged and still autosaving, one disclosure below;
 * this card only surfaces their current content so the common case (glance,
 * confirm, move on) costs no clicks. Nothing is summarized, scored, or
 * reworded: every line is a clinician-authored value shown verbatim, or an
 * honest "아직 기록 없음".
 */
import type { HerbalCarePlan, PainCarePlan } from './carePlan'
import type { NextReassessmentPlan } from './finalAssessment'
import { NEXT_REASSESSMENT_PLAN_STATUS_LABEL } from './finalAssessment'

function allBlank(values: (string | null | undefined)[]): boolean {
  return !values.some((v) => (v ?? '').trim() !== '')
}

/** True when the clinician has written nothing into the Pain Care Plan at all. */
export function isCarePlanEmpty(plan: PainCarePlan): boolean {
  return allBlank([
    plan.currentTreatmentGoal,
    plan.rehabilitationGoal,
    plan.homeActionPlan,
    plan.activityPrecaution,
    plan.patientInstruction,
    plan.nextVisitCheckItem,
  ])
}

/** Same, for the Herbal Care Plan's own field set. */
export function isHerbalCarePlanEmpty(plan: HerbalCarePlan): boolean {
  return allBlank([
    plan.currentManagementGoal,
    plan.medicationPlanNote,
    plan.homeLifestyleManagement,
    plan.symptomsToObserve,
    plan.adverseEffectContactInstruction,
    plan.nextVisitCheckItem,
  ])
}

/**
 * The plan's own wording, when one is set. Returns null for UNSET so the
 * caller can say "not set yet" rather than printing a placeholder that
 * reads like a decision.
 */
export function nextReassessmentSummary(plan: NextReassessmentPlan): string | null {
  if (plan.status === 'UNSET') return null
  const detail =
    plan.status === 'DATE' && plan.targetDate.trim()
      ? plan.targetDate.trim()
      : plan.status === 'VISIT_COUNT' && typeof plan.afterVisitCount === 'number'
        ? `${plan.afterVisitCount}회 후`
        : ''
  const note = plan.note.trim()
  return [NEXT_REASSESSMENT_PLAN_STATUS_LABEL[plan.status], detail, note].filter((p) => p !== '').join(' · ')
}

function Row({ label, value }: { label: string; value: string }) {
  const text = value.trim()
  return (
    <div className="workspace__nextAction__row">
      <span className="workspace__nextAction__label">{label}</span>
      <strong className={`workspace__nextAction__value${text ? '' : ' workspace__nextAction__value--empty'}`}>
        {text || '아직 기록 없음'}
      </strong>
    </div>
  )
}

/**
 * Takes the two values plainly rather than a Care Plan object, because the
 * Pain and Herbal plans name the same idea differently (`homeActionPlan` vs
 * `homeLifestyleManagement`). Mapping that at the call site keeps this card
 * from having to know which profile it is rendering.
 */
export function NextActionCard({
  homeAction,
  nextCheck,
  nextReassessmentPlan,
  homeActionLabel = '환자가 집에서 할 일',
}: {
  homeAction: string
  nextCheck: string
  nextReassessmentPlan: NextReassessmentPlan
  homeActionLabel?: string
}) {
  const reassessment = nextReassessmentSummary(nextReassessmentPlan)

  /*
   * Round 13: when nothing is recorded, three stacked "아직 기록 없음" rows
   * said the same thing three times and took the space of a real card.
   * One compact line says it once. The moment ANY of the three holds
   * content the full read-back returns, so a recorded value is never
   * hidden behind a collapsed empty state -- the collapse is a property of
   * emptiness, not a mode the clinician has to get out of.
   */
  const nothingRecorded = homeAction.trim() === '' && nextCheck.trim() === '' && reassessment === null
  if (nothingRecorded) {
    return (
      <section className="workspace__block workspace__nextAction workspace__nextAction--empty" aria-label="다음 액션">
        <h3>다음 액션</h3>
        <p className="workspace__nextAction__emptyLine">다음 액션 미설정 — 아래 「관리 계획 · 다음 재평가」에서 입력</p>
      </section>
    )
  }

  return (
    <section className="workspace__block workspace__nextAction" aria-label="다음 액션">
      <h3>다음 액션</h3>
      <Row label={homeActionLabel} value={homeAction} />
      <Row label="다음에 확인할 것" value={nextCheck} />
      <Row label="다음 재평가" value={reassessment ?? ''} />
    </section>
  )
}
