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

console.log(`\n${passed} MedicationCourseSection load-epoch structural assertions passed.`)
