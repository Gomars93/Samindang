// LBP v1 Batch 2 (G6) — Core-20 clinical vignette observation harness.
// Run via `npm run test:lbp-exercise-core20-vignettes`.
//
// Ported from `tests/lbp-exercise-core20.vignettes.experimental.spec.mjs` on
// `origin/claude/feat-lbp-action-adaptive-engine-prototype`.
//
// RF-11(c) (`docs/LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md`,
// finding D3): this file's disposition values are OBSERVATION-ONLY CLINICAL
// EXPECTATIONS, not cross-checked against `evaluateLbpExerciseEligibility`
// by this test suite — it never imports or calls the eligibility engine.
// This is a deliberate choice (not an oversight left silently wrong, per
// RF-11(c)'s explicit requirement): building a full
// `LbpExerciseEligibilityContext` per vignette below would require inventing
// capability/directional-response/neuro values the vignettes' prose does not
// actually specify, which risks fabricating exactly the kind of
// unauthorized clinical interpretation this codebase's rules forbid. The two
// disposition values the Opus bounded validation found the rule TABLE
// literally cannot produce (D3: `LBP_ACT_01` as `REGRESS` — it has no
// regressible requirements even after every RF-* fix, by design: both its
// requirements are safety preconditions, not substitutable deficits) are
// corrected below to `DEFER_NOT_READY`, per RF-11(c)'s explicit resolution
// ("ACT_01의 hard 두 개는 안전 조건이므로 규칙을 풀지 않는다"). The other
// flagged mismatch (`LBP_LOAD_02` as `REGRESS`, `tests` line ~132) is no
// longer a mismatch at all after RF-7b (`LOAD_READY` moved to regressible),
// so no vignette edit was needed there — kept unchanged from the research
// branch and left as a live cross-check against
// `tests/lbp-exercise-eligibility.spec.mjs`'s own RF-7b test.
//
// What this file DOES verify mechanically: every vignette references only
// real catalog/Core-20 ids, every Core-20 item is exercised by at least one
// vignette, dispositions come from a closed set, and a
// `routineExerciseAllowed: false` vignette never contains a START/REGRESS
// observation.

import assert from 'node:assert/strict'
const catalogModule = await import('./.lbp-exercise-library-bundle.mjs')
const coreModule = await import('./.lbp-exercise-core-metadata-bundle.mjs')

const { LBP_EXERCISE_LIBRARY, getLbpExerciseById } = catalogModule
const { LBP_CORE_EXERCISE_METADATA, getLbpCoreExerciseMetadata } = coreModule

/**
 * OBSERVATION-ONLY CLINICAL VIGNETTE HARNESS.
 *
 * This file is NOT a recommender and does not encode patient -> exercise ranking.
 * It asks a narrower question: can the Core-20 metadata safely express common
 * primary-care dispositions without inventing a diagnosis or forcing progression?
 *
 * Dispositions are deliberately visit-local observations:
 * - START_AS_WRITTEN: metadata starting criteria/dose are plausible for this vignette.
 * - START_WITH_REGRESSION: exercise family may be usable, but only through its stored regression.
 * - DEFER_NOT_READY: do not start now; this is not a negative diagnosis and not a permanent exclusion.
 * - STOP_REVIEW: the stored stop/review logic should interrupt that exercise or routine exercise pathway.
 * - NOT_RELEVANT_TODAY: retained in the catalog but not a current management target in this vignette.
 *
 * These labels are test-harness observations only. They are not production enums.
 */
const D = {
  START: 'START_AS_WRITTEN',
  REGRESS: 'START_WITH_REGRESSION',
  DEFER: 'DEFER_NOT_READY',
  STOP: 'STOP_REVIEW',
  NOT_TODAY: 'NOT_RELEVANT_TODAY',
}

const vignettes = [
  {
    id: 'V01_SIMPLE_AXIAL_HIGH_IRRITABILITY',
    summaryKo: '급성 축성 요통, 하지증상 없음, 작은 움직임은 가능하지만 irritability 높음',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_LUMBAR_02', D.REGRESS, '작은 범위 mobility로 시작 가능하되 범위 축소가 필요'],
      ['LBP_REG_01', D.START, '긴장 조절용 저부하 option'],
      ['LBP_FUNC_05', D.DEFER, 'hip hinge 기술 연습은 현재 irritability가 높아 뒤로 미룸'],
      ['LBP_LOAD_02', D.DEFER, '고부하 복귀 단계는 아직 준비되지 않음'],
    ],
  },
  {
    id: 'V02_EXTENSION_RESPONSE_FAVORABLE',
    summaryKo: '하지증상이 있으나 objective neuro 안정, 신전 반복에서 증상이 몸쪽으로 이동',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_DIR_02', D.START, '낮은 신전 노출에서 원위부 악화 없음'],
      ['LBP_DIR_03', D.START, '반복 신전의 유리한 반응을 즉시 재확인 가능'],
      ['LBP_DIR_04', D.NOT_TODAY, '굴곡 방향을 병명 때문에 자동 병행하지 않음'],
      ['LBP_NEURAL_01', D.DEFER, '신경가동은 별도 필요성이 확인되기 전 자동 추가하지 않음'],
    ],
  },
  {
    id: 'V03_FLEXION_RESPONSE_FAVORABLE',
    summaryKo: '굴곡에서 기능이 편해지고 신전에서는 하지증상이 더 아래로 증가',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_DIR_04', D.START, '굴곡 방향 반응이 유리하고 신경학적 악화 없음'],
      ['LBP_DIR_02', D.DEFER, '이미 신전에서 원위부 증가가 관찰되어 시작조건 불충족'],
      ['LBP_DIR_03', D.DEFER, 'repeated extension을 진단명 때문에 강행하지 않음'],
    ],
  },
  {
    id: 'V04_STABLE_RADICULAR_SLIDER',
    summaryKo: '하지 저림은 있으나 objective neuro 안정, 부드러운 slider에서 증상 누적 없음',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_NEURAL_01', D.START, 'slider 범위에서 원위부 증상이 누적되지 않음'],
      // RF-11(c): was D.REGRESS ("보행은 가능하나 짧은 시간부터 노출") — the
      // rule table cannot produce REGRESS for ACT_01 (both requirements are
      // hard safety preconditions, unchanged by any RF-* fix). This
      // vignette's actual clinical intent — start with a shorter/interval
      // walking pattern — is exactly what ACT_02 (interval walking, D.START
      // below is not claimed here since walking tolerance is not this
      // vignette's focus) exists for; ACT_01 itself is correctly DEFER
      // until continuous walking capacity is confirmed.
      ['LBP_ACT_01', D.DEFER, '연속 걷기 능력이 아직 확인되지 않아 보류 — 대신 ACT_02(interval walking) 경로를 우선 고려'],
      ['LBP_LOAD_02', D.DEFER, '신경증상 안정성과 기능부하가 더 확보되기 전 고부하 복귀는 보류'],
    ],
  },
  {
    id: 'V05_NEW_PROGRESSIVE_MOTOR_DEFICIT',
    summaryKo: '새로운 진행성 객관적 근력저하가 확인된 follow-up',
    routineExerciseAllowed: false,
    observations: [
      ['LBP_NEURAL_01', D.STOP, '새로운/진행하는 신경증상은 stop-review'],
      ['LBP_DIR_03', D.STOP, 'routine directional exercise보다 safety reassessment 우선'],
      ['LBP_ACT_01', D.STOP, '운동 지속 여부보다 safety/referral 판단이 우선'],
    ],
  },
  {
    id: 'V06_WALKING_LIMITED_INTERVAL_TOLERANT',
    summaryKo: '연속 보행은 제한되지만 짧은 구간 후 휴식하면 다시 걸을 수 있음',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_ACT_02', D.START, 'interval walking의 시작조건과 직접 부합'],
      // RF-11(c): was D.REGRESS ("연속 5~10분보다 짧은 구간/휴식으로 회귀")
      // — same reasoning as V04 above: ACT_01 cannot be START_WITH_REGRESSION
      // under the rule table; this vignette's continuous-walking capacity is
      // explicitly limited, so ACT_01 stays DEFER while ACT_02 (started
      // above) is the exercise that actually fits.
      ['LBP_ACT_01', D.DEFER, '연속 보행이 아직 제한적이라 보류 — ACT_02가 현재 대체 경로'],
      ['LBP_HIP_STR_03', D.NOT_TODAY, '보행제한만으로 hip strength를 자동 처방하지 않음'],
    ],
  },
  {
    id: 'V07_HIP_CONTRIBUTION_WITH_BALANCE_LIMIT',
    summaryKo: '전방 고관절 당김/제한이 기능에 기여, 서기는 가능하지만 한손 지지 필요',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_HIP_MOB_01', D.START, '지지물을 사용한 hip flexor mobility 가능'],
      ['LBP_HIP_STR_03', D.REGRESS, '양손 지지·작은 범위로 regression 필요'],
      ['LBP_LOAD_02', D.NOT_TODAY, '고관절 단서만으로 deadlift pattern을 자동 연결하지 않음'],
    ],
  },
  {
    id: 'V08_DECONDITIONED_SIT_TO_STAND',
    summaryKo: '고령/저체력, 높은 의자에서는 일어날 수 있으나 손 지지가 필요',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_FUNC_01', D.REGRESS, '높은 의자와 손 지지로 기능 연습 가능'],
      ['LBP_DEEP_TRUNK_01', D.START, '저강도 호흡 가능한 brace는 시작 가능'],
      ['LBP_TRUNK_END_01', D.DEFER, 'bridge는 현재 기능우선순위와 수행능력상 뒤로 미룸'],
    ],
  },
  {
    id: 'V09_LOW_LOAD_TRUNK_CONTROL',
    summaryKo: '급성기는 지나고 supine 저부하 control 가능, quadruped 단일사지에서 약간 불안정',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_DEEP_TRUNK_03', D.START, 'heel slide에서 증상 안정'],
      ['LBP_TRUNK_03', D.REGRESS, 'Bird-dog은 팔만/다리만으로 시작'],
      ['LBP_TRUNK_END_01', D.START, '작은 hip extension에서 증상 안정'],
    ],
  },
  {
    id: 'V10_LIFTING_RETURN_LOW_IRRITABILITY',
    summaryKo: '숙이기/들기가 목표기능, 무부하 hip hinge 가능하고 증상 irritability 낮음',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_FUNC_05', D.START, 'hip hinge 기술연습 시작조건 충족'],
      ['LBP_LOAD_02', D.REGRESS, '높은 시작위치/가벼운 부하로 load-capacity 진입'],
      ['LBP_EXPOSURE_01', D.START, '숙이기 회피를 낮은 범위 controlled exposure로 다룸'],
    ],
  },
  {
    id: 'V11_PROLONGED_SITTING_AVOIDANCE',
    summaryKo: '짧은 앉기는 가능하지만 오래 앉기를 회피, 자세변경 후 회복 가능',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_EXPOSURE_03', D.START, '현재 허용시간보다 짧은 sitting exposure 가능'],
      ['LBP_REG_01', D.START, '노출 전후 regulation option으로 사용 가능'],
      ['LBP_DIR_04', D.NOT_TODAY, '오래 앉기 문제만으로 flexion directional exercise를 자동 연결하지 않음'],
    ],
  },
  {
    id: 'V12_SLEEP_TURNING_MOBILITY',
    summaryKo: '밤에 돌아눕기/침상 움직임에서 불편, 바로누워 작은 회전은 허용',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_LUMBAR_03', D.START, '작은 lumbar rotation이 증상 누적 없이 가능'],
      ['LBP_REG_01', D.START, '수면 전 긴장 조절 option'],
      ['LBP_LOAD_02', D.NOT_TODAY, '침상 기능문제와 무관한 고부하 운동은 현재 target 아님'],
    ],
  },
  {
    id: 'V13_WORK_ENDURANCE_RECOVERY',
    summaryKo: '서서 일하기/걷기 복귀가 목표, 균형 안정, 낮은 부하에서 증상 안정',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_HIP_STR_03', D.START, 'standing hip abduction 수행 가능'],
      ['LBP_TRUNK_03', D.START, 'quadruped control 안정'],
      ['LBP_ACT_01', D.START, '연속 5~10분 보행 허용'],
      ['LBP_FUNC_01', D.START, '일상 sit-to-stand capacity 유지/향상'],
    ],
  },
  {
    id: 'V14_DISTAL_SYMPTOM_WORSENS_DURING_EXERCISE',
    summaryKo: '운동 반복 중 하지증상이 더 아래로 진행하고 세션 종료 후에도 남음',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_DIR_03', D.STOP, 'repeated extension 중 peripheralization이 누적'],
      ['LBP_NEURAL_01', D.STOP, 'slider 후 원위부 증상 증가가 지속'],
      ['LBP_EXPOSURE_01', D.STOP, 'graded exposure 중 원위부 진행은 계속 밀어붙일 신호가 아님'],
      ['LBP_DEEP_TRUNK_01', D.NOT_TODAY, '다른 운동으로 즉시 대체하기보다 먼저 악화 반응을 재평가'],
    ],
  },
  {
    id: 'V15_SIMPLE_MOVEMENT_RECOVERY',
    summaryKo: '하지증상 없이 회복 중, cat-camel/bridge/기능동작이 모두 안정적',
    routineExerciseAllowed: true,
    observations: [
      ['LBP_LUMBAR_02', D.START, '편안한 mobility 반복 가능'],
      ['LBP_TRUNK_END_01', D.START, 'bridge에서 증상 누적 없음'],
      ['LBP_FUNC_05', D.START, 'hip hinge 기술을 기능복귀에 연결 가능'],
    ],
  },
]

const validDispositions = new Set(Object.values(D))
const coreIds = new Set(LBP_CORE_EXERCISE_METADATA.map((item) => item.exerciseId))
const observedCoreIds = new Set()
const dispositionCounts = new Map()

for (const vignette of vignettes) {
  assert.ok(vignette.id.startsWith('V'))
  assert.ok(vignette.summaryKo.length > 10)
  assert.ok(vignette.observations.length >= 3)

  const seenInVignette = new Set()
  for (const [exerciseId, disposition, rationaleKo] of vignette.observations) {
    assert.equal(validDispositions.has(disposition), true)
    assert.equal(seenInVignette.has(exerciseId), false, `${vignette.id}: duplicate ${exerciseId}`)
    seenInVignette.add(exerciseId)
    observedCoreIds.add(exerciseId)

    const catalog = getLbpExerciseById(exerciseId)
    const metadata = getLbpCoreExerciseMetadata(exerciseId)
    assert.ok(catalog, `${vignette.id}: unknown catalog id ${exerciseId}`)
    assert.ok(metadata, `${vignette.id}: vignette may reference only Core-20 metadata: ${exerciseId}`)
    assert.ok(rationaleKo.length >= 10)

    if (disposition === D.START) {
      assert.ok(metadata.startingCriteriaKo.length >= 2)
      assert.ok(metadata.startingDoseKo.length > 0)
      assert.ok(metadata.acceptableResponseKo.length >= 2)
    }
    if (disposition === D.REGRESS) {
      assert.ok(metadata.regressionKo.length > 0)
    }
    if (disposition === D.STOP) {
      assert.ok(metadata.stopReviewKo.length >= 2)
    }

    dispositionCounts.set(disposition, (dispositionCounts.get(disposition) ?? 0) + 1)
  }

  if (!vignette.routineExerciseAllowed) {
    const forbidden = vignette.observations.filter(([, disposition]) =>
      [D.START, D.REGRESS].includes(disposition),
    )
    assert.equal(
      forbidden.length,
      0,
      `${vignette.id}: routine exercise safety lock must not contain START/REGRESS observations`,
    )
  }
}

// Every deep-metadata exercise must appear in at least one realistic observation.
assert.equal(observedCoreIds.size, coreIds.size)
for (const id of coreIds) {
  assert.equal(observedCoreIds.has(id), true, `Core-20 item never stress-observed: ${id}`)
}

// The vignette layer must not create new exercises or silently promote non-Core catalog items.
assert.equal(LBP_EXERCISE_LIBRARY.length, 57)
assert.equal([...observedCoreIds].every((id) => coreIds.has(id)), true)

// Directional / neural worsening must remain stoppable rather than being interpreted as a progression signal.
for (const vignetteId of ['V14_DISTAL_SYMPTOM_WORSENS_DURING_EXERCISE']) {
  const vignette = vignettes.find((item) => item.id === vignetteId)
  for (const id of ['LBP_DIR_03', 'LBP_NEURAL_01']) {
    const observation = vignette.observations.find(([exerciseId]) => exerciseId === id)
    assert.equal(observation?.[1], D.STOP)
  }
}

// A favourable directional response must not automatically add the opposite direction or neural mobility.
const extensionFav = vignettes.find((item) => item.id === 'V02_EXTENSION_RESPONSE_FAVORABLE')
assert.equal(extensionFav.observations.find(([id]) => id === 'LBP_DIR_04')?.[1], D.NOT_TODAY)
assert.equal(extensionFav.observations.find(([id]) => id === 'LBP_NEURAL_01')?.[1], D.DEFER)

// High-load work must remain deferrable in high-irritability states and regressible during return-to-load.
const acute = vignettes.find((item) => item.id === 'V01_SIMPLE_AXIAL_HIGH_IRRITABILITY')
const lifting = vignettes.find((item) => item.id === 'V10_LIFTING_RETURN_LOW_IRRITABILITY')
assert.equal(acute.observations.find(([id]) => id === 'LBP_LOAD_02')?.[1], D.DEFER)
assert.equal(lifting.observations.find(([id]) => id === 'LBP_LOAD_02')?.[1], D.REGRESS)

// RF-11(c): the two rule-table-impossible dispositions Opus flagged (D3) are
// gone — ACT_01 never appears as REGRESS anywhere in this file.
for (const vignette of vignettes) {
  const act01 = vignette.observations.find(([id]) => id === 'LBP_ACT_01')
  if (act01) assert.notEqual(act01[1], D.REGRESS, `${vignette.id}: LBP_ACT_01 must never be REGRESS (RF-11(c))`)
}

console.log('LBP Core-20 clinical vignette observation suite (Batch 2, RF-11(c) fixed): PASS')
console.log(`vignettes: ${vignettes.length}`)
console.log(`Core-20 coverage: ${observedCoreIds.size}/${coreIds.size}`)
for (const disposition of Object.values(D)) {
  console.log(`${disposition}: ${dispositionCounts.get(disposition) ?? 0}`)
}
