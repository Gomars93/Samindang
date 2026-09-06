// Doctor Clinical Workspace (PR #24) — non-clinical behavior tests.
//
// Covers: profile isolation (pain never shows Myungri/herbal-only content,
// herbal shows systemic first with Myungri collapsed, mixed has both tabs),
// provenance badges, unknown/not-yet-checked semantics, the clinician
// input -> workspace update loop, EMR preview never promoting a SUGGESTED
// item to a confirmed finding or a NOT_YET_CHECKED item to a negative
// result, and basic accessibility (aria-pressed/aria-selected/role).
//
// Renders src/doctor/workspace/DoctorWorkspace.tsx directly (not through
// DoctorView.tsx) against the SYNTHETIC scenarios in workspaceFixtures.ts,
// same bundling pattern as tests/ankle-foot-doctor-integration.spec.mjs.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { DoctorWorkspace } from './.doctor-workspace-bundle.cjs'
import { FollowUpTargetPicker } from './.follow-up-target-picker-bundle.cjs'
import { MicroFollowUpCard } from './.micro-follow-up-card-bundle.cjs'
import { PainCarePlanCard } from './.care-plan-card-bundle.cjs'
import {
  WORKSPACE_SCENARIOS,
  PAIN_SCENARIO_1,
  PAIN_SCENARIO_2,
  PAIN_SCENARIO_3,
  HERBAL_SCENARIO_1,
  HERBAL_SCENARIO_2,
  MIXED_SCENARIO_1,
} from './.doctor-workspace-fixtures-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const render = (scenario) =>
  renderToString(React.createElement(DoctorWorkspace, { payload: scenario.payload, synthetic: scenario.synthetic }))

const renderWith = (scenario, extraProps) =>
  renderToString(
    React.createElement(DoctorWorkspace, { payload: scenario.payload, synthetic: scenario.synthetic, ...extraProps }),
  )

// ---------- 1. every scenario renders without throwing ----------
for (const s of WORKSPACE_SCENARIOS) {
  test(`scenario "${s.label}" (${s.kind}) renders without throwing`, () => {
    const html = render(s)
    assert.ok(html.length > 0)
  })
}

// Round 3 QA fix: real headless browser QA caught REPEAT_VISIT_AUTO_COMPARE_STATUS
// literally containing the English internal-tracking phrase "OPERATIONAL
// INTEGRATION REQUIRED", rendered straight into the clinician-facing page
// (FollowUpTargetPicker.tsx). Guard against this whole class of bug across
// every scenario, not just the one that happened to be checked before.
for (const s of WORKSPACE_SCENARIOS) {
  test(`scenario "${s.label}" (${s.kind}) never renders the internal marker "OPERATIONAL INTEGRATION REQUIRED"`, () => {
    const html = render(s)
    assert.ok(!html.includes('OPERATIONAL INTEGRATION REQUIRED'))
  })
}

test('exactly 7 scenarios exist (pain x3, herbal x3, mixed x1)', () => {
  assert.equal(WORKSPACE_SCENARIOS.length, 7)
  assert.equal(WORKSPACE_SCENARIOS.filter((s) => s.kind === 'pain').length, 3)
  assert.equal(WORKSPACE_SCENARIOS.filter((s) => s.kind === 'herbal').length, 3)
  assert.equal(WORKSPACE_SCENARIOS.filter((s) => s.kind === 'mixed').length, 1)
})

/* -------------------------------------------------------------------------
 * Malformed/legacy submission resilience batch, 3rd independent review:
 * every regional SafetyPanel (Neck/Shoulder/Knee/Elbow/WristHand/Hip/Tmj/
 * AnkleFoot/Lbp) gates on `safety_flags.<region> === null` (or, for Lbp,
 * `primary_module_detail !== 'LBP'`) and then reads
 * `responses.modules.<region>.*` unconditionally. A legacy submission
 * recorded before that region module existed has `safety_flags` present
 * but WITHOUT that key -- `undefined === null` is false, so the strict
 * gate does not fire, and the panel crashes reading the missing module.
 * This single loop (one region namespace deleted at a time, across every
 * real scenario) is what the review said would have caught the whole
 * class instead of testing named instances one at a time -- it replaces
 * chasing individual panels with a general "delete this namespace, must
 * not throw" property.
 * ---------------------------------------------------------------------- */
{
  const REGIONS = ['neck', 'shoulder', 'knee', 'elbow', 'wrist_hand', 'hip', 'tmj', 'ankle_foot', 'lbp']
  for (const s of WORKSPACE_SCENARIOS) {
    for (const region of REGIONS) {
      test(`scenario "${s.label}" (${s.kind}) with safety_flags.${region} AND modules.${region} both deleted does not throw`, () => {
        const mutated = structuredClone(s.payload)
        delete mutated.responses.safety_flags[region]
        delete mutated.responses.modules[region]
        let threw = false
        try {
          renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: s.synthetic }))
        } catch {
          threw = true
        }
        assert.equal(threw, false)
      })
    }
  }
}

/* -------------------------------------------------------------------------
 * Malformed/legacy submission resilience batch, 4th independent review:
 * the review's own exhaustive sub-object sweep found the missing-namespace
 * class was NOT fully enumerated by the region loop above -- two more
 * shapes crash the same way (uncaught by the boundary in
 * DoctorView.tsx's own render body for Lbp/Neck/Shoulder, caught but
 * fail-open elsewhere): reproductive_status.derived absent/null (frozen
 * lbpAdapter.ts/neckAdapter.ts's mapPregnancyStatus reads `.source`
 * unconditionally), and medical_history_flags containing a non-string
 * element (frozen mapMajorHistory calls `.toUpperCase()` on each element
 * unconditionally). Both are namespace-complete-but-leaf-hollow/wrong-typed
 * shapes that `isDoctorPayloadShapeUsable` is designed to accept (it only
 * checks top-level presence), so the render itself has to hold.
 * ---------------------------------------------------------------------- */
{
  for (const s of WORKSPACE_SCENARIOS) {
    test(`scenario "${s.label}" (${s.kind}) with reproductive_status.derived deleted does not throw`, () => {
      const mutated = structuredClone(s.payload)
      delete mutated.responses.reproductive_status.derived
      let threw = false
      try {
        renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: s.synthetic }))
      } catch {
        threw = true
      }
      assert.equal(threw, false)
    })

    test(`scenario "${s.label}" (${s.kind}) with reproductive_status.derived = null does not throw`, () => {
      const mutated = structuredClone(s.payload)
      mutated.responses.reproductive_status.derived = null
      let threw = false
      try {
        renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: s.synthetic }))
      } catch {
        threw = true
      }
      assert.equal(threw, false)
    })

    test(`scenario "${s.label}" (${s.kind}) with medical_history_flags containing a non-string element does not throw`, () => {
      const mutated = structuredClone(s.payload)
      mutated.responses.medical_history.medical_history_flags = [null, 'diabetes', 42, { x: 1 }]
      let threw = false
      try {
        renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: s.synthetic }))
      } catch {
        threw = true
      }
      assert.equal(threw, false)
    })
  }
}

// ---------- 2. profile isolation ----------
test('pain scenario 1: no Myungri/명리, no birth-time, no herbal-only systemic content', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(!html.includes('명리'))
  assert.ok(!html.includes('workspace__myungri'))
  assert.ok(!html.includes('핵심 병기 후보'))
})

test('pain scenario 1: shows the pain-specific 오늘 확인할 것 section', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('오늘 확인할 것'))
  assert.ok(html.includes('원장 최종 판단'))
})

// Round 11: Myungri is no longer inside the clinical workspace AT ALL --
// not collapsed within it, not below it. It is a separate record surface
// (DoctorView's 명리 tab). This is the stronger form of the standing rule
// that it must be completely separated from the clinical flow, and it now
// holds for the herbal profile too, not only for pain.
test('round 11: NO profile renders Myungri inside the clinical workspace', () => {
  for (const [name, scenario] of [
    ['pain', PAIN_SCENARIO_1],
    ['herbal', HERBAL_SCENARIO_1],
    ['mixed', MIXED_SCENARIO_1],
  ]) {
    const html = render(scenario)
    assert.ok(!html.includes('workspace__myungri'), `${name}: no myungri block in the workspace`)
    assert.ok(!html.includes('명리 참고'), `${name}: no myungri disclosure in the workspace`)
  }
})

test('herbal scenario: systemic content shown, final assessment present', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(html.includes('핵심 병기 후보'))
  assert.ok(html.includes('오늘 확인할 것'))
  assert.ok(html.includes('최종 변증·병기'))
})

/* ---------- Round 11: the 10-second clinical view ----------
   The default workspace must be a clinical action screen. These pin the
   four layers and the things that must no longer occupy the default view.

   P0-1 (Core Reduction Phase 6 gate) re-pins this order: the regional
   SafetyPanels were promoted OUT of PainWorkspace's hero/glance layer to
   the DoctorWorkspace level (immediately after CommonSafetyBanner, before
   the profile bar/glance card) so they render regardless of view_profile
   -- see DoctorWorkspace.tsx. Safety now comes BEFORE the glance card,
   not after it. */
test('round 11/P0-1: the default workspace renders safety, then the glance card, judgment and next action in order', () => {
  const html = render(PAIN_SCENARIO_1)
  const safety = html.indexOf('workspace__block--safety')
  const glance = html.indexOf('workspace__hero')
  const judgment = html.indexOf('원장 최종 판단')
  const nextAction = html.indexOf('workspace__nextAction')
  assert.ok(safety !== -1 && glance !== -1 && judgment !== -1 && nextAction !== -1, 'all four layers render')
  assert.ok(safety < glance, 'safety (promoted to DoctorWorkspace level) comes before the glance card')
  assert.ok(glance < judgment, 'the glance card is above the clinician action area')
  assert.ok(judgment < nextAction, 'next action closes the flow')
})

/* ---------- P0-1 (Core Reduction Phase 6 gate, delta risk #1): the
   regional SafetyPanels must render on a herbal-derived screen too --
   the gate on visibility is `safety_flags.<region> !== null`, never
   `view_profile`. Before this fix, these 9 panels only ever mounted
   inside PainWorkspace, which never renders under the herbal profile --
   a profile-gated safety surface (Phase 3 Opus review §5-1's fail-open
   class). These tests pin: (a) the safety block mounts under EVERY
   profile including herbal, (b) it never double-renders now that
   PainWorkspace's own copy is gone, and (c) a record whose routing
   signals disagree with its safety_flags (derives 'herbal' while still
   carrying a real, non-null safety_flags.<region> -- version-skew/
   legacy-data class, not a normal production shape) still surfaces that
   region's real computed content, proving the gate really is
   region-level and not profile-level. ---------------------------------- */
test('P0-1: the safety block (안전 확인) mounts for pain/mixed profiles (a real applicable region exists)', () => {
  for (const [name, scenario] of [
    ['pain', PAIN_SCENARIO_1],
    ['mixed', MIXED_SCENARIO_1],
  ]) {
    const html = render(scenario)
    assert.ok(html.includes('workspace__block--safety'), `${name}: safety block wrapper renders`)
    assert.ok(html.includes('안전 확인'), `${name}: safety block heading renders`)
  }
})

// tablet-viewport.spec.mjs layout-budget follow-up: a genuinely
// herbal-only record (no pain module, so all 9 safety_flags.<region> are
// correctly null) must NOT render the "안전 확인" heading + hint with zero
// panel content underneath -- that would be pure noise/added height with
// no information, not "profile-independent visibility". The gate is
// region-applicability, not view_profile -- see the fail-open test below
// for the case where a herbal-derived record DOES have an applicable
// region and the block correctly still renders.
test('P0-1: the safety block renders NOTHING (no empty-heading noise) for a genuinely herbal-only scenario with no applicable region', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(!html.includes('workspace__block--safety'), 'no safety block wrapper when zero regions apply')
})

test('P0-1: the safety block never double-renders (PainWorkspace no longer mounts its own copy)', () => {
  for (const scenario of [PAIN_SCENARIO_1, MIXED_SCENARIO_1]) {
    const html = render(scenario)
    const count = html.split('workspace__block--safety').length - 1
    assert.equal(count, 1, `${scenario.label}: exactly one workspace__block--safety wrapper, found ${count}`)
  }
  // HERBAL_SCENARIO_1 legitimately renders it ZERO times (see the test
  // above) -- "never double" here means "never more than one", so assert
  // that directly rather than assuming exactly one.
  const herbalCount = render(HERBAL_SCENARIO_1).split('workspace__block--safety').length - 1
  assert.ok(herbalCount <= 1, `HERBAL_SCENARIO_1: at most one workspace__block--safety wrapper, found ${herbalCount}`)
})

test('P0-1 fail-open guard: a herbal-derived payload whose routing disagrees with a real safety_flags.lbp still renders the LBP panel', () => {
  // Simulates the exact class Phase 3 Opus review §5-1 flagged: routing
  // (view_profile's only input) says "no pain content", but
  // responses.safety_flags.lbp is still a real, already-computed,
  // non-null value (e.g. version skew between when a record's routing was
  // last derived and when its safety_flags were computed) -- built from a
  // REAL pain scenario's already-valid safety_flags/modules.lbp, mutating
  // only the routing signals deriveViewProfile reads.
  const mutated = structuredClone(PAIN_SCENARIO_1.payload)
  assert.ok(mutated.responses.safety_flags.lbp != null, 'sanity: the source scenario really has a computed LBP flag')
  mutated.routing.primary_module = null
  mutated.routing.additional_module = null
  mutated.routing.questionnaire_mode = 'herbal_addon'
  const html = renderToString(
    React.createElement(DoctorWorkspace, { payload: mutated, synthetic: PAIN_SCENARIO_1.synthetic }),
  )
  assert.ok(html.includes('data-view-profile="herbal"'), 'sanity: this payload really derives to the herbal profile')
  assert.ok(html.includes('안전 확인 — 허리(LBP)'), 'the LBP safety panel still renders its real content under the herbal profile')
})

// Phase 7 §1.1-#5: the SAME fail-open class, pinned at the lane1 UNION
// summary level (VisitSummaryAside's chip) rather than only at the raw
// panel-render level above -- the union must read this region's real
// computed status, never silently fall back to 해당없음/CLEAR just
// because the record derives 'herbal'.
test('P0-1/§1.1-#5 fail-open guard: the lane1 union summary chip reflects a herbal-derived payload\'s real applicable region, never 해당없음', () => {
  const mutated = structuredClone(PAIN_SCENARIO_1.payload)
  mutated.routing.primary_module = null
  mutated.routing.additional_module = null
  mutated.routing.questionnaire_mode = 'herbal_addon'
  const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: PAIN_SCENARIO_1.synthetic }))
  assert.ok(html.includes('data-view-profile="herbal"'), 'sanity: this payload really derives to the herbal profile')
  assert.ok(!html.includes('doctor__lane1Chip--na'), 'the union summary must not read 해당없음 when a real region applies')
  const chipMatch = html.match(/doctor__lane1Chip doctor__lane1Chip--(\w+)/)
  assert.ok(chipMatch, 'a lane1 status chip renders at all')
})

test('MAJOR-2 (Phase 10 closing review): a corrupted medication_use payload makes SafetyGlance warn "안전정보 일부를 읽을 수 없습니다" while the lane1 chip must NOT read CLEAR (fail-open, live-demonstrated)', () => {
  const mutated = structuredClone(PAIN_SCENARIO_1.payload)
  mutated.responses.medication.medication_use = 'corrupted-legacy-value'
  const html = render({ ...PAIN_SCENARIO_1, payload: mutated })
  assert.ok(
    html.includes('안전정보 일부를 읽을 수 없습니다'),
    'sanity: the full-record SafetyGlance really does warn about this corrupted field',
  )
  assert.ok(
    !html.includes('doctor__lane1Chip--clear'),
    'the left-hand lane1 chip must never read CLEAR while the full record warns beside it',
  )
  const chipMatch = html.match(/doctor__lane1Chip doctor__lane1Chip--(\w+)/)
  assert.ok(chipMatch, 'a lane1 status chip renders at all')
  assert.equal(chipMatch[1], 'unavailable', 'the chip must read 계산불가 (--unavailable), matching the union axis')
})

test('round 11: the mandatory-looking Clinical Loop checklist is gone from the default view', () => {
  for (const scenario of [PAIN_SCENARIO_1, HERBAL_SCENARIO_1, MIXED_SCENARIO_1]) {
    const html = render(scenario)
    assert.ok(!html.includes('workspace__loopStatus'), 'no clinical loop bar')
  }
})

test('round 11: the full Care Plan / next-reassessment forms are behind a closed disclosure when unused', () => {
  const html = render(PAIN_SCENARIO_1)
  const idx = html.indexOf('관리 계획 · 다음 재평가')
  assert.ok(idx !== -1, 'the disclosure exists')
  const detailsIdx = html.lastIndexOf('<details', idx)
  const tag = html.slice(detailsIdx, html.indexOf('>', detailsIdx) + 1)
  // ...but the content is still rendered inside it, so nothing recorded is lost.
  assert.ok(html.includes('환자 전달용 치료 계획') || html.includes('참고 자료'), 'reference material still present')
  assert.ok(typeof tag === 'string' && tag.startsWith('<details'), 'it really is a disclosure')
})

test('round 11: reference material moved into a drawer, not deleted', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('참고 자료'), 'the reference drawer exists')
  assert.ok(html.includes('환자 전달용 치료 계획'), 'the patient-facing preview is still rendered')
  assert.ok(html.includes('EMR'), 'the EMR preview is still rendered')
})

test('round 11/13: NEXT ACTION reads back recorded values and never invents one', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('다음 액션'), 'the layer always exists')

  // Round 13: with nothing recorded, the card collapses to ONE compact line
  // instead of three repeated "아직 기록 없음" rows saying the same thing.
  const collapsed = html.includes('다음 액션 미설정')
  if (collapsed) {
    assert.ok(!html.includes('아직 기록 없음'), 'the empty state does not repeat itself')
    assert.ok(html.includes('workspace__nextAction--empty'), 'the empty state is marked as such')
  } else {
    // ...and with content, the full read-back returns, unchanged.
    assert.ok(html.includes('환자가 집에서 할 일'))
    assert.ok(html.includes('다음에 확인할 것'))
    assert.ok(html.includes('다음 재평가'))
  }
})

test('round 13: a recorded next-action value is never hidden by the empty collapse', () => {
  // The collapse is a property of emptiness, not a mode the clinician has
  // to get out of: one recorded field brings the whole read-back back.
  // Seeded through the real persistence prop, so this exercises the same
  // path a saved record takes.
  const html = renderWith(PAIN_SCENARIO_1, {
    // A partial state is fine: deserializeWorkspaceState degrades per field
    // and fills the rest from the empty default (see persistence.ts).
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: '',
        rehabilitationGoal: '',
        homeActionPlan: 'ROUND13 집에서 할 일',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: '',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  assert.ok(html.includes('ROUND13 집에서 할 일'), 'the recorded value renders')
  assert.ok(!html.includes('다음 액션 미설정'), 'the compact empty line is gone once content exists')
})

// Round 11 renamed both profiles' confirm sections to the same "오늘 확인할 것"
// heading, so the heading no longer distinguishes them -- the CONTENT does.
// Pain fills it with the exam-suggestion list, herbal with the clinician
// observation checklist, and neither may render the other's.
test('herbal scenario: does not render the pain-specific exam-suggestion list', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(!html.includes('workspace__examSuggestions'))
  assert.ok(html.includes('workspace__observationChecklist'))
})

test('mixed scenario: both 통증 진료 and 한약·전신 tabs present, Common Safety renders exactly once', () => {
  const html = render(MIXED_SCENARIO_1)
  assert.ok(html.includes('통증 진료'))
  assert.ok(html.includes('한약·전신'))
  const safetyCount = (html.match(/doctor__commonSafety/g) ?? []).length
  assert.equal(safetyCount, 1, 'Common Safety block renders exactly once, not once per tab')
})

test('mixed scenario: default active tab shows Pain workspace content (has pain content)', () => {
  const html = render(MIXED_SCENARIO_1)
  assert.ok(html.includes('workspace__examSuggestions'))
})

// ---------- 3. provenance / unknown semantics ----------
test('pain scenario 1: SUGGESTED exam items carry a 제안 provenance badge, never presented as confirmed', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('workspace__provBadge'))
  assert.ok(html.includes('제안'))
})

test('pain scenario 1: NOT_YET_CHECKED items render as 아직 확인 안 됨, never as a negative result', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('아직 확인 안 됨'))
})

/* ------------------------------------------------------------------------
 * Batch 2.6 (E-8/C-5): the "아직 확인 안 됨 · N건" pending-counter line
 * shows the count only -- the exam-suggestion cards immediately below it
 * already carry the same titles, so listing them a second time on the
 * counter line was a pure duplicate.
 * ---------------------------------------------------------------------- */
test('Batch 2.6 E-8: with 3 distinct NOT_YET_CHECKED items, the pending-counter line names none of their titles (cards below already carry them)', () => {
  const items = [
    { id: 'e8-1', title: 'ROUND26 목표 동작 A', priority: 'MUST_CHECK', reasonFacts: [], source: 'SUGGESTED', result: { status: 'NOT_YET_CHECKED', laterality: 'NOT_APPLICABLE', note: '', recordedAt: null } },
    { id: 'e8-2', title: 'ROUND26 목표 동작 B', priority: 'MUST_CHECK', reasonFacts: [], source: 'SUGGESTED', result: { status: 'NOT_YET_CHECKED', laterality: 'NOT_APPLICABLE', note: '', recordedAt: null } },
    { id: 'e8-3', title: 'ROUND26 목표 동작 C', priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status: 'NOT_YET_CHECKED', laterality: 'NOT_APPLICABLE', note: '', recordedAt: null } },
  ]
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'e8-multi-pending',
    synthetic: undefined,
    lbpObjectiveMotorDeficit: 'NONE',
    initialWorkspaceState: { painExamSuggestions: items },
  })
  const counterIdx = html.indexOf('아직 확인 안 됨 ·')
  assert.ok(counterIdx !== -1, 'the pending counter renders')
  const counterEnd = html.indexOf('</p>', counterIdx)
  const counterChunk = html.slice(counterIdx, counterEnd)
  for (const item of items) {
    assert.ok(!counterChunk.includes(item.title), `"${item.title}" does not appear on the counter line itself`)
    assert.ok(html.includes(item.title), `sanity: "${item.title}" DOES still appear somewhere on the page (in its own card, below the counter)`)
  }
  assert.ok(counterChunk.includes('건'), 'the counter still expresses a count')
})

test('pain scenario 2: a clinician-recorded POSITIVE result renders distinctly from NOT_YET_CHECKED', () => {
  const html = render(PAIN_SCENARIO_2)
  assert.ok(html.includes('양성/이상 소견'))
  assert.ok(html.includes('workspace__examCard--done'))
})

// ---------- 4. EMR preview: SUGGESTED never becomes confirmed, NOT_YET_CHECKED never becomes negative ----------
// LBP v1 Batch 4 (§14.1): the 6-key reformat folds exam findings into the
// fixed "O" key's value (labeled "검사 결과: ..." inside it, no longer its
// own "진찰 소견:" line) -- the fixed "O:" key itself always renders, even
// bare, so that skeleton guarantee is what this test now pins instead.
test('EMR preview (pain scenario 1, all exams NOT_YET_CHECKED): the fixed "O:" key still renders (bare), exam titles never appear as findings', () => {
  const html = render(PAIN_SCENARIO_1)
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  assert.ok(emrIdx !== -1)
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(emrTextOnly.includes('O:'), 'the fixed O key renders even with nothing to report')
  assert.ok(!emrTextOnly.includes('검사 결과:'), 'no exam-findings clause at all when every exam is NOT_YET_CHECKED')
  // The exam is NOT_YET_CHECKED -- its title must not appear inside the EMR text as a finding.
  assert.ok(!emrTextOnly.includes('요추 능동 움직임 반응 검사'))
})

test('EMR preview (pain scenario 2: one POSITIVE, one NOT_YET_CHECKED, one already recorded): only the recorded finding appears', () => {
  const html = render(PAIN_SCENARIO_2)
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(emrTextOnly.includes('Slump'), 'the recorded POSITIVE finding appears in the EMR preview')
  assert.ok(!emrTextOnly.includes('SLR(하지직거상) 검사'), 'a NOT_YET_CHECKED item never appears as a finding')
})

// LBP v1 Batch 4 (§14.1): "최종 임상 판단" (formerly the standalone
// "Assessment:" line) is now a clause inside the fixed "A:" key -- with no
// clinician judgment, no hypothesis, no treatment focus and no
// reassessment note recorded (PAIN_SCENARIO_1's default state), A itself
// renders bare, exactly like every other empty key.
test('EMR preview never contains a false-confirmed clinical judgment as a false-confirmed line (the fixed "A:" key starts bare)', () => {
  const html = render(PAIN_SCENARIO_1)
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(!emrTextOnly.includes('최종 임상 판단:'), 'no 최종 임상 판단 clause without clinician text')
  assert.ok(emrTextOnly.includes('A:'), 'the fixed A key still renders, bare')
})

/* -----------------------------------------------------------------------
 * 14차 독립 리뷰 MEDIUM-2: `result.status`/`result.laterality`는
 * sanitizeShape의 typeof-매칭만 거치므로 알려지지 않은 문자열/숫자도 그대로
 * 통과한다 -- `EXAM_CHECK_STATUS_LABEL[status]`/`LATERALITY_LABEL
 * [laterality]`가 그 키를 모르면 undefined를 반환하고, 원장이 그대로
 * 복사해 붙여넣는 EMR 텍스트에 리터럴 "undefined"가 노출됐다. 또한 그
 * garbage 상태는 `!== 'NOT_YET_CHECKED'` 필터를 그냥 통과해 "확인된 소견"인
 * 것처럼 취급됐다.
 * ------------------------------------------------------------------- */
test('14차 MEDIUM-2: a wrong-typed (garbage string) exam result.status never leaks the literal "undefined" into the EMR text, and is not treated as a recorded finding', () => {
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    painExamSuggestions: [
      {
        id: 'e1',
        title: '가비지 상태 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'ZZZ', laterality: null, note: '', recordedAt: null },
      },
      {
        id: 'e2',
        title: '정상 소견 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'NEGATIVE', laterality: 'LEFT', note: '', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ],
    updated_at: null,
  }
  const html = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(!emrTextOnly.includes('undefined'), 'a garbage status must never leak the literal "undefined" into EMR text')
  assert.ok(!emrTextOnly.includes('가비지 상태 검사'), 'an item whose status cannot be recognized must not be listed as a recorded finding')
  assert.ok(emrTextOnly.includes('정상 소견 검사'), 'a genuinely well-formed sibling finding must still appear')
  assert.ok(emrTextOnly.includes('음성/정상'), 'the well-formed finding\'s real label must appear')
})

test('14차 MEDIUM-2: a wrong-typed (number) exam result.laterality never leaks the literal "undefined" into the EMR text', () => {
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    painExamSuggestions: [
      {
        id: 'e1',
        title: '가비지 좌우 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'POSITIVE', laterality: 7, note: '', recordedAt: null },
      },
    ],
    updated_at: null,
  }
  const html = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(!emrTextOnly.includes('undefined'))
  assert.ok(emrTextOnly.includes('가비지 좌우 검사'), 'the finding itself (a genuinely valid POSITIVE status) still appears -- only the unreadable laterality suffix is omitted')
  assert.ok(emrTextOnly.includes('양성/이상 소견'))
})

/* -----------------------------------------------------------------------
 * LBP v1 Batch 2.5b (G15): ExamCheckStatus 6상태.
 * 설계 문서: docs/LBP_V1_BATCH2_5B_FABLE_IMPACT_SCOPE_v0.1.md
 *
 * 값 수준 계약은 tests/workspace-round3.spec.mjs가 본다. 여기서는 원장이
 * 실제로 보는 것만 본다 -- 버튼이 화면에 있는지, EMR 텍스트가 신규 2값을
 * "사실"로 쓰면서 미확인은 여전히 빼는지.
 * ------------------------------------------------------------------- */

// T-1b: 값 목록이 맞아도 카드가 그 목록을 쓰지 않으면 원장은 신규 상태를
// 고를 수 없다. 손으로 쓴 STATUS_OPTIONS 리터럴이 되살아나는 것을 막는다.
test('Batch 2.5b T-1b: an exam suggestion card renders all 6 status buttons (제한/시행 못 함 포함)', () => {
  const html = render(PAIN_SCENARIO_1)
  for (const label of ['양성/이상 소견', '음성/정상', '불명확', '제한적 시행(판단 유보)', '시행 못 함', '아직 확인 안 됨']) {
    assert.ok(html.includes(label), `status button "${label}" must be offered to the clinician`)
  }
})

test('Batch 2.5b T-1b: the two new status buttons are real aria-pressed buttons, not decorative text', () => {
  const html = render(PAIN_SCENARIO_1)
  for (const label of ['제한적 시행(판단 유보)', '시행 못 함']) {
    const idx = html.indexOf(label)
    assert.ok(idx !== -1)
    // walk back to the enclosing tag and check it is a status button with aria-pressed
    const openIdx = html.lastIndexOf('<button', idx)
    assert.ok(openIdx !== -1, `"${label}" must sit inside a <button>`)
    const chunk = html.slice(openIdx, idx)
    assert.ok(chunk.includes('workspace__statusBtn'), `"${label}" must be a workspace__statusBtn`)
    assert.ok(chunk.includes('aria-pressed='), `"${label}" must expose aria-pressed`)
  }
})

// T-1b (재검 카드 쌍둥이): 설계 §4 T-1은 ExamSuggestionCard와
// StructuredReassessmentCard 둘 다의 렌더를 요구했다. 위 두 테스트는
// suggestion 카드만 봤으므로, 손으로 쓴 STATUS_OPTIONS 리터럴이
// StructuredReassessmentCard.tsx에서만 되살아나도 검출되지 않았다
// (Opus delta review, defect 1). 오늘 재검 목록을 열기 위한 초기 상태는
// 아래 "오늘 재검 목록 renders open..." 테스트(§1.3-#7)와 동일한 형태.
test('Batch 2.5b T-1b (reassessment card): the structured reassessment card renders all 6 status buttons (제한/시행 못 함 포함)', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'reassess-6btn',
    initialWorkspaceState: {
      painReassessment: {
        items: [
          {
            id: 'r1', title: '재검 항목', previous: null,
            result: { status: 'NOT_YET_CHECKED', laterality: 'NOT_APPLICABLE', note: '', recordedAt: null },
          },
        ],
      },
    },
  })
  for (const label of ['양성/이상 소견', '음성/정상', '불명확', '제한적 시행(판단 유보)', '시행 못 함', '아직 확인 안 됨']) {
    assert.ok(html.includes(label), `reassessment status button "${label}" must be offered to the clinician`)
  }
})

test('Batch 2.5b T-1b (reassessment card): the two new status buttons are real aria-pressed buttons, not decorative text', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'reassess-6btn-buttons',
    initialWorkspaceState: {
      painReassessment: {
        items: [
          {
            id: 'r1', title: '재검 항목', previous: null,
            result: { status: 'NOT_YET_CHECKED', laterality: 'NOT_APPLICABLE', note: '', recordedAt: null },
          },
        ],
      },
    },
  })
  for (const label of ['제한적 시행(판단 유보)', '시행 못 함']) {
    const idx = html.indexOf(label)
    assert.ok(idx !== -1)
    // walk back to the enclosing tag and check it is a status button with aria-pressed
    const openIdx = html.lastIndexOf('<button', idx)
    assert.ok(openIdx !== -1, `"${label}" must sit inside a <button>`)
    const chunk = html.slice(openIdx, idx)
    assert.ok(chunk.includes('workspace__statusBtn'), `"${label}" must be a workspace__statusBtn`)
    assert.ok(chunk.includes('aria-pressed='), `"${label}" must expose aria-pressed`)
  }
})

// T-2: 이 배치의 임상적 요점. 제한/미시행은 사실로 기록되고(EMR에 나타남),
// 미확인은 여전히 빠지고, 어느 쪽도 "음성/정상"으로 찍히지 않는다.
test('Batch 2.5b T-2: EMR preview lists LIMITED and NOT_PERFORMED as recorded facts, still omits NOT_YET_CHECKED, and never renders either as 음성/정상', () => {
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    painExamSuggestions: [
      {
        id: 'e_lim',
        title: '제한 시행 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'LIMITED', laterality: 'LEFT', note: '통증으로 각도 미달', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
      {
        id: 'e_np',
        title: '시행 못 한 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'NOT_PERFORMED', laterality: null, note: '급성기라 보류', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
      {
        id: 'e_nyc',
        title: '아직 안 한 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
      },
    ],
    updated_at: null,
  }
  const html = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)

  assert.ok(emrTextOnly.includes('제한 시행 검사'), 'a LIMITED result is a recorded fact and must appear in the EMR text')
  assert.ok(emrTextOnly.includes('제한적 시행(판단 유보)'), "the LIMITED item's own label must appear")
  assert.ok(emrTextOnly.includes('통증으로 각도 미달'), "the LIMITED item's note must carry through")
  assert.ok(emrTextOnly.includes('시행 못 한 검사'), 'a NOT_PERFORMED result is a recorded fact and must appear in the EMR text')
  assert.ok(emrTextOnly.includes('시행 못 함'), "the NOT_PERFORMED item's own label must appear")
  assert.ok(emrTextOnly.includes('급성기라 보류'), "the NOT_PERFORMED item's reason note must carry through")

  assert.ok(!emrTextOnly.includes('아직 안 한 검사'), 'a NOT_YET_CHECKED item must still never be listed as a finding')
  assert.ok(!emrTextOnly.includes('음성/정상'), 'neither new state may ever render as 음성/정상 -- the file\'s core safety invariant')
  assert.ok(!emrTextOnly.includes('undefined'), 'no new state may leak the literal "undefined" into EMR text')
})

test('Batch 2.5b T-2: a NOT_PERFORMED / LIMITED item leaves "아직 확인 안 됨" pending state (workspace__examCard--done) like any other recorded result', () => {
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    painExamSuggestions: [
      {
        id: 'e_np',
        title: '시행 못 한 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'NOT_PERFORMED', laterality: null, note: '', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ],
    updated_at: null,
  }
  const html = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  assert.ok(html.includes('workspace__examCard--done'), 'a NOT_PERFORMED item is recorded, so its card is not in the pending style')
})

// CD-2.5b-2 (권고안): 사유 메모를 필수로 만들지 않는 대신, NOT_PERFORMED를
// 고르면 상세·메모가 자동으로 펼쳐져 사유 기록을 유도한다.
test('Batch 2.5b CD-2.5b-2: choosing 시행 못 함 auto-opens 상세·메모 (no "상세·메모 추가" prompt left to click), while a plain NEGATIVE keeps it collapsed', () => {
  const mk = (status) => ({
    schema_version: '1.1.0',
    painExamSuggestions: [
      {
        id: 'only',
        title: '단일 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status, laterality: 'NOT_APPLICABLE', note: '', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ],
    updated_at: null,
  })
  const notPerformed = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState: mk('NOT_PERFORMED'), synthetic: undefined })
  const negative = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState: mk('NEGATIVE'), synthetic: undefined })
  assert.ok(notPerformed.includes('workspace__examCard__detailRow'), '시행 못 함 must open the note field so the reason can be recorded')
  assert.ok(!negative.includes('workspace__examCard__detailRow'), 'a plain NEGATIVE keeps the compressed default (round 13) -- 이 자동 펼침은 NOT_PERFORMED 한정')
})

/* T-5: 재진 이월 2경로(RevisitWorkspace.tsx)는 이 배치에서 코드를 바꾸지
 * 않는다 -- 신규 2값이 이월되는 것은 필터가 `!== 'NOT_YET_CHECKED'` 형태라서
 * 성립하는 동작이다. RevisitWorkspace는 이 spec의 번들에 없으므로(원장 화면
 * 전체 shell), 그 필터가 상태를 하드코딩한 목록으로 좁혀지지 않았는지를
 * 소스 수준에서 고정한다. 같은 파일의 label-lookup 가드는
 * tests/save-conflict.spec.mjs가 이미 본다. */
test('Batch 2.5b T-5: both prior-visit recap paths in RevisitWorkspace.tsx still filter by isValidExamStatus + !== NOT_YET_CHECKED (never a hardcoded POSITIVE/NEGATIVE allowlist)', () => {
  const src = fs.readFileSync(new URL('../src/doctor/workspace/RevisitWorkspace.tsx', import.meta.url), 'utf8')
  const matches = src.match(
    /\.filter\(\(i\) => isValidExamStatus\(i\.result\.status\) && i\.result\.status !== 'NOT_YET_CHECKED'\)/g,
  )
  assert.equal(matches ? matches.length : 0, 2, 'both recap functions must keep the "any recorded status carries forward" filter')
  assert.ok(
    !/i\.result\.status === 'POSITIVE'\s*\|\|\s*i\.result\.status === 'NEGATIVE'/.test(src),
    'narrowing the recap to POSITIVE/NEGATIVE would silently drop 제한/미시행 from the next visit',
  )
})

// ---------- 5. accessibility ----------
test('exam suggestion status buttons expose aria-pressed', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('aria-pressed="true"') || html.includes('aria-pressed="false"'))
})

// Core Reduction P2/P3 (Phase 5 Synthesis v1.2 §2.4): the mixed pain/herbal
// tab switcher and the profile segmented control are BOTH retired from the
// default UI -- a mixed record now naturally places both profiles' content
// in every lane (no tabs), and there is no more manual "view as a
// different single profile" override. These two tests pin the removal
// (rewritten, not deleted, per this round's testing rule) alongside the
// P2/P3 tests elsewhere that pin what replaced them (both profiles' lane2
// content, the shared 판단·처치 lane with its own "+ 다른 유형 입력 추가"
// toggle).
test('mixed scenario: no pain/herbal tab switcher (§2.4 removal) -- both profiles render naturally, no role="tab"', () => {
  const html = render(MIXED_SCENARIO_1)
  assert.ok(!html.includes('role="tab"'), 'the mixed pain/herbal tab switcher no longer exists')
  assert.ok(html.includes('workspace__examSuggestions'), 'pain lane2 content renders')
  assert.ok(html.includes('workspace__observationChecklist'), 'herbal lane2 content renders alongside it')
})

test('profile segmented control (§2.4 "자동 분류" banner/세그먼트) no longer renders on any profile', () => {
  for (const scenario of [PAIN_SCENARIO_1, HERBAL_SCENARIO_1, MIXED_SCENARIO_1]) {
    const html = render(scenario)
    assert.ok(!html.includes('워크스페이스 프로필'), `${scenario.label}: no profile switcher label`)
    assert.ok(!html.includes('workspace__profileBar'), `${scenario.label}: no profile bar wrapper`)
    assert.ok(!html.includes('workspace__segmentedBtn'), `${scenario.label}: no segmented control buttons`)
  }
})

// ---------- 6. follow-up / reassessment ----------
test('reassessment picker shows 재평가 대상 and an explicit pure-Korean "no automatic comparison" status (no fake repeat-visit judgment, and no internal English tracking phrase leaking into the clinician UI)', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('재평가 대상'))
  assert.ok(html.includes('재진 자동 비교: 자동 판단 없음'))
  assert.ok(!html.includes('OPERATIONAL INTEGRATION REQUIRED'))
})

// ---------- 6b. round 2 Phase 2/3/5/8/14: persistence, conditional sections, override UX, adopt-to-final, tab a11y ----------

const emptyHerbalFinalAssessment = () => ({
  finalPatternOrMechanism: '',
  treatmentPrinciple: '',
  prescriptionPlanNote: '',
  symptomsToTrack: '',
  recordedAt: null,
})
const emptyPainFinalAssessment = () => ({
  finalWorkingAssessment: '',
  treatmentFocus: '',
  interventionPerformedOrPlanned: '',
  immediateRetestTarget: '',
  recordedAt: null,
})

// Core Reduction P4 (Phase 5 Synthesis v1.2 §2.11): 여성·생식 정보 no
// longer renders inside DoctorWorkspace's herbal "참고 자료" drawer at all,
// regardless of WOMEN_SAFETY_01 -- it was a duplicate of the fuller version
// (with the derived pregnancy/postpartum calc box) that now lives ONLY in
// DoctorView.tsx's 참고 screen "여성 안전" accordion. These two tests used
// to pin the drawer's OWN conditional rendering of that duplicate; rewritten
// (not deleted) to pin its full removal from this component instead, for
// both the "never answered" and "answered" fixtures.
test('reproductive section never renders inside the herbal workspace reference drawer, even when WOMEN_SAFETY_01 was never asked/answered (legacy constitution route, HERBAL_SCENARIO_1)', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(!html.includes('여성·생식 정보'))
})

test('reproductive section never renders inside the herbal workspace reference drawer even when WOMEN_SAFETY_01 was answered -- it is deduped to DoctorView.tsx\'s 참고 screen accordion only (HERBAL_SCENARIO_2)', () => {
  const html = render(HERBAL_SCENARIO_2)
  assert.ok(!html.includes('여성·생식 정보'))
})

test('round 14: production mode (no synthetic clinicianObservations) collapses the checklist to one summary line naming every item', () => {
  const html = renderWith(HERBAL_SCENARIO_2, { synthetic: { patternCandidates: [] } })
  // The default checklist is still the same four items -- the summary must
  // name all of them, so collapsing never hides WHAT is outstanding.
  assert.ok(html.includes('설진 · 맥진 · 복진 · 추가 문진'))
  assert.ok(html.includes('4건 미확인'))
  // ...and the rows are one explicit action away, not gone.
  assert.ok(html.includes('빠른 입력'))
  // Nothing is sitting open as a form waiting to be typed into.
  const boxes = html.match(/placeholder="소견 입력"/g) ?? []
  assert.equal(boxes.length, 0, 'a fully-unrecorded checklist may not open any note box')
})

test('round 13/14: once the checklist is shown, rows are tap-first — 특이없음 per row, note box only where content exists', () => {
  // HERBAL_SCENARIO_2 carries its own observations, two of them already
  // recorded, so the checklist auto-opens (round 14) and the round-13
  // per-row behaviour is what is under test here.
  const html = render(HERBAL_SCENARIO_2)
  assert.ok(!html.includes('빠른 입력'), 'a checklist holding recorded content must not be collapsed')
  const taps = html.match(/특이없음/g) ?? []
  assert.ok(taps.length >= 4, `expected a 특이없음 tap action per row, found ${taps.length}`)
  // The two recorded rows show their text; the two empty ones offer 메모
  // rather than an open box.
  assert.ok(html.includes('홍설, 소태'))
  assert.ok(html.includes('삭맥'))
  const boxes = html.match(/placeholder="소견 입력"/g) ?? []
  assert.equal(boxes.length, 2, 'only the rows that already hold free text may open a note box')
  const memos = html.match(/>메모</g) ?? []
  assert.equal(memos.length, 2, 'the untouched rows offer the note toggle instead of an open box')
})

test('round 13: an observation that already holds free text renders its note box open', () => {
  const html = renderWith(HERBAL_SCENARIO_2, {
    submissionId: 'obs-note-test',
    synthetic: { patternCandidates: [] },
    initialWorkspaceState: {
      herbalClinicianObservations: [
        {
          id: 'obs_tongue',
          category: 'TONGUE',
          title: '설진 소견',
          checked: true,
          value: '설질 담백 · 치흔',
          recordedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  })
  // the recorded wording is shown verbatim, in an OPEN input -- a compressed
  // default must never hide something the clinician already wrote.
  assert.ok(html.includes('설질 담백 · 치흔'))
  assert.ok(html.includes('placeholder="소견 입력"'))
})

test('round 14: the Herbal final-assessment card opens 판단/처치/재검 and collapses 치법', () => {
  const html = render(HERBAL_SCENARIO_2)
  // the three the default view asks for stay open...
  assert.ok(html.includes('최종 변증·병기'))
  assert.ok(html.includes('처방/계획 메모'))
  assert.ok(html.includes('추적할 증상'))
  // ...and 치법 -- the herbal analogue of 치료 초점 -- moves behind a
  // closed disclosure rather than being a fourth open textarea.
  assert.ok(html.includes('치법 — 필요할 때 입력'))
  // Core Reduction P3 (§2.4): HERBAL_SCENARIO_2 derives the 'mixed' profile
  // (both pain and herbal content apply), so the 판단·처치 lane now shows
  // BOTH Final Assessment cards -- Pain's own secondary disclosure ("치료
  // 초점 — 필요할 때 입력") legitimately co-exists with Herbal's ("치법 —
  // ..."). Isolate the ONE disclosure whose summary is specifically 치법
  // instead of counting every `__secondary` disclosure on the page.
  const allSecondary = [...html.matchAll(/<details[^>]*workspace__finalAssessment__secondary[^>]*>/g)]
  const herbalSecondary = allSecondary.find((m) => html.slice(m.index, m.index + 300).includes('치법 — 필요할 때 입력'))
  assert.ok(herbalSecondary, 'a 치법 secondary disclosure exists')
  assert.ok(!/open/.test(herbalSecondary[0]), 'an empty 치법 must start closed')
})

test('round 14: a 치법 that already holds text opens its disclosure on render', () => {
  const html = renderWith(HERBAL_SCENARIO_2, {
    submissionId: 'herbal-secondary-test',
    initialWorkspaceState: {
      herbalFinalAssessment: {
        finalPatternOrMechanism: '',
        treatmentPrinciple: '기존에 기록된 치법',
        prescriptionPlanNote: '',
        symptomsToTrack: '',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  assert.ok(html.includes('기존에 기록된 치법'))
  // Core Reduction P3 (§2.4): see the previous test's comment -- HERBAL_SCENARIO_2
  // derives 'mixed', so Pain's own (empty, closed) secondary disclosure
  // co-exists with this populated Herbal one.
  const allSecondary = [...html.matchAll(/<details[^>]*workspace__finalAssessment__secondary[^>]*>/g)]
  const herbalSecondary = allSecondary.find((m) => html.slice(m.index, m.index + 400).includes('기존에 기록된 치법'))
  assert.ok(herbalSecondary, 'a 치법 secondary disclosure containing the recorded text exists')
  assert.ok(/open/.test(herbalSecondary[0]), 'a populated 치법 may never be hidden behind a closed disclosure')
})

test('no manual-override banner on first render (profile matches auto-derived by default)', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(!html.includes('workspace__overrideNotice'))
  assert.ok(!html.includes('수동 보기'))
})

// Core Reduction P2/P3 (§2.4): superseded by the "no pain/herbal tab
// switcher" test above -- there is no more tablist/tabpanel a11y wiring to
// pin because the mixed pain/herbal tab switcher itself was retired, not
// merely restyled. Kept (rewritten, not deleted) as an explicit regression
// guard against the wiring quietly coming back.
test('mixed scenario: no tablist/tabpanel wiring remains (the pain/herbal tab switcher was retired, not merely restyled)', () => {
  const html = render(MIXED_SCENARIO_1)
  assert.ok(!html.includes('role="tablist"'))
  assert.ok(!html.includes('role="tabpanel"'))
})

test('adopt-to-final convenience button only appears for an ACCEPTED candidate, not PENDING_REVIEW', () => {
  const pendingHtml = renderWith(HERBAL_SCENARIO_1, {})
  // HERBAL_SCENARIO_1's candidate starts PENDING_REVIEW -- no adopt button yet.
  assert.ok(!pendingHtml.includes('최종 판단에 가져오기'))

  const acceptedScenario = {
    ...HERBAL_SCENARIO_1,
    synthetic: {
      ...HERBAL_SCENARIO_1.synthetic,
      patternCandidates: HERBAL_SCENARIO_1.synthetic.patternCandidates.map((c) => ({ ...c, status: 'ACCEPTED' })),
    },
  }
  const acceptedHtml = render(acceptedScenario)
  assert.ok(acceptedHtml.includes('최종 판단에 가져오기'))
})

test('follow-up target baseline field appears once a target is selected; post-treatment field only for Pain', () => {
  const painWithTarget = {
    ...PAIN_SCENARIO_1,
    synthetic: { ...PAIN_SCENARIO_1.synthetic },
  }
  // Selecting a target happens via click in the real UI; here we verify the
  // *rendered options* exist so a clinician can select one (interactive
  // selection itself was verified via headless-browser visual QA).
  const html = render(painWithTarget)
  assert.ok(html.includes('재평가 대상 선택'))
})

test('EMR preview reconstructs correctly from a persisted WorkspaceState passed in on load (no interaction needed)', () => {
  const initialWorkspaceState = {
    schema_version: '1.0.0',
    painExamSuggestions: [
      {
        id: 'reload-1',
        title: 'SLR 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'POSITIVE', laterality: 'LEFT', note: '재현됨', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ],
    painFinalAssessment: { ...emptyPainFinalAssessment(), finalWorkingAssessment: '재로드된 판단' },
    painFollowUpTargets: [],
    herbalPatternCandidates: [],
    herbalClinicianObservations: [],
    herbalFinalAssessment: emptyHerbalFinalAssessment(),
    herbalFollowUpTargets: [],
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'reload-test-id',
    initialWorkspaceState,
    synthetic: undefined,
  })
  assert.ok(html.includes('SLR 검사'))
  assert.ok(html.includes('재현됨'))
  assert.ok(html.includes('재로드된 판단'))
  // rule: a reload must never turn a POSITIVE-with-laterality result into
  // an unresolved/pending item -- the reloaded 'reload-1' SLR item must
  // never itself appear inside the "아직 확인 안 됨 · N건" pending-counter
  // banner (distinct from the always-present per-card status BUTTON of the
  // same label).
  //
  // LBP v1 Batch 1: PAIN_SCENARIO_1 is an LBP CLEAR payload, so loading it
  // with `synthetic: undefined` now legitimately merges in the generator's
  // always-on "목표 동작 재현" suggestion as a genuinely NEW pending item
  // (see mergeLbpExamSuggestions) -- the counter CAN appear now; what must
  // never happen is the reloaded SLR item being counted inside it.
  //
  // Opus delta review item 2: a regex spanning the counter's text can never
  // match here -- React 18 renderToString inserts `<!-- -->` comment nodes
  // between adjacent text/expression children, so a regex that assumes
  // contiguous text never matches and an `if (match)`-guarded assertion
  // silently never runs. Use indexOf/slice instead.
  //
  // Batch 2.6 (E-8/C-5): the counter now shows the COUNT ONLY -- title
  // enumeration was removed because the exam cards immediately below
  // already carry the same titles (duplicate). Before this batch the real
  // output here was `아직 확인 안 됨 · <!-- -->1<!-- -->건 — <!-- -->목표
  // 동작 재현`; the trailing "— <title list>" is gone by design now, which
  // makes the old "reloaded item must not appear in the counter's title
  // list" check moot by construction (no titles are printed for ANY item
  // anymore) -- pinned below as a direct regression check instead.
  const counterIdx = html.indexOf('아직 확인 안 됨 ·')
  assert.ok(counterIdx !== -1, 'the pending counter must appear -- 목표 동작 재현 was merged in as a new pending item')
  const counterEnd = html.indexOf('</p>', counterIdx)
  const counterChunk = html.slice(counterIdx, counterEnd === -1 ? undefined : counterEnd)
  // React inserts `<!-- -->` comment nodes between the adjacent text/
  // expression children here (real output: `...안 됨 · <!-- -->1<!-- -->건`),
  // so check the count digit and the "건" unit separately rather than as one
  // contiguous "1건" substring.
  assert.ok(counterChunk.includes('>1<'), 'exactly one genuinely new pending item (목표 동작 재현) is counted')
  assert.ok(counterChunk.includes('건'), 'the count is expressed in 건')
  assert.ok(
    !counterChunk.includes('목표 동작 재현'),
    'Batch 2.6 E-8: the counter no longer names items, only counts them (mutant: reintroducing "— <titles>" fails this)',
  )
  assert.ok(
    !counterChunk.includes('SLR 검사'),
    'the reloaded POSITIVE SLR item must never appear in the pending counter (also: no title is ever printed here now)',
  )
})

/* -----------------------------------------------------------------------
 * 14차 독립 리뷰 HIGH-1: `sanitizeShape`의 배열 분기는 컨테이너만 검증하고
 * 원소는 그대로 통과시키므로, exam suggestion/pattern candidate/rehab
 * suggestion 템플릿 안에 중첩된 fact 배열(reasonFacts/supportingFacts/
 * contradictingFacts/sourceFacts/contraindicationFacts, `unknownChecks`)의
 * 원소가 wrong-typed면(`[null]`, `[{}]`) 실제 렌더가 그대로 던졌다
 * ("Cannot read properties of null", "Objects are not valid as a React
 * child"). 이 테스트들은 `renderWith`가 던지지 않는다는 것 자체가
 * 증거다(그렇지 않으면 이 테스트 프로세스가 그대로 죽는다) -- 그리고
 * 손상된 원소와 나란히 있는 진짜 정상 원소는 살아남는지도 함께 확인한다.
 * ------------------------------------------------------------------- */
test('14차 HIGH-1: painExamSuggestions[0].reasonFacts with null/undefined/object elements never crashes the render', () => {
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    painExamSuggestions: [
      {
        id: 'e1',
        title: 'SLR 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [null, undefined, { a: 1 }, { text: '정상 소견 생존', provenance: 'PATIENT_FACT' }],
        source: 'SUGGESTED',
        result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
      },
    ],
    updated_at: null,
  }
  const html = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  assert.ok(html.includes('SLR 검사'))
  assert.ok(html.includes('정상 소견 생존'), '진짜 정상 원소는 손상된 형제 원소와 무관하게 살아남아야 한다')
  assert.ok(!html.includes('[object Object]'))
})

test('14차 HIGH-1: herbalPatternCandidates[0].supportingFacts/contradictingFacts/unknownChecks with malformed elements never crashes the render', () => {
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    herbalPatternCandidates: [
      {
        id: 'p1',
        displayName: '기허 (SYNTHETIC)',
        supportingFacts: [null, { text: '지지 소견 생존', provenance: 'PATIENT_FACT' }],
        contradictingFacts: [{}, { text: '반증 소견 생존', provenance: 'PATIENT_FACT' }],
        unknownChecks: [null, 42, '확인할 것 생존'],
        source: 'SUGGESTED',
        status: 'PENDING_REVIEW',
        clinicianNote: '',
      },
    ],
    updated_at: null,
  }
  const html = renderWith(HERBAL_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  assert.ok(html.includes('기허 (SYNTHETIC)'))
  assert.ok(html.includes('지지 소견 생존'))
  assert.ok(html.includes('반증 소견 생존'))
  assert.ok(html.includes('확인할 것 생존'))
  assert.ok(!html.includes('[object Object]'))
})

test('14차 HIGH-1: painRehabSuggestions[0].sourceFacts/contraindicationFacts with malformed elements never crashes the render', () => {
  // LBP v1 Batch 2: PAIN_SCENARIO_1 is an LBP payload, and DoctorWorkspace
  // now live-recomputes/merges painRehabSuggestions for LBP records
  // (mergeLbpRehabSuggestions) whenever `synthetic` is not supplied -- a
  // fabricated non-Core-20 id like this fixture's 'r1', still status
  // SUGGESTED (never decided), would legitimately be recomputed away, which
  // is correct new behavior but would make this defensive test assert on
  // the wrong thing. PAIN_SCENARIO_3 (shoulder, non-LBP) is untouched by
  // that merge and keeps this test's original intent -- malformed nested
  // facts inside a persisted RehabSuggestion never crash the render --
  // exercised exactly as before.
  const initialWorkspaceState = {
    schema_version: '1.1.0',
    painRehabSuggestions: [
      {
        id: 'r1',
        title: '재활 제안 (SYNTHETIC)',
        goal: '',
        rationale: '',
        sourceFacts: [null, { text: '근거 소견 생존', provenance: 'PATIENT_FACT' }],
        contraindicationFacts: [{ bad: true }, { text: '금기 소견 생존', provenance: 'PATIENT_FACT' }],
        source: 'SUGGESTED',
        status: 'SUGGESTED',
        clinicianFinalInstruction: '',
      },
    ],
    updated_at: null,
  }
  const html = renderWith(PAIN_SCENARIO_3, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
  assert.ok(html.includes('재활 제안 (SYNTHETIC)'))
  assert.ok(html.includes('근거 소견 생존'))
  assert.ok(html.includes('금기 소견 생존'))
  assert.ok(!html.includes('[object Object]'))
})

test('save status region renders (idle) once submissionId+onSaveWorkspace are both present, absent otherwise', () => {
  const withSave = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'x',
    onSaveWorkspace: async () => ({ ok: true }),
  })
  assert.ok(withSave.includes('workspace__saveStatus'))

  const withoutSave = render(PAIN_SCENARIO_1)
  assert.ok(!withoutSave.includes('workspace__saveStatus'))
})

// ---------- 7. source-level guard: no production inference engine introduced ----------
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/*
 * Round 15 (tablet density guard). The default clinical workflow was
 * measured in a real browser on the production-shaped record:
 *
 *   1440x900  desktop           1028px = 1.14 viewports
 *   1024x768  tablet landscape  1110px = 1.45 viewports  (1192px = 1.55x before this rule)
 *   834x1112  tablet portrait   1192px = 1.07 viewports
 *
 * Landscape only clears the 1.5-viewport target because the primary
 * 판단 / 처치 / 재검 grid keeps two columns between 900px and 1100px,
 * instead of falling into the single-column stack the 1100px breakpoint
 * applies to every other final-assessment grid.
 *
 * That depends on CSS SOURCE ORDER: both selectors are a single class, so
 * the later rule is the one that wins (the round-12 lesson, learned the
 * hard way). A future edit that moves, reorders or drops the override
 * would silently put landscape back over budget with no visible error and
 * no failing markup test -- this asserts the mechanism instead.
 */
test('round 15: the tablet-landscape primary-grid override exists and stays after the 1100px breakpoint', () => {
  const css = fs.readFileSync('src/doctor/workspace/workspace.css', 'utf8')

  const wideOneRow = css.indexOf('.workspace__finalAssessment__fields--primary')
  assert.ok(wideOneRow !== -1, 'the wide-screen one-row primary grid rule must exist')
  assert.ok(
    /\.workspace__finalAssessment__fields--primary\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(css),
    'above 1100px the primary set lays out in one row',
  )

  const stack = css.search(/@media\s*\(max-width:\s*1100px\)\s*\{/)
  assert.ok(stack !== -1, 'the 1100px single-column breakpoint must still exist')

  const overrideRe = /@media\s*\(max-width:\s*1100px\)\s*and\s*\(min-width:\s*900px\)\s*\{[\s\S]*?\}\s*\}/
  const override = css.search(overrideRe)
  assert.ok(override !== -1, 'the 900-1100px tablet-landscape override must exist')
  assert.ok(
    override > stack,
    'the tablet-landscape override must come AFTER the 1100px stack rule -- at equal specificity source order decides',
  )

  const block = css.match(overrideRe)[0]
  assert.ok(/grid-template-columns:\s*1fr\s+1fr/.test(block), 'landscape keeps two columns')
  assert.ok(/grid-column:\s*1\s*\/\s*-1/.test(block), 'the third primary field spans the full width, leaving no empty cell')
})

test('examSuggestion.ts contains no function computing suggestions from a DoctorPayload', () => {
  const src = stripComments(fs.readFileSync('src/doctor/workspace/examSuggestion.ts', 'utf8'))
  assert.ok(!/DoctorPayload/.test(src), 'examSuggestion.ts must stay payload-agnostic (shape only, no rule engine)')
})

test('patternCandidate.ts contains no function computing candidates from a DoctorPayload', () => {
  const src = stripComments(fs.readFileSync('src/doctor/workspace/patternCandidate.ts', 'utf8'))
  assert.ok(!/DoctorPayload/.test(src), 'patternCandidate.ts must stay payload-agnostic (shape only, no rule engine)')
})

test('DoctorView.tsx passes no synthetic decision-support data for real (server-mode) submissions', () => {
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
  assert.ok(
    /synthetic=\{mode === 'fixtures' \? \(activeScenario\?\.synthetic \?\? undefined\) : undefined\}/.test(src),
    'synthetic prop must be undefined outside the explicit fixtures-mode scenario picker (never populated for server/real submissions)',
  )
})

/* -------------------------------------------------------------------------
 * Malformed/legacy submission resilience batch, 2nd independent review
 * (closing review of 824c864): CommonSafetyBanner.tsx reads several
 * `r.reproductive_status.derived.*` / `r.modules.<submodule>.*` fields
 * unconditionally -- for a legacy/hand-crafted submission missing those
 * namespaces (which `isDoctorPayloadShapeUsable` in DoctorView.tsx only
 * checks one level deep, by design) this throws inside CommonSafetyBanner.
 * Unlike the inline-JSX-body crashes in DoctorView.tsx itself, this one IS
 * a genuinely separate child component, so DoctorRecordErrorBoundary does
 * catch it -- but that still collapses the entire clinical view to the
 * neutral fallback and hides Common Safety, which governing task Phase 2
 * requires stay visible whenever real safety data exists. Structural
 * check (not a full render) since CommonSafetyBanner isn't re-exported
 * from the DoctorWorkspace bundle this file otherwise renders against.
 * ---------------------------------------------------------------------- */
test('CommonSafetyBanner.tsx guards reproductive_status.derived before reading its booleans', () => {
  const src = fs.readFileSync('src/doctor/CommonSafetyBanner.tsx', 'utf8')
  // 8차 독립 리뷰 HIGH-2 이후: 이전에는 `derived &&`(truthy) 하나로만
  // 지켰지만, deriveReproductiveStatus는 절대 null을 반환하지 않으므로
  // truthy 체크만으로는 (a) derived===null(레거시) 자체를 놓치고 (b)
  // 손상된 non-null 값(wrong-typed truthy 필드)이 그대로 통과했다 --
  // isUnreadableReproductiveDerived(r)로 대체되어 두 경우 모두 막힌다.
  assert.ok(
    /!isUnreadableReproductiveDerived\(r\) &&\s*\n\s*derived &&\s*\n\s*\(derived\.pregnant/.test(src),
    'derived must be checked via isUnreadableReproductiveDerived before .pregnant/.pregnancy_possible/.postpartum_1y/.breastfeeding are read',
  )
})

test('CommonSafetyBanner.tsx optional-chains every r.modules.<submodule> read (submodule can be legitimately absent)', () => {
  const src = fs.readFileSync('src/doctor/CommonSafetyBanner.tsx', 'utf8')
  const mustBeOptionalChained = [
    'r.modules.sleep?.menopause?.sleep_disorder_screen',
    'r.modules.sleep?.awakening_reasons',
    'r.modules.pain?.primary_location',
    'r.modules.pain?.radiation',
    'r.modules.women?.problems',
    'r.modules.pregnancy?.concerns',
    'r.modules.postpartum?.problems',
    'r.modules.gi?.unable_to_eat_or_drink',
    'r.modules.bowel?.blood_or_black_stool',
  ]
  for (const expr of mustBeOptionalChained) {
    assert.ok(src.includes(expr), `expected optional-chained read "${expr}" in CommonSafetyBanner.tsx`)
  }
  // And the un-guarded (bug) forms must be gone.
  const mustNotAppear = [
    'r.modules.sleep.menopause.sleep_disorder_screen',
    'r.modules.sleep.awakening_reasons',
    'r.modules.pain.primary_location',
    'r.modules.pain.radiation',
    'r.modules.women.problems',
    'r.modules.pregnancy.concerns',
    'r.modules.postpartum.problems',
    'r.modules.gi.unable_to_eat_or_drink',
    'r.modules.bowel.blood_or_black_stool',
  ]
  for (const expr of mustNotAppear) {
    assert.ok(!src.includes(expr), `unguarded read "${expr}" must no longer appear in CommonSafetyBanner.tsx`)
  }
})

/* -------------------------------------------------------------------------
 * 6th independent review MEDIUM-2: `safetyGlanceItems` collapsing to an
 * empty array means either "genuinely nothing to report" OR "the
 * safety-relevant fields themselves could not be read" (legacy/hollowed
 * data) -- both used to render the SAME affirmative "특이 안전정보 없음"
 * text, hiding e.g. an anticoagulant + cancer history behind a message
 * that reads as an active all-clear. medication_use/allergy_yn/surgery_yn/
 * free_text_yn are all `required: true`, no `showIf`, fixed value sets
 * (coreSpec.ts HISTORY_QUESTIONS/FREE_TEXT_QUESTIONS) -- a real submission
 * can never have them null or out of that set, so that combination is
 * unambiguously malformed, not a legitimate "no". Behavioral (not just
 * structural) proof via a full DoctorWorkspace render, since
 * CommonSafetyBanner is not independently exported from this bundle.
 * ---------------------------------------------------------------------- */
{
  const base = WORKSPACE_SCENARIOS.find((s) => s.label === 'SYNTHETIC · 단순 기계적 요통')

  test('CommonSafetyBanner: a genuinely all-clear record (medication_use/allergy_yn/surgery_yn/free_text_yn all "none") shows the plain all-clear message', () => {
    const html = render(base)
    assert.ok(html.includes('특이 안전정보 없음'))
    assert.ok(!html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner: the same record with medication_use/allergy_yn/surgery_yn/free_text_yn hollowed to null and medical_history_flags wrong-typed shows the explicit "cannot read" notice, never the all-clear message', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.medication.medication_use = null
    mutated.responses.medical_history.medical_history_flags = 'cancer'
    mutated.responses.allergy.allergy_yn = null
    mutated.responses.surgery_history.surgery_yn = null
    mutated.responses.free_text.free_text_yn = null
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /**
   * 8차 독립 리뷰 HIGH-2 후속: 이 테스트의 원래 전제("derived===null이
   * 남성 등 정상 케이스")는 사실이 아니었다 -- coreSpec.ts
   * deriveReproductiveStatus는 절대 null을 반환하지 않고, 정상적으로
   * "확인된 사실 없음"인 경우(남성/미응답)에도 `{source: null, raw: null,
   * pregnant: null, pregnancy_possible: null, postpartum_1y: null,
   * breastfeeding: null}` 객체를 반환한다. 진짜 정상 케이스는
   * `derived.source === null`이지, `derived === null`이 아니다.
   */
  test('CommonSafetyBanner: reproductive_status.derived with source=null and all fields null (a legitimate state, e.g. male patients) does NOT trigger the "cannot read" notice by itself', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.derived = {
      source: null,
      raw: null,
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: null,
      breastfeeding: null,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(html.includes('특이 안전정보 없음'))
    assert.ok(!html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner HIGH-2: reproductive_status.derived === null (legacy record predating this field, not a legitimate state) DOES trigger the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.derived = null
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 11th independent review MEDIUM-1: coreSpec.ts's deriveReproductiveStatus
   * only ever produces derived.source==='pregnancy_module' when
   * visit_goal.women_goal==='pregnancy' AND modules.pregnancy.status===
   * 'pregnant' (and 'postpartum_module' only under the analogous postpartum
   * context) -- rounds 9/10 exempted these two sources entirely from the
   * raw-vs-derived consistency check on the theory that they "can't be
   * recomputed", which was false. A legacy/hand-crafted record claiming
   * derived.source='pregnancy_module' OUTSIDE that context (this base LBP
   * fixture has no pregnancy visit_goal at all) fabricates a pregnancy fact
   * that was never actually reported and must be treated as unreadable,
   * not as a trustworthy computed status. CommonSafetyBanner.tsx carries
   * its own local copy of this check (isReproductiveDerivedInconsistentWith
   * RawAnswer) -- this proves it via a real render, not just the DoctorView
   * .tsx unit tests in tests/doctor.spec.mjs.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner MEDIUM-1 (11th review): a derived.source="pregnancy_module" claimed outside any pregnancy visit context fabricates an unreported pregnancy and DOES trigger the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.derived = {
      source: 'pregnancy_module',
      raw: ['pregnant'],
      pregnant: true,
      pregnancy_possible: false,
      postpartum_1y: null,
      breastfeeding: null,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner MEDIUM-1 (11th review): a derived.source="postpartum_module" claimed outside any postpartum visit context fabricates an unreported postpartum status and DOES trigger the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.derived = {
      source: 'postpartum_module',
      raw: ['6w_to_3m', 'yes'],
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: true,
      breastfeeding: true,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner HIGH-2: a reported pregnancy (reproductive_status.reproductive_status is an array) with derived.source left null (not recomputed) DOES trigger the "cannot read" notice, never a false all-clear', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.reproductive_status = ['pregnant']
    mutated.responses.reproductive_status.derived = {
      source: null,
      raw: null,
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: null,
      breastfeeding: null,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 13차 독립 리뷰 HIGH-1: coreSpec.ts deriveReproductiveStatus only ever
   * produces source==='WOMEN_SAFETY_01' when the raw WOMEN_SAFETY_01 answer
   * is an array -- a legacy single-select string answer paired with that
   * source is a combination the real computation could never produce.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner 13차 HIGH-1: derived.source="WOMEN_SAFETY_01" paired with a non-array raw answer (legacy single-select) fabricates a false all-clear and DOES trigger the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.reproductive_status = 'pregnant'
    mutated.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: 'pregnant',
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 13차 독립 리뷰 LOW-3: a raw reproductive answer that exists (non-null)
   * but is not an array -- so deriveReproductiveStatus's Array.isArray
   * check fails and it produces the exact same source:null/all-null object
   * it would for a patient who was never asked at all -- is "answered but
   * never processed", not "doesn't apply". The previous implementation
   * treated source:null as always meaning genuinely not-applicable, so this
   * combination silently rendered as the plain all-clear message, hiding
   * the fact that the patient actually reported something.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner 13차 LOW-3: a non-array raw reproductive answer that exists, with derived.source left null (never computed for this shape), DOES trigger the "cannot read" notice instead of the plain all-clear message', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.reproductive_status = 'pregnant'
    mutated.responses.reproductive_status.derived = {
      source: null,
      raw: null,
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: null,
      breastfeeding: null,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 15차 독립 리뷰 HIGH-2: POSTPARTUM_01(time_since_delivery)/POSTPARTUM_03
   * (breastfeeding_status)는 산후 컨텍스트에서 항상 물어보는 required
   * single_choice라서, 실제 제출은 이 값이 옵션 목록 밖일 수 없다. 옵션 밖
   * 문자열은 `.includes(...)`/`===` 비교에서 그냥 false가 되므로, 손상된 raw
   * 답변에 대해서도 "출산 후 1년 이내: 아니요/모유수유 중: 아니요"를 계산해
   * derived와 "일치"시켜 보여줬다 (CommonSafetyBanner.tsx의
   * isReproductiveDerivedInconsistentWithRawAnswer의 postpartum_module 분기).
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner 15차 HIGH-2: an out-of-option-set POSTPARTUM_01(time_since_delivery) value paired with a self-consistent (but fabricated) derived.postpartum_1y=false DOES trigger the "cannot read" notice, never a false all-clear', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.visit_goal = { visit_goal: 'women', women_goal: 'postpartum' }
    mutated.responses.modules = {
      ...mutated.responses.modules,
      postpartum: { time_since_delivery: 'ZZZ', breastfeeding_status: 'yes' },
    }
    mutated.responses.reproductive_status.reproductive_status = ['postpartum']
    mutated.responses.reproductive_status.derived = {
      source: 'postpartum_module',
      raw: ['ZZZ', 'yes'],
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: false,
      breastfeeding: true,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner 15차 HIGH-2: an out-of-option-set POSTPARTUM_03(breastfeeding_status) value paired with a self-consistent (but fabricated) derived.breastfeeding=false DOES trigger the "cannot read" notice, never a false all-clear', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.visit_goal = { visit_goal: 'women', women_goal: 'postpartum' }
    mutated.responses.modules = {
      ...mutated.responses.modules,
      postpartum: { time_since_delivery: 'within_6_weeks', breastfeeding_status: 'ZZZ' },
    }
    mutated.responses.reproductive_status.reproductive_status = ['postpartum']
    mutated.responses.reproductive_status.derived = {
      source: 'postpartum_module',
      raw: ['within_6_weeks', 'ZZZ'],
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: true,
      breastfeeding: false,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 15차 독립 리뷰 MEDIUM-2 (StructuredReassessmentCard.tsx): sanitizeShape
   * only guarantees item.previous.status/laterality are strings, not known
   * enum members -- an unmapped value must not leak as the literal string
   * "undefined" into the 이전 소견 recap line. Not independently renderable
   * outside DoctorWorkspace's revisit flow, so this is a structural guard on
   * the source (same established pattern as save-conflict.spec.mjs's
   * RevisitWorkspace.tsx checks) rather than a full-render assertion.
   * ------------------------------------------------------------------- */
  test('StructuredReassessmentCard.tsx 15차 MEDIUM-2: both the status and laterality lookups on item.previous are guarded against unmapped enum values', () => {
    const src = fs.readFileSync('src/doctor/workspace/StructuredReassessmentCard.tsx', 'utf8')
    assert.ok(src.includes("isValidExamStatus,") && src.includes("isValidLaterality,"), 'must import both guards from ./provenance')
    assert.ok(
      /isValidExamStatus\(item\.previous\.status\)\s*\?\s*EXAM_CHECK_STATUS_LABEL\[item\.previous\.status\]\s*:\s*'확인 필요\(값 형식 오류\)'/.test(src),
      'status lookup must fall back to a fail-closed marker instead of an unmapped-key undefined',
    )
    assert.ok(
      /isValidLaterality\(item\.previous\.laterality\)\s*\?\s*LATERALITY_LABEL\[item\.previous\.laterality\]\s*:\s*'확인 필요\(값 형식 오류\)'/.test(src),
      'laterality lookup must fall back to a fail-closed marker instead of an unmapped-key undefined',
    )
  })

  /* -----------------------------------------------------------------------
   * 16차 독립 리뷰 HIGH-1: coreSpec.ts deriveReproductiveStatus는
   * key==='pregnancy' && PREGNANCY_01==='possible'일 때 WOMEN_SAFETY_01
   * 응답에 'pregnancy_possible'이 없어도 pregnancy_possible을 true로
   * override한다 -- CommonSafetyBanner.tsx의
   * isReproductiveDerivedInconsistentWithRawAnswer는 이 override 방향을
   * 검사하지 않아, 손상된 derived.pregnancy_possible=false가 실제
   * override로 만들어진 true와 화면상 구별되지 않고 "정상" 판정을 받았다.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner 16차 HIGH-1: a corrupted derived.pregnancy_possible=false when PREGNANCY_01==="possible" should have overridden it to true DOES trigger the "cannot read" notice, never a false all-clear', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.visit_goal = { visit_goal: 'women', women_goal: 'pregnancy' }
    mutated.responses.modules = {
      ...mutated.responses.modules,
      pregnancy: { status: 'possible' },
    }
    mutated.responses.reproductive_status.reproductive_status = ['none']
    mutated.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 9차 독립 리뷰 자체 회귀분석 (이 라운드 자체 수정에서 발견): 7개 플래그
   * 전부를 재계산하도록 isFlagsConsistentWithResponses를 확장하면서
   * r.safety_flags.red_flag_general / r.modules.gi / r.modules.bowel /
   * r.modules.sleep / r.reproductive_status.reproductive_status를 옵셔널
   * 체이닝 없이 직접 접근했다 -- reproductive_status/modules/safety_flags
   * 필드 자체가 생기기 전에 제출된 진짜 레거시 레코드에서는 이 최상위 키
   * 자체가 아예 없으므로, 이 배치가 막으려는 크래시가 이 배치 자신의
   * 수정으로 재도입됐었다(ankle-foot-doctor-panel.spec.mjs의 최소
   * payload()로 재현/발견). CommonSafetyBanner.tsx에서도 동일 경로가
   * 있는지 여기서 직접 재현한다.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner: reproductive_status key entirely absent (pre-field legacy record) does not throw and shows the "cannot read" notice, never a crash', () => {
    const mutated = structuredClone(base.payload)
    delete mutated.responses.reproductive_status
    let html
    assert.doesNotThrow(() => {
      html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    })
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /*
   * safety_flags hollowed to {} (not deleted entirely): LbpSafetyPanel's
   * applicability gate (DoctorView.tsx:595, `payload.responses.safety_flags.lbp
   * == null`) and its regional siblings (Neck/Shoulder/...) read
   * `safety_flags.<region>` unguarded across many pre-existing files well
   * outside this round's fix -- deleting the whole key would exercise that
   * separate, pre-existing gap and is out of scope here (CLAUDE.md: no
   * unrelated-code changes). This test proves only the round-9 fix sites
   * (CommonSafetyBanner's generalFlagLabels, PainWorkspace/HerbalWorkspace's
   * safetyAnswered/recoveryScore) stay crash-safe against the minimum shape
   * this codebase's own gate (isDoctorPayloadShapeUsable) actually
   * guarantees: the container present, its own keys possibly absent.
   */
  test('CommonSafetyBanner: safety_flags hollowed to {} (no red_flag_general/lbp keys) does not throw when rendering the common-safety banner', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.safety_flags = {}
    let html
    assert.doesNotThrow(() => {
      html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    })
    assert.ok(typeof html === 'string' && html.length > 0)
  })

  test('CommonSafetyBanner: modules hollowed to {} (no sleep submodule) + flags claiming sleep_disorder_priority_review=true does not throw (hasUnreadableSafetyField reads r.modules.sleep unconditionally when that flag is set)', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules = {}
    mutated.flags = { ...mutated.flags, sleep_disorder_priority_review: true }
    let html
    assert.doesNotThrow(() => {
      html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    })
    assert.ok(typeof html === 'string' && html.length > 0)
  })

  /* -----------------------------------------------------------------------
   * 7th independent review HIGH-1: `flags` (coreSpec.ts computeFlags) is
   * computed client-side on the tablet and stored verbatim by the server
   * without revalidation (server/index.js: `flags: body.flags ?? null`).
   * A legacy/version-skewed submission can have a hollow `flags` object
   * while `responses.safety_flags.red_flag_general` still holds a real
   * reported emergency red flag -- trusting `flags.requires_staff_check`
   * unconditionally would render the danger banner as if nothing were
   * wrong. Proven here with a real SAFETY_01 answer (`chest_breathing`)
   * plus `flags = {}` (all 7 required boolean keys missing).
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner HIGH-1: hollow flags ({}) with a real reported SAFETY_01 emergency red flag shows the flags-unusable warning (with the raw red-flag label as fallback), never the misleading all-clear text', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.safety_flags.red_flag_general = ['chest_breathing']
    mutated.flags = {}
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(html.includes('안전 계산값을 읽을 수 없습니다'))
    assert.ok(html.includes('새로 생긴 심한 가슴 통증이나 숨쉬기가 매우 힘든 증상'))
    assert.ok(!html.includes('특이 안전정보 없음'))
  })

  test('CommonSafetyBanner HIGH-1: flags missing one required key (sleep_disorder_priority_review, a real post-migration key absent from a pre-migration record) is treated as unusable even though every other key is a valid boolean', () => {
    const mutated = structuredClone(base.payload)
    delete mutated.flags.sleep_disorder_priority_review
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(html.includes('안전 계산값을 읽을 수 없습니다') || html.includes('안전 계산값(flags)을 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 7th independent review HIGH-2: `isUnreadableYesNoUnknown`'s old
   * `value != null && ...` structure let null/undefined pass as
   * "readable" for MED_USE/ALLERGY_01/SURGERY_01/FREE_01 -- fields that a
   * real submission can never leave null (all `required: true`, no
   * `showIf`, fixed value sets). This mutates ONLY medication_use to null
   * (unlike the pre-existing round-6 test above, which also wrong-typed
   * medical_history_flags and so only incidentally passed through that
   * second, unrelated guard) -- isolating the null-specific fix.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner HIGH-2: medication_use alone set to null (not wrong-typed, not combined with any other malformed field) shows the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.medication.medication_use = null
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('특이 안전정보 없음'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 7th independent review MEDIUM-1: `isEmptyValue` (PainWorkspace/
   * HerbalWorkspace) and `asArray`-based checks (CommonSafetyBanner)
   * disagreed on a wrong-typed `red_flag_general` -- `isEmptyValue` treats
   * any truthy scalar as "answered" (so a stray string would have read as
   * a confident "없음"), while the array-based check now used for
   * `safetyAnswered` treats a non-array as unreadable. `flags` is left
   * untouched here (still usable) so this isolates the safetyAnswered fix
   * from the HIGH-1 flags-usability fix above.
   * ------------------------------------------------------------------- */
  test('PainWorkspace MEDIUM-1: a wrong-typed (string, not array) red_flag_general on an otherwise-usable record renders 미확인 for 안전이슈, never a confident 없음', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.safety_flags.red_flag_general = 'none'
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(html.includes('안전이슈'))
    assert.ok(html.includes('미확인'))
    assert.ok(!/안전이슈[^<]*<\/span>\s*<strong[^>]*>\s*없음/.test(html))
  })

  /* -----------------------------------------------------------------------
   * 7th independent review LOW-1 (+ follow-up fix found while closing it
   * out): `medical_history_flags` being an array of non-string elements
   * used to slip through `asArray()` (container-only check) straight into
   * `optionLabels`, rendering `String({})` ("[object Object]") as a "주요
   * 병력" chip -- and because that produced a non-empty items list, the
   * pre-existing hasUnreadableSafetyField() check (gated behind
   * items.length===0) never even ran. Both are fixed: the malformed
   * array no longer generates a fabricated history item, and the "cannot
   * read" notice is no longer suppressed just because an unrelated real
   * item exists.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner LOW-1: medical_history_flags containing non-string elements never renders "[object Object]" and shows the "cannot read" notice even though the record has other real safety info', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.medical_history.medical_history_flags = [null, {}, 'not_a_real_option']
    mutated.responses.medication.medication_use = 'yes'
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 8th independent review MEDIUM-1: medication_types/allergy_detail/MS_05
   * (sleep_disorder_screen) had the same element-type-checking gap as
   * medical_history_flags(LOW-1 above) but were never fixed by round 7 --
   * a wrong-typed value slipped past answerLabel's String() fallback and
   * rendered "[object Object]" in a real (not empty) safety chip, with the
   * "cannot read" notice never appearing because items.length was already
   * >0 for an unrelated reason.
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner MEDIUM-1: medication_types containing non-string elements never renders "[object Object]" in the 복용약 chip and shows the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.medication.medication_use = 'yes'
    mutated.responses.medication.medication_types = [null, {}, 'not_a_real_option']
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner MEDIUM-1: allergy_detail wrong-typed (not an array) never renders "[object Object]" in the 알레르기 chip, falls back to "있음", and shows the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.allergy.allergy_yn = 'yes'
    mutated.responses.allergy.allergy_detail = { bogus: true }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('알레르기'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  test('CommonSafetyBanner MEDIUM-1: MS_05(sleep_disorder_screen) wrong-typed never renders "[object Object]" in the 수면장애 선별 chip and shows the "cannot read" notice', () => {
    const mutated = structuredClone(base.payload)
    mutated.flags.sleep_disorder_priority_review = true
    mutated.responses.modules.sleep = {
      ...(mutated.responses.modules.sleep ?? {}),
      menopause: {
        ...(mutated.responses.modules.sleep?.menopause ?? {}),
        sleep_disorder_screen: [null, {}],
      },
    }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('수면장애 선별'))
    assert.ok(html.includes('안전정보 일부를 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 10th independent review HIGH-2: `generalFlagLabels` (CommonSafetyBanner.tsx)
   * fed r.safety_flags.red_flag_general straight into optionLabels() with no
   * element-type check -- a wrong-typed element reached the banner that
   * round 7 built as the trustworthy fallback for when `flags` cannot be
   * trusted ("아래는 원본 응답에서 직접 확인 가능한 공통 위험 신호"), and
   * printed "[object Object]" as if it were a confirmed emergency signal
   * label. Live-repro confirmed this at all 3 viewports. The fix is in
   * src/doctor/labels.ts's optionLabel (root cause for HIGH-1/HIGH-2/
   * MEDIUM-2 all at once): a non-string/non-number value now returns an
   * explicit fail-closed token instead of String(value).
   * ------------------------------------------------------------------- */
  test('CommonSafetyBanner HIGH-2 (10th review): a wrong-typed (object) element in safety_flags.red_flag_general never renders "[object Object]" in the SAFETY_01 fallback banner', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.safety_flags.red_flag_general = [{ corrupted: true }]
    mutated.flags = {}
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('안전 계산값을 읽을 수 없습니다'))
  })

  /* -----------------------------------------------------------------------
   * 10th independent review HIGH-1: primaryConcernLabel(r) (DoctorView.tsx)
   * feeds a wrong-typed visit_goal.primary_symptom through answerLabel()
   * with no type check into three destinations: the hero 주호소 metric,
   * the EMR 미리보기 textarea (the text a clinician copies into the actual
   * medical record), and the 환자 전달용 치료 계획 (the document handed to
   * the patient). Live-repro confirmed "[object Object]" leaking into all
   * three. Root-cause fixed in src/doctor/labels.ts's optionLabel.
   * ------------------------------------------------------------------- */
  test('PainWorkspace HIGH-1 (10th review): a wrong-typed (object) visit_goal.primary_symptom never leaks "[object Object]" into the hero metric, EMR preview, or patient care-plan preview', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.visit_goal.primary_symptom = { corrupted: true }
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('EMR 미리보기') || html.includes('참고 자료'))
    assert.ok(html.includes('확인 필요'))
  })

  /* -----------------------------------------------------------------------
   * 11th independent review HIGH-1: PainWorkspace's recoveryScore
   * (LBP_12/modules.lbp.recovery_expectation, a numeric_scale question the
   * tablet always stores as a number) was rendered via a bare `String()`
   * with no type check, bypassing optionLabel entirely -- a wrong-typed
   * value leaked "[object Object]", and a wrong-typed array ('9') was
   * displayed as if it were a real reported score (no "확인 필요" marker),
   * fabricating a clinical fact. Fixed in PainWorkspace.tsx by adding an
   * explicit finite-number check before rendering.
   * ------------------------------------------------------------------- */
  test('PainWorkspace HIGH-1 (11th review): a wrong-typed (object) modules.lbp.recovery_expectation never leaks "[object Object]" into the 회복 기대 metric and shows the explicit fail-closed label instead', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules.lbp.recovery_expectation = { corrupted: true }
    const html = renderWith(base, { payload: mutated })
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('회복 기대'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  test('PainWorkspace HIGH-1 (11th review): a wrong-typed (array) modules.lbp.recovery_expectation is never displayed as if it were a real reported score', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules.lbp.recovery_expectation = ['9']
    const html = renderWith(base, { payload: mutated })
    assert.ok(!html.includes('9 / 10'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  /* -----------------------------------------------------------------------
   * 11th independent review MEDIUM-2: submission.metadata.primary_concern
   * is stored by server/store.js completely unvalidated from an
   * unauthenticated patient POST (`server/index.js`'s
   * `metadata: body.metadata ?? null`) -- the current tablet never sends
   * this field, but a legacy record or a hand-crafted LAN POST can put
   * arbitrary JSON there. PriorVisitHistoryCard.tsx/RevisitWorkspace.tsx
   * interpolated it directly into a template literal with no type check,
   * which would leak "[object Object]" into the read-only prior-visit
   * recap. Fixed via longitudinal.ts's readablePriorVisitPrimaryConcern.
   * ------------------------------------------------------------------- */
  test('PriorVisitHistoryCard MEDIUM-2 (11th review): a wrong-typed (object) prior-visit primaryConcern from an unvalidated legacy record never leaks "[object Object]" and shows the explicit fail-closed label instead', () => {
    const priorVisits = {
      patientId: 'patient-1',
      visits: [
        {
          visitId: 'visit-1',
          submissionId: 'sub-1',
          createdAt: new Date().toISOString(),
          primaryConcern: { corrupted: true },
          painFollowUpTargets: [],
          herbalFollowUpTargets: [],
          followUpTargets: [],
          painFinalAssessmentSummary: null,
          herbalFinalAssessmentSummary: null,
          nextReassessmentPlan: null,
        },
      ],
    }
    const html = renderWith(base, { priorVisits })
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  /* -----------------------------------------------------------------------
   * 12차 독립 리뷰 MEDIUM-3: PriorVisitHistoryCard가 읽는 `history`
   * 전체가 인증되지 않은 PUT /api/submissions/:id/workspace가 검증 없이
   * 저장한 workspace에서 온다 -- 11차는 primaryConcern 한 필드만 방어했다.
   * target 배열 자체가 배열이 아니거나, target의 baseline/postTreatmentValue
   * 필드가 아예 없거나(레거시 shape), createdAt이 wrong-typed거나,
   * nextReassessmentPlan.status가 알려지지 않은 값이면 크래시하거나
   * 가짜 1970-01-01 날짜를 지어냈다.
   * ------------------------------------------------------------------- */
  test('PriorVisitHistoryCard MEDIUM-3 (12th review): followUpTargets not an array never crashes the card', () => {
    const priorVisits = {
      patientId: 'patient-1',
      visits: [
        {
          visitId: 'visit-1',
          submissionId: 'sub-1',
          createdAt: new Date().toISOString(),
          primaryConcern: null,
          painFollowUpTargets: 'not-an-array',
          herbalFollowUpTargets: 'not-an-array',
          followUpTargets: 'not-an-array',
          painFinalAssessmentSummary: null,
          herbalFinalAssessmentSummary: null,
          nextReassessmentPlan: null,
        },
      ],
    }
    const html = renderWith(base, { priorVisits })
    assert.ok(html.includes('이전 방문 기록'))
  })

  test('PriorVisitHistoryCard MEDIUM-3 (12th review): a follow-up target missing baseline/postTreatmentValue entirely (legacy shape) never crashes and shows 기록 없음, not a fabricated value', () => {
    const priorVisits = {
      patientId: 'patient-1',
      visits: [
        {
          visitId: 'visit-1',
          submissionId: 'sub-1',
          createdAt: new Date().toISOString(),
          primaryConcern: null,
          painFollowUpTargets: [{ id: 't1', label: '통증 강도' }],
          herbalFollowUpTargets: [],
          followUpTargets: [{ id: 't1', label: '통증 강도' }],
          painFinalAssessmentSummary: null,
          herbalFinalAssessmentSummary: null,
          nextReassessmentPlan: null,
        },
      ],
    }
    const html = renderWith(base, { priorVisits })
    assert.ok(html.includes('통증 강도'))
    assert.ok(html.includes('이전 baseline: 기록 없음'))
  })

  test('PriorVisitHistoryCard MEDIUM-3 (12th review): a follow-up target with a wrong-typed (object) label never renders "[object Object]" and shows the fail-closed label instead', () => {
    const priorVisits = {
      patientId: 'patient-1',
      visits: [
        {
          visitId: 'visit-1',
          submissionId: 'sub-1',
          createdAt: new Date().toISOString(),
          primaryConcern: null,
          painFollowUpTargets: [{ id: 't1', label: { corrupted: true }, baseline: '', postTreatmentValue: '' }],
          herbalFollowUpTargets: [],
          followUpTargets: [],
          painFinalAssessmentSummary: null,
          herbalFinalAssessmentSummary: null,
          nextReassessmentPlan: null,
        },
      ],
    }
    const html = renderWith(base, { priorVisits })
    assert.ok(!html.includes('[object Object]'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  test('PriorVisitHistoryCard MEDIUM-3 (12th review): a wrong-typed createdAt never fabricates a fake 1970-01-01 date or leaks "Invalid Date"', () => {
    const priorVisits = {
      patientId: 'patient-1',
      visits: [
        {
          visitId: 'visit-1',
          submissionId: 'sub-1',
          createdAt: { corrupted: true },
          primaryConcern: null,
          painFollowUpTargets: [],
          herbalFollowUpTargets: [],
          followUpTargets: [],
          painFinalAssessmentSummary: null,
          herbalFinalAssessmentSummary: null,
          nextReassessmentPlan: null,
        },
      ],
    }
    const html = renderWith(base, { priorVisits })
    assert.ok(!html.includes('1970'))
    assert.ok(!html.includes('Invalid Date'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  test('PriorVisitHistoryCard MEDIUM-3 (12th review): an unknown nextReassessmentPlan.status never renders a silently blank line', () => {
    const priorVisits = {
      patientId: 'patient-1',
      visits: [
        {
          visitId: 'visit-1',
          submissionId: 'sub-1',
          createdAt: new Date().toISOString(),
          primaryConcern: null,
          painFollowUpTargets: [],
          herbalFollowUpTargets: [],
          followUpTargets: [],
          painFinalAssessmentSummary: null,
          herbalFinalAssessmentSummary: null,
          nextReassessmentPlan: { status: 'ZZZ_UNKNOWN', targetDate: '', afterVisitCount: null, note: '' },
        },
      ],
    }
    const html = renderWith(base, { priorVisits })
    assert.ok(html.includes('이전에 계획한 다음 재평가'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  /* -----------------------------------------------------------------------
   * 12차 독립 리뷰 LOW-3: LBP_12는 min:0/max:10 numeric_scale이라 환자가
   * 구조적으로 이 범위 밖 값을 답할 수 없다 -- finite number 검사만으로는
   * 999/-4 같은 범위 밖 값이 실제 원점수처럼 그대로 렌더됐다.
   * ------------------------------------------------------------------- */
  test('PainWorkspace LOW-3 (12th review): an out-of-range (999) modules.lbp.recovery_expectation is never displayed as a real reported score', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules.lbp.recovery_expectation = 999
    const html = renderWith(base, { payload: mutated })
    assert.ok(!html.includes('999 / 10'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  test('PainWorkspace LOW-3 (12th review): a negative (-4) modules.lbp.recovery_expectation is never displayed as a real reported score', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules.lbp.recovery_expectation = -4
    const html = renderWith(base, { payload: mutated })
    assert.ok(!html.includes('-4 / 10'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  /* -----------------------------------------------------------------------
   * 13차 독립 리뷰 LOW-4: LBP_12는 NumericScale 문항으로 0~10 정수 눈금만
   * 만들 수 있다 -- 12차의 범위 검사(0~10)만으로는 5.5 같은 in-range지만
   * 비정수인 값이 그대로 "원점수"로 렌더돼(확인 필요 표시 없이) 실제로
   * 답하지 않은 값을 지어낼 수 있었다.
   * ------------------------------------------------------------------- */
  test('PainWorkspace LOW-4 (13th review): an in-range but non-integer (5.5) modules.lbp.recovery_expectation is never displayed as a real reported score', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules.lbp.recovery_expectation = 5.5
    const html = renderWith(base, { payload: mutated })
    assert.ok(!html.includes('5.5 / 10'))
    assert.ok(html.includes('확인 필요(값 형식 오류)'))
  })

  test('PainWorkspace LOW-4 (13th review): a genuine integer (7) modules.lbp.recovery_expectation still renders normally (the LOW-4 fix does not false-positive on real scores)', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.modules.lbp.recovery_expectation = 7
    const html = renderWith(base, { payload: mutated })
    // React SSR inserts a hydration-boundary comment between adjacent JSX
    // expression/text siblings ({recoveryScore} then literal " / 10"), so
    // the rendered HTML is "7<!-- --> / 10", not the literal string "7 / 10".
    assert.ok(html.includes('>7<!-- --> / 10'))
    assert.ok(html.includes('원점수'))
    assert.ok(!html.includes('확인 필요(값 형식 오류)'))
  })
}

/* -------------------------------------------------------------------------
 * Core Reduction P3 — Phase 7 UI spec §1.3 자동 펼침 (delta C-4). Renderable
 * (renderToString) subset of the disclosure-open-condition contract --
 * interactive ones (§2.7 발급 다른 방법; the "clicked once and closed"
 * half of #5) live in tests/doctor-reset-key.spec.mjs (react-test-renderer)
 * or as source checks alongside the P0-3 issuance tests in
 * tests/doctor.spec.mjs, since this file only ever renders DoctorWorkspace
 * directly (never a full DoctorView with server-mode issuance state).
 * ---------------------------------------------------------------------- */

// ---------- §1.3-#4 ----------
test('반대편 유형 입력 세트(+다른 유형 입력 추가) auto-opens when the opposite field set already holds a saved value on a pain-derived record', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'opposite-open-test',
    initialWorkspaceState: {
      herbalFinalAssessment: {
        finalPatternOrMechanism: '기허 (반대편 저장값)',
        treatmentPrinciple: '',
        prescriptionPlanNote: '',
        symptomsToTrack: '',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  assert.ok(html.includes('data-view-profile="pain"'), 'sanity: this record derives pain, so herbal is the OPPOSITE set')
  const idx = html.indexOf('doctor__oppositeType')
  assert.ok(idx !== -1, 'the opposite-type details exists')
  const tagEnd = html.indexOf('>', idx)
  assert.ok(/\bopen\b/.test(html.slice(html.lastIndexOf('<details', idx), tagEnd + 1)), 'it auto-opens because the opposite (herbal) side already has a saved value')
  assert.ok(html.includes('기허 (반대편 저장값)'), 'the saved opposite content itself is visible, not hidden behind a closed disclosure')
})

// ---------- §1.3-#5 ----------
test('반대편 유형 입력 세트 stays collapsed by default when the opposite field set has no saved value', () => {
  const html = render(PAIN_SCENARIO_1)
  const idx = html.indexOf('doctor__oppositeType')
  assert.ok(idx !== -1)
  const tagEnd = html.indexOf('>', idx)
  const tag = html.slice(html.lastIndexOf('<details', idx), tagEnd + 1)
  assert.ok(!/\bopen\b/.test(tag), 'no saved opposite content -> starts closed (the "1회 클릭으로 접근 불가 0" half is pinned interactively in tests/doctor-reset-key.spec.mjs)')
})

// ---------- §1.3-#6 (현행 계승, regression pin) ----------
test('관리 계획 disclosure opens when isCarePlanEmpty is false OR plan.status !== UNSET (현행 계승)', () => {
  const openViaCarePlan = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'careplan-open-1',
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: '집에서 스트레칭', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: '',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  const idx1 = openViaCarePlan.indexOf('관리 계획 · 다음 재평가 — 자세히 입력')
  const tag1 = openViaCarePlan.slice(openViaCarePlan.lastIndexOf('<details', idx1), openViaCarePlan.indexOf('>', idx1) + 1)
  assert.ok(/\bopen\b/.test(tag1), 'isCarePlanEmpty=false alone opens the disclosure')

  const openViaPlanStatus = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'careplan-open-2',
    initialWorkspaceState: { nextReassessmentPlan: { status: 'CLINICIAN_DECIDES', targetDate: '', afterVisitCount: null, note: '' } },
  })
  const idx2 = openViaPlanStatus.indexOf('관리 계획 · 다음 재평가 — 자세히 입력')
  const tag2 = openViaPlanStatus.slice(openViaPlanStatus.lastIndexOf('<details', idx2), openViaPlanStatus.indexOf('>', idx2) + 1)
  assert.ok(/\bopen\b/.test(tag2), "plan.status !== 'UNSET' alone (empty care plan otherwise) also opens the disclosure")
})

/* ------------------------------------------------------------------------
 * Batch 2.6 (E-1, C-1, C-2): the actual defect this batch fixes. Before
 * this batch, `isCarePlanEmpty` counted `nextVisitCheckItem` -- the SAME
 * field the always-visible "다음 방문 확인 메모" textarea one lane above
 * this disclosure is bound to (PainWorkspace.tsx) -- so typing a single
 * character into THAT textarea force-opened this whole 6-field disclosure
 * on every keystroke, and one of those 6 fields was that very value,
 * showing up in two live textareas at once. These pin the fix directly,
 * per the task's explicit requirement: a non-empty nextVisitCheckItem
 * ALONE must not open the disclosure, while a non-empty
 * currentTreatmentGoal still does.
 * ---------------------------------------------------------------------- */
test('Batch 2.6 E-1: a non-empty nextVisitCheckItem ALONE does NOT open the 관리 계획 disclosure (the mid-batch defect)', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'e1-nextvisitcheckitem-only',
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: '',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: 'ROUND26 다음에 다시 확인',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  const idx = html.indexOf('관리 계획 · 다음 재평가 — 자세히 입력')
  const tag = html.slice(html.lastIndexOf('<details', idx), html.indexOf('>', idx) + 1)
  assert.ok(!/\bopen\b/.test(tag), 'a non-empty nextVisitCheckItem alone must not force the disclosure open')
  // The value is still saved and still visible -- in the lane-4 textarea
  // above, and in NextActionCard's read-back (the disclosure being closed
  // is exactly what makes NextActionCard render, per E-16 below).
  assert.ok(html.includes('ROUND26 다음에 다시 확인'), 'the value itself is never lost -- it is just not force-opening the OTHER form')
})

test('Batch 2.6 E-1 (differential): a non-empty currentTreatmentGoal STILL opens the 관리 계획 disclosure', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'e1-currenttreatmentgoal',
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: 'ROUND26 치료 목표',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: '',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  const idx = html.indexOf('관리 계획 · 다음 재평가 — 자세히 입력')
  const tag = html.slice(html.lastIndexOf('<details', idx), html.indexOf('>', idx) + 1)
  assert.ok(/\bopen\b/.test(tag), 'a non-empty currentTreatmentGoal alone still opens the disclosure -- only nextVisitCheckItem was excluded')
})

test('Batch 2.6 C-1: PainCarePlanCard no longer draws its own "다음 방문 확인 사항" field -- the lane-4 textarea is the only editable copy', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'c1-no-duplicate-field',
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: 'ROUND26 치료 목표(펼침용)',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: 'ROUND26 확인 메모 값',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  assert.ok(html.includes('관리 계획 · 다음 재평가'), 'sanity: the disclosure renders (opened by currentTreatmentGoal)')
  assert.ok(!html.includes('다음 방문 확인 사항'), 'the Care Plan card no longer has its own "다음 방문 확인 사항" label at all')
  // The mutation-resistance check that matters (C-1): the value must appear
  // in only ONE *editable* (non-readonly) textarea -- the lane-4 "다음
  // 방문 확인 메모" itself. It also legitimately appears inside the
  // pre-existing, unrelated readonly EMR/patient-preview text blocks
  // further down the page (those summarize the whole record and are out
  // of this batch's scope) -- so the check is scoped to non-readonly
  // <textarea> elements specifically, not a raw substring count.
  const editableTextareasWithValue = [...html.matchAll(/<textarea\b([^>]*)>([^<]*)<\/textarea>/g)].filter(
    ([, attrs, inner]) => !attrs.includes('readonly') && inner.includes('ROUND26 확인 메모 값'),
  )
  assert.equal(editableTextareasWithValue.length, 1, 'the value appears in exactly one EDITABLE textarea, never duplicated across two live ones')
  assert.ok(
    editableTextareasWithValue[0][1].includes('다음 방문 확인 메모'),
    'that one editable textarea is specifically the lane-4 "다음 방문 확인 메모" field',
  )
})

test('Batch 2.6 E-16/C-2: NextActionCard renders ONLY while the 관리 계획 disclosure is closed', () => {
  const closedHtml = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'e16-closed',
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: '',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        // Only nextVisitCheckItem is non-empty -- per E-1, that alone must
        // NOT open the disclosure, so this is the realistic "closed but
        // NextActionCard has something to read back" case.
        nextVisitCheckItem: 'ROUND26 집에서 할 일(닫힘)',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  const closedIdx = closedHtml.indexOf('관리 계획 · 다음 재평가 — 자세히 입력')
  const closedTag = closedHtml.slice(closedHtml.lastIndexOf('<details', closedIdx), closedHtml.indexOf('>', closedIdx) + 1)
  assert.ok(!/\bopen\b/.test(closedTag), 'sanity: disclosure stays closed here (only nextVisitCheckItem is set)')
  assert.ok(closedHtml.includes('workspace__nextAction'), 'NextActionCard DOES render while the disclosure is closed')

  const openHtml = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'e16-open',
    initialWorkspaceState: {
      painCarePlan: {
        currentTreatmentGoal: 'ROUND26 열림용 치료 목표',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: '',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  const openIdx = openHtml.indexOf('관리 계획 · 다음 재평가 — 자세히 입력')
  const openTag = openHtml.slice(openHtml.lastIndexOf('<details', openIdx), openHtml.indexOf('>', openIdx) + 1)
  assert.ok(/\bopen\b/.test(openTag), 'sanity: disclosure is open here (currentTreatmentGoal is non-empty)')
  assert.ok(!openHtml.includes('workspace__nextAction'), 'NextActionCard does NOT render while the disclosure is open -- it would be a pure duplicate of the open form')
})

/* ------------------------------------------------------------------------
 * Opus delta review (D-1, HIGH): removing `다음 방문 확인 사항` from
 * PainCarePlanCard unconditionally orphaned `carePlan.nextVisitCheckItem`
 * on the REVISIT screen -- RevisitWorkspace.tsx has no lane-4 textarea to
 * carry it, but 이어받기(치료 계획) (revisitCarryForward.ts) still writes
 * into it. Fix: PainCarePlanCard({ showNextVisitCheckItem = true }) --
 * the field defaults to shown (revisit's card, unchanged) and is opted out
 * ONLY at the initial-visit call site. These pin the invariant nobody was
 * checking before: `nextVisitCheckItem` is bound to exactly one editable
 * textarea on EVERY screen that renders PainCarePlanCard.
 * ---------------------------------------------------------------------- */
test('D-1: PainCarePlanCard renders 다음 방문 확인 사항 as an editable textarea by DEFAULT (the prop the revisit screen relies on, unchanged)', () => {
  const html = renderToString(
    React.createElement(PainCarePlanCard, {
      value: {
        currentTreatmentGoal: '',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: 'D1-REVISIT-ORPHAN-CHECK',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      onChange: () => {},
    }),
  )
  assert.ok(html.includes('다음 방문 확인 사항'), 'the field label renders by default')
  const editableTextareasWithValue = [...html.matchAll(/<textarea\b([^>]*)>([^<]*)<\/textarea>/g)].filter(
    ([, attrs, inner]) => !attrs.includes('readonly') && inner.includes('D1-REVISIT-ORPHAN-CHECK'),
  )
  assert.equal(editableTextareasWithValue.length, 1, 'the value is bound to exactly one editable textarea -- no longer invisible, no longer unreachable')
})

test('D-1: PainCarePlanCard with showNextVisitCheckItem={false} (the initial-visit call site only) omits the field entirely', () => {
  const html = renderToString(
    React.createElement(PainCarePlanCard, {
      value: {
        currentTreatmentGoal: '',
        rehabilitationGoal: '',
        homeActionPlan: '',
        activityPrecaution: '',
        patientInstruction: '',
        nextVisitCheckItem: 'D1-SHOULD-NOT-APPEAR',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      onChange: () => {},
      showNextVisitCheckItem: false,
    }),
  )
  assert.ok(!html.includes('다음 방문 확인 사항'), 'the field label is gone when opted out')
  assert.ok(!html.includes('D1-SHOULD-NOT-APPEAR'), 'the value does not render anywhere in this card when opted out (it still lives in the lane-4 textarea one lane up, out of this component)')
  const textareaCount = [...html.matchAll(/<textarea\b/g)].length
  assert.equal(textareaCount, 5, 'exactly 5 fields render when opted out, not 6')
})

test('D-1: the initial-visit call site (PainWorkspace.tsx) is the ONLY caller that opts out -- source scan', () => {
  const painSrc = fs.readFileSync('src/doctor/workspace/PainWorkspace.tsx', 'utf8')
  assert.ok(
    painSrc.includes('<PainCarePlanCard value={carePlan} onChange={onChangeCarePlan} showNextVisitCheckItem={false} />'),
    'PainWorkspace.tsx opts out explicitly -- the lane-4 textarea above is the one editable home for this field on this screen',
  )

  const revisitSrc = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const cardIdx = revisitSrc.indexOf('<PainCarePlanCard')
  assert.ok(cardIdx !== -1, 'RevisitWorkspace still renders the card')
  const callEnd = revisitSrc.indexOf('/>', revisitSrc.indexOf('onChange={(next)', cardIdx))
  const call = revisitSrc.slice(cardIdx, callEnd)
  assert.ok(
    !call.includes('showNextVisitCheckItem'),
    'D-1: RevisitWorkspace.tsx must NOT opt out -- it has no other textarea for this field, so the card default (shown) is its only editable home',
  )
  // Non-vacuous: the card call really is reached through a rendered,
  // editable control (inside the auto-opening <details>, not dead code).
  const detailsIdx = revisitSrc.lastIndexOf('<details', cardIdx)
  assert.ok(detailsIdx !== -1, 'a <details> precedes the card')
  assert.ok(
    revisitSrc.slice(detailsIdx, cardIdx).includes('className="workspace__revisit__optional"'),
    'the card sits inside the same auto-opening, non-dead disclosure this batch already pins (E-3)',
  )
})

/* ------------------------------------------------------------------------
 * Opus delta review (D-3, LOW-MEDIUM): <details> is uncontrolled, so gating
 * NextActionCard on `carePlanDetailsOpen` (a "has content" computed value)
 * instead of the disclosure's REAL open state meant a clinician's manual
 * collapse never brought the read-back back, and a manual open followed by
 * typing unmounted NextActionCard out from under the cursor. Fix: track the
 * real toggle state (`planOpen`, via onToggle) and gate on THAT.
 * react-test-renderer is required here (renderToString cannot express a
 * post-mount toggle event on the same instance -- see doctor-reset-key.spec
 * .mjs's own header for why this suite otherwise avoids it).
 * ---------------------------------------------------------------------- */
function findCarePlanDetails(renderer) {
  const summary = renderer.root.findAll(
    (node) => node.type === 'summary' && node.props.children === '관리 계획 · 다음 재평가 — 자세히 입력',
  )[0]
  return summary?.parent
}
function hasNextActionCard(renderer) {
  return renderer.root.findAll(
    (node) => typeof node.props.className === 'string' && node.props.className.split(' ').includes('workspace__nextAction'),
  ).length > 0
}

test('D-3: NextActionCard reappears after the 관리 계획 disclosure is hand-collapsed, even though the Care Plan still has content', () => {
  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        resetKey: 'submission:d3-collapse',
        initialWorkspaceState: {
          painCarePlan: {
            currentTreatmentGoal: 'D3 치료 목표',
            rehabilitationGoal: '',
            homeActionPlan: 'D3 홈액션',
            activityPrecaution: '',
            patientInstruction: '',
            nextVisitCheckItem: '',
            recordedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    )
  })
  const details = findCarePlanDetails(renderer)
  assert.ok(details, 'sanity: the 관리 계획 disclosure renders')
  assert.equal(details.props.open, true, 'sanity: content present -> disclosure starts open')
  assert.equal(hasNextActionCard(renderer), false, 'sanity: NextActionCard is hidden while the disclosure is open')

  // The clinician hand-collapses the auto-opened disclosure. The computed
  // "has content" value does not change -- only the real toggle state does.
  act(() => {
    details.props.onToggle({ currentTarget: { open: false } })
  })
  assert.equal(
    hasNextActionCard(renderer),
    true,
    'D-3: after a manual collapse, NextActionCard (다음에 확인할 것/다음 재평가 read-back) must reappear -- gating on the has-content value alone hid it forever',
  )
})

test('D-3: NextActionCard hides immediately once the disclosure is manually reopened (not just when content is typed)', () => {
  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        resetKey: 'submission:d3-expand',
      }),
    )
  })
  const details = findCarePlanDetails(renderer)
  assert.ok(details, 'sanity: the 관리 계획 disclosure renders')
  assert.equal(details.props.open, false, 'sanity: empty Care Plan -> disclosure starts closed')
  assert.equal(hasNextActionCard(renderer), true, 'sanity: NextActionCard renders (empty-state) while closed')

  act(() => {
    details.props.onToggle({ currentTarget: { open: true } })
  })
  assert.equal(
    hasNextActionCard(renderer),
    false,
    'D-3: once manually opened, NextActionCard must hide immediately -- gating on the real toggle state (not the has-content value) is what stops the block above the cursor from unmounting later, mid-keystroke, when content is then typed',
  )
})

// ---------- §1.3-#7 (현행 계승, regression pin) ----------
test('오늘 재검 목록 renders open when items.length > 0 and collapsed when items.length === 0 (현행 계승)', () => {
  const closed = render(PAIN_SCENARIO_1)
  const closedIdx = closed.indexOf('오늘 재검(Structured Reassessment) — 필요할 때 펼치기')
  const closedTag = closed.slice(closed.lastIndexOf('<details', closedIdx), closed.indexOf('>', closedIdx) + 1)
  assert.ok(!/\bopen\b/.test(closedTag), 'items.length === 0 -> collapsed')

  const open = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'reassess-open',
    initialWorkspaceState: {
      painReassessment: {
        items: [
          {
            id: 'r1', title: '재검 항목', previous: null,
            result: { status: 'NOT_YET_CHECKED', laterality: 'NOT_APPLICABLE', note: '', recordedAt: null },
          },
        ],
      },
    },
  })
  const openIdx = open.indexOf('오늘 재검(Structured Reassessment) — 필요할 때 펼치기')
  const openTag = open.slice(open.lastIndexOf('<details', openIdx), open.indexOf('>', openIdx) + 1)
  assert.ok(/\bopen\b/.test(openTag), 'items.length > 0 -> open')
})

// ---------- §1.3-#8 (현행 계승, regression pin -- MicroFollowUpCard.tsx:33) ----------
test('MicroFollowUp 상세 opens exactly when needsAttention is true, matching the existing microFollowUpNeedsAttention() gate', () => {
  const withAttention = renderWith(PAIN_SCENARIO_1, {
    microFollowUpResponse: {
      visit_id: 'v1', patient_id: 'p1', targetRatings: [], overallChange: '', newSymptomReported: true,
      newSymptomNote: '새로운 통증', adverseEffectReported: false, adverseEffectNote: '', submitted_at: '2026-01-01T00:00:00.000Z',
    },
  })
  const idx = withAttention.indexOf('간단 재확인(Micro Follow-up)')
  const tag = withAttention.slice(withAttention.lastIndexOf('<details', idx), withAttention.indexOf('>', idx) + 1)
  assert.ok(/\bopen\b/.test(tag), 'newSymptomReported=true -> needsAttention -> auto-open')

  const withoutAttention = renderWith(PAIN_SCENARIO_1, {
    microFollowUpResponse: {
      visit_id: 'v1', patient_id: 'p1', targetRatings: [], overallChange: '괜찮아짐', newSymptomReported: false,
      newSymptomNote: '', adverseEffectReported: false, adverseEffectNote: '', submitted_at: '2026-01-01T00:00:00.000Z',
    },
  })
  const idx2 = withoutAttention.indexOf('간단 재확인(Micro Follow-up)')
  const tag2 = withoutAttention.slice(withoutAttention.lastIndexOf('<details', idx2), withoutAttention.indexOf('>', idx2) + 1)
  assert.ok(!/\bopen\b/.test(tag2), 'no attention flags -> collapsed even though a response exists')
})

// ---------- §1.3-#10 ----------
test('재활 제안 disclosure-equivalent renders only when candidate items exist, absent when the candidate list is empty (§2.10 C-4: an always-visible presence check satisfies the same "never hidden without a marker" rule a <details open=""> would)', () => {
  const withCandidates = renderWith(PAIN_SCENARIO_1, {
    synthetic: {
      ...PAIN_SCENARIO_1.synthetic,
      rehabSuggestions: [
        {
          id: 'r1', title: '재활 제안 (SYNTHETIC)', goal: '', rationale: '', sourceFacts: [], contraindicationFacts: [],
          source: 'SUGGESTED', status: 'SUGGESTED', clinicianFinalInstruction: '',
        },
      ],
    },
  })
  assert.ok(withCandidates.includes('재활/운동 제안'), 'the section renders when a candidate exists')

  const withoutCandidates = renderWith(PAIN_SCENARIO_1, { synthetic: { ...PAIN_SCENARIO_1.synthetic, rehabSuggestions: [] } })
  assert.ok(!withoutCandidates.includes('재활/운동 제안'), 'the section is absent (not an empty open shell) when there are no candidates')
})

// ---------- LBP v1 Batch 2 §8.2-1(a) integration correction ----------
test('§8.2-1(a): the exercise candidate section renders inside 판단·처치 (judgment-h2), not inside 확인 (lane2-h2), and appears AFTER PainFinalAssessmentCard in document order', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    synthetic: {
      ...PAIN_SCENARIO_1.synthetic,
      rehabSuggestions: [
        {
          id: 'r1', title: '재활 제안 (SYNTHETIC)', goal: '', rationale: '', sourceFacts: [], contraindicationFacts: [],
          source: 'SUGGESTED', status: 'SUGGESTED', clinicianFinalInstruction: '',
        },
      ],
    },
  })
  const lane2Idx = html.indexOf('id="lane2-h2"')
  const judgmentIdx = html.indexOf('id="judgment-h2"')
  const nextIdx = html.indexOf('id="next-h2"')
  const finalAssessmentIdx = html.indexOf('최종 임상 판단') // PainFinalAssessmentCard's own field label
  const exerciseIdx = html.indexOf('재활/운동 제안')
  assert.ok(lane2Idx !== -1 && judgmentIdx !== -1 && nextIdx !== -1 && finalAssessmentIdx !== -1 && exerciseIdx !== -1)
  assert.ok(exerciseIdx > lane2Idx, 'sanity: exercise section renders after 레인2 starts')
  assert.ok(
    exerciseIdx > judgmentIdx && exerciseIdx < nextIdx,
    'the exercise section renders inside 판단·처치 (between judgment-h2 and next-h2), never inside 레인2(확인)',
  )
  assert.ok(
    exerciseIdx > finalAssessmentIdx,
    'the exercise section renders AFTER PainFinalAssessmentCard in document order (PO canonical route: 확인 -> 치료 방향 -> Exercise Eligibility -> 운동)',
  )
})

// ---------- §1.3-#16 (신규 disclosure 전수 커버리지, 정적 목록 대조) ----------
test('every disclosure element Core Reduction P2/P3 introduced has a corresponding open-condition test in this suite (no orphaned <details> without an open={} assertion)', () => {
  // The 5 disclosures Phase 5 Synthesis v1.2 introduced/changed this round:
  //   1. §2.4 반대편 유형 입력 세트 (doctor__oppositeType)      -- tested above (#4/#5)
  //   2. §2.7 발급 "다른 방법" (doctor__nextIssuance__altMethods) -- source-tested in tests/doctor.spec.mjs
  //   3. §2.10 학습 케이스 (judgment__learningCase)              -- Batch 4.1-D (§17.1) REMOVED this
  //      disclosure entirely (JudgmentPanel.tsx itself is gone, §17.2) --
  //      there is no open={} condition left to check; its absence is
  //      pinned by tests/doctor.spec.mjs's T26 instead ("학습 케이스"/
  //      "★ 표시됨" no longer render on any profile).
  // (재활 제안/병기 후보는 <details>가 아니라 존재-시에만-렌더 형태로 구현했으므로
  //  이 정적 목록에서 제외 -- 위 #10 테스트가 그 형태에 맞는 동등 검증을 담당한다.)
  const workspaceSrc = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')
  assert.ok(/className="workspace__optional doctor__oppositeType"\s*\n\s*open=\{/.test(workspaceSrc), '#1: doctor__oppositeType has an open={} condition')
  const viewSrc = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
  assert.ok(/doctor__nextIssuance__altMethods"\s*open=\{altMethodsAutoOpen\}/.test(viewSrc), '#2: doctor__nextIssuance__altMethods has an open={} condition')
  assert.equal(fs.existsSync('src/doctor/JudgmentPanel.tsx'), false, '#3: src/doctor/JudgmentPanel.tsx (and its judgment__learningCase disclosure) must not exist')
})

// ---------- LBP v1 Batch 1 (G1-G5): real (non-synthetic) LBP payload ----------
// PAIN_SCENARIO_1/2 are built through the same production spec builders as
// every other fixture in this codebase -- rendering them with
// `synthetic: undefined` exercises the REAL generateLbpExamSuggestions/
// mergeLbpExamSuggestions path (not illustrative UX fixture data).

test('real (non-synthetic) LBP CLEAR payload: 목표 동작 재현 card + 허리 움직임 반응 chip row (with ⓘ) + 확인 추가 render', () => {
  const html = renderWith(PAIN_SCENARIO_1, { synthetic: undefined })
  assert.ok(html.includes('목표 동작 재현'), '자동 생성된 목표 동작 재현 항목이 렌더된다')
  assert.ok(html.includes('허리 움직임 반응'), '허리 움직임 반응 chip 행이 렌더된다')
  assert.ok(html.includes('workspace__helpToggle'), 'ⓘ 도움말 토글 버튼이 렌더된다')
  assert.ok(html.includes('aria-expanded="false"'), 'ⓘ 토글은 tap으로 열리는 aria-expanded 버튼이다')
  assert.ok(/title="어떻게: [^"]*\n왜: [^"]*"/.test(html), 'ⓘ hover(title 속성)도 동일한 how/why 문구를 담는다')
  assert.ok(html.includes('확인 추가'), '"확인 추가" disclosure가 렌더된다')
  // PAIN_SCENARIO_1's leg symptom is UNKNOWN (not YES) -- SLR/슬럼프 must not
  // be auto-generated, but it must still be offered as a manual add.
  assert.ok(html.includes('고관절 빠른 선별'), '고관절 빠른 선별이 확인 추가 목록에 있다')
  assert.ok(html.includes('천장관절 기여 확인'), '천장관절 기여 확인이 확인 추가 목록에 있다')
  assert.ok(html.includes('하지 신경학적 기본검사'), '하지 신경학적 기본검사가 확인 추가 목록에 있다')
})

test('real (non-synthetic) LBP payload with leg symptom YES (pain scenario 2): SLR/슬럼프 auto-merges in, and is no longer offered in 확인 추가', () => {
  const html = renderWith(PAIN_SCENARIO_2, { synthetic: undefined })
  // Opus delta review item 3: '하지직거상 또는 슬럼프검사' also appears as a
  // 확인 추가 button label (LBP_CLINICIAN_ADDABLE_EXAMS), so its bare
  // presence in the HTML cannot distinguish auto-merge from the manual-add
  // list. Assert the auto-generated reason text instead (only the
  // generator writes this exact PATIENT_FACT sentence), and assert the
  // 확인 추가 button for it is gone (already-present ids are hidden there).
  assert.ok(
    html.includes('하지 통증·저림/신경증상 보고(환자 응답)'),
    'SLR/슬럼프 항목이 자동 생성 사유와 함께 병합된다',
  )
  // Opus closing review: the previous regex-based negative assertion was
  // vacuous -- LbpAddExamDisclosure renders `+ {e.title}` as two adjacent
  // JSX children, so React 18 SSR emits a `<!-- -->` comment node between
  // them (`+ <!-- -->하지직거상 또는 슬럼프검사`), which
  // `/workspace__addExamBtn[^>]*>\s*\+ 하지직거상/` can never match --
  // it passed on PAIN_SCENARIO_1 too, where SLR really IS still offered.
  // Slice to the 확인 추가 list container instead of pattern-matching
  // across the comment node.
  const addIdx = html.indexOf('workspace__addExamList')
  assert.ok(addIdx !== -1, '확인 추가 목록이 렌더된다')
  const addChunk = html.slice(addIdx, html.indexOf('</details>', addIdx))
  assert.ok(!addChunk.includes('하지직거상'), '이미 병합된 SLR/슬럼프는 확인 추가 목록에서 사라진다')
})

test('PAIN_SCENARIO_1 (leg symptom UNKNOWN, no auto-merge): 하지직거상 또는 슬럼프검사 IS still offered in 확인 추가 (regression guard for the vacuous-assertion fix above)', () => {
  const html = renderWith(PAIN_SCENARIO_1, { synthetic: undefined })
  const addIdx = html.indexOf('workspace__addExamList')
  assert.ok(addIdx !== -1, '확인 추가 목록이 렌더된다')
  const addChunk = html.slice(addIdx, html.indexOf('</details>', addIdx))
  assert.ok(addChunk.includes('하지직거상'), '자동 병합되지 않은 SLR/슬럼프는 여전히 확인 추가 목록에 남아있다')
})

// ---------- LBP v1 Batch 2 §8.2-1(c) integration correction ----------
test('§8.2-1(c): real (non-synthetic) LBP CLEAR payload with no 목표 기능(target function) selected renders the empty-state hint, never an empty/absent section and never a candidate card', () => {
  const html = renderWith(PAIN_SCENARIO_1, { synthetic: undefined })
  assert.ok(
    html.includes('목표 기능을 먼저 고르면 그 기능에 맞는 운동 후보가 나타납니다'),
    'the empty-state hint line renders when no lbp_tf_* target function is selected yet',
  )
  assert.ok(!html.includes('workspace__adoptBtn'), 'no candidate card (with its adopt button) renders alongside the hint')
  assert.ok(!html.includes('확인하면 시작 가능'), 'no awaiting-capability card renders either -- the gap is the target function, not a capability')
})

test('허리 움직임 반응 기본값(미시행)은 눌린 상태(aria-pressed=true)로 렌더되고, 정상 소견처럼 보이지 않는다', () => {
  const html = renderWith(PAIN_SCENARIO_1, { synthetic: undefined })
  const idx = html.indexOf('허리 움직임 반응 선택')
  assert.ok(idx !== -1)
  const chunk = html.slice(idx, idx + 1200)
  // Opus delta review item 4: the test name claims aria-pressed="true", but
  // the previous assertion only checked the label text existed anywhere in
  // the chunk -- assert the actual pressed-button markup.
  assert.ok(
    /<button[^>]*aria-pressed="true"[^>]*>미시행<\/button>/.test(chunk),
    '미시행 chip이 aria-pressed="true"로 렌더된다',
  )
})

test('목표 기능 그룹 라벨은 LBP 재평가 대상 picker에만 나타나고, 목표 기능 chip 9개가 모두 렌더된다', () => {
  const html = renderWith(PAIN_SCENARIO_1, { synthetic: undefined })
  assert.ok(html.includes('목표 기능(다음 방문에 같은 동작으로 비교)'))
  for (const label of ['걷기', '앉기', '서기', '앉았다 일어서기', '옷 입기·양말 신기', '물건 들기', '수면·침상 동작', '업무·집안일 복귀', '기타 목표 동작']) {
    assert.ok(html.includes(label), `목표 기능 chip "${label}"이 렌더된다`)
  }
  // The original PAIN_FOLLOW_UP_OPTIONS chips must still render alongside (ungrouped).
  assert.ok(html.includes('통증 강도'))
  assert.ok(html.includes('움직임·기능'))
  assert.ok(html.includes('증상 재현 여부'))
})

test('non-LBP pain patient (shoulder, pain scenario 3) renders exactly as before: no 허리 움직임 반응, no 목표 기능 group label', () => {
  const html = render(PAIN_SCENARIO_3)
  assert.ok(!html.includes('허리 움직임 반응'))
  assert.ok(!html.includes('목표 기능(다음 방문에 같은 동작으로 비교)'))
  assert.ok(!html.includes('걷기'))
})

test('EMR preview: 허리 움직임 반응 line은 기본값(NOT_ASSESSED)에서는 나타나지 않는다', () => {
  const html = renderWith(PAIN_SCENARIO_1, { synthetic: undefined })
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(!emrTextOnly.includes('허리 움직임 반응:'))
})

test('EMR preview: 허리 움직임 반응이 설정되면 라벨로 출력된다', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    synthetic: undefined,
    submissionId: 'lbp-directional-test',
    initialWorkspaceState: {
      schema_version: '1.1.0',
      lbpDirectionalResponse: 'FLEXION_FAVORABLE',
      updated_at: null,
    },
  })
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(emrTextOnly.includes('허리 움직임 반응: 숙이면(굴곡) 호전'))
})

test('WorkspaceState.lbpDirectionalResponse: invalid persisted value degrades to NOT_ASSESSED (never crashes, never shown as a normal value)', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    synthetic: undefined,
    submissionId: 'lbp-directional-garbage-test',
    initialWorkspaceState: {
      schema_version: '1.1.0',
      lbpDirectionalResponse: 'BOGUS_VALUE',
      updated_at: null,
    },
  })
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(!emrTextOnly.includes('허리 움직임 반응:'), '알 수 없는 값은 NOT_ASSESSED로 취급되어 EMR line이 없다')
})

// ---------- Opus delta review item 1: RevisitWorkspace carried-forward LBP target-function chips ----------

test('Opus review item 1a: RevisitWorkspace.tsx wires every APPROVED region pack\'s target functions (LBP included) + a matching groups label into its FollowUpTargetPicker', () => {
  // 부위 팩 일반화(2026-09-06, R2): the LBP-only import became "every
  // approved pack's targetFunctions" (REGION_PACKS filtered by isPackActive)
  // -- the LBP pack is approved, so a carried-forward lbp_tf_* target still
  // has a real option/chip; an UNAPPROVED pack's ids are deliberately absent.
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  assert.ok(/import \{ REGION_PACKS, activeRegionPack, activeDrivingPack \} from '\.\/regionPacks'/.test(src), 'imports the pack registry')
  assert.ok(
    /const APPROVED_PACK_TARGET_FUNCTIONS = REGION_KEYS\.flatMap\(\(k\) => \{\s*const pack = REGION_PACKS\[k\]\s*return isPackActive\(pack\) \? pack\.targetFunctions : \[\]\s*\}\)/.test(src),
    'target functions come from approved packs only (isPackActive gate)',
  )
  assert.ok(
    /const COMBINED_FOLLOW_UP_OPTIONS = \[\.\.\.APPROVED_PACK_TARGET_FUNCTIONS, \.\.\.PAIN_FOLLOW_UP_OPTIONS, \.\.\.HERBAL_FOLLOW_UP_OPTIONS\]/.test(src),
    'a carried-forward lbp_tf_* target has a real option/chip to render, not just an orphan selection',
  )
  assert.ok(/groups=\{COMBINED_FOLLOW_UP_GROUPS\}/.test(src), 'passes the same 목표 기능 grouping PainWorkspaceNext uses')
  // Non-vacuous: the LBP pack really is approved, so its 9 ids are in the combined list.
  const lbpPackSrc = fs.readFileSync('src/doctor/workspace/regionPacks/lbp.ts', 'utf8')
  assert.ok(/productionApproved: true/.test(lbpPackSrc), 'the LBP pack is the approved one')
})

test('Opus review item 1b: FollowUpTargetPicker renders a chip (aria-pressed="true") for a selected item whose id is NOT in `options` (structurally impossible to end up un-deselectable)', () => {
  // Simulates exactly the bug this guards against: a carried-forward
  // LBP target function reaching a caller whose `options` prop happens
  // not to include it.
  const html = renderToString(
    React.createElement(FollowUpTargetPicker, {
      options: [{ id: 'pain_intensity', label: '통증 강도', baseline: '', postTreatmentValue: '' }],
      selected: [{ id: 'lbp_tf_walking', label: '걷기', baseline: '', postTreatmentValue: '' }],
      onChange: () => {},
    }),
  )
  assert.ok(
    /<button[^>]*aria-pressed="true"[^>]*>걷기<\/button>/.test(html),
    'the orphan-selected target function still renders as a pressed, deselectable chip',
  )
})

test('Opus review item 1b: with MAX_FOLLOW_UP_TARGETS (3) orphan selections and empty options, all 3 still render as pressed chips (never silently unrenderable)', () => {
  const orphan = (id, label) => ({ id, label, baseline: '', postTreatmentValue: '' })
  const html = renderToString(
    React.createElement(FollowUpTargetPicker, {
      options: [],
      selected: [orphan('lbp_tf_walking', '걷기'), orphan('lbp_tf_sitting', '앉기'), orphan('lbp_tf_standing', '서기')],
      onChange: () => {},
    }),
  )
  for (const label of ['걷기', '앉기', '서기']) {
    assert.ok(
      new RegExp(`<button[^>]*aria-pressed="true"[^>]*>${label}</button>`).test(html),
      `${label} renders as a pressed chip even though it is not in options`,
    )
  }
})

// ---------------------------------------------------------------------------
// Opus delta review (LBP v1 Batch 2) defects 4/5/7/9 — rendered through the
// real DoctorWorkspace shell (PainExerciseSection lives inside it), same `renderWith(scenario, { synthetic: undefined, ... })`
// live-recompute pattern the existing "14차 HIGH-1" test above already uses
// for an LBP scenario. PAIN_SCENARIO_1 is a safety-CLEAR LBP payload.
// ---------------------------------------------------------------------------

const walkingFollowUpTarget = [{ id: 'lbp_tf_walking', label: '걷기', baseline: '', postTreatmentValue: '' }]
const dressingFollowUpTarget = [{ id: 'lbp_tf_dressing', label: '옷 입기', baseline: '', postTreatmentValue: '' }]

function lbpLiveExtraProps(initialWorkspaceState, extra = {}) {
  return { synthetic: undefined, lbpObjectiveMotorDeficit: 'NONE', initialWorkspaceState, ...extra }
}

// ---------- defect 4 (§2.2): >3 READY candidates -> first 3 + "더 보기 (N)" ----------

test('defect 4: more than 3 READY LBP candidates -> first 3 candidate cards render outside <details>, the rest inside "더 보기 (N)" (nothing dropped)', () => {
  const html = renderWith(
    PAIN_SCENARIO_1,
    lbpLiveExtraProps({ painFollowUpTargets: walkingFollowUpTarget }),
  )
  const cardCount = (html.match(/class="workspace__candidateCard /g) ?? []).length
  assert.ok(cardCount > 3, `test setup must produce more than 3 ready candidates, found ${cardCount}`)
  // The page renders other unrelated <details> disclosures (reference
  // drawer, Care Plan, ...) -- find the one that belongs to THIS section by
  // locating it just before its own "더 보기 (" summary text, not the first
  // <details> anywhere on the page.
  const moreIdx = html.indexOf('더 보기 (')
  assert.ok(moreIdx !== -1, 'a "더 보기" disclosure must exist once more than 3 candidates are ready')
  const detailsIdx = html.lastIndexOf('<details', moreIdx)
  assert.ok(detailsIdx !== -1, 'the <details> wrapping the "더 보기" summary must exist')
  const beforeCount = (html.slice(0, detailsIdx).match(/class="workspace__candidateCard /g) ?? []).length
  assert.equal(beforeCount, 3, 'exactly 3 candidate cards render outside the disclosure')
  const hiddenCount = cardCount - 3
  // React's server renderer wraps an interpolated expression in text content
  // with `<!-- -->` comment markers, so `더 보기 ({N})` serializes as
  // `더 보기 (<!-- -->N<!-- -->)`, not a plain concatenated string.
  assert.ok(
    new RegExp(`더 보기 \\(<!-- -->${hiddenCount}<!-- -->\\)`).test(html),
    `summary must show the hidden count (${hiddenCount}); nothing is ever silently cut`,
  )
})

test('defect 4: 3 or fewer READY candidates -> no <details> disclosure at all', () => {
  const html = renderWith(
    PAIN_SCENARIO_1,
    // 2026-09-05: 준비조건 게이트가 사라져 "확인을 덜 해서 후보가 적다"는
    // 설정이 불가능해졌다. 후보 수는 이제 목표 기능이 정한다 — 옷 입기는
    // Core-20에서 대응 운동이 1개뿐이라 <details>가 뜨지 않는 조건을 만든다.
    lbpLiveExtraProps({ painFollowUpTargets: dressingFollowUpTarget }),
  )
  const cardCount = (html.match(/class="workspace__candidateCard /g) ?? []).length
  assert.ok(cardCount > 0 && cardCount <= 3, `test setup expected 1-3 ready candidates, found ${cardCount}`)
  assert.ok(!html.includes('더 보기 ('), 'no "더 보기" disclosure is rendered for the candidate list when nothing is hidden')
})

// The heading text itself (Opus delta review item 5: matches the button
// labels 1:1 -- "확인함/지금은 안 됨" not "확인된/지금은 안 됨"). Used both as an
// existence check and as the anchor to slice INTO the decided-capabilities
// section specifically, since a capability's own label can legitimately
// appear earlier on the page too (e.g. inside an awaiting-candidate card
// for the same capability id -- see the NO-capability test below, item 4).
const DECIDED_CAPABILITIES_HEADING = '확인함/지금은 안 됨으로 표시한 준비 조건'
// ---------- defect 7: adopt action only for LBP records ----------

test('defect 7: PAIN_SCENARIO_3 (shoulder, non-LBP) never renders the "치료 계획에 가져오기" adopt button, even for an ACCEPTED suggestion', () => {
  const html = renderWith(PAIN_SCENARIO_3, {
    submissionId: 'x',
    synthetic: undefined,
    initialWorkspaceState: {
      painRehabSuggestions: [
        {
          id: 'non-lbp-accepted',
          title: '어깨 재활 제안 (SYNTHETIC)',
          goal: '',
          rationale: '',
          sourceFacts: [],
          contraindicationFacts: [],
          source: 'SUGGESTED',
          status: 'ACCEPTED',
          clinicianFinalInstruction: '',
        },
      ],
    },
  })
  assert.ok(html.includes('어깨 재활 제안 (SYNTHETIC)'), 'sanity: the ACCEPTED suggestion card itself still renders')
  assert.ok(!html.includes('workspace__adoptBtn'), 'a non-LBP record must never render the Care-Plan adopt button')
  assert.ok(!html.includes('치료 계획에 가져오기'))
})

test('defect 7 (differential): the same ACCEPTED-suggestion shape on an LBP record (PAIN_SCENARIO_1) DOES render the adopt button', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'x',
    synthetic: undefined,
    lbpObjectiveMotorDeficit: 'NONE',
    initialWorkspaceState: {
      painRehabSuggestions: [
        {
          id: 'lbp-accepted',
          title: 'LBP 재활 제안 (SYNTHETIC)',
          goal: '',
          rationale: '',
          sourceFacts: [],
          contraindicationFacts: [],
          source: 'SUGGESTED',
          status: 'ACCEPTED',
          clinicianFinalInstruction: '',
        },
      ],
    },
  })
  assert.ok(html.includes('LBP 재활 제안 (SYNTHETIC)'))
  assert.ok(html.includes('workspace__adoptBtn'), 'an LBP record must still render the adopt button for an ACCEPTED item')
})
// ---------------------------------------------------------------------------
// LBP v1 Batch 3 (§9.2(f)): RevisitWorkspace.tsx wiring for
// RevisitQuickCheckCard + the detail-check-due indicator. RevisitWorkspace.tsx
// is NOT bundled/rendered in this file (it fetches over the network) --
// following the existing "Opus review item 1a" convention just above,
// these are source-string checks, not a react-dom/server render.
// ---------------------------------------------------------------------------

test('LBP v1 Batch 3: RevisitQuickCheckCard mounts between <ClinicalLoopStatusBar> and <PainFinalAssessmentCard> in RevisitWorkspace.tsx', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const loopIdx = src.indexOf('<ClinicalLoopStatusBar')
  const quickCheckIdx = src.indexOf('<RevisitQuickCheckCard')
  const finalAssessmentIdx = src.indexOf('<PainFinalAssessmentCard')
  assert.ok(loopIdx !== -1 && quickCheckIdx !== -1 && finalAssessmentIdx !== -1, 'all three elements exist in the source')
  assert.ok(loopIdx < quickCheckIdx, 'RevisitQuickCheckCard mounts AFTER <ClinicalLoopStatusBar>')
  assert.ok(quickCheckIdx < finalAssessmentIdx, 'RevisitQuickCheckCard mounts BEFORE <PainFinalAssessmentCard>')
})

test('LBP v1 Batch 3: loopStatus leads with a quickCheck item wired to revisitQuickCheck.recordedAt', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const anchor = 'const loopStatus: ClinicalLoopStatusItem[] = ['
  const loopArrayStart = src.indexOf(anchor)
  assert.ok(loopArrayStart !== -1, 'loopStatus array declaration exists')
  // Start scanning for the closing "]" AFTER the anchor's own trailing "["
  // (the anchor string itself contains an unrelated "[]" from the
  // ClinicalLoopStatusItem[] type annotation, which would otherwise be
  // mistaken for the array's close).
  const arrayContentStart = loopArrayStart + anchor.length
  const loopArrayEnd = src.indexOf(']', arrayContentStart)
  const loopArraySrc = src.slice(arrayContentStart, loopArrayEnd)
  const quickCheckIdx = loopArraySrc.indexOf("key: 'quickCheck'")
  assert.ok(quickCheckIdx !== -1, "the loop array contains a key: 'quickCheck' entry")
  // Non-vacuous "it's FIRST" check: no earlier `key:` entry precedes it,
  // and the array does contain other `key:` entries later (proving the
  // array itself is not simply empty/degenerate).
  assert.ok(!loopArraySrc.slice(0, quickCheckIdx).includes('key:'), 'quickCheck is the FIRST item in loopStatus (no earlier key: entry)')
  assert.ok((loopArraySrc.match(/key:/g) ?? []).length > 1, 'sanity: loopStatus has more than just the quickCheck item')
  assert.ok(loopArraySrc.includes("label: '재진 간단 체크'"), 'the quickCheck item label is 재진 간단 체크')
  assert.ok(
    loopArraySrc.includes('done: workspaceState.revisitQuickCheck.recordedAt !== null'),
    'the quickCheck item is done exactly when revisitQuickCheck.recordedAt !== null',
  )
})

test('LBP v1 Batch 3: the 오늘 재검 <details> open= expression is UNCHANGED -- still items.length > 0, never references the new due variable', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const summaryIdx = src.indexOf('오늘 재검(Structured Reassessment) — 필요할 때 펼치기')
  assert.ok(summaryIdx !== -1, 'the 오늘 재검 summary text exists')
  const detailsIdx = src.lastIndexOf('<details', summaryIdx)
  // Not `indexOf('>', detailsIdx)` -- the open={...} expression itself
  // contains a literal `>` (the `.length > 0` comparison), which would
  // truncate the tag before its real close. A fixed-length startsWith on
  // the known literal attribute text sidesteps that trap entirely.
  const tagChunk = src.slice(detailsIdx, detailsIdx + 120)
  assert.ok(
    tagChunk.startsWith('<details className="workspace__revisit__optional" open={workspaceState.reassessment.items.length > 0}>'),
    'open= is exactly open={workspaceState.reassessment.items.length > 0}, attribute-for-attribute unchanged',
  )
  assert.ok(!tagChunk.includes('detailCheckDue'), 'open= never references detailCheckDue -- a due plan never auto-opens the disclosure')
})

test('LBP v1 Batch 3: the detail-check-due indicator line renders directly above the 오늘 재검 <details>, as role="status"', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const dueLineIdx = src.indexOf('workspace__revisit__detailCheckDue')
  assert.ok(dueLineIdx !== -1, 'the due-indicator element exists')
  const summaryIdx = src.indexOf('오늘 재검(Structured Reassessment) — 필요할 때 펼치기')
  const detailsIdx = src.lastIndexOf('<details', summaryIdx)
  assert.ok(dueLineIdx < detailsIdx, 'the due-indicator line appears BEFORE the 오늘 재검 <details> in source order')
  // Non-vacuous "directly above": no OTHER <details> element sits between
  // them (which would mean something else was inserted in between).
  const between = src.slice(dueLineIdx, detailsIdx)
  assert.ok(!between.includes('<details'), 'no other <details> element sits between the due-indicator line and the 오늘 재검 details')
  const dueLineChunk = src.slice(Math.max(0, dueLineIdx - 80), dueLineIdx + 400)
  assert.ok(dueLineChunk.includes('role="status"'), 'the due-indicator line carries role="status"')
  assert.ok(dueLineChunk.includes('detailCheckDue.planLabel'), 'the due-indicator line interpolates detailCheckDue.planLabel')
  assert.ok(dueLineChunk.includes('detailCheckDue &&'), 'the due-indicator line renders only when detailCheckDue is non-null')
})

test('LBP v1 Batch 3: RevisitWorkspace.tsx computes detailCheckDue via computeDetailCheckDue(priorHistory?.visits, todayISO())', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  assert.ok(
    src.includes('computeDetailCheckDue(priorHistory?.visits, todayISO())'),
    'detailCheckDue is computed from priorHistory?.visits and the injectable todayISO() helper',
  )
  assert.ok(/function todayISO\(\)/.test(src), 'todayISO() is its own named function (an injectable seam), not an inline new Date() at the call site')
})

// ---------------------------------------------------------------------------
// LBP v1 Batch 3.1 (§10.2): "이전에 채택한 운동" survives past the 2nd
// revisit -- RevisitWorkspace.tsx wiring for `rehabSourceSubmission` +
// `findLatestSubmissionBackedPriorVisit`. Same source-string-check
// convention as the Batch 3 block just above (RevisitWorkspace.tsx fetches
// over the network, so it is not bundled/rendered here).
// ---------------------------------------------------------------------------

test('LBP v1 Batch 3.1: rehabSourceSubmission is reset to null in the load effect\'s existing reset block, alongside priorSubmission/priorVisitWorkspace', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const resetAnchor = 'setPriorHistory(null)'
  const resetStart = src.indexOf(resetAnchor)
  assert.ok(resetStart !== -1, 'the reset block exists')
  const resetChunk = src.slice(resetStart, resetStart + 400)
  const priorSubmissionIdx = resetChunk.indexOf('setPriorSubmission(null)')
  const priorVisitWorkspaceIdx = resetChunk.indexOf('setPriorVisitWorkspace(null)')
  const rehabSourceIdx = resetChunk.indexOf('setRehabSourceSubmission(null)')
  assert.ok(priorSubmissionIdx !== -1 && priorVisitWorkspaceIdx !== -1, 'sanity: the existing reset calls are still there')
  assert.ok(rehabSourceIdx !== -1, 'setRehabSourceSubmission(null) is called in the reset block')
  assert.ok(rehabSourceIdx > priorVisitWorkspaceIdx, 'it sits alongside (after) the existing priorSubmission/priorVisitWorkspace resets, in the same block')
  // Non-vacuous "same block" check: nothing that starts a NEW effect/function
  // (the next useEffect or the load() declaration) sits between them.
  const between = resetChunk.slice(priorVisitWorkspaceIdx, rehabSourceIdx)
  assert.ok(!between.includes('async function load'), 'the reset stays inside the synchronous reset block, before load() is even declared')
})

test('LBP v1 Batch 3.1: the load effect reuses the already-fetched latest-visit submission (no extra getSubmission call) when rehabSource IS the latest visit', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const rehabSourceAnchor = 'const rehabSource = findLatestSubmissionBackedPriorVisit(historyResult.data.visits)'
  const rehabSourceIdx = src.indexOf(rehabSourceAnchor)
  assert.ok(rehabSourceIdx !== -1, 'rehabSource is computed via findLatestSubmissionBackedPriorVisit(historyResult.data.visits)')
  const branchChunk = src.slice(rehabSourceIdx, rehabSourceIdx + 900)
  assert.ok(
    /rehabSource\.visitId === latest\.visitId/.test(branchChunk),
    'the branch compares rehabSource.visitId against the latest prior visit\'s visitId',
  )
  // Non-vacuous "no extra fetch": the reuse branch (guarded by the
  // visitId-equality check) must set state from `latestSubmission` (the
  // variable already populated by the EARLIER getSubmission(latest.submissionId)
  // call above), not call getSubmission again -- while the DIFFERENT branch
  // (rehabSource is an older visit) DOES call getSubmission a second time,
  // proving this file really does distinguish the two cases rather than
  // always/never fetching.
  const reuseIfIdx = branchChunk.search(/if\s*\(latest\s*&&\s*rehabSource\.visitId === latest\.visitId/)
  assert.ok(reuseIfIdx !== -1, 'an explicit reuse-branch if() exists')
  const elseIdx = branchChunk.indexOf('} else {', reuseIfIdx)
  assert.ok(elseIdx !== -1, 'the reuse branch has a matching else branch')
  const reuseBranchSrc = branchChunk.slice(reuseIfIdx, elseIdx)
  const elseBranchSrc = branchChunk.slice(elseIdx, elseIdx + 300)
  assert.ok(reuseBranchSrc.includes('latestSubmission') && !reuseBranchSrc.includes('getSubmission('), 'the reuse branch uses latestSubmission and calls NO getSubmission at all')
  assert.ok(elseBranchSrc.includes('getSubmission(rehabSource.submissionId)'), 'the non-reuse (older-visit) branch DOES call getSubmission a second time -- proves the reuse branch above is not simply "getSubmission is never called here"')
  assert.ok(/if\s*\(!cancelled\)/.test(reuseBranchSrc), 'the reuse branch still respects the cancelled guard before calling setRehabSourceSubmission')
  assert.ok(/if\s*\(!cancelled\s*&&\s*rehabSubmissionResult\.ok\)/.test(elseBranchSrc), 'the extra-fetch branch guards its setRehabSourceSubmission with both cancelled and .ok')
})

test('LBP v1 Batch 3.1: priorVisitRecapLines()/priorVisitRecapLinesFromVisitWorkspace() no longer RETURN acceptedRehabTitles', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const fn1Start = src.indexOf('function priorVisitRecapLines(priorSubmission')
  const fn1End = src.indexOf('\n}', fn1Start)
  assert.ok(fn1Start !== -1 && fn1End !== -1, 'priorVisitRecapLines() exists')
  const fn1ReturnIdx = src.indexOf('return {', fn1Start)
  assert.ok(fn1ReturnIdx !== -1 && fn1ReturnIdx < fn1End, 'priorVisitRecapLines() has a return statement')
  const fn1ReturnStmt = src.slice(fn1ReturnIdx, src.indexOf('\n', fn1ReturnIdx))
  assert.ok(!fn1ReturnStmt.includes('acceptedRehabTitles'), 'priorVisitRecapLines() no longer returns acceptedRehabTitles (checking the return statement itself, not doc comments that legitimately still name it)')

  const fn2Start = src.indexOf('function priorVisitRecapLinesFromVisitWorkspace(priorVisitWorkspace')
  const fn2End = src.indexOf('\n}', fn2Start)
  assert.ok(fn2Start !== -1 && fn2End !== -1, 'priorVisitRecapLinesFromVisitWorkspace() exists')
  const fn2ReturnIdx = src.indexOf('return {', fn2Start)
  assert.ok(fn2ReturnIdx !== -1 && fn2ReturnIdx < fn2End, 'priorVisitRecapLinesFromVisitWorkspace() has a return statement')
  const fn2ReturnStmt = src.slice(fn2ReturnIdx, src.indexOf('\n', fn2ReturnIdx))
  assert.ok(!fn2ReturnStmt.includes('acceptedRehabTitles'), 'priorVisitRecapLinesFromVisitWorkspace() no longer returns acceptedRehabTitles')

  // Non-vacuous: acceptedRehabTitles is still a real, used identifier
  // elsewhere in the file (the new acceptedRehabTitlesFromSubmission() path)
  // -- this proves the assertions above are checking these two functions'
  // return statements specifically, not that the whole file dropped the
  // feature (their doc comments, checked NOT to include it above, are
  // free to keep naming it in prose explaining the removal).
  assert.ok(src.includes('function acceptedRehabTitlesFromSubmission('), 'acceptedRehabTitles is still computed, just via the new acceptedRehabTitlesFromSubmission() function')
})

test('LBP v1 Batch 3.1: the "이전에 채택한 운동" label uses readablePriorVisitDateLabel(rehabSourceSubmission?.createdAt)', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const labelIdx = src.indexOf('이전에 채택한 운동(')
  assert.ok(labelIdx !== -1, 'the label text exists')
  const labelChunk = src.slice(labelIdx, labelIdx + 200)
  assert.ok(
    labelChunk.includes('readablePriorVisitDateLabel(rehabSourceSubmission?.createdAt)'),
    'the label interpolates readablePriorVisitDateLabel(rehabSourceSubmission?.createdAt)',
  )
  assert.ok(labelChunk.includes('초진)'), 'the label reads "... 초진)" per the brief\'s exact wording')
})

test('LBP v1 Batch 3.1: the 오늘 재검 <details open=...> expression is STILL unchanged after this batch\'s edits', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const summaryIdx = src.indexOf('오늘 재검(Structured Reassessment) — 필요할 때 펼치기')
  const detailsIdx = src.lastIndexOf('<details', summaryIdx)
  const tagChunk = src.slice(detailsIdx, detailsIdx + 120)
  assert.ok(
    tagChunk.startsWith('<details className="workspace__revisit__optional" open={workspaceState.reassessment.items.length > 0}>'),
    'open= is still exactly open={workspaceState.reassessment.items.length > 0}',
  )
})

/* ------------------------------------------------------------------------
 * Batch 2.6 (E-3): the revisit screen's PainCarePlanCard is now behind a
 * <details>, matching the initial-visit treatment (PainWorkspace.tsx), with
 * the same auto-open-when-non-empty convention. RevisitWorkspace.tsx fetches
 * its own data (getVisit/getSubmission/...) and is not in this file's
 * DoctorWorkspace bundle (see the T-5 comment above), so -- following this
 * file's own established convention for RevisitWorkspace changes -- this is
 * a structural source check, not a full render.
 *
 * Closing review fix (Opus N-1): `isCarePlanEmpty` alone is no longer the
 * whole `open=` condition -- see the guard test right below this one. The
 * `between` check here still guarantees this really is the <details>
 * wrapping the card (not an unrelated one).
 * ---------------------------------------------------------------------- */
test('Batch 2.6 E-3: RevisitWorkspace.tsx wraps <PainCarePlanCard in a <details> that auto-opens when !isCarePlanEmpty(workspaceState.carePlan)', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const cardIdx = src.indexOf('<PainCarePlanCard')
  assert.ok(cardIdx !== -1, 'the card still exists')
  const detailsIdx = src.lastIndexOf('<details', cardIdx)
  assert.ok(detailsIdx !== -1, 'a <details> precedes the card')
  const tagChunk = src.slice(detailsIdx, src.indexOf('>', detailsIdx) + 1)
  assert.ok(tagChunk.includes('className="workspace__revisit__optional"'), 'still the same disclosure class')
  assert.ok(tagChunk.includes('!isCarePlanEmpty(workspaceState.carePlan)'), 'open= still includes !isCarePlanEmpty(workspaceState.carePlan)')
  // Non-vacuous: no OTHER <details> sits between this one and the card (i.e.
  // this really is the details wrapping the card, not an unrelated one).
  const between = src.slice(detailsIdx + tagChunk.length, cardIdx)
  assert.ok(!between.includes('<details'), 'no other <details> sits between the opening tag and the card')
  assert.ok(!between.includes('</details>'), 'the details does not close before the card')
  assert.ok(
    src.includes("import { isCarePlanEmpty } from './NextActionCard'"),
    'isCarePlanEmpty is imported from the same corrected NextActionCard.tsx (Batch 2.6 E-1) rather than reimplemented locally',
  )
})

/* ------------------------------------------------------------------------
 * Closing review (Opus N-1, LOW): `isCarePlanEmpty` deliberately excludes
 * `nextVisitCheckItem` (see its doc comment in NextActionCard.tsx) because
 * on the INITIAL-visit screen that field lives in an always-visible lane-4
 * textarea outside the 관리 계획 disclosure -- but on THIS screen
 * (RevisitWorkspace.tsx) the field has no such lane; it lives INSIDE this
 * disclosure as its only editable path. Before this fix, carrying forward a
 * prior Care Plan whose only text was `nextVisitCheckItem` wrote the value,
 * left this disclosure closed, and disabled the carry-forward button --
 * button pressed, screen unchanged, no way to see or edit what was just
 * written. This pins the `open=` condition adding the field back in on
 * THIS screen only (E-1's initial-visit win, pinned separately above and
 * again by the D-1 tests, is untouched).
 * ---------------------------------------------------------------------- */
test('N-1: RevisitWorkspace.tsx opens the Care Plan disclosure when nextVisitCheckItem ALONE is non-empty (the carry-forward-only-writes-this-field case)', () => {
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  const cardIdx = src.indexOf('<PainCarePlanCard')
  const detailsIdx = src.lastIndexOf('<details', cardIdx)
  const tagChunk = src.slice(detailsIdx, src.indexOf('>', detailsIdx) + 1)
  assert.ok(
    tagChunk.includes("workspaceState.carePlan.nextVisitCheckItem.trim() !== ''"),
    'the open= condition also opens the disclosure when nextVisitCheckItem alone is non-empty -- this screen has no other editable home for that field',
  )
  assert.ok(
    /open=\{!isCarePlanEmpty\(workspaceState\.carePlan\)\s*\|\|\s*workspaceState\.carePlan\.nextVisitCheckItem\.trim\(\) !== ''\}/.test(tagChunk),
    'the two conditions are OR-ed together in the open= expression, exactly',
  )
})

test('N-1: the initial-visit screen (E-1) is unaffected -- nextVisitCheckItem ALONE still does NOT open its 관리 계획 disclosure', () => {
  // Non-vacuous cross-check: PainWorkspace.tsx's own disclosure (E-1, pinned
  // above at :2098) reads `carePlanDetailsOpen` from `isCarePlanEmpty`
  // alone, with no nextVisitCheckItem OR-clause of its own -- the initial-
  // visit screen keeps the field OUTSIDE the disclosure (lane-4 textarea),
  // so it correctly has no reason to add one.
  const src = fs.readFileSync('src/doctor/workspace/PainWorkspace.tsx', 'utf8')
  const lineIdx = src.indexOf('const carePlanDetailsOpen =')
  assert.ok(lineIdx !== -1, 'sanity: the gate still exists')
  const line = src.slice(lineIdx, src.indexOf('\n', lineIdx))
  assert.ok(!line.includes('nextVisitCheckItem'), 'PainWorkspace.tsx must NOT gain an N-1-style nextVisitCheckItem OR-clause -- the E-1 test at :2113 is the real behavioral pin for this')
})

/* ------------------------------------------------------------------------
 * Batch 2.6 (E-6): RehabSuggestionCard's "최종 지시문(선택)" free-text box
 * moves behind a toggle (ExamSuggestionCard's own convention) -- starts
 * open only when it already holds content. Rendered here via
 * DoctorWorkspace + painRehabSuggestions in initialWorkspaceState, the same
 * seam tests/doctor-workspace.spec.mjs's "defect 7" tests already use.
 * ---------------------------------------------------------------------- */
test('Batch 2.6 E-6: an empty clinicianFinalInstruction renders a "최종 지시문 추가" toggle, not an always-open free-text input', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'x',
    synthetic: undefined,
    lbpObjectiveMotorDeficit: 'NONE',
    initialWorkspaceState: {
      painRehabSuggestions: [
        {
          id: 'lbp-empty-instruction',
          title: 'LBP 재활 제안 (지시문 없음)',
          goal: '',
          rationale: '',
          sourceFacts: [],
          contraindicationFacts: [],
          source: 'SUGGESTED',
          // ACCEPTED (not SUGGESTED): mergeLbpRehabSuggestions drops an
          // undecided SUGGESTED item that is no longer among the freshly
          // recomputed candidates on a live (non-synthetic) render -- an
          // ACCEPTED/HELD/REJECTED decision is what survives the merge
          // (see lbp-exercise-recommendation.spec.mjs and "defect 7" above).
          status: 'ACCEPTED',
          clinicianFinalInstruction: '',
        },
      ],
    },
  })
  assert.ok(html.includes('LBP 재활 제안 (지시문 없음)'), 'sanity: the candidate card itself renders')
  assert.ok(html.includes('최종 지시문 추가'), 'the collapsed toggle button renders')
  assert.ok(
    !html.includes('원장이 직접 다듬은 최종 지시문(선택)'),
    'the free-text input (identified by its placeholder) is NOT rendered while empty and untoggled',
  )
})

test('Batch 2.6 E-6: a non-empty clinicianFinalInstruction still renders the free-text input open, value visible, no toggle needed', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'x',
    synthetic: undefined,
    lbpObjectiveMotorDeficit: 'NONE',
    initialWorkspaceState: {
      painRehabSuggestions: [
        {
          id: 'lbp-filled-instruction',
          title: 'LBP 재활 제안 (지시문 있음)',
          goal: '',
          rationale: '',
          sourceFacts: [],
          contraindicationFacts: [],
          source: 'SUGGESTED',
          status: 'ACCEPTED',
          clinicianFinalInstruction: 'ROUND26 하루 1회, 통증 시 중단',
        },
      ],
    },
  })
  assert.ok(html.includes('ROUND26 하루 1회, 통증 시 중단'), 'a previously recorded instruction is never hidden behind a closed toggle')
  assert.ok(!html.includes('최종 지시문 추가'), 'no toggle button renders once the field already holds content')
})

/* ------------------------------------------------------------------------
 * Opus delta review (D-2, MEDIUM): the original `useState(suggestion.
 * clinicianFinalInstruction.trim() !== '')` only evaluates at MOUNT.
 * renderToString cannot express "the SAME card instance gets a later
 * update", so the empty-vs-filled tests above (mount-time only) cannot
 * catch this -- react-test-renderer's `.update()` on the same instance is
 * required, reproducing the two real paths this actually happens on
 * (DoctorWorkspace.tsx's `handleReloadFromConflict`, and the
 * initialRecordUpdatedAt re-seed effect at :329-338) via the SAME public
 * seam: initialWorkspaceState + initialRecordUpdatedAt updating together
 * while `workspaceState` still equals `lastSavedRef.current` (no local
 * edits), which is exactly the re-seed effect's own guard condition.
 * ---------------------------------------------------------------------- */
test('D-2: RehabSuggestionCard reveals a clinicianFinalInstruction that arrives AFTER mount on the SAME instance (conflict-reload / re-seed path)', () => {
  const suggestion = (instruction) => ({
    id: 'lbp-d2-same-instance',
    title: 'LBP 재활 제안 (D-2 same instance)',
    goal: '',
    rationale: '',
    sourceFacts: [],
    contraindicationFacts: [],
    source: 'SUGGESTED',
    status: 'ACCEPTED',
    clinicianFinalInstruction: instruction,
  })
  const findToggle = (renderer) =>
    renderer.root.findAll((node) => node.type === 'button' && node.props.children === '최종 지시문 추가')
  const findFilledInput = (renderer) =>
    renderer.root.findAll((node) => node.type === 'input' && node.props.value === 'D2-LATER-INSTRUCTION')

  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: undefined,
        lbpObjectiveMotorDeficit: 'NONE',
        resetKey: 'submission:d2-same',
        initialRecordUpdatedAt: 'd2-t1',
        initialWorkspaceState: { painRehabSuggestions: [suggestion('')] },
      }),
    )
  })
  assert.equal(findToggle(renderer).length, 1, 'sanity: mounts empty -> collapsed toggle, no input')
  assert.equal(findFilledInput(renderer).length, 0, 'sanity: nothing to show yet')

  // Same resetKey (no full reset), a LATER initialRecordUpdatedAt, and no
  // local edits in between -- the exact re-seed guard condition
  // (workspaceStateEquals(workspaceState, lastSavedRef.current)) that fires
  // both on conflict-reload and on this natural re-seed effect.
  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: undefined,
        lbpObjectiveMotorDeficit: 'NONE',
        resetKey: 'submission:d2-same',
        initialRecordUpdatedAt: 'd2-t2',
        initialWorkspaceState: { painRehabSuggestions: [suggestion('D2-LATER-INSTRUCTION')] },
      }),
    )
  })
  assert.equal(
    findFilledInput(renderer).length,
    1,
    'D-2: an instruction that arrives after mount must show in the free-text input -- the old mount-time useState kept the toggle collapsed forever',
  )
  assert.equal(findToggle(renderer).length, 0, 'the collapsed toggle is gone once the instruction is visible')
})

/* ------------------------------------------------------------------------
 * Closing review (Opus N-2, LOW): the D-2 fix above made `showInstruction`
 * re-derive on every render, but its `useState` initializer regressed from
 * `useState(hasDetail)` (ExamSuggestionCard.tsx's own pattern) to
 * `useState(false)` -- dropping the mount-time latch. Without the latch, a
 * clinician who selects an EXISTING instruction's text and deletes it hits
 * `showInstruction === false` mid-edit, unmounting the free-text input out
 * from under the cursor and replacing it with the "최종 지시문 추가"
 * toggle. This pins the latch restoring that: clearing an existing
 * instruction to '' must NOT unmount the input.
 * ---------------------------------------------------------------------- */
test('N-2: clearing an EXISTING clinicianFinalInstruction to \'\' keeps the free-text input mounted (no mid-edit unmount)', () => {
  const suggestion = {
    id: 'lbp-n2-clear',
    title: 'LBP 재활 제안 (N-2 지우기)',
    goal: '',
    rationale: '',
    sourceFacts: [],
    contraindicationFacts: [],
    source: 'SUGGESTED',
    status: 'ACCEPTED',
    clinicianFinalInstruction: 'N2-EXISTING-INSTRUCTION',
  }
  const findInput = (renderer) =>
    renderer.root.findAll(
      (node) =>
        node.type === 'input' &&
        typeof node.props.className === 'string' &&
        node.props.className.split(' ').includes('workspace__noteInput'),
    )
  const findToggle = (renderer) =>
    renderer.root.findAll((node) => node.type === 'button' && node.props.children === '최종 지시문 추가')

  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: undefined,
        lbpObjectiveMotorDeficit: 'NONE',
        resetKey: 'submission:n2-clear',
        initialWorkspaceState: { painRehabSuggestions: [suggestion] },
      }),
    )
  })
  assert.equal(findInput(renderer).length, 1, 'sanity: mounts with content -> input visible')
  assert.equal(findToggle(renderer).length, 0, 'sanity: no toggle while content is present')

  act(() => {
    findInput(renderer)[0].props.onChange({ target: { value: '' } })
  })
  assert.equal(
    findInput(renderer).length,
    1,
    'N-2: the workspace__noteInput input must still be present after clearing its text -- it must not unmount mid-edit',
  )
  assert.equal(findToggle(renderer).length, 0, 'N-2: the 최종 지시문 추가 toggle must NOT reappear while the clinician is actively editing this field')
})

/* ------------------------------------------------------------------------
 * Batch 2.6 (E-14/C-9): MicroFollowUpCard no longer renders the prior-visit
 * follow-up-target candidate list -- the revisit screen's own "이전 방문
 * 참고" block already shows the same targets (RevisitWorkspace.tsx).
 * Everything about the patient's own response is unaffected. Rendered here
 * directly (its own bundle, see package.json's test:doctor-workspace step)
 * since the component takes plain props and needs no server/fetch seam.
 * ---------------------------------------------------------------------- */
{
  const candidates = [
    { id: 'lbp_tf_forward_bend', label: 'ROUND26 목표 동작 재현', baselineText: '허리 숙이기 5초 유지', postTreatmentText: '' },
  ]

  const withCandidatesOnly = renderToString(React.createElement(MicroFollowUpCard, { candidates, response: null }))
  test('Batch 2.6 E-14: with only prior-visit candidates and no response, the candidate list is NOT rendered', () => {
    assert.ok(!withCandidatesOnly.includes('이전 방문 재평가 대상'), 'the candidate-list label is gone')
    assert.ok(!withCandidatesOnly.includes('ROUND26 목표 동작 재현'), 'the candidate label text itself does not render')
    assert.ok(!withCandidatesOnly.includes('허리 숙이기 5초 유지'), 'the candidate baseline text does not render')
  })

  const response = {
    visit_id: 'v1',
    patient_id: 'p1',
    targetRatings: [{ targetId: 'lbp_tf_forward_bend', label: 'ROUND26 목표 동작 재현', patientReportedValue: '많이 편해짐' }],
    overallChange: '좋아짐',
    newSymptomReported: false,
    newSymptomNote: '',
    adverseEffectReported: false,
    adverseEffectNote: '',
    submitted_at: '2026-01-01T00:00:00.000Z',
  }
  const withResponseAndCandidates = renderToString(React.createElement(MicroFollowUpCard, { candidates, response }))
  test('Batch 2.6 E-14: the candidate list stays absent even when a response ALSO exists, but the response itself still renders in full', () => {
    assert.ok(!withResponseAndCandidates.includes('이전 방문 재평가 대상'), 'candidate-list label still absent')
    assert.ok(!withResponseAndCandidates.includes('허리 숙이기 5초 유지'), 'candidate baseline text still absent')
    assert.ok(withResponseAndCandidates.includes('환자 응답 (오늘)'), 'the patient-response section header still renders')
    assert.ok(withResponseAndCandidates.includes('많이 편해짐'), "the patient's own reported value still renders")
    assert.ok(withResponseAndCandidates.includes('전반적 변화:'), 'the overallChange label still renders')
    assert.ok(withResponseAndCandidates.includes('좋아짐'), 'overallChange\'s value still renders')
  })

  test('Batch 2.6 E-14: the card still renders (and opens) when candidates exist even with no response -- only the list content is gone, not the card', () => {
    assert.ok(withCandidatesOnly.includes('간단 재확인(Micro Follow-up)'), 'the card itself still mounts for a candidates-only case')
  })
}

/* ==========================================================================
 * LBP v1 Batch 4 -- §14.2 (CD-2.7-1 처치 어휘 chip), §14.3 (CD-2.7-2 EMR
 * 복사 단일화), §14.4 (CD-2.7-3 치료 직후 값 기본 숨김).
 * ======================================================================= */

/* ------------------------------------------------------------------------
 * §14.3: EmrPreviewCard (참고 자료) is now view-only -- zero buttons inside
 * it. The one remaining copy path (DoctorView.tsx's 종결 section) is
 * server-mode-only UI this SSR/fetch-less harness cannot mount, so its
 * coverage lives as source-text assertions in tests/doctor.spec.mjs
 * instead (same convention this file's own header already documents for
 * every other server-mode-only DoctorView behavior). Opus delta review
 * defect #5: this comment used to claim that coverage existed when it did
 * not (tests/doctor.spec.mjs carried zero such assertions) -- see that
 * file's own "§14.3/§14.6 종결 EMR" block for the assertions that now make
 * this claim true (EMR용 복사 renders exactly once repo-wide, the 종결 call
 * site's argument key set is accounted for against PainWorkspace.tsx's own
 * call, the seed-once guard exists, and the empty-text copy guard exists).
 *
 * Opus CLOSING review C-5: the "복사는 「다음」 레인의 「종결」 섹션에서
 * 합니다." hint used to be unconditional -- but this exact render (no
 * `nextLaneFooter` prop, i.e. fixtures/preview mode, the same shape
 * DoctorView.tsx uses when `mode !== 'server'`) has no 종결 section
 * anywhere on screen, so the hint used to name a place that does not
 * exist. `copyHint` is now supplied by the caller (DoctorWorkspace.tsx),
 * derived from whether `nextLaneFooter` was passed at all -- so the FIRST
 * assertion below (no `nextLaneFooter` prop) must show NO hint, and a
 * second render WITH a `nextLaneFooter` prop must show the hint. Both
 * halves matter: the first is what actually regressed (a hint pointing
 * nowhere in every fixture/preview render), and the second confirms the
 * fix does not just delete the hint outright.
 * ---------------------------------------------------------------------- */
{
  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic }),
    )
  })
  const emrPreviewSections = renderer.root.findAll(
    (n) => typeof n.props.className === 'string' && n.props.className.split(' ').includes('workspace__emrPreview'),
  )
  test('§14.3: EmrPreviewCard (참고 자료) renders exactly once', () => {
    assert.equal(emrPreviewSections.length, 1)
  })
  test('§14.3: EmrPreviewCard has zero <button> elements inside it (copy button removed)', () => {
    const buttonsInside = emrPreviewSections[0].findAll((n) => n.type === 'button')
    assert.equal(buttonsInside.length, 0, 'no copy button (or any other button) inside the now view-only EMR preview card')
  })
  test('§14.3: EmrPreviewCard keeps its read-only textarea', () => {
    const textarea = emrPreviewSections[0].findAll((n) => n.type === 'textarea')[0]
    assert.ok(textarea && textarea.props.readOnly === true, 'the textarea stays read-only')
  })
  test('C-5: with no nextLaneFooter (fixtures/preview mode -- 종결 does not render here), EmrPreviewCard shows NO 종결-pointing hint', () => {
    const hint = emrPreviewSections[0].findAll(
      (n) => n.type === 'p' && typeof n.props.children === 'string' && n.props.children.includes('종결'),
    )
    assert.equal(hint.length, 0, 'no hint should point at a 종결 section that is not on screen in this render')
  })

  let rendererWithFooter
  act(() => {
    rendererWithFooter = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        nextLaneFooter: React.createElement('span', null, '종결 stand-in'),
      }),
    )
  })
  const emrPreviewSectionsWithFooter = rendererWithFooter.root.findAll(
    (n) => typeof n.props.className === 'string' && n.props.className.split(' ').includes('workspace__emrPreview'),
  )
  test('C-5: with a nextLaneFooter present (the same signal DoctorView.tsx gates 종결 itself on), EmrPreviewCard DOES show the 종결-pointing hint', () => {
    const hint = emrPreviewSectionsWithFooter[0].findAll(
      (n) => n.type === 'p' && typeof n.props.children === 'string' && n.props.children.includes('종결'),
    )
    assert.equal(hint.length, 1, 'the card carries a hint pointing at 종결 as the one copy location, once 종결 is actually on screen')
  })
}

/* ------------------------------------------------------------------------
 * §14.2 (CD-2.7-1, `DECISIONS.md` 2026-09-04): `interventionPerformedOrPlanned`
 * is now 8 multi-select chips + a 기타 free-text box, still composing the
 * one persisted `string` field.
 * ---------------------------------------------------------------------- */
{
  function findChipGroup(renderer) {
    return renderer.root.findAll((n) => n.props['aria-label'] === '시행/예정 처치 선택')[0]
  }
  function findChip(renderer, label) {
    return findChipGroup(renderer).findAll((n) => n.type === 'button' && n.props.children === label)[0]
  }
  function findOtherInput(renderer) {
    return renderer.root.findAll((n) => n.props['aria-label'] === '시행/예정 처치 기타')[0]
  }
  function findEmrTextarea(renderer) {
    return renderer.root.findAll(
      (n) => typeof n.props.className === 'string' && n.props.className.split(' ').includes('workspace__emrPreview__text'),
    )[0]
  }

  test('§14.2: all 8 approved intervention chips render, none pressed, 기타 empty, when interventionPerformedOrPlanned starts \'\'', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic }),
      )
    })
    const group = findChipGroup(renderer)
    const chipLabels = group.findAll((n) => n.type === 'button').map((n) => n.props.children)
    assert.deepEqual(
      chipLabels,
      ['침', '약침', '부항', '추나', '물리치료', '한약', '테이핑', '운동처방'],
      'exactly the 8 PO-approved words render, in the fixed order',
    )
    assert.ok(
      chipLabels.every((label) => findChip(renderer, label).props['aria-pressed'] === false),
      'no chip starts pressed',
    )
    assert.equal(findOtherInput(renderer).props.value, '', '기타 box starts empty')
  })

  test('§14.2: clicking chips multi-selects (복수선택) and composes the persisted string in the fixed canonical order', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:chip-multiselect',
        }),
      )
    })
    act(() => {
      findChip(renderer, '약침').props.onClick()
    })
    act(() => {
      findChip(renderer, '침').props.onClick()
    })
    assert.equal(findChip(renderer, '침').props['aria-pressed'], true)
    assert.equal(findChip(renderer, '약침').props['aria-pressed'], true)
    assert.equal(findChip(renderer, '부항').props['aria-pressed'], false)
    assert.ok(
      findEmrTextarea(renderer).props.value.includes('시행/예정 처치: 침, 약침'),
      'composed in fixed chip order (침 before 약침), not click order (약침 was clicked first)',
    )

    // Deselecting one keeps the other and drops it from the composed string.
    act(() => {
      findChip(renderer, '침').props.onClick()
    })
    assert.equal(findChip(renderer, '침').props['aria-pressed'], false)
    assert.ok(findEmrTextarea(renderer).props.value.includes('시행/예정 처치: 약침'))
    assert.ok(!findEmrTextarea(renderer).props.value.includes('시행/예정 처치: 침, 약침'))
  })

  test('§14.2: typing in 기타 composes alongside any selected chips', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:chip-plus-other',
        }),
      )
    })
    act(() => {
      findChip(renderer, '테이핑').props.onClick()
    })
    act(() => {
      findOtherInput(renderer).props.onChange({ target: { value: '얼음찜질 안내' } })
    })
    assert.ok(findEmrTextarea(renderer).props.value.includes('시행/예정 처치: 테이핑, 얼음찜질 안내'))
  })

  // MANDATORY mutation-guarded test (§14.6 "레거시 자유입력 값 보존"): a
  // value recorded BEFORE this batch (plain free text, not one of the 8
  // words) must survive verbatim into the 기타 box -- never silently
  // dropped. Verified by hand: removing `parseInterventionValue`'s
  // `otherTokens` collection (keeping only the known-chip filter) makes
  // this fail with "AssertionError [ERR_ASSERTION]: 기타 box must start
  // with the legacy value... expected false to be true" (observed,
  // reverted -- see the batch's final report for the exact message).
  test('§14.2 (mutation-guarded): a legacy free-text interventionPerformedOrPlanned value is preserved verbatim in 기타, not dropped', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:chip-legacy',
          initialWorkspaceState: {
            painFinalAssessment: {
              finalWorkingAssessment: '',
              treatmentFocus: '',
              interventionPerformedOrPlanned: '자기 전 온찜질 안내함',
              immediateRetestTarget: '',
              recordedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
      )
    })
    const group = findChipGroup(renderer)
    assert.ok(
      group.findAll((n) => n.type === 'button' && n.props['aria-pressed'] === true).length === 0,
      '기타 box must start with the legacy value -- sanity: no chip is pressed for it',
    )
    assert.equal(
      findOtherInput(renderer).props.value,
      '자기 전 온찜질 안내함',
      'the legacy free-text value is preserved verbatim in the 기타 box, not dropped',
    )
    assert.ok(findEmrTextarea(renderer).props.value.includes('시행/예정 처치: 자기 전 온찜질 안내함'), 'and still reaches the EMR text unchanged')
  })

  // Opus delta review defect #3: the chip group used to sit inside a
  // <label>, whose "labeled control" (the first labelable descendant --
  // <button> qualifies, per the HTML spec) was the 침 chip -- so tapping
  // the "시행/예정 처치" caption (or any empty space inside the label)
  // toggled 침 unintentionally on a touch screen. Verified by hand as the
  // mandatory mutant: reverting the wrapper back to <label> makes this fail
  // with "AssertionError [ERR_ASSERTION]: the 시행/예정 처치 field wrapper
  // (or any of its ancestors) must never be a <label> element... 1 !== 0"
  // (observed, then reverted).
  test('§14.2 (mutation-guarded, Opus delta review defect #3): the 시행/예정 처치 chip group is never nested inside a <label> (would make the caption toggle 침 on tap)', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic }),
      )
    })
    const group = findChipGroup(renderer)
    const labelAncestors = []
    let node = group.parent
    while (node) {
      if (node.type === 'label') labelAncestors.push(node)
      node = node.parent
    }
    assert.equal(
      labelAncestors.length,
      0,
      'the 시행/예정 처치 field wrapper (or any of its ancestors) must never be a <label> element',
    )
  })

  // Opus delta review defect #9: a plain <input type="text"> runs the
  // browser's value-sanitization algorithm on every render, stripping
  // newlines -- so a legacy free-text value recorded before this batch that
  // contains a newline would lose it the moment the clinician typed even
  // one more character. Restored as a <textarea> so newlines survive.
  // Verified by hand as the mandatory mutant: reverting the element back to
  // <input type="text"> makes the `n.type === 'textarea'` assertion below
  // fail with "AssertionError [ERR_ASSERTION]: the 기타 field must be a
  // <textarea>, not an <input>, so a legacy value's newline survives
  // editing... 'input' !== undefined" (observed, then reverted).
  test('§14.2 (mutation-guarded, Opus delta review defect #9): the 기타 field is a <textarea>, so a legacy value containing a newline is not silently mangled', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:chip-legacy-newline',
          initialWorkspaceState: {
            painFinalAssessment: {
              finalWorkingAssessment: '',
              treatmentFocus: '',
              interventionPerformedOrPlanned: '침\n부항 후 호전',
              immediateRetestTarget: '',
              recordedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
      )
    })
    const otherField = findOtherInput(renderer)
    assert.equal(
      otherField.type,
      'textarea',
      'the 기타 field must be a <textarea>, not an <input>, so a legacy value\'s newline survives editing',
    )
    assert.ok(
      otherField.props.value.includes('\n'),
      'the legacy value\'s newline is preserved in the field\'s own value (parseInterventionValue never strips it)',
    )
    assert.equal(otherField.props.value, '침\n부항 후 호전', 'the 기타 field starts with the full legacy value, newline intact')
  })
}

/* ------------------------------------------------------------------------
 * §14.4 (CD-2.7-3, `DECISIONS.md` 2026-09-04): 치료 직후 값 defaults
 * hidden behind a "직후 값 기록" toggle; an already-recorded value starts
 * open; clearing it back to '' must never unmount the input mid-edit
 * (Batch 2.6 N-2 regression pattern, same idiom as this file's other N-2
 * pin above).
 * ---------------------------------------------------------------------- */
{
  const seededTarget = { id: 'pain_intensity', label: '통증 강도', baseline: '', postTreatmentValue: '' }
  // 2026-09-06 (플로우 정렬 3/5): 통증 강도의 직후값은 텍스트 <input>이 아니라
  // 0~10 NRS 버튼 그룹이다. §14.4의 규칙(토글 뒤 숨김 / 값 있으면 열림 / 비워도
  // 언마운트 없음)은 그대로이고, 대상이 <input>에서 role=group으로 바뀌었을 뿐.
  const findToggle = (renderer) =>
    renderer.root.findAll(
      (n) =>
        n.type === 'button' &&
        typeof n.props.className === 'string' &&
        n.props.className.split(' ').includes('workspace__followUp__postTreatmentToggle'),
    )
  const findPostTreatmentNrs = (renderer) =>
    renderer.root.findAll((n) => n.type === 'div' && n.props.role === 'group' && n.props['aria-label'] === '통증 강도 치료 직후 값')
  const findPostTreatmentInput = (renderer) =>
    renderer.root.findAll((n) => n.type === 'input' && n.props['aria-label'] === '통증 강도 치료 직후 값')
  const nrsBtn = (renderer, groupLabel, n) =>
    renderer.root.findAll((x) => x.type === 'button' && x.props['aria-label'] === `${groupLabel} ${n}`)[0]

  test('§14.4: 치료 직후 값 starts hidden behind a toggle when no value is recorded yet (NRS group absent too)', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:posttx-hidden',
          initialWorkspaceState: { painFollowUpTargets: [seededTarget] },
        }),
      )
    })
    assert.equal(findToggle(renderer).length, 1, 'sanity: the toggle renders')
    assert.equal(findPostTreatmentNrs(renderer).length, 0, '직후값 NRS 그룹은 아직 렌더되지 않는다')
    assert.equal(findPostTreatmentInput(renderer).length, 0, '직후값 텍스트 input도 없다(숫자 대상)')
  })

  test('§14.4: an already-recorded 치료 직후 값 starts open — NRS 그룹이 바로 렌더되고 그 값이 눌려 있다', () => {
    const html = renderToString(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        initialWorkspaceState: { painFollowUpTargets: [{ ...seededTarget, postTreatmentValue: '3' }] },
      }),
    )
    assert.ok(!html.includes('workspace__followUp__postTreatmentToggle'), 'no hidden-toggle button when a value already exists')
    assert.ok(/role="group" aria-label="통증 강도 치료 직후 값"/.test(html), 'NRS 그룹이 바로 렌더된다')
    assert.ok(/<button[^>]*aria-pressed="true"[^>]*aria-label="통증 강도 치료 직후 값 3"/.test(html), "'3'이 눌린 상태")
    assert.ok(!/<input[^>]*aria-label="통증 강도 치료 직후 값"/.test(html), '숫자 값이면 텍스트 input은 없다')
  })

  test('§14.4 (N-2 PRIMARY, NRS): 값으로 자동 열린 직후값을 버튼 재탭으로 비워도 그룹이 언마운트되지 않고 토글도 안 돌아온다', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:posttx-n2-primary',
          initialWorkspaceState: { painFollowUpTargets: [{ ...seededTarget, postTreatmentValue: '5' }] },
        }),
      )
    })
    assert.equal(findPostTreatmentNrs(renderer).length, 1, 'sanity: 값이 있어 자동 열림')
    assert.equal(findToggle(renderer).length, 0, 'sanity: 토글은 없다')
    act(() => {
      nrsBtn(renderer, '통증 강도 치료 직후 값', '5').props.onClick()
    })
    assert.equal(findPostTreatmentNrs(renderer).length, 1, 'N-2: 비운 뒤에도 그룹이 남아 있다')
    assert.equal(findToggle(renderer).length, 0, '토글이 다시 나타나지 않는다')
    assert.equal(nrsBtn(renderer, '통증 강도 치료 직후 값', '5').props['aria-pressed'], false, "'5'는 해제됐다")
  })

  test('§14.4: clicking "직후 값 기록" reveals the NRS group', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:posttx-open',
          initialWorkspaceState: { painFollowUpTargets: [seededTarget] },
        }),
      )
    })
    act(() => {
      findToggle(renderer)[0].props.onClick()
    })
    assert.equal(findToggle(renderer).length, 0, 'the toggle is gone once opened')
    assert.equal(findPostTreatmentNrs(renderer).length, 1, 'NRS 그룹이 렌더된다')
  })

  test('§14.4 (N-2, NRS): 토글로 열고 5를 누르고 다시 5를 눌러 비워도 그룹은 남고 토글은 안 돌아온다', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:posttx-n2',
          initialWorkspaceState: { painFollowUpTargets: [seededTarget] },
        }),
      )
    })
    act(() => { findToggle(renderer)[0].props.onClick() })
    act(() => { nrsBtn(renderer, '통증 강도 치료 직후 값', '5').props.onClick() })
    assert.equal(nrsBtn(renderer, '통증 강도 치료 직후 값', '5').props['aria-pressed'], true, 'sanity: 5가 눌렸다')
    act(() => { nrsBtn(renderer, '통증 강도 치료 직후 값', '5').props.onClick() })
    assert.equal(findPostTreatmentNrs(renderer).length, 1, 'N-2: 비워도 그룹이 남는다')
    assert.equal(findToggle(renderer).length, 0, '토글이 돌아오지 않는다')
  })

  // 텍스트 경로의 N-2 보호는 비NRS 통증 대상(움직임·기능)으로 그대로 유지한다.
  const textTarget = { id: 'movement_function', label: '움직임·기능', baseline: '', postTreatmentValue: '' }
  const findTextPostInput = (renderer) =>
    renderer.root.findAll((n) => n.type === 'input' && n.props['aria-label'] === '움직임·기능 치료 직후 값')
  test('§14.4 (N-2, 텍스트 경로 유지): 비NRS 대상은 예전처럼 <input>이고, 타이핑 후 비워도 언마운트되지 않는다', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:posttx-text-n2',
          initialWorkspaceState: { painFollowUpTargets: [textTarget] },
        }),
      )
    })
    act(() => { findToggle(renderer)[0].props.onClick() })
    act(() => { findTextPostInput(renderer)[0].props.onChange({ target: { value: '좋아짐' } }) })
    act(() => { findTextPostInput(renderer)[0].props.onChange({ target: { value: '' } }) })
    assert.equal(findTextPostInput(renderer).length, 1, 'N-2: 텍스트 input이 남아 있다')
    assert.equal(findToggle(renderer).length, 0, '토글이 돌아오지 않는다')
  })

  // ---- 2026-09-06 플로우 정렬 3/5: NRS 기준값 ----
  test('NRS: 통증 강도 기준값은 0~10 버튼 11개로 렌더되고, 값이 숫자면 텍스트 input은 없다', () => {
    const html = renderToString(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        initialWorkspaceState: { painFollowUpTargets: [{ ...seededTarget, baseline: '7' }] },
      }),
    )
    const btns = [...html.matchAll(/aria-label="통증 강도 오늘 기준값 (\d+)"/g)].map((m) => m[1])
    assert.deepEqual(btns, ['0','1','2','3','4','5','6','7','8','9','10'], '0~10 버튼 11개, 순서대로')
    assert.ok(/<button[^>]*aria-pressed="true"[^>]*aria-label="통증 강도 오늘 기준값 7"/.test(html), "'7'이 눌려 있다")
    assert.ok(!/<input[^>]*aria-label="통증 강도 오늘 기준값"/.test(html), '숫자 값이면 텍스트 input 없음')
    assert.ok(html.includes('통증 강도 (0~10)'), '라벨에 척도를 표시한다')
  })

  test('NRS: 옛 자유값(7/10)은 버튼 아래 텍스트 input에 그대로 남는다 — 조용히 버리지 않는다', () => {
    const html = renderToString(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        initialWorkspaceState: { painFollowUpTargets: [{ ...seededTarget, baseline: '7/10' }] },
      }),
    )
    assert.ok(/role="group" aria-label="통증 강도 오늘 기준값"/.test(html), '버튼 그룹은 있다')
    assert.ok(/<input[^>]*aria-label="통증 강도 오늘 기준값"[^>]*value="7\/10"/.test(html), '옛 값을 담은 input이 함께 있다')
    assert.ok(!/aria-pressed="true"[^>]*aria-label="통증 강도 오늘 기준값/.test(html), '숫자가 아니라 눌린 버튼은 없다')
  })

  test('NRS: 비NRS 통증 대상(움직임·기능)과 한약 대상(수면)은 예전처럼 텍스트 input — 바이트 단위 불변', () => {
    const pain = renderToString(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        initialWorkspaceState: { painFollowUpTargets: [textTarget] },
      }),
    )
    assert.ok(/<input[^>]*aria-label="움직임·기능 오늘 기준값"/.test(pain), '비NRS 통증 대상은 텍스트 input')
    assert.ok(!pain.includes('workspace__nrs'), 'NRS 마크업이 없다')
    const herbal = renderToString(
      React.createElement(DoctorWorkspace, {
        payload: HERBAL_SCENARIO_1.payload,
        synthetic: HERBAL_SCENARIO_1.synthetic,
        initialWorkspaceState: { herbalFollowUpTargets: [{ id: 'sleep', label: '수면', baseline: '', postTreatmentValue: '' }] },
      }),
    )
    assert.ok(/<input[^>]*aria-label="수면 오늘 기준값"/.test(herbal), '한약 대상은 텍스트 input')
    assert.ok(!herbal.includes('workspace__nrs'), '한약 화면에 NRS 마크업이 없다')
  })

  test('NRS: 기준값 버튼을 누르면 문자열 값이 쓰이고, 같은 버튼을 다시 누르면 비워진다', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, {
          payload: PAIN_SCENARIO_1.payload,
          synthetic: PAIN_SCENARIO_1.synthetic,
          resetKey: 'submission:nrs-baseline',
          initialWorkspaceState: { painFollowUpTargets: [seededTarget] },
        }),
      )
    })
    act(() => { nrsBtn(renderer, '통증 강도 오늘 기준값', '7').props.onClick() })
    assert.equal(nrsBtn(renderer, '통증 강도 오늘 기준값', '7').props['aria-pressed'], true)
    assert.equal(nrsBtn(renderer, '통증 강도 오늘 기준값', '6').props['aria-pressed'], false)
    act(() => { nrsBtn(renderer, '통증 강도 오늘 기준값', '7').props.onClick() })
    assert.equal(nrsBtn(renderer, '통증 강도 오늘 기준값', '7').props['aria-pressed'], false, '재탭으로 비움')
  })

  test('NRS 소스 계약: 저장 타입은 그대로 문자열이고 EMR/이어받기 경로는 건드리지 않았다', () => {
    const fa = fs.readFileSync('src/doctor/workspace/finalAssessment.ts', 'utf8')
    assert.ok(/baseline: string\n\s*postTreatmentValue: string/.test(fa), 'FollowUpTarget 타입 불변')
    assert.ok(/PAIN_NRS_TARGET_IDS[^\n]*new Set\(\['pain_intensity'\]\)/.test(fa))
    const emr = fs.readFileSync('src/doctor/workspace/emrPreview.ts', 'utf8')
    assert.ok(!/NRS|nrs/.test(emr), 'emrPreview는 모른다 — "기준 7"로 그대로 나간다')
    const picker = fs.readFileSync('src/doctor/workspace/FollowUpTargetPicker.tsx', 'utf8')
    assert.ok(/legacyInput=\{baselineLegacy \? baselineInput : null\}/.test(picker), '옛 자유값 보존 경로가 코드에 있다')
  })
}

console.log(`\n${passed} doctor-workspace assertions passed.`)

// ===========================================================================
// 2026-09-05: 운동 단계 카드 + C층 추정 준비조건 행 (PainWorkspace.tsx LbpStageCard)
// ===========================================================================

test('stage card: a live LBP record renders the 운동 단계 card with the suggestion (PAIN_SCENARIO_1 = mild/1_3m -> 3단계) and a 1-tap "제안대로 확정" button; nothing is pressed while unconfirmed', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({}))
  assert.ok(html.includes('운동 단계'), 'card heading renders')
  assert.ok(html.includes('3단계 (제안)'), 'the suggested stage is marked on its own button')
  assert.ok(html.includes('제안대로 확정'), 'one-tap confirm exists')
  const stageGroup = html.slice(html.indexOf('aria-label="운동 단계 확정"'), html.indexOf('aria-label="운동 단계 확정"') + 1200)
  assert.ok(!/aria-pressed="true"/.test(stageGroup), 'no stage button is pressed before the clinician confirms')
  assert.ok(html.includes('workspace__stageBtn'), 'the stage buttons use their own class, not the candidate adoptBtn class')
})

test('stage card: a SYNTHETIC preview record does NOT render the stage card (no live payload -> no suggestion)', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(!html.includes('aria-label="운동 단계 확정"'), 'stage card absent on synthetic preview')
})

test('stage card: confirmed 0단계 -> guidance text, a 1-tap "1단계로 올리기", the exercise block collapses to the STAGE_0 message, and no awaiting-capability list renders', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({ lbpConfirmedStage: 0, painFollowUpTargets: walkingFollowUpTarget }))
  assert.ok(html.includes('1단계로 올리기'), 'raising is one tap')
  assert.ok(html.includes('능동 운동을 처방하지 않습니다'), 'stage-0 guidance renders')
  assert.ok(html.includes('0단계(보호/안정) 확정'), 'exercise block shows the STAGE_0 blocked message')
  assert.ok(!html.includes('확인하면 시작 가능'), 'no awaiting-capability list at stage 0')
  const stageGroup = html.slice(html.indexOf('aria-label="운동 단계 확정"'), html.indexOf('aria-label="운동 단계 확정"') + 1200)
  assert.ok(/<button[^>]*aria-pressed="true"[^>]*>0단계/.test(stageGroup), 'the 0단계 button is pressed')
})
test('stage card: source wiring — DoctorWorkspace persists ONLY the confirmed stage (setter writes it through withRegionClinical, which maps lbp → lbpConfirmedStage), and emrPreview.ts (pilot-frozen) does not read it yet', () => {
  // 부위 팩 일반화(2026-09-06, R2): the setter goes through the region
  // adapter. Two links are pinned so the guarantee is the same as before:
  // (1) DoctorWorkspace writes ONLY `{ confirmedStage: next }` via
  // setRegionClinical, (2) regionClinicalState.ts maps that patch, for the
  // LBP region, onto the old `lbpConfirmedStage` field (no second storage
  // path for LBP).
  const dwSrc = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')
  assert.ok(/onSetConfirmedStage=\{setRegionClinical \? \(next\) => setRegionClinical\(\{ confirmedStage: next \}\) : undefined\}/.test(dwSrc), 'setter writes the confirmed stage field only')
  assert.ok(/const setRegionClinical = regionPack\s*\? \(patch: Partial<RegionClinicalRecord>\) => setWorkspaceState\(\(s\) => withRegionClinical\(s, regionPack\.region, patch\)\)/.test(dwSrc), 'setRegionClinical is withRegionClinical on the driving region')
  const adapterSrc = fs.readFileSync('src/doctor/workspace/regionClinicalState.ts', 'utf8')
  assert.ok(/if \(patch\.confirmedStage !== undefined\) next\.lbpConfirmedStage = patch\.confirmedStage/.test(adapterSrc), 'for LBP the adapter writes the old lbpConfirmedStage field')
  assert.ok(/if \(key === 'lbp'\) continue/.test(adapterSrc), 'regionClinical never carries an lbp key (one storage path for LBP)')
  assert.ok(dwSrc.includes('suggestExerciseStage(stageInputFromPayload(regionPack.region, payload))'), 'suggestion recomputed from the payload every render')
  assert.ok(!/lbpStageSuggestion:|regionStageSuggestion:/.test(dwSrc), 'the suggestion is never written into workspace state')
  const emrSrc = fs.readFileSync('src/doctor/workspace/emrPreview.ts', 'utf8')
  assert.ok(!emrSrc.includes('lbpConfirmedStage') && !emrSrc.includes('confirmedStage'), 'emrPreview.ts is frozen during the pilot (HANDOFF 22) — stage reaches storage, not EMR text, this batch')
  const revisitSrc = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
  assert.ok(!revisitSrc.includes('StageCard') && !revisitSrc.includes('PainExerciseSection'), 'RevisitWorkspace has no exercise section at all, so no stage card there either (documented gap, not an omission)')
})


// ===========================================================================
// 2026-09-05: 준비조건 게이트 제거 — 화면 검증
// ===========================================================================

test('게이트 제거: 준비조건을 하나도 누르지 않은 라이브 LBP 기록에서 후보 카드가 실제로 렌더된다 (예전에는 0개였다)', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({ painFollowUpTargets: walkingFollowUpTarget }))
  const cardCount = (html.match(/class="workspace__candidateCard /g) ?? []).length
  assert.ok(cardCount > 0, `탭 0회로 후보 카드가 떠야 한다 (found ${cardCount})`)
  assert.ok(html.includes('재활/운동 제안'), '운동 섹션이 렌더된다')
})

test('게이트 제거: 준비조건 확인 UI가 화면에서 완전히 사라졌다', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({ painFollowUpTargets: walkingFollowUpTarget }))
  for (const gone of ['확인하면 시작 가능', '확인함/지금은 안 됨으로 표시한 준비 조건', '확정 단계에서 자동 추정된 준비 조건', '지금은 안 됨', '미확인']) {
    assert.ok(!html.includes(gone), `"${gone}" 가 남아 있으면 안 된다`)
  }
  assert.ok(!html.includes('보조도구 포함, 안전하게 걸을 수 있음'), 'capability 라벨 자체가 사라졌다')
})

test('대체 경로: 후보 카드에 "시작 기준"이 첫 근거 소견으로 렌더된다 (원장이 육안 판단할 근거)', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({ painFollowUpTargets: walkingFollowUpTarget }))
  const factsIdx = html.indexOf('근거 소견')
  assert.ok(factsIdx !== -1, '근거 소견 목록이 렌더된다')
  const chunk = html.slice(factsIdx, factsIdx + 1200)
  assert.ok(chunk.includes('시작 기준:'), '시작 기준 줄이 있다')
  const startIdx = chunk.indexOf('시작 기준:')
  const doseIdx = chunk.indexOf('시작 용량:')
  assert.ok(startIdx !== -1 && doseIdx !== -1 && startIdx < doseIdx, '시작 기준이 시작 용량보다 먼저 읽힌다')
  assert.ok(chunk.includes('쉬운 단계로 시작하려면:'), '쉬운 단계가 항상 보인다')
  assert.ok(chunk.includes('중단·재검토 기준:'), '중단 기준은 그대로 유지')
})

test('신경 상태 미기록 -> 빈 목록 대신 무엇을 하면 되는지 한 줄이 뜬다', () => {
  const html = renderWith(PAIN_SCENARIO_1, {
    synthetic: undefined,
    lbpObjectiveMotorDeficit: undefined,
    initialWorkspaceState: { painFollowUpTargets: walkingFollowUpTarget },
  })
  assert.ok(html.includes('신경학적 이상 소견'), '해소 방법을 안내한다')
  assert.ok(html.includes('"이상 없음"으로 가정하지 않습니다') || html.includes('&quot;이상 없음&quot;으로 가정하지 않습니다'), 'RF-1 원칙을 화면에 명시한다')
})

test('신경 상태 기록됨 -> 그 안내는 뜨지 않는다 (공허하지 않은 단언)', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({ painFollowUpTargets: walkingFollowUpTarget }))
  assert.ok(!html.includes('신경학적 이상 소견(레인2'), '해소된 뒤에는 안내가 사라진다')
})

test('소스 배선: PainWorkspace/DoctorWorkspace에 준비조건 경로가 한 줄도 남지 않았다', () => {
  const pw = fs.readFileSync('src/doctor/workspace/PainWorkspace.tsx', 'utf8')
  const dw = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')
  const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const [name, src] of [['PainWorkspace', pw], ['DoctorWorkspace', dw]]) {
    const code = codeOnly(src)
    assert.ok(!/lbpConfirmedCapabilities|lbpDeniedCapabilities|onSetLbpCapabilityStatus|LbpAwaitingCapabilitySection/.test(code), `${name} 코드에 준비조건 경로 잔존`)
  }
  assert.ok(/준비조건/.test(pw), '왜 없앴는지는 주석으로 남아 있어야 한다 (조용한 삭제 금지)')
  assert.ok(fs.existsSync('src/doctor/workspace/lbpCapabilityLayer.ts') === false, '층 모듈은 삭제됐다')
})


test('단계 카드 안내문이 현재 동작과 일치한다 — 제거된 준비조건 추정을 더 이상 설명하지 않는다', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({ painFollowUpTargets: walkingFollowUpTarget }))
  // 이 배치에서 실제로 낡은 채로 배포될 뻔한 문구들 — 화면 어디에도 없어야 한다.
  for (const stale of ['자동 추정', '준비조건은 단계에서', '준비조건을 하나씩', '걷기·균형·스스로 멈춤']) {
    assert.ok(!html.includes(stale), `낡은 안내 문구가 남아 있다: "${stale}"`)
  }
  assert.ok(html.includes('시작 기준'), '대신 새 근거(시작 기준)를 가리켜야 한다')
})


// ===========================================================================
// 2026-09-06: 자유입력 접기 — 삭제 아님. 세 카드 모두 "필요할 때 입력" 뒤로.
// ===========================================================================

/** `label` 텍스트를 감싸는 가장 가까운 <details ...> 시작 태그를 돌려준다(없으면 null). */
function enclosingDetailsTag(html, label) {
  const i = html.indexOf(label)
  if (i === -1) return undefined
  const d = html.lastIndexOf('<details', i)
  if (d === -1) return null
  const close = html.indexOf('>', d)
  const tag = html.slice(d, close + 1)
  // 그 details가 label 앞에서 이미 닫혔으면 label은 그 밖이다
  const endBetween = html.slice(d, i).includes('</details>')
  return endBetween ? null : tag
}

test('접기: 통증 최종판단 — 최종 임상 판단·즉시 재검 대상이 비어 있으면 닫힌 secondary 안에 있고, 처치 chip만 밖에 있다', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({}))
  for (const label of ['최종 임상 판단', '즉시 재검 대상', '치료 초점']) {
    const tag = enclosingDetailsTag(html, `<span>${label}</span>`)
    assert.ok(tag && tag.includes('workspace__finalAssessment__secondary'), `${label} 는 secondary disclosure 안에 있어야 한다`)
    assert.ok(!/\sopen(=|>|\s)/.test(tag), `${label} 의 disclosure는 비어 있을 때 닫혀 있어야 한다: ${tag}`)
  }
  assert.ok(html.includes('최종 임상 판단 · 즉시 재검 대상 · 치료 초점 — 필요할 때 입력'), 'summary가 세 라벨을 모두 이름 붙인다')
  const chipTag = enclosingDetailsTag(html, '<span>시행/예정 처치</span>')
  assert.ok(chipTag === null || !chipTag.includes('workspace__finalAssessment__secondary'), '처치 chip은 접히지 않는다')
})

test('접기: 최종 임상 판단에 글이 있으면 그 disclosure는 열려서 렌더된다 (쓴 것이 숨겨지지 않는다)', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({
    painFinalAssessment: { finalWorkingAssessment: 'ROUND27 판단 문구', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-01-01T00:00:00.000Z' },
  }))
  const tag = enclosingDetailsTag(html, '<span>최종 임상 판단</span>')
  assert.ok(tag && /\sopen(=|>|\s)/.test(tag), `내용이 있으면 열려야 한다: ${tag}`)
  assert.ok(html.includes('ROUND27 판단 문구'))
})

test('접기: Care Plan — 집에서 할 운동·환자 안내문은 바로 보이고, 치료 목표·재활 목표·주의는 secondary 안에 있다', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({
    painCarePlan: { currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: 'ROUND27 운동', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: '', recordedAt: '2026-01-01T00:00:00.000Z' },
  }))
  assert.ok(html.includes('관리 계획 · 다음 재평가'), 'sanity: 관리 계획 disclosure가 렌더된다(homeActionPlan으로 열림)')
  const primaryTag = enclosingDetailsTag(html, '<span>집에서 할 행동/운동 계획</span>')
  assert.ok(!primaryTag || !primaryTag.includes('workspace__finalAssessment__secondary'), '집에서 할 운동은 카드의 secondary 안에 있지 않다')
  const instrTag = enclosingDetailsTag(html, '<span>환자 안내문</span>')
  assert.ok(!instrTag || !instrTag.includes('workspace__finalAssessment__secondary'), '환자 안내문도 secondary 안에 있지 않다')
  for (const label of ['현재 치료 목표', '재활 목표', '주의/당분간 피할 활동']) {
    const tag = enclosingDetailsTag(html, `<span>${label}</span>`)
    assert.ok(tag && tag.includes('workspace__finalAssessment__secondary'), `${label} 는 secondary 안에 있어야 한다`)
    assert.ok(!/\sopen(=|>|\s)/.test(tag), `${label} 의 secondary는 비어 있을 때 닫혀 있다`)
  }
  assert.ok(html.includes('현재 치료 목표 · 재활 목표 · 주의/당분간 피할 활동 — 필요할 때 입력'))
})

test('접기: 레인4 다음 방문 확인 메모 — 비어 있으면 닫힌 disclosure 안, 값이 있으면 열림. 값은 계속 NextActionCard로 읽힌다', () => {
  const empty = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({}))
  const t0 = enclosingDetailsTag(empty, 'aria-label="다음 방문 확인 메모"')
  assert.ok(t0 && !/\sopen(=|>|\s)/.test(t0), `비어 있으면 닫힘: ${t0}`)
  assert.ok(empty.includes('다음 방문 확인 메모 — 필요할 때 입력'), 'summary 문구')
  const filled = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({
    painCarePlan: { currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: '', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: 'ROUND27 메모', recordedAt: '2026-01-01T00:00:00.000Z' },
  }))
  const t1 = enclosingDetailsTag(filled, 'aria-label="다음 방문 확인 메모"')
  assert.ok(t1 && /\sopen(=|>|\s)/.test(t1), `값이 있으면 열림: ${t1}`)
})

test('접기 소스 계약: 래치 훅이 존재하고 세 접힘 모두 그것을 쓴다 — 파생식 open={hasContent}(N-2 재발 경로)는 남아 있지 않다', () => {
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const fa = fs.readFileSync('src/doctor/workspace/FinalAssessmentCard.tsx', 'utf8')
  const cp = fs.readFileSync('src/doctor/workspace/CarePlanCard.tsx', 'utf8')
  const pw = fs.readFileSync('src/doctor/workspace/PainWorkspace.tsx', 'utf8')
  const faCode = stripComments(fa), cpCode = stripComments(cp), pwCode = stripComments(pw)
  assert.ok(/export function useOpenOnceContent\(hasContent: boolean\): boolean/.test(faCode))
  assert.ok(/if \(hasContent && !latched\) setLatched\(true\)/.test(faCode), '래치는 true로만 움직인다')
  // 주석은 왜 파생식을 안 쓰는지 설명하느라 그 문자열을 언급한다 — 금지되는 것은 코드다.
  for (const [name, code] of [['FinalAssessmentCard', faCode], ['CarePlanCard', cpCode], ['PainWorkspace', pwCode]]) {
    assert.ok(!/open=\{hasContent\}/.test(code), `${name} 코드에 파생식 open={hasContent}가 남아 있지 않다`)
  }
  assert.ok(/SecondaryFields/.test(cp) && /from '\.\/FinalAssessmentCard'/.test(cp), 'CarePlanCard는 같은 SecondaryFields를 재사용한다')
  assert.ok(/useOpenOnceContent\(carePlan\.nextVisitCheckItem\.trim\(\) !== ''\)/.test(pw), '레인4 메모도 같은 래치')
  // 헤르발(한약) 카드는 이번 배치에서 건드리지 않았다 — 구조화 공급원이 없어 접으면 원장이 볼 것이 없다.
  const herbalIdx = fa.indexOf('export function HerbalFinalAssessmentCard')
  const herbalBody = fa.slice(herbalIdx, herbalIdx + 2500)
  assert.ok(herbalBody.includes("label: '최종 변증·병기'") && herbalBody.includes('primary'), '한약 판단 3칸은 여전히 primary')
})


// ===========================================================================
// 2026-09-06 플로우 정렬 2/5: 레인1 안전 블록 — CLEAR면 접힘, 아니면 열림
// ===========================================================================

test('레인1 접기: 합집합 CLEAR인 LBP 기록에서 안전 블록은 닫힌 disclosure 안에 있고, 요약 줄이 부위를 이름 붙인다', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({}))
  const tag = enclosingDetailsTag(html, 'workspace__block--safety')
  assert.ok(tag && tag.includes('doctor__lane1Collapse'), `안전 블록은 lane1 disclosure 안에 있어야 한다: ${tag}`)
  assert.ok(!/\sopen(=|>|\s)/.test(tag), `CLEAR면 닫혀 있어야 한다: ${tag}`)
  assert.ok(html.includes('안전 확인 — 전 부위 안전 (허리) · 펼쳐서 상세'), '요약 줄이 CLEAR와 부위(허리)를 말한다')
  // 접혀도 내용은 그대로 렌더된다(삭제 아님) — 기존 P0-1 단언들이 그대로 통과하는 이유
  assert.ok(html.includes('안전 확인 — 허리(LBP)'), 'LBP 패널 내용은 여전히 있다')
  assert.ok(html.includes('추가 권장 검사'), '권장 검사 목록도 그대로 있다(접힘 안)')
})

test('레인1 접기: URGENT(신경 소견 SEVERE)면 래퍼 없이 안전 블록이 예전처럼 직접 렌더된다 — 요약 줄 0px 추가', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({}, { lbpObjectiveMotorDeficit: 'SEVERE_OR_PROGRESSIVE' }))
  assert.ok(!html.includes('doctor__lane1Collapse'), '비CLEAR면 disclosure 래퍼 자체가 없다')
  assert.ok(html.includes('workspace__block--safety'), '안전 블록은 직접 렌더된다')
  assert.ok(!html.includes('전 부위 안전'), 'CLEAR 문구는 나오지 않는다')
  const count = html.split('workspace__block--safety').length - 1
  assert.equal(count, 1, '두 분기 중 정확히 하나만 렌더된다')
})

test('레인1 접기: CommonSafetyBanner와 <h2>안전 확인</h2>은 disclosure 바깥에 그대로 있다 (접히지 않는다)', () => {
  const html = renderWith(PAIN_SCENARIO_1, lbpLiveExtraProps({}))
  const h2 = html.indexOf('id="lane1-h2"')
  const det = html.indexOf('doctor__lane1Collapse')
  assert.ok(h2 !== -1 && det !== -1 && h2 < det, 'h2가 disclosure보다 앞에 있다')
  const h2Tag = enclosingDetailsTag(html, 'id="lane1-h2"')
  assert.ok(!h2Tag || !h2Tag.includes('doctor__lane1Collapse'), 'h2는 disclosure 안이 아니다')
})

test('레인1 접기 소스 계약: 판정은 lane1Summary.status 하나(새 임상 계산 없음), 열림은 래치', () => {
  const dw = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')
  assert.ok(/const lane1EverNonClear = useOpenOnceContent\(lane1Summary\.status !== 'CLEAR'\)/.test(dw))
  assert.ok(/anySafetyRegionApplicable && lane1Collapsible && \(/.test(dw) && /anySafetyRegionApplicable && !lane1Collapsible && \(/.test(dw), '두 분기가 상호배타')
  // 좌측 요약 chip과 같은 신호 — 두 화면이 어긋날 수 없다
  assert.ok(/lane1=\{lane1Summary\}/.test(dw), 'aside도 같은 lane1Summary를 받는다')
})

// ---------- 점프 내비(안 A, PO "추천에 따라 진행") ----------
// 운동 후보가 4화면 아래라는 실측 문제의 최소 해법: 레인 헤딩으로 가는 버튼.
// 존재하는 앵커만 노출한다(한약에는 운동 섹션이 없으므로 4개).
{
  const navButtons = (html) => [...html.matchAll(/class="doctor__laneNav__btn" data-target="([^"]+)"[^>]*>([^<]*)</g)].map((m) => ({ target: m[1], label: m[2] }))
  const pain = render(PAIN_SCENARIO_1)
  const painNav = navButtons(pain)
  test('점프 내비: 통증 화면은 안전·확인·판단·처치·운동·다음 5개 버튼', () => {
    assert.deepEqual(painNav.map((b) => b.label), ['안전', '확인', '판단·처치', '운동', '다음'])
  })
  test('점프 내비: 통증 화면의 모든 버튼 대상 id가 실제로 렌더된다 (죽은 링크 없음)', () => {
    for (const b of painNav) assert.ok(pain.includes(` id="${b.target}"`), `missing anchor ${b.target}`)
  })
  const herbal = render(HERBAL_SCENARIO_1)
  const herbalNav = navButtons(herbal)
  test('점프 내비: 한약 화면은 운동 버튼 없이 4개', () => {
    assert.deepEqual(herbalNav.map((b) => b.label), ['안전', '확인', '판단·처치', '다음'])
    assert.ok(!herbal.includes('id="exercise-h3"'))
  })
  test('점프 내비: 한약 화면의 모든 버튼 대상 id가 실제로 렌더된다', () => {
    for (const b of herbalNav) assert.ok(herbal.includes(` id="${b.target}"`), `missing anchor ${b.target}`)
  })
  const mixed = render(MIXED_SCENARIO_1)
  test('점프 내비: mixed 화면은 운동 포함 5개', () => {
    assert.equal(navButtons(mixed).length, 5)
  })
  test('점프 내비: 내비는 작업 영역(main)의 마지막 자식 — sticky bottom이 성립하는 위치', () => {
    const mainClose = pain.lastIndexOf('</main>')
    const navStart = pain.lastIndexOf('<nav class="doctor__laneNav"')
    assert.ok(navStart > 0 && navStart < mainClose)
    const between = pain.slice(pain.indexOf('</nav>', navStart) + 6, mainClose)
    assert.equal(between.trim(), '')
  })
  test('점프 내비: 내비는 sticky bottom이고, 점프는 sticky 헤더·요약의 실제 높이를 읽어 그 아래에 헤딩을 세운다 (소스 계약)', () => {
    const css = fs.readFileSync(new URL('../src/doctor/doctor.css', import.meta.url), 'utf8')
    assert.ok(/\.doctor__laneNav\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/.test(css))
    const src = fs.readFileSync(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url), 'utf8')
    assert.ok(src.includes("document.querySelector('.doctor__header')") && src.includes("document.querySelector('.doctor__visitSummary')"))
    assert.ok(!src.includes('scrollIntoView'), '고정 scroll-margin에 의존하는 scrollIntoView로 되돌아가면 헤딩이 헤더 뒤에 숨는다(실측 42px)')
  })
}

console.log(`\n(+레인1 접기) ${passed} doctor-workspace assertions passed.`)
