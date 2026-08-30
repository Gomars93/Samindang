// Medication/Herbal-course batch (owner-review closeout): structural guard
// for the cross-patient stale-response race in MedicationCourseSection.tsx.
//
// This repo deliberately avoids a jsdom+act() dependency for exercising
// useEffect/useState timing (see tests/save-conflict.spec.mjs's header
// comment) -- so, matching that same file's established pattern, this is a
// SOURCE-LEVEL guard proving the load-epoch fencing is actually present at
// every async completion point, paired with real interactive Playwright QA
// (a genuine patient A -> B switch with A's network responses delayed/
// failed) documented separately in HANDOFF.md rather than committed as a
// jsdom test.
import assert from 'node:assert/strict'
import fs from 'node:fs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`OK: ${name}`)
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const src = stripComments(fs.readFileSync('src/doctor/MedicationCourseSection.tsx', 'utf8'))

test('MedicationCourseSection: declares a load-epoch ref (useRef(0)), not a plain boolean cancelled flag', () => {
  assert.match(src, /const loadEpochRef = useRef\(0\)/)
})

test('MedicationCourseSection: reloadEpisodeData takes an explicit epoch parameter, not relying solely on closure-captured state', () => {
  assert.match(src, /function reloadEpisodeData\(epId: string, epoch: number\)/)
})

// Owner-review finding: this component is only isolated from a patient
// switch by the caller's key={patient_id} -- a real but external safety
// net. Every async completion that can set patient-scoped state (the
// initial episodes/course/task loads, and all four mutating actions' own
// reloads) must independently prove it still belongs to the current load
// epoch before touching state, so the property holds even if that external
// remount guarantee were ever weakened. There are exactly 7 such
// completion points in the current source: the two reloadEpisodeData
// promises, the main effect's own listEpisodesByPatient call, and each of
// handleCreateEpisode/handleCreateCourse/handleCreateCheckTask/
// handleShiftStart's own result callback.
test('MedicationCourseSection: every async state-setting completion point checks the current load epoch before committing state', () => {
  const guardCount = (src.match(/loadEpochRef\.current !== epoch\) return/g) ?? []).length
  assert.equal(guardCount, 7, `expected exactly 7 epoch-fenced completions, found ${guardCount}`)
})

// 2nd closing-review finding (LOW): the guard-count assertion above only
// proves 7 guards exist -- it says nothing about whether a NEW, unguarded
// .then((result) => {...}) callback was added elsewhere, since that would
// leave the guard count at 7 while adding an 8th unfenced completion point.
// Pinning the total number of this callback shape closes that blind spot:
// if this ever needs to grow, the anchored-guard test below must grow with
// it in lockstep.
test('MedicationCourseSection: there are exactly 7 .then((result) => {...}) callbacks total (a new one must be epoch-guarded, not merely added)', () => {
  const thenCount = (src.match(/\.then\(\(result\) => \{/g) ?? []).length
  assert.equal(thenCount, 7, `expected exactly 7 .then((result) => {...}) callbacks, found ${thenCount} -- a new one may be missing its epoch guard`)
})

test('MedicationCourseSection: every busy-flag release in a .finally() is itself epoch-guarded (a stale action must never clear a newer epoch\'s busy state)', () => {
  const finallyGuardCount = (src.match(/if \(loadEpochRef\.current === epoch\) setBusy\(false\)/g) ?? []).length
  assert.equal(finallyGuardCount, 4, `expected all 4 mutating action handlers to epoch-guard their .finally(), found ${finallyGuardCount}`)
})

// Same blind spot as above, for .finally(): pin the total so a 5th mutating
// handler with an unguarded .finally(() => setBusy(false)) cannot slip in
// while the guarded-count assertion stays at 4.
test('MedicationCourseSection: there are exactly 4 .finally(() => {...}) blocks total (a new mutating action\'s must be epoch-guarded)', () => {
  const finallyCount = (src.match(/\.finally\(\(\) => \{/g) ?? []).length
  assert.equal(finallyCount, 4, `expected exactly 4 .finally(() => {...}) blocks, found ${finallyCount} -- a new one may be missing its epoch guard`)
})

test('MedicationCourseSection: each of the four mutating actions captures its own epoch snapshot before issuing the request', () => {
  const captureCount = (src.match(/const epoch = loadEpochRef\.current/g) ?? []).length
  assert.equal(captureCount, 4, `expected handleCreateEpisode/handleCreateCourse/handleCreateCheckTask/handleShiftStart to each capture their own epoch, found ${captureCount}`)
})

test('MedicationCourseSection: the main load effect bumps the epoch exactly once per patientUuid change (pre-increment, not read-only)', () => {
  assert.match(src, /const epoch = \+\+loadEpochRef\.current/)
})

// Closing-review finding (MEDIUM): the effect's own state-reset block resets
// eleven other pieces of state on a patient switch but originally omitted
// `busy` -- since all four .finally() releases are now epoch-guarded (see
// above), a mutating action left in flight from a PRIOR patient could never
// clear `busy` for the new patient, permanently disabling every action
// button in the section. Every disabled={busy}/if (busy) return call site
// depends on this being reset on patientUuid change.
// 2nd closing-review finding (LOW): asserting setBusy(false) appears
// ANYWHERE in the effect body does not prove the reset is synchronous and
// unconditional -- e.g. moving it inside the listEpisodesByPatient().then()
// callback (so it only clears once the NEW patient's load resolves, and
// never on that call's !result.ok early-return path) still satisfies a
// body-wide match. Anchoring it as the literal statement immediately after
// setActionError(null) proves it runs unconditionally in the synchronous
// reset block, not deferred into an async callback.
test('MedicationCourseSection: the load effect resets busy synchronously in its reset block (not deferred into an async callback)', () => {
  assert.match(src, /setActionError\(null\)\s*setBusy\(false\)/, 'expected setBusy(false) to immediately follow setActionError(null) in the synchronous reset block')
})

// 2nd closing-review finding (MEDIUM): these four new-course draft fields
// were only ever cleared on a successful handleCreateCourse -- switching
// patients mid-draft (without submitting) left them holding the PREVIOUS
// patient's typed dates. The form itself closes (showNewCourseForm resets),
// so this was invisible; opening a fresh draft for the new patient then
// silently pre-fills with the stale dates, one save away from writing one
// patient's medication dates onto another's course record.
test('MedicationCourseSection: the load effect resets all four new-course draft date/duration fields on every patientUuid change', () => {
  const effectBody = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[patientUuid\]\)/)
  assert.ok(effectBody, 'expected to find the main useEffect body')
  for (const setter of ['setNewPrescribedAt', 'setNewDispensedAt', 'setNewStartAt', 'setNewDurationDays']) {
    assert.match(effectBody[1], new RegExp(`${setter}\\(''\\)`), `expected the effect to reset ${setter} alongside its other patient-scoped state`)
  }
})

// Closing-review finding (LOW): bumping the epoch alone fences setState
// calls made by a PRIOR patient's in-flight promises, but does nothing for
// an unmounting instance -- its own ref object is frozen at its last epoch,
// so its own in-flight promises would still pass every guard. An
// epoch-invalidating cleanup folds the unmount case into the same
// mechanism instead of leaving it unfenced.
// 2nd closing-review finding (NIT): matching against the whole file (not
// the effect body) means this cleanup could be moved OUT of the effect
// entirely -- into an unused standalone helper, say -- and still pass,
// leaving the effect with no cleanup at all. Reuse the same effect-body
// extraction the busy-reset test above relies on.
test('MedicationCourseSection: the load effect invalidates its own epoch on cleanup (unmount is fenced too, not just patient switches)', () => {
  const effectBody = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[patientUuid\]\)/)
  assert.ok(effectBody, 'expected to find the main useEffect body')
  assert.match(effectBody[1], /return \(\) => \{\s*loadEpochRef\.current \+= 1\s*\}/, 'expected the effect\'s own cleanup to invalidate the epoch')
})

// Closing-review finding (LOW): a raw occurrence-count of the guard string
// cannot tell whether a guard is the FIRST statement of its callback (before
// any setState) or merely present somewhere in the file -- a guard placed
// after a setState call would still count. Anchoring each guard to the
// immediately-preceding `.then((result) => {` line proves placement, not
// just presence.
test('MedicationCourseSection: every .then((result) => {...}) callback opens with the epoch guard as its first statement, before any setState', () => {
  const anchoredGuardCount = (src.match(/\.then\(\(result\) => \{\s*if \(loadEpochRef\.current !== epoch\) return/g) ?? []).length
  assert.equal(anchoredGuardCount, 7, `expected all 7 .then((result) => {...}) callbacks to open with the guard, found ${anchoredGuardCount}`)
})

console.log(`\n${passed} MedicationCourseSection load-epoch structural assertions passed.`)
