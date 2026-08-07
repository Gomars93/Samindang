// Deterministic-engine test suite for src/saju/*.
// Run via `npm run test:saju` (bundles src/saju/index.ts with esbuild first).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import { computeSaju } from './.saju-bundle.mjs'

let passCount = 0

function assert(name, cond) {
  if (!cond) {
    throw new Error(`FAIL: ${name}`)
  }
  passCount++
  console.log(`OK: ${name}`)
}

function baseInput(overrides) {
  return {
    birthDateRaw: '20240807',
    calendarType: 'solar',
    lunarLeapMonth: null,
    timeBranch: 'o',
    timeConfidence: 'exact',
    sex: 'male',
    ...overrides,
  }
}

/* ---------------------------------------------------------------------
 * 12 time-branch coverage: expected 지지 in the hour pillar + representative
 * time falls inside the stated clock range.
 * ------------------------------------------------------------------- */

const BRANCH_EXPECTED_JIJI = {
  ja: '자',
  chuk: '축',
  in: '인',
  myo: '묘',
  jin: '진',
  sa: '사',
  o: '오',
  mi: '미',
  sin: '신',
  yu: '유',
  sul: '술',
  hae: '해',
}

const BRANCH_CLOCK_RANGES = {
  // [startHour, endHour] inclusive, in 24h KST; 'ja' wraps past midnight.
  ja: [23, 24.98], // 23:00-00:59 -> treat as 23:00-24:59 for the inside-range check below
  chuk: [1, 2.98],
  in: [3, 4.98],
  myo: [5, 6.98],
  jin: [7, 8.98],
  sa: [9, 10.98],
  o: [11, 12.98],
  mi: [13, 14.98],
  sin: [15, 16.98],
  yu: [17, 18.98],
  sul: [19, 20.98],
  hae: [21, 22.98],
}

for (const branch of Object.keys(BRANCH_EXPECTED_JIJI)) {
  const r = computeSaju(baseInput({ timeBranch: branch }))
  assert(`branch ${branch}: status resolved`, r.status === 'resolved')
  const hourJiji = r.pillars.hour[1]
  assert(`branch ${branch}: hour pillar jiji === ${BRANCH_EXPECTED_JIJI[branch]}`, hourJiji === BRANCH_EXPECTED_JIJI[branch])

  const usedHour = r.normalized.hourUsed
  const usedMinute = r.normalized.minuteUsed
  const asDecimal = branch === 'ja' && usedHour === 23 ? usedHour + usedMinute / 60 : usedHour + usedMinute / 60
  const [lo, hi] = BRANCH_CLOCK_RANGES[branch]
  assert(`branch ${branch}: representative time ${usedHour}:${usedMinute} within [${lo},${hi}]`, asDecimal >= lo && asDecimal <= hi)
}

// 'ja' uses 23:30 on the stated date, not the midpoint 00:00 (which would cross day boundary).
{
  const r = computeSaju(baseInput({ timeBranch: 'ja' }))
  assert('ja: representative hour is 23 (stated date, not next-day midnight)', r.normalized.hourUsed === 23)
  assert('ja: representative minute is 30', r.normalized.minuteUsed === 30)
}

/* ---------------------------------------------------------------------
 * Day/month/year boundary cases
 * ------------------------------------------------------------------- */

{
  const before = computeSaju(baseInput({ birthDateRaw: '20240203' }))
  const after = computeSaju(baseInput({ birthDateRaw: '20240205' }))
  assert('입춘 boundary: 2024-02-03 vs 2024-02-05 give different year pillars', before.pillars.year !== after.pillars.year)
  assert('입춘 boundary: 2024-02-03 -> 계묘', before.pillars.year === '계묘')
  assert('입춘 boundary: 2024-02-05 -> 갑진', after.pillars.year === '갑진')
}

const HEAVENLY_STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']
const EARTHLY_BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해']

function ganjiIndex(gj) {
  const stemIdx = HEAVENLY_STEMS.indexOf(gj[0])
  const branchIdx = EARTHLY_BRANCHES.indexOf(gj[1])
  // Reconstruct the 0-59 60-cycle index from the stem/branch pair (both cycle mod their own length, in lockstep).
  for (let i = 0; i < 60; i++) {
    if (i % 10 === stemIdx && i % 12 === branchIdx) return i
  }
  throw new Error(`invalid ganji ${gj}`)
}

{
  const d1 = computeSaju(baseInput({ birthDateRaw: '20240101' }))
  const d2 = computeSaju(baseInput({ birthDateRaw: '20240102' }))
  const i1 = ganjiIndex(d1.pillars.day)
  const i2 = ganjiIndex(d2.pillars.day)
  assert('day pillar advances by exactly 1 step in the 60-cycle across consecutive days', (i2 - i1 + 60) % 60 === 1)
}

{
  // Month-boundary: last day of a lunar-month-irrelevant solar month vs first of next (month pillar tracks solar terms, not calendar months, so just sanity check it computes and stays deterministic).
  const jan31 = computeSaju(baseInput({ birthDateRaw: '20240131' }))
  const feb1 = computeSaju(baseInput({ birthDateRaw: '20240201' }))
  assert('month-boundary case (01-31 -> 02-01) computes resolved pillars for both', jan31.status === 'resolved' && feb1.status === 'resolved')
}

{
  // Year-boundary: 12-31 -> 01-01 (Gregorian rollover; year pillar itself only flips at 입춘, but the day pillar must still be a clean +1 step).
  const dec31 = computeSaju(baseInput({ birthDateRaw: '20231231' }))
  const jan1 = computeSaju(baseInput({ birthDateRaw: '20240101' }))
  const iDec31 = ganjiIndex(dec31.pillars.day)
  const iJan1 = ganjiIndex(jan1.pillars.day)
  assert('year-boundary 12-31 -> 01-01: day pillar advances by exactly 1', (iJan1 - iDec31 + 60) % 60 === 1)
  assert('year-boundary 12-31 -> 01-01: year pillar unchanged (입춘 not yet reached)', dec31.pillars.year === jan1.pillars.year)
}

/* ---------------------------------------------------------------------
 * Solar / lunar conversion
 * ------------------------------------------------------------------- */

{
  const r = computeSaju(baseInput({ birthDateRaw: '20240101', calendarType: 'lunar', lunarLeapMonth: 'no' }))
  assert('lunar 2024-01-01 -> solar 2024-02-10', r.status === 'resolved')
  assert('lunar 2024-01-01 -> solar 2024-02-10 (year)', r.normalized.solarDate.year === 2024)
  assert('lunar 2024-01-01 -> solar 2024-02-10 (month)', r.normalized.solarDate.month === 2)
  assert('lunar 2024-01-01 -> solar 2024-02-10 (day)', r.normalized.solarDate.day === 10)
}

{
  const leap = computeSaju(baseInput({ birthDateRaw: '20230201', calendarType: 'lunar', lunarLeapMonth: 'yes' }))
  const nonLeap = computeSaju(baseInput({ birthDateRaw: '20230201', calendarType: 'lunar', lunarLeapMonth: 'no' }))
  assert('lunar 2023-02-01 leap resolves', leap.status === 'resolved')
  assert('lunar 2023-02-01 non-leap resolves', nonLeap.status === 'resolved')
  assert(
    'lunar 2023-02-01 leap vs non-leap give different solar dates',
    JSON.stringify(leap.normalized.solarDate) !== JSON.stringify(nonLeap.normalized.solarDate),
  )
}

{
  const r = computeSaju(baseInput({ birthDateRaw: '20230201', calendarType: 'lunar', lunarLeapMonth: 'unknown' }))
  assert('lunar with leap unknown -> unresolved', r.status === 'unresolved')
  assert('lunar leap unknown -> flags.lunar_leap_unresolved true', r.flags.lunar_leap_unresolved === true)
  assert('lunar leap unknown -> pillars null', r.pillars === null)
  assert('lunar leap unknown -> unresolved_reason present', typeof r.unresolved_reason === 'string' && r.unresolved_reason.length > 0)
}

/* ---------------------------------------------------------------------
 * calendarType unknown
 * ------------------------------------------------------------------- */

{
  const r = computeSaju(baseInput({ calendarType: 'unknown', lunarLeapMonth: null }))
  assert('calendarType unknown -> unresolved', r.status === 'unresolved')
  assert('calendarType unknown -> pillars null', r.pillars === null)
  assert('calendarType unknown -> normalized null', r.normalized === null)
}

/* ---------------------------------------------------------------------
 * timeBranch unknown -> partial
 * ------------------------------------------------------------------- */

{
  const r = computeSaju(baseInput({ timeBranch: 'unknown', timeConfidence: null }))
  assert('timeBranch unknown -> status partial', r.status === 'partial')
  assert('timeBranch unknown -> pillars.hour null', r.pillars.hour === null)
  assert('timeBranch unknown -> flags.hour_unknown true', r.flags.hour_unknown === true)
  assert('timeBranch unknown -> year pillar still present', typeof r.pillars.year === 'string' && r.pillars.year.length === 2)
  assert('timeBranch unknown -> month pillar still present', typeof r.pillars.month === 'string' && r.pillars.month.length === 2)
  assert('timeBranch unknown -> day pillar still present', typeof r.pillars.day === 'string' && r.pillars.day.length === 2)
}

{
  const r = computeSaju(baseInput({ timeBranch: null, timeConfidence: null }))
  assert('timeBranch null -> status partial', r.status === 'partial')
  assert('timeBranch null -> pillars.hour null', r.pillars.hour === null)
}

/* ---------------------------------------------------------------------
 * 'ja' branch -> jasi window
 * ------------------------------------------------------------------- */

{
  const r = computeSaju(baseInput({ timeBranch: 'ja' }))
  assert('ja branch -> flags.in_jasi_window true', r.flags.in_jasi_window === true)
  assert('ja branch -> alternatives populated', r.alternatives !== null && r.alternatives.dayBoundary != null)
  const { midnight, jasi, splitJasi } = r.alternatives.dayBoundary
  assert('ja branch -> midnight/jasi day differ', midnight.day !== jasi.day)
  assert('ja branch -> midnight/splitJasi hour differ', midnight.hour !== splitJasi.hour)
  assert('ja branch -> jasi/splitJasi day differ', jasi.day !== splitJasi.day)
  assert(
    'ja branch -> three alternatives are pairwise distinct combos',
    new Set([JSON.stringify(midnight), JSON.stringify(jasi), JSON.stringify(splitJasi)]).size === 3,
  )
  assert('ja branch -> pillars equal midnight variant', JSON.stringify(r.pillars) === JSON.stringify(midnight))
  assert('ja branch -> policy.pending_approval includes day_boundary', r.policy.pending_approval.includes('day_boundary'))
}

/* ---------------------------------------------------------------------
 * Non-'ja' branch -> no alternatives
 * ------------------------------------------------------------------- */

{
  const r = computeSaju(baseInput({ timeBranch: 'o' }))
  assert('non-ja branch -> alternatives null', r.alternatives === null)
  assert('non-ja branch -> in_jasi_window false', r.flags.in_jasi_window === false)
}

/* ---------------------------------------------------------------------
 * Invalid date input never throws
 * ------------------------------------------------------------------- */

for (const bad of ['20241350', '', 'abcd', '2024131', '202413', '99999999']) {
  let r
  let threw = false
  try {
    r = computeSaju(baseInput({ birthDateRaw: bad }))
  } catch {
    threw = true
  }
  assert(`invalid date '${bad}' never throws`, threw === false)
  assert(`invalid date '${bad}' -> unresolved`, r.status === 'unresolved')
}

/* ---------------------------------------------------------------------
 * True solar time is never applied by default
 * ------------------------------------------------------------------- */

{
  const r = computeSaju(baseInput({}))
  assert('policy.true_solar_time is not_applied', r.policy.true_solar_time === 'not_applied')
}

/* ---------------------------------------------------------------------
 * Input echo: raw preservation
 * ------------------------------------------------------------------- */

{
  const input = baseInput({ timeBranch: 'sin', timeConfidence: 'approximate', sex: 'female' })
  const r = computeSaju(input)
  assert('SajuResult.input deep-equals the SajuInput passed in', JSON.stringify(r.input) === JSON.stringify(input))
}

/* ---------------------------------------------------------------------
 * Determinism
 * ------------------------------------------------------------------- */

{
  const input = baseInput({ timeBranch: 'ja' })
  const r1 = computeSaju(input)
  const r2 = computeSaju(input)
  const strip = (r) => {
    const { engine, ...rest } = r
    const { computed_at, ...engineRest } = engine
    return { rest, engineRest }
  }
  const s1 = strip(r1)
  const s2 = strip(r2)
  assert('determinism: identical results (excluding computed_at)', JSON.stringify(s1) === JSON.stringify(s2))
  assert('determinism: computed_at is a valid ISO string both times', !Number.isNaN(Date.parse(r1.engine.computed_at)) && !Number.isNaN(Date.parse(r2.engine.computed_at)))
}

console.log(`\nSAJU SUMMARY: ${passCount} passed`)
