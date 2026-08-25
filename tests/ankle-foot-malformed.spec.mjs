import assert from 'node:assert/strict'
import { computeAnkleFootFlags } from './.ankle-foot-logic-bundle.mjs'
import { toAnkleFootState } from './.ankle-foot-adapter-bundle.mjs'

let passed = 0
const run = (name, r, shown = { af04_shown:false, af05_shown:false, af07_shown:false }) => {
  const s = toAnkleFootState(r, false, shown)
  const f = computeAnkleFootFlags(s)
  assert.notEqual(f.ankle_foot_safety_status, 'CLEAR', name)
  passed += 1
  console.log(`PASS ${name}`)
}
const baseline = { AF_01:'NO', AF_02:['NONE'], AF_06:'NO_CONCERN', AF_08:'NO' }

run('invalid protected single AF_01', { ...baseline, AF_01:'BOGUS' })
run('empty protected AF_02', { ...baseline, AF_02:[] })
run('out-of-allowlist AF_02', { ...baseline, AF_02:['BOGUS'] })
run('NONE + positive AF_02 invalid', { ...baseline, AF_02:['NONE','UNCONTROLLED_HEAVY_BLEEDING'] })
run('UNKNOWN + positive AF_02 invalid', { ...baseline, AF_02:['UNKNOWN','UNCONTROLLED_HEAVY_BLEEDING'] })
run('invalid AF_06', { ...baseline, AF_06:'BOGUS' })
run('invalid AF_08', { ...baseline, AF_08:'BOGUS' })
run('shown missing AF_04', { ...baseline }, { af04_shown:true, af05_shown:false, af07_shown:false })
run('shown empty AF_05', { ...baseline, AF_05:[] }, { af04_shown:false, af05_shown:true, af07_shown:false })
run('shown malformed AF_07', { ...baseline, AF_07:'BOGUS' }, { af04_shown:false, af05_shown:false, af07_shown:true })

console.log(`\n${passed} malformed cases passed, 0 failed`)
