import assert from 'node:assert/strict'
import { computeTmjFlags } from './.tmj-logic-bundle.mjs'
import { toTmjState } from './.tmj-adapter-bundle.mjs'
let passed=0;const test=(n,f)=>{f();passed++;console.log(`PASS ${n}`)}
const clear={trauma_injury_screen:['NONE'],dental_oral_infection_screen:'NO_CONCERN',gca_history_screen:['NONE'],facial_neuro_screen:'NO',current_lock_screen:'NO_CURRENT_FIXED_LOCK',patient_age:40,core_safety_already_urgent:false}
const flags=(p={})=>computeTmjFlags({...clear,...p})
test('clear baseline',()=>assert.equal(flags().tmj_safety_status,'CLEAR'))
for(const v of ['JAW_CURRENTLY_STUCK_OPEN_OR_ABNORMAL_POSITION','SEVERE_FACIAL_OR_JAW_TRAUMA_WITH_GROSS_DEFORMITY','UNCONTROLLED_HEAVY_ORAL_BLEEDING','BREATHING_OR_SWALLOWING_COMPROMISE_WITH_SWELLING_OR_INJURY'])test(`TMJ01 ${v} urgent`,()=>assert.equal(flags({trauma_injury_screen:[v]}).tmj_safety_status,'URGENT_REVIEW'))
test('TMJ01 bite/function trauma review',()=>{const f=flags({trauma_injury_screen:['TRAUMA_WITH_NEW_BITE_CHANGE_OR_MARKED_FUNCTION_LOSS']});assert.equal(f.tmj_safety_status,'REVIEW_REQUIRED');assert.equal(f.trauma_or_dislocation_assessment_required,true)})
test('TMJ02 localized review',()=>{const f=flags({dental_oral_infection_screen:'LOCALIZED_TOOTH_OR_GUM_PAIN_SWELLING_OR_PUS_TASTE'});assert.equal(f.tmj_safety_status,'REVIEW_REQUIRED');assert.equal(f.dental_or_oral_assessment_required,true);assert.equal(f.infection_assessment_required,true)})
for(const v of ['LARGE_OR_SPREADING_SWELLING_OR_SEVERE_SYSTEMIC_ILLNESS','EYE_AIRWAY_OR_SWALLOW_COMPROMISE'])test(`TMJ02 ${v} urgent`,()=>assert.equal(flags({dental_oral_infection_screen:v}).tmj_safety_status,'URGENT_REVIEW'))
test('GCA age 50+ compatible review expedited',()=>{const f=flags({patient_age:65,gca_history_screen:['NEW_JAW_CLAUDICATION_WITH_CHEWING']});assert.equal(f.tmj_safety_status,'REVIEW_REQUIRED');assert.equal(f.gca_assessment_required,true);assert.equal(f.expedited_referral_consider,true)})
test('GCA compatible + visual age 50+ urgent',()=>assert.equal(flags({patient_age:70,gca_history_screen:['NEW_SCALP_OR_TEMPORAL_PAIN_TENDERNESS_PATTERN','NEW_TRANSIENT_VISUAL_DISTURBANCE_DIPLOPIA_OR_VISUAL_LOSS']}).tmj_safety_status,'URGENT_REVIEW'))
test('GCA compatible age unknown fails closed review not urgent',()=>{const f=flags({patient_age:undefined,gca_history_screen:['NEW_JAW_CLAUDICATION_WITH_CHEWING','NEW_TRANSIENT_VISUAL_DISTURBANCE_DIPLOPIA_OR_VISUAL_LOSS']});assert.equal(f.tmj_safety_status,'REVIEW_REQUIRED');assert.equal(f.gca_assessment_required,true)})
test('facial neuro review expedited',()=>{const f=flags({facial_neuro_screen:'NEW_OR_PERSISTENT_FACIAL_NUMBNESS_OR_FOCAL_NEURO_CHANGE'});assert.equal(f.tmj_safety_status,'REVIEW_REQUIRED');assert.equal(f.neuro_assessment_required,true);assert.equal(f.expedited_referral_consider,true)})
test('fixed lock review',()=>{const f=flags({current_lock_screen:'CURRENTLY_LOCKED_AND_CANNOT_OPEN_OR_CLOSE_NORMALLY'});assert.equal(f.tmj_safety_status,'REVIEW_REQUIRED');assert.equal(f.trauma_or_dislocation_assessment_required,true)})
test('adapter excludes HFJ_00',()=>{const s=toTmjState({HFJ_00:'UNKNOWN',TMJ_01:['NONE'],TMJ_02:'NO_CONCERN',TMJ_03:['NONE'],TMJ_04:'NO',TMJ_05:'NO_CURRENT_FIXED_LOCK'},false,40);assert.equal(Object.hasOwn(s,'HFJ_00'),false);assert.equal(computeTmjFlags(s).tmj_safety_status,'CLEAR')})
console.log(`\n${passed} passed, 0 failed`)
