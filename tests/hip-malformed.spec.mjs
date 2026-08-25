import assert from 'node:assert/strict'
import { computeHipFlags } from './.hip-logic-bundle.mjs'
import { toHipState } from './.hip-adapter-bundle.mjs'
let passed=0
const base={HIP_01:'NO',HIP_02:['NONE'],HIP_04:['NONE'],HIP_05:'NO_CONCERN',HIP_06:'NO'}
const run=(name,r)=>{const f=computeHipFlags(toHipState(r,false));assert.notEqual(f.hip_safety_status,'CLEAR',name);passed++;console.log(`PASS ${name}`)}
run('invalid HIP01',{...base,HIP_01:'BOGUS'})
run('empty HIP02',{...base,HIP_02:[]})
run('out-of-allowlist HIP02',{...base,HIP_02:['BOGUS']})
run('mixed NONE HIP02',{...base,HIP_02:['NONE','GROSS_DEFORMITY_OR_JOINT_STUCK_OUT_OF_POSITION']})
run('mixed UNKNOWN HIP04',{...base,HIP_04:['UNKNOWN','ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN']})
run('empty HIP04',{...base,HIP_04:[]})
run('invalid HIP05',{...base,HIP_05:'BOGUS'})
run('invalid HIP06',{...base,HIP_06:'BOGUS'})
console.log(`\n${passed} malformed cases passed, 0 failed`)
