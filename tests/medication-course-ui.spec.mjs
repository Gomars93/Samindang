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

test('MedicationCourseSection: every busy-flag release in a .finally() is itself epoch-guarded (a stale action must never clear a newer epoch\'s busy state)', () => {
  const finallyGuardCount = (src.match(/if \(loadEpochRef\.current === epoch\) setBusy\(false\)/g) ?? []).length
  assert.equal(finallyGuardCount, 4, `expected all 4 mutating action handlers to epoch-guard their .finally(), found ${finallyGuardCount}`)
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
test('MedicationCourseSection: the load effect itself resets busy to false on every patientUuid change', () => {
  const effectBody = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[patientUuid\]\)/)
  assert.ok(effectBody, 'expected to find the main useEffect body')
  assert.match(effectBody[1], /setBusy\(false\)/, 'expected the effect to reset busy alongside its other patient-scoped state')
})

// Closing-review finding (LOW): bumping the epoch alone fences setState
// calls made by a PRIOR patient's in-flight promises, but does nothing for
// an unmounting instance -- its own ref object is frozen at its last epoch,
// so its own in-flight promises would still pass every guard. An
// epoch-invalidating cleanup folds the unmount case into the same
// mechanism instead of leaving it unfenced.
test('MedicationCourseSection: the load effect invalidates its own epoch on cleanup (unmount is fenced too, not just patient switches)', () => {
  assert.match(src, /return \(\) => \{\s*loadEpochRef\.current \+= 1\s*\}/)
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
