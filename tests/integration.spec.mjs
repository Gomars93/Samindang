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
// LBP_V1: LBP_04(CES 응급값)를 사용자 확정 결정(2026-08-24)에 따라
// SAFETY_01/GI_03/BOWEL_03과 동일한 즉시 인터럽트 트리거로 추가했다 —
// LBP_INTEGRATION_PLAN_DRAFT.md 개정 로그 항목 7 참고.
// NECK_V1: URGENT_REVIEW가 4개 지점(NECK_02/NECK_02A/NECK_03B/NECK_04) 중
// 어디서든 확정될 수 있어(v0.2.1 §5) 네 화면 모두 등록했다 — coreSpec.ts의
// STAFF_CHECK_TRIGGERS 주석 참고.
// SHOULDER_V1: URGENT_REVIEW는 SH02/SH04/SH05 세 지점에서만 확정될 수 있어
// (v0.1.1 §10 -- SH01/SH03/SH06-09는 URGENT를 발생시키지 않음) 셋만
// 등록했다 -- coreSpec.ts의 STAFF_CHECK_TRIGGERS 주석 참고.
// KNEE_V1: URGENT_REVIEW는 KNEE_02/KNEE_02A/KNEE_06B/KNEE_07 네 지점에서만
// 확정될 수 있어(Amendment A4 -- KNEE_03/04/05/06/06A/08은 REVIEW/expedited/
// flag 계층) 넷만 등록했다 -- coreSpec.ts의 STAFF_CHECK_TRIGGERS 주석 참고.
// ELBOW_V1: URGENT_REVIEW는 ELBOW_02/ELBOW_02A/ELBOW_07/ELBOW_08/ELBOW_11
// 다섯 지점에서만 확정될 수 있어(Tablet v0.1.1 §10 -- ELBOW_03/04/05/06/09/
// 09A/10은 REVIEW/expedited/flag 계층) 다섯만 등록했다.
{
  const keys = Object.keys(STAFF_CHECK_TRIGGERS).sort()
  assert(
    'I1: STAFF_CHECK_TRIGGERS keys are exactly SAFETY_01, GI_03, BOWEL_03, LBP_04, NECK_02, NECK_02A, NECK_03B, NECK_04, SH02, SH04, SH05, KNEE_02, KNEE_02A, KNEE_06B, KNEE_07, ELBOW_02, ELBOW_02A, ELBOW_07, ELBOW_08, ELBOW_11, WH_02, WH_07, WH_07A',
    JSON.stringify(keys) ===
      JSON.stringify([
        'BOWEL_03',
        'ELBOW_02',
        'ELBOW_02A',
        'ELBOW_07',
        'ELBOW_08',
        'ELBOW_11',
        'GI_03',
        'KNEE_02',
        'KNEE_02A',
        'KNEE_06B',
        'KNEE_07',
        'LBP_04',
        'NECK_02',
        'NECK_02A',
        'NECK_03B',
        'NECK_04',
        'SAFETY_01',
        'SH02',
        'SH04',
        'SH05',
        'WH_02',
        'WH_07',
        'WH_07A',
      ]),
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

// ---------------------------------------------------------------------------
// L. SHOULDER_V1 F1 invariant: NS01 must never gate SH01-05/canonical NECK
// safety exposure. For each of NS01's 4 values, build a Responses with BOTH
// a positive shoulder-specific safety finding (SH02 DEFORMITY_OR_STILL_OUT)
// AND a positive canonical-NECK finding (NECK_03B thunderclap headache) and
// confirm BOTH safety_flags.shoulder and safety_flags.neck stay populated
// and URGENT_REVIEW regardless of NS01 -- this is the exact contract the
// SHOULDER_V1 integration instructions explicitly required be regression
// -tested. Only primary_module_detail (display/hypothesis tagging) may vary.
// ---------------------------------------------------------------------------

function neckShoulderUrgentBothResponses(ns01Value) {
  let r = emptyResponses()
  r = set(r, {
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    VISIT_03_SYMPTOM_DURATION: 'within_1w',
    VISIT_04_SYMPTOM_IMPACT: 'moderate',
    SAFETY_01: ['none'],
    PAIN_01: 'neck_shoulder',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    NS01: ns01Value,
    // canonical NECK: thunderclap headache -> neck_safety_status URGENT_REVIEW
    NECK_01: 'NO',
    NECK_02: ['NONE'],
    NECK_03A: 'NO',
    NECK_03B: 'YES',
    NECK_04: ['NONE'],
    NECK_05: ['NONE'],
    NECK_10: 'NO',
    // shoulder-specific: SH02 deformity -> shoulder_safety_status URGENT_REVIEW
    SH01: 'YES',
    SH02: ['DEFORMITY_OR_STILL_OUT'],
    SH03: 'NO',
    SH04: 'NO',
    SH05: 'NO',
  })
  return r
}

for (const ns01Value of ['NECK_DOMINANT', 'SHOULDER_DOMINANT', 'SIMILAR', 'UNKNOWN']) {
  const r = neckShoulderUrgentBothResponses(ns01Value)
  const payload = buildResponsePayload(r)
  const routing = buildRoutingPayload(r)

  assert(
    `L(${ns01Value}): safety_flags.shoulder is computed (not null)`,
    payload.safety_flags.shoulder !== null,
  )
  assert(
    `L(${ns01Value}): shoulder_safety_status is URGENT_REVIEW (SH02 deformity not hidden by NS01)`,
    payload.safety_flags.shoulder?.shoulder_safety_status === 'URGENT_REVIEW',
  )
  assert(
    `L(${ns01Value}): safety_flags.neck is computed (not null)`,
    payload.safety_flags.neck !== null,
  )
  assert(
    `L(${ns01Value}): neck_safety_status is URGENT_REVIEW (NECK_03B thunderclap not hidden by NS01)`,
    payload.safety_flags.neck?.neck_safety_status === 'URGENT_REVIEW',
  )
  assert(
    `L(${ns01Value}): NS01 itself is answered/visible (never gated out)`,
    r['NS01'] === ns01Value,
  )
  assert(
    `L(${ns01Value}): SH01-05 stay visible/answered regardless of NS01 (SH02 not pruned)`,
    JSON.stringify(r['SH02']) === JSON.stringify(['DEFORMITY_OR_STILL_OUT']),
  )

  // primary_module_detail tagging: only SHOULDER_DOMINANT resolves to
  // 'SHOULDER'; NECK_DOMINANT/SIMILAR/UNKNOWN all default to 'NECK'
  // (pre-SHOULDER_V1 behavior, F1: this is tagging only, never a safety gate).
  const expectedDetail = ns01Value === 'SHOULDER_DOMINANT' ? 'SHOULDER' : 'NECK'
  assert(
    `L(${ns01Value}): primary_module_detail is '${expectedDetail}' (tagging-only, does not affect the safety assertions above)`,
    routing.primary_module_detail === expectedDetail,
  )
}

// L5: NS01 unanswered entirely (mid-flow before the patient reaches it) must
// still default primary_module_detail to 'NECK', not null/undefined -- and
// must not itself suppress SH02/NECK safety once those are answered.
{
  let r = emptyResponses()
  r = set(r, {
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    SAFETY_01: ['none'],
    PAIN_01: 'neck_shoulder',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    NECK_01: 'NO',
    NECK_02: ['NONE'],
    NECK_03A: 'NO',
    NECK_03B: 'NO',
    NECK_04: ['NONE'],
    NECK_05: ['NONE'],
    NECK_10: 'NO',
    SH01: 'YES',
    SH02: ['DEFORMITY_OR_STILL_OUT'],
    SH03: 'NO',
    SH04: 'NO',
    SH05: 'NO',
  })
  const payload = buildResponsePayload(r)
  const routing = buildRoutingPayload(r)
  assert('L5: NS01 unanswered -> primary_module_detail defaults to NECK', routing.primary_module_detail === 'NECK')
  assert(
    'L5: NS01 unanswered -> shoulder safety still computed and URGENT (F1 holds even pre-NS01)',
    payload.safety_flags.shoulder?.shoulder_safety_status === 'URGENT_REVIEW',
  )
}

// ---------------------------------------------------------------------------
// M. SHOULDER_V1 real-time URGENT_REVIEW interrupt: STAFF_CHECK_TRIGGERS.
// SH02/SH04/SH05 must fire true exactly when shoulder_safety_status would be
// URGENT_REVIEW, and stay false for REVIEW_REQUIRED-only or CLEAR paths --
// verified by calling the actual trigger functions the app wires into
// App.tsx's goNext(), not just the underlying engine.
// ---------------------------------------------------------------------------

function neckShoulderBaseResponses() {
  let r = emptyResponses()
  return set(r, {
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    SAFETY_01: ['none'],
    PAIN_01: 'neck_shoulder',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    NS01: 'SHOULDER_DOMINANT',
    NECK_01: 'NO',
    NECK_02: ['NONE'],
    NECK_03A: 'NO',
    NECK_03B: 'NO',
    NECK_04: ['NONE'],
    NECK_05: ['NONE'],
    NECK_10: 'NO',
    SH04: 'NO',
    SH05: 'NO',
  })
}

{
  const r = set(neckShoulderBaseResponses(), { SH01: 'YES', SH02: ['DEFORMITY_OR_STILL_OUT'] })
  assert('M1: STAFF_CHECK_TRIGGERS.SH02 fires true for DEFORMITY_OR_STILL_OUT', STAFF_CHECK_TRIGGERS.SH02(r) === true)
}
{
  const r = set(neckShoulderBaseResponses(), { SH01: 'YES', SH02: ['NEW_NEUROVASCULAR_CHANGE'] })
  assert('M1: STAFF_CHECK_TRIGGERS.SH02 fires true for NEW_NEUROVASCULAR_CHANGE', STAFF_CHECK_TRIGGERS.SH02(r) === true)
}
{
  const r = set(neckShoulderBaseResponses(), { SH01: 'YES', SH02: ['SEVERE_SWELLING_OR_CANNOT_MOVE'] })
  assert(
    'M1: STAFF_CHECK_TRIGGERS.SH02 stays false for SEVERE_SWELLING_OR_CANNOT_MOVE (review-tier, not urgent)',
    STAFF_CHECK_TRIGGERS.SH02(r) === false,
  )
}
{
  const r = set(neckShoulderBaseResponses(), { SH01: 'YES', SH02: ['NONE'], SH03: 'YES' })
  assert(
    'M1: STAFF_CHECK_TRIGGERS.SH02 stays false when only SH03 acute-cuff-concern is positive (F3: never auto-urgent)',
    STAFF_CHECK_TRIGGERS.SH02(r) === false,
  )
}
{
  const r = set(neckShoulderBaseResponses(), { SH04: 'YES' })
  assert('M2: STAFF_CHECK_TRIGGERS.SH04 fires true for infection YES', STAFF_CHECK_TRIGGERS.SH04(r) === true)
}
{
  const r = set(neckShoulderBaseResponses(), { SH04: 'UNKNOWN' })
  assert('M2: STAFF_CHECK_TRIGGERS.SH04 stays false for UNKNOWN (review-tier, not urgent)', STAFF_CHECK_TRIGGERS.SH04(r) === false)
}
{
  const r = set(neckShoulderBaseResponses(), { SH05: 'YES' })
  assert('M3: STAFF_CHECK_TRIGGERS.SH05 fires true for cardiac-gap YES', STAFF_CHECK_TRIGGERS.SH05(r) === true)
}
{
  // canonical NECK URGENT (thunderclap) must ALSO make SH02/SH04/SH05's own
  // trigger functions observe urgency via the shared engine passthrough --
  // even though the shoulder-specific fields are all clean. This is the
  // interrupt-layer counterpart to the CANONICAL REUSE tests in
  // shoulder.spec.mjs.
  const r = set(neckShoulderBaseResponses(), { NECK_03B: 'YES', SH01: 'NO' })
  assert(
    'M4: STAFF_CHECK_TRIGGERS.SH04 also fires true when canonical NECK is already URGENT_REVIEW (engine passthrough, not duplicated logic)',
    STAFF_CHECK_TRIGGERS.SH04(r) === true,
  )
}
{
  const r = neckShoulderBaseResponses() // fully clean
  assert('M5: STAFF_CHECK_TRIGGERS.SH02/SH04/SH05 all stay false on a fully-clean shoulder+neck baseline', STAFF_CHECK_TRIGGERS.SH02(r) === false && STAFF_CHECK_TRIGGERS.SH04(r) === false && STAFF_CHECK_TRIGGERS.SH05(r) === false)
}

/* =========================================================================
 * N. KNEE_V1 -- question visibility (Fable plan §8.C), staff interrupt
 * (§8.D), payload/routing (§8.E). KNEE_V1 has no shared-population reuse
 * with LBP/NECK/SHOULDER (Opus v0.2 K9), so there is no cross-module
 * tag-hiding regression to prove here the way L/M prove it for SHOULDER --
 * IS_PRIMARY_KNEE is fully independent of IS_PRIMARY_LBP/IS_PRIMARY_NECK.
 * ========================================================================= */

function kneeBaseResponses() {
  let r = emptyResponses()
  return set(r, {
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    SAFETY_01: ['none'],
    PAIN_01: 'knee',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    KNEE_01: 'NO',
    KNEE_02: ['NONE'],
    KNEE_02A: 'NO',
    KNEE_05: 'NO',
    KNEE_06: 'NO',
    KNEE_07: 'NO',
    KNEE_08: ['NONE'],
  })
}

// --- N-C: question visibility ---------------------------------------------

{
  const r = neckShoulderBaseResponses()
  const visible = visibleIds(r)
  assert('N-C1: non-knee (neck_shoulder) pain patient sees no KNEE_* questions', ![...visible].some((id) => id.startsWith('KNEE_')))
}
{
  const r = kneeBaseResponses()
  const visible = visibleIds(r)
  assert(
    'N-C2: knee-primary patient sees all protected KNEE safety screens',
    ['KNEE_01', 'KNEE_02', 'KNEE_02A', 'KNEE_05', 'KNEE_06', 'KNEE_07', 'KNEE_08'].every((id) => visible.has(id)),
  )
}
{
  const r = set(kneeBaseResponses(), { KNEE_01: 'NO' })
  assert('N-C3: KNEE_02A stays visible even when KNEE_01=NO (K2 unconditional exposure)', visibleIds(r).has('KNEE_02A'))
}
{
  const rYes = set(kneeBaseResponses(), { KNEE_01: 'YES' })
  const rUnknown = set(kneeBaseResponses(), { KNEE_01: 'UNKNOWN' })
  const rNo = set(kneeBaseResponses(), { KNEE_01: 'NO' })
  assert('N-C4: KNEE_03/04/15 appear when KNEE_01=YES', ['KNEE_03', 'KNEE_04', 'KNEE_15'].every((id) => visibleIds(rYes).has(id)))
  assert('N-C4: KNEE_03/04/15 appear when KNEE_01=UNKNOWN', ['KNEE_03', 'KNEE_04', 'KNEE_15'].every((id) => visibleIds(rUnknown).has(id)))
  assert('N-C4: KNEE_03/04/15 do NOT appear when KNEE_01=NO', !['KNEE_03', 'KNEE_04', 'KNEE_15'].some((id) => visibleIds(rNo).has(id)))
}
{
  const rYes = set(kneeBaseResponses(), { KNEE_06: 'YES' })
  const rUnknown = set(kneeBaseResponses(), { KNEE_06: 'UNKNOWN' })
  const rNo = set(kneeBaseResponses(), { KNEE_06: 'NO' })
  assert('N-C5: KNEE_06A/06B appear when KNEE_06=YES', ['KNEE_06A', 'KNEE_06B'].every((id) => visibleIds(rYes).has(id)))
  assert('N-C5: KNEE_06A/06B appear when KNEE_06=UNKNOWN', ['KNEE_06A', 'KNEE_06B'].every((id) => visibleIds(rUnknown).has(id)))
  assert('N-C5: KNEE_06A/06B do NOT appear when KNEE_06=NO', !['KNEE_06A', 'KNEE_06B'].some((id) => visibleIds(rNo).has(id)))
}
{
  const q3 = ALL_QUESTIONS.find((q) => q.id === 'KNEE_03')
  const q4 = ALL_QUESTIONS.find((q) => q.id === 'KNEE_04')
  assert('N-C6: KNEE_03 is required: true (fail-closed hard block once shown)', q3.required === true)
  assert('N-C6: KNEE_04 is required: true (fail-closed hard block once shown)', q4.required === true)
}
{
  // stale prune: KNEE_* answers must be cleared once PAIN_01 switches away from 'knee'.
  const r = set(kneeBaseResponses(), { KNEE_01: 'YES', KNEE_03: 'YES', KNEE_04: 'NO', KNEE_15: 'YES' })
  const switched = set(r, { PAIN_01: 'low_back_pelvis' })
  assert(
    'N-C7: switching PAIN_01 away from knee prunes all KNEE_* responses to null',
    ['KNEE_01', 'KNEE_02', 'KNEE_02A', 'KNEE_03', 'KNEE_04', 'KNEE_05', 'KNEE_06', 'KNEE_07', 'KNEE_08', 'KNEE_15'].every(
      (id) => switched[id] === null,
    ),
  )
}

// --- N-D: staff interrupt ---------------------------------------------------

{
  const r = set(kneeBaseResponses(), { KNEE_02: ['GROSS_DEFORMITY_OR_STILL_OUT'] })
  assert('N-D1: KNEE_02 urgent answer -> StaffCheck', STAFF_CHECK_TRIGGERS.KNEE_02(r) === true)
}
{
  const r = set(kneeBaseResponses(), { KNEE_02A: 'YES' })
  assert('N-D2: KNEE_02A YES -> StaffCheck', STAFF_CHECK_TRIGGERS.KNEE_02A(r) === true)
}
{
  const r = set(kneeBaseResponses(), { KNEE_06: 'YES', KNEE_06A: ['NONE'], KNEE_06B: ['SHORTNESS_OF_BREATH'] })
  assert('N-D3: KNEE_06B PE positive -> StaffCheck', STAFF_CHECK_TRIGGERS.KNEE_06B(r) === true)
}
{
  const r = set(kneeBaseResponses(), { KNEE_07: 'YES' })
  assert('N-D4: KNEE_07 YES -> StaffCheck', STAFF_CHECK_TRIGGERS.KNEE_07(r) === true)
}
{
  // KNEE_03/04/05/08 positive must NOT interrupt -- REVIEW/expedited/flag only, no urgent trigger registered for them.
  assert('N-D5: KNEE_03/04/05/08 have no StaffCheck trigger registered', !('KNEE_03' in STAFF_CHECK_TRIGGERS) && !('KNEE_04' in STAFF_CHECK_TRIGGERS) && !('KNEE_05' in STAFF_CHECK_TRIGGERS) && !('KNEE_08' in STAFF_CHECK_TRIGGERS))
}
{
  const r = kneeBaseResponses() // fully clean
  assert(
    'N-D6: KNEE_02/KNEE_02A/KNEE_06B/KNEE_07 all stay false on a fully-clean knee baseline',
    STAFF_CHECK_TRIGGERS.KNEE_02(r) === false &&
      STAFF_CHECK_TRIGGERS.KNEE_02A(r) === false &&
      STAFF_CHECK_TRIGGERS.KNEE_06B(r) === false &&
      STAFF_CHECK_TRIGGERS.KNEE_07(r) === false,
  )
}

// --- N-E: payload/routing ---------------------------------------------------

{
  const r = kneeBaseResponses()
  const payload = buildResponsePayload(r)
  assert('N-E1: knee patient -> safety_flags.knee !== null', payload.safety_flags.knee !== null)
  assert('N-E2: all KNEE responses land under modules.knee', payload.modules.knee.recent_trauma_or_sudden_load === 'NO')
  const routing = buildRoutingPayload(r)
  assert("N-E3: primary_module_detail === 'KNEE' for knee-primary", routing.primary_module_detail === 'KNEE')
}
{
  const r = neckShoulderBaseResponses()
  const payload = buildResponsePayload(r)
  assert('N-E4: non-knee (neck_shoulder) patient -> safety_flags.knee === null', payload.safety_flags.knee === null)
  const routing = buildRoutingPayload(r)
  assert(
    "N-E5: existing NECK/SHOULDER routing unchanged by KNEE addition -- primary_module_detail still 'SHOULDER'",
    routing.primary_module_detail === 'SHOULDER',
  )
}
{
  // LBP routing must also stay unaffected by the KNEE addition.
  let r = emptyResponses()
  r = set(r, { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain', SAFETY_01: ['none'], PAIN_01: 'low_back_pelvis', PAIN_02: ['aching'], PAIN_04: 'none' })
  const routing = buildRoutingPayload(r)
  assert("N-E6: LBP routing unaffected by KNEE addition -- primary_module_detail still 'LBP'", routing.primary_module_detail === 'LBP')
}

/* =========================================================================
 * O. ELBOW_V1 -- question visibility incl. routing (Fable plan §10.C),
 * staff interrupt (§10.D), payload/routing incl. WRIST_HAND exclusion
 * (§10.E). ELBOW_V1 has no shared-population reuse with LBP/NECK/SHOULDER/
 * KNEE (Tablet v0.1.1 §6), and `arm_hand` has no dedicated PAIN_01 value --
 * the region discriminator (ELBOW_00) is the one genuinely new routing
 * mechanism this session introduces, so its WRIST_HAND-exclusion behavior
 * gets the most scrutiny here (mirrors L's cross-module rigor for SHOULDER,
 * adapted to a single-module routing boundary instead).
 * ========================================================================= */

function elbowBaseResponses() {
  let r = emptyResponses()
  return set(r, {
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    SAFETY_01: ['none'],
    PAIN_01: 'arm_hand',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    ELBOW_00: 'ELBOW',
    ELBOW_01: 'NO',
    ELBOW_02: ['NONE'],
    ELBOW_02A: 'NO',
    ELBOW_06: 'NO',
    ELBOW_07: 'NO',
    ELBOW_08: 'NONE',
    ELBOW_09: 'NO',
    ELBOW_10: ['NONE'],
    ELBOW_11: ['NONE'],
  })
}

// --- O-C: question visibility (routing incl.) ------------------------------

{
  const r = neckShoulderBaseResponses()
  const visible = visibleIds(r)
  assert('O-C1: non-arm_hand pain patient sees no ELBOW_* questions', ![...visible].some((id) => id.startsWith('ELBOW_')))
}
{
  let r = emptyResponses()
  r = set(r, { VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain', SAFETY_01: ['none'], PAIN_01: 'arm_hand', PAIN_02: ['aching'], PAIN_04: 'none' })
  assert('O-C2: arm_hand patient sees ELBOW_00 (region discriminator) but no other ELBOW_* yet', visibleIds(r).has('ELBOW_00'))
  assert('O-C2: ELBOW_01 not visible before ELBOW_00 is answered', !visibleIds(r).has('ELBOW_01'))
}
{
  const r = elbowBaseResponses()
  const visible = visibleIds(r)
  assert(
    'O-C3: ELBOW_00=ELBOW exposes all protected ELBOW safety screens',
    ['ELBOW_01', 'ELBOW_02', 'ELBOW_02A', 'ELBOW_06', 'ELBOW_07', 'ELBOW_08', 'ELBOW_09', 'ELBOW_10', 'ELBOW_11'].every((id) =>
      visible.has(id),
    ),
  )
}
{
  const rForearm = set(elbowBaseResponses(), { ELBOW_00: 'FOREARM' })
  const rDiffuse = set(elbowBaseResponses(), { ELBOW_00: 'DIFFUSE_OR_MULTIPLE' })
  const rUnknown = set(elbowBaseResponses(), { ELBOW_00: 'UNKNOWN' })
  for (const [label, r] of [['FOREARM', rForearm], ['DIFFUSE_OR_MULTIPLE', rDiffuse], ['UNKNOWN', rUnknown]]) {
    assert(`O-C4: ELBOW_00=${label} also exposes ELBOW protected safety`, visibleIds(r).has('ELBOW_02'))
  }
}
{
  // Most important routing regression in this module: WRIST_HAND must be the ONLY excluded value.
  const r = set(elbowBaseResponses(), { ELBOW_00: 'WRIST_HAND' })
  const visible = visibleIds(r)
  assert(
    'O-C5 CRITICAL: ELBOW_00=WRIST_HAND excludes ALL ELBOW protected safety screens',
    !['ELBOW_01', 'ELBOW_02', 'ELBOW_02A', 'ELBOW_06', 'ELBOW_07', 'ELBOW_08', 'ELBOW_09', 'ELBOW_10', 'ELBOW_11'].some((id) =>
      visible.has(id),
    ),
  )
}
{
  const rYes = set(elbowBaseResponses(), { ELBOW_01: 'YES' })
  const rUnknown = set(elbowBaseResponses(), { ELBOW_01: 'UNKNOWN' })
  const rNo = set(elbowBaseResponses(), { ELBOW_01: 'NO' })
  assert('O-C6: ELBOW_03/04/05/15 appear when ELBOW_01=YES', ['ELBOW_03', 'ELBOW_04', 'ELBOW_05', 'ELBOW_15'].every((id) => visibleIds(rYes).has(id)))
  assert('O-C6: ELBOW_03/04/05/15 appear when ELBOW_01=UNKNOWN', ['ELBOW_03', 'ELBOW_04', 'ELBOW_05', 'ELBOW_15'].every((id) => visibleIds(rUnknown).has(id)))
  assert('O-C6: ELBOW_03/04/05/15 do NOT appear when ELBOW_01=NO', !['ELBOW_03', 'ELBOW_04', 'ELBOW_05', 'ELBOW_15'].some((id) => visibleIds(rNo).has(id)))
}
{
  const rYes = set(elbowBaseResponses(), { ELBOW_09: 'YES' })
  const rUnknown = set(elbowBaseResponses(), { ELBOW_09: 'UNKNOWN' })
  const rNo = set(elbowBaseResponses(), { ELBOW_09: 'NO' })
  assert('O-C7: ELBOW_09A appears when ELBOW_09=YES', visibleIds(rYes).has('ELBOW_09A'))
  assert('O-C7: ELBOW_09A appears when ELBOW_09=UNKNOWN', visibleIds(rUnknown).has('ELBOW_09A'))
  assert('O-C7: ELBOW_09A does NOT appear when ELBOW_09=NO', !visibleIds(rNo).has('ELBOW_09A'))
}
{
  const q00 = ALL_QUESTIONS.find((q) => q.id === 'ELBOW_00')
  const q02a = ALL_QUESTIONS.find((q) => q.id === 'ELBOW_02A')
  const q03 = ALL_QUESTIONS.find((q) => q.id === 'ELBOW_03')
  const q09a = ALL_QUESTIONS.find((q) => q.id === 'ELBOW_09A')
  const q11 = ALL_QUESTIONS.find((q) => q.id === 'ELBOW_11')
  assert('O-C8: ELBOW_00 is required: true (routing gate must be hard-blocked)', q00.required === true)
  assert('O-C8: ELBOW_02A is required: true', q02a.required === true)
  assert('O-C8: ELBOW_03 is required: true (fail-closed once shown)', q03.required === true)
  assert('O-C8: ELBOW_09A is required: true (fail-closed once shown)', q09a.required === true)
  assert('O-C8: ELBOW_11 is required: true', q11.required === true)
}
{
  // stale prune: ELBOW_* answers must be cleared once PAIN_01 switches away from 'arm_hand'.
  const r = set(elbowBaseResponses(), { ELBOW_01: 'YES', ELBOW_03: 'YES', ELBOW_04: 'NO', ELBOW_09: 'YES', ELBOW_09A: ['NONE'] })
  const switched = set(r, { PAIN_01: 'knee' })
  assert(
    'O-C9: switching PAIN_01 away from arm_hand prunes all ELBOW_* responses (incl. ELBOW_00) to null',
    ['ELBOW_00', 'ELBOW_01', 'ELBOW_02', 'ELBOW_02A', 'ELBOW_03', 'ELBOW_04', 'ELBOW_09', 'ELBOW_09A'].every((id) => switched[id] === null),
  )
}
{
  // switching the region discriminator away from ELBOW to WRIST_HAND must prune the now-hidden ELBOW_* answers too.
  const r = set(elbowBaseResponses(), { ELBOW_01: 'YES', ELBOW_04: 'YES' })
  const switched = set(r, { ELBOW_00: 'WRIST_HAND' })
  assert(
    'O-C10: switching ELBOW_00 to WRIST_HAND prunes the now-hidden ELBOW_01/04 responses',
    switched['ELBOW_01'] === null && switched['ELBOW_04'] === null,
  )
}

// --- O-D: staff interrupt ---------------------------------------------------

{
  const r = set(elbowBaseResponses(), { ELBOW_02: ['GROSS_DEFORMITY_OR_STILL_OUT'] })
  assert('O-D1: ELBOW_02 urgent answer -> StaffCheck', STAFF_CHECK_TRIGGERS.ELBOW_02(r) === true)
}
{
  const r = set(elbowBaseResponses(), { ELBOW_02A: 'YES' })
  assert('O-D2: ELBOW_02A YES -> StaffCheck', STAFF_CHECK_TRIGGERS.ELBOW_02A(r) === true)
}
{
  const r = set(elbowBaseResponses(), { ELBOW_07: 'YES' })
  assert('O-D3: ELBOW_07 YES -> StaffCheck', STAFF_CHECK_TRIGGERS.ELBOW_07(r) === true)
}
{
  const r = set(elbowBaseResponses(), { ELBOW_08: 'SYSTEMIC_OR_RAPIDLY_SPREADING' })
  assert('O-D4: ELBOW_08 SYSTEMIC_OR_RAPIDLY_SPREADING -> StaffCheck', STAFF_CHECK_TRIGGERS.ELBOW_08(r) === true)
}
{
  const r = set(elbowBaseResponses(), { ELBOW_08: 'LOCALIZED_STABLE' })
  assert('O-D4b: ELBOW_08 LOCALIZED_STABLE does NOT StaffCheck (review-tier, not urgent)', STAFF_CHECK_TRIGGERS.ELBOW_08(r) === false)
}
{
  const r = set(elbowBaseResponses(), { ELBOW_11: ['SHORTNESS_OF_BREATH'] })
  assert('O-D5: ELBOW_11 cardiac positive -> StaffCheck', STAFF_CHECK_TRIGGERS.ELBOW_11(r) === true)
}
{
  // ELBOW_03/04/05/06/09/09A/10 positive must NOT interrupt -- REVIEW/expedited/flag only, no urgent trigger registered for them.
  assert(
    'O-D6: ELBOW_03/04/05/06/09/09A/10 have no StaffCheck trigger registered',
    !('ELBOW_03' in STAFF_CHECK_TRIGGERS) &&
      !('ELBOW_04' in STAFF_CHECK_TRIGGERS) &&
      !('ELBOW_05' in STAFF_CHECK_TRIGGERS) &&
      !('ELBOW_06' in STAFF_CHECK_TRIGGERS) &&
      !('ELBOW_09' in STAFF_CHECK_TRIGGERS) &&
      !('ELBOW_09A' in STAFF_CHECK_TRIGGERS) &&
      !('ELBOW_10' in STAFF_CHECK_TRIGGERS),
  )
}
{
  const r = elbowBaseResponses() // fully clean
  assert(
    'O-D7: ELBOW_02/ELBOW_02A/ELBOW_07/ELBOW_08/ELBOW_11 all stay false on a fully-clean elbow baseline',
    STAFF_CHECK_TRIGGERS.ELBOW_02(r) === false &&
      STAFF_CHECK_TRIGGERS.ELBOW_02A(r) === false &&
      STAFF_CHECK_TRIGGERS.ELBOW_07(r) === false &&
      STAFF_CHECK_TRIGGERS.ELBOW_08(r) === false &&
      STAFF_CHECK_TRIGGERS.ELBOW_11(r) === false,
  )
}

// --- O-E: payload/routing ---------------------------------------------------

{
  const r = elbowBaseResponses()
  const payload = buildResponsePayload(r)
  assert('O-E1: elbow patient -> safety_flags.elbow !== null', payload.safety_flags.elbow !== null)
  assert('O-E2: all ELBOW responses land under modules.elbow', payload.modules.elbow.recent_trauma_or_sudden_load === 'NO')
  assert('O-E2b: modules.elbow.region_discriminator records ELBOW_00', payload.modules.elbow.region_discriminator === 'ELBOW')
  const routing = buildRoutingPayload(r)
  assert("O-E3: primary_module_detail === 'ELBOW' for elbow-safety-exposed patient", routing.primary_module_detail === 'ELBOW')
}
{
  // WRIST_HAND-only: safety_flags.elbow must be null (ELBOW_01-15 never shown). As of
  // WRIST_HAND_V1, safety_flags.wrist_hand is now non-null and primary_module_detail is
  // 'WRIST_HAND' -- updated from the pre-WRIST_HAND_V1 "null, no module exists yet" behavior
  // (see P-E4/P-E5 below for the WRIST_HAND_V1-side assertions of this same case).
  const r = set(elbowBaseResponses(), { ELBOW_00: 'WRIST_HAND' })
  const payload = buildResponsePayload(r)
  assert('O-E4 CRITICAL: WRIST_HAND-only patient -> safety_flags.elbow === null', payload.safety_flags.elbow === null)
  const routing = buildRoutingPayload(r)
  assert("O-E5 CRITICAL: WRIST_HAND-only patient -> primary_module_detail === 'WRIST_HAND' (not 'ELBOW')", routing.primary_module_detail === 'WRIST_HAND')
}
{
  const r = neckShoulderBaseResponses()
  const payload = buildResponsePayload(r)
  assert('O-E6: non-arm_hand (neck_shoulder) patient -> safety_flags.elbow === null', payload.safety_flags.elbow === null)
  const routing = buildRoutingPayload(r)
  assert(
    "O-E7: existing NECK/SHOULDER routing unchanged by ELBOW addition -- primary_module_detail still 'SHOULDER'",
    routing.primary_module_detail === 'SHOULDER',
  )
}
{
  const r = kneeBaseResponses()
  const routing = buildRoutingPayload(r)
  assert("O-E8: existing KNEE routing unchanged by ELBOW addition -- primary_module_detail still 'KNEE'", routing.primary_module_detail === 'KNEE')
}

/* =========================================================================
 * P. WRIST_HAND_V1 -- question visibility incl. routing (Fable plan §15),
 * staff interrupt, payload/routing incl. the FOREARM double-exposure case
 * (the first case across all six modules where two protected-safety
 * modules are simultaneously non-null for one patient). WRIST_HAND_V1
 * reuses the existing ELBOW_00/arm_hand_region_discriminator shared router
 * -- no new router is introduced -- so its exclusive-boundary behavior
 * (ELBOW-only excludes WRIST_HAND safety) gets the same scrutiny O gave
 * the WRIST_HAND-exclusion side of the same router.
 * ========================================================================= */

function wristHandBaseResponses() {
  let r = emptyResponses()
  return set(r, {
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    SAFETY_01: ['none'],
    PAIN_01: 'arm_hand',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    ELBOW_00: 'WRIST_HAND',
    WH_01: 'NO',
    WH_02: ['NONE'],
    WH_06: ['NONE'],
    WH_07: 'NONE',
    WH_08: 'NONE',
  })
}

// --- P-C: question visibility (routing incl.) ------------------------------

{
  const r = neckShoulderBaseResponses()
  const visible = visibleIds(r)
  assert('P-C1: non-arm_hand pain patient sees no WH_* questions', ![...visible].some((id) => id.startsWith('WH_')))
}
{
  const r = set(elbowBaseResponses(), { ELBOW_00: 'ELBOW' })
  const visible = visibleIds(r)
  assert(
    'P-C2 CRITICAL: ELBOW_00=ELBOW excludes ALL WRIST_HAND protected safety screens',
    !['WH_01', 'WH_02', 'WH_06', 'WH_07', 'WH_08'].some((id) => visible.has(id)),
  )
}
{
  const r = wristHandBaseResponses()
  const visible = visibleIds(r)
  assert(
    'P-C3: ELBOW_00=WRIST_HAND exposes all protected WRIST_HAND safety screens',
    ['WH_01', 'WH_02', 'WH_06', 'WH_07', 'WH_08'].every((id) => visible.has(id)),
  )
}
{
  // Most important routing case in this module: FOREARM must expose BOTH ELBOW and WRIST_HAND safety.
  const r = set(wristHandBaseResponses(), {
    ELBOW_00: 'FOREARM',
    ELBOW_01: 'NO',
    ELBOW_02: ['NONE'],
    ELBOW_02A: 'NO',
    ELBOW_06: 'NO',
    ELBOW_07: 'NO',
    ELBOW_08: 'NONE',
    ELBOW_09: 'NO',
    ELBOW_10: ['NONE'],
    ELBOW_11: ['NONE'],
  })
  const visible = visibleIds(r)
  assert('P-C4 CRITICAL: ELBOW_00=FOREARM exposes ELBOW protected safety', ['ELBOW_01', 'ELBOW_02', 'ELBOW_07', 'ELBOW_08'].every((id) => visible.has(id)))
  assert('P-C4 CRITICAL: ELBOW_00=FOREARM ALSO exposes WRIST_HAND protected safety (deliberate overlap)', ['WH_01', 'WH_02', 'WH_06', 'WH_07', 'WH_08'].every((id) => visible.has(id)))
}
{
  const rDiffuse = set(wristHandBaseResponses(), { ELBOW_00: 'DIFFUSE_OR_MULTIPLE' })
  const rUnknown = set(wristHandBaseResponses(), { ELBOW_00: 'UNKNOWN' })
  for (const [label, r] of [['DIFFUSE_OR_MULTIPLE', rDiffuse], ['UNKNOWN', rUnknown]]) {
    assert(`P-C5: ELBOW_00=${label} also exposes WRIST_HAND protected safety`, visibleIds(r).has('WH_02'))
  }
}
{
  const rYes = set(wristHandBaseResponses(), { WH_01: 'YES' })
  const rUnknown = set(wristHandBaseResponses(), { WH_01: 'UNKNOWN' })
  const rNo = set(wristHandBaseResponses(), { WH_01: 'NO' })
  assert('P-C6: WH_03/04/04A/05 appear when WH_01=YES', ['WH_03', 'WH_04', 'WH_04A', 'WH_05'].every((id) => visibleIds(rYes).has(id)))
  assert('P-C6: WH_03/04/04A/05 appear when WH_01=UNKNOWN', ['WH_03', 'WH_04', 'WH_04A', 'WH_05'].every((id) => visibleIds(rUnknown).has(id)))
  assert('P-C6: WH_03/04/04A/05 do NOT appear when WH_01=NO', !['WH_03', 'WH_04', 'WH_04A', 'WH_05'].some((id) => visibleIds(rNo).has(id)))
}
{
  const rCut = set(wristHandBaseResponses(), { WH_06: ['CUT_OR_PENETRATING_WOUND'] })
  const rBite = set(wristHandBaseResponses(), { WH_06: ['HUMAN_OR_ANIMAL_BITE'] })
  const rUnknown = set(wristHandBaseResponses(), { WH_06: ['UNKNOWN'] })
  const rNone = wristHandBaseResponses()
  assert('P-C7: WH_06A appears when WH_06 contains CUT_OR_PENETRATING_WOUND', visibleIds(rCut).has('WH_06A'))
  assert('P-C7: WH_06A appears when WH_06 contains HUMAN_OR_ANIMAL_BITE', visibleIds(rBite).has('WH_06A'))
  assert('P-C7: WH_06A appears when WH_06 contains UNKNOWN', visibleIds(rUnknown).has('WH_06A'))
  assert('P-C7: WH_06A does NOT appear when WH_06=[NONE]', !visibleIds(rNone).has('WH_06A'))
}
{
  const rWound = set(wristHandBaseResponses(), { WH_06: ['CUT_OR_PENETRATING_WOUND'] })
  const rFinger = set(wristHandBaseResponses(), { WH_07: 'FINGER_LOCALIZED_SWOLLEN_PAINFUL' })
  const rUnknown = set(wristHandBaseResponses(), { WH_07: 'UNKNOWN' })
  const rNeither = wristHandBaseResponses()
  assert('P-C8: WH_07A appears via WH_06 wound route', visibleIds(rWound).has('WH_07A'))
  assert('P-C8: WH_07A appears via WH_07=FINGER_LOCALIZED_SWOLLEN_PAINFUL route', visibleIds(rFinger).has('WH_07A'))
  assert('P-C8: WH_07A appears via WH_07=UNKNOWN route', visibleIds(rUnknown).has('WH_07A'))
  assert('P-C8: WH_07A does NOT appear when neither route is satisfied', !visibleIds(rNeither).has('WH_07A'))
}
{
  const rMedian = set(wristHandBaseResponses(), { WH_08: 'MEDIAN_DISTRIBUTION' })
  const rUlnar = set(wristHandBaseResponses(), { WH_08: 'ULNAR_DISTRIBUTION' })
  const rUnknown = set(wristHandBaseResponses(), { WH_08: 'UNKNOWN' })
  const rNone = wristHandBaseResponses()
  assert('P-C9: WH_08A appears when WH_08=MEDIAN_DISTRIBUTION', visibleIds(rMedian).has('WH_08A'))
  assert('P-C9: WH_08A appears when WH_08=ULNAR_DISTRIBUTION', visibleIds(rUlnar).has('WH_08A'))
  assert('P-C9: WH_08A appears when WH_08=UNKNOWN', visibleIds(rUnknown).has('WH_08A'))
  assert('P-C9: WH_08A does NOT appear when WH_08=NONE', !visibleIds(rNone).has('WH_08A'))
  assert('P-C9: WH_08A does NOT appear when WH_08 unanswered', !visibleIds(set(wristHandBaseResponses(), { WH_08: null })).has('WH_08A'))
}
{
  const q01 = ALL_QUESTIONS.find((q) => q.id === 'WH_01')
  const q02 = ALL_QUESTIONS.find((q) => q.id === 'WH_02')
  const q04a = ALL_QUESTIONS.find((q) => q.id === 'WH_04A')
  const q07a = ALL_QUESTIONS.find((q) => q.id === 'WH_07A')
  const q08a = ALL_QUESTIONS.find((q) => q.id === 'WH_08A')
  const q09 = ALL_QUESTIONS.find((q) => q.id === 'WH_09')
  assert('P-C10: WH_01 is required: true', q01.required === true)
  assert('P-C10: WH_02 is required: true', q02.required === true)
  assert('P-C10: WH_04A is required: false (optional non-gating context)', q04a.required === false)
  assert('P-C10: WH_07A is required: true (fail-closed once shown)', q07a.required === true)
  assert('P-C10: WH_08A is required: true (fail-closed once shown)', q08a.required === true)
  assert('P-C10: WH_09 is required: false (optional phenotype)', q09.required === false)
}
{
  // stale prune: WH_* answers must be cleared once PAIN_01 switches away from 'arm_hand'.
  const r = set(wristHandBaseResponses(), { WH_01: 'YES', WH_03: 'YES', WH_04: 'NO', WH_08: 'MEDIAN_DISTRIBUTION', WH_08A: ['NONE'] })
  const switched = set(r, { PAIN_01: 'knee' })
  assert(
    'P-C11: switching PAIN_01 away from arm_hand prunes all WH_* responses to null (ELBOW_00 too, shared router)',
    ['ELBOW_00', 'WH_01', 'WH_02', 'WH_03', 'WH_04', 'WH_08', 'WH_08A'].every((id) => switched[id] === null),
  )
}
{
  // switching the region discriminator away from WRIST_HAND to ELBOW must prune the now-hidden WH_* answers too.
  const r = set(wristHandBaseResponses(), { WH_01: 'YES', WH_04: 'YES' })
  const switched = set(r, {
    ELBOW_00: 'ELBOW',
    ELBOW_01: 'NO',
    ELBOW_02: ['NONE'],
    ELBOW_02A: 'NO',
    ELBOW_06: 'NO',
    ELBOW_07: 'NO',
    ELBOW_08: 'NONE',
    ELBOW_09: 'NO',
    ELBOW_10: ['NONE'],
    ELBOW_11: ['NONE'],
  })
  assert('P-C12: switching ELBOW_00 to ELBOW prunes the now-hidden WH_01/04 responses', switched['WH_01'] === null && switched['WH_04'] === null)
}

// --- P-D: staff interrupt ---------------------------------------------------

{
  const r = set(wristHandBaseResponses(), { WH_02: ['UNCONTROLLED_HEAVY_BLEEDING'] })
  assert('P-D1: WH_02 UNCONTROLLED_HEAVY_BLEEDING -> StaffCheck', STAFF_CHECK_TRIGGERS.WH_02(r) === true)
}
{
  const r = set(wristHandBaseResponses(), { WH_02: ['SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE'] })
  assert('P-D2: WH_02 SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE -> StaffCheck', STAFF_CHECK_TRIGGERS.WH_02(r) === true)
}
{
  const r = set(wristHandBaseResponses(), { WH_07: 'SYSTEMIC_OR_RAPIDLY_SPREADING' })
  assert('P-D3: WH_07 SYSTEMIC_OR_RAPIDLY_SPREADING -> StaffCheck', STAFF_CHECK_TRIGGERS.WH_07(r) === true)
}
{
  const r = set(wristHandBaseResponses(), { WH_07: 'LOCALIZED_STABLE' })
  assert('P-D3b: WH_07 LOCALIZED_STABLE does NOT StaffCheck (review-tier, not urgent)', STAFF_CHECK_TRIGGERS.WH_07(r) === false)
}
{
  const r = set(wristHandBaseResponses(), { WH_06: ['CUT_OR_PENETRATING_WOUND'], WH_07A: ['SEVERE_PAIN_WHEN_STRAIGHTENING'] })
  assert('P-D4 CRITICAL: WH_07A concrete positive -> StaffCheck even when WH_07=NONE', STAFF_CHECK_TRIGGERS.WH_07A(r) === true)
}
{
  const r = set(wristHandBaseResponses(), { WH_06: ['HUMAN_OR_ANIMAL_BITE'] })
  assert('P-D5: WH_06 bite alone (REVIEW-tier) does NOT StaffCheck via WH_02/WH_07/WH_07A', STAFF_CHECK_TRIGGERS.WH_02(r) === false && STAFF_CHECK_TRIGGERS.WH_07(r) === false)
}
{
  // WH_01/03/04/05/06/06A/08/08A positive must NOT interrupt -- REVIEW/expedited/flag only, no urgent trigger registered for them.
  assert(
    'P-D6: WH_01/03/04/05/06/06A/08/08A have no StaffCheck trigger registered',
    !('WH_01' in STAFF_CHECK_TRIGGERS) &&
      !('WH_03' in STAFF_CHECK_TRIGGERS) &&
      !('WH_04' in STAFF_CHECK_TRIGGERS) &&
      !('WH_05' in STAFF_CHECK_TRIGGERS) &&
      !('WH_06' in STAFF_CHECK_TRIGGERS) &&
      !('WH_06A' in STAFF_CHECK_TRIGGERS) &&
      !('WH_08' in STAFF_CHECK_TRIGGERS) &&
      !('WH_08A' in STAFF_CHECK_TRIGGERS),
  )
}
{
  const r = wristHandBaseResponses() // fully clean
  assert(
    'P-D7: WH_02/WH_07/WH_07A all stay false on a fully-clean wrist_hand baseline',
    STAFF_CHECK_TRIGGERS.WH_02(r) === false && STAFF_CHECK_TRIGGERS.WH_07(r) === false && STAFF_CHECK_TRIGGERS.WH_07A(r) === false,
  )
}

// --- P-E: payload/routing ---------------------------------------------------

{
  const r = wristHandBaseResponses()
  const payload = buildResponsePayload(r)
  assert('P-E1: wrist_hand patient -> safety_flags.wrist_hand !== null', payload.safety_flags.wrist_hand !== null)
  assert('P-E2: all WH responses land under modules.wrist_hand', payload.modules.wrist_hand.recent_trauma === 'NO')
  assert('P-E2b: modules.wrist_hand.prior_xray_context preserves WH_04A raw value', set(r, { WH_01: 'YES', WH_04A: 'DONE_TOLD_NORMAL' }).WH_04A === 'DONE_TOLD_NORMAL' && buildResponsePayload(set(r, { WH_01: 'YES', WH_04A: 'DONE_TOLD_NORMAL' })).modules.wrist_hand.prior_xray_context === 'DONE_TOLD_NORMAL')
  const routing = buildRoutingPayload(r)
  assert("P-E3: primary_module_detail === 'WRIST_HAND' for wrist_hand-safety-exposed patient", routing.primary_module_detail === 'WRIST_HAND')
}
{
  // ELBOW-only: safety_flags.wrist_hand must be null, and ELBOW's own existing behavior (E3 in O above) stays 'ELBOW'.
  const r = set(elbowBaseResponses(), { ELBOW_00: 'ELBOW' })
  const payload = buildResponsePayload(r)
  assert('P-E4 CRITICAL: ELBOW-only patient -> safety_flags.wrist_hand === null', payload.safety_flags.wrist_hand === null)
  const routing = buildRoutingPayload(r)
  assert("P-E5 CRITICAL: ELBOW-only patient -> primary_module_detail still 'ELBOW' (unchanged, zero regression)", routing.primary_module_detail === 'ELBOW')
}
{
  // FOREARM: both safety_flags.elbow and safety_flags.wrist_hand must be non-null simultaneously -- the deliberate overlap.
  const r = set(wristHandBaseResponses(), {
    ELBOW_00: 'FOREARM',
    ELBOW_01: 'NO',
    ELBOW_02: ['NONE'],
    ELBOW_02A: 'NO',
    ELBOW_06: 'NO',
    ELBOW_07: 'NO',
    ELBOW_08: 'NONE',
    ELBOW_09: 'NO',
    ELBOW_10: ['NONE'],
    ELBOW_11: ['NONE'],
  })
  const payload = buildResponsePayload(r)
  assert('P-E6 CRITICAL: FOREARM patient -> safety_flags.elbow !== null AND safety_flags.wrist_hand !== null simultaneously', payload.safety_flags.elbow !== null && payload.safety_flags.wrist_hand !== null)
  const routing = buildRoutingPayload(r)
  assert("P-E7: FOREARM patient -> primary_module_detail === 'ELBOW' (priority order, display-only label)", routing.primary_module_detail === 'ELBOW')
}
{
  const r = neckShoulderBaseResponses()
  const payload = buildResponsePayload(r)
  assert('P-E8: non-arm_hand (neck_shoulder) patient -> safety_flags.wrist_hand === null', payload.safety_flags.wrist_hand === null)
  const routing = buildRoutingPayload(r)
  assert(
    "P-E9: existing NECK/SHOULDER routing unchanged by WRIST_HAND addition -- primary_module_detail still 'SHOULDER'",
    routing.primary_module_detail === 'SHOULDER',
  )
}
{
  const r = kneeBaseResponses()
  const routing = buildRoutingPayload(r)
  assert("P-E10: existing KNEE routing unchanged by WRIST_HAND addition -- primary_module_detail still 'KNEE'", routing.primary_module_detail === 'KNEE')
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
