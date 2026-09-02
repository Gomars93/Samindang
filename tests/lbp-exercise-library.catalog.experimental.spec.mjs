import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LBP_EXERCISE_DOMAIN_META,
  LBP_EXERCISE_LIBRARY,
  LBP_EXERCISE_LIBRARY_SOURCE,
  getLbpExerciseById,
  listLbpExercisesByDomain,
} from './.lbp-exercise-library-v01-bundle.mjs'

const catalogSource = readFileSync(
  'src/doctor/workspace/lbpExerciseLibrary.v01.experimental.ts',
  'utf8',
)
assert.doesNotMatch(catalogSource, /DoctorPayload/)
assert.doesNotMatch(catalogSource, /evaluateLbp/)
assert.doesNotMatch(catalogSource, /RehabSuggestion/)

assert.equal(LBP_EXERCISE_LIBRARY_SOURCE.explicitDomainCount, 13)
assert.equal(LBP_EXERCISE_LIBRARY_SOURCE.explicitExerciseCount, 57)
assert.equal(LBP_EXERCISE_LIBRARY_SOURCE.migrationStatus, 'CATALOG_ONLY_NO_RECOMMENDER')
assert.equal(Object.keys(LBP_EXERCISE_DOMAIN_META).length, 13)
assert.equal(LBP_EXERCISE_LIBRARY.length, 57)

const ids = LBP_EXERCISE_LIBRARY.map((item) => item.id)
assert.equal(new Set(ids).size, ids.length, 'catalog IDs must be unique')
for (const id of ids) {
  assert.match(id, /^LBP_[A-Z]+(?:_[A-Z]+)*_\d{2}$/)
}

const expectedDomainCounts = {
  ACTIVITY_AEROBIC: 4,
  LUMBAR_MOBILITY: 5,
  DIRECTIONAL_RESPONSE: 4,
  HIP_MOBILITY: 4,
  DEEP_TRUNK_ACTIVATION: 5,
  TRUNK_CONTROL: 5,
  TRUNK_ENDURANCE: 5,
  HIP_STRENGTH: 5,
  FUNCTIONAL_STRENGTH: 5,
  LOAD_CAPACITY: 5,
  NEURAL_MOBILITY: 3,
  GRADED_EXPOSURE: 4,
  MIND_BODY_REGULATION: 3,
}

for (const [domain, count] of Object.entries(expectedDomainCounts)) {
  assert.equal(
    listLbpExercisesByDomain(domain).length,
    count,
    `${domain} source inventory count drifted`,
  )
}

const birdDog = getLbpExerciseById('LBP_TRUNK_03')
assert.ok(birdDog, 'source-preserved LBP_TRUNK_03 must exist')
assert.equal(birdDog.canonicalName, 'Bird-dog')
assert.equal(birdDog.domain, 'TRUNK_CONTROL')
assert.equal(birdDog.sourceDetail, 'EXPLICIT_OBJECT_EXAMPLE')
assert.equal(birdDog.level, 2)
assert.equal(birdDog.startingDoseKo, '예: 5회 × 2세트 - 환자상태 따라 수정')
assert.equal(birdDog.progressionKo, '반복수/hold/부하 증가')
assert.equal(birdDog.regressionKo, '팔만/다리만/지지면 확대')
assert.deepEqual(birdDog.targetFunctions, ['LIFTING', 'STANDING', 'WORK'])
assert.deepEqual(birdDog.stopReviewKo, [
  '새 신경증상',
  '뚜렷한 distal symptom 증가',
  '견디기 어려운 악화',
])
assert.equal(birdDog.videoSpecKo, '20~40초, 한 운동 한 영상')
assert.deepEqual(birdDog.sourceLabels, ['bird-dog progression', 'Bird-dog Level 2'])

for (const item of LBP_EXERCISE_LIBRARY) {
  if (item.id === 'LBP_TRUNK_03') continue
  assert.equal(item.sourceDetail, 'EXPLICIT_NAME_ONLY')
  assert.equal(item.level, null, `${item.id} must not invent a level`)
  assert.equal(item.startingDoseKo, null, `${item.id} must not invent a dose`)
  assert.equal(item.progressionKo, null, `${item.id} must not invent progression`)
  assert.equal(item.regressionKo, null, `${item.id} must not invent regression`)
  assert.equal(item.targetFunctions, null, `${item.id} must not invent target-function mapping`)
  assert.equal(item.stopReviewKo, null, `${item.id} must not invent stop/review rules`)
  assert.equal(item.videoSpecKo, null, `${item.id} must not invent video metadata`)
}

const requiredLiteralNames = [
  '걷기 5~10분',
  'pelvic tilt',
  'prone lying',
  'hip flexor',
  'abdominal brace',
  'dead bug',
  'bridge',
  'clamshell',
  'sit-to-stand',
  'deadlift pattern',
  'sciatic slider',
  '숙이기',
  '호흡·이완',
]
const names = new Set(LBP_EXERCISE_LIBRARY.map((item) => item.canonicalName))
for (const name of requiredLiteralNames) {
  assert.ok(names.has(name), `source exercise missing: ${name}`)
}

console.log('LBP Exercise Library catalog migration: 57/57 explicit source entries preserved')
console.log('13/13 source domains preserved')
console.log('LBP_TRUNK_03 Bird-dog object example preserved')
console.log('No unsourced item-level prescription fields were populated')
