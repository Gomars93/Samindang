import assert from 'node:assert/strict'

const catalogModule = await import('./.lbp-exercise-library-v01-bundle.mjs')
const coreModule = await import('./.lbp-exercise-core-metadata-bundle.mjs')

const {
  LBP_EXERCISE_LIBRARY,
  LBP_EXERCISE_DOMAIN_META,
  getLbpExerciseById,
} = catalogModule
const {
  LBP_CORE_EXERCISE_METADATA,
  LBP_CORE_EXERCISE_METADATA_POLICY,
  getLbpCoreExerciseMetadata,
} = coreModule

assert.equal(LBP_CORE_EXERCISE_METADATA.length, 20)
assert.equal(LBP_CORE_EXERCISE_METADATA_POLICY.itemCount, 20)
assert.equal(LBP_CORE_EXERCISE_METADATA_POLICY.rankingIncluded, false)
assert.equal(LBP_CORE_EXERCISE_METADATA_POLICY.patientMappingIncluded, false)
assert.equal(LBP_CORE_EXERCISE_METADATA_POLICY.diagnosisMappingIncluded, false)
assert.equal(LBP_CORE_EXERCISE_METADATA_POLICY.productionApproved, false)
assert.equal(
  LBP_CORE_EXERCISE_METADATA_POLICY.doseMeaning,
  'PRAGMATIC_STARTING_DEFAULT_NOT_CLINICAL_THRESHOLD',
)

const ids = LBP_CORE_EXERCISE_METADATA.map((item) => item.exerciseId)
assert.equal(new Set(ids).size, 20, 'core exercise IDs must be unique')

for (const item of LBP_CORE_EXERCISE_METADATA) {
  const catalog = getLbpExerciseById(item.exerciseId)
  assert.ok(catalog, `core metadata must reference canonical catalog ID: ${item.exerciseId}`)
  assert.equal(item.status, 'DRAFT_CLINICAL_METADATA')
  assert.ok(item.startingCriteriaKo.length >= 2)
  assert.ok(item.startingDoseKo.trim().length > 0)
  assert.ok(item.acceptableResponseKo.length >= 2)
  assert.ok(item.stopReviewKo.length >= 2)
  assert.ok(item.regressionKo.trim().length > 0)
  assert.ok(item.progressionKo.trim().length > 0)
  assert.ok(item.targetFunctions.length >= 1)
  assert.deepEqual(getLbpCoreExerciseMetadata(item.exerciseId), item)

  const allowedKeys = [
    'exerciseId',
    'status',
    'startingCriteriaKo',
    'startingDoseKo',
    'acceptableResponseKo',
    'stopReviewKo',
    'regressionKo',
    'progressionKo',
    'targetFunctions',
  ].sort()
  assert.deepEqual(Object.keys(item).sort(), allowedKeys)
}

const representedDomains = new Set(
  ids.map((id) => getLbpExerciseById(id).domain),
)
assert.equal(
  representedDomains.size,
  Object.keys(LBP_EXERCISE_DOMAIN_META).length,
  'core-20 should retain at least one representative from every canonical domain',
)

// Existing source authority remains untouched: Bird-dog is still the sole explicit object example.
const birdDog = getLbpExerciseById('LBP_TRUNK_03')
assert.equal(birdDog.canonicalName, 'Bird-dog')
assert.equal(birdDog.sourceDetail, 'EXPLICIT_OBJECT_EXAMPLE')
assert.equal(birdDog.level, 2)
assert.equal(birdDog.startingDoseKo, '예: 5회 × 2세트 - 환자상태 따라 수정')
assert.deepEqual(birdDog.targetFunctions, ['LIFTING', 'STANDING', 'WORK'])

const birdDogCore = getLbpCoreExerciseMetadata('LBP_TRUNK_03')
assert.match(birdDogCore.startingDoseKo, /5회 × 2세트/)
assert.match(birdDogCore.regressionKo, /팔만|다리만/)

// Directional and neural exercises must explicitly guard against distal worsening.
for (const id of ['LBP_DIR_02', 'LBP_DIR_03', 'LBP_DIR_04', 'LBP_NEURAL_01']) {
  const text = getLbpCoreExerciseMetadata(id).stopReviewKo.join(' ')
  assert.match(text, /원위부|더 아래|신경증상|감각저하|근력저하/)
}
assert.match(
  getLbpCoreExerciseMetadata('LBP_NEURAL_01').progressionKo,
  /tensioner로 자동 전환하지 않음/,
)

// No core row may contain pathoanatomic diagnosis hard-coding.
const serialized = JSON.stringify(LBP_CORE_EXERCISE_METADATA).toLowerCase()
for (const forbidden of ['disc diagnosis', 'stenosis diagnosis', 'facet diagnosis', 'sij diagnosis']) {
  assert.equal(serialized.includes(forbidden), false)
}

// The canonical inventory remains 57; this layer enriches only 20 and creates no exercises.
assert.equal(LBP_EXERCISE_LIBRARY.length, 57)
assert.equal(ids.every((id) => LBP_EXERCISE_LIBRARY.some((item) => item.id === id)), true)

console.log('LBP core-20 exercise metadata: PASS')
console.log(`canonical catalog: ${LBP_EXERCISE_LIBRARY.length}`)
console.log(`deep metadata rows: ${LBP_CORE_EXERCISE_METADATA.length}`)
console.log(`represented domains: ${representedDomains.size}`)
