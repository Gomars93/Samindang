// Doctor Clinical Workspace round 3 (North Star Phases A/B/E/H/I) regression
// tests. All pure TS, no React -- bundled with esbuild --platform=neutral.
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.
//
// Run via `npm run test:workspace-round3`.

import {
  emptyWorkspaceState,
  deserializeWorkspaceState,
  WORKSPACE_STATE_SCHEMA_VERSION,
} from './.workspace-round3-persistence-bundle.mjs'
import { reassessmentExamItemFromPrevious, isReassessmentPending } from './.workspace-round3-reassessment-bundle.mjs'
import { buildPainPatientCarePlanPreview, buildHerbalPatientCarePlanPreview } from './.workspace-round3-patientpreview-bundle.mjs'
import { emptyPainCarePlan, emptyHerbalCarePlan } from './.workspace-round3-careplan-bundle.mjs'
import { deriveAdditionalConcernSummary, emptyAdditionalConcernPromotion } from './.workspace-round3-additionalconcern-bundle.mjs'
import {
  microFollowUpCandidatesFromPriorTargets,
  microFollowUpNeedsAttention,
  emptyMicroFollowUpResponse,
} from './.workspace-round3-microfollowup-bundle.mjs'
import {
  applyFollowUpTargetsCarryForward,
  applyJudgmentCarryForward,
  applyTreatmentPlanCarryForward,
  carryForwardSourceFromSubmission,
  carryForwardSourceFromVisitWorkspace,
  emptyCarryForwardSource,
  isJudgmentBlank,
  isTreatmentPlanBlank,
} from './.workspace-round3-carryforward-bundle.mjs'
import { emptyVisitWorkspaceState } from './.workspace-round3-visitworkspace-bundle.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

/* ---------------- Phase A/B/E/H/I persistence round-trip ---------------- */
{
  const empty = emptyWorkspaceState()
  assert('emptyWorkspaceState carries the current schema version', empty.schema_version === WORKSPACE_STATE_SCHEMA_VERSION)
  assert('emptyWorkspaceState.painCarePlan starts fully empty', empty.painCarePlan.currentTreatmentGoal === '')
  assert('emptyWorkspaceState.nextReassessmentPlan starts UNSET', empty.nextReassessmentPlan.status === 'UNSET')
  assert('emptyWorkspaceState.painReassessment starts with no items', empty.painReassessment.items.length === 0)
  assert('emptyWorkspaceState.painRehabSuggestions starts empty', empty.painRehabSuggestions.length === 0)
  assert(
    'emptyWorkspaceState.additionalConcernPromotion starts NOT_FLAGGED',
    empty.additionalConcernPromotion.status === 'NOT_FLAGGED',
  )

  const filled = {
    ...empty,
    painCarePlan: { ...empty.painCarePlan, currentTreatmentGoal: '통증 감소', recordedAt: '2026-01-01T00:00:00.000Z' },
    nextReassessmentPlan: { status: 'DATE', targetDate: '2026-02-01', afterVisitCount: null, note: '2주 뒤' },
    painReassessment: {
      items: [reassessmentExamItemFromPrevious('r1', 'SLR 검사', { status: 'POSITIVE', laterality: 'RIGHT', note: '', recordedAt: null })],
      finalReassessmentNote: '호전 소견',
      recordedAt: '2026-02-01T00:00:00.000Z',
    },
  }
  const roundTripped = deserializeWorkspaceState(JSON.parse(JSON.stringify(filled)))
  assert(
    'round-trip: painCarePlan.currentTreatmentGoal survives JSON round-trip exactly',
    roundTripped.painCarePlan.currentTreatmentGoal === '통증 감소',
  )
  assert(
    'round-trip: nextReassessmentPlan.status/targetDate survive exactly',
    roundTripped.nextReassessmentPlan.status === 'DATE' && roundTripped.nextReassessmentPlan.targetDate === '2026-02-01',
  )
  assert(
    'round-trip: painReassessment.items[0].previous survives exactly (never dropped)',
    roundTripped.painReassessment.items[0].previous.status === 'POSITIVE' &&
      roundTripped.painReassessment.items[0].previous.laterality === 'RIGHT',
  )
  assert(
    'round-trip: painReassessment.items[0].result stays NOT_YET_CHECKED (never auto-copied from previous)',
    roundTripped.painReassessment.items[0].result.status === 'NOT_YET_CHECKED',
  )
}

/* ---------------- old-schema (round 2) safe load ---------------- */
{
  // A shape with ONLY the round-2 fields -- no painCarePlan/nextReassessmentPlan/
  // painReassessment/herbalReassessment/painRehabSuggestions/additionalConcernPromotion
  // at all. Simulates a record saved before this round shipped.
  const round2Shape = {
    schema_version: '1.0.0',
    painExamSuggestions: [],
    painFinalAssessment: { finalWorkingAssessment: '기존 판단', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-01-01T00:00:00.000Z' },
    painFollowUpTargets: [],
    herbalPatternCandidates: [],
    herbalClinicianObservations: [],
    herbalFinalAssessment: { finalPatternOrMechanism: '', treatmentPrinciple: '', prescriptionPlanNote: '', symptomsToTrack: '', recordedAt: null },
    herbalFollowUpTargets: [],
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  let threw = false
  let loaded
  try {
    loaded = deserializeWorkspaceState(round2Shape)
  } catch {
    threw = true
  }
  assert('old-schema (round 2) record deserializes without throwing', !threw)
  assert('old-schema record: pre-existing painFinalAssessment is preserved', loaded.painFinalAssessment.finalWorkingAssessment === '기존 판단')
  assert('old-schema record: missing painCarePlan degrades to empty, not undefined/throw', loaded.painCarePlan.currentTreatmentGoal === '')
  assert('old-schema record: missing nextReassessmentPlan degrades to UNSET', loaded.nextReassessmentPlan.status === 'UNSET')
  assert('old-schema record: missing painReassessment degrades to empty items[]', Array.isArray(loaded.painReassessment.items) && loaded.painReassessment.items.length === 0)
  assert('old-schema record: missing painRehabSuggestions degrades to []', Array.isArray(loaded.painRehabSuggestions) && loaded.painRehabSuggestions.length === 0)
  assert(
    'old-schema record: missing additionalConcernPromotion degrades to NOT_FLAGGED',
    loaded.additionalConcernPromotion.status === 'NOT_FLAGGED',
  )

  assert('malformed (null) record still deserializes to empty defaults, never throws', (() => {
    let ok = true
    try {
      const r = deserializeWorkspaceState(null)
      ok = r.painCarePlan.currentTreatmentGoal === '' && r.nextReassessmentPlan.status === 'UNSET'
    } catch {
      ok = false
    }
    return ok
  })())

  assert('malformed (garbage nested) painReassessment.items degrades to [] instead of throwing', (() => {
    let ok = true
    try {
      const r = deserializeWorkspaceState({ painReassessment: { items: 'not-an-array', finalReassessmentNote: 5 } })
      ok = Array.isArray(r.painReassessment.items) && r.painReassessment.items.length === 0
    } catch {
      ok = false
    }
    return ok
  })())
}

/* ---------------- Phase E: reassessment never auto-copies previous into today's result ---------------- */
{
  const positivePrev = reassessmentExamItemFromPrevious('x1', '검사', { status: 'POSITIVE', laterality: 'LEFT', note: '양성', recordedAt: '2026-01-01T00:00:00.000Z' })
  assert('promoted item from a POSITIVE previous still starts result.status = NOT_YET_CHECKED', positivePrev.result.status === 'NOT_YET_CHECKED')
  assert('promoted item keeps previous.status = POSITIVE as a separate read-only field', positivePrev.previous.status === 'POSITIVE')
  assert('promoted item is pending until the clinician re-checks it today', isReassessmentPending(positivePrev))

  const negativePrev = reassessmentExamItemFromPrevious('x2', '검사2', { status: 'NEGATIVE', laterality: null, note: '', recordedAt: null })
  assert('promoted item from a NEGATIVE previous ALSO starts result.status = NOT_YET_CHECKED (no auto-copy either direction)', negativePrev.result.status === 'NOT_YET_CHECKED')

  const noPrevious = reassessmentExamItemFromPrevious('x3', '검사3', null)
  assert('promoted item with no previous value at all still starts NOT_YET_CHECKED, does not throw', noPrevious.result.status === 'NOT_YET_CHECKED')
}

/* ---------------- Phase A/J: patient Care Plan preview excludes internal reasoning ---------------- */
{
  const painPlan = emptyPainCarePlan()
  painPlan.currentTreatmentGoal = '통증 감소'
  painPlan.homeActionPlan = '스트레칭 3회/일'
  const painText = buildPainPatientCarePlanPreview({ primaryConcern: '요통', carePlan: painPlan })
  assert('pain patient preview includes the clinician Care Plan text', painText.includes('통증 감소') && painText.includes('스트레칭 3회/일'))
  assert('pain patient preview never renders the literal string "SUGGESTED"', !painText.includes('SUGGESTED'))
  assert('pain patient preview never mentions Myungri/사주', !painText.includes('명리') && !painText.includes('사주'))
  assert('pain patient preview omits an empty field rather than rendering "없음"', !painText.includes('없음'))

  const herbalPlan = emptyHerbalCarePlan()
  herbalPlan.currentManagementGoal = '수면 개선'
  const herbalText = buildHerbalPatientCarePlanPreview({ primaryConcern: '한약 상담', carePlan: herbalPlan })
  assert('herbal patient preview includes the clinician Care Plan text', herbalText.includes('수면 개선'))
  assert('herbal patient preview never mentions Myungri/사주', !herbalText.includes('명리') && !herbalText.includes('사주'))

  // Source-level guard: the composer file itself must never import anything
  // from examSuggestion/patternCandidate/rehabSuggestion/myungri -- it can
  // only ever read carePlan.ts fields, so there is no code path by which a
  // SUGGESTED item or Myungri content could leak in later.
  const src = readFileSync(
    fileURLToPath(new URL('../src/doctor/workspace/patientCarePlanPreview.ts', import.meta.url)),
    'utf8',
  )
  assert('patientCarePlanPreview.ts source never imports examSuggestion.ts', !src.includes("from './examSuggestion'"))
  assert('patientCarePlanPreview.ts source never imports patternCandidate.ts', !src.includes("from './patternCandidate'"))
  assert('patientCarePlanPreview.ts source never imports rehabSuggestion.ts', !src.includes("from './rehabSuggestion'"))
  assert('patientCarePlanPreview.ts source never imports the Myungri/saju engine', !src.includes('myungri') && !src.includes('saju'))
}

/* ---------------- Phase I: rehab suggestion production-empty guarantee ---------------- */
{
  const src = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/rehabSuggestion.ts', import.meta.url)), 'utf8')
  assert(
    'rehabSuggestion.ts source contains no function computing suggestions from a DoctorPayload',
    !/function\s+\w*[Ss]uggest\w*\s*\(\s*payload/.test(src) && !src.includes("import type { DoctorPayload }") && !src.includes("from '../types'"),
  )
  const fixturesSrc = readFileSync(
    fileURLToPath(new URL('../src/doctor/workspace/workspaceFixtures.ts', import.meta.url)),
    'utf8',
  )
  assert(
    'the only RehabSuggestion[] fixture data is explicitly SYNTHETIC-labeled in a source comment',
    fixturesSrc.includes('RehabSuggestion') ? fixturesSrc.includes('SYNTHETIC') : true,
  )
  const doctorViewSrc = readFileSync(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    'DoctorView.tsx never passes a rehabSuggestions synthetic prop for real (server-mode) submissions',
    !/mode === 'server'[^\n]*rehabSuggestions/.test(doctorViewSrc),
  )
}

/* ---------------- Phase H: additional concern promotion never mutates routing ---------------- */
{
  const routingWithAdditional = { additional_module: 'NECK', additional_detail_concern: 'STIFFNESS' }
  const summary = deriveAdditionalConcernSummary(routingWithAdditional)
  assert('deriveAdditionalConcernSummary reads module/detail exactly as routing computed them', summary.module === 'NECK' && summary.detailConcernLabel === 'STIFFNESS')
  assert('deriveAdditionalConcernSummary never mutates the routing object it was given', routingWithAdditional.additional_module === 'NECK')

  const routingWithoutAdditional = { additional_module: null, additional_detail_concern: null }
  assert('deriveAdditionalConcernSummary returns null when there is no Additional module at all', deriveAdditionalConcernSummary(routingWithoutAdditional) === null)

  const promotion = emptyAdditionalConcernPromotion()
  assert('a fresh AdditionalConcernPromotionState starts NOT_FLAGGED', promotion.status === 'NOT_FLAGGED')

  const src = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/additionalConcern.ts', import.meta.url)), 'utf8')
  assert('additionalConcern.ts source never imports or references coreSpec routing computation (read-only projection)', !src.includes("from '../../spec/coreSpec'"))

  /*
   * 10차 독립 리뷰 MEDIUM-1: routing.additional_module/
   * additional_detail_concern은 검증되지 않은 저장 JSON에서 그대로
   * 오므로 레거시/손상 데이터는 string|null 타입을 지키지 않을 수
   * 있다 -- 이전 구현은 truthy 체크만 해서 wrong-typed 객체가
   * AdditionalConcernCard의 JSX 자식으로 흘러들어가 "Objects are not
   * valid as a React child" 예외를 던졌고(라이브 리프로로 확인됨),
   * DoctorRecordErrorBoundary가 이를 잡아도 이 카드 하나가 아니라
   * CommonSafetyBanner/모든 SafetyPanel을 포함한 전체 임상 화면이
   * fallback으로 통째로 바뀌었다.
   */
  const routingWithWrongTypedModule = { additional_module: { corrupted: true }, additional_detail_concern: null }
  assert(
    'deriveAdditionalConcernSummary treats a wrong-typed (object) additional_module as no-additional-concern rather than passing the object through to render (10th independent review MEDIUM-1)',
    deriveAdditionalConcernSummary(routingWithWrongTypedModule) === null,
  )

  const routingWithWrongTypedDetail = { additional_module: 'NECK', additional_detail_concern: { corrupted: true } }
  assert(
    'deriveAdditionalConcernSummary treats a wrong-typed (object) additional_detail_concern as no-additional-concern rather than passing the object through to render',
    deriveAdditionalConcernSummary(routingWithWrongTypedDetail) === null,
  )
}

/* ---------------- Phase D: micro follow-up candidates/needsAttention ---------------- */
{
  const fourTargets = [
    { id: 't1', label: 'A', baseline: '7', postTreatmentValue: '5' },
    { id: 't2', label: 'B', baseline: '6', postTreatmentValue: '4' },
    { id: 't3', label: 'C', baseline: '5', postTreatmentValue: '3' },
    { id: 't4', label: 'D', baseline: '4', postTreatmentValue: '2' },
  ]
  const candidates = microFollowUpCandidatesFromPriorTargets(fourTargets)
  assert('micro follow-up candidates cap at 3 per the North Star 30-60s budget', candidates.length === 3)
  assert('micro follow-up candidates keep the clinician\'s own prior order, no re-ranking', candidates.map((c) => c.id).join(',') === 't1,t2,t3')
  assert('micro follow-up candidate carries the prior baseline/postTreatmentValue as read-only context', candidates[0].previousBaseline === '7' && candidates[0].previousPostTreatmentValue === '5')

  assert('microFollowUpCandidatesFromPriorTargets on an empty prior list returns []', microFollowUpCandidatesFromPriorTargets([]).length === 0)

  const fresh = emptyMicroFollowUpResponse('visit-1', 'patient-1')
  assert('a fresh MicroFollowUpResponse starts with no attention flags', !microFollowUpNeedsAttention(fresh))
  assert('a fresh MicroFollowUpResponse keeps the visit_id/patient_id it was given', fresh.visit_id === 'visit-1' && fresh.patient_id === 'patient-1')

  const newSymptom = { ...fresh, newSymptomReported: true }
  assert('newSymptomReported alone triggers microFollowUpNeedsAttention', microFollowUpNeedsAttention(newSymptom))
  const adverseEffect = { ...fresh, adverseEffectReported: true }
  assert('adverseEffectReported alone triggers microFollowUpNeedsAttention', microFollowUpNeedsAttention(adverseEffect))
  assert('overallChange text alone (no symptom/adverse flags) does NOT trigger needsAttention', !microFollowUpNeedsAttention({ ...fresh, overallChange: '많이 좋아짐' }))

  const src = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/microFollowUp.ts', import.meta.url)), 'utf8')
  assert(
    'microFollowUp.ts source contains no threshold/branching logic on newSymptomReported or adverseEffectReported beyond the needsAttention flag',
    (src.match(/newSymptomReported|adverseEffectReported/g) ?? []).length <= 6,
  )
}

/* =====================================================================
   Round 9: routine-revisit carry-forward. The whole point of this feature
   is that a clinician can adopt the prior visit's judgment/plan/targets in
   one click -- and that adopting them can never fabricate today's
   objective findings or quietly overwrite what the clinician already
   typed today.
   ===================================================================== */
{
  const priorSubmission = {
    workspace: {
      painFinalAssessment: {
        finalWorkingAssessment: '요추 기계적 통증',
        treatmentFocus: '신전 가동성',
        interventionPerformedOrPlanned: '침 + 도수',
        immediateRetestTarget: '숙일 때 통증 재현',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      herbalFinalAssessment: {
        finalPatternOrMechanism: '기허',
        treatmentPrinciple: '보기',
        prescriptionPlanNote: '보중익기탕',
        symptomsToTrack: '피로감',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      painCarePlan: {
        currentTreatmentGoal: '통증 감소',
        rehabilitationGoal: '보행 30분',
        homeActionPlan: '신전 운동 1일 2회',
        activityPrecaution: '무거운 것 들지 않기',
        patientInstruction: '통증 심해지면 연락',
        nextVisitCheckItem: '아침 뻣뻣함',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      herbalCarePlan: {
        currentManagementGoal: '기력 회복',
        medicationPlanNote: '식후 30분 복용',
        homeLifestyleManagement: '취침 11시 전',
        symptomsToObserve: '소화 불편',
        adverseEffectContactInstruction: '두드러기 시 중단 후 연락',
        nextVisitCheckItem: '식욕',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      painFollowUpTargets: [
        { id: 'pain-nrs', label: '통증 NRS', baseline: '7', postTreatmentValue: '5' },
        { id: 'walk-min', label: '보행 지속 시간', baseline: '20분', postTreatmentValue: '' },
      ],
      herbalFollowUpTargets: [{ id: 'fatigue', label: '피로감', baseline: '심함', postTreatmentValue: '' }],
      painExamSuggestions: [],
      herbalClinicianObservations: [],
    },
  }

  const source = carryForwardSourceFromSubmission(priorSubmission)
  assert('carry-forward: a prior submission offers a judgment to continue', source.judgment !== null)
  assert('carry-forward: Pain and Herbal judgments are unioned, not silently dropped', source.judgment.finalWorkingAssessment.includes('요추 기계적 통증') && source.judgment.finalWorkingAssessment.includes('기허'))
  assert('carry-forward: the herbal prescription note survives the mapping', source.treatmentPlan.interventionPerformedOrPlanned.includes('보중익기탕'))
  assert('carry-forward: the herbal medication instruction survives the mapping', source.treatmentPlan.carePlan.patientInstruction.includes('식후 30분 복용'))
  assert('carry-forward: the herbal adverse-effect instruction survives the mapping', source.treatmentPlan.carePlan.patientInstruction.includes('두드러기'))
  assert('carry-forward: herbal symptomsToTrack lands on the next-visit check, not the immediate retest target', source.treatmentPlan.carePlan.nextVisitCheckItem.includes('피로감') && !source.treatmentPlan.immediateRetestTarget.includes('피로감'))

  /* ---- Round 10 review fix: each action's SOURCE contains exactly the
     fields its label names. 시행/예정 처치 and 즉시 재검 대상 are treatment
     records, so they must not be reachable from the judgment action. ---- */
  assert('carry-forward: the judgment source carries ONLY the judgment fields', Object.keys(source.judgment).sort().join(',') === 'finalWorkingAssessment,treatmentFocus')
  assert('carry-forward: 시행/예정 처치 belongs to the treatment-plan source', source.treatmentPlan.interventionPerformedOrPlanned.includes('침 + 도수'))
  assert('carry-forward: 즉시 재검 대상 belongs to the treatment-plan source', source.treatmentPlan.immediateRetestTarget.includes('숙일 때'))

  // THE safety property: prior MEASUREMENTS never become today's values.
  assert('carry-forward: Follow-up Targets carry the tracking selection only', source.followUpTargets.length === 3)
  assert('carry-forward: a carried target has NO prior baseline', source.followUpTargets.every((t) => t.baseline === ''))
  assert('carry-forward: a carried target has NO prior post-treatment value', source.followUpTargets.every((t) => t.postTreatmentValue === ''))
  assert('carry-forward: carried target labels are preserved', source.followUpTargets.map((t) => t.id).join(',') === 'pain-nrs,walk-min,fatigue')

  // Nothing is applied until it is applied.
  const blank = emptyVisitWorkspaceState()
  assert('carry-forward: a fresh revisit workspace starts blank (nothing auto-applied)', isJudgmentBlank(blank.finalAssessment) && isTreatmentPlanBlank(blank.finalAssessment, blank.carePlan) && blank.followUpTargets.length === 0)

  const now = '2026-02-02T00:00:00.000Z'
  const withJudgment = applyJudgmentCarryForward(blank, source, now)
  assert('carry-forward: applying the judgment fills it', withJudgment.finalAssessment.finalWorkingAssessment.includes('요추 기계적 통증'))
  assert('carry-forward: the applied judgment is stamped with TODAY (the clinician is affirming it now)', withJudgment.finalAssessment.recordedAt === now)
  assert('carry-forward: applying the judgment leaves the reassessment untouched (objective findings are never carried)', withJudgment.reassessment.items.length === 0)

  /* ---- THE round 10 regression: a judgment-labelled click must not be
     able to author today's treatment text, under any circumstances. ---- */
  assert("judgment-only carry-forward cannot populate today's 시행/예정 처치", withJudgment.finalAssessment.interventionPerformedOrPlanned === '')
  assert("judgment-only carry-forward cannot populate today's 즉시 재검 대상", withJudgment.finalAssessment.immediateRetestTarget === '')
  assert('judgment-only carry-forward cannot populate any Care Plan field', isTreatmentPlanBlank(withJudgment.finalAssessment, withJudgment.carePlan))

  const withPlan = applyTreatmentPlanCarryForward(withJudgment, source, now)
  assert('carry-forward: the treatment-plan action fills the care plan', withPlan.carePlan.currentTreatmentGoal.includes('통증 감소'))
  assert('carry-forward: the treatment-plan action is what fills 시행/예정 처치', withPlan.finalAssessment.interventionPerformedOrPlanned.includes('침 + 도수'))
  assert('carry-forward: the treatment-plan action is what fills 즉시 재검 대상', withPlan.finalAssessment.immediateRetestTarget.includes('숙일 때'))
  assert('carry-forward: the treatment-plan action never rewrites the judgment fields', withPlan.finalAssessment.finalWorkingAssessment === withJudgment.finalAssessment.finalWorkingAssessment && withPlan.finalAssessment.treatmentFocus === withJudgment.finalAssessment.treatmentFocus)

  // ...and the treatment-plan action works on its own, with no judgment carried.
  const planOnly = applyTreatmentPlanCarryForward(blank, source, now)
  assert('carry-forward: the treatment-plan action stands alone', planOnly.finalAssessment.interventionPerformedOrPlanned.includes('침 + 도수'))
  assert('carry-forward: a treatment-plan-only carry leaves the judgment fields empty', planOnly.finalAssessment.finalWorkingAssessment === '' && planOnly.finalAssessment.treatmentFocus === '')

  const withTargets = applyFollowUpTargetsCarryForward(withPlan, source)
  assert('carry-forward: applying the targets fills them', withTargets.followUpTargets.length === 3)
  assert('carry-forward: applied targets still carry no prior measurement', withTargets.followUpTargets.every((t) => t.baseline === '' && t.postTreatmentValue === ''))

  // Never overwrite what the clinician already wrote today.
  const typedJudgment = { ...blank, finalAssessment: { ...blank.finalAssessment, finalWorkingAssessment: '오늘 새로 판단한 내용' } }
  assert("carry-forward: never overwrites today's already-entered judgment", applyJudgmentCarryForward(typedJudgment, source, now).finalAssessment.finalWorkingAssessment === '오늘 새로 판단한 내용')

  const typedPlan = { ...blank, carePlan: { ...blank.carePlan, currentTreatmentGoal: '오늘 새 목표' } }
  assert("carry-forward: never overwrites today's already-entered care plan", applyTreatmentPlanCarryForward(typedPlan, source, now).carePlan.currentTreatmentGoal === '오늘 새 목표')

  // ...and the treatment-plan guard covers BOTH objects it writes into, so
  // it can never half-overwrite: text in 시행/예정 처치 alone blocks it.
  const typedIntervention = { ...blank, finalAssessment: { ...blank.finalAssessment, interventionPerformedOrPlanned: '오늘 시행한 처치' } }
  assert('carry-forward: text in 시행/예정 처치 alone blocks the treatment-plan carry (no half-overwrite)', applyTreatmentPlanCarryForward(typedIntervention, source, now) === typedIntervention)

  const typedTargets = { ...blank, followUpTargets: [{ id: 'today-only', label: '오늘 고른 항목', baseline: '', postTreatmentValue: '' }] }
  assert("carry-forward: never replaces today's already-chosen Follow-up Targets", applyFollowUpTargetsCarryForward(typedTargets, source).followUpTargets[0].id === 'today-only')

  // A prior visit with nothing recorded offers nothing (the UI disables it).
  const empty = carryForwardSourceFromSubmission(null)
  assert('carry-forward: no prior submission offers nothing', empty.judgment === null && empty.treatmentPlan === null && empty.followUpTargets.length === 0)
  assert('carry-forward: applying an empty source is a no-op', applyJudgmentCarryForward(blank, emptyCarryForwardSource(), now) === blank)

  // Revisit-of-revisit: the prior visit's own generic workspace, read directly.
  const priorRevisit = {
    ...emptyVisitWorkspaceState(),
    finalAssessment: {
      ...blank.finalAssessment,
      finalWorkingAssessment: '이전 재진 판단',
      interventionPerformedOrPlanned: '이전 재진 처치',
      recordedAt: '2026-01-15T00:00:00.000Z',
    },
    carePlan: { ...blank.carePlan, currentTreatmentGoal: '이전 재진 목표', recordedAt: '2026-01-15T00:00:00.000Z' },
    followUpTargets: [{ id: 'pain-nrs', label: '통증 NRS', baseline: '5', postTreatmentValue: '4' }],
    reassessment: { items: [{ id: 'x', title: '이전 재검', result: { status: 'POSITIVE', note: '' } }], finalReassessmentNote: '', recordedAt: null },
  }
  const revisitSource = carryForwardSourceFromVisitWorkspace(priorRevisit)
  assert('carry-forward: a prior REVISIT offers its own judgment', revisitSource.judgment.finalWorkingAssessment === '이전 재진 판단')
  assert('carry-forward: a prior REVISIT keeps its treatment text on the treatment-plan action', revisitSource.treatmentPlan.interventionPerformedOrPlanned === '이전 재진 처치')
  assert('carry-forward: a prior revisit offers its care plan', revisitSource.treatmentPlan.carePlan.currentTreatmentGoal === '이전 재진 목표')
  assert("carry-forward: a prior revisit's measured baseline is NOT carried", revisitSource.followUpTargets[0].baseline === '' && revisitSource.followUpTargets[0].postTreatmentValue === '')
  assert("carry-forward: a prior revisit's judgment carry cannot author today's treatment text", applyJudgmentCarryForward(blank, revisitSource, now).finalAssessment.interventionPerformedOrPlanned === '')

  // Structural guard: the module must not reach for objective-finding fields,
  // and the judgment path must not name the treatment fields at all.
  const carrySrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/revisitCarryForward.ts', import.meta.url)), 'utf8')
  assert('revisitCarryForward.ts never reads prior exam suggestions', !carrySrc.includes('painExamSuggestions'))
  assert('revisitCarryForward.ts never reads prior clinician observations', !carrySrc.includes('herbalClinicianObservations'))
  assert('revisitCarryForward.ts never writes a reassessment', !/reassessment\s*:/.test(carrySrc))
  const judgmentFn = carrySrc.slice(carrySrc.indexOf('export function applyJudgmentCarryForward'), carrySrc.indexOf('export function applyTreatmentPlanCarryForward'))
  assert('applyJudgmentCarryForward never mentions interventionPerformedOrPlanned', !judgmentFn.includes('interventionPerformedOrPlanned'))
  assert('applyJudgmentCarryForward never mentions immediateRetestTarget', !judgmentFn.includes('immediateRetestTarget'))
  assert('applyJudgmentCarryForward never touches the care plan', !judgmentFn.includes('carePlan'))
}

console.log(`\n${passCount} workspace round-3 assertions passed.`)
