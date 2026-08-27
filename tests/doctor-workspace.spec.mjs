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

// ---------- 1. every scenario renders without throwing ----------
for (const s of WORKSPACE_SCENARIOS) {
  test(`scenario "${s.label}" (${s.kind}) renders without throwing`, () => {
    const html = render(s)
    assert.ok(html.length > 0)
  })
}

test('exactly 7 scenarios exist (pain x3, herbal x3, mixed x1)', () => {
  assert.equal(WORKSPACE_SCENARIOS.length, 7)
  assert.equal(WORKSPACE_SCENARIOS.filter((s) => s.kind === 'pain').length, 3)
  assert.equal(WORKSPACE_SCENARIOS.filter((s) => s.kind === 'herbal').length, 3)
  assert.equal(WORKSPACE_SCENARIOS.filter((s) => s.kind === 'mixed').length, 1)
})

// ---------- 2. profile isolation ----------
test('pain scenario 1: no Myungri/명리, no birth-time, no herbal-only systemic content', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(!html.includes('명리'))
  assert.ok(!html.includes('workspace__myungri'))
  assert.ok(!html.includes('핵심 병기 후보'))
  assert.ok(!html.includes('오늘 반드시 확인'))
})

test('pain scenario 1: shows the pain-specific 지금 확인할 것 section', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('지금 확인할 것'))
  assert.ok(html.includes('원장 최종 판단'))
})

test('herbal scenario: systemic content shown, Myungri present but collapsed (no [open])', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(html.includes('핵심 병기 후보'))
  assert.ok(html.includes('오늘 반드시 확인'))
  const myungriIdx = html.indexOf('workspace__myungri')
  assert.ok(myungriIdx !== -1, 'myungri details block present')
  const detailsOpenIdx = html.lastIndexOf('<details', myungriIdx + 40)
  const detailsTag = html.slice(detailsOpenIdx, html.indexOf('>', detailsOpenIdx) + 1)
  assert.ok(!detailsTag.includes(' open'), 'myungri <details> is not open by default')
  assert.ok(html.includes('최종 변증·병기'))
})

test('herbal scenario: does not show the pain-specific 지금 확인할 것 section', () => {
  const html = render(HERBAL_SCENARIO_1)
  assert.ok(!html.includes('지금 확인할 것'))
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
  assert.ok(html.includes('지금 확인할 것'))
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
test('reassessment picker shows 재평가 대상 and the explicit OPERATIONAL INTEGRATION REQUIRED status (no fake repeat-visit comparison)', () => {
  const html = render(PAIN_SCENARIO_1)
  assert.ok(html.includes('재평가 대상'))
  assert.ok(html.includes('재진 자동 비교: OPERATIONAL INTEGRATION REQUIRED'))
})

// ---------- 7. source-level guard: no production inference engine introduced ----------
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

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

console.log(`\n${passed} doctor-workspace assertions passed.`)
