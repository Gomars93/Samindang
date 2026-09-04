// Round 18: stale-write conflict wiring regression suite.
//
// The server/store-level CAS (expectedUpdatedAt/409/StaleWriteError)
// contract was already fully exercised at the HTTP boundary in
// tests/server.spec.mjs and tests/follow-up-session.spec.mjs (round 17/W4) --
// this file does not repeat that. What is genuinely NEW in this round is the
// client-side conflict handling in DoctorWorkspace.tsx, RevisitWorkspace.tsx
// and (originally) JudgmentPanel.tsx, all built on the shared
// src/doctor/ConflictBanner.tsx. Batch 4.1-D removed JudgmentPanel.tsx
// entirely (§17) -- ObjectiveExamFindingsCard.tsx is now the sole
// remaining client-side writer of `judgment`, and section 4 below records
// how its own already-existing ConflictBanner wiring (§independent HIGH-2)
// picks up the properties JudgmentPanel's tests used to pin.
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

// Core Reduction P6 (Phase 7 UI spec §1.3-#13/#14, §2.10 delta N-4/C-4):
// ConflictBanner itself renders with no collapse control (always unfolded)
// whenever a conflict is detected -- it is a plain <div role="alert">, never
// wrapped in a <details>. Only the DRAFT preview underneath it sits behind
// an explicit click, and that click is not an auto-expanding accordion: the
// <details> defaults closed even when a draft exists (never `open`), so
// nothing about a conflict pre-opens content the clinician has to close
// again -- the draft copy path is the readonly textarea revealed by that
// one click, not a second collapsible layer inside it.
test('ConflictBanner itself renders with no collapse control (always unfolded) whenever a stale-write conflict is detected', () => {
  const withDraft = renderToString(
    React.createElement(ConflictBanner, { onReload: () => {}, draftJson: '{"a":1}' }),
  )
  const withoutDraft = renderToString(React.createElement(ConflictBanner, { onReload: () => {}, draftJson: null }))
  for (const html of [withDraft, withoutDraft]) {
    const bannerOpenTag = html.match(/^<div className="doctor__banner doctor__banner--warning"/) ?? html.match(/^<div class="doctor__banner doctor__banner--warning"/)
    assert.ok(bannerOpenTag, 'the outer banner element is a plain div, not a <details>')
    // the FIRST <details> in the markup (if any) must belong to the draft
    // sub-section, never wrap the banner's own alert content above it.
    const firstDetailsIdx = html.indexOf('<details')
    const alertRoleIdx = html.indexOf('role="alert"')
    assert.ok(alertRoleIdx !== -1 && (firstDetailsIdx === -1 || alertRoleIdx < firstDetailsIdx))
  }
})

test('ConflictBanner draft content stays behind an explicit click-to-reveal action rather than auto-expanding, even though the banner around it is always unfolded', () => {
  const html = renderToString(
    React.createElement(ConflictBanner, { onReload: () => {}, draftJson: '{"a":1}' }),
  )
  const detailsIdx = html.indexOf('<details')
  const detailsTag = html.slice(detailsIdx, html.indexOf('>', detailsIdx) + 1)
  assert.ok(!detailsTag.includes('open'), 'the draft disclosure never auto-opens, even when a real draft exists to show')
  assert.ok(html.includes('doctor__banner__draft'))
})

test('ConflictBanner.tsx never merges anything -- no field-level merge helper/utility referenced', () => {
  const src = stripComments(fs.readFileSync('src/doctor/ConflictBanner.tsx', 'utf8'))
  assert.ok(!/merge/i.test(src), 'inventing field-level merge semantics was explicitly out of scope for this batch')
})

// ---------- 2. DoctorWorkspace.tsx workspace-save conflict wiring ----------

{
  const src = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')

  test('DoctorWorkspace.tsx: imports ConflictBanner and renders it above the V3 shell, before CommonSafetyBanner (Phase 7 §7.1: 레인 밖, 화면 상단)', () => {
    assert.ok(src.includes("import { ConflictBanner } from '../ConflictBanner'"))
    // Core Reduction P2 (Phase 5 Synthesis v1.2 §2.1, Phase 7 UI spec
    // §7.1): ConflictBanner is an operational data-safety warning, not a
    // clinical one -- it now renders OUTSIDE every lane, at the very top
    // of the screen (before `.doctor__visitShell`/CommonSafetyBanner), per
    // §7.1's warning-hierarchy table ("4. stale/conflict | 레인 밖, 화면
    // 상단"). It used to render just after CommonSafetyBanner, inside the
    // workspace-profile area that no longer exists (§2.4 retires the
    // profile switcher entirely) -- see the P2/P3 test elsewhere pinning
    // that removal.
    const banner = src.indexOf('{conflict && (')
    const shell = src.indexOf('doctor__visitShell')
    const safety = src.indexOf('<CommonSafetyBanner')
    assert.ok(banner !== -1 && shell !== -1 && safety !== -1)
    assert.ok(banner < shell && shell < safety, 'ConflictBanner must render before the V3 shell, which itself renders before CommonSafetyBanner')
    assert.ok(!src.includes('workspace__profileBar'), 'the profile switcher this banner used to sit next to no longer exists (§2.4)')
  })

  test('DoctorWorkspace.tsx: autosave effect fails closed on a pending conflict (no retry until reload)', () => {
    const effectStart = src.indexOf('useEffect(() => {\n    if (skipNextSaveRef.current) {')
    const effectEnd = src.indexOf('}, [workspaceState, submissionId, conflict])')
    assert.ok(effectStart !== -1 && effectEnd !== -1, 'the autosave effect must exist with the expected dependency array')
    const effectBody = src.slice(effectStart, effectEnd)
    const guardIndex = effectBody.indexOf('if (conflict) return')
    // P0-8 (Core Reduction Phase 6 gate): the actual save attempt is now
    // extracted into `performSave` (so the P0-8 auth-recovery action can
    // call it directly, not only the debounce timer) -- the effect just
    // schedules it.
    const timeoutIndex = effectBody.indexOf('setTimeout(performSave, SAVE_DEBOUNCE_MS)')
    assert.ok(guardIndex !== -1 && timeoutIndex !== -1)
    assert.ok(guardIndex < timeoutIndex, 'the conflict guard must run BEFORE any save attempt is scheduled')
  })

  test('DoctorWorkspace.tsx: a conflict outcome stops the effect from touching lastSavedRef (the unsaved draft is never marked saved)', () => {
    // P0-8 (Core Reduction Phase 6 gate): the save logic moved from an
    // inline setTimeout callback into the extracted `performSave` function
    // (one indentation level shallower) -- the end delimiter below tracks
    // that shift; `else {` here is performSave's own generic-failure branch.
    const branch = src.slice(src.indexOf('} else if (result.conflict) {'), src.indexOf('} else {\n      setLastSaveErrorKind'))
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

  // P0-8 follow-up hardening: lastSaveErrorKind is a NEW per-record piece of
  // UI state this round added (Core Reduction P0-8) -- must join the SAME
  // cross-patient reset block as conflict/preConflictDraft above, or an
  // auth-failure banner from the OLD record could in principle survive a
  // record switch (in practice every failure path already re-sets it
  // together with saveStatus in the same branch, so this was never
  // actually visibly stale -- this is defense in depth against a future
  // refactor silently breaking that co-set invariant).
  test('DoctorWorkspace.tsx: switching records also clears lastSaveErrorKind (P0-8 auth-recovery state joins the same cross-patient reset)', () => {
    const resetBlock = src.slice(src.indexOf('if (recordKey !== lastSeenRecordKey) {'), src.indexOf('if (recordKey !== lastSeenRecordKey) {') + 1400)
    assert.ok(resetBlock.includes('setLastSaveErrorKind(null)'))
  })

  // Real two-browser-context QA (round 18) initially caught a false-positive
  // conflict here: initialRecordUpdatedAt can legitimately advance for the
  // SAME record without DoctorWorkspace ever saving anything (the "mark as
  // viewed" status write, or a sibling judgment save -- originally
  // JudgmentPanel's own "기록" click, now ObjectiveExamFindingsCard's
  // immediate per-field save, Batch 4.1-D §17.3) -- without syncing to it,
  // DoctorWorkspace's own first autosave attempt on almost every record
  // 409'd against its own sibling's write.
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
    assert.ok(/const fresh = seedWorkspaceState\(initialWorkspaceState, synthetic, payload\)/.test(effect))
    assert.ok(/lastKnownUpdatedAtRef\.current = initialRecordUpdatedAt/.test(effect))
    assert.ok(/lastSavedRef\.current = fresh/.test(effect), 'lastSavedRef must advance to the SAME fresh content, not just the token')
    assert.ok(/setWorkspaceState\(fresh\)/.test(effect), 'workspaceState itself must be replaced with the fresh content -- the exact HIGH finding this guards against')
    assert.ok(/skipNextSaveRef\.current = true/.test(effect), 'must not immediately re-PUT the just-adopted content back at the server')
  })

  // ---------- P0-8 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.9):
  // auth-failure inline recovery ----------
  //
  // MAJOR-3 (Phase 10 closing review): block ⑤'s fixed 20px budget can only
  // ever hold VisitSummaryAside's own 1-line "인증 만료 — 토큰 다시 입력"
  // action -- the full `<DoctorTokenSetup>` banner (>=100px) was silently
  // clipping there and is not shown inline any more. Clicking the action
  // calls `onOpenTokenReentry`, which DoctorWorkspace.tsx wires to open the
  // actual token form OUTSIDE the left summary's budget, at the top of the
  // right work column's lane1 section.
  const asideSrc = fs.readFileSync('src/doctor/workspace/VisitSummaryAside.tsx', 'utf8')

  test('VisitSummaryAside.tsx: block ⑤ auth failure renders a 1-line action button, never the full DoctorTokenSetup form inline (that clipped at 20px)', () => {
    assert.ok(!asideSrc.includes("import { DoctorTokenSetup } from '../DoctorTokenSetup'"), 'DoctorTokenSetup must no longer be imported/rendered here')
    assert.ok(
      /saveStatus === 'error' && lastSaveErrorKind === 'auth'\) \{\s*\/\/[\s\S]{0,400}?saveRow = \(\s*<button type="button" className="doctor__visitSummary__authBtn"/.test(asideSrc),
      'the auth branch must render the 1-line action button, not DoctorTokenSetup',
    )
    assert.ok(asideSrc.includes('인증 만료 — 토큰 다시 입력'), 'Phase 7 §3.2 literal wording')
  })

  test("VisitSummaryAside.tsx: a generic (non-auth) save failure keeps the existing '저장 실패' text, not the token recovery", () => {
    assert.ok(/saveRow = '저장 실패 — 다시 시도해주세요'/.test(asideSrc))
  })

  test('DoctorWorkspace.tsx: performSave records the failure kind on a generic error, and clears it (plus any open token-reentry form) on success', () => {
    const fnStart = src.indexOf('async function performSave() {')
    const fnEnd = src.indexOf('// Debounced autosave')
    assert.ok(fnStart !== -1 && fnEnd !== -1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/setLastSaveErrorKind\(null\)/.test(fn), 'a successful save must clear any earlier error-kind state')
    assert.ok(/setTokenReentryOpen\(false\)/.test(fn), 'a successful save must also close any open token-reentry form (MAJOR-3)')
    assert.ok(/setLastSaveErrorKind\(result\.kind \?\? 'other'\)/.test(fn), 'a generic failure must record the failure kind (not just flip to the error status)')
  })

  test('DoctorWorkspace.tsx: clicking the auth-recovery action (VisitSummaryAside\'s onOpenTokenReentry) opens the token form at the top of the lane1 section, outside the left summary\'s budget', () => {
    assert.ok(
      /onOpenTokenReentry=\{\(\) => setTokenReentryOpen\(true\)\}/.test(src),
      'VisitSummaryAside must be wired to open the form, not to retry directly itself',
    )
    const lane1Start = src.indexOf('<section className="doctor__visitLane doctor__visitLane--lane1"')
    const lane1SafetyBanner = src.indexOf('<CommonSafetyBanner payload={payload} />')
    assert.ok(lane1Start !== -1 && lane1SafetyBanner !== -1 && lane1Start < lane1SafetyBanner)
    const lane1Head = src.slice(lane1Start, lane1SafetyBanner)
    assert.ok(
      /lastSaveErrorKind === 'auth' && tokenReentryOpen && \(\s*<DoctorTokenSetup/.test(lane1Head),
      'the actual DoctorTokenSetup form must render at the top of the lane1 section, gated on both the failure kind and the click-to-open state',
    )
    assert.ok(
      /onSet=\{\(\) => \{\s*setTokenReentryOpen\(false\)\s*setLastSaveErrorKind\(null\)\s*void performSave\(\)/.test(lane1Head),
      're-entering the token must close the form, clear the error, and retry the save directly',
    )
  })

  test('DoctorView.tsx: the workspace-save callback passes the ServerResult kind through on a plain (non-conflict) failure', () => {
    const viewSrc = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
    const block = viewSrc.slice(viewSrc.indexOf('onSaveWorkspace={'), viewSrc.indexOf('onSaveWorkspace={') + 2200)
    assert.ok(/return \{ ok: false, kind: result\.kind \}/.test(block))
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

// ---------- 4. JudgmentPanel.tsx judgment-save conflict wiring -- SUPERSEDED (Batch 4.1-D) ----------
//
// Batch 4.1-D (§17.1/§17.2/§17.5): JudgmentPanel had ZERO editable fields
// left after 4.1-A/4.1-C (the 사주 예상/치료축/처방 방향 block, then
// innate_features/symptom_links, then -- this batch -- 1분 디브리핑 and
// 학습 케이스) -- the two safety fields it still echoed were already
// READ-ONLY there, edited only through ObjectiveExamFindingsCard. So
// `src/doctor/JudgmentPanel.tsx` itself, and the whole "기록" button +
// draft/version-sync/conflict machinery the 11 tests below used to pin, are
// gone. Each retired test's PROPERTY is accounted for like this (CLAUDE.md
// "지운 경로 1개당 소스 단언 1개", both directions):
//
//   Retired test (JudgmentPanel.tsx)                          | Where that property lives now
//   -----------------------------------------------------------|----------------------------------------------------
//   imports+renders ConflictBanner before editable fields      | ObjectiveExamFindingsCard HIGH-2 "imports and renders
//                                                                | the shared ConflictBanner" (below, §independent HIGH-2)
//   handleRecord fails closed on a pending conflict             | N/A -- ObjectiveExamFindingsCard has no "기록" button /
//                                                                | pending-conflict gate to fail closed on: every field
//                                                                | saves immediately on selection, and a fresh selection
//                                                                | always clears any prior conflict first ("a fresh
//                                                                | onChange call always clears any prior conflict... before
//                                                                | attempting to save", below) -- a different, not a missing,
//                                                                | design for the same "never silently overwrite" property
//   rejected save never marks the record as recorded            | N/A -- there is no separate "recorded" echo state; the
//                                                                | radio's own `checked` value IS the record, and "on a
//                                                                | conflict result, the clinician's local radio selection is
//                                                                | never reset" (below) is the direct analog
//   conflict branch leaves typed judgment/debrief untouched     | "on a conflict result... never reset -- only status/
//                                                                | conflict state changes" (below, ObjectiveExamFindingsCard
//                                                                | HIGH-2) -- ClinicianJudgment.debrief no longer has any
//                                                                | editable UI at all (§17.2), so nothing there to protect
//   reload adopts server value verbatim, no draft merge         | "handleReloadObjectiveExamConflict adopts the server's
//                                                                | current judgment/updated_at verbatim -- no field-level
//                                                                | merge helper referenced" (below, §independent HIGH-2) +
//                                                                | "MINOR-1... re-seeds BOTH lbp and shoulder... snapshot"
//   version-sync effect: adopt newer token only if draft pristine,
//   adopt fresh CONTENT together with the token (not token alone)| N/A -- ObjectiveExamFindingsCard has no such effect to
//                                                                | begin with. It never holds an in-progress "draft" that
//                                                                | could go stale against a fresher external judgment mid-
//                                                                | session -- each field saves the instant it is picked, so
//                                                                | there is nothing for a pristine-draft version-sync effect
//                                                                | to protect. This concept genuinely does not carry over,
//                                                                | it is not merely untested.
//   successful save snapshots the LIVE judgment (not `finalized`)| N/A -- ObjectiveExamFindingsCard never calls
//                                                                | finalizeJudgment or keeps its own pristine-comparison ref;
//                                                                | DoctorView.tsx's handleSaveObjectiveExamField (tested
//                                                                | separately, §independent HIGH-2 below) always saves the
//                                                                | CURRENT selectedRecord.judgment merged with the new field,
//                                                                | never a locally-finalized snapshot
//   DoctorTokenSetup shown inline for kind==='auth'              | ObjectiveExamFindingsCard still has this: `{authError &&
//                                                                | <DoctorTokenSetup authFailed .../>}` (unchanged by this
//                                                                | batch -- not retested here since this batch did not touch it)
//   auth-kind failure distinguished from generic; both success/
//   conflict clear earlier auth-recovery state                  | Same as above -- ObjectiveExamFindingsCard's own authError
//                                                                | state (unchanged by this batch)
//   DoctorView.tsx's judgment-save onSave callback passes
//   result.kind through on a plain failure                      | That specific inline callback (built into the removed
//                                          | <JudgmentPanel onSave={...}> JSX) is gone with the JSX. The
//                                          | ONE client-side judgment-save path left,
//                                          | handleSaveObjectiveExamField, already does the same
//                                          | `return { ok: false, kind: result.kind }` and is tested at
//                                          | "DoctorView.tsx HIGH-2: ..." below (§independent HIGH-2) --
//                                          | see also the structural check right below this comment.
//
// This structural check pins the stronger fact (the file itself, not one
// property inside it, is gone) that makes all 11 retired tests moot:
test('JudgmentPanel.tsx no longer exists (Batch 4.1-D §17.1/§17.2/§17.5) -- the 11 conflict-wiring tests this section used to hold are superseded per the table above, not deleted without a trace', () => {
  assert.equal(fs.existsSync('src/doctor/JudgmentPanel.tsx'), false, 'src/doctor/JudgmentPanel.tsx must not exist')
  const viewSrc = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
  assert.ok(!viewSrc.includes('<JudgmentPanel'), 'DoctorView.tsx must no longer render <JudgmentPanel>')
})

// ---------- 4.6. P0-7 -- SUPERSEDED (Batch 4.1-D) ----------
// The "기록된 판단 (JSON...)" summary label this section pinned lived
// entirely inside JudgmentPanel.tsx, now gone (see the table above). No
// replacement needed: ObjectiveExamFindingsCard has no equivalent "기록된
// 판단" JSON dump at all (§17.4 -- that dump was judged intentional-loss
// scope in the design brief, its only remaining editable content being the
// two safety fields already visible live on their own radios).

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

  // Batch 4.1-D (§17.1/§17.2): the JudgmentPanel-owned `onSave={...}` JSX
  // callback this test used to anchor on (`<JudgmentPanel ... onSave={`) is
  // gone along with the JSX itself -- `handleSaveObjectiveExamField` is now
  // the ONLY client-side judgment-save path, and it does the identical
  // `result.errorBody?.current` / `current.judgment` translation (already
  // separately pinned by "DoctorView.tsx HIGH-2: a 409 with a server
  // `current` record returns a conflict outcome..." below, §independent
  // HIGH-2) -- re-anchored here on that function's own boundaries instead
  // of a JudgmentPanel tag that no longer exists.
  test('DoctorView.tsx: judgment save (handleSaveObjectiveExamField) reads errorBody.current and passes current.judgment through as-is (ClinicianJudgment | null)', () => {
    const fnStart = src.indexOf('async function handleSaveObjectiveExamField(')
    const fnEnd = src.indexOf('\n  }', fnStart)
    assert.ok(fnStart !== -1 && fnEnd !== -1, 'handleSaveObjectiveExamField must exist')
    const block = src.slice(fnStart, fnEnd)
    assert.ok(block.includes('result.errorBody?.current'))
    assert.ok(block.includes('current.judgment'))
  })

  // Batch 4.1-D: the second half of this test (`saveJudgmentToServer(
  // selectedId, judgment, expectedUpdatedAt ?? undefined)`) pinned
  // JudgmentPanel's own onSave callback, now gone. The ONLY
  // `saveJudgmentToServer` call site left is handleSaveObjectiveExamField's
  // (`saveJudgmentToServer(selectedId, next, selectedRecord?.updated_at)`)
  // -- re-pinned below against that call, alongside the still-current
  // workspace half.
  test('DoctorView.tsx: both save callbacks pass their CAS precondition through to the server client (not dropped)', () => {
    assert.ok(/saveWorkspaceStateToServer\(selectedId, state, expectedUpdatedAt \?\? undefined\)/.test(src))
    assert.ok(/saveJudgmentToServer\(selectedId, next, selectedRecord\?\.updated_at\)/.test(src))
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
    // P1 (Core Reduction Phase 6 gate): this row's rendering moved from
    // DoctorView.tsx into src/doctor/TodayUnifiedQueueSection.tsx (the
    // unified "오늘" Queue) -- same guard, new file, new local variable
    // name (`source` -- the RevisitQueueItem looked up by visit id -- in
    // place of the old inline `rv`).
    const unifiedSrc = fs.readFileSync('src/doctor/TodayUnifiedQueueSection.tsx', 'utf8')
    assert.ok(
      /source\?\.deliveryMode &&\s*\n\s*Object\.prototype\.hasOwnProperty\.call\(DELIVERY_MODE_LABEL, source\.deliveryMode\) &&/.test(
        unifiedSrc,
      ),
      'must validate source.deliveryMode is a known DELIVERY_MODE_LABEL key before indexing it, never leaking a literal "undefined"',
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

// ---------- 10. src/lib/serverClient.ts: 19차 독립 리뷰 (element-level filtering + single-object hardening) ----------
// 18차가 컨테이너(배열/객체) 자체의 모양은 검증했지만, `Array.isArray()`는
// 배열 원소 하나하나의 모양까지는 보장하지 않는다 -- 원소가 null/원시값이면
// 통과한 뒤 개별 필드 접근에서 그대로 throw했다. 19차는 이 gap을 닫는
// filterValidObjectElements<T>() 헬퍼를 도입하고, 남아있던 단일-객체
// 응답(createEpisode/createMedicationCourse/getMicroFollowUpResponse)까지
// 컨테이너 검증을 확장했다.
{
  const src = fs.readFileSync('src/lib/serverClient.ts', 'utf8')

  test('serverClient.ts 19차: a shared filterValidObjectElements<T>() helper exists for element-level filtering', () => {
    assert.ok(/function filterValidObjectElements<T>\(arr: unknown\[\]\): T\[\] \{/.test(src))
    assert.ok(/return arr\.filter\(\(v\): v is T => v != null && typeof v === 'object'\)/.test(src))
  })

  test('serverClient.ts 19차 HIGH-1: every array-returning list*/get* function filters element shape, not just container shape', () => {
    for (const [fnName, field, type] of [
      ['listEpisodesByPatient', 'episodes', 'Episode'],
      ['listEpisodeTasks', 'tasks', 'CrmTask'],
      ['listMedicationCoursesByEpisode', 'courses', 'MedicationCourseRecord'],
      ['getRecorderResults', 'results', undefined],
      ['listCrmTasks', 'tasks', 'CrmTask'],
      ['listVisitMessages', 'messages', undefined],
      ['listSubmissions', undefined, undefined],
    ]) {
      const fnStart = src.indexOf(`export function ${fnName}(`)
      assert.ok(fnStart !== -1, `${fnName} must exist`)
      const fnEnd = src.indexOf('\nexport function', fnStart + 1)
      const fn = src.slice(fnStart, fnEnd === -1 ? fnStart + 2000 : fnEnd)
      assert.ok(
        /filterValidObjectElements</.test(fn),
        `${fnName} must filter its array elements via filterValidObjectElements, not just Array.isArray the container`,
      )
    }
  })

  test('serverClient.ts 19차 HIGH-1: listRevisitQueue and listStations also filter element shape before their own .map() runs', () => {
    for (const fnName of ['listRevisitQueue', 'listStations']) {
      const fnStart = src.indexOf(`export function ${fnName}(`)
      assert.ok(fnStart !== -1, `${fnName} must exist`)
      const fnEnd = src.indexOf('\nexport function', fnStart + 1)
      const fn = src.slice(fnStart, fnEnd === -1 ? fnStart + 2000 : fnEnd)
      assert.ok(/filterValidObjectElements</.test(fn), `${fnName} must filter element shape before mapping`)
    }
  })

  test('serverClient.ts 19차 LOW-8: listPatientIdentities filters each per-uuid value being a non-null object, not just the container', () => {
    const fnStart = src.indexOf('export function listPatientIdentities(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(value != null && typeof value === 'object'\) cleaned\[uuid\] = value/.test(fn))
  })

  test('serverClient.ts 19차 LOW-7: getFollowUpSessionStatus guards its single-object response container', () => {
    const fnStart = src.indexOf('export function getFollowUpSessionStatus(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(s != null && typeof s !== 'object'\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 19차 MEDIUM-4: getMicroFollowUpResponse guards its response container before DoctorView.tsx accesses result.data.response', () => {
    const fnStart = src.indexOf('export function getMicroFollowUpResponse(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(result\.data == null \|\| typeof result\.data !== 'object'\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 19차 LOW-6: createEpisode guards its single-object response container before handleCreateEpisode spreads/reads it', () => {
    const fnStart = src.indexOf('export function createEpisode(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(result\.data == null \|\| typeof result\.data !== 'object'\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 19차 LOW-6: createMedicationCourse guards its `course` field before handleCreateCourse reads result.data.course', () => {
    const fnStart = src.indexOf('export function createMedicationCourse(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/result\.data\.course == null \|\| typeof result\.data\.course !== 'object'/.test(fn))
  })
}

// ---------- 11. src/doctor/DoctorView.tsx: 19차 독립 리뷰 MEDIUM-4/5 (cross-patient/visit stale leak on ok:false) ----------
// A DIFFERENT bug class than "uncaught rejection" (already covered by
// section 8 above): here the promise resolves NORMALLY with `ok:false`
// (not a throw), so a bare `if (result.ok) setState(...)` with no else
// silently leaves a PREVIOUS patient's/visit's data on screen.
{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx 19차 MEDIUM-5: the priorVisits effect resets to null on ok:false, not just on a thrown rejection', () => {
    const effectStart = src.indexOf('getPatientHistory(patientId, selectedRecord?.visit_id)')
    const effectEnd = src.indexOf('}, [mode, selectedRecord?.patient_id, selectedRecord?.visit_id])', effectStart)
    const effect = src.slice(effectStart, effectEnd)
    assert.ok(
      /setPriorVisits\(result\.ok \? result\.data : null\)/.test(effect),
      'expected the ok:false branch to explicitly reset priorVisits to null, not leave a prior patient\'s data on screen',
    )
    assert.ok(effect.includes('.catch(() => {'), 'must still catch a thrown rejection too (a different completion shape)')
  })

  test('DoctorView.tsx 19차 MEDIUM-4: the microFollowUpResponse effect resets to null on ok:false, not just on a thrown rejection', () => {
    const effectStart = src.indexOf('getMicroFollowUpResponse(visitId)')
    const effectEnd = src.indexOf('}, [mode, selectedRecord?.visit_id])', effectStart)
    const effect = src.slice(effectStart, effectEnd)
    assert.ok(
      /setMicroFollowUpResponse\(result\.ok \? result\.data\.response : null\)/.test(effect),
      'expected the ok:false branch to explicitly reset microFollowUpResponse to null, not leave a prior visit\'s data on screen',
    )
    assert.ok(effect.includes('.catch(() => {'), 'must still catch a thrown rejection too (a different completion shape)')
  })
}

// ---------- 12. 20차 독립 리뷰 (delta-focused closing gate) ----------
// HIGH-1/MEDIUM-1/MEDIUM-2: DoctorRecordFallback (error-boundary-external
// render path) reads getSubmission()'s raw output -- the one doctor read
// path the 19차 "exhaustive sweep" left completely unguarded. Genuine
// render-level proof of the fallback fix lives in tests/doctor.spec.mjs
// (DoctorRecordFallback is bundled there); this section covers the
// non-renderable serverClient.ts/MessagingPanel.tsx pieces of the same
// round using the established structural-regex fallback.
{
  const src = fs.readFileSync('src/lib/serverClient.ts', 'utf8')

  test('serverClient.ts 20차 HIGH-1: getSubmission guards its response container before DoctorRecordFallback (error-boundary-external) reads it', () => {
    const fnStart = src.indexOf('export function getSubmission(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(result\.data == null \|\| typeof result\.data !== 'object'\) return invalidResponseShape\(\)/.test(fn))
  })

  test('serverClient.ts 20차 LOW-3: queueRevisitMessage/retryRevisitMessage/cancelRevisitMessage each guard their response container before MessagingPanel.tsx\'s upsertMessage pushes it into state', () => {
    for (const fnName of ['queueRevisitMessage', 'retryRevisitMessage', 'cancelRevisitMessage']) {
      const fnStart = src.indexOf(`export function ${fnName}(`)
      assert.ok(fnStart !== -1, `${fnName} must exist`)
      const fnEnd = src.indexOf('\nexport function', fnStart + 1)
      const fn = src.slice(fnStart, fnEnd === -1 ? fnStart + 1000 : fnEnd)
      assert.ok(
        /if \(result\.data == null \|\| typeof result\.data !== 'object'\) return invalidResponseShape\(\)/.test(fn),
        `${fnName} must guard its response container`,
      )
    }
  })
}

{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx 20차 MEDIUM-2: statusLabel falls back to "확인 필요" for an unrecognized/non-string status instead of echoing the raw value', () => {
    const fnStart = src.indexOf('function statusLabel(status: unknown): string {')
    assert.ok(fnStart !== -1, 'statusLabel must accept unknown, not the old SubmissionSummary[\'status\']-typed signature')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.match(fn, /default:\s*\n\s*return '확인 필요'/)
  })

  test('DoctorView.tsx 20차 HIGH-1/MEDIUM-1: formatTimestamp/safeStringOrFallback exist and fail closed to "확인 필요" for non-string/invalid input', () => {
    assert.match(src, /function formatTimestamp\(value: unknown\): string \{/)
    assert.match(src, /function safeStringOrFallback\(value: unknown\): string \{/)
  })

  test('DoctorView.tsx 20차 HIGH-1/MEDIUM-1/MEDIUM-2: DoctorRecordFallback routes patient_label/created_at/status through the guarded helpers, not raw field access', () => {
    const fnStart = src.indexOf('export function DoctorRecordFallback(')
    const fnEnd = src.indexOf('\nconst POLL_MS', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.match(fn, /safeStringOrFallback\(record\.patient_label\)/)
    assert.match(fn, /formatTimestamp\(record\.created_at\)/)
    assert.match(fn, /statusLabel\(record\.status\)/)
  })

  test('DoctorView.tsx 20차: every remaining `new Date(...).toLocaleString(\'ko-KR\')` call site was replaced with formatTimestamp (no raw "Invalid Date" leak sites left)', () => {
    assert.equal((src.match(/new Date\([^)]*\)\.toLocaleString\('ko-KR'\)/g) ?? []).length, 0)
  })

  test('DoctorView.tsx 20차: relativeTime accepts unknown and fails closed to empty string on a non-string/invalid value (no "NaN일 전" leak)', () => {
    const fnStart = src.indexOf('function relativeTime(iso: unknown): string {')
    assert.ok(fnStart !== -1, 'relativeTime must accept unknown, not the old string-typed signature')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.match(fn, /if \(typeof iso !== 'string'\) return ''/)
  })

  test('DoctorView.tsx 20차: the submissions-list row routes patient_label through a fail-closed guard (same class as DoctorRecordFallback)', () => {
    // P1 (Core Reduction Phase 6 gate): this row moved into the unified
    // "오늘" Queue's row-builder (src/doctor/todayQueue.ts) -- same
    // fail-closed discipline (never renders a non-string/empty
    // patient_label raw), a locally-inlined guard rather than the
    // reused `safeStringOrFallback` helper (that helper stays local to
    // DoctorView.tsx; todayQueue.ts is a standalone pure module).
    const todayQueueSrc = fs.readFileSync('src/doctor/todayQueue.ts', 'utf8')
    assert.match(
      todayQueueSrc,
      /typeof s\.patient_label === 'string' && s\.patient_label\.trim\(\) !== '' \? s\.patient_label : '확인 필요'/,
    )
  })

  test('DoctorView.tsx 20차: the readyToast.patientLabel (rendered raw at the EMR-ready toast) also routes through safeStringOrFallback', () => {
    assert.match(src, /safeStringOrFallback\(result\.data\.find\(\(s\) => s\.id === firstId\)\?\.patient_label \?\? ''\)/)
  })
}

{
  const src = fs.readFileSync('src/doctor/MessagingPanel.tsx', 'utf8')

  test('MessagingPanel.tsx 20차 LOW-2: attempt_count/max_attempts render through safeCount, not raw template-literal interpolation (no "(undefined/undefined회 시도)" leak)', () => {
    assert.match(src, /function safeCount\(value: unknown\): string \{/)
    assert.match(
      src,
      /\$\{safeCount\(m\.attempt_count\)\}\/\$\{safeCount\(m\.max_attempts\)\}회 시도/,
    )
  })

  test('MessagingPanel.tsx 20차 LOW-2: error_code renders through safeErrorCode, not raw template-literal interpolation (no "[object Object]" leak)', () => {
    assert.match(src, /function safeErrorCode\(value: unknown\): string \{/)
    assert.match(src, /오류: \$\{safeErrorCode\(m\.error_code\)\}/)
  })
}

// ---------- 13. 21차 독립 리뷰 (delta-focused closing gate on round 20's own delta) ----------
{
  const src = fs.readFileSync('src/lib/serverClient.ts', 'utf8')

  test('serverClient.ts 21차 MEDIUM-2: setSubmissionStatus guards its response container before feeding the same selectedRecord sink getSubmission (20차) protects', () => {
    const fnStart = src.indexOf('export function setSubmissionStatus(')
    const fnEnd = src.indexOf('\nexport function', fnStart + 1)
    const fn = src.slice(fnStart, fnEnd)
    assert.ok(/if \(result\.data == null \|\| typeof result\.data !== 'object'\) return invalidResponseShape\(\)/.test(fn))
  })
}

{
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx 21차 HIGH-1: recordToPayload guards record.submission being a non-null plain object before destructuring it (the render-body call site that runs before isDoctorPayloadShapeUsable)', () => {
    const fnStart = src.indexOf('export function recordToPayload(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.match(fn, /const s = isPlainObject\(record\.submission\) \? record\.submission : \{\}/)
  })

  test('DoctorView.tsx 21차 LOW-2: the MedicationCourseSection mount inside DoctorRecordFallback type-gates patient_id (typeof === "string"), not just a truthy check', () => {
    assert.match(
      src,
      /\{typeof record\?\.patient_id === 'string' && record\.patient_id && \(\s*<MedicationCourseSection key=\{record\.patient_id\} patientUuid=\{record\.patient_id\} \/>\s*\)\}/,
    )
  })
}

{
  const src = fs.readFileSync('src/doctor/TodayQueueSection.tsx', 'utf8')

  test('TodayQueueSection.tsx 21차 MEDIUM-1: dueStateLabel routes task.due_at through the guarded formatTimestamp helper, not a raw new Date(...).toLocaleString(\'ko-KR\') (no "Invalid Date" leak for corrupted CRM due_at)', () => {
    assert.match(src, /function formatTimestamp\(value: unknown\): string \{/)
    assert.doesNotMatch(src, /new Date\([^)]*\)\.toLocaleString\('ko-KR'\)/)
    const fnStart = src.indexOf('function dueStateLabel(')
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    assert.match(fn, /formatTimestamp\(task\.due_at\)/)
  })

  test('TodayQueueSection.tsx 21차 LOW-1: claimed_by/owner_clinician render through safeStringOrFallback, not raw template-literal interpolation (no "[object Object]" leak)', () => {
    assert.match(src, /function safeStringOrFallback\(value: unknown\): string \{/)
    assert.match(src, /담당: \$\{safeStringOrFallback\(task\.claimed_by\)\}/)
    assert.match(src, /소속: \$\{safeStringOrFallback\(task\.owner_clinician\)\}/)
  })
}

// ---------- 독립 검수 HIGH-2: ObjectiveExamFindingsCard stale-write conflict ----------
// (같은 클래스의 검증 방식 -- 이 스위트 헤더 코멘트 참고: useState/
// useEffect 기반 인터랙티브 로직은 renderToString으로 이벤트를 재현할 수
// 없어, 여기서는 구조적 source-level guard로 "자동 retry/merge가 없다"를
// 증명하고, 실제 두 writer 경쟁 시나리오는 tests/server.spec.mjs의 CAS
// (expected_updated_at/409) 테스트(필드 무관, judgment PUT 라우트 공통)
// + 실제 브라우저 QA로 확인한다.
{
  const viewSrc = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')

  test('DoctorView.tsx HIGH-2: handleSaveObjectiveExamField calls saveJudgmentToServer exactly once -- no automatic retry after a 409', () => {
    const fnStart = viewSrc.indexOf('async function handleSaveObjectiveExamField(')
    const fnEnd = viewSrc.indexOf('\n  }', fnStart)
    const fn = viewSrc.slice(fnStart, fnEnd)
    const calls = fn.match(/saveJudgmentToServer\(/g) ?? []
    assert.equal(calls.length, 1, 'exactly one save attempt per call -- a second call would be the auto-retry this fix removes')
  })

  test('DoctorView.tsx HIGH-2: a 409 with a server `current` record returns a conflict outcome, never a second merged save', () => {
    const fnStart = viewSrc.indexOf('async function handleSaveObjectiveExamField(')
    const fnEnd = viewSrc.indexOf('\n  }', fnStart)
    const fn = viewSrc.slice(fnStart, fnEnd)
    assert.match(fn, /return \{ ok: false, conflict: \{ current: current\.judgment, currentUpdatedAt: current\.updated_at \} \}/)
    // The old auto-retry shape ("rebase onto the server's CURRENT judgment
    // and retry") must be gone -- no second `attempt(...)`/merge call in
    // the failure branch.
    assert.doesNotMatch(fn, /attempt\(current\.judgment/)
  })

  test('DoctorView.tsx HIGH-2: handleReloadObjectiveExamConflict adopts the server\'s current judgment/updated_at verbatim -- no field-level merge helper referenced', () => {
    const fnStart = viewSrc.indexOf('function handleReloadObjectiveExamConflict(')
    const fnEnd = viewSrc.indexOf('\n  }', fnStart)
    const fn = viewSrc.slice(fnStart, fnEnd)
    assert.match(fn, /judgment: current, updated_at: currentUpdatedAt/)
  })
}

{
  const cardSrc = fs.readFileSync('src/doctor/ObjectiveExamFindingsCard.tsx', 'utf8')

  test('ObjectiveExamFindingsCard HIGH-2: imports and renders the shared ConflictBanner, not a bespoke conflict UI', () => {
    assert.match(cardSrc, /import \{ ConflictBanner \} from '\.\/ConflictBanner'/)
    assert.match(cardSrc, /<ConflictBanner/)
  })

  test('ObjectiveExamFindingsCard HIGH-2: on a conflict result, the clinician\'s local radio selection is never reset -- only status/conflict state changes', () => {
    const fnStart = cardSrc.indexOf('async function handleChange(')
    const fnEnd = cardSrc.indexOf('\n  }', fnStart)
    const fn = cardSrc.slice(fnStart, fnEnd)
    const conflictBranchStart = fn.indexOf('else if (result.conflict)')
    const conflictBranchEnd = fn.indexOf('} else if (result.kind', conflictBranchStart)
    const conflictBranch = fn.slice(conflictBranchStart, conflictBranchEnd)
    // The branch must set status/conflict state only -- it must never call
    // applyLocal/setLbp/setShoulder (that would silently discard or
    // overwrite the clinician's just-picked value).
    assert.doesNotMatch(conflictBranch, /applyLocal\(/)
    assert.match(conflictBranch, /setStatus\('conflict'\)/)
    assert.match(conflictBranch, /setConflict\(\{/)
  })

  test('ObjectiveExamFindingsCard HIGH-2: a fresh onChange call always clears any prior conflict for that field before attempting to save (`setConflict(null)` precedes the save)', () => {
    const fnStart = cardSrc.indexOf('async function handleChange(')
    const applyLocalCallIdx = cardSrc.indexOf('applyLocal(value)', fnStart)
    const setConflictNullIdx = cardSrc.indexOf('setConflict(null)', fnStart)
    const onSaveCallIdx = cardSrc.indexOf('await onSave(field, value)', fnStart)
    assert.ok(applyLocalCallIdx < setConflictNullIdx && setConflictNullIdx < onSaveCallIdx)
  })

  test('ObjectiveExamFindingsCard HIGH-2: the resetKey (record-switch) block also clears both fields\' conflict state -- a stale conflict must not leak to the next patient', () => {
    const resetBlockStart = cardSrc.indexOf('if (resetKey !== lastSeenResetKey)')
    const resetBlockEnd = cardSrc.indexOf('\n  }', resetBlockStart)
    const resetBlock = cardSrc.slice(resetBlockStart, resetBlockEnd)
    assert.match(resetBlock, /setLbpConflict\(null\)/)
    assert.match(resetBlock, /setShoulderConflict\(null\)/)
  })

  test('ObjectiveExamFindingsCard HIGH-2: shoulder field has the identical conflict-handling contract as lbp (parity -- same ConflictBanner wiring, same reload handler shape)', () => {
    const lbpConflictBanner = cardSrc.match(/\{lbpConflict && \(\s*<ConflictBanner[\s\S]*?\/>\s*\)\}/)
    const shoulderConflictBanner = cardSrc.match(/\{shoulderConflict && \(\s*<ConflictBanner[\s\S]*?\/>\s*\)\}/)
    assert.ok(lbpConflictBanner, 'lbp field renders a ConflictBanner when lbpConflict is set')
    assert.ok(shoulderConflictBanner, 'shoulder field renders a ConflictBanner when shoulderConflict is set')
    assert.match(cardSrc, /handleReloadConflict\(lbpConflict, setLbpStatus, setLbpConflict\)/)
    assert.match(cardSrc, /handleReloadConflict\(shoulderConflict, setShoulderStatus, setShoulderConflict\)/)
  })

  test('ObjectiveExamFindingsCard MINOR-1 (post-review): reloading EITHER field\'s conflict re-seeds BOTH lbp and shoulder from the full server judgment snapshot, not just the field that conflicted -- a stale sibling radio next to its already-refreshed SafetyPanel would be a visible safety-surface inconsistency', () => {
    const fnStart = cardSrc.indexOf('function handleReloadConflict(')
    const fnEnd = cardSrc.indexOf('\n  }', fnStart)
    const fn = cardSrc.slice(fnStart, fnEnd)
    assert.match(fn, /setLbp\(\(conflict\.current\?\.lbp_objective_motor_deficit/)
    assert.match(fn, /setShoulder\(\(conflict\.current\?\.shoulder_objective_cuff_weakness/)
  })

  test('ObjectiveExamFindingsCard HIGH-2: the plain save-status text is suppressed while a conflict is active (never shown alongside the ConflictBanner)', () => {
    assert.match(cardSrc, /lbpStatus !== 'idle' && lbpStatus !== 'conflict'/)
    assert.match(cardSrc, /shoulderStatus !== 'idle' && shoulderStatus !== 'conflict'/)
  })
}

console.log(`\n${passed} save-conflict assertions passed.`)
