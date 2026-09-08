// LBP evaluateLbpExerciseEligibility — 안전 게이트 규칙표 테스트.
// Run via `npm run test:lbp-exercise-eligibility`.
//
// 2026-09-05 (원장 결정): 준비조건(capability) 게이트가 제거되면서 이 스펙의
// §2 일부와 §3 전체(RF-4/5/6/7/7b/10 = hard/regressible 재분류)가 사라졌다.
// 그 RF-* 임상 판단 자체는 폐기된 것이 아니라 `lbpExerciseCoreMetadata.ts`의
// `startingCriteriaKo` 한국어 원문에 그대로 있고(중복 표현이었다), 이제 후보
// 카드에 표시된다 — §8이 그 대체 경로가 실제로 내용을 나르는지 검증한다.
// 이유: `lbpExerciseEligibility.ts` 헤더, `DECISIONS.md` 2026-09-05.
//
// 남은 게이트 4개(질환 안전 / 신경 / 원위 악화 / 방향성)는 한 줄도 바뀌지
// 않았고 아래 §1·2·4·5·6이 그대로 지킨다. RF-1(미확인을 안정으로 가정하지
// 않는다)은 살아 있다.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LBP_EXERCISE_ELIGIBILITY_RULES,
  evaluateLbpExerciseEligibility,
  getLbpExerciseEligibilityRule,
} from './.lbp-exercise-eligibility-bundle.mjs'
import { LBP_CORE_EXERCISE_METADATA } from './.lbp-exercise-core-metadata-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const SOURCE = readFileSync(new URL('../src/doctor/workspace/lbpExerciseEligibility.ts', import.meta.url), 'utf8')
// 주석은 왜 게이트를 없앴는지 설명해야 하므로 capability를 언급한다 —
// 금지되는 것은 "코드가 읽는 것"이다(lbp-exercise-stage.spec.mjs와 같은 관례).
const CODE_ONLY = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const ALL_IDS = LBP_EXERCISE_ELIGIBILITY_RULES.map((r) => r.exerciseId)

function context(overrides = {}) {
  return {
    routineCareAllowed: true,
    neuroStatus: 'STABLE',
    distalSymptomResponse: 'STABLE_OR_IMPROVING',
    directionalResponse: 'NO_CLEAR_DIRECTION',
    ...overrides,
  }
}
const states = (ctx) => ALL_IDS.map((id) => evaluateLbpExerciseEligibility(id, ctx).state)

// ---------- 0. structural ----------

test('20 rules, unique ids, getLbpExerciseEligibilityRule matches the table', () => {
  assert.equal(LBP_EXERCISE_ELIGIBILITY_RULES.length, 20)
  assert.equal(new Set(ALL_IDS).size, 20)
  for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
    assert.deepEqual(getLbpExerciseEligibilityRule(rule.exerciseId), rule)
  }
  assert.equal(getLbpExerciseEligibilityRule('NOT_A_REAL_ID'), undefined)
})

test('RF-11(b): rule id set === LBP_CORE_EXERCISE_METADATA id set', () => {
  assert.deepEqual([...ALL_IDS].sort(), LBP_CORE_EXERCISE_METADATA.map((m) => m.exerciseId).sort())
})

test('an unknown exercise id still throws (fail-fast, D8) rather than being silently eligible', () => {
  assert.throws(() => evaluateLbpExerciseEligibility('NOT_A_REAL_ID', context()), /No Core-20 eligibility rule/)
})

// ---------- 1. safety dominance ----------

test('routineCareAllowed=false -> STOP_REVIEW for all 20, unconditionally', () => {
  const out = states(context({ routineCareAllowed: false }))
  assert.deepEqual([...new Set(out)], ['STOP_REVIEW'])
})

test('disease safety outranks everything: false + neuro UNKNOWN + distal WORSENING is still STOP_REVIEW, never DEFER', () => {
  const out = states(context({ routineCareAllowed: false, neuroStatus: 'UNKNOWN', distalSymptomResponse: 'WORSENING' }))
  assert.deepEqual([...new Set(out)], ['STOP_REVIEW'])
})

// ---------- 2. RF-1: UNKNOWN is never silently treated as ready ----------

test('RF-1: neuroStatus UNKNOWN -> DEFER_NOT_READY for all 19 requiresStableNeuro rules; only LBP_REG_01 proceeds', () => {
  const ctx = context({ neuroStatus: 'UNKNOWN' })
  const deferred = ALL_IDS.filter((id) => evaluateLbpExerciseEligibility(id, ctx).state === 'DEFER_NOT_READY')
  const ready = ALL_IDS.filter((id) => evaluateLbpExerciseEligibility(id, ctx).state === 'START_AS_WRITTEN')
  assert.equal(deferred.length + ready.length, 20)
  assert.deepEqual(ready, ['LBP_REG_01'], 'only the breathing/relaxation exercise is exempt (requiresStableNeuro:false)')
  assert.ok(!deferred.includes('LBP_REG_01'))
  // the DEFER reason names the neuro gate, not something else
  assert.match(evaluateLbpExerciseEligibility('LBP_LUMBAR_03', ctx).reasonsKo[0], /신경학적 상태가 미확인/)
})

test('RF-1 (strongest form): a fully clear context EXCEPT neuroStatus UNKNOWN still defers — nothing else can promote it', () => {
  const r = evaluateLbpExerciseEligibility('LBP_LUMBAR_03', context({ neuroStatus: 'UNKNOWN' }))
  assert.equal(r.state, 'DEFER_NOT_READY')
})

test("RF-1 source guard: the UNKNOWN branch is a real branch, not folded into 'STABLE'", () => {
  assert.match(SOURCE, /context\.neuroStatus === 'UNKNOWN'/)
  assert.ok(!/neuroStatus !== 'NEW_OR_WORSENING'/.test(SOURCE), 'must never test the negation instead (that would let UNKNOWN pass)')
})

// ---------- 3. the capability gate is gone (replaced path) ----------

test('2026-09-05: the eligibility context no longer has a capabilities field, and the source never reads one', () => {
  assert.ok(!/capabilit/i.test(CODE_ONLY), 'no capability identifier survives in the gate code')
  assert.ok(!CODE_ONLY.includes('hardRequirements') && !CODE_ONLY.includes('regressibleRequirements'))
  assert.ok(!CODE_ONLY.includes('START_WITH_REGRESSION'), 'the regression state came only from a capability NO')
  assert.ok(/capabilit/i.test(SOURCE), '주석에는 왜 없앴는지가 남아 있어야 한다 (조용한 삭제 금지)')
})

test('2026-09-05: passing a stray capabilities object changes nothing (the gate is genuinely gone, not just unused by the adapter)', () => {
  const withStray = context({ capabilities: Object.fromEntries(
    ['SAFE_WALKING', 'QUADRUPED_TOLERATED', 'LOAD_READY'].map((k) => [k, 'NO']),
  ) })
  assert.deepEqual(states(withStray), states(context()), 'a NO on every capability must not change a single verdict')
})

test('2026-09-05: with the 4 safety gates clear, all 17 non-directional exercises are START_AS_WRITTEN with no tapping at all', () => {
  const ctx = context()
  const ready = ALL_IDS.filter((id) => evaluateLbpExerciseEligibility(id, ctx).state === 'START_AS_WRITTEN')
  const deferred = ALL_IDS.filter((id) => evaluateLbpExerciseEligibility(id, ctx).state === 'DEFER_NOT_READY')
  assert.equal(ready.length, 17)
  assert.deepEqual(deferred.sort(), ['LBP_DIR_02', 'LBP_DIR_03', 'LBP_DIR_04'], 'only the direction-specific three wait on an observed response')
})

// ---------- 4. directional rules ----------

test('directional exercise requires a favorable observed response; no diagnosis is inferred', () => {
  for (const [id, needed, other] of [
    ['LBP_DIR_02', 'EXTENSION_FAVORABLE', 'FLEXION_FAVORABLE'],
    ['LBP_DIR_03', 'EXTENSION_FAVORABLE', 'FLEXION_FAVORABLE'],
    ['LBP_DIR_04', 'FLEXION_FAVORABLE', 'EXTENSION_FAVORABLE'],
  ]) {
    assert.equal(evaluateLbpExerciseEligibility(id, context({ directionalResponse: needed })).state, 'START_AS_WRITTEN')
    assert.equal(evaluateLbpExerciseEligibility(id, context({ directionalResponse: other })).state, 'DEFER_NOT_READY')
    for (const v of ['NOT_ASSESSED', 'UNCLEAR', 'NO_CLEAR_DIRECTION']) {
      assert.equal(evaluateLbpExerciseEligibility(id, context({ directionalResponse: v })).state, 'DEFER_NOT_READY', `${id}/${v}`)
    }
  }
})

test('the unassessed/unclear directional reason differs from the mismatch reason (the clinician is told which)', () => {
  const unassessed = evaluateLbpExerciseEligibility('LBP_DIR_02', context({ directionalResponse: 'NOT_ASSESSED' }))
  const mismatch = evaluateLbpExerciseEligibility('LBP_DIR_02', context({ directionalResponse: 'FLEXION_FAVORABLE' }))
  assert.match(unassessed.reasonsKo[0], /아직 확인되지 않았습니다/)
  assert.match(mismatch.reasonsKo[0], /맞지 않습니다/)
})

// ---------- 5. distal worsening ----------

test('distal worsening triggers STOP_REVIEW for every exercise that monitors it', () => {
  const ctx = context({ distalSymptomResponse: 'WORSENING' })
  for (const id of ALL_IDS) {
    const want = getLbpExerciseEligibilityRule(id).stopOnDistalWorsening ? 'STOP_REVIEW' : 'START_AS_WRITTEN'
    assert.equal(evaluateLbpExerciseEligibility(id, ctx).state, want, id)
  }
})

test('RF-12: distal UNKNOWN does NOT stop an exercise (no response recorded yet is not a worsening response)', () => {
  assert.equal(evaluateLbpExerciseEligibility('LBP_NEURAL_01', context({ distalSymptomResponse: 'UNKNOWN' })).state, 'START_AS_WRITTEN')
  assert.match(SOURCE, /distalSymptomResponse === 'WORSENING'/, 'the gate branches on the literal only')
})

test('LBP_REG_01 is the intended exception: stopOnDistalWorsening=false, requiresStableNeuro=false', () => {
  const rule = getLbpExerciseEligibilityRule('LBP_REG_01')
  assert.equal(rule.stopOnDistalWorsening, false)
  assert.equal(rule.requiresStableNeuro, false)
  assert.equal(
    evaluateLbpExerciseEligibility('LBP_REG_01', context({ neuroStatus: 'UNKNOWN', distalSymptomResponse: 'WORSENING' })).state,
    'START_AS_WRITTEN',
  )
  assert.equal(
    evaluateLbpExerciseEligibility('LBP_REG_01', context({ routineCareAllowed: false })).state,
    'STOP_REVIEW',
    'disease safety still outranks even this exemption',
  )
})

// ---------- 6. new/worsening neuro ----------

test('new/worsening neuro blocks routine exercise rules (LBP_REG_01 exempt)', () => {
  const ctx = context({ neuroStatus: 'NEW_OR_WORSENING' })
  for (const id of ALL_IDS) {
    const want = getLbpExerciseEligibilityRule(id).requiresStableNeuro ? 'STOP_REVIEW' : 'START_AS_WRITTEN'
    assert.equal(evaluateLbpExerciseEligibility(id, ctx).state, want, id)
  }
})

// ---------- 7. no ranking, no diagnosis ----------

test('the gate module invents no diagnosis and no score', () => {
  assert.ok(!/디스크|협착|추간판|herniat|stenosis/i.test(SOURCE))
  assert.ok(!/score|weight|rank/i.test(CODE_ONLY))
})

// ---------- 8. 대체 경로: startingCriteriaKo가 실제로 내용을 나르는가 ----------
// (CLAUDE.md "지운 경로 1개당 단언 1개" — capability enum이 나르던 것을
//  이제 이 필드가 나른다. 비어 있으면 원장이 읽을 시작 조건이 사라진다.)

test('replaced path: every Core-20 row carries a non-empty startingCriteriaKo (this is what the removed capability enum was a copy of)', () => {
  for (const meta of LBP_CORE_EXERCISE_METADATA) {
    assert.ok(Array.isArray(meta.startingCriteriaKo), `${meta.exerciseId}: startingCriteriaKo must be an array`)
    assert.ok(meta.startingCriteriaKo.length > 0, `${meta.exerciseId}: startingCriteriaKo must not be empty`)
    for (const line of meta.startingCriteriaKo) {
      assert.ok(typeof line === 'string' && line.trim().length >= 5, `${meta.exerciseId}: "${line}" is too short to be a real criterion`)
    }
  }
})

test('replaced path (non-vacuous): the specific clinical content the removed RF-* capability assignments encoded is present in the Korean criteria', () => {
  const by = (id) => LBP_CORE_EXERCISE_METADATA.find((m) => m.exerciseId === id).startingCriteriaKo.join(' ')
  // RF-5 BALANCE_WITH_SUPPORT on FUNC_01 -> fall/orthostatic wording
  assert.match(by('LBP_FUNC_01'), /낙상|기립성/)
  // RF-10 NATURAL_BREATHING_TOLERATED on DEEP_TRUNK_01
  assert.match(by('LBP_DEEP_TRUNK_01'), /호흡/)
  // RF-7b LOAD_READY on LOAD_02
  assert.match(by('LBP_LOAD_02'), /고부하|irritability/)
  // RF-4 CAN_SELF_PACE on ACT_02
  assert.match(by('LBP_ACT_02'), /조절/)
  // RF-6 QUADRUPED_TOLERATED on TRUNK_03
  assert.match(by('LBP_TRUNK_03'), /네발기기/)
})

console.log(`\n${passed} eligibility tests passed.`)
