// Logic scenario integration suite for src/spec/coreSpec.ts.
// Run via `npm run test:integration` (bundles coreSpec.ts with esbuild first).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import {
  ALL_QUESTIONS,
  visibleQuestions,
  pruneStaleResponses,
  buildResponsePayload,
  buildRoutingPayload,
  modulesActivated,
  deriveReproductiveStatus,
  SECONDARY_SHORT_SCREENS,
  MODULE_ROUTES,
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

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
