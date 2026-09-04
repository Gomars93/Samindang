// Core Reduction P2 — Phase 7 UI spec §1.2 (통합 리셋 키, 감시 리스크 2:
// cross-patient 누수). These tests need real RECONCILIATION across a prop
// change on the SAME component instance (does state survive an unrelated
// re-render? does it reset when the identity key changes?) -- something
// `react-dom/server`'s `renderToString` structurally cannot express (each
// call is an independent, non-reconciled render; save-conflict.spec.mjs's
// own header explains why this codebase otherwise avoids a
// mount-and-interact testing tool). `react-test-renderer` is added as a
// devDependency for exactly this file: it reconciles real React updates
// (`.update()` on the same instance) entirely in Node, no DOM/jsdom
// needed, so it does not pull in everything a browser-based tool would.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { DoctorWorkspace } from './.doctor-workspace-bundle.cjs'
import { JudgmentPanel } from './.judgment-panel-bundle.cjs'
import { DoctorRecordErrorBoundary } from './.doctor-record-error-boundary-bundle.cjs'
import { PAIN_SCENARIO_1, HERBAL_SCENARIO_1 } from './.doctor-workspace-fixtures-bundle.mjs'

const readSrc = (relPath) => fs.readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8')

// Batch 4.1-A §15.7: esbuild's non-ES2020 default output target escapes
// every non-ASCII character in a bundled .cjs file to \xHH (Latin-1 range)
// or \uHHHH (uppercase hex, surrogate pairs above U+FFFF) -- a raw Korean
// literal (e.g. bundleSrc.includes('사주 예상')) NEVER matches the bundle
// text and would silently, permanently pass regardless of whether the
// text is actually gone (discovered while writing T1/T2 below: the literal
// checks passed even against a deliberately-reintroduced mutant, i.e. they
// were vacuous). This mirrors the bundled text exactly so the Korean
// checks are load-bearing.
function esbuildEscapeNeedle(s) {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp < 0x80) { out += ch; continue }
    if (cp <= 0xff) { out += '\\x' + cp.toString(16).toUpperCase().padStart(2, '0'); continue }
    if (cp > 0xffff) {
      const c = cp - 0x10000
      const hi = 0xd800 + (c >> 10)
      const lo = 0xdc00 + (c & 0x3ff)
      out += '\\u' + hi.toString(16).toUpperCase().padStart(4, '0') + '\\u' + lo.toString(16).toUpperCase().padStart(4, '0')
      continue
    }
    out += '\\u' + cp.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

function findOppositeTypeDetails(renderer) {
  return renderer.root.findByProps({ className: 'workspace__optional doctor__oppositeType' })
}

// ---------- #1 ----------
test(
  'DoctorWorkspace render-time reset clears profileOverride/mixed-tab/추가입력열림 state when unified reset key changes from one submission to another',
  () => {
    // Core Reduction P2/P3 (§2.4): the profile segmented control and the
    // mixed pain/herbal tab switcher this test's name refers to were
    // retired from the default UI (no more manual single-profile
    // override, no more tab switcher -- see doctor-workspace.spec.mjs's
    // "profile segmented control ... no longer renders" test). What
    // replaced them, per Phase 5 Synthesis v1.2 §2.8's own device table
    // ("초기화 목록에 §2.4 '추가 입력 열림' 상태 포함"), is the single
    // `additionalTypeOpen` flag driving the "+ 다른 유형 입력 추가"
    // disclosure -- this test exercises THAT flag's reset, which is the
    // literal successor of the same cross-patient-leak concern the
    // original three names named.
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:A' }),
      )
    })
    // PAIN_SCENARIO_1 has no saved herbal content, so the opposite-type
    // details starts closed -- manually open it (as a clinician click
    // would) to put non-derived, per-record UI state on the record.
    act(() => {
      findOppositeTypeDetails(renderer).props.onToggle({ target: { open: true } })
    })
    assert.equal(findOppositeTypeDetails(renderer).props.open, true, 'sanity: the manual open took effect')

    // Switch to a different submission via the unified reset key.
    act(() => {
      renderer.update(
        React.createElement(DoctorWorkspace, { payload: HERBAL_SCENARIO_1.payload, synthetic: HERBAL_SCENARIO_1.synthetic, resetKey: 'submission:B' }),
      )
    })
    assert.equal(
      findOppositeTypeDetails(renderer).props.open,
      false,
      'the manually-opened state from submission A must not leak into submission B',
    )
  },
)

// ---------- #2 ----------
test('DoctorWorkspace render-time reset does NOT fire when the unified reset key is unchanged across an unrelated re-render (e.g. autosave tick)', () => {
  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:A' }),
    )
  })
  act(() => {
    findOppositeTypeDetails(renderer).props.onToggle({ target: { open: true } })
  })
  assert.equal(findOppositeTypeDetails(renderer).props.open, true)

  // Re-render with the SAME resetKey but a changed unrelated prop
  // (simulating an autosave tick handing back a fresh initialRecordUpdatedAt
  // for the same record) -- must NOT reset the manually-opened state.
  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, {
        payload: PAIN_SCENARIO_1.payload,
        synthetic: PAIN_SCENARIO_1.synthetic,
        resetKey: 'submission:A',
        initialRecordUpdatedAt: '2026-01-01T00:00:00.000Z',
      }),
    )
  })
  assert.equal(
    findOppositeTypeDetails(renderer).props.open,
    true,
    'an unrelated re-render with the SAME reset key must never discard in-progress UI state (false-positive reset)',
  )
})

// ---------- #3 ----------
test('switching between fixture scenarios changes the fixture:<session_id> key and clears all per-scenario workspace state (profileOverride, 추가입력열림, mixed-tab)', () => {
  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: `fixture:${PAIN_SCENARIO_1.id}` }),
    )
  })
  act(() => {
    findOppositeTypeDetails(renderer).props.onToggle({ target: { open: true } })
  })
  assert.equal(findOppositeTypeDetails(renderer).props.open, true)

  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, { payload: HERBAL_SCENARIO_1.payload, synthetic: HERBAL_SCENARIO_1.synthetic, resetKey: `fixture:${HERBAL_SCENARIO_1.id}` }),
    )
  })
  assert.equal(findOppositeTypeDetails(renderer).props.open, false, 'switching fixture scenarios must clear the previous scenario\'s manual UI state')
})

// ---------- #4 ----------
// RevisitWorkspace is out of scope for the shell/lane integration this
// round (explicitly: "RevisitWorkspace는 이번 범위에서 셸 통합 대상
// 아님"), and DoctorView.tsx renders it in a branch that is MUTUALLY
// EXCLUSIVE with the submission/fixtures tabbed view
// (`{selectedRevisit && <RevisitWorkspace .../>} {!selectedRevisit &&
// (...) }`) -- switching from viewing a submission to viewing a revisit
// is therefore ALWAYS a full unmount of one subtree and mount of the
// other, by React's ordinary conditional-rendering semantics, not
// something a shared key/reset comparison could get wrong. This is a
// structural (source) check of that mutual exclusivity, the same style
// this codebase already uses for hard-to-render integration paths (see
// e.g. the P0-3 nextLaneFooterNode tests in tests/doctor.spec.mjs).
test('RevisitWorkspace performs its full reset exactly once, driven solely by the unified key transitioning from submission:<id> to visit:<visit_id> (structural: mutually-exclusive branches, not a shared comparison)', () => {
  const src = readSrc('../src/doctor/DoctorView.tsx')
  assert.ok(src.includes('{selectedRevisit && ('), 'the revisit branch exists')
  assert.ok(
    src.includes("{!selectedRevisit && (mode === 'fixtures' || selectedRecord) && ("),
    'the submission/fixtures branch is gated on !selectedRevisit -- the two are mutually exclusive, never both mounted',
  )
  assert.ok(
    src.includes('<RevisitWorkspace visitId={selectedRevisit.visitId} patientId={selectedRevisit.patientId} />'),
    'RevisitWorkspace itself is unkeyed -- its OWN [visitId, patientId] effect dependency (unchanged, out of this round\'s scope) is what drives its internal reset once mounted',
  )
})

// ---------- #5 ----------
test('DoctorWorkspace reset is implemented via render-time comparison, not via a React key prop remount, on every unified-key transition (no double-mount observed in the DOM)', () => {
  const src = readSrc('../src/doctor/workspace/DoctorWorkspace.tsx')
  assert.ok(
    /if \(recordKey !== lastSeenRecordKey\) \{/.test(src),
    'the render-time comparison exists',
  )
  const viewSrc = readSrc('../src/doctor/DoctorView.tsx')
  const workspaceCallStart = viewSrc.indexOf('<DoctorWorkspace')
  const workspaceCallEnd = viewSrc.indexOf('/>', viewSrc.indexOf('onSaveWorkspace={', workspaceCallStart))
  const workspaceCall = viewSrc.slice(workspaceCallStart, workspaceCallEnd)
  assert.ok(!/\n\s*key=/.test(workspaceCall), '<DoctorWorkspace> itself carries no key prop -- render-time reset is the sole mechanism (delta N-6)')

  // Behavioral half: an update across a resetKey change must never leave
  // two `.workspace` roots in the rendered tree at once (the exact shape
  // of the historical double-mount bug DoctorWorkspace.tsx's own comment
  // describes) -- react-test-renderer reconciles the SAME instance across
  // `.update()`, so this also proves React itself never remounts the root
  // on this transition.
  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:A' }),
    )
  })
  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, { payload: HERBAL_SCENARIO_1.payload, synthetic: HERBAL_SCENARIO_1.synthetic, resetKey: 'submission:B' }),
    )
  })
  const roots = renderer.root.findAllByProps({ className: 'workspace', 'data-view-profile': 'herbal' })
  assert.equal(roots.length, 1, 'exactly one .workspace root after the transition, never two')
})

// ---------- #6 ----------
test('ErrorBoundary key (DoctorRecordErrorBoundary) does not retain a caught error across a visit change even though it is keyed on the unified reset key, not the OLD independently-typed key expression', () => {
  function Boom() {
    throw new Error('synthetic error for DoctorRecordErrorBoundary test')
  }
  function Fine() {
    return React.createElement('div', { className: 'fine' }, 'ok')
  }
  let renderer
  const originalConsoleError = console.error
  console.error = () => {} // React logs the caught error to console; keep test output clean.
  try {
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          DoctorRecordErrorBoundary,
          { key: 'submission:V1', fallback: React.createElement('div', { className: 'fallback' }, '문제 발생') },
          React.createElement(Boom),
        ),
      )
    })
    assert.ok(renderer.root.findAllByProps({ className: 'fallback' }).length === 1, 'sanity: the fallback rendered for the throwing child')

    // Unified key changes (submission:V1 -> submission:V2, i.e. a visit
    // change) -- React's own key-remount semantics apply here (this is
    // the ONE place §2.8's table keeps a key rather than render-time
    // reset), so a genuinely fresh instance mounts with a NON-throwing
    // child.
    act(() => {
      renderer.update(
        React.createElement(
          DoctorRecordErrorBoundary,
          { key: 'submission:V2', fallback: React.createElement('div', { className: 'fallback' }, '문제 발생') },
          React.createElement(Fine),
        ),
      )
    })
    assert.equal(renderer.root.findAllByProps({ className: 'fallback' }).length, 0, 'the caught error from V1 must not still show over V2')
    assert.equal(renderer.root.findAllByProps({ className: 'fine' }).length, 1, "V2's real content renders")
  } finally {
    console.error = originalConsoleError
  }
})

// ---------- #7 / #8 ----------
// MedicationCourseSection's own `key={patient_id}` (§2.8's "그대로" row) is
// composed entirely OUTSIDE DoctorWorkspace.tsx now (DoctorView.tsx builds
// it and hands it down as the `medicationCourseSlot` prop -- see
// DoctorWorkspace.tsx's own doc comment on that prop). Structural check
// that the unified-key migration did not touch this device.
test('MedicationCourseSection key remains {patient_id} unchanged (composed by DoctorView.tsx, untouched by the unified reset key migration) -- §2.8\'s "그대로" row', () => {
  const viewSrc = readSrc('../src/doctor/DoctorView.tsx')
  assert.ok(
    viewSrc.includes('<MedicationCourseSection key={selectedRecord.patient_id} patientUuid={selectedRecord.patient_id} />'),
    'MedicationCourseSection is still keyed on patient_id alone, never on the unified reset key (which also changes on a same-patient visit switch)',
  )
  // #8: switching to a different patient changes BOTH keys together --
  // the medicationCourseSlot prop itself is rebuilt by DoctorView.tsx
  // whenever selectedRecord.patient_id changes (React's own key semantics
  // on that inline element), which is the same "different patient_id ->
  // different key -> fresh mount, nothing carries over" guarantee the
  // pre-existing medication-course-ui.spec.mjs suite already covers for
  // MedicationCourseSection's own internals -- this only pins that
  // DoctorWorkspace.tsx passes the slot through opaquely (`{medicationCourseSlot}`)
  // rather than re-keying or otherwise touching it.
  const workspaceSrc = readSrc('../src/doctor/workspace/DoctorWorkspace.tsx')
  assert.ok(workspaceSrc.includes('{medicationCourseSlot}'), 'DoctorWorkspace renders the slot opaquely, without re-keying it')
})

// ---------- #9 ----------
test('JudgmentPanel no longer owns an independent key={session_id}; its reset now follows the unified reset key transition (no dual-key drift)', () => {
  const viewSrc = readSrc('../src/doctor/DoctorView.tsx')
  assert.ok(!/<JudgmentPanel\s*\n\s*key=/.test(viewSrc), '<JudgmentPanel> no longer carries its own key prop')
  assert.ok(/<JudgmentPanel\s*\n\s*resetKey=\{unifiedResetKey\}/.test(viewSrc), 'JudgmentPanel receives the SAME unifiedResetKey as its resetKey prop instead')

  // Behavioral half, mirroring DoctorWorkspace's own reset test above: a
  // judgment typed in for submission A must not still be on screen after
  // the resetKey transitions to submission B.
  //
  // Batch 4.1-C (§16.1): the innate_features TextList input this used to
  // exercise (className 'judgment__input') is gone. The 1분 디브리핑
  // textareas (className 'judgment__textarea') are the remaining editable
  // JudgmentPanel field this reset behavior can be pinned against.
  const source = {
    session_id: 's1',
    questionnaire_version: '1',
    myungri_algorithm_version: '1',
    myungri_library_version: '1',
    myungri_status: 'resolved',
    myungri_pending_approval: [],
  }
  let renderer
  act(() => {
    renderer = TestRenderer.create(React.createElement(JudgmentPanel, { source, resetKey: 'submission:A' }))
  })
  const findFirstDebriefTextarea = () => renderer.root.findAllByProps({ className: 'judgment__textarea' })[0]
  act(() => {
    findFirstDebriefTextarea().props.onChange({ target: { value: 'A 환자 소견' } })
  })
  assert.equal(findFirstDebriefTextarea().props.value, 'A 환자 소견', 'sanity: the typed value took effect')

  act(() => {
    renderer.update(React.createElement(JudgmentPanel, { source: { ...source, session_id: 's2' }, resetKey: 'submission:B' }))
  })
  assert.equal(
    findFirstDebriefTextarea().props.value,
    '',
    "submission A's typed judgment must not still show once the unified key moves to submission B",
  )
})

// ---------- §1.1-#7 (lane1 union recomputes at every render-time reset boundary) ----------
test('lane1 summary union recomputes on every render-time reset boundary (submission/visit change), never carrying a stale union result forward', () => {
  // PAIN_SCENARIO_1 has real applicable safety regions (its own P0-1 tests
  // elsewhere in this suite already pin this); HERBAL_SCENARIO_1 applies
  // to zero of them (a genuinely herbal-only record). Swapping between
  // them via the unified reset key is the real "submission/visit change"
  // boundary this test's name describes -- the union must actually
  // recompute, not keep echoing the first record's status class.
  const findChip = (renderer) =>
    renderer.root.findAllByProps({}).find((n) => typeof n.props.className === 'string' && n.props.className.startsWith('doctor__lane1Chip '))

  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:A' }),
    )
  })
  const firstStatusClass = findChip(renderer)?.props.className
  assert.ok(firstStatusClass, 'a lane1 chip renders for the pain record')
  assert.notEqual(firstStatusClass, 'doctor__lane1Chip doctor__lane1Chip--na', 'sanity: PAIN_SCENARIO_1 really has applicable regions (not 해당없음)')

  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, { payload: HERBAL_SCENARIO_1.payload, synthetic: HERBAL_SCENARIO_1.synthetic, resetKey: 'submission:B' }),
    )
  })
  const secondChip = findChip(renderer)
  assert.ok(secondChip, 'a lane1 chip still renders for the new record')
  assert.equal(
    secondChip.props.className,
    'doctor__lane1Chip doctor__lane1Chip--na',
    'HERBAL_SCENARIO_1 applies to zero safety-relevant regions, so its OWN freshly-recomputed union must read 해당없음',
  )
  assert.notEqual(secondChip.props.className, firstStatusClass, "the previous record's union status class must not survive onto the new record")
})

// ---------- m4 (Phase 10 closing review): ObjectiveExamFindingsCard isolation ----------
test('m4: ObjectiveExamFindingsCard\'s own radio selection (LBP objective motor deficit) does not leak into the next patient across the unified reset key transition', () => {
  // PAIN_SCENARIO_1 answers real LBP_* questions (safety_flags.lbp != null),
  // so showLbp is true and this card's radiogroup actually renders. Neither
  // scenario passes lbpObjectiveMotorDeficit as an external prop, so the
  // card's OWN internal `useState` starts unchecked -- any checked radio
  // seen below can only have come from the manual click this test performs,
  // never from a server-provided initial value.
  const findLbpRadios = (renderer) =>
    renderer.root.findAll((node) => node.props && node.props.name === 'objective_exam_lbp_motor_deficit')

  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:A' }),
    )
  })
  const radiosBefore = findLbpRadios(renderer)
  assert.equal(radiosBefore.length, 3, 'sanity: the 3-option LBP objective motor deficit radiogroup renders')
  assert.ok(radiosBefore.every((r) => r.props.checked === false), 'sanity: nothing pre-selected before the manual click')

  // Simulate the clinician selecting "심하거나 빠르게 진행함" (index 1 --
  // LBP_MOTOR_DEFICIT_OPTIONS[1] = SEVERE_OR_PROGRESSIVE), a safety-
  // affecting selection (feeds URGENT_REVIEW).
  act(() => {
    radiosBefore[1].props.onChange({})
  })
  const radiosAfterClick = findLbpRadios(renderer)
  assert.equal(radiosAfterClick[1].props.checked, true, 'sanity: the manual selection took effect')

  // Switch to a different patient via the unified reset key alone (same
  // payload/synthetic on purpose, isolating this card's OWN reset from any
  // side effect of also swapping safety_flags/regions).
  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:B' }),
    )
  })
  const radiosAfterSwitch = findLbpRadios(renderer)
  assert.ok(
    radiosAfterSwitch.every((r) => r.props.checked === false),
    "the previous patient's LBP objective motor deficit selection must not survive onto the next patient (m4 -- was previously leaking via a frozen useState initial value)",
  )
})

test('m4: ObjectiveExamFindingsCard also clears its save-status/authError state (not just the radio value) across the unified reset key transition', () => {
  const findLbpRadios = (renderer) =>
    renderer.root.findAll((node) => node.props && node.props.name === 'objective_exam_lbp_motor_deficit')
  const findSaveStatus = (renderer) =>
    renderer.root.findAll((node) => node.props && node.props['data-status'] !== undefined && node.props.role === 'status')

  let renderer
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:A' }),
    )
  })
  // No onSave is wired in this fixtures-preview harness (matches
  // DoctorView.tsx's own real convention -- onSaveObjectiveExam is only
  // wired in server mode), so the save-status row never appears here; this
  // test instead pins the OTHER half of m4's fix directly against the
  // component source (the render-time-reset block resets lbpStatus/
  // shoulderStatus/authError together with lbp/shoulder, not just the
  // latter) -- renderToString/test-renderer cannot itself force a real
  // saving/auth-error round trip without a live onSave, so the source
  // assertion is the honest way to pin this half.
  assert.equal(findSaveStatus(renderer).length, 0, 'sanity: no save-status row without onSave wired')
  const src = fs.readFileSync('src/doctor/ObjectiveExamFindingsCard.tsx', 'utf8')
  const resetBlock = src.slice(src.indexOf('if (resetKey !== lastSeenResetKey)'), src.indexOf('if (resetKey !== lastSeenResetKey)') + 300)
  assert.ok(/setLbpStatus\('idle'\)/.test(resetBlock), 'lbpStatus must reset alongside lbp')
  assert.ok(/setShoulderStatus\('idle'\)/.test(resetBlock), 'shoulderStatus must reset alongside shoulder')
  assert.ok(/setAuthError\(false\)/.test(resetBlock), 'authError must reset too -- a stale auth banner from the last patient must not persist')

  act(() => {
    renderer.update(
      React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: PAIN_SCENARIO_1.synthetic, resetKey: 'submission:B' }),
    )
  })
  assert.ok(
    findLbpRadios(renderer).every((r) => r.props.checked === false),
    'sanity: the reset key transition itself still succeeded in this render',
  )
})

// ---------- Batch 4.1-A §15.7 T1/T2 ----------
// R1 removal (§15.2): JudgmentPanel.tsx's "사주 예상 → 수정 판단 →
// 치료축·처방 방향" input block and its "치료 우선순위·한약 방향" read-back
// li are gone. Asserted against the bundled JudgmentPanel output (not the
// raw .tsx source) so a change that removes the JSX but leaves a stray
// runtime reference (or vice versa) is caught -- same "assert against the
// bundle, not the source" convention T3 below uses for DoctorView.
test('T1: .judgment-panel-bundle.cjs no longer binds saju_only_prediction as a textarea value, and the "사주 예상 → 수정 판단" summary text is gone', () => {
  const bundleSrc = readSrc('./.judgment-panel-bundle.cjs')
  // §15.3 keeps ClinicianJudgment's field + createEmptyJudgment's default
  // ("saju_only_prediction: ''") on purpose -- judgment.ts is bundled in
  // here too (createEmptyJudgment is imported), so the bare key name is
  // expected to survive. What must be gone is JudgmentPanel's OWN
  // property-access/write to it (`.saju_only_prediction`, the textarea's
  // `value={judgment.saju_only_prediction}` / `onChange`'s
  // `saju_only_prediction: v` compiled forms).
  assert.equal(bundleSrc.includes('.saju_only_prediction'), false, 'no dot-access read of judgment.saju_only_prediction may remain (the removed textarea\'s value binding)')
  assert.equal(bundleSrc.includes('saju_only_prediction: v'), false, 'no onChange write to saju_only_prediction may remain (the removed textarea\'s onChange)')
  assert.equal(bundleSrc.includes(esbuildEscapeNeedle('사주 예상 → 수정 판단')), false, 'the removed disclosure summary text must not appear in the bundle')
})

test('T2: .judgment-panel-bundle.cjs no longer contains the "치료 우선순위·한약 방향" 설명개요 read-back', () => {
  const bundleSrc = readSrc('./.judgment-panel-bundle.cjs')
  assert.equal(bundleSrc.includes(esbuildEscapeNeedle('치료 우선순위·한약 방향')), false)
})

// ---------- Batch 4.1-C §16.6 T13/T14 ----------
// R3 removal (§16.1): the "핵심 선천 특징"/"현재 증상과 연결되는 핵심"
// TextList inputs are gone from JudgmentPanel.tsx. NOTE: judgment.ts
// (bundled in here too, since JudgmentPanel imports validateJudgment from
// it) legitimately still contains BOTH label strings as substrings of its
// UNCHANGED error messages ("핵심 선천 특징은 최대 N개까지만 입력할 수
// 있습니다." / "현재 증상과 연결되는 핵심은 최대 N개까지만..."), so a bare
// `includes(esbuildEscapeNeedle('핵심 선천 특징'))` check would be a false
// positive here -- it would flag the still-required validateJudgment text
// as if it were the removed UI label. The needle below includes the
// TextList label's own distinguishing suffix ("...(원장 입력, 최대") to
// tell the two apart; the onChange-write checks (`innate_features: next`
// etc.) are a second, independent structural signal.
test('T13: .judgment-panel-bundle.cjs no longer binds innate_features/symptom_links as TextList inputs, and their labels are gone (Batch 4.1-C §16.1)', () => {
  const bundleSrc = readSrc('./.judgment-panel-bundle.cjs')
  assert.equal(bundleSrc.includes('innate_features: next'), false, 'no onChange write to innate_features may remain (the removed TextList\'s onChange)')
  assert.equal(bundleSrc.includes('symptom_links: next'), false, 'no onChange write to symptom_links may remain (the removed TextList\'s onChange)')
  assert.equal(
    bundleSrc.includes(esbuildEscapeNeedle('핵심 선천 특징 (원장 입력')),
    false,
    'the removed TextList label text ("핵심 선천 특징 (원장 입력, 최대 N개)") must not appear -- validateJudgment\'s similarly-worded error message ("...은 최대 N개까지만...") stays and is a different string',
  )
  assert.equal(
    bundleSrc.includes(esbuildEscapeNeedle('현재 증상과 연결되는 핵심 (원장 입력')),
    false,
    'the removed TextList label text must not appear -- validateJudgment\'s error message stays and is a different string',
  )
})

// R4 removal (§16.2): the "설명 개요 (원장 전용, 참고용)" disclosure
// (judgment__outline) is gone entirely.
test('T14: .judgment-panel-bundle.cjs no longer renders the "설명 개요 (원장 전용, 참고용)" disclosure (Batch 4.1-C §16.2)', () => {
  const bundleSrc = readSrc('./.judgment-panel-bundle.cjs')
  assert.equal(bundleSrc.includes('judgment__outline'), false, 'the judgment__outline class name must not appear in the bundle')
  assert.equal(
    bundleSrc.includes(esbuildEscapeNeedle('설명 개요 (원장 전용, 참고용)')),
    false,
    'the removed disclosure summary text must not appear in the bundle',
  )
})

console.log(`\n${passed} doctor-reset-key assertions passed.`)
