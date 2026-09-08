// LBP v1 Batch 2 (G6) — canonical exercise catalog sanity tests.
// Run via `npm run test:lbp-exercise-library`.
//
// Ported (structure unchanged, no RF-* fixes apply to this file — see
// `docs/LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md` §4/§5,
// which found no defect in the catalog rows themselves) from
// `lbpExerciseLibrary.v01.experimental.ts` on
// `origin/claude/feat-lbp-action-adaptive-engine-prototype`.

import assert from 'node:assert/strict'
import {
  LBP_EXERCISE_LIBRARY,
  LBP_EXERCISE_LIBRARY_SOURCE,
  LBP_EXERCISE_DOMAIN_META,
  getLbpExerciseById,
  listLbpExercisesByDomain,
} from './.lbp-exercise-library-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

test('catalog has exactly 57 entries, every id unique', () => {
  assert.equal(LBP_EXERCISE_LIBRARY.length, 57)
  assert.equal(new Set(LBP_EXERCISE_LIBRARY.map((i) => i.id)).size, 57)
  assert.equal(LBP_EXERCISE_LIBRARY_SOURCE.explicitExerciseCount, 57)
})

test('every id starts with LBP_ and every domain is a known LBP_EXERCISE_DOMAIN_META key', () => {
  const domains = new Set(Object.keys(LBP_EXERCISE_DOMAIN_META))
  for (const item of LBP_EXERCISE_LIBRARY) {
    assert.ok(item.id.startsWith('LBP_'), item.id)
    assert.ok(domains.has(item.domain), `${item.id} has unknown domain ${item.domain}`)
  }
})

test('LBP_TRUNK_03 = Bird-dog is preserved verbatim (sole explicit EX_ID example in the source doc)', () => {
  const item = getLbpExerciseById('LBP_TRUNK_03')
  assert.ok(item)
  assert.equal(item.canonicalName, 'Bird-dog')
  assert.equal(item.sourceDetail, 'EXPLICIT_OBJECT_EXAMPLE')
  assert.equal(item.level, 2)
})

test('getLbpExerciseById returns undefined for an unknown id, never throws', () => {
  assert.equal(getLbpExerciseById('LBP_DOES_NOT_EXIST'), undefined)
})

test('listLbpExercisesByDomain partitions the catalog with no overlap and no loss', () => {
  const seen = new Set()
  let total = 0
  for (const domain of Object.keys(LBP_EXERCISE_DOMAIN_META)) {
    const items = listLbpExercisesByDomain(domain)
    for (const item of items) {
      assert.ok(!seen.has(item.id), `${item.id} appears in more than one domain listing`)
      seen.add(item.id)
    }
    total += items.length
  }
  assert.equal(total, 57)
})

test('no patient/diagnosis mapping fields exist on the catalog item shape (migration-only invariant)', () => {
  for (const item of LBP_EXERCISE_LIBRARY) {
    assert.ok(!('diagnosis' in item))
    assert.ok(!('patientMatch' in item))
  }
})

console.log(`\n${passed} tests passed.`)
