// Round 18: stale-write conflict wiring regression suite.
//
// The server/store-level CAS (expectedUpdatedAt/409/StaleWriteError)
// contract was already fully exercised at the HTTP boundary in
// tests/server.spec.mjs and tests/follow-up-session.spec.mjs (round 17/W4) --
// this file does not repeat that. What is genuinely NEW in this round is the
// client-side conflict handling in DoctorWorkspace.tsx, RevisitWorkspace.tsx
// and JudgmentPanel.tsx, all built on the shared src/doctor/ConflictBanner.tsx.
//
// That handling lives in useEffect/useState (debounced autosave, a pending
// conflict flag) that renderToString cannot exercise -- this repo
// deliberately avoids taking on a jsdom+act() dependency for exactly this
// reason (see tests/patient-ux.spec.mjs's header comment). So this suite
// covers what IS honestly testable without one:
//   1. ConflictBanner itself (a pure presentational component) via
//      renderToString, in both its states.
//   2. Source-level guards on the three wired components proving the
//      fail-closed / no-invented-merge / no-cross-record-leak properties
//      structurally, matching this repo's existing round-9/round-15 pattern
//      of pairing a source guard with real interactive proof elsewhere.
// The actual interactive proof (a stale writer cannot clobber a fresh
// writer; reload restores the server version; switching records leaves no
// stale conflict/draft behind) is real two-browser-context Playwright QA,
// documented separately (HANDOFF.md / DECISIONS.md), the same division of
// labor this repo already uses for e.g. the tablet-viewport density proof.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ConflictBanner } from './.conflict-banner-bundle.cjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`OK: ${name}`)
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// ---------- 1. ConflictBanner itself ----------

test('ConflictBanner: uses the warning modifier, never the danger one (must not compete with CommonSafetyBanner)', () => {
  const html = renderToString(React.createElement(ConflictBanner, { onReload: () => {}, draftJson: null }))
  assert.ok(html.includes('doctor__banner--warning'))
  assert.ok(!html.includes('doctor__banner--danger'))
})

test('ConflictBanner: is an alert region with the reload action always present', () => {
  const html = renderToString(React.createElement(ConflictBanner, { onReload: () => {}, draftJson: null }))
  assert.ok(html.includes('role="alert"'))
  assert.ok(/<button[^>]*>\s*최신 내용 불러오기\s*<\/button>/.test(html))
})

test('ConflictBanner: with draftJson, shows the preserved draft as read-only text the clinician can copy', () => {
  const draft = JSON.stringify({ someField: 'in-progress clinician text' }, null, 2)
  const html = renderToString(React.createElement(ConflictBanner, { onReload: () => {}, draftJson: draft }))
  assert.ok(html.includes('불러오기 전 내 입력 내용'))
  assert.ok(html.includes('in-progress clinician text'))
  assert.ok(/<textarea[^>]*readonly[^>]*>/.test(html), 'the draft textarea must be readonly -- never itself editable/mergeable')
})

test('ConflictBanner: with draftJson null, renders no draft disclosure at all (nothing to show, nothing implied)', () => {
  const html = renderToString(React.createElement(ConflictBanner, { onReload: () => {}, draftJson: null }))
  assert.ok(!html.includes('불러오기 전 내 입력 내용'))
})

test('ConflictBanner.tsx never merges anything -- no field-level merge helper/utility referenced', () => {
  const src = stripComments(fs.readFileSync('src/doctor/ConflictBanner.tsx', 'utf8'))
  assert.ok(!/merge/i.test(src), 'inventing field-level merge semantics was explicitly out of scope for this batch')
})

// ---------- 2. DoctorWorkspace.tsx workspace-save conflict wiring ----------

{
  const src = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')

  test('DoctorWorkspace.tsx: imports and renders ConflictBanner right after CommonSafetyBanner', () => {
    assert.ok(src.includes("import { ConflictBanner } from '../ConflictBanner'"))
    const safety = src.indexOf('<CommonSafetyBanner')
    const banner = src.indexOf('{conflict && (')
    const profileBar = src.indexOf('workspace__profileBar')
    assert.ok(safety !== -1 && banner !== -1 && profileBar !== -1)
    assert.ok(safety < banner && banner < profileBar, 'ConflictBanner must render between safety and the profile switcher')
  })

  test('DoctorWorkspace.tsx: autosave effect fails closed on a pending conflict (no retry until reload)', () => {
    const effectStart = src.indexOf('useEffect(() => {\n    if (skipNextSaveRef.current) {')
    const effectEnd = src.indexOf('}, [workspaceState, submissionId, conflict])')
    assert.ok(effectStart !== -1 && effectEnd !== -1, 'the autosave effect must exist with the expected dependency array')
    const effectBody = src.slice(effectStart, effectEnd)
    const guardIndex = effectBody.indexOf('if (conflict) return')
    const timeoutIndex = effectBody.indexOf('setTimeout(async () => {')
    assert.ok(guardIndex !== -1 && timeoutIndex !== -1)
    assert.ok(guardIndex < timeoutIndex, 'the conflict guard must run BEFORE any save attempt is scheduled')
  })

  test('DoctorWorkspace.tsx: a conflict outcome stops the effect from touching lastSavedRef (the unsaved draft is never marked saved)', () => {
    const branch = src.slice(src.indexOf('} else if (result.conflict) {'), src.indexOf('} else {\n        setSaveStatus(\'error\')'))
    assert.ok(branch.length > 0)
    assert.ok(!branch.includes('lastSavedRef.current = toSave'), 'lastSavedRef must only advance on a genuinely accepted save')
    assert.ok(branch.includes('setConflict(result.conflict)') && branch.includes('setPreConflictDraft(toSave)'))
  })

  test('DoctorWorkspace.tsx: reload loads the server version VERBATIM -- no spread-merge with the in-progress local draft', () => {
    const fn = src.slice(src.indexOf('function handleReloadFromConflict() {'), src.indexOf('function handleReloadFromConflict() {') + 600)
    assert.ok(/setWorkspaceState\(conflict\.current\)/.test(fn), 'must set the full server record verbatim')
    assert.ok(!/\.\.\.\s*workspaceState/.test(fn), 'must never spread the stale local state back in on top of the server version')
  })

  test('DoctorWorkspace.tsx: switching records clears the conflict/draft from the OLD record (no cross-patient leak)', () => {
    const resetBlock = src.slice(src.indexOf('if (recordKey !== lastSeenRecordKey) {'), src.indexOf('if (recordKey !== lastSeenRecordKey) {') + 900)
    assert.ok(resetBlock.includes('setConflict(null)') && resetBlock.includes('setPreConflictDraft(null)'))
  })

  // Real two-browser-context QA (round 18) initially caught a false-positive
  // conflict here: initialRecordUpdatedAt can legitimately advance for the
  // SAME record without DoctorWorkspace ever saving anything (the "mark as
  // viewed" status write, or a sibling JudgmentPanel save) -- without
  // syncing to it, DoctorWorkspace's own first autosave attempt on almost
  // every record 409'd against its own sibling's write.
  // Closing-review finding (HIGH): the first version of this fix adopted
  // the newer TOKEN without also adopting the CONTENT it came with, which
  // let a stale panel's later save pass CAS while silently overwriting a
  // sibling/another tab's real write. The fix must adopt token+content
  // TOGETHER, and only when this panel's own workspaceState is pristine
  // (no unsaved local edits) -- these three assertions pin exactly that
  // shape so a regression back to the token-only version would be caught.
  test('DoctorWorkspace.tsx: the version-sync effect only adopts a newer token when workspaceState is pristine (no unsaved local edits)', () => {
    const effect = src.slice(
      src.indexOf('useEffect(() => {\n    if (initialRecordUpdatedAt == null'),
      src.indexOf("}, [initialRecordUpdatedAt])") + 50,
    )
    assert.ok(effect.length > 60, 'the version-sync effect must exist')
    const guard = effect.indexOf('if (!workspaceStateEquals(workspaceState, lastSavedRef.current)) return')
    assert.ok(guard !== -1, 'must bail out while local edits are pending -- never silently discard/keep-stale-under a pending edit')
  })

  test('DoctorWorkspace.tsx: the version-sync effect adopts fresh CONTENT together with the token (not the token alone)', () => {
    const effect = src.slice(
      src.indexOf('useEffect(() => {\n    if (initialRecordUpdatedAt == null'),
      src.indexOf("}, [initialRecordUpdatedAt])") + 50,
    )
    assert.ok(/const fresh = seedWorkspaceState\(initialWorkspaceState, synthetic\)/.test(effect))
    assert.ok(/lastKnownUpdatedAtRef\.current = initialRecordUpdatedAt/.test(effect))
    assert.ok(/lastSavedRef\.current = fresh/.test(effect), 'lastSavedRef must advance to the SAME fresh content, not just the token')
    assert.ok(/setWorkspaceState\(fresh\)/.test(effect), 'workspaceState itself must be replaced with the fresh content -- the exact HIGH finding this guards against')
    assert.ok(/skipNextSaveRef\.current = true/.test(effect), 'must not immediately re-PUT the just-adopted content back at the server')
  })
}

// ---------- 3. RevisitWorkspace.tsx visit-workspace conflict wiring ----------

{
  const src = fs.readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')

  test('RevisitWorkspace.tsx: imports and renders ConflictBanner between the hero and the patient-input block', () => {
    assert.ok(src.includes("import { ConflictBanner } from '../ConflictBanner'"))
    const hero = src.indexOf('재진 · 간단 추적')
    const banner = src.indexOf('{conflict && (')
    const patientInputSection = src.indexOf('<MicroFollowUpCard')
    assert.ok(hero !== -1 && banner !== -1 && patientInputSection !== -1)
    assert.ok(hero < banner && banner < patientInputSection)
  })

  test('RevisitWorkspace.tsx: autosave effect fails closed on a pending conflict', () => {
    const effectStart = src.indexOf('useEffect(() => {\n    if (skipNextSaveRef.current) {')
    const effectEnd = src.indexOf('}, [workspaceState, visitId, conflict])')
    assert.ok(effectStart !== -1 && effectEnd !== -1)
    const effectBody = src.slice(effectStart, effectEnd)
    assert.ok(effectBody.indexOf('if (conflict) return') < effectBody.indexOf('setTimeout(async () => {'))
  })

  test('RevisitWorkspace.tsx: opening a new visit resets conflict/draft state BEFORE the async load starts', () => {
    const loadEffectStart = src.indexOf('let cancelled = false')
    const loadStart = src.indexOf('async function load() {')
    assert.ok(loadEffectStart !== -1 && loadStart !== -1 && loadEffectStart < loadStart)
    const preLoadBlock = src.slice(loadEffectStart, loadStart)
    assert.ok(preLoadBlock.includes('setConflict(null)') && preLoadBlock.includes('setPreConflictDraft(null)'))
  })

  test('RevisitWorkspace.tsx: reload loads the server version verbatim, no merge with local state', () => {
    const fn = src.slice(src.indexOf('function handleReloadFromConflict() {'), src.indexOf('function handleReloadFromConflict() {') + 500)
    assert.ok(/setWorkspaceState\(conflict\.current\)/.test(fn))
    assert.ok(!/\.\.\.\s*workspaceState/.test(fn))
  })

  // Closing-review finding (MEDIUM): a failed getVisit previously fell
  // through to a fully editable, empty form with no CAS precondition at
  // all -- the first save was true unconditional last-write-wins on a
  // transient load failure, silently overwriting real stored content.
  test('RevisitWorkspace.tsx: a failed load blocks editing/saving instead of falling back to an empty, unconditionally-saveable form', () => {
    assert.ok(/if \(!visitResult\.ok\) \{\s*setLoadError\(true\)/.test(src), 'a failed getVisit must set an error state, not seed an empty editable workspace')
    assert.ok(
      !/visitResult\.ok \? deserializeVisitWorkspaceState\(visitResult\.data\.workspace\) : emptyVisitWorkspaceState\(\)/.test(src),
      'must no longer silently fall back to an empty seed on a failed load (the old unconditional-save hazard)',
    )
    const renderGuard = src.indexOf('if (loadError) {')
    const formRender = src.indexOf('<MicroFollowUpCard')
    assert.ok(renderGuard !== -1 && formRender !== -1 && renderGuard < formRender, 'the load-error branch must return before the editable form renders')
  })
}

// ---------- 4. JudgmentPanel.tsx judgment-save conflict wiring ----------

{
  const src = fs.readFileSync('src/doctor/JudgmentPanel.tsx', 'utf8')

  test('JudgmentPanel.tsx: imports ConflictBanner and renders it before the editable fields', () => {
    assert.ok(src.includes("import { ConflictBanner } from './ConflictBanner'"))
    const banner = src.indexOf('{conflict && (')
    const grid = src.indexOf('<div className="judgment__grid">')
    assert.ok(banner !== -1 && grid !== -1 && banner < grid)
  })

  test('JudgmentPanel.tsx: handleRecord fails closed on a pending conflict (closing-review MEDIUM finding)', () => {
    const fnStart = src.indexOf('async function handleRecord() {')
    const fnEnd = src.indexOf('function handleReloadFromConflict')
    const fn = src.slice(fnStart, fnEnd)
    const guardIndex = fn.indexOf('if (conflict) return')
    const onSaveCallIndex = fn.indexOf('await onSave(')
    assert.ok(guardIndex !== -1 && onSaveCallIndex !== -1 && guardIndex < onSaveCallIndex)
  })

  test('JudgmentPanel.tsx: a rejected save never marks the judgment as recorded ("기록됨" must reflect reality)', () => {
    const fnStart = src.indexOf('async function handleRecord() {')
    const fnEnd = src.indexOf('function handleReloadFromConflict')
    assert.ok(fnStart !== -1 && fnEnd !== -1)
    const fn = src.slice(fnStart, fnEnd)
    const conflictBranch = fn.slice(fn.indexOf('} else if (outcome.conflict) {'), fn.indexOf('} else {\n      setErrors('))
    assert.ok(conflictBranch.length > 0)
    assert.ok(!conflictBranch.includes('setRecorded(finalized)'), 'the conflict branch must not call setRecorded with the rejected draft')
    assert.ok(conflictBranch.includes('setConflict(outcome.conflict)'))
  })

  test('JudgmentPanel.tsx: the conflict branch leaves the clinician\'s typed judgment/debrief state untouched (nothing is cleared or overwritten)', () => {
    const fnStart = src.indexOf('async function handleRecord() {')
    const fnEnd = src.indexOf('function handleReloadFromConflict')
    const fn = src.slice(fnStart, fnEnd)
    const conflictBranch = fn.slice(fn.indexOf('} else if (outcome.conflict) {'), fn.indexOf('} else {\n      setErrors('))
    assert.ok(!/setJudgment\(/.test(conflictBranch) && !/setDebrief\(/.test(conflictBranch))
  })

  test('JudgmentPanel.tsx: reload loads the server\'s current judgment verbatim (or a blank form), no merge with the in-progress draft', () => {
    const fn = src.slice(src.indexOf('function handleReloadFromConflict() {'), src.indexOf('function handleReloadFromConflict() {') + 500)
    assert.ok(/const next = conflict\.current \?\? createEmptyJudgment\(source\)/.test(fn))
    assert.ok(/setJudgment\(next\)/.test(fn))
    assert.ok(!/\.\.\.\s*judgment\b/.test(fn), 'must never spread the rejected in-progress judgment back on top of the server version')
  })

  // Closing-review finding (HIGH, same class as DoctorWorkspace.tsx's):
  // token-only adoption let a stale judgment draft pass CAS and clobber a
  // real concurrent write to the SAME submission's judgment field. Must
  // adopt token+content together, gated on the draft being pristine.
  test('JudgmentPanel.tsx: the version-sync effect only adopts a newer token when the draft is pristine (isDraftPristine)', () => {
    const effect = src.slice(src.indexOf('useEffect(() => {\n    if (initialUpdatedAt == null'), src.indexOf('[initialUpdatedAt])') + 40)
    assert.ok(effect.length > 60, 'the version-sync effect must exist')
    assert.ok(/if \(!isDraftPristine\(\)\) return/.test(effect), 'must bail out while the clinician has unsaved typing pending')
  })

  test('JudgmentPanel.tsx: the version-sync effect adopts fresh CONTENT together with the token (not the token alone)', () => {
    const effect = src.slice(src.indexOf('useEffect(() => {\n    if (initialUpdatedAt == null'), src.indexOf('[initialUpdatedAt])') + 40)
    assert.ok(/lastKnownUpdatedAtRef\.current = initialUpdatedAt/.test(effect))
    assert.ok(/lastKnownJudgmentRef\.current = \{ judgment: freshJudgment, debrief: freshDebrief \}/.test(effect))
    assert.ok(/setJudgment\(freshJudgment\)/.test(effect) && /setDebrief\(freshDebrief\)/.test(effect), 'the visible form fields must be replaced with the fresh content -- the exact HIGH finding this guards against')
  })
}

// ---------- 4.5. DoctorView.tsx: the "mark as viewed" sibling-write fix ----------
// The real two-browser-context QA run caught this the hard way: opening a
// submission auto-fires a status write that bumps updated_at the same as
// any judgment/workspace save. Without folding its response back into
// selectedRecord, and without skipping it when the record is already past
// 'new', a clinician's very first autosave -- or a second tab merely
// glancing at an already-viewed patient -- could spuriously 409 with
// nobody having edited anything.
{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx: only marks a submission "viewed" if the server-reported status is still \'new\' (a second tab opening an already-viewed record must not re-bump updated_at)', () => {
    const block = src.slice(src.indexOf('getSubmission(selectedId).then'), src.indexOf('getSubmission(selectedId).then') + 2200)
    assert.ok(/if \(result\.data\.status === 'new' && !viewedRef\.current\.has\(selectedId\)\)/.test(block))
  })

  test('DoctorView.tsx: folds the "mark as viewed" response back into selectedRecord (its own status write must not leave selectedRecord.updated_at stale)', () => {
    const block = src.slice(src.indexOf('getSubmission(selectedId).then'), src.indexOf('getSubmission(selectedId).then') + 2200)
    assert.ok(/setSubmissionStatus\(selectedId, 'viewed'\)\.then\(\(statusResult\) => \{/.test(block))
    assert.ok(/if \(statusResult\.ok\) setSelectedRecord\(statusResult\.data\)/.test(block))
  })
}

// ---------- 5. DoctorView.tsx: 409 -> typed conflict translation for all three save paths ----------

{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx: workspace save reads errorBody.current and normalizes it through deserializeWorkspaceState (never trusts a raw/legacy shape)', () => {
    const block = src.slice(src.indexOf('onSaveWorkspace={'), src.indexOf('onSaveWorkspace={') + 1800)
    assert.ok(block.includes('result.errorBody?.current'))
    assert.ok(block.includes('deserializeWorkspaceState(current.workspace)'))
  })

  test('DoctorView.tsx: judgment save reads errorBody.current and passes current.judgment through as-is (ClinicianJudgment | null, matching JudgmentPanel\'s reload fallback)', () => {
    const block = src.slice(src.indexOf('onSave={'), src.indexOf('onSave={') + 1400)
    assert.ok(block.includes('result.errorBody?.current'))
    assert.ok(block.includes('current.judgment'))
  })

  test('DoctorView.tsx: both save callbacks pass expectedUpdatedAt through to the server client (the CAS precondition is actually wired, not dropped)', () => {
    assert.ok(/saveWorkspaceStateToServer\(selectedId, state, expectedUpdatedAt \?\? undefined\)/.test(src))
    assert.ok(/saveJudgmentToServer\(selectedId, judgment, expectedUpdatedAt \?\? undefined\)/.test(src))
  })
}

console.log(`\n${passed} save-conflict assertions passed.`)
