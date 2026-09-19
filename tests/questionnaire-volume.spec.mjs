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
import { readFileSync } from 'node:fs'
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
// Tablet UX v2.3 §8-9 convergence transplant: LBP_01B_LEG_SCREEN is a
// genuine new patient-facing screen (reachable whenever LBP_01=BACK_ONLY,
// which the greedy minimum-burden picker selects for all three LBP
// profiles below) -- re-measured and re-pinned at +1 screen / +2 taps per
// affected profile. LBP_10A_ONSET_AGE/LBP_10 are unaffected here: the
// greedy picker never lands on a chronic-onset duration for these seeds,
// so that pair (gated on IS_LBP_CHRONIC_ONSET) is never reached by this
// floor walk either before or after.
// 2026-09-08 상담 내용 2화면 순서 재설계: 참고 증상(다중)이 먼저 오고, 그중
// 하나를 고르는 "오늘 자세히"(단일)는 **고를 후보가 있을 때만** 뜬다. 최소부담
// 걷기는 참고 증상에 '없음'을 고르므로 이제 그 화면이 통째로 사라진다 --
// 아래 여섯 프로필이 전부 정확히 -1 screen / -2 taps 인 이유가 그것이다
// (이전에는 '없음'을 고르려고 한 화면을 반드시 지나야 했다).
// '추가상세(수면)' 프로필만 두 화면을 모두 seed하는데, walk는 seed된 질문을
// 세지 않으므로 그 프로필의 수치에는 두 화면이 빠져 있다(실제 환자는 +2 화면).
const PROFILES = [
  { name: 'pain_fast · 요통(LBP)', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' }, screens: 25, taps: 50 },
  { name: 'pain_fast · 무릎', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'knee' }, screens: 28, taps: 58 },
  { name: 'pain_fast · 팔/손', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'arm_hand' }, screens: 27, taps: 54 },
  { name: 'pain_fast · 요통 + 추가상세(수면)', seed: { ...IDENTITY, VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis', REFERENCE_SYMPTOMS_01: ['sleep'], ADDITIONAL_DETAIL_01: 'sleep' }, screens: 27, taps: 54 },
  { name: 'symptom · 수면', seed: { ...IDENTITY, VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep' }, screens: 16, taps: 32 },
  { name: 'herbal · 증상치료(소화)', seed: { ...IDENTITY, VISIT_00_INTENT: 'herbal', VISIT_00B_HERBAL_PURPOSE: 'symptom', VISIT_02_SYMPTOM_MAIN: 'digestion' }, screens: 24, taps: 49 },
  { name: 'pain_fast · 요통(남성)', seed: { ...MALE, VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' }, screens: 24, taps: 48 },
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

/*
 * LBP_15/LBP_16 (2026-09-19) — 목표 task anchor의 두 가지 계약.
 *
 * (1) LBP_15의 9개 값은 원장 화면 목표 기능 chip(`lbp_tf_*`)과 1:1이다.
 *     한쪽만 늘면 매핑이 조용히 깨지므로 개수를 고정한다.
 * (2) LBP_16을 PSFS라고 부르지 않는다. PSFS는 3항목 평균이고 보고된 MID/MCID
 *     1.2~1.3은 어깨·상지 유래이며 요추 값이 없다(DR_07_재활_v1.md §1-4).
 *     단일 항목 변형이 그 근거를 물려받은 것처럼 읽히면 안 된다. 주석에서
 *     "PSFS라고 부르지 않는다"고 설명하는 것은 허용하고, **따옴표 안의 문자열
 *     리터럴**(= 화면·EMR에 나갈 수 있는 텍스트)만 금지한다.
 */
{
  const lbp15 = ALL_QUESTIONS.find((q) => q.id === 'LBP_15')
  const lbp16 = ALL_QUESTIONS.find((q) => q.id === 'LBP_16')
  check('LBP_15 exists and is a 9-option single choice (lbp_tf_* chips 9개와 1:1)',
    lbp15 != null && lbp15.input === 'single_choice' && (lbp15.options ?? []).length === 9)
  check('LBP_16 exists and is a 0~10 numeric scale',
    lbp16 != null && lbp16.input === 'numeric_scale' && lbp16.scale?.min === 0 && lbp16.scale?.max === 10)
  check('LBP_16 is only asked after LBP_15 is answered (빈 목표 task에 점수를 매기지 않는다)',
    lbp16.showIf({ VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' }) === false
    && lbp16.showIf({ VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis', LBP_15: 'WALKING' }) === true)

  const surfaced = [lbp15.question, lbp16.question, lbp16.scale.minLabel, lbp16.scale.maxLabel,
    ...(lbp15.options ?? []).map((o) => o.label)]
  check('LBP_15/16의 환자 노출 문구에 PSFS가 없다', surfaced.every((t) => !/PSFS/i.test(t)))

  const SOURCES = [
    '../src/spec/coreSpec.ts',
    '../src/spec/detailCheckQuestions.ts',
    '../src/doctor/workspace/detailCheckBaseline.ts',
    '../src/doctor/workspace/lbpTargetFunction.ts',
  ].map((rel) => readFileSync(new URL(rel, import.meta.url), 'utf8'))
  // 주석은 걷어내고 본다 — 설명하는 주석은 허용, 화면·EMR에 나갈 수 있는
  // 코드 쪽 문자열만 금지. (주석 제거가 URL의 `//`까지 자를 수 있으나 이
  // 검사는 특정 단어의 존재만 보므로 판정에 영향이 없다.)
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  const quotedPsfs = /['"`][^'"`\n]*PSFS[^'"`\n]*['"`]/i
  check('목표 기능 경로의 소스 어디에도 PSFS가 문자열 리터럴로 없다',
    SOURCES.every((src) => !quotedPsfs.test(stripComments(src))))
  // 이 단언이 살아 있는지(= 실제로 잡는지) 같은 규칙으로 확인한다.
  check('PSFS 가드가 실제로 동작한다(양성 대조)', quotedPsfs.test("const label = 'PSFS 점수'"))
}

console.log(`\n${passed} questionnaire-volume assertions passed.`)
