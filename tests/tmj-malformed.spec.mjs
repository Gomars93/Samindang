import assert from 'node:assert/strict'
import { computeTmjFlags } from './.tmj-logic-bundle.mjs'
import { toTmjState } from './.tmj-adapter-bundle.mjs'
let passed=0
const base={TMJ_01:['NONE'],TMJ_02:'NO_CONCERN',TMJ_03:['NONE'],TMJ_04:'NO',TMJ_05:'NO_CURRENT_FIXED_LOCK'}
const run=(name,r)=>{const f=computeTmjFlags(toTmjState(r,false,40));assert.notEqual(f.tmj_safety_status,'CLEAR',name);passed++;console.log(`PASS ${name}`)}
run('empty TMJ01',{...base,TMJ_01:[]})
run('out-of-allowlist TMJ01',{...base,TMJ_01:['BOGUS']})
run('mixed NONE TMJ01',{...base,TMJ_01:['NONE','UNCONTROLLED_HEAVY_ORAL_BLEEDING']})
run('invalid TMJ02',{...base,TMJ_02:'BOGUS'})
run('empty TMJ03',{...base,TMJ_03:[]})
run('mixed UNKNOWN TMJ03',{...base,TMJ_03:['UNKNOWN','NEW_JAW_CLAUDICATION_WITH_CHEWING']})
run('invalid TMJ04',{...base,TMJ_04:'BOGUS'})
run('invalid TMJ05',{...base,TMJ_05:'BOGUS'})
console.log(`\n${passed} malformed cases passed, 0 failed`)
