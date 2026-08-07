// Doctor-view fixture + label-resolution suite.
// Run via `npm run test:doctor` (bundles src/doctor/fixtures.ts and
// src/doctor/labels.ts with esbuild first, same style as the other suites).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import { DOCTOR_FIXTURES } from './.doctor-fixtures-bundle.mjs'
import { optionLabel, optionLabels } from './.doctor-labels-bundle.mjs'

let passCount = 0

function assert(name, cond) {
  if (!cond) {
    throw new Error(`FAIL: ${name}`)
  }
  passCount++
  console.log(`OK: ${name}`)
}

function byName(name) {
  const f = DOCTOR_FIXTURES.find((x) => x.name === name)
  if (!f) throw new Error(`fixture not found: ${name}`)
  return f
}

/* ---------------------------------------------------------------------
 * 1. Every fixture is a fully-formed payload with all top-level keys.
 * ------------------------------------------------------------------- */

assert('7 fixtures are defined', DOCTOR_FIXTURES.length >= 7)

for (const f of DOCTOR_FIXTURES) {
  const p = f.payload
  assert(`${f.name}: has responses`, p.responses && typeof p.responses === 'object')
  assert(`${f.name}: has flags`, p.flags && typeof p.flags === 'object')
  assert(`${f.name}: has routing`, p.routing && typeof p.routing === 'object')
  assert(`${f.name}: has myungri_calculation`, p.myungri_calculation && typeof p.myungri_calculation === 'object')
  assert(`${f.name}: has questionnaire_version`, typeof p.questionnaire_version === 'string')
  assert(`${f.name}: has session_id`, typeof p.session_id === 'string')
}

/* ---------------------------------------------------------------------
 * 2. Safety fixture actually requires staff check.
 * ------------------------------------------------------------------- */

{
  const f = byName('안전 확인 필요')
  assert('safety fixture: requires_staff_check === true', f.payload.flags.requires_staff_check === true)
  assert('safety fixture: general_red flag set (SAFETY_01)', f.payload.flags.general_red === true)
  assert('safety fixture: bowel_needs_review flag set (BOWEL_03)', f.payload.flags.bowel_needs_review === true)
}

/* ---------------------------------------------------------------------
 * 3. Pregnancy fixture: myungri present + reproductive status derived
 *    from the pregnancy module (not the general safety question).
 * ------------------------------------------------------------------- */

{
  const f = byName('임신 상담')
  assert('pregnancy fixture: myungri_calculation present', !!f.payload.myungri_calculation)
  assert(
    'pregnancy fixture: reproductive_status.derived.source === pregnancy_module',
    f.payload.responses.reproductive_status.derived.source === 'pregnancy_module',
  )
  assert(
    'pregnancy fixture: derived.pregnant === true',
    f.payload.responses.reproductive_status.derived.pregnant === true,
  )
}

/* ---------------------------------------------------------------------
 * 4. Time-unknown fixture (체중 관리) -> myungri partial, hour pillar null.
 * ------------------------------------------------------------------- */

{
  const f = byName('체중 관리')
  assert('time-unknown fixture: status === partial', f.payload.myungri_calculation.status === 'partial')
  assert('time-unknown fixture: pillars.hour === null', f.payload.myungri_calculation.pillars.hour === null)
}

/* ---------------------------------------------------------------------
 * 5. 자시(ja) fixture -> pending_approval includes day_boundary.
 * ------------------------------------------------------------------- */

{
  const f = byName('안전 확인 필요')
  assert(
    'ja-time fixture: policy.pending_approval includes day_boundary',
    f.payload.myungri_calculation.policy.pending_approval.includes('day_boundary'),
  )
  assert(
    'ja-time fixture: flags.in_jasi_window === true',
    f.payload.myungri_calculation.flags.in_jasi_window === true,
  )
}

/* ---------------------------------------------------------------------
 * 6. Lunar-leap fixture actually resolves via BIRTH_02A/BIRTH_02 = lunar/yes.
 * ------------------------------------------------------------------- */

{
  const f = byName('여성 건강 주호소')
  assert(
    'lunar-leap fixture: birth_calendar_type is lunar',
    f.payload.responses.birth_info.birth_calendar_type === 'lunar',
  )
  assert('lunar-leap fixture: lunar_leap_month is yes', f.payload.responses.birth_info.lunar_leap_month === 'yes')
  assert(
    'lunar-leap fixture: myungri_calculation resolved',
    f.payload.myungri_calculation.status === 'resolved',
  )
}

/* ---------------------------------------------------------------------
 * 7. Label-resolution helper: never leaks a raw enum where a Korean label
 *    is expected. Spot-check across several different questions/answers.
 * ------------------------------------------------------------------- */

{
  const cases = [
    { qid: 'ID_03', value: 'male', expected: '남성' },
    { qid: 'ID_03', value: 'female', expected: '여성' },
    { qid: 'VISIT_02_SYMPTOM_MAIN', value: 'sleep', expected: '잠이 불편해요' },
    { qid: 'SLEEP_01', value: 'night_awakenings', expected: '자다가 자주 깨요' },
    { qid: 'SAFETY_01', value: 'none', expected: '해당 없음' },
    { qid: 'SECONDARY_01', value: 'none', expected: '없음' },
    { qid: 'MED_USE', value: 'unknown', expected: '잘 모르겠어요' },
    { qid: 'BOWEL_03', value: 'yes', expected: '네' },
  ]
  for (const c of cases) {
    const got = optionLabel(c.qid, c.value)
    assert(
      `optionLabel(${c.qid}, ${c.value}) resolves to Korean label, not the raw enum`,
      got === c.expected && got !== c.value,
    )
  }

  const arr = optionLabels('SLEEP_01', ['sleep_onset', 'night_awakenings'])
  assert(
    'optionLabels resolves every item in an array (no raw enum leaks)',
    arr.join(',') === '잠들기 어려워요,자다가 자주 깨요',
  )

  // Free-text / numeric questions have no options -> the raw value is the
  // correct "label" (there is nothing to translate); confirm the helper
  // doesn't crash and doesn't invent a label for those.
  assert('optionLabel falls back to raw value for free-text questions', optionLabel('ID_01', '김민준') === '김민준')
}

console.log(`\n${passCount} assertions passed, 0 failed (total ${passCount})`)
