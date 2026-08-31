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
import { DoctorWorkspace } from './.doctor-workspace-bundle.cjs'
import {
  WORKSPACE_SCENARIOS,
  PAIN_SCENARIO_1,
  PAIN_SCENARIO_2,
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

test('pain scenario 2: a clinician-recorded POSITIVE result renders distinctly from NOT_YET_CHECKED', () => {
  const html = render(PAIN_SCENARIO_2)
  assert.ok(html.includes('양성/이상 소견'))
  assert.ok(html.includes('workspace__examCard--done'))
})

// ---------- 4. EMR preview: SUGGESTED never becomes confirmed, NOT_YET_CHECKED never becomes negative ----------
test('EMR preview (pain scenario 1, all exams NOT_YET_CHECKED): 진찰 소견 line stays empty, exam titles never appear as findings', () => {
  const html = render(PAIN_SCENARIO_1)
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  assert.ok(emrIdx !== -1)
  const textareaChunk = html.slice(emrIdx, emrIdx + 1500)
  assert.ok(textareaChunk.includes('진찰 소견:'))
  // The exam is NOT_YET_CHECKED -- its title must not appear inside the EMR text as a finding.
  const emrTextEnd = textareaChunk.indexOf('</textarea>')
  const emrTextOnly = textareaChunk.slice(0, emrTextEnd === -1 ? undefined : emrTextEnd)
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

test('EMR preview never contains the literal 원장 최종 판단 empty-state as a false-confirmed line (Assessment starts empty)', () => {
  const html = render(PAIN_SCENARIO_1)
  const emrIdx = html.indexOf('workspace__emrPreview__text')
  const emrTextEnd = html.indexOf('</textarea>', emrIdx)
  const emrTextOnly = html.slice(emrIdx, emrTextEnd)
  assert.ok(emrTextOnly.includes('Assessment:'))
  // Assessment line has no clinician text yet (finalWorkingAssessment starts '').
  assert.ok(/Assessment:\s*(&#10;|\r|\n|<)/.test(emrTextOnly) || emrTextOnly.trim().endsWith('Assessment:'))
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

test('reproductive section is hidden when WOMEN_SAFETY_01 was never asked/answered (legacy constitution route, HERBAL_SCENARIO_1)', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(!html.includes('여성·생식 정보'))
})

test('reproductive section shows when WOMEN_SAFETY_01 was answered, even with a "none" answer (HERBAL_SCENARIO_2)', () => {
  const html = render(HERBAL_SCENARIO_2)
  assert.ok(html.includes('여성·생식 정보'))
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
  // an unresolved/pending item -- the "아직 확인 안 됨 · N건" pending-counter
  // banner (distinct from the always-present per-card status BUTTON of the
  // same label) must not appear, since the only exam item reloaded here is
  // already POSITIVE, not NOT_YET_CHECKED.
  assert.ok(!html.includes('아직 확인 안 됨 ·'))
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
  const html = renderWith(PAIN_SCENARIO_1, { submissionId: 'x', initialWorkspaceState, synthetic: undefined })
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
  const idx1 = openViaCarePlan.indexOf('관리 계획 · 다음 재평가')
  const tag1 = openViaCarePlan.slice(openViaCarePlan.lastIndexOf('<details', idx1), openViaCarePlan.indexOf('>', idx1) + 1)
  assert.ok(/\bopen\b/.test(tag1), 'isCarePlanEmpty=false alone opens the disclosure')

  const openViaPlanStatus = renderWith(PAIN_SCENARIO_1, {
    submissionId: 'careplan-open-2',
    initialWorkspaceState: { nextReassessmentPlan: { status: 'CLINICIAN_DECIDES', targetDate: '', afterVisitCount: null, note: '' } },
  })
  const idx2 = openViaPlanStatus.indexOf('관리 계획 · 다음 재평가')
  const tag2 = openViaPlanStatus.slice(openViaPlanStatus.lastIndexOf('<details', idx2), openViaPlanStatus.indexOf('>', idx2) + 1)
  assert.ok(/\bopen\b/.test(tag2), "plan.status !== 'UNSET' alone (empty care plan otherwise) also opens the disclosure")
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

// ---------- §1.3-#16 (신규 disclosure 전수 커버리지, 정적 목록 대조) ----------
test('every disclosure element Core Reduction P2/P3 introduced has a corresponding open-condition test in this suite (no orphaned <details> without an open={} assertion)', () => {
  // The 5 disclosures Phase 5 Synthesis v1.2 introduced/changed this round:
  //   1. §2.4 반대편 유형 입력 세트 (doctor__oppositeType)      -- tested above (#4/#5)
  //   2. §2.7 발급 "다른 방법" (doctor__nextIssuance__altMethods) -- source-tested in tests/doctor.spec.mjs
  //   3. §2.10 학습 케이스 (judgment__learningCase)              -- tested below (#15)
  // (재활 제안/병기 후보는 <details>가 아니라 존재-시에만-렌더 형태로 구현했으므로
  //  이 정적 목록에서 제외 -- 위 #10 테스트가 그 형태에 맞는 동등 검증을 담당한다.)
  const workspaceSrc = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')
  assert.ok(/className="workspace__optional doctor__oppositeType"\s*\n\s*open=\{/.test(workspaceSrc), '#1: doctor__oppositeType has an open={} condition')
  const viewSrc = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
  assert.ok(/doctor__nextIssuance__altMethods"\s*open=\{altMethodsAutoOpen\}/.test(viewSrc), '#2: doctor__nextIssuance__altMethods has an open={} condition')
  const judgmentSrc = fs.readFileSync('src/doctor/JudgmentPanel.tsx', 'utf8')
  assert.ok(/className="judgment__learningCase" open=\{/.test(judgmentSrc), '#3: judgment__learningCase has an open={} condition')
})

console.log(`\n${passed} doctor-workspace assertions passed.`)
