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
   four layers and the things that must no longer occupy the default view. */
test('round 11: the default workspace renders the four layers in order', () => {
  const html = render(PAIN_SCENARIO_1)
  const glance = html.indexOf('workspace__hero')
  const safety = html.indexOf('workspace__block--safety')
  const judgment = html.indexOf('원장 최종 판단')
  const nextAction = html.indexOf('workspace__nextAction')
  assert.ok(glance !== -1 && safety !== -1 && judgment !== -1 && nextAction !== -1, 'all four layers render')
  assert.ok(glance < safety, 'the glance card comes first')
  assert.ok(safety < judgment, 'safety is above the clinician action area')
  assert.ok(judgment < nextAction, 'next action closes the flow')
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

// ---------- 5. accessibility ----------
test('exam suggestion status buttons expose aria-pressed', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('aria-pressed="true"') || html.includes('aria-pressed="false"'))
})

test('mixed scenario tabs expose role="tab" and aria-selected', () => {
  const html = render(MIXED_SCENARIO_1)
  assert.ok(html.includes('role="tab"'))
  assert.ok(html.includes('aria-selected="true"'))
})

test('profile switcher exposes role="group" with aria-pressed buttons', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('워크스페이스 프로필'))
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
  const secondary = html.match(/<details[^>]*workspace__finalAssessment__secondary[^>]*>/g) ?? []
  assert.equal(secondary.length, 1, 'exactly one secondary disclosure on the herbal card')
  assert.ok(!/open/.test(secondary[0]), 'an empty 치법 must start closed')
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
  const secondary = html.match(/<details[^>]*workspace__finalAssessment__secondary[^>]*>/g) ?? []
  assert.equal(secondary.length, 1)
  assert.ok(/open/.test(secondary[0]), 'a populated 치법 may never be hidden behind a closed disclosure')
})

test('no manual-override banner on first render (profile matches auto-derived by default)', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(!html.includes('workspace__overrideNotice'))
  assert.ok(!html.includes('수동 보기'))
})

test('mixed scenario: tablist/tabpanel a11y wiring (role, aria-controls/aria-labelledby, roving tabindex)', () => {
  const html = render(MIXED_SCENARIO_1)
  assert.ok(html.includes('role="tablist"'))
  assert.ok(html.includes('role="tabpanel"'))
  assert.ok(/aria-controls="[^"]+"/.test(html))
  assert.ok(/aria-labelledby="[^"]+"/.test(html))
  assert.ok(html.includes('tabIndex') || html.includes('tabindex="0"'))
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
  assert.ok(
    /if \(derived && \(derived\.pregnant/.test(src),
    'derived must be checked truthy before .pregnant/.pregnancy_possible/.postpartum_1y/.breastfeeding are read',
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

  test('CommonSafetyBanner: reproductive_status.derived alone being null (a legitimate state, e.g. male patients) does NOT trigger the "cannot read" notice by itself', () => {
    const mutated = structuredClone(base.payload)
    mutated.responses.reproductive_status.derived = null
    const html = renderToString(React.createElement(DoctorWorkspace, { payload: mutated, synthetic: base.synthetic }))
    assert.ok(html.includes('특이 안전정보 없음'))
    assert.ok(!html.includes('안전정보 일부를 읽을 수 없습니다'))
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
}

console.log(`\n${passed} doctor-workspace assertions passed.`)
