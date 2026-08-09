// Logic scenario integration suite for src/spec/coreSpec.ts.
// Run via `npm run test:integration` (bundles coreSpec.ts with esbuild first).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import {
  ALL_QUESTIONS,
  visibleQuestions,
  pruneStaleResponses,
  buildResponsePayload,
  buildRoutingPayload,
  buildSajuInput,
  modulesActivated,
  deriveReproductiveStatus,
  SECONDARY_SHORT_SCREENS,
  MODULE_ROUTES,
  STAFF_CHECK_TRIGGERS,
  computeFlags,
} from './.spec-bundle.mjs'

let passCount = 0

function assert(name, cond) {
  if (!cond) {
    throw new Error(`FAIL: ${name}`)
  }
  passCount++
  console.log(`OK: ${name}`)
}

function emptyResponses() {
  return Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))
}

// Apply a patch of answers and prune stale branches, exactly like the real App does.
function set(r, patch) {
  const next = { ...r, ...patch }
  return pruneStaleResponses(next).responses
}

function visibleIds(r) {
  return new Set(visibleQuestions(r).map((q) => q.id))
}

/* =========================================================================
 * Shared helpers for G/H/I: generic auto-answer walker + module-prefix map
 * ========================================================================= */

// primary-concern-key -> question id prefix for that module's own detail screens.
const MODULE_PREFIX = {
  sleep: 'SLEEP_',
  digestion: 'GI_',
  bowel: 'BOWEL_',
  pain: 'PAIN_',
  urinary: 'URINARY_',
  fatigue: 'FATIGUE_',
  stress: 'STRESS_',
  women: 'WOMEN_',
  pregnancy: 'PREGNANCY_',
  postpartum: 'POSTPARTUM_',
  weight: 'WEIGHT_',
}

// Which of the 11 primary modules a question id "belongs" to, or null.
// WOMEN_SAFETY_01 is a general reproductive-safety question, not part of the
// Women module (it can show up regardless of primary concern), so it is
// explicitly excluded from the 'women' bucket.
function moduleOf(id) {
  if (id === 'WOMEN_SAFETY_01') return null
  if (id.startsWith('MS_')) return 'sleep'
  for (const [key, prefix] of Object.entries(MODULE_PREFIX)) {
    if (id.startsWith(prefix)) return key
  }
  return null
}

function deterministicValue(q, r) {
  const opts = q.optionsIf ? q.optionsIf(r) : q.options
  if (q.input === 'multi_choice') return [opts[0].value]
  if (q.input === 'single_choice') return opts[0].value
  if (q.input === 'short_text') return 'x'
  if (q.input === 'numeric') return '1'.repeat(q.maxLength || 1)
  throw new Error(`deterministicValue: unknown input type ${q.input} for ${q.id}`)
}

// Repeatedly answers the first unanswered visible question with a
// deterministic valid value, pruning after each answer, until nothing is
// left unanswered or a hard iteration cap is hit (proves termination).
const WALK_CAP = 200

function autoAnswerWalk(initialResponses) {
  let r = initialResponses
  const everVisible = new Set()
  let iterations = 0
  for (; iterations < WALK_CAP; iterations++) {
    const visible = visibleQuestions(r)
    for (const q of visible) everVisible.add(q.id)
    const next = visible.find((q) => r[q.id] === null || r[q.id] === undefined)
    if (!next) return { responses: r, everVisible, iterations, terminated: true }
    r = set(r, { [next.id]: deterministicValue(next, r) })
  }
  return { responses: r, everVisible, iterations, terminated: false }
}

function assertModuleExclusivity(routeKey, everVisible, label) {
  const leaks = [...everVisible]
    .map((id) => ({ id, mod: moduleOf(id) }))
    .filter((x) => x.mod && x.mod !== routeKey)
  assert(
    `${label}: no other module's questions appear during the walk (found: ${
      leaks.map((l) => `${l.id}(${l.mod})`).join(', ') || 'none'
    })`,
    leaks.length === 0,
  )
}

function assertNoStaleValues(r, label) {
  const visible = visibleIds(r)
  const leaks = ALL_QUESTIONS.filter(
    (q) => !visible.has(q.id) && r[q.id] !== null && r[q.id] !== undefined,
  )
  assert(
    `${label}: no non-visible question holds a value (leaked: ${
      leaks.map((q) => q.id).join(', ') || 'none'
    })`,
    leaks.length === 0,
  )
}

/* =========================================================================
 * A. Secondary short screens
 * ========================================================================= */

// A1
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' })
  r = set(r, { SECONDARY_01: ['sleep'] })
  const v = visibleIds(r)
  assert('A1: SEC_SLEEP_01 visible when secondary=sleep, primary=digestion', v.has('SEC_SLEEP_01'))
  assert('A1: SEC_GI_01 not visible (gi is primary)', !v.has('SEC_GI_01'))
}

// A2: each of the 9 categories in isolation
{
  const categories = Object.keys(SECONDARY_SHORT_SCREENS)
  for (const cat of categories) {
    const primaryCat = cat === 'digestion' ? 'sleep' : 'digestion'
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: primaryCat })
    r = set(r, { SECONDARY_01: [cat] })
    const v = visibleIds(r)
    const ownScreen = SECONDARY_SHORT_SCREENS[cat]
    assert(`A2: secondary=${cat} shows ${ownScreen}`, v.has(ownScreen))
    for (const [k, screenId] of Object.entries(SECONDARY_SHORT_SCREENS)) {
      if (k === cat) continue
      assert(`A2: secondary=${cat} does not show ${screenId}`, !v.has(screenId))
    }
  }
}

// A3: deselecting nulls the stored screen answer
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['sleep'],
  })
  r = set(r, { SEC_SLEEP_01: ['sleep_onset'] })
  assert('A3: SEC_SLEEP_01 answered before deselect', Array.isArray(r['SEC_SLEEP_01']))
  r = set(r, { SECONDARY_01: [] })
  assert('A3: SEC_SLEEP_01 null after deselecting secondary sleep', r['SEC_SLEEP_01'] === null)
}

// A4: secondary 'none' shows no SEC_* screens
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['none'],
  })
  const v = visibleIds(r)
  for (const screenId of Object.values(SECONDARY_SHORT_SCREENS)) {
    assert(`A4: ${screenId} not visible when secondary=none`, !v.has(screenId))
  }
}

// A5: secondary 'other' shows SECONDARY_01A, no SEC_* screen; deselect nulls it
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['other'],
  })
  const v = visibleIds(r)
  assert('A5: SECONDARY_01A visible for secondary=other', v.has('SECONDARY_01A'))
  for (const screenId of Object.values(SECONDARY_SHORT_SCREENS)) {
    assert(`A5: ${screenId} not visible for secondary=other`, !v.has(screenId))
  }
  r = set(r, { SECONDARY_01A: 'some text' })
  r = set(r, { SECONDARY_01: [] })
  assert('A5: SECONDARY_01A null after deselecting other', r['SECONDARY_01A'] === null)
}

// A6: SEC_* screen can be answered with ['none']
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['sleep'],
  })
  const secSleepQ = ALL_QUESTIONS.find((q) => q.id === 'SEC_SLEEP_01')
  assert('A6: SEC_SLEEP_01 has a none option', secSleepQ.options.some((o) => o.value === 'none'))
  r = set(r, { SEC_SLEEP_01: ['none'] })
  assert(
    'A6: SEC_SLEEP_01 stored as [none] and prune does not crash',
    Array.isArray(r['SEC_SLEEP_01']) && r['SEC_SLEEP_01'].includes('none'),
  )
}

/* =========================================================================
 * B. Primary/secondary de-duplication
 * ========================================================================= */

// B7
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['sleep', 'pain'],
  })
  r = set(r, { VISIT_02_SYMPTOM_MAIN: 'sleep' })
  assert(
    'B7: SECONDARY_01 dedupes sleep once primary becomes sleep',
    JSON.stringify(r['SECONDARY_01']) === JSON.stringify(['pain']),
  )
  assert('B7: SEC_SLEEP_01 null once sleep dropped from SECONDARY_01', r['SEC_SLEEP_01'] === null)
}

// B8
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['women'],
  })
  r = set(r, { VISIT_01: 'women', VISIT_02_WOMEN: 'women' })
  assert(
    'B8: SECONDARY_01 dedupes women once primary becomes women',
    !(Array.isArray(r['SECONDARY_01']) && r['SECONDARY_01'].includes('women')),
  )
  assert('B8: SEC_WOMEN_01 null once women dropped from SECONDARY_01', r['SEC_WOMEN_01'] === null)
}

// B9
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'male', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' })
  r = set(r, { SECONDARY_01: ['women'] })
  assert(
    "B9: prune filters 'women' out of SECONDARY_01 for male patients",
    !(Array.isArray(r['SECONDARY_01']) && r['SECONDARY_01'].includes('women')),
  )
}

// B10
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    SECONDARY_01: ['pain', 'stress'],
  })
  assert(
    'B10: prune does not touch legitimate SECONDARY_01 values',
    JSON.stringify(r['SECONDARY_01']) === JSON.stringify(['pain', 'stress']),
  )
}

// B11: deep cascade terminates and settles correctly
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'women',
    SECONDARY_01: ['sleep'],
  })
  r = set(r, { SEC_SLEEP_01: ['sleep_onset'] })
  r = set(r, { VISIT_01: 'weight' })
  assert('B11: prune settles without throwing', true)
  assert('B11: WOMEN_01 null after switching primary to weight', r['WOMEN_01'] === null)
  assert('B11: VISIT_02_WOMEN null after switching primary to weight', r['VISIT_02_WOMEN'] === null)
}

/* =========================================================================
 * C. Reproductive safety de-duplication
 * ========================================================================= */

// C12
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' })
  assert('C12: WOMEN_SAFETY_01 visible for primary=pain', visibleIds(r).has('WOMEN_SAFETY_01'))
}

// C13
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'postpartum' })
  assert('C13: WOMEN_SAFETY_01 not visible for primary=postpartum', !visibleIds(r).has('WOMEN_SAFETY_01'))
}

// C14
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'pregnancy',
    PREGNANCY_01: 'pregnant',
  })
  assert(
    'C14: WOMEN_SAFETY_01 not visible when PREGNANCY_01=pregnant',
    !visibleIds(r).has('WOMEN_SAFETY_01'),
  )
}

// C15
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'pregnancy',
    PREGNANCY_01: 'fertility',
  })
  assert(
    'C15: WOMEN_SAFETY_01 visible when PREGNANCY_01=fertility (safety fix)',
    visibleIds(r).has('WOMEN_SAFETY_01'),
  )
}

// C16
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy' })
  assert(
    'C16: WOMEN_SAFETY_01 visible when PREGNANCY_01 unanswered',
    visibleIds(r).has('WOMEN_SAFETY_01'),
  )
}

// C17
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'male', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' })
  assert('C17: WOMEN_SAFETY_01 never visible for male', !visibleIds(r).has('WOMEN_SAFETY_01'))
}

// C18
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'postpartum',
    POSTPARTUM_01: '3_to_6m',
    POSTPARTUM_03: 'mixed',
  })
  const d = deriveReproductiveStatus(r)
  assert('C18: source postpartum_module', d.source === 'postpartum_module')
  assert('C18: postpartum_1y true', d.postpartum_1y === true)
  assert('C18: breastfeeding true (mixed counts)', d.breastfeeding === true)
  assert('C18: pregnant null', d.pregnant === null)
}

// C19
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'postpartum',
    POSTPARTUM_01: 'over_1y',
    POSTPARTUM_03: 'no',
  })
  const d = deriveReproductiveStatus(r)
  assert('C19: postpartum_1y false', d.postpartum_1y === false)
  assert('C19: breastfeeding false', d.breastfeeding === false)
}

// C20
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'pregnancy',
    PREGNANCY_01: 'pregnant',
  })
  const d = deriveReproductiveStatus(r)
  assert('C20: source pregnancy_module', d.source === 'pregnancy_module')
  assert('C20: pregnant true', d.pregnant === true)
  assert('C20: pregnancy_possible false', d.pregnancy_possible === false)
  assert('C20: breastfeeding null', d.breastfeeding === null)
}

// C21
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'pregnancy',
    PREGNANCY_01: 'possible',
  })
  r = set(r, { WOMEN_SAFETY_01: ['breastfeeding'] })
  const d = deriveReproductiveStatus(r)
  assert('C21: source WOMEN_SAFETY_01', d.source === 'WOMEN_SAFETY_01')
  assert('C21: breastfeeding true', d.breastfeeding === true)
  assert('C21: pregnancy_possible true (carried over from PREGNANCY_01=possible)', d.pregnancy_possible === true)
}

// C22
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    WOMEN_SAFETY_01: ['unknown'],
  })
  const d = deriveReproductiveStatus(r)
  assert('C22: pregnant null when unknown', d.pregnant === null)
  assert('C22: pregnancy_possible null when unknown', d.pregnancy_possible === null)
  assert('C22: postpartum_1y null when unknown', d.postpartum_1y === null)
  assert('C22: breastfeeding null when unknown', d.breastfeeding === null)
}

// C23
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    WOMEN_SAFETY_01: ['none'],
  })
  const d = deriveReproductiveStatus(r)
  assert('C23: pregnant false when none', d.pregnant === false)
  assert('C23: pregnancy_possible false when none', d.pregnancy_possible === false)
  assert('C23: postpartum_1y false when none', d.postpartum_1y === false)
  assert('C23: breastfeeding false when none', d.breastfeeding === false)
}

// C24
{
  const r = emptyResponses()
  const d = deriveReproductiveStatus(r)
  assert('C24: source null when nothing answered', d.source === null)
  assert(
    'C24: all four booleans null when nothing answered',
    d.pregnant === null && d.pregnancy_possible === null && d.postpartum_1y === null && d.breastfeeding === null,
  )
}

/* =========================================================================
 * D. Routing payload
 * ========================================================================= */

// D25
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    SECONDARY_01: ['pain'],
  })
  const rp = buildRoutingPayload(r)
  assert('D25: primary_concern sleep', rp.primary_concern === 'sleep')
  assert('D25: primary_module Sleep', rp.primary_module === 'Sleep')
  assert('D25: modules_activated [Sleep]', JSON.stringify(rp.modules_activated) === JSON.stringify(['Sleep']))
  assert('D25: secondary_screens [Pain]', JSON.stringify(rp.secondary_screens) === JSON.stringify(['Pain']))
  assert('D25: all_targets [Sleep, Pain]', JSON.stringify(rp.all_targets) === JSON.stringify(['Sleep', 'Pain']))
}

// D26
{
  for (const cat of Object.keys(SECONDARY_SHORT_SCREENS)) {
    const primaryCat = cat === 'digestion' ? 'sleep' : 'digestion'
    let r = emptyResponses()
    r = set(r, {
      ID_03: 'female',
      VISIT_01: 'symptom',
      VISIT_02_SYMPTOM_MAIN: primaryCat,
      SECONDARY_01: [cat],
    })
    const rp = buildRoutingPayload(r)
    assert(
      `D26: modules_activated excludes secondary-only target for ${cat}`,
      !rp.modules_activated.includes(MODULE_ROUTES[cat]),
    )
  }
}

// D27
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    SECONDARY_01: ['pain', 'stress'],
  })
  const rp = buildRoutingPayload(r)
  assert('D27: all_targets has no duplicates', new Set(rp.all_targets).size === rp.all_targets.length)
}

// D28
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'constitution', VISIT_02_CONST: 'constitution' })
  const rp = buildRoutingPayload(r)
  assert('D28: primary_concern null for constitution route', rp.primary_concern === null)
  assert('D28: modules_activated empty for constitution route', rp.modules_activated.length === 0)
  assert('D28: no secondary screens active without a secondary choice', rp.secondary_screens.length === 0)
}

/* =========================================================================
 * E. Payload integrity
 * ========================================================================= */

// E29
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  const payload = buildResponsePayload(r)
  const secKeys = Object.keys(payload.secondary_modules)
  assert('E29: secondary_modules has all 9 keys', secKeys.length === 9)
  for (const k of secKeys) {
    for (const [field, value] of Object.entries(payload.secondary_modules[k])) {
      assert(`E29: secondary_modules.${k}.${field} is null when nothing selected`, value === null)
    }
  }
}

// E30
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  const payload = JSON.parse(JSON.stringify(buildResponsePayload(r)))
  assert('E30: modules.gi.problems null after JSON round-trip', payload.modules.gi.problems === null)
  assert(
    'E30: modules.pain.primary_location null after JSON round-trip',
    payload.modules.pain.primary_location === null,
  )
  assert(
    'E30: secondary_modules.sleep.problems null after JSON round-trip',
    payload.secondary_modules.sleep.problems === null,
  )
  assert('E30: non-visible field is not the string "none"', payload.modules.gi.problems !== 'none')
  assert(
    'E30: non-visible field survives JSON round-trip as a present null key (not dropped as undefined)',
    'problems' in payload.modules.gi,
  )
}

// E31
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' })
  const payload = buildResponsePayload(r)
  assert(
    'E31: reproductive_status group has raw reproductive_status field',
    'reproductive_status' in payload.reproductive_status,
  )
  assert(
    'E31: reproductive_status group has derived object',
    typeof payload.reproductive_status.derived === 'object' && payload.reproductive_status.derived !== null,
  )
}

/* =========================================================================
 * F. Regression
 * ========================================================================= */

// F32
{
  const setups = [
    { label: 'sleep', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' }, module: 'Sleep' },
    { label: 'digestion', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' }, module: 'GI' },
    { label: 'bowel', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'bowel' }, module: 'Bowel' },
    { label: 'pain', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' }, module: 'Pain' },
    { label: 'urinary', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'urinary' }, module: 'Urinary' },
    { label: 'fatigue', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'fatigue' }, module: 'Fatigue' },
    { label: 'stress', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'stress' }, module: 'Stress' },
    { label: 'women', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'women' }, module: 'Women' },
    { label: 'pregnancy', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy' }, module: 'Pregnancy' },
    { label: 'postpartum', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'postpartum' }, module: 'Postpartum' },
    { label: 'weight', patch: { VISIT_01: 'weight' }, module: 'Weight' },
  ]
  for (const { label, patch, module } of setups) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...patch })
    assert(
      `F32: primary=${label} activates its own module (${module})`,
      JSON.stringify(modulesActivated(r)) === JSON.stringify([module]),
    )
  }
}

// F33
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, { SLEEP_01: ['sleep_onset'], SLEEP_02: '1_2_days' })
  r = set(r, { VISIT_02_SYMPTOM_MAIN: 'digestion' })
  assert('F33: SLEEP_01 null after switching primary away from sleep', r['SLEEP_01'] === null)
  assert('F33: SLEEP_02 null after switching primary away from sleep', r['SLEEP_02'] === null)
}

// F34
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain', PAIN_01: 'other' })
  assert('F34: PAIN_01A visible when PAIN_01=other', visibleIds(r).has('PAIN_01A'))
  r = set(r, { PAIN_01A: 'custom spot' })
  r = set(r, { PAIN_01: 'knee' })
  assert('F34: PAIN_01A null after switching PAIN_01 away from other', r['PAIN_01A'] === null)
}
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'women', WOMEN_01: ['other'] })
  assert('F34: WOMEN_01A visible when WOMEN_01 includes other', visibleIds(r).has('WOMEN_01A'))
  r = set(r, { WOMEN_01A: 'custom' })
  r = set(r, { WOMEN_01: ['dysmenorrhea'] })
  assert('F34: WOMEN_01A null after removing other from WOMEN_01', r['WOMEN_01A'] === null)
}
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'pregnancy',
    PREGNANCY_03: ['other'],
  })
  assert('F34: PREGNANCY_03A visible when PREGNANCY_03 includes other', visibleIds(r).has('PREGNANCY_03A'))
  r = set(r, { PREGNANCY_03A: 'custom' })
  r = set(r, { PREGNANCY_03: ['nausea'] })
  assert('F34: PREGNANCY_03A null after removing other from PREGNANCY_03', r['PREGNANCY_03A'] === null)
}
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'postpartum',
    POSTPARTUM_02: ['other'],
  })
  assert('F34: POSTPARTUM_02A visible when POSTPARTUM_02 includes other', visibleIds(r).has('POSTPARTUM_02A'))
  r = set(r, { POSTPARTUM_02A: 'custom' })
  r = set(r, { POSTPARTUM_02: ['fatigue_recovery'] })
  assert('F34: POSTPARTUM_02A null after removing other from POSTPARTUM_02', r['POSTPARTUM_02A'] === null)
}

/* =========================================================================
 * G. Full route coverage matrix
 * ========================================================================= */

// G1
{
  const visitQ = ALL_QUESTIONS.find((q) => q.id === 'VISIT_01')
  const femaleOpts = visitQ.optionsIf({ ID_03: 'female' }).map((o) => o.value)
  const maleOpts = visitQ.optionsIf({ ID_03: 'male' }).map((o) => o.value)
  assert('G1: female VISIT_01 options include women', femaleOpts.includes('women'))
  assert('G1: male VISIT_01 options do not include women', !maleOpts.includes('women'))
}

// G2: every symptom primary route
const G2_SETUPS = [
  { label: 'sleep', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' }, key: 'sleep' },
  { label: 'digestion', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' }, key: 'digestion' },
  { label: 'bowel', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'bowel' }, key: 'bowel' },
  { label: 'pain', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' }, key: 'pain' },
  { label: 'urinary', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'urinary' }, key: 'urinary' },
  { label: 'fatigue', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'fatigue' }, key: 'fatigue' },
  { label: 'stress', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'stress' }, key: 'stress' },
]
{
  for (const { label, patch, key } of G2_SETUPS) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...patch })
    const { everVisible, terminated, iterations } = autoAnswerWalk(r)
    assert(`G2: ${label} walk terminates within the ${WALK_CAP}-iteration cap (used ${iterations})`, terminated)
    const ownIds = [...everVisible].filter((id) => moduleOf(id) === key)
    assert(`G2: ${label} route's own module questions appeared`, ownIds.length > 0)
    assertModuleExclusivity(key, everVisible, `G2: ${label}`)
  }
}

// G3: women / pregnancy / postpartum / weight / constitution / tonic
const G3_SETUPS = [
  { label: 'women', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'women' }, key: 'women' },
  { label: 'pregnancy', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy' }, key: 'pregnancy' },
  { label: 'postpartum', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'postpartum' }, key: 'postpartum' },
  { label: 'weight', patch: { VISIT_01: 'weight' }, key: 'weight' },
  { label: 'constitution', patch: { VISIT_01: 'constitution', VISIT_02_CONST: 'constitution' }, key: null },
  { label: 'tonic', patch: { VISIT_01: 'constitution', VISIT_02_CONST: 'tonic' }, key: null },
]
{
  for (const { label, patch, key } of G3_SETUPS) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...patch })
    const { everVisible, terminated, iterations } = autoAnswerWalk(r)
    assert(`G3: ${label} walk terminates within the ${WALK_CAP}-iteration cap (used ${iterations})`, terminated)
    if (key) {
      const ownIds = [...everVisible].filter((id) => moduleOf(id) === key)
      assert(`G3: ${label} route's own module questions appeared`, ownIds.length > 0)
    }
    assertModuleExclusivity(key, everVisible, `G3: ${label}`)
  }
}

// G4: secondary max-two
{
  const sec01 = ALL_QUESTIONS.find((q) => q.id === 'SECONDARY_01')
  assert('G4: SECONDARY_01 is a multi_choice question', sec01.input === 'multi_choice')
  assert('G4: SECONDARY_01.max === 2', sec01.max === 2)
  assert('G4: SECONDARY_01 offers more than 2 options (max is meaningful)', sec01.options.length > 2)
}

// G5: representative primary + exactly-two-secondaries combos
{
  const combos = [
    {
      label: 'sleep+[digestion,pain]',
      patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' },
      primaryKey: 'sleep',
      primaryLabel: 'Sleep',
      secs: ['digestion', 'pain'],
    },
    {
      label: 'women+[sleep,weight]',
      patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'women' },
      primaryKey: 'women',
      primaryLabel: 'Women',
      secs: ['sleep', 'weight'],
    },
    {
      label: 'weight+[stress,bowel]',
      patch: { VISIT_01: 'weight' },
      primaryKey: 'weight',
      primaryLabel: 'Weight',
      secs: ['stress', 'bowel'],
    },
    {
      label: 'pregnancy+[sleep,pain]',
      patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy' },
      primaryKey: 'pregnancy',
      primaryLabel: 'Pregnancy',
      secs: ['sleep', 'pain'],
    },
    {
      label: 'postpartum+[urinary,fatigue]',
      patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'postpartum' },
      primaryKey: 'postpartum',
      primaryLabel: 'Postpartum',
      secs: ['urinary', 'fatigue'],
    },
  ]

  for (const combo of combos) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...combo.patch })
    r = set(r, { SECONDARY_01: combo.secs })
    const { responses: finalR, everVisible, terminated } = autoAnswerWalk(r)
    assert(`G5: ${combo.label} walk terminates`, terminated)

    // (a) exactly the primary module's own questions appeared
    const modulesSeen = new Set([...everVisible].map((id) => moduleOf(id)).filter(Boolean))
    assert(
      `G5: ${combo.label} exactly the primary module (${combo.primaryKey}) appeared (found: ${[...modulesSeen].join(', ')})`,
      modulesSeen.size === 1 && modulesSeen.has(combo.primaryKey),
    )

    // (b) exactly the two expected SEC_* screens appeared
    const expectedSecScreens = new Set(combo.secs.map((s) => SECONDARY_SHORT_SCREENS[s]))
    const secScreensSeen = new Set(
      [...everVisible].filter((id) => Object.values(SECONDARY_SHORT_SCREENS).includes(id)),
    )
    assert(
      `G5: ${combo.label} shows exactly the expected SEC_* screens (expected: ${[...expectedSecScreens].join(
        ', ',
      )}, got: ${[...secScreensSeen].join(', ')})`,
      secScreensSeen.size === expectedSecScreens.size &&
        [...expectedSecScreens].every((id) => secScreensSeen.has(id)),
    )

    // (c) buildRoutingPayload().all_targets equals [primary, sec1, sec2] (fixed
    // SECONDARY_SHORT_SCREENS declaration order, not selection order)
    const expectedSecondaryTargets = Object.keys(SECONDARY_SHORT_SCREENS)
      .filter((k) => combo.secs.includes(k))
      .map((k) => MODULE_ROUTES[k])
    const expectedAllTargets = [combo.primaryLabel, ...expectedSecondaryTargets]
    const rp = buildRoutingPayload(finalR)
    assert(
      `G5: ${combo.label} all_targets === ${JSON.stringify(expectedAllTargets)} (got ${JSON.stringify(rp.all_targets)})`,
      JSON.stringify(rp.all_targets) === JSON.stringify(expectedAllTargets),
    )

    // (d) modules_activated contains only the primary module
    assert(
      `G5: ${combo.label} modules_activated === [${combo.primaryLabel}]`,
      JSON.stringify(rp.modules_activated) === JSON.stringify([combo.primaryLabel]),
    )
  }
}

/* =========================================================================
 * H. Deep stale-cleanup sweep
 * ========================================================================= */

const H1_MODULES = [
  { key: 'sleep', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' } },
  { key: 'digestion', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' } },
  { key: 'bowel', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'bowel' } },
  { key: 'pain', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' } },
  { key: 'urinary', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'urinary' } },
  { key: 'fatigue', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'fatigue' } },
  { key: 'stress', patch: { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'stress' } },
  { key: 'women', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'women' } },
  { key: 'pregnancy', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy' } },
  { key: 'postpartum', patch: { VISIT_01: 'women', VISIT_02_WOMEN: 'postpartum' } },
  { key: 'weight', patch: { VISIT_01: 'weight' } },
]

// H1
{
  for (const mod of H1_MODULES) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...mod.patch })
    const { responses: filled, terminated } = autoAnswerWalk(r)
    assert(`H1: ${mod.key} full walk terminates`, terminated)

    // Switch primary concern to a fixed different route (weight, unless we're
    // already on weight, in which case switch to sleep).
    const switchTarget =
      mod.key === 'weight'
        ? { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' }
        : { VISIT_01: 'weight' }
    const switched = set(filled, switchTarget)

    const staleIds = ALL_QUESTIONS.filter((q) => moduleOf(q.id) === mod.key).map((q) => q.id)
    const leftover = staleIds.filter((id) => switched[id] !== null)
    assert(
      `H1: ${mod.key} module fully cleared after switching primary away (leftover: ${leftover.join(', ') || 'none'})`,
      leftover.length === 0,
    )
  }
}

// H2: conditional branch cleanup, each asserted explicitly
{
  // URINARY_01 nocturia -> URINARY_03
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'urinary', URINARY_01: ['nocturia'] })
  assert('H2: URINARY_03 visible when URINARY_01 includes nocturia', visibleIds(r).has('URINARY_03'))
  r = set(r, { URINARY_01: ['frequency'] })
  assert('H2: URINARY_03 null after removing nocturia from URINARY_01', r['URINARY_03'] === null)
}
{
  // URINARY_01 incontinence -> URINARY_04
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'urinary', URINARY_01: ['incontinence'] })
  assert('H2: URINARY_04 visible when URINARY_01 includes incontinence', visibleIds(r).has('URINARY_04'))
  r = set(r, { URINARY_01: ['frequency'] })
  assert('H2: URINARY_04 null after removing incontinence from URINARY_01', r['URINARY_04'] === null)
}
{
  // PAIN_04 other -> PAIN_04A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain', PAIN_04: 'other' })
  assert('H2: PAIN_04A visible when PAIN_04=other', visibleIds(r).has('PAIN_04A'))
  r = set(r, { PAIN_04: 'none' })
  assert('H2: PAIN_04A null after PAIN_04 changed away from other', r['PAIN_04A'] === null)
}
{
  // PAIN_01 other -> PAIN_01A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain', PAIN_01: 'other' })
  assert('H2: PAIN_01A visible when PAIN_01=other', visibleIds(r).has('PAIN_01A'))
  r = set(r, { PAIN_01: 'knee' })
  assert('H2: PAIN_01A null after PAIN_01 changed away from other', r['PAIN_01A'] === null)
}
{
  // SLEEP_01 night_awakenings -> SLEEP_03
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep', SLEEP_01: ['night_awakenings'] })
  assert('H2: SLEEP_03 visible when SLEEP_01 includes night_awakenings', visibleIds(r).has('SLEEP_03'))
  r = set(r, { SLEEP_01: ['sleep_onset'] })
  assert('H2: SLEEP_03 null after removing night_awakenings from SLEEP_01', r['SLEEP_03'] === null)
}
{
  // SLEEP_03 other -> SLEEP_03A
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    SLEEP_01: ['night_awakenings'],
    SLEEP_03: ['other'],
  })
  assert('H2: SLEEP_03A visible when SLEEP_03 includes other', visibleIds(r).has('SLEEP_03A'))
  r = set(r, { SLEEP_03: ['urination'] })
  assert('H2: SLEEP_03A null after removing other from SLEEP_03', r['SLEEP_03A'] === null)
}
{
  // BOWEL_01 constipation -> BOWEL_04
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'bowel', BOWEL_01: ['constipation'] })
  assert('H2: BOWEL_04 visible when BOWEL_01 includes constipation', visibleIds(r).has('BOWEL_04'))
  r = set(r, { BOWEL_01: ['diarrhea'] })
  assert('H2: BOWEL_04 null after removing constipation from BOWEL_01', r['BOWEL_04'] === null)
}
// GI has no conditional branch (GI_01/02/03 are all unconditional within the GI module) -- nothing to assert.
{
  // WOMEN_01 other -> WOMEN_01A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'women', WOMEN_01: ['other'] })
  assert('H2: WOMEN_01A visible when WOMEN_01 includes other', visibleIds(r).has('WOMEN_01A'))
  r = set(r, { WOMEN_01: ['discharge_discomfort'] })
  assert('H2: WOMEN_01A null after removing other from WOMEN_01', r['WOMEN_01A'] === null)
}
{
  // WOMEN_01 menopause_symptoms -> WOMEN_03
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'women', WOMEN_01: ['menopause_symptoms'] })
  assert('H2: WOMEN_03 visible when WOMEN_01 includes menopause_symptoms', visibleIds(r).has('WOMEN_03'))
  r = set(r, { WOMEN_01: ['discharge_discomfort'] })
  assert('H2: WOMEN_03 null after removing menopause_symptoms from WOMEN_01', r['WOMEN_03'] === null)
}
{
  // WOMEN_01 menstrual trigger (e.g. dysmenorrhea) -> WOMEN_02
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'women', WOMEN_01: ['dysmenorrhea'] })
  assert('H2: WOMEN_02 visible when WOMEN_01 includes a menstrual trigger', visibleIds(r).has('WOMEN_02'))
  r = set(r, { WOMEN_01: ['discharge_discomfort'] })
  assert('H2: WOMEN_02 null after removing menstrual trigger from WOMEN_01', r['WOMEN_02'] === null)
}
{
  // PREGNANCY_01 pregnant -> PREGNANCY_02
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy', PREGNANCY_01: 'pregnant' })
  assert('H2: PREGNANCY_02 visible when PREGNANCY_01=pregnant', visibleIds(r).has('PREGNANCY_02'))
  r = set(r, { PREGNANCY_01: 'possible' })
  assert('H2: PREGNANCY_02 null after PREGNANCY_01 changed away from pregnant', r['PREGNANCY_02'] === null)
}
{
  // PREGNANCY_03 other -> PREGNANCY_03A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'pregnancy', PREGNANCY_03: ['other'] })
  assert('H2: PREGNANCY_03A visible when PREGNANCY_03 includes other', visibleIds(r).has('PREGNANCY_03A'))
  r = set(r, { PREGNANCY_03: ['nausea'] })
  assert('H2: PREGNANCY_03A null after removing other from PREGNANCY_03', r['PREGNANCY_03A'] === null)
}
{
  // POSTPARTUM_02 other -> POSTPARTUM_02A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'postpartum', POSTPARTUM_02: ['other'] })
  assert('H2: POSTPARTUM_02A visible when POSTPARTUM_02 includes other', visibleIds(r).has('POSTPARTUM_02A'))
  r = set(r, { POSTPARTUM_02: ['fatigue_recovery'] })
  assert('H2: POSTPARTUM_02A null after removing other from POSTPARTUM_02', r['POSTPARTUM_02A'] === null)
}
{
  // MED_USE yes -> MED_TYPES
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', MED_USE: 'yes' })
  assert('H2: MED_TYPES visible when MED_USE=yes', visibleIds(r).has('MED_TYPES'))
  r = set(r, { MED_USE: 'none' })
  assert('H2: MED_TYPES null after MED_USE changed away from yes', r['MED_TYPES'] === null)
}
{
  // ALLERGY_01 yes -> ALLERGY_02
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', ALLERGY_01: 'yes' })
  assert('H2: ALLERGY_02 visible when ALLERGY_01=yes', visibleIds(r).has('ALLERGY_02'))
  r = set(r, { ALLERGY_01: 'none' })
  assert('H2: ALLERGY_02 null after ALLERGY_01 changed away from yes', r['ALLERGY_02'] === null)
}
{
  // SURGERY_01 yes -> SURGERY_02
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', SURGERY_01: 'yes' })
  assert('H2: SURGERY_02 visible when SURGERY_01=yes', visibleIds(r).has('SURGERY_02'))
  r = set(r, { SURGERY_01: 'none' })
  assert('H2: SURGERY_02 null after SURGERY_01 changed away from yes', r['SURGERY_02'] === null)
}
{
  // BIRTH_02 lunar -> BIRTH_02A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', BIRTH_02: 'lunar' })
  assert('H2: BIRTH_02A visible when BIRTH_02=lunar', visibleIds(r).has('BIRTH_02A'))
  r = set(r, { BIRTH_02: 'solar' })
  assert('H2: BIRTH_02A null after BIRTH_02 changed away from lunar', r['BIRTH_02A'] === null)
}
{
  // BIRTH_03 an actual branch -> BIRTH_03A
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', BIRTH_03: 'ja' })
  assert('H2: BIRTH_03A visible when BIRTH_03=ja', visibleIds(r).has('BIRTH_03A'))
  r = set(r, { BIRTH_03: 'unknown' })
  assert('H2: BIRTH_03A null after BIRTH_03 changed to unknown', r['BIRTH_03A'] === null)
}
{
  // FREE_01 yes -> FREE_02
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', FREE_01: 'yes' })
  assert('H2: FREE_02 visible when FREE_01=yes', visibleIds(r).has('FREE_02'))
  r = set(r, { FREE_01: 'none' })
  assert('H2: FREE_02 null after FREE_01 changed away from yes', r['FREE_02'] === null)
}

// H3: global invariant sweep -- after any full walk + prune, no non-visible
// question holds a non-null value. Sweep every H1 route (both fully-filled
// and post-switch state) plus every G2/G3 route's final walk state.
{
  for (const mod of H1_MODULES) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...mod.patch })
    const { responses: filled } = autoAnswerWalk(r)
    assertNoStaleValues(filled, `H3: ${mod.key} fully-filled route`)

    const switchTarget =
      mod.key === 'weight'
        ? { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' }
        : { VISIT_01: 'weight' }
    const switched = set(filled, switchTarget)
    assertNoStaleValues(switched, `H3: ${mod.key} after switching primary away`)
  }
  for (const { label, patch } of [...G2_SETUPS, ...G3_SETUPS]) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', ...patch })
    const { responses: finalR } = autoAnswerWalk(r)
    assertNoStaleValues(finalR, `H3: ${label} full walk`)
  }
}

/* =========================================================================
 * I. Safety consistency
 * ========================================================================= */

// I1
{
  const keys = Object.keys(STAFF_CHECK_TRIGGERS).sort()
  assert(
    'I1: STAFF_CHECK_TRIGGERS keys are exactly SAFETY_01, GI_03, BOWEL_03',
    JSON.stringify(keys) === JSON.stringify(['BOWEL_03', 'GI_03', 'SAFETY_01']),
  )
}

// I2
{
  const safetyQ = ALL_QUESTIONS.find((q) => q.id === 'SAFETY_01')
  const redFlags = safetyQ.options.map((o) => o.value).filter((v) => v !== 'none')
  for (const v of redFlags) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', SAFETY_01: [v] })
    assert(`I2: SAFETY_01=[${v}] sets requires_staff_check true`, computeFlags(r).requires_staff_check === true)
  }
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', SAFETY_01: ['none'] })
  assert('I2: SAFETY_01=[none] does not set requires_staff_check', computeFlags(r).requires_staff_check === false)
}

// I3
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion', GI_03: 'yes' })
  assert('I3: GI_03=yes triggers requires_staff_check', computeFlags(r).requires_staff_check === true)
  r = set(r, { GI_03: 'no' })
  assert('I3: GI_03=no does not trigger requires_staff_check', computeFlags(r).requires_staff_check === false)

  let r2 = emptyResponses()
  r2 = set(r2, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'bowel', BOWEL_03: 'yes' })
  assert('I3: BOWEL_03=yes triggers requires_staff_check', computeFlags(r2).requires_staff_check === true)
  for (const v of ['no', 'not_sure']) {
    r2 = set(r2, { BOWEL_03: v })
    assert(`I3: BOWEL_03=${v} does not trigger requires_staff_check`, computeFlags(r2).requires_staff_check === false)
  }
}

// I4
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SAFETY_01: ['none'],
    GI_03: 'no',
  })
  assert(
    'I4: requires_staff_check false when all safety answers are benign (digestion)',
    computeFlags(r).requires_staff_check === false,
  )

  let r2 = emptyResponses()
  r2 = set(r2, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'bowel',
    SAFETY_01: ['none'],
    BOWEL_03: 'not_sure',
  })
  assert(
    'I4: requires_staff_check false when all safety answers are benign (bowel, not_sure)',
    computeFlags(r2).requires_staff_check === false,
  )
}

// I5: no developer terminology leaks into patient-facing Korean text
{
  const FORBIDDEN_TERMS = [
    'module',
    'router',
    'red flag',
    'redflag',
    'staffcheck',
    'stale',
    'payload',
    'null',
    'enum',
    'debug',
  ]
  const violations = []

  const checkText = (id, text) => {
    if (!text) return
    const lower = text.toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      if (lower.includes(term)) violations.push(`${id}: "${text}" contains "${term}"`)
    }
  }

  for (const q of ALL_QUESTIONS) {
    checkText(q.id, q.question)
    checkText(q.id, q.helper)
    for (const o of q.options ?? []) checkText(`${q.id}.${o.value}`, o.label)
  }

  // Dynamic helperIf text (MED_USE, TEST_01) -- evaluate with the triggering state.
  let hr = emptyResponses()
  hr = set(hr, { ID_03: 'female', MED_USE: 'yes', TEST_01: 'yes' })
  for (const q of ALL_QUESTIONS) {
    if (q.helperIf) checkText(`${q.id} (dynamic helper)`, q.helperIf(hr))
  }

  assert(
    `I5: no question/option text contains developer terminology (violations: ${violations.join(' | ') || 'none'})`,
    violations.length === 0,
  )
}

/* =========================================================================
 * J. Birth data / Saju input mapping
 * ========================================================================= */

// J1: BIRTH_02A visibility follows BIRTH_02
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', BIRTH_02: 'lunar' })
  assert('J1: BIRTH_02A visible when BIRTH_02=lunar', visibleIds(r).has('BIRTH_02A'))
  r = set(r, { BIRTH_02A: 'no' })
  r = set(r, { BIRTH_02: 'solar' })
  assert('J1: BIRTH_02A not visible when BIRTH_02=solar', !visibleIds(r).has('BIRTH_02A'))
  assert('J1: BIRTH_02A nulled after switching BIRTH_02 back to solar', r['BIRTH_02A'] === null)
}

// J2: BIRTH_03A visibility follows BIRTH_03
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', BIRTH_03: 'o' })
  assert('J2: BIRTH_03A visible when BIRTH_03=o', visibleIds(r).has('BIRTH_03A'))
  r = set(r, { BIRTH_03A: 'exact' })
  r = set(r, { BIRTH_03: 'unknown' })
  assert('J2: BIRTH_03A not visible when BIRTH_03=unknown', !visibleIds(r).has('BIRTH_03A'))
  assert('J2: BIRTH_03A nulled after BIRTH_03 set to unknown', r['BIRTH_03A'] === null)
}

// J3: BIRTH_03 has exactly 13 options -- the 12 branches + unknown
{
  const birth03 = ALL_QUESTIONS.find((q) => q.id === 'BIRTH_03')
  assert('J3: BIRTH_03 has exactly 13 options', birth03.options.length === 13)
  const values = birth03.options.map((o) => o.value).sort()
  const expected = ['chuk', 'ja', 'in', 'jin', 'mi', 'myo', 'o', 'sa', 'sin', 'sul', 'unknown', 'yu', 'hae'].sort()
  assert(
    `J3: BIRTH_03 option values are exactly the 12 branches + unknown (got: ${values.join(',')})`,
    JSON.stringify(values) === JSON.stringify(expected),
  )
}

// J4: no question anywhere still uses the removed free-text birth-time variables
{
  const leftoverVars = ALL_QUESTIONS.filter(
    (q) => q.variable === 'birth_time_detail' || q.variable === 'birth_time_known',
  )
  assert(
    `J4: no question uses variable birth_time_detail or birth_time_known (found: ${leftoverVars.map((q) => q.id).join(', ') || 'none'})`,
    leftoverVars.length === 0,
  )
}

// J5: buildSajuInput mapping -- solar case
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    BIRTH_01: '19900101',
    BIRTH_02: 'solar',
    BIRTH_03: 'o',
    BIRTH_03A: 'exact',
  })
  const input = buildSajuInput(r)
  assert(
    'J5: solar case maps field by field',
    input.birthDateRaw === '19900101' &&
      input.calendarType === 'solar' &&
      input.lunarLeapMonth === null &&
      input.timeBranch === 'o' &&
      input.timeConfidence === 'exact' &&
      input.sex === 'female',
  )
}

// J6: buildSajuInput mapping -- lunar + leap case
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'male',
    BIRTH_01: '19850615',
    BIRTH_02: 'lunar',
    BIRTH_02A: 'yes',
    BIRTH_03: 'chuk',
    BIRTH_03A: 'approximate',
  })
  const input = buildSajuInput(r)
  assert(
    'J6: lunar+leap case maps field by field',
    input.birthDateRaw === '19850615' &&
      input.calendarType === 'lunar' &&
      input.lunarLeapMonth === 'yes' &&
      input.timeBranch === 'chuk' &&
      input.timeConfidence === 'approximate' &&
      input.sex === 'male',
  )
}

// J7: buildSajuInput mapping -- lunar + unknown-leap case
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    BIRTH_01: '20000229',
    BIRTH_02: 'lunar',
    BIRTH_02A: 'unknown',
    BIRTH_03: 'unknown',
  })
  const input = buildSajuInput(r)
  assert(
    'J7: lunar+unknown-leap case maps field by field',
    input.birthDateRaw === '20000229' &&
      input.calendarType === 'lunar' &&
      input.lunarLeapMonth === 'unknown' &&
      input.timeBranch === 'unknown' &&
      input.timeConfidence === null &&
      input.sex === 'female',
  )
}

// J8: buildSajuInput mapping -- time-unknown case (never answered)
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'male',
    BIRTH_01: '19991231',
    BIRTH_02: 'solar',
  })
  const input = buildSajuInput(r)
  assert(
    'J8: time-unanswered case maps timeBranch/timeConfidence to null',
    input.birthDateRaw === '19991231' &&
      input.calendarType === 'solar' &&
      input.lunarLeapMonth === null &&
      input.timeBranch === null &&
      input.timeConfidence === null &&
      input.sex === 'male',
  )
}

// J9: buildResponsePayload().birth_info has the 5 new fields, not the old ones
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    BIRTH_01: '19900101',
    BIRTH_02: 'lunar',
    BIRTH_02A: 'no',
    BIRTH_03: 'sa',
    BIRTH_03A: 'exact',
  })
  const payload = buildResponsePayload(r)
  assert(
    'J9: birth_info has exactly the 5 new fields',
    JSON.stringify(Object.keys(payload.birth_info).sort()) ===
      JSON.stringify(
        ['birth_date', 'birth_calendar_type', 'lunar_leap_month', 'birth_time_branch', 'birth_time_confidence'].sort(),
      ),
  )
  assert('J9: birth_info.birth_date correct', payload.birth_info.birth_date === '19900101')
  assert('J9: birth_info.birth_calendar_type correct', payload.birth_info.birth_calendar_type === 'lunar')
  assert('J9: birth_info.lunar_leap_month correct', payload.birth_info.lunar_leap_month === 'no')
  assert('J9: birth_info.birth_time_branch correct', payload.birth_info.birth_time_branch === 'sa')
  assert('J9: birth_info.birth_time_confidence correct', payload.birth_info.birth_time_confidence === 'exact')
  assert('J9: birth_info does not have birth_time_detail', !('birth_time_detail' in payload.birth_info))
}

/* =========================================================================
 * K. MENOPAUSE_SLEEP v0.2 Compact
 * (docs/ClaudeCode_MENOPAUSE_SLEEP_v0.2_Compact_Delta.md)
 * ========================================================================= */

const MS_IDS = ['MS_01', 'MS_02', 'MS_03', 'MS_04', 'MS_05', 'MS_06', 'MS_07']

// K1: Gate visibility routing
{
  let male = emptyResponses()
  male = set(male, { ID_03: 'male', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  assert('K1: male + primary sleep does not show MS_GATE_01', !visibleIds(male).has('MS_GATE_01'))

  let female = emptyResponses()
  female = set(female, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  assert('K1: female + primary sleep shows MS_GATE_01', visibleIds(female).has('MS_GATE_01'))

  let femaleOther = emptyResponses()
  femaleOther = set(femaleOther, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' })
  assert(
    'K1: female + primary digestion does not show MS_GATE_01',
    !visibleIds(femaleOther).has('MS_GATE_01'),
  )
}

// K2: secondary=sleep (not primary) does not auto-run the panel
{
  let r = emptyResponses()
  r = set(r, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
    SECONDARY_01: ['sleep'],
  })
  assert('K2: secondary sleep does not show MS_GATE_01', !visibleIds(r).has('MS_GATE_01'))
}

// K3: Gate=no ends MENOPAUSE_SLEEP, existing SLEEP module unaffected
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, { MS_GATE_01: 'no' })
  const v = visibleIds(r)
  for (const id of MS_IDS) assert(`K3: Gate=no hides ${id}`, !v.has(id))
  assert('K3: Gate=no still shows SLEEP_01', v.has('SLEEP_01'))
}

// K4/K5: Gate=yes or unsure shows the 5 base MS questions
for (const gateValue of ['yes', 'unsure']) {
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, { MS_GATE_01: gateValue, SLEEP_01: ['sleep_onset'] })
  const v = visibleIds(r)
  for (const id of ['MS_01', 'MS_02', 'MS_03', 'MS_04', 'MS_05']) {
    assert(`K4/K5: Gate=${gateValue} shows ${id}`, v.has(id))
  }
  assert(`K4/K5: Gate=${gateValue} hides MS_06 (no maintenance)`, !v.has('MS_06'))
  assert(`K4/K5: Gate=${gateValue} hides MS_07 (no maintenance/early_waking)`, !v.has('MS_07'))
}

// K6: base question budget === 5 (excluding Gate) when no maintenance/early_waking
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, { MS_GATE_01: 'yes', SLEEP_01: ['sleep_onset'] })
  const shown = MS_IDS.filter((id) => visibleIds(r).has(id))
  assert(`K6: base MS screens === 5 (got ${shown.length}: ${shown.join(', ')})`, shown.length === 5)
}

// K7: worst-case question budget === 7 (excluding Gate) with maintenance + early_waking
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, {
    MS_GATE_01: 'yes',
    SLEEP_01: ['night_awakenings', 'early_waking'],
  })
  const shown = MS_IDS.filter((id) => visibleIds(r).has(id))
  assert(`K7: worst-case MS screens === 7 (got ${shown.length}: ${shown.join(', ')})`, shown.length === 7)
}

// K8: MS_06 only for maintenance (night_awakenings); MS_07 for maintenance OR early_waking
{
  let onlyEarly = emptyResponses()
  onlyEarly = set(onlyEarly, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  onlyEarly = set(onlyEarly, { MS_GATE_01: 'yes', SLEEP_01: ['early_waking'] })
  assert('K8: early_waking only hides MS_06', !visibleIds(onlyEarly).has('MS_06'))
  assert('K8: early_waking only shows MS_07', visibleIds(onlyEarly).has('MS_07'))

  let onlyMaintenance = emptyResponses()
  onlyMaintenance = set(onlyMaintenance, {
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
  })
  onlyMaintenance = set(onlyMaintenance, { MS_GATE_01: 'yes', SLEEP_01: ['night_awakenings'] })
  assert('K8: maintenance only shows MS_06', visibleIds(onlyMaintenance).has('MS_06'))
  assert('K8: maintenance only shows MS_07', visibleIds(onlyMaintenance).has('MS_07'))
}

// K9: 8-question v1.0 structure no longer exists (only MS_01..MS_07 + Gate remain)
{
  const msIdsInSpec = ALL_QUESTIONS.filter((q) => q.id.startsWith('MS_')).map((q) => q.id)
  assert(
    'K9: exactly MS_GATE_01 + MS_01..MS_07 exist (8 ids total)',
    JSON.stringify(msIdsInSpec.sort()) ===
      JSON.stringify(['MS_01', 'MS_02', 'MS_03', 'MS_04', 'MS_05', 'MS_06', 'MS_07', 'MS_GATE_01'].sort()),
  )
}

// K10: stale cleanup -- flipping Gate from yes to no nulls all MS_ responses
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, {
    MS_GATE_01: 'yes',
    SLEEP_01: ['night_awakenings'],
    MS_01: 'still_regular',
    MS_02: 'none',
    MS_03: 'rare',
    MS_04: '7h_plus',
    MS_05: ['none'],
    MS_06: 'once',
    MS_07: 'within_15m',
  })
  for (const id of MS_IDS) assert(`K10: ${id} answered before Gate flips to no`, r[id] !== null)
  r = set(r, { MS_GATE_01: 'no' })
  for (const id of MS_IDS) assert(`K10: ${id} null after Gate flips to no`, r[id] === null)
}

// K11: stale cleanup -- deselecting maintenance nulls MS_06 but keeps MS_07 (early_waking remains)
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, {
    MS_GATE_01: 'yes',
    SLEEP_01: ['night_awakenings', 'early_waking'],
    MS_06: 'once',
    MS_07: 'within_15m',
  })
  r = set(r, { SLEEP_01: ['early_waking'] })
  assert('K11: MS_06 null after maintenance dropped', r['MS_06'] === null)
  assert('K11: MS_07 kept (early_waking still present)', r['MS_07'] === 'within_15m')
}

// K12: primary change away from sleep clears the whole MENOPAUSE_SLEEP branch
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, { MS_GATE_01: 'yes', SLEEP_01: ['sleep_onset'], MS_01: 'still_regular' })
  r = set(r, { VISIT_02_SYMPTOM_MAIN: 'digestion' })
  assert('K12: MS_GATE_01 null after primary leaves sleep', r['MS_GATE_01'] === null)
  assert('K12: MS_01 null after primary leaves sleep', r['MS_01'] === null)
  assert('K12: SLEEP_01 null after primary leaves sleep', r['SLEEP_01'] === null)
}

// K13: MS_05 is exclusive on both none and unknown (spec 3: neither combines with positives)
{
  const ms05 = ALL_QUESTIONS.find((q) => q.id === 'MS_05')
  assert(
    'K13: MS_05.exclusive === [none, unknown]',
    JSON.stringify(ms05.exclusive) === JSON.stringify(['none', 'unknown']),
  )
}

// K14/K15: sleep disorder screen flags -- doctor-review only, no immediate StaffCheck trigger
{
  const reviewOnly = ['loud_snoring', 'restless_legs_pattern']
  for (const v of reviewOnly) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
    r = set(r, { MS_GATE_01: 'yes', MS_05: [v] })
    const flags = computeFlags(r)
    assert(`K14: MS_05=[${v}] sets sleep_disorder_review`, flags.sleep_disorder_review === true)
    assert(`K14: MS_05=[${v}] does not set sleep_disorder_priority_review`, flags.sleep_disorder_priority_review === false)
    assert(`K14: MS_05=[${v}] does not force requires_staff_check`, flags.requires_staff_check === false)
  }

  const priority = ['witnessed_apnea', 'choking_gasping']
  for (const v of priority) {
    let r = emptyResponses()
    r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
    r = set(r, { MS_GATE_01: 'yes', MS_05: [v] })
    const flags = computeFlags(r)
    assert(`K15: MS_05=[${v}] sets sleep_disorder_priority_review`, flags.sleep_disorder_priority_review === true)
  }

  let none = emptyResponses()
  none = set(none, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  none = set(none, { MS_GATE_01: 'yes', MS_05: ['none'] })
  const noneFlags = computeFlags(none)
  assert('K14: MS_05=[none] sets neither sleep disorder flag', !noneFlags.sleep_disorder_review && !noneFlags.sleep_disorder_priority_review)

  assert(
    'K16: STAFF_CHECK_TRIGGERS does not include MS_05 (no auto navigation, spec 3)',
    !('MS_05' in STAFF_CHECK_TRIGGERS),
  )
}

// K17: MS_01 never auto-fills reproductive safety -- deriveReproductiveStatus ignores it
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, { MS_GATE_01: 'yes', MS_01: 'amenorrhea_12m_plus' })
  const derived = deriveReproductiveStatus(r)
  assert(
    'K17: MS_01=amenorrhea_12m_plus alone leaves reproductive status unset (source null)',
    derived.source === null && derived.pregnant === null && derived.breastfeeding === null,
  )
  assert('K17: WOMEN_SAFETY_01 is still required/visible for a sleep-primary female', visibleIds(r).has('WOMEN_SAFETY_01'))
}

// K18: response_consistency_review flags contradictions without auto-correcting
{
  let contradictA = emptyResponses()
  contradictA = set(contradictA, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  contradictA = set(contradictA, {
    MS_GATE_01: 'yes',
    MS_01: 'amenorrhea_12m_plus',
    WOMEN_SAFETY_01: ['pregnant'],
  })
  assert(
    'K18: amenorrhea_12m_plus + WOMEN_SAFETY_01=pregnant sets response_consistency_review',
    computeFlags(contradictA).response_consistency_review === true,
  )
  assert(
    'K18: response_consistency_review does not overwrite MS_01 or WOMEN_SAFETY_01',
    contradictA['MS_01'] === 'amenorrhea_12m_plus' &&
      JSON.stringify(contradictA['WOMEN_SAFETY_01']) === JSON.stringify(['pregnant']),
  )

  let contradictB = emptyResponses()
  contradictB = set(contradictB, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  contradictB = set(contradictB, {
    MS_GATE_01: 'yes',
    MS_01: 'still_regular',
    WOMEN_SAFETY_01: ['menopause'],
  })
  assert(
    'K18: still_regular + WOMEN_SAFETY_01=menopause sets response_consistency_review',
    computeFlags(contradictB).response_consistency_review === true,
  )

  let consistent = emptyResponses()
  consistent = set(consistent, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  consistent = set(consistent, {
    MS_GATE_01: 'yes',
    MS_01: 'amenorrhea_12m_plus',
    WOMEN_SAFETY_01: ['menopause'],
  })
  assert(
    'K18: amenorrhea_12m_plus + WOMEN_SAFETY_01=menopause is consistent (no flag)',
    computeFlags(consistent).response_consistency_review === false,
  )
}

// K19: buildResponsePayload exposes the MENOPAUSE_SLEEP block under modules.sleep.menopause
{
  let r = emptyResponses()
  r = set(r, { ID_03: 'female', VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'sleep' })
  r = set(r, {
    MS_GATE_01: 'yes',
    SLEEP_01: ['night_awakenings'],
    MS_01: 'cycle_changing',
    MS_02: 'occasional',
    MS_03: 'sometimes',
    MS_04: '6_7h',
    MS_05: ['loud_snoring'],
    MS_06: 'two_three',
    MS_07: '15_30m',
  })
  const payload = buildResponsePayload(r)
  assert(
    'K19: modules.sleep.menopause has exactly the 8 expected fields',
    JSON.stringify(Object.keys(payload.modules.sleep.menopause).sort()) ===
      JSON.stringify(
        [
          'gate_context',
          'stage',
          'night_vms_frequency',
          'rumination_frequency',
          'total_sleep_time',
          'sleep_disorder_screen',
          'awakenings',
          'return_to_sleep',
        ].sort(),
      ),
  )
  assert('K19: gate_context correct', payload.modules.sleep.menopause.gate_context === 'yes')
  assert('K19: stage correct', payload.modules.sleep.menopause.stage === 'cycle_changing')
  assert(
    'K19: sleep_disorder_screen correct',
    JSON.stringify(payload.modules.sleep.menopause.sleep_disorder_screen) === JSON.stringify(['loud_snoring']),
  )
  assert('K19: awakenings correct', payload.modules.sleep.menopause.awakenings === 'two_three')
  assert('K19: return_to_sleep correct', payload.modules.sleep.menopause.return_to_sleep === '15_30m')
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
