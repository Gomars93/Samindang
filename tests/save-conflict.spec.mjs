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

  // 15차 독립 리뷰 HIGH-1: priorSubmission.workspace is an untrusted raw blob
  // written by an unauthenticated PUT -- priorVisitRecapLines previously read
  // it directly, so a malformed element crashed outside DoctorRecordErrorBoundary
  // and reset the whole doctor session to the patient-facing error screen.
  test('RevisitWorkspace.tsx 15차 HIGH-1: priorVisitRecapLines sanitizes the raw prior submission workspace via deserializeWorkspaceState before reading any field off it', () => {
    assert.ok(src.includes("import { deserializeWorkspaceState } from './persistence'"))
    const fnStart = src.indexOf('function priorVisitRecapLines(priorSubmission: SubmissionRecord | null) {')
    assert.ok(fnStart !== -1)
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/deserializeWorkspaceState\(priorSubmission\.workspace\)/.test(fn), 'must sanitize before any field access')
    const sanitizeCall = fn.indexOf('deserializeWorkspaceState(')
    const firstFieldRead = fn.indexOf('ws?.painExamSuggestions')
    assert.ok(sanitizeCall !== -1 && firstFieldRead !== -1 && sanitizeCall < firstFieldRead, 'sanitize must happen before ws.* is read')
  })

  // 15차 독립 리뷰 MEDIUM-2: sanitizeShape only guarantees result.status is a
  // string, not a known ExamCheckStatus -- an unmapped value must not leak as
  // the literal string "undefined" into the prior-visit recap text.
  test('RevisitWorkspace.tsx 15차 MEDIUM-2: both priorVisitRecapLines and priorVisitRecapLinesFromVisitWorkspace guard EXAM_CHECK_STATUS_LABEL lookups with isValidExamStatus', () => {
    assert.ok(src.includes("isValidExamStatus, type ExamCheckStatus } from './provenance'") || src.includes('isValidExamStatus'))
    const occurrences = src.match(/isValidExamStatus\(i\.result\.status\)/g) || []
    assert.ok(occurrences.length >= 2, `expected the guard in both recap-line builders, found ${occurrences.length}`)
  })

  // 16차 독립 리뷰 MEDIUM-1: load() was called with no .catch -- if a
  // response mapper (e.g. serverClient.ts's getPatientHistory) throws, the
  // rejection was never handled: `loading` stayed true forever and
  // `loadError` (the deliberately fail-closed banner built for exactly this
  // situation) was never reached. The clinician was stuck on "재진 정보를
  // 불러오는 중…" permanently with no way out but reloading the app.
  test('RevisitWorkspace.tsx 16차 MEDIUM-1: the load() effect catches a rejected load and routes it to the fail-closed loadError state', () => {
    const loadCallStart = src.indexOf('load().catch(')
    assert.ok(loadCallStart !== -1, 'load() must be invoked with a .catch handler, not bare')
    const catchBlock = src.slice(loadCallStart, src.indexOf('return () => {', loadCallStart))
    assert.ok(catchBlock.includes('setLoadError(true)'), 'a rejected load must still set loadError')
    assert.ok(catchBlock.includes('setLoading(false)'), 'a rejected load must still clear the loading spinner')
    assert.ok(catchBlock.includes('if (!cancelled)'), 'must not update state after the effect was cancelled (visit/patient switched during the failed load)')
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

  // Second closing-review finding (MEDIUM): a successful save must snapshot
  // the LIVE pre-finalize judgment/debrief into lastKnownJudgmentRef, never
  // `finalized` -- finalizeJudgment stamps a fresh recorded_at that the live
  // `judgment` state never receives (this success path never calls
  // setJudgment(finalized)), so snapshotting `finalized` made
  // isDraftPristine()'s comparison permanently false after the FIRST
  // successful save, silently disabling the version-sync effect above for
  // the rest of the panel's life and reintroducing a false conflict on
  // every subsequent save.
  test('JudgmentPanel.tsx: a successful save snapshots the LIVE judgment/debrief (not `finalized`) so isDraftPristine() stays meaningful after the first save', () => {
    const fnStart = src.indexOf('async function handleRecord() {')
    const fnEnd = src.indexOf('function handleReloadFromConflict')
    const fn = src.slice(fnStart, fnEnd)
    const successBranch = fn.slice(fn.indexOf('if (outcome.ok) {'), fn.indexOf('} else if (outcome.conflict) {'))
    assert.ok(successBranch.length > 0)
    assert.ok(
      /lastKnownJudgmentRef\.current = \{ judgment, debrief \}/.test(successBranch),
      'must snapshot the live judgment/debrief variables, not `finalized` (which carries a freshly-stamped recorded_at the live judgment state never receives)',
    )
    assert.ok(!/lastKnownJudgmentRef\.current = \{ judgment: finalized/.test(successBranch))
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

// ---------- 5. src/lib/serverClient.ts: 16차 독립 리뷰 MEDIUM-1 ----------
// getPatientHistory's response mapper indexed `result.data.visits.map(...)`
// unconditionally -- a non-array `visits` (version skew, a non-conforming
// proxy) threw INSIDE the .then() callback, which is outside request()'s own
// try/catch, so the returned Promise rejected. RevisitWorkspace.tsx's load()
// (fixed above, same round) now catches that rejection, but the root cause
// -- the mapper itself assuming the wire shape -- is fixed here too, so the
// rejection stops happening in the first place for this specific shape.
{
  const src = fs.readFileSync('src/lib/serverClient.ts', 'utf8')

  test('serverClient.ts 16차 MEDIUM-1: getPatientHistory never lets a non-array `visits` throw inside the response mapper', () => {
    const fnStart = src.indexOf('export function getPatientHistory(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(
      /visits:\s*\(Array\.isArray\(result\.data\.visits\)\s*\?\s*result\.data\.visits\s*:\s*\[\]\)\s*\n\s*\.filter\(/.test(fn),
      'must guard Array.isArray before calling .filter/.map on the wire visits field',
    )
  })

  // 17차 독립 리뷰 FINDING-2: 16차의 Array.isArray 가드는 `visits` 자체가
  // 배열이 아닌 경우만 막았을 뿐, `result.data`가 null이거나 `visits`의
  // 개별 원소가 null인 경우는 여전히 throw했다.
  test('serverClient.ts 17차 FINDING-2: getPatientHistory guards result.data itself being null/non-object, and filters out null/non-object elements before mapping', () => {
    const fnStart = src.indexOf('export function getPatientHistory(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(
      /if \(result\.data == null \|\| typeof result\.data !== 'object'\) \{\s*\n\s*return \{ ok: false,/.test(fn),
      'must guard result.data itself being null/non-object before accessing any field on it',
    )
    assert.ok(
      /\.filter\(\(v\): v is PatientHistoryWire\['visits'\]\[number\] => v != null && typeof v === 'object'\)/.test(fn),
      'must filter out null/non-object visit elements before mapping their fields',
    )
  })

  // 17차 독립 리뷰 FINDING-1: getPatientHistory에 16차가 추가한
  // Array.isArray 가드의 형제 지점 -- listRevisitQueue/listStations는
  // DoctorView.tsx의 상시 poll()에서 호출되는데, 배열이 아닌 wire body가
  // 여기서 그대로 throw하면 poll() 전체(listCrmTasks 포함)가 매 interval
  // 마다 실패해 CRM Today Queue가 새로고침 실패를 전혀 알리지 못한 채
  // 오래된 목록을 계속 authoritative처럼 보여줬다.
  test('serverClient.ts 17차 FINDING-1: listRevisitQueue never lets a non-array wire body throw inside the response mapper', () => {
    const fnStart = src.indexOf('export function listRevisitQueue(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(
      /if \(!Array\.isArray\(result\.data\)\) return \{ ok: false,/.test(fn),
      'must guard Array.isArray on the wire body before calling .map',
    )
  })

  test('serverClient.ts 17차 FINDING-1: listStations never lets a non-array `stations` field throw inside the response mapper', () => {
    const fnStart = src.indexOf('export function listStations(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(
      /if \(!Array\.isArray\(result\.data\?\.stations\)\) return \{ ok: false,/.test(fn),
      'must guard Array.isArray on the wire stations field before calling .map',
    )
  })
}

// ---------- 6. DoctorView.tsx: 17차 독립 리뷰 (uncaught async effects) ----------
// The doctor queue poll() and its sibling handlers were invoked with no
// .catch anywhere -- if a response mapper threw (the exact class of bug
// serverClient.ts is now guarded against above, but also any genuinely
// unexpected future failure), the failure was silently swallowed instead
// of reaching an existing fail-closed/error-surfacing path.
{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx 17차 FINDING-1: the Doctor Queue poll() is invoked with .catch on both the initial call and every interval tick', () => {
    const effectStart = src.indexOf('async function poll() {\n      const result = await listRevisitQueue()')
    const effectEnd = src.indexOf('}, [mode, retryNonce, tokenVersion])', effectStart)
    const effect = src.slice(effectStart, effectEnd)
    const catchCount = (effect.match(/poll\(\)\.catch\(/g) || []).length
    assert.ok(catchCount >= 2, `expected poll().catch(...) on both the initial call and the setInterval tick, found ${catchCount}`)
  })

  test('DoctorView.tsx 17차 FINDING-2: the prior-visit history fetch has a .catch that fails closed to priorVisits=null', () => {
    const effectStart = src.indexOf('getPatientHistory(patientId, selectedRecord?.visit_id)')
    const effectEnd = src.indexOf('}, [mode, selectedRecord?.patient_id, selectedRecord?.visit_id])')
    const effect = src.slice(effectStart, effectEnd)
    assert.ok(effect.includes('.catch(() => {'), 'must have a .catch handler')
    assert.ok(/if \(!cancelled\) setPriorVisits\(null\)/.test(effect), 'a rejected fetch must still resolve to a definite null, not leave stale state')
  })

  test('DoctorView.tsx 17차 FINDING-3: handleRegisterStation and handleAssignToStation both surface an error instead of failing silently on a rejected call', () => {
    const registerFn = src.slice(src.indexOf('async function handleRegisterStation() {'), src.indexOf('async function handleAssignToStation() {'))
    assert.ok(/catch \{\s*\n\s*setStationError\(/.test(registerFn), 'handleRegisterStation must set stationError on a rejected registerStation() call')
    const assignFn = src.slice(src.indexOf('async function handleAssignToStation() {'), src.indexOf('async function handleResetStation('))
    assert.ok(/catch \{\s*\n\s*\/\/[\s\S]*?setRevisitActionError\(/.test(assignFn), 'handleAssignToStation must set revisitActionError on a rejected assignRevisitToStation() call')
  })

  test('DoctorView.tsx 17차 FINDING-4: the revisit queue row guards DELIVERY_MODE_LABEL against an unmapped deliveryMode value', () => {
    assert.ok(
      /rv\.deliveryMode && Object\.prototype\.hasOwnProperty\.call\(DELIVERY_MODE_LABEL, rv\.deliveryMode\) && \(/.test(src),
      'must validate rv.deliveryMode is a known DELIVERY_MODE_LABEL key before indexing it, never leaking a literal "undefined"',
    )
  })
}

// ---------- 7. src/lib/serverClient.ts: 18차 독립 리뷰 (remaining unguarded mappers) ----------
// Rounds 16-17 guarded 3 of the ~11 list/map response mappers in this file
// (getPatientHistory/listRevisitQueue/listStations). 18차 found the rest of
// them still assumed the wire body's array/object fields without checking --
// each is called from a DoctorView.tsx poll or a component effect with no
// (or, for the poll cases, a too-late) catch, so a malformed response either
// crashed outside DoctorRecordErrorBoundary (one of them -- MedicationCourse
// Section -- INSIDE the boundary's own fallback, which React cannot catch)
// or committed a fail-open state before throwing.
{
  const src = fs.readFileSync('src/lib/serverClient.ts', 'utf8')

  test('serverClient.ts 18차: a shared invalidResponseShape() helper exists for the new guards to use', () => {
    assert.ok(/function invalidResponseShape\(\): \{ ok: false; error: string; kind: 'other' \} \{/.test(src))
  })

  test('serverClient.ts 18차 HIGH-1: listCrmTasks guards the `tasks` field before any caller can commit it as fail-open', () => {
    const fnStart = src.indexOf('export function listCrmTasks(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(!Array\.isArray\(result\.data\?\.tasks\)\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 18차 HIGH-2: listSubmissions guards the wire body before DoctorView.tsx\'s poll() or its render-body .filter() can throw', () => {
    const fnStart = src.indexOf('export function listSubmissions(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(!Array\.isArray\(result\.data\)\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 18차 MEDIUM-3: listEpisodesByPatient/listEpisodeTasks/listMedicationCoursesByEpisode all guard their array field (consumed inside DoctorRecordFallback -- a crash there is uncatchable by React)', () => {
    for (const [fnName, field] of [
      ['listEpisodesByPatient', 'episodes'],
      ['listEpisodeTasks', 'tasks'],
      ['listMedicationCoursesByEpisode', 'courses'],
    ]) {
      const fnStart = src.indexOf(`export function ${fnName}(`)
      assert.ok(fnStart !== -1, `${fnName} must exist`)
      const fnEnd = src.indexOf('\nexport function', fnStart + 1)
      const fn = src.slice(fnStart, fnEnd === -1 ? fnStart + 1200 : fnEnd)
      assert.ok(
        new RegExp(`if \\(!Array\\.isArray\\(result\\.data\\?\\.${field}\\)\\) return invalidResponseShape\\(\\)`).test(fn),
        `${fnName} must guard its ${field} field`,
      )
    }
  })

  test('serverClient.ts 18차 MEDIUM-4: listPatientIdentities guards `identities` being a non-null, non-array object (it is a uuid-keyed map, not an array)', () => {
    const fnStart = src.indexOf('export function listPatientIdentities(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/identities == null \|\| typeof identities !== 'object' \|\| Array\.isArray\(identities\)/.test(fn))
  })

  test('serverClient.ts 18차 MEDIUM-5: listVisitMessages guards the `messages` field', () => {
    const fnStart = src.indexOf('export function listVisitMessages(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(!Array\.isArray\(result\.data\?\.messages\)\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 18차 LOW-7: getRecorderResults guards the `results` field', () => {
    const fnStart = src.indexOf('export function getRecorderResults(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(!Array\.isArray\(result\.data\?\.results\)\) return invalidResponseShape\(\)/.test(fn))
  })
}

// ---------- 8. DoctorView.tsx: 18차 독립 리뷰 (remaining uncaught polls/handlers) ----------
{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx 18차 HIGH-2: the submissions list poll() is invoked with .catch on both the initial call and every interval tick', () => {
    const effectStart = src.indexOf('async function poll() {\n      const result = await listSubmissions()')
    const effectEnd = src.indexOf('}, [mode, retryNonce, tokenVersion])', effectStart)
    const effect = src.slice(effectStart, effectEnd)
    const catchCount = (effect.match(/poll\(\)\.catch\(/g) || []).length
    assert.ok(catchCount >= 2, `expected poll().catch(...) on both the initial call and the setInterval tick, found ${catchCount}`)
    assert.ok(effect.includes('setListLoading(false)'), 'a rejected poll must still clear the loading spinner, not leave it stuck')
  })

  test('DoctorView.tsx 18차 LOW-7: the recorder-results poll() is invoked with .catch on both the initial call and every interval tick', () => {
    const effectStart = src.indexOf('async function poll() {\n      const result = await getRecorderResults(visitId)')
    const effectEnd = src.indexOf('}, [mode, selectedRecord?.visit_id])', effectStart)
    const effect = src.slice(effectStart, effectEnd)
    const catchCount = (effect.match(/poll\(\)\.catch\(/g) || []).length
    assert.ok(catchCount >= 2, `expected poll().catch(...) on both the initial call and the setInterval tick, found ${catchCount}`)
  })

  test('DoctorView.tsx 18차 LOW-6: handleStartRevisit and handleReissueSession both surface an error instead of failing silently on a rejected call', () => {
    const startFn = src.slice(src.indexOf('async function handleStartRevisit() {'), src.indexOf('async function handleReissueSession() {'))
    assert.ok(/catch \{\s*\n[\s\S]*?setRevisitActionError\(/.test(startFn), 'handleStartRevisit must set revisitActionError on a rejected startRevisit() call')
    const reissueFn = src.slice(src.indexOf('async function handleReissueSession() {'), src.indexOf('async function handleInvalidateSession() {'))
    assert.ok(/catch \{\s*\n[\s\S]*?setRevisitActionError\(/.test(reissueFn), 'handleReissueSession must set revisitActionError on a rejected reissueFollowUpSession() call')
  })
}

// ---------- 9. MessagingPanel.tsx: 18차 독립 리뷰 MEDIUM-5 ----------
// Not independently renderable/bundled elsewhere in this suite (no
// dedicated test file exists for it), so this follows the same structural
// fallback pattern already established for RevisitWorkspace.tsx/DoctorView.tsx
// in this file.
{
  const src = fs.readFileSync('src/doctor/MessagingPanel.tsx', 'utf8')

  test('MessagingPanel.tsx 18차 MEDIUM-5: channel/status labels are guarded against unmapped values instead of leaking a literal "undefined" through the fallback_channel template literal', () => {
    assert.ok(src.includes('function channelLabelOrFallback('), 'must define a guarded channel-label lookup')
    assert.ok(src.includes('function statusLabelOrFallback('), 'must define a guarded status-label lookup')
    assert.ok(
      /m\.fallback_channel \? ` → \$\{channelLabelOrFallback\(m\.fallback_channel\)\} 대체 발송` : ''/.test(src),
      'the fallback_channel template literal must route through the guarded lookup, not CHANNEL_LABEL[...] directly',
    )
    assert.ok(src.includes('{channelLabelOrFallback(m.channel)}'))
    assert.ok(src.includes('{statusLabelOrFallback(m.status)}'))
  })

  test('MessagingPanel.tsx 18차 MEDIUM-5: the message-list fetch has a .catch that surfaces listError instead of failing silently', () => {
    const effectStart = src.indexOf('listVisitMessages(visitId)')
    const effectEnd = src.indexOf('}, [visitId])', effectStart)
    const effect = src.slice(effectStart, effectEnd)
    assert.ok(effect.includes('.catch(() => {'))
    assert.ok(/if \(!cancelled\) setListError\(/.test(effect))
  })
}

console.log(`\n${passed} save-conflict assertions passed.`)
