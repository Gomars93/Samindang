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

// 2nd closing-review finding (LOW), 3rd closing-review finding (LOW): the
// guard-count assertion above only proves 7 guards exist -- it says nothing
// about whether a NEW, unguarded async completion point was added elsewhere.
// Pinning the total number of `.then((result) => {` closed that for ONE
// exact source shape, but the 3rd review found it defeated by trivial
// reformatting: `.then((res) => {`, `.then(function (result) {`, or a bare
// `.finally(() => setBusy(false))` one-liner all leave both counts unmoved
// while adding a genuinely unguarded completion point. Counting the bare
// tokens `.then(`/`.finally(` instead of one fixed callback shape survives
// that reformatting -- and pinning `.catch(`/`await` at 0 means introducing
// EITHER (an async completion point no `.then`-shaped assertion here could
// ever see) fails loudly rather than silently.
test('MedicationCourseSection: exactly 7 .then( call sites total, regardless of callback formatting (a new one must be epoch-guarded)', () => {
  const thenCount = (src.match(/\.then\(/g) ?? []).length
  assert.equal(thenCount, 7, `expected exactly 7 .then( call sites, found ${thenCount} -- a new one may be missing its epoch guard`)
})

test('MedicationCourseSection: every busy-flag release in a .finally() is itself epoch-guarded (a stale action must never clear a newer epoch\'s busy state)', () => {
  const finallyGuardCount = (src.match(/if \(loadEpochRef\.current === epoch\) setBusy\(false\)/g) ?? []).length
  assert.equal(finallyGuardCount, 4, `expected all 4 mutating action handlers to epoch-guard their .finally(), found ${finallyGuardCount}`)
})

test('MedicationCourseSection: exactly 4 .finally( call sites total, regardless of callback formatting (a 5th mutating action\'s must be epoch-guarded)', () => {
  const finallyCount = (src.match(/\.finally\(/g) ?? []).length
  assert.equal(finallyCount, 4, `expected exactly 4 .finally( call sites, found ${finallyCount} -- a new one may be missing its epoch guard`)
})

test('MedicationCourseSection: no .catch( or await async-completion shape exists (neither is covered by the .then/.finally guards above)', () => {
  assert.equal((src.match(/\.catch\(/g) ?? []).length, 0, 'a .catch() is an async completion point too and must be epoch-guarded like every .then()')
  assert.equal((src.match(/\bawait\s/g) ?? []).length, 0, 'an await-based completion point bypasses every .then-shaped assertion in this file')
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
// 2nd closing-review finding (LOW), 3rd closing-review finding (LOW): asserting
// setBusy(false) appears ANYWHERE in the effect body -- or even anywhere in
// the whole file, which is what this regressed to -- does not prove the reset
// is synchronous and unconditional. Extracting the effect body first (as the
// 3rd review's own fixes below do) and anchoring the statement immediately
// after setActionError(null) proves it runs unconditionally in the
// synchronous reset block, not deferred into an async callback or hoisted
// into a helper that happens to still contain both lines somewhere.
test('MedicationCourseSection: the load effect resets busy synchronously in its reset block (not deferred into an async callback)', () => {
  const effectBody = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[patientUuid\]\)/)
  assert.ok(effectBody, 'expected to find the main useEffect body')
  assert.match(effectBody[1], /setActionError\(null\)\s*setBusy\(false\)/, 'expected setBusy(false) to immediately follow setActionError(null) in the synchronous reset block')
})

// 3rd closing-review finding (MEDIUM): two rounds each found a DIFFERENT
// useState the reset block forgot (busy in round 1, four new-course draft
// fields in round 2) because no test proved the reset block was COMPLETE --
// each fix only pinned the specific fields the round in question had found.
// Deriving the setter list straight from every `useState` DECLARATION and
// diffing it against what the reset block actually calls makes this
// self-updating: a 17th useState added later without a matching reset in the
// block fails here immediately, rather than waiting for a fourth review round
// to notice by inspection. (16 is the current count -- verified by the 3rd
// review two independent ways: manual enumeration and this exact mechanical
// diff, both agreeing missing=[].)
// 4th closing-review finding (LOW x2): the declaration regex only recognizes
// one exact destructuring shape (`const [x, setX] = useState`) -- a
// multi-line destructure, a non-`set`-prefixed setter name, or a line-wrap
// after `=` all defeat it (decls.length silently stays consistent, so a 17th
// useState written in any of those styles is invisible to this test, not
// just unreset). Cross-checking decls.length against a raw count of every
// `useState(`/`useState<` call site closes that -- a call site the
// declaration regex didn't see now fails loudly instead of silently. And
// `missing` was computed against the WHOLE effect body, including the async
// `.then()` callback -- a setter moved out of the synchronous reset block
// into that callback (past the `!result.ok` early-return, so it may never
// run at all) still satisfied `missing=[]`. Restricting the check to the
// synchronous prefix (everything before the effect's own async call) proves
// the property the test's name claims: reset happens unconditionally in the
// reset block, not merely "somewhere, eventually, maybe" in the effect.
// 5th closing-review finding (LOW): the synchronous-prefix cut point was
// hardcoded to the literal string `listEpisodesByPatient(` -- a NEW async
// call inserted ABOVE that one (e.g. a prefetch) would be swallowed into the
// "synchronous" prefix along with everything after it, hiding a setter
// deferred into that new call's own .then() callback. Cutting at the first
// occurrence of ANY async-completion token (.then(/.finally(/.catch(, the
// same vocabulary already pinned above) instead of one hardcoded function
// name closes that regardless of which async call comes first.
test('MedicationCourseSection: the load effect resets EVERY useState setter it declares, synchronously in the reset block (complete reset block, derived from the declarations)', () => {
  const decls = [...src.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map((m) => m[1])
  assert.equal(decls.length, 16, 'useState declaration count changed -- re-audit which are patient-scoped before updating this number')
  const callSiteCount = (src.match(/useState[<(]/g) ?? []).length
  assert.equal(
    callSiteCount,
    decls.length,
    `found ${callSiteCount} useState( / useState< call sites but only recognized ${decls.length} declarations -- a useState was written in a destructuring style the declaration regex above cannot see`,
  )
  assert.equal((src.match(/\buseReducer\(/g) ?? []).length, 0, 'a useReducer-based piece of state is invisible to every useState-derived assertion in this file -- add explicit coverage before introducing one')
  const effectBody = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[patientUuid\]\)/)
  assert.ok(effectBody, 'expected to find the main useEffect body')
  const firstAsync = effectBody[1].search(/\.then\(|\.finally\(|\.catch\(/)
  assert.ok(firstAsync > 0, 'expected to find the effect\'s own first async call (.then/.finally/.catch) after its synchronous reset block')
  const syncBlock = effectBody[1].slice(0, firstAsync)
  const missing = decls.filter((d) => !new RegExp(`\\b${d}\\(`).test(syncBlock))
  assert.deepEqual(missing, [], `these patient-scoped setters are not reset synchronously in the reset block (possibly deferred into an async callback, or missing entirely): ${missing.join(', ')}`)
})

// 3rd closing-review finding (MEDIUM, part 2): the derived test above proves
// the EFFECT resets every field, but the round-2 fix also added the same
// four clears to the new-course form's cancel button -- reverting just that
// half (abandoning a draft mid-patient, no switch involved) passed every
// existing assertion, since none of them looked at the cancel handler.
// 4th closing-review finding (NIT): String.prototype.match without the /g
// flag returns only the FIRST match -- if a second, differently-behaved
// handler with the same opening shape (setShowNewCourseForm(false) then
// setNewCourseSourceId('')) were ever added earlier in the file, this test
// would silently validate THAT one while the real cancel button regressed.
// Asserting exactly one match makes that ambiguity fail loudly instead.
test('MedicationCourseSection: the new-course form\'s cancel button also clears all four draft date/duration fields (not just the load effect)', () => {
  const cancelHandlerMatches = [...src.matchAll(/onClick=\{\(\) => \{\s*setShowNewCourseForm\(false\)\s*setNewCourseSourceId\(''\)([\s\S]*?)\}\}/g)]
  assert.equal(cancelHandlerMatches.length, 1, `expected exactly one onClick handler matching the cancel button's opening shape, found ${cancelHandlerMatches.length}`)
  for (const setter of ['setNewPrescribedAt', 'setNewDispensedAt', 'setNewStartAt', 'setNewDurationDays']) {
    assert.match(cancelHandlerMatches[0][1], new RegExp(`${setter}\\(''\\)`), `expected the cancel handler to also clear ${setter}`)
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

// 3rd closing-review finding (LOW): the shift-start date draft
// (shiftDraftByCourse) lived inside an uncontrolled <details>, so collapsing
// it hid an abandoned, typed-but-unsaved date without clearing it --
// reopening later re-showed it pre-filled with an already-enabled save
// button. Fixed by clearing the draft when this specific disclosure closes
// (not opens, so an accidental collapse/reopen doesn't lose in-progress work).
// 4th closing-review finding (LOW): this fix shipped with zero coverage --
// reverting it (dropping the onToggle handler entirely) passed every
// pre-existing assertion in this file.
// 5th closing-review finding (LOW): the anchor above stopped at the opening
// `if (e.currentTarget.open) return` guard and never required the actual
// clear -- a handler with the correct guard but a no-op body (or one that
// deleted the wrong course's entry) still matched. Extended through the
// setShiftDraftByCourse call and its delete on THIS course's key.
test('MedicationCourseSection: the shift-start <details> clears its draft when the disclosure closes (not when it opens)', () => {
  assert.match(
    src,
    /className="medCourse__shift"\s*onToggle=\{\(e\) => \{\s*if \(e\.currentTarget\.open\) return\s*setShiftDraftByCourse\(\(prev\) => \{[\s\S]*?delete next\[course\.course_id\]/,
    'expected the medCourse__shift <details> to clear shiftDraftByCourse[course.course_id] on close via onToggle',
  )
})

// 3rd closing-review finding (NIT): the check-task reason-chip draft had no
// dismiss affordance -- clicking a reason chip a second time just re-set the
// same draft, so a mis-click stuck around for the rest of the session. Fixed
// by making a click on the already-active chip delete the draft instead.
// 4th closing-review finding (LOW): this fix also shipped with zero
// coverage -- reverting it to the old unconditional-spread form passed
// every pre-existing assertion in this file.
// 5th closing-review finding (LOW): same gap as the shift-draft test above --
// the anchor stopped at the `if (...)` guard and never required the active
// branch to actually delete the entry (a branch that fell through to the
// old unconditional re-set still matched). Extended through the delete.
test('MedicationCourseSection: clicking the already-active check-task reason chip dismisses the draft instead of re-setting it', () => {
  assert.match(
    src,
    /setCheckDraftByCourse\(\(prev\) => \{\s*if \(prev\[course\.course_id\]\?\.reason === rc\) \{[\s\S]*?delete next\[course\.course_id\]/,
    'expected the reason-chip onClick to detect the already-active chip and delete its draft entry',
  )
})

console.log(`\n${passed} MedicationCourseSection load-epoch structural assertions passed.`)
