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

console.log(`\n${passCount} workspace round-3 assertions passed.`)
