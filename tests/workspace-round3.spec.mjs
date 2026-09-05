// Doctor Clinical Workspace round 3 (North Star Phases A/B/E/H/I) regression
// tests. All pure TS, no React -- bundled with esbuild --platform=neutral.
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.
//
// Run via `npm run test:workspace-round3`.

import {
  emptyWorkspaceState,
  deserializeWorkspaceState,
  workspaceStateEquals,
  WORKSPACE_STATE_SCHEMA_VERSION,
} from './.workspace-round3-persistence-bundle.mjs'
import { reassessmentExamItemFromPrevious, isReassessmentPending } from './.workspace-round3-reassessment-bundle.mjs'
import {
  EXAM_CHECK_STATUS_LABEL,
  EXAM_CHECK_STATUS_GLYPH,
  EXAM_CHECK_STATUS_OPTIONS,
  isValidExamStatus,
  isExamChecked,
} from './.workspace-round3-provenance-bundle.mjs'
import { emptyExamResult, isExamPending, groupExamSuggestions } from './.workspace-round3-examsuggestion-bundle.mjs'
import { buildPainPatientCarePlanPreview, buildHerbalPatientCarePlanPreview } from './.workspace-round3-patientpreview-bundle.mjs'
import { emptyPainCarePlan, emptyHerbalCarePlan } from './.workspace-round3-careplan-bundle.mjs'
import { deriveAdditionalConcernSummary, emptyAdditionalConcernPromotion } from './.workspace-round3-additionalconcern-bundle.mjs'
import {
  microFollowUpCandidatesFromPriorTargets,
  microFollowUpNeedsAttention,
  emptyMicroFollowUpResponse,
  readableMicroFollowUpResponse,
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
import {
  emptyVisitWorkspaceState,
  deserializeVisitWorkspaceState,
  visitWorkspaceStateEquals,
} from './.workspace-round3-visitworkspace-bundle.mjs'
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

/* ---------------- LBP v1 Batch 1 (G3): lbpDirectionalResponse ---------------- */
{
  const empty = emptyWorkspaceState()
  assert('emptyWorkspaceState.lbpDirectionalResponse starts NOT_ASSESSED', empty.lbpDirectionalResponse === 'NOT_ASSESSED')

  const filled = { ...empty, lbpDirectionalResponse: 'FLEXION_FAVORABLE' }
  const roundTripped = deserializeWorkspaceState(JSON.parse(JSON.stringify(filled)))
  assert('round-trip: lbpDirectionalResponse survives JSON round-trip exactly', roundTripped.lbpDirectionalResponse === 'FLEXION_FAVORABLE')

  const garbage = deserializeWorkspaceState({ lbpDirectionalResponse: 'BOGUS_VALUE' })
  assert('an invalid persisted lbpDirectionalResponse degrades to NOT_ASSESSED, never throws/passes through', garbage.lbpDirectionalResponse === 'NOT_ASSESSED')

  const wrongType = deserializeWorkspaceState({ lbpDirectionalResponse: 7 })
  assert('a wrong-typed (number) lbpDirectionalResponse degrades to NOT_ASSESSED', wrongType.lbpDirectionalResponse === 'NOT_ASSESSED')

  // Legacy record predating Batch 1 -- field entirely absent.
  const legacy = deserializeWorkspaceState({
    schema_version: '1.0.0',
    painExamSuggestions: [],
    painFinalAssessment: { finalWorkingAssessment: '', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
    painFollowUpTargets: [],
    updated_at: null,
  })
  assert('legacy record with lbpDirectionalResponse entirely absent degrades to NOT_ASSESSED', legacy.lbpDirectionalResponse === 'NOT_ASSESSED')
}

/* ---------------- 2026-09-05: 준비조건 필드 제거 (CD-1/CD-3 폐기) ---------------- */
{
  const empty = emptyWorkspaceState()
  assert(
    'emptyWorkspaceState에 lbpConfirmedCapabilities/lbpDeniedCapabilities가 없다',
    !('lbpConfirmedCapabilities' in empty) && !('lbpDeniedCapabilities' in empty),
  )

  // 옛 기록에 남아 있는 두 배열은 조용히 무시된다 — 역직렬화가 전체 shape을
  // 매번 새로 만들기 때문에 안전하다. 잃는 값은 애초에 어디로도 나가지 않던
  // 값이다(EMR·재진·환자 안내문 전부 미도달, 확인함).
  const legacy = deserializeWorkspaceState({
    lbpConfirmedCapabilities: ['SAFE_WALKING', 'CAN_SELF_PACE'],
    lbpDeniedCapabilities: ['QUADRUPED_TOLERATED'],
    painFinalAssessment: { finalWorkingAssessment: '남아 있어야 한다' },
  })
  assert('옛 기록의 준비조건 배열은 복원되지 않는다', !('lbpConfirmedCapabilities' in legacy) && !('lbpDeniedCapabilities' in legacy))
  assert('같은 기록의 다른 필드는 그대로 살아남는다 (조용한 전면 초기화가 아님)', legacy.painFinalAssessment.finalWorkingAssessment === '남아 있어야 한다')
  assert('준비조건이 있던 옛 기록도 던지지 않고 로드된다', legacy.schema_version === WORKSPACE_STATE_SCHEMA_VERSION)

  // RehabSuggestion.regressed도 함께 사라졌다 — 시스템이 판정하던 값이었다.
  const withRegressed = deserializeWorkspaceState({
    painRehabSuggestions: [{ id: 'LBP_ACT_01', title: 'x', goal: '', rationale: '', sourceFacts: [], contraindicationFacts: [], source: 'SUGGESTED', status: 'ACCEPTED', clinicianFinalInstruction: '', regressed: true }],
  })
  assert('옛 기록의 regressed 플래그는 복원되지 않는다', !('regressed' in withRegressed.painRehabSuggestions[0]))
  assert('그 제안의 원장 결정(ACCEPTED)은 그대로 보존된다', withRegressed.painRehabSuggestions[0].status === 'ACCEPTED')
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

  /* -----------------------------------------------------------------------
   * 13차 독립 리뷰 HIGH-2: the tests above only ever proved CONTAINER-level
   * safety (array-vs-not, record-vs-not) -- server/store.js stores a PUT
   * body verbatim with no schema validation, so an individual ARRAY ELEMENT
   * or a nested record's own LEAF can be wrong-typed while the container
   * itself is structurally fine (e.g. painFollowUpTargets[0].baseline = 7,
   * a number). The old deserializeWorkspaceState passed such elements
   * through untouched, and that reached emrPreview.ts's `.trim()` etc.
   * downstream and crashed the entire clinical record view. This proves
   * element/leaf-level sanitization: a malformed element degrades safely,
   * length/order are preserved (never silently dropped), and a genuinely
   * well-formed sibling element in the SAME array survives with its real
   * data intact.
   * ------------------------------------------------------------------- */
  {
    const raw = {
      painFollowUpTargets: [
        { id: 't1', label: '허리 통증 강도', baseline: 7, postTreatmentValue: null },
        { id: 42, label: '움직임', baseline: '3/10', postTreatmentValue: '2/10' },
      ],
      painExamSuggestions: [
        {
          id: 'e1',
          title: 'SLR 검사',
          priority: 'CONTEXTUAL',
          reasonFacts: 'not-an-array',
          source: 'SUGGESTED',
          result: { status: 'NOT_YET_CHECKED', laterality: null, note: 42, recordedAt: { nested: true } },
        },
      ],
    }
    let threw = false
    let loaded
    try {
      loaded = deserializeWorkspaceState(raw)
    } catch {
      threw = true
    }
    assert('13차 HIGH-2: a workspace with element/leaf-level wrong-typed data never throws', !threw)

    assert(
      '13차 HIGH-2: painFollowUpTargets keeps both elements (length/order preserved, nothing silently dropped)',
      loaded.painFollowUpTargets.length === 2,
    )
    assert(
      '13차 HIGH-2: a wrong-typed baseline (number) in element 0 degrades to the safe string default, not the raw number',
      loaded.painFollowUpTargets[0].baseline === '',
    )
    assert(
      '13차 HIGH-2: a null postTreatmentValue (should be string) degrades to the safe string default',
      loaded.painFollowUpTargets[0].postTreatmentValue === '',
    )
    assert(
      '13차 HIGH-2: element 0\'s genuinely well-formed label survives untouched alongside its corrupted sibling field',
      loaded.painFollowUpTargets[0].label === '허리 통증 강도',
    )
    assert(
      '13차 HIGH-2: a wrong-typed id (number) in element 1 degrades to the safe string default',
      loaded.painFollowUpTargets[1].id === '',
    )
    assert(
      '13차 HIGH-2: element 1 is a genuinely well-formed sibling element -- every one of its real fields survives intact, proving the fix does not collapse the whole array to defaults just because a DIFFERENT element was corrupted',
      loaded.painFollowUpTargets[1].label === '움직임' &&
        loaded.painFollowUpTargets[1].baseline === '3/10' &&
        loaded.painFollowUpTargets[1].postTreatmentValue === '2/10',
    )

    assert(
      '13차 HIGH-2: painExamSuggestions[0].reasonFacts (wrong-typed, not an array) degrades to []',
      Array.isArray(loaded.painExamSuggestions[0].reasonFacts) && loaded.painExamSuggestions[0].reasonFacts.length === 0,
    )
    assert(
      '13차 HIGH-2: painExamSuggestions[0].result (a nested record) is itself sanitized leaf-by-leaf -- wrong-typed note/recordedAt degrade to safe defaults',
      loaded.painExamSuggestions[0].result.note === '' && loaded.painExamSuggestions[0].result.recordedAt === null,
    )
    assert(
      '13차 HIGH-2: painExamSuggestions[0]\'s genuinely well-formed title/priority survive',
      loaded.painExamSuggestions[0].title === 'SLR 검사' && loaded.painExamSuggestions[0].priority === 'CONTEXTUAL',
    )
  }
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

  /*
   * 11차 독립 리뷰 LOW-1: additional_module은 정상인데
   * additional_detail_concern만 wrong-typed인 경우, 10차 수정은 카드
   * 전체를 null 처리했다 -- 하지만 자료 보기 탭의 추가 상세상담
   * 섹션(DoctorView.tsx가 `optionLabel('ADDITIONAL_DETAIL_01', ...)`로
   * 렌더)은 같은 필드를 "확인 필요(값 형식 오류)"로 계속 보여주므로,
   * 같은 레코드에서 진료 탭 카드만 사라지는 모순이 생겼다. module이
   * 유효하면 summary를 보존하고 detailConcernLabel만 명시적 실패
   * 토큰으로 대체해야 한다.
   */
  const routingWithWrongTypedDetail = { additional_module: 'NECK', additional_detail_concern: { corrupted: true } }
  const summaryWithWrongTypedDetail = deriveAdditionalConcernSummary(routingWithWrongTypedDetail)
  assert(
    'deriveAdditionalConcernSummary preserves a valid additional_module even when additional_detail_concern is wrong-typed (11th independent review LOW-1)',
    summaryWithWrongTypedDetail !== null && summaryWithWrongTypedDetail.module === 'NECK',
  )
  assert(
    'deriveAdditionalConcernSummary never passes a wrong-typed additional_detail_concern through as-is -- it becomes an explicit fail-closed label, never "[object Object]"',
    typeof summaryWithWrongTypedDetail.detailConcernLabel === 'string' &&
      summaryWithWrongTypedDetail.detailConcernLabel !== '[object Object]' &&
      summaryWithWrongTypedDetail.detailConcernLabel.includes('확인 필요'),
  )

  const routingWithNullDetail = { additional_module: 'NECK', additional_detail_concern: null }
  const summaryWithNullDetail = deriveAdditionalConcernSummary(routingWithNullDetail)
  assert(
    'deriveAdditionalConcernSummary keeps detailConcernLabel genuinely null (not the fail-closed token) when additional_detail_concern was never answered -- "doesn\'t apply" must stay distinct from "corrupted"',
    summaryWithNullDetail.detailConcernLabel === null,
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
  assert(
    'micro follow-up candidate carries the prior baseline/postTreatmentValue as read-only context',
    candidates[0].baselineText === '이전 baseline: 7' && candidates[0].postTreatmentText === '5',
  )

  assert('microFollowUpCandidatesFromPriorTargets on an empty prior list returns []', microFollowUpCandidatesFromPriorTargets([]).length === 0)

  // 13차 독립 리뷰 LOW-2: "필드가 없음"(진짜 미기록)과 "필드가 wrong-typed로
  // 손상됨"은 서로 다른 사실이며 같은 빈 문자열로 뭉개면 안 된다.
  const missingVsCorrupted = microFollowUpCandidatesFromPriorTargets([
    { id: 'm1', label: '진짜 미기록', baseline: undefined, postTreatmentValue: undefined },
    { id: 'm2', label: '손상된 값', baseline: { nested: true }, postTreatmentValue: 42 },
  ])
  assert(
    'a genuinely never-recorded baseline renders as "기록 없음", not a fail-closed token',
    missingVsCorrupted[0].baselineText === '이전 baseline: 기록 없음' && missingVsCorrupted[0].postTreatmentText === null,
  )
  assert(
    'a wrong-typed (corrupted) baseline/postTreatmentValue renders a distinct fail-closed token, never "[object Object]"/"42" nor silently "기록 없음"',
    missingVsCorrupted[1].baselineText.includes('확인 필요') &&
      !missingVsCorrupted[1].baselineText.includes('[object Object]') &&
      missingVsCorrupted[1].postTreatmentText === '확인 필요(값 형식 오류)',
  )

  const fresh = emptyMicroFollowUpResponse('visit-1', 'patient-1')
  assert('a fresh MicroFollowUpResponse starts with no attention flags', !microFollowUpNeedsAttention(fresh))
  assert('a fresh MicroFollowUpResponse keeps the visit_id/patient_id it was given', fresh.visit_id === 'visit-1' && fresh.patient_id === 'patient-1')

  const newSymptom = { ...fresh, newSymptomReported: true }
  assert('newSymptomReported alone triggers microFollowUpNeedsAttention', microFollowUpNeedsAttention(newSymptom))
  const adverseEffect = { ...fresh, adverseEffectReported: true }
  assert('adverseEffectReported alone triggers microFollowUpNeedsAttention', microFollowUpNeedsAttention(adverseEffect))
  assert('overallChange text alone (no symptom/adverse flags) does NOT trigger needsAttention', !microFollowUpNeedsAttention({ ...fresh, overallChange: '많이 좋아짐' }))

  // 13차 독립 리뷰 MEDIUM-1: readableMicroFollowUpResponse sanitizes the
  // patient-submitted MicroFollowUpResponse (the sibling half of the
  // candidates fix above) leaf-by-leaf -- a legacy/hand-crafted stored
  // response with wrong-typed fields must degrade to safe defaults, never
  // throw, and null/undefined input (no response yet) must stay null.
  assert('readableMicroFollowUpResponse(null) stays null (no response yet, not "corrupted")', readableMicroFollowUpResponse(null) === null)
  assert('readableMicroFollowUpResponse(undefined) stays null', readableMicroFollowUpResponse(undefined) === null)

  const readableFresh = readableMicroFollowUpResponse(fresh)
  assert(
    'readableMicroFollowUpResponse passes through a genuinely well-formed response unchanged',
    readableFresh.visit_id === 'visit-1' && readableFresh.patient_id === 'patient-1' && readableFresh.targetRatings.length === 0,
  )

  const corruptedResponse = {
    visit_id: 'visit-2',
    patient_id: 'patient-2',
    targetRatings: 'not-an-array',
    overallChange: { nested: true },
    newSymptomReported: 'yes',
    newSymptomNote: 42,
    adverseEffectReported: true,
    adverseEffectNote: null,
    submitted_at: '2026-01-01T00:00:00.000Z',
  }
  const readableCorrupted = readableMicroFollowUpResponse(corruptedResponse)
  assert(
    'readableMicroFollowUpResponse never throws on a malformed stored response and degrades every wrong-typed leaf to a safe default (never "[object Object]")',
    Array.isArray(readableCorrupted.targetRatings) &&
      readableCorrupted.targetRatings.length === 0 &&
      readableCorrupted.overallChange === '' &&
      readableCorrupted.newSymptomReported === false &&
      readableCorrupted.newSymptomNote === '' &&
      readableCorrupted.adverseEffectNote === '',
  )
  assert(
    'readableMicroFollowUpResponse keeps a genuinely boolean field (adverseEffectReported=true) instead of collapsing every field to its default',
    readableCorrupted.adverseEffectReported === true,
  )

  const corruptedTargetRatings = readableMicroFollowUpResponse({
    ...fresh,
    targetRatings: [{ targetId: 't1', label: 'A', patientReportedValue: '5' }, { targetId: 42, label: null, patientReportedValue: {} }],
  })
  assert(
    'readableMicroFollowUpResponse sanitizes each targetRatings element independently -- one wrong-typed rating does not drop or crash the whole array, and a well-formed sibling element survives intact',
    corruptedTargetRatings.targetRatings.length === 2 &&
      corruptedTargetRatings.targetRatings[0].patientReportedValue === '5' &&
      corruptedTargetRatings.targetRatings[1].targetId === '' &&
      corruptedTargetRatings.targetRatings[1].label === '' &&
      corruptedTargetRatings.targetRatings[1].patientReportedValue === '',
  )

  const src = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/microFollowUp.ts', import.meta.url)), 'utf8')
  // Core Reduction P2 (Phase 5 Synthesis v1.2 §2.3, Phase 7 §3.2 block ③
  // "지난 대비"): microFollowUpQuoteLine() reads both fields ONE more time
  // each, purely to pick WHICH already-existing string to quote first on
  // the left-column summary line -- it computes no new threshold or
  // clinical meaning from them (needsAttention itself is untouched), so
  // the guard's limit moves from 6 to 8 rather than being weakened
  // wholesale.
  assert(
    'microFollowUp.ts source contains no threshold/branching logic on newSymptomReported or adverseEffectReported beyond the needsAttention flag and the P2 quote-line picker',
    (src.match(/newSymptomReported|adverseEffectReported/g) ?? []).length <= 8,
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

  /* -----------------------------------------------------------------------
   * 15차 독립 리뷰 HIGH-1/MEDIUM-1: prior.workspace is an untrusted raw blob
   * written by an unauthenticated PUT with no schema validation -- a
   * malformed shape must never crash carryForwardSourceFromSubmission, and a
   * wrong-typed follow-up target label must never survive into the offered
   * carry-forward source (it must come out sanitized, not as-is garbage).
   * ------------------------------------------------------------------- */
  const malformedPrior = {
    workspace: {
      painFinalAssessment: { a: 1 },
      herbalFinalAssessment: null,
      painCarePlan: 'not-an-object',
      herbalCarePlan: undefined,
      painFollowUpTargets: [{ id: 'x', label: { nested: true }, baseline: 1, postTreatmentValue: null }],
      herbalFollowUpTargets: 'not-an-array',
      painExamSuggestions: [],
      herbalClinicianObservations: [],
    },
  }
  let malformedSource
  assert('carry-forward: a malformed prior workspace does not throw', (() => {
    try {
      malformedSource = carryForwardSourceFromSubmission(malformedPrior)
      return true
    } catch {
      return false
    }
  })())
  assert('carry-forward: a malformed prior workspace degrades to a safe (non-crashing) source, not a thrown error', malformedSource !== undefined)
  assert(
    'carry-forward: a wrong-typed follow-up target label is sanitized (never survives as a raw object)',
    malformedSource.followUpTargets.every((t) => typeof t.label === 'string'),
  )
}

/* -----------------------------------------------------------------------
 * 13차 독립 리뷰 HIGH-2 (visitWorkspace.ts mirror): a no-submission revisit
 * workspace is stored through its own unauthenticated PUT route
 * (/api/visits/:id/workspace) with the same lack of schema validation as
 * the submission-owned workspace -- deserializeVisitWorkspaceState must
 * sanitize element/leaf data the same way persistence.ts's
 * deserializeWorkspaceState does above, not just the container shape.
 * ------------------------------------------------------------------- */
{
  const raw = {
    followUpTargets: [
      { id: 'today-only', label: '오늘 고른 항목', baseline: 5, postTreatmentValue: '' },
      { id: 'ok', label: '정상 항목', baseline: '', postTreatmentValue: '' },
    ],
    reassessment: { items: 'not-an-array', finalReassessmentNote: 7, recordedAt: null },
  }
  let threw = false
  let loaded
  try {
    loaded = deserializeVisitWorkspaceState(raw)
  } catch {
    threw = true
  }
  assert('13차 HIGH-2 (visitWorkspace.ts): a workspace with element/leaf-level wrong-typed data never throws', !threw)
  assert('13차 HIGH-2 (visitWorkspace.ts): followUpTargets keeps both elements', loaded.followUpTargets.length === 2)
  assert(
    '13차 HIGH-2 (visitWorkspace.ts): a wrong-typed baseline (number) degrades to the safe string default',
    loaded.followUpTargets[0].baseline === '',
  )
  assert(
    '13차 HIGH-2 (visitWorkspace.ts): the well-formed sibling element survives untouched',
    loaded.followUpTargets[1].id === 'ok' && loaded.followUpTargets[1].label === '정상 항목',
  )
  assert(
    '13차 HIGH-2 (visitWorkspace.ts): reassessment.items (wrong-typed, not an array) degrades to []',
    Array.isArray(loaded.reassessment.items) && loaded.reassessment.items.length === 0,
  )
  assert(
    '13차 HIGH-2 (visitWorkspace.ts): reassessment.finalReassessmentNote (wrong-typed number) degrades to the safe string default',
    loaded.reassessment.finalReassessmentNote === '',
  )
}

/* -----------------------------------------------------------------------
 * LBP v1 Batch 3 (§9.2(a)/(f)): revisitQuickCheck field on VisitWorkspaceState.
 * ------------------------------------------------------------------- */
{
  const empty = emptyVisitWorkspaceState()
  assert(
    'revisitQuickCheck: emptyVisitWorkspaceState() carries an empty quick check (all NOT_ASSESSED, recordedAt null)',
    empty.revisitQuickCheck.targetFunctionChange === 'NOT_ASSESSED' &&
      empty.revisitQuickCheck.overallResponse === 'NOT_ASSESSED' &&
      empty.revisitQuickCheck.newNeuroOrRedFlag === 'NOT_ASSESSED' &&
      empty.revisitQuickCheck.exerciseAdherence === 'NOT_ASSESSED' &&
      empty.revisitQuickCheck.adverseEffect === 'NOT_ASSESSED' &&
      empty.revisitQuickCheck.recordedAt === null,
  )

  // Round-trip: a well-formed revisitQuickCheck survives deserialize.
  const wellFormed = {
    ...empty,
    revisitQuickCheck: {
      targetFunctionChange: 'BETTER',
      overallResponse: 'SAME',
      newNeuroOrRedFlag: 'NO',
      exerciseAdherence: 'DONE_AS_PLANNED',
      adverseEffect: 'NO',
      note: '메모',
      recordedAt: '2026-09-03T00:00:00.000Z',
    },
  }
  const roundTripped = deserializeVisitWorkspaceState(wellFormed)
  assert(
    'revisitQuickCheck: a well-formed quick check round-trips through deserializeVisitWorkspaceState untouched',
    JSON.stringify(roundTripped.revisitQuickCheck) === JSON.stringify(wellFormed.revisitQuickCheck),
  )

  // Legacy record: no revisitQuickCheck field at all -> empty.
  const legacy = { ...empty }
  delete legacy.revisitQuickCheck
  const loadedLegacy = deserializeVisitWorkspaceState(legacy)
  assert(
    'revisitQuickCheck: a legacy record with no revisitQuickCheck field at all deserializes to emptyRevisitQuickCheck()',
    JSON.stringify(loadedLegacy.revisitQuickCheck) === JSON.stringify(empty.revisitQuickCheck),
  )

  // Corrupted enum values -> NOT_ASSESSED, never a normal/negative value.
  const corrupted = {
    ...empty,
    revisitQuickCheck: {
      targetFunctionChange: 'IMPROVED', // unknown
      overallResponse: 7, // wrong type
      newNeuroOrRedFlag: 'NO', // valid -- survives
      exerciseAdherence: 'MADE_UP', // unknown
      adverseEffect: 'YES', // valid -- survives
      note: 5, // wrong type
      recordedAt: null,
    },
  }
  const loadedCorrupted = deserializeVisitWorkspaceState(corrupted)
  assert('revisitQuickCheck: an unknown targetFunctionChange value degrades to NOT_ASSESSED', loadedCorrupted.revisitQuickCheck.targetFunctionChange === 'NOT_ASSESSED')
  assert('revisitQuickCheck: a wrong-typed overallResponse value degrades to NOT_ASSESSED', loadedCorrupted.revisitQuickCheck.overallResponse === 'NOT_ASSESSED')
  assert('revisitQuickCheck: a well-formed sibling value (newNeuroOrRedFlag) survives untouched', loadedCorrupted.revisitQuickCheck.newNeuroOrRedFlag === 'NO')
  assert('revisitQuickCheck: an unknown exerciseAdherence value degrades to NOT_ASSESSED', loadedCorrupted.revisitQuickCheck.exerciseAdherence === 'NOT_ASSESSED')
  assert('revisitQuickCheck: a well-formed sibling value (adverseEffect) survives untouched', loadedCorrupted.revisitQuickCheck.adverseEffect === 'YES')
  assert('revisitQuickCheck: a wrong-typed note degrades to empty string', loadedCorrupted.revisitQuickCheck.note === '')

  // visitWorkspaceStateEquals detects a quick-check-only change.
  const before = emptyVisitWorkspaceState()
  const afterQuickCheckChange = { ...before, revisitQuickCheck: { ...before.revisitQuickCheck, adverseEffect: 'YES' } }
  assert(
    'visitWorkspaceStateEquals: detects a change confined entirely to revisitQuickCheck',
    !visitWorkspaceStateEquals(before, afterQuickCheckChange),
  )
  assert('visitWorkspaceStateEquals: two identical states (including quick check) compare equal', visitWorkspaceStateEquals(before, { ...before }))

  // Structural: carry-forward never touches revisitQuickCheck at all --
  // carryForwardSourceFromVisitWorkspace's own return type (judgment/
  // treatmentPlan/followUpTargets) has no quick-check key to begin with,
  // so applying any of the three carry-forward actions to a blank revisit
  // workspace leaves its quick check exactly as blank as it started.
  const priorRevisitWithQuickCheck = {
    ...emptyVisitWorkspaceState(),
    finalAssessment: { ...empty.finalAssessment, finalWorkingAssessment: '이전 판단', recordedAt: '2026-01-01T00:00:00.000Z' },
    revisitQuickCheck: {
      targetFunctionChange: 'BETTER',
      overallResponse: 'BETTER',
      newNeuroOrRedFlag: 'NO',
      exerciseAdherence: 'DONE_AS_PLANNED',
      adverseEffect: 'NO',
      note: '이전 메모',
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
  }
  const revisitSourceForQuickCheck = carryForwardSourceFromVisitWorkspace(priorRevisitWithQuickCheck)
  assert(
    'revisitQuickCheck: carryForwardSourceFromVisitWorkspace never exposes a quickCheck-shaped key',
    !('quickCheck' in revisitSourceForQuickCheck) && !('revisitQuickCheck' in revisitSourceForQuickCheck),
  )
  const appliedJudgment = applyJudgmentCarryForward(emptyVisitWorkspaceState(), revisitSourceForQuickCheck, '2026-09-03T00:00:00.000Z')
  assert(
    "revisitQuickCheck: applying 이전 판단 유지 carries the judgment text but leaves today's quick check blank",
    appliedJudgment.finalAssessment.finalWorkingAssessment === '이전 판단' &&
      JSON.stringify(appliedJudgment.revisitQuickCheck) === JSON.stringify(emptyVisitWorkspaceState().revisitQuickCheck),
  )
}

/* -----------------------------------------------------------------------
 * LBP v1 Batch 2.5b (G15): ExamCheckStatus 6상태 —
 * POSITIVE / NEGATIVE / UNCLEAR / LIMITED / NOT_PERFORMED / NOT_YET_CHECKED.
 * 설계 문서: docs/LBP_V1_BATCH2_5B_FABLE_IMPACT_SCOPE_v0.1.md
 *
 * 이 배치의 코드 diff는 작다. 위험은 "바꾸지 않은 코드"에 있다 -- 결과 상태를
 * 읽는 필터가 전부 `!== 'NOT_YET_CHECKED'` 형태라 신규 2값이 "기록된 사실"로
 * 취급되는 것이 *우연히* 맞는 상태다. 아래 assertion들이 그 우연을 계약으로
 * 고정한다.
 * ------------------------------------------------------------------- */
{
  const SIX = ['POSITIVE', 'NEGATIVE', 'UNCLEAR', 'LIMITED', 'NOT_PERFORMED', 'NOT_YET_CHECKED']

  /* ---- T-1a: 화면 옵션 목록이 enum 전체를 정확히 한 번씩 덮는가 ----
   * `ExamCheckStatus[]`는 부분집합도 통과하는 타입이므로 tsc가 누락을 잡지
   * 못한다. 값을 추가하고 EXAM_CHECK_STATUS_OPTIONS를 잊으면 build/기존
   * 테스트가 전부 통과하면서 원장이 신규 상태를 고를 수만 없게 된다. */
  const labelKeys = Object.keys(EXAM_CHECK_STATUS_LABEL)
  assert(
    'Batch 2.5b T-1a: EXAM_CHECK_STATUS_LABEL has exactly the 6 approved states',
    labelKeys.length === 6 && SIX.every((k) => labelKeys.includes(k)),
  )
  assert(
    'Batch 2.5b T-1a: EXAM_CHECK_STATUS_OPTIONS covers every label key exactly once (no silently unreachable state)',
    EXAM_CHECK_STATUS_OPTIONS.length === labelKeys.length &&
      new Set(EXAM_CHECK_STATUS_OPTIONS).size === EXAM_CHECK_STATUS_OPTIONS.length &&
      labelKeys.every((k) => EXAM_CHECK_STATUS_OPTIONS.includes(k)),
  )
  assert(
    'Batch 2.5b T-1a: 자주 쓰는 3개(정상/이상/불명확)가 항상 목록 앞에 온다 (CD-2.5b-3 권고 순서)',
    EXAM_CHECK_STATUS_OPTIONS.slice(0, 3).join(',') === 'POSITIVE,NEGATIVE,UNCLEAR' &&
      EXAM_CHECK_STATUS_OPTIONS[EXAM_CHECK_STATUS_OPTIONS.length - 1] === 'NOT_YET_CHECKED',
  )

  /* ---- T-1a(라벨 자구): CD-2.5b-1 권고안 A. 기존 LbpDirectionalResponse가
   * "미시행"을 미평가의 뜻으로 이미 쓰고 있으므로 여기서는 쓰지 않는다. ---- */
  assert(
    'Batch 2.5b T-1a: LIMITED/NOT_PERFORMED labels are non-empty, distinct, and never reuse the 음성/정상 wording',
    EXAM_CHECK_STATUS_LABEL.LIMITED.trim() !== '' &&
      EXAM_CHECK_STATUS_LABEL.NOT_PERFORMED.trim() !== '' &&
      EXAM_CHECK_STATUS_LABEL.LIMITED !== EXAM_CHECK_STATUS_LABEL.NOT_PERFORMED &&
      !EXAM_CHECK_STATUS_LABEL.LIMITED.includes('음성') &&
      !EXAM_CHECK_STATUS_LABEL.NOT_PERFORMED.includes('음성') &&
      !EXAM_CHECK_STATUS_LABEL.LIMITED.includes('정상') &&
      !EXAM_CHECK_STATUS_LABEL.NOT_PERFORMED.includes('정상'),
  )
  assert(
    'Batch 2.5b T-1a (CD-2.5b-1): NOT_PERFORMED does not reuse the exact label "미시행" (already means 미평가 in LbpDirectionalResponse)',
    EXAM_CHECK_STATUS_LABEL.NOT_PERFORMED !== '미시행',
  )
  assert(
    'Batch 2.5b T-1a: the four pre-existing labels are unchanged (additive only)',
    EXAM_CHECK_STATUS_LABEL.POSITIVE === '양성/이상 소견' &&
      EXAM_CHECK_STATUS_LABEL.NEGATIVE === '음성/정상' &&
      EXAM_CHECK_STATUS_LABEL.UNCLEAR === '불명확' &&
      EXAM_CHECK_STATUS_LABEL.NOT_YET_CHECKED === '아직 확인 안 됨',
  )

  /* ---- T-9: 색 무의존 요건(Core Reduction P2) -- glyph 6개가 서로 달라야 한다 ---- */
  const glyphs = SIX.map((k) => EXAM_CHECK_STATUS_GLYPH[k])
  assert(
    'Batch 2.5b T-9: all 6 status glyphs exist, are non-empty, and are mutually distinct (색만으로 구분 금지)',
    glyphs.length === 6 && glyphs.every((g) => typeof g === 'string' && g.trim() !== '') && new Set(glyphs).size === 6,
  )

  /* ---- T-7: validator가 신규 값을 받아들이고 garbage는 계속 거부하는가 ---- */
  assert(
    'Batch 2.5b T-7: isValidExamStatus accepts all 6 approved states',
    SIX.every((k) => isValidExamStatus(k) === true),
  )
  assert(
    'Batch 2.5b T-7: isValidExamStatus still rejects garbage (unknown string, empty, null, number, object, prototype key)',
    ['MAYBE', '', 'limited', 'not_performed'].every((v) => isValidExamStatus(v) === false) &&
      isValidExamStatus(null) === false &&
      isValidExamStatus(undefined) === false &&
      isValidExamStatus(7) === false &&
      isValidExamStatus({}) === false &&
      isValidExamStatus('toString') === false,
  )

  /* ---- T-3: 신규 2값은 "기록된 사실"이지 pending이 아니다 ---- */
  const examItem = (status) => ({
    id: `e_${status}`,
    title: `검사 ${status}`,
    priority: 'MUST_CHECK',
    reasonFacts: [],
    source: 'SUGGESTED',
    result: { status, laterality: null, note: '', recordedAt: status === 'NOT_YET_CHECKED' ? null : '2026-01-01T00:00:00.000Z' },
  })
  assert(
    'Batch 2.5b T-3: isExamPending is false for LIMITED and NOT_PERFORMED (a recorded fact, not "아직 확인 안 됨")',
    isExamPending(examItem('LIMITED')) === false && isExamPending(examItem('NOT_PERFORMED')) === false,
  )
  assert(
    'Batch 2.5b T-3: isExamPending stays true ONLY for NOT_YET_CHECKED',
    isExamPending(examItem('NOT_YET_CHECKED')) === true &&
      SIX.filter((k) => k !== 'NOT_YET_CHECKED').every((k) => isExamPending(examItem(k)) === false),
  )
  const grouped = groupExamSuggestions(SIX.map(examItem))
  assert(
    'Batch 2.5b T-3: groupExamSuggestions().stillPending contains only the NOT_YET_CHECKED item',
    grouped.stillPending.length === 1 && grouped.stillPending[0].result.status === 'NOT_YET_CHECKED',
  )
  assert(
    'Batch 2.5b T-3: isReassessmentPending is false for LIMITED/NOT_PERFORMED, true only for NOT_YET_CHECKED',
    isReassessmentPending({ result: { status: 'LIMITED' } }) === false &&
      isReassessmentPending({ result: { status: 'NOT_PERFORMED' } }) === false &&
      isReassessmentPending({ result: { status: 'NOT_YET_CHECKED' } }) === true,
  )
  assert(
    'Batch 2.5b T-3: isExamChecked is true for LIMITED/NOT_PERFORMED (they ARE clinician-entered records)',
    isExamChecked('LIMITED') === true &&
      isExamChecked('NOT_PERFORMED') === true &&
      isExamChecked('NOT_YET_CHECKED') === false,
  )

  /* ---- T-4: 이전 소견이 신규 값이어도 오늘 결과로 자동 복사되지 않는다 ---- */
  for (const prevStatus of ['LIMITED', 'NOT_PERFORMED']) {
    const promoted = reassessmentExamItemFromPrevious('r1', '재검 항목', {
      status: prevStatus,
      laterality: null,
      note: '사유 메모',
      recordedAt: '2026-01-01T00:00:00.000Z',
    })
    assert(
      `Batch 2.5b T-4: a promoted item whose previous status is ${prevStatus} still starts result.status = NOT_YET_CHECKED`,
      promoted.result.status === 'NOT_YET_CHECKED' && promoted.result.recordedAt === null,
    )
    assert(
      `Batch 2.5b T-4: the ${prevStatus} previous value itself is preserved as a read-only raw fact`,
      promoted.previous.status === prevStatus && promoted.previous.note === '사유 메모',
    )
  }

  /* ---- T-10: 신규 값이 기본값으로 새지 않는다 ---- */
  assert(
    'Batch 2.5b T-10: emptyExamResult() still defaults to NOT_YET_CHECKED (a new state must never become the default)',
    emptyExamResult().status === 'NOT_YET_CHECKED' && emptyExamResult().recordedAt === null,
  )
  {
    const emptyVisit = emptyVisitWorkspaceState()
    assert(
      'Batch 2.5b T-10: emptyVisitWorkspaceState reassessment items start empty (no defaulted status at all)',
      Array.isArray(emptyVisit.reassessment.items) && emptyVisit.reassessment.items.length === 0,
    )
  }
  /*
   * Opus delta review (Batch 2.5b) defect 3: the `items.length === 0`
   * check above says nothing about PREVIOUS_EXAM_VALUE_TEMPLATE.status
   * (persistence.ts / visitWorkspace.ts) -- the sanitizeShape fallback a
   * malformed `previous` value actually degrades to. That constant could
   * be flipped to e.g. 'LIMITED' and this suite would still pass. Feed a
   * damaged `previous` (a record whose `status` is missing/wrong-typed)
   * through both deserializers and pin the fallback to NOT_YET_CHECKED --
   * anything else fabricates a clinical fact ("제한적 시행") that was
   * never actually recorded.
   */
  {
    const deserialized = deserializeWorkspaceState({
      painReassessment: {
        items: [
          { id: 'r1', title: '재검 항목', previous: {}, result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null } },
          {
            id: 'r2',
            title: '재검 항목 2',
            previous: { status: 7, laterality: null, note: '', recordedAt: null },
            result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
          },
        ],
      },
    })
    assert(
      'Batch 2.5b T-10: deserializeWorkspaceState -- a malformed previous ({}) degrades previous.status to NOT_YET_CHECKED, never a fabricated LIMITED/etc. fact',
      deserialized.painReassessment.items[0].previous !== null && deserialized.painReassessment.items[0].previous.status === 'NOT_YET_CHECKED',
    )
    assert(
      'Batch 2.5b T-10: deserializeWorkspaceState -- a wrong-typed previous.status (number) also degrades to NOT_YET_CHECKED',
      deserialized.painReassessment.items[1].previous !== null && deserialized.painReassessment.items[1].previous.status === 'NOT_YET_CHECKED',
    )
  }
  {
    const deserializedVisit = deserializeVisitWorkspaceState({
      reassessment: {
        items: [
          { id: 'r1', title: '재검 항목', previous: {}, result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null } },
        ],
      },
    })
    assert(
      'Batch 2.5b T-10: deserializeVisitWorkspaceState -- a malformed previous ({}) degrades previous.status to NOT_YET_CHECKED, never a fabricated fact',
      deserializedVisit.reassessment.items[0].previous !== null && deserializedVisit.reassessment.items[0].previous.status === 'NOT_YET_CHECKED',
    )
  }

  /* ---- T-6: 직렬화 round-trip -- 신규 값 보존 + 구 4값 레코드 무변화 ---- */
  {
    const withNewStates = {
      ...emptyWorkspaceState(),
      painExamSuggestions: [examItem('LIMITED'), examItem('NOT_PERFORMED')],
      painReassessment: {
        items: [
          {
            id: 'r1',
            title: '재검',
            previous: { status: 'LIMITED', laterality: 'LEFT', note: '통증으로 각도 미달', recordedAt: '2026-01-01T00:00:00.000Z' },
            source: 'OBSERVED',
            result: { status: 'NOT_PERFORMED', laterality: null, note: '오늘은 시행 못 함', recordedAt: '2026-02-01T00:00:00.000Z' },
          },
        ],
        finalReassessmentNote: '',
        recordedAt: null,
      },
    }
    const rt = deserializeWorkspaceState(JSON.parse(JSON.stringify(withNewStates)))
    assert(
      'Batch 2.5b T-6: round-trip preserves LIMITED / NOT_PERFORMED on painExamSuggestions',
      rt.painExamSuggestions.map((i) => i.result.status).join(',') === 'LIMITED,NOT_PERFORMED',
    )
    assert(
      'Batch 2.5b T-6: round-trip preserves a NOT_PERFORMED today-result and a LIMITED previous value on a reassessment item',
      rt.painReassessment.items[0].result.status === 'NOT_PERFORMED' &&
        rt.painReassessment.items[0].result.note === '오늘은 시행 못 함' &&
        rt.painReassessment.items[0].previous.status === 'LIMITED' &&
        rt.painReassessment.items[0].previous.note === '통증으로 각도 미달',
    )
    /* 하위 호환: 구 4값만 쓰던 레코드는 round-trip 후 한 글자도 달라지지 않아야
     * 한다 = 마이그레이션이 필요 없다는 주장의 근거. */
    const legacy = {
      ...emptyWorkspaceState(),
      painExamSuggestions: [examItem('POSITIVE'), examItem('NEGATIVE'), examItem('UNCLEAR'), examItem('NOT_YET_CHECKED')],
    }
    const legacyRt = deserializeWorkspaceState(JSON.parse(JSON.stringify(legacy)))
    assert(
      'Batch 2.5b T-6: a legacy 4-value record round-trips byte-identically (no migration needed)',
      JSON.stringify(legacyRt.painExamSuggestions) === JSON.stringify(legacy.painExamSuggestions),
    )
  }
}


console.log(`\n${passCount} workspace round-3 assertions passed.`)

/* ---------------- 2026-09-05: lbpConfirmedStage (원장 확정 운동 단계) persistence ---------------- */
{
  const empty = emptyWorkspaceState()
  assert('emptyWorkspaceState.lbpConfirmedStage starts null (미확정)', empty.lbpConfirmedStage === null)
  for (const s of [0, 1, 2, 3]) {
    const rt = deserializeWorkspaceState(JSON.parse(JSON.stringify({ ...empty, lbpConfirmedStage: s })))
    assert(`lbpConfirmedStage ${s} round-trips through serialize/deserialize`, rt.lbpConfirmedStage === s)
  }
  for (const bad of ['1', 1.5, -1, 4, true, {}, [], 'severe', NaN, undefined]) {
    const rt = deserializeWorkspaceState({ lbpConfirmedStage: bad })
    assert(`lbpConfirmedStage garbage ${String(bad)} degrades to null (never a stage)`, rt.lbpConfirmedStage === null)
  }
  const legacy = deserializeWorkspaceState({ lbpConfirmedCapabilities: ['SAFE_WALKING'], lbpDeniedCapabilities: [] })
  assert('a pre-2026-09-05 record with no lbpConfirmedStage field reads as null (단계 필터 꺼짐)', legacy.lbpConfirmedStage === null)
  // 0은 falsy — `|| null` 같은 실수로 0단계가 사라지면 안 된다
  const zero = deserializeWorkspaceState({ lbpConfirmedStage: 0 })
  assert('0단계는 falsy지만 null로 뭉개지지 않는다', zero.lbpConfirmedStage === 0)
  const a = { ...empty, lbpConfirmedStage: 1 }
  const b = { ...empty, lbpConfirmedStage: 2 }
  assert('workspaceStateEquals distinguishes different confirmed stages (save is not skipped)', !workspaceStateEquals(a, b))
}
console.log(`\n(+lbpConfirmedStage) ${passCount} assertions passed so far.`)
