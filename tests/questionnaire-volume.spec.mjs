/*
 * Patient questionnaire information-volume audit (Primary vs Additional).
 *
 * WHAT THIS IS. A reproducible, browser-free measurement of how much the
 * questionnaire actually asks, per representative profile: screens, taps,
 * branch depth, and burden by section -- split into Primary module,
 * Additional detailed module, and shared/core screens. It runs the real
 * `visibleQuestions` engine from coreSpec.ts, so it measures the shipped
 * routing rather than a model of it.
 *
 * ANSWERING POLICY, stated because the numbers mean nothing without it.
 * Each profile pins only its routing-defining answers (identity, visit
 * intent, primary concern, and where relevant the Additional concern).
 * Every other question is answered by a GREEDY MINIMUM-BURDEN rule: try
 * each available answer, keep the one that leaves the fewest questions
 * visible, break ties by spec order. No name heuristics, no assumption
 * about which option is "benign" -- the engine decides. So these figures
 * are the FLOOR: the shortest path a patient can take through each
 * profile. A patient reporting safety-positive answers sees more, by
 * design. Greedy is per-screen, not globally optimal, so a shorter path
 * could exist; the figures are stable and comparable, which is what a
 * regression guard needs.
 *
 * TAP MODEL. The app shows one question per screen and never
 * auto-advances (App.tsx wires goNext to the button only), so every screen
 * costs at least one selection plus one 다음. Multi-select costs one tap
 * per chosen value plus 다음. Staff-check interrupts add one tap each.
 *
 * WHAT IT GUARDS. The pinned counts fail if a change silently adds screens
 * or taps to a profile. It is deliberately NOT a clinical assertion: it
 * says nothing about whether a question should exist.
 *
 * Run via `npm run test:questionnaire-volume` (part of `npm run test:all`).
 */
import assert from 'node:assert/strict'
import {
  ALL_QUESTIONS,
  visibleQuestions,
  modulesActivated,
  questionnaireMode,
  MODULE_QUESTION_IDS,
  MODULE_ROUTES,
  STAFF_CHECK_TRIGGERS,
} from './.spec-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name} ${extra}`)
}

const optionsFor = (q, r) => (q.optionsIf ? q.optionsIf(r) : q.options) ?? []

/** Every answer the engine would accept for this question, in spec order. */
function candidateAnswers(q, r) {
  const opts = optionsFor(q, r)
  if (q.input === 'single_choice') return opts.map((o) => o.value)
  if (q.input === 'multi_choice') {
    const exclusive = Array.isArray(q.exclusive) ? q.exclusive : q.exclusive ? [q.exclusive] : []
    const list = exclusive.map((v) => [v])
    if (!q.required) list.push([])
    for (const o of opts) list.push([o.value])
    return list
  }
  if (q.input === 'numeric') return ['1234']
  if (q.input === 'numeric_scale') return ['5']
  return ['테스트']
}

function tapsFor(q, answer) {
  // one selection (or one text/number entry) + one 다음
  if (Array.isArray(answer)) return answer.length + 1
  return 2
}

/**
 * Forward walk mirroring App.tsx: take the first still-unanswered question
 * in `visibleQuestions` order, answer it, recompute.
 */
function walk(seed) {
  const r = { ...seed }
  const trace = []
  let staffChecks = 0
  const staffShown = new Set()
  for (let guard = 0; guard < 500; guard += 1) {
    const visible = visibleQuestions(r)
    const q = visible.find((x) => r[x.id] === undefined)
    if (!q) break

    let answer
    if (seed[q.id] !== undefined) {
      answer = seed[q.id]
    } else {
      let best = null
      for (const cand of candidateAnswers(q, r)) {
        const count = visibleQuestions({ ...r, [q.id]: cand }).length
        if (best === null || count < best.count) best = { cand, count }
      }
      answer = best.cand
    }
    r[q.id] = answer

    const trigger = STAFF_CHECK_TRIGGERS[q.id]
    if (trigger && !staffShown.has(q.id) && trigger(r)) {
      staffShown.add(q.id)
      staffChecks += 1
    }
    trace.push({ id: q.id, step: q.step, taps: tapsFor(q, answer) })
  }
  return { r, trace, staffChecks }
}

/*
 * `modulesActivated` returns router LABELS ('Pain', 'Sleep', 'GI') while
 * MODULE_QUESTION_IDS is keyed by concern KEY ('pain', 'sleep',
 * 'digestion'). Lowercasing happens to work for two of them and silently
 * mis-buckets the rest -- invert MODULE_ROUTES instead so the mapping is
 * the one the spec actually defines.
 */
const MODULE_KEY_BY_LABEL = Object.fromEntries(
  Object.entries(MODULE_ROUTES).map(([key, label]) => [label, key]),
)

/** Which bucket a screen belongs to: primary module, additional module, or shared. */
function bucketOf(id, primaryModule, additionalModule) {
  const inModule = (label) => {
    const key = label ? MODULE_KEY_BY_LABEL[label] : null
    return !!key && (MODULE_QUESTION_IDS[key] ?? []).includes(id)
  }
  if (inModule(primaryModule)) return 'primary'
  if (inModule(additionalModule)) return 'additional'
  return 'shared'
}

const IDENTITY = { ID_01: '테스트', ID_02: '1234', ID_03: 'female', BIRTH_01: '19800101' }
const MALE = { ...IDENTITY, ID_03: 'male' }

/*
 * Representative profiles. Each pins only routing-defining answers; the
 * expectations below are the measured floor at the time of writing and are
 * here to fail loudly on silent growth, not to bless any particular number.
 */
const PROFILES = [
  { name: 'pain_fast · 요통(LBP)', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' }, screens: 23, taps: 46 },
  { name: 'pain_fast · 무릎', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'knee' }, screens: 29, taps: 60 },
  { name: 'pain_fast · 팔/손', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'arm_hand' }, screens: 28, taps: 56 },
  { name: 'pain_fast · 요통 + 추가상세(수면)', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis', ADDITIONAL_DETAIL_01: 'sleep' }, screens: 25, taps: 50 },
  { name: 'symptom · 수면', seed: { ...IDENTITY, VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep' }, screens: 17, taps: 34 },
  { name: 'herbal · 증상치료(소화)', seed: { ...IDENTITY, VISIT_00_INTENT: 'herbal', VISIT_00B_HERBAL_PURPOSE: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' }, screens: 25, taps: 51 },
  { name: 'pain_fast · 요통(남성)', seed: { ...MALE, VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' }, screens: 22, taps: 44 },
]

console.log('=== questionnaire information volume (minimum-burden floor) ===\n')

for (const profile of PROFILES) {
  const { r, trace, staffChecks } = walk(profile.seed)
  const modules = modulesActivated(r)
  const [primaryModule, additionalModule] = modules
  const bySection = {}
  const byBucket = { primary: 0, additional: 0, shared: 0 }
  let taps = staffChecks
  for (const t of trace) {
    bySection[t.step] = (bySection[t.step] ?? 0) + 1
    byBucket[bucketOf(t.id, primaryModule, additionalModule)] += 1
    taps += t.taps
  }
  const sections = Object.entries(bySection).map(([k, v]) => `${k} ${v}`).join(' · ')

  console.log(`${profile.name}`)
  console.log(`  mode ${questionnaireMode(r)} | modules ${modules.join(', ') || '(none)'} | branch depth ${modules.length}`)
  console.log(`  screens ${trace.length} | taps ${taps} (incl. ${staffChecks} staff-check)`)
  console.log(`  primary ${byBucket.primary} · additional ${byBucket.additional} · shared ${byBucket.shared}`)
  console.log(`  by section: ${sections}\n`)

  check(`${profile.name}: screen count is pinned`, trace.length === profile.screens, `(${trace.length}, expected ${profile.screens})`)
  check(`${profile.name}: tap count is pinned`, taps === profile.taps, `(${taps}, expected ${profile.taps})`)
  check(`${profile.name}: every screen is reached once`, new Set(trace.map((t) => t.id)).size === trace.length)
}

/* ---------------------------------------------------------------------
 * Presentation-only redundancy scan.
 *
 * These are the two shapes that can be removed WITHOUT touching question
 * meaning, thresholds, promotion/safety rules, routing or provenance:
 *   1. the same question text with the same options asked twice in one
 *      session -- a literal repeat;
 *   2. a screen offering a single selectable option -- a tap that carries
 *      no information.
 * Both currently measure zero. These assertions keep it that way; if one
 * ever appears, this suite names it and the fix is a safe deletion.
 * ------------------------------------------------------------------- */
for (const profile of PROFILES) {
  const r = { ...profile.seed }
  const seen = new Map()
  const repeats = []
  const forced = []
  for (let guard = 0; guard < 500; guard += 1) {
    const visible = visibleQuestions(r)
    const q = visible.find((x) => r[x.id] === undefined)
    if (!q) break
    const opts = optionsFor(q, r)
    if ((q.input === 'single_choice' || q.input === 'multi_choice') && opts.length <= 1) forced.push(q.id)
    const key = `${(q.question ?? '').replace(/\s+/g, ' ').trim()}##${opts.map((o) => o.value).join('|')}`
    if (seen.has(key)) repeats.push(`${seen.get(key)}~${q.id}`)
    else seen.set(key, q.id)

    if (profile.seed[q.id] !== undefined) { r[q.id] = profile.seed[q.id]; continue }
    let best = null
    for (const cand of candidateAnswers(q, r)) {
      const count = visibleQuestions({ ...r, [q.id]: cand }).length
      if (best === null || count < best.count) best = { cand, count }
    }
    r[q.id] = best.cand
  }
  check(`${profile.name}: no question is asked twice with the same options`, repeats.length === 0, repeats.join(' '))
  check(`${profile.name}: no screen offers only one selectable option`, forced.length === 0, forced.join(' '))
}

// Across the whole spec, not just the walked paths.
const byText = new Map()
for (const q of ALL_QUESTIONS) {
  const key = (q.question ?? '').replace(/\s+/g, ' ').trim()
  if (!byText.has(key)) byText.set(key, [])
  byText.get(key).push(q.id)
}
/*
 * ELBOW_00 and AF_00 share their wording ("지금 가장 불편한 부위는 어디에
 * 가장 가깝나요?") but are the arm/hand and leg/foot sub-routers, with
 * different option sets, and are never both visible in one session. Same
 * sentence, different question -- not a redundancy, so it is allowed by
 * name rather than by silence.
 */
const ALLOWED_SHARED_WORDING = [['AF_00', 'ELBOW_00']]
const sharedWording = [...byText.values()].filter((ids) => ids.length > 1).map((ids) => [...ids].sort())
const unexpected = sharedWording.filter(
  (ids) => !ALLOWED_SHARED_WORDING.some((a) => a.length === ids.length && a.every((x, i) => x === ids[i])),
)
check(
  'no unexpected pair of questions shares identical wording',
  unexpected.length === 0,
  unexpected.map((ids) => ids.join('~')).join(' '),
)

console.log(`\n${passed} questionnaire-volume assertions passed.`)
