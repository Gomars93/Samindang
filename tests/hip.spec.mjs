import assert from 'node:assert/strict'
import { computeHipFlags } from './.hip-logic-bundle.mjs'
import { toHipState } from './.hip-adapter-bundle.mjs'

let passed = 0
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`) }
const clear = {
  recent_trauma:'NO',
  limb_threatening_screen:['NONE'],
  stress_fracture_pattern:['NONE'],
  infection_screen:'NO_CONCERN',
  progressive_neuro_screen:'NO',
  core_safety_already_urgent:false,
}
const flags = (patch={}) => computeHipFlags({ ...clear, ...patch })

test('clear baseline', () => assert.equal(flags().hip_safety_status, 'CLEAR'))
test('core urgent dominates', () => assert.equal(flags({core_safety_already_urgent:true}).hip_safety_status, 'URGENT_REVIEW'))
test('HIP01 UNKNOWN fail closed', () => assert.equal(flags({recent_trauma:'UNKNOWN'}).hip_safety_status, 'REVIEW_REQUIRED'))
for (const v of ['GROSS_DEFORMITY_OR_JOINT_STUCK_OUT_OF_POSITION','SEVERE_OPEN_INJURY_OR_HEAVY_BLEEDING','FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE']) {
  test(`HIP02 ${v} urgent`, () => assert.equal(flags({limb_threatening_screen:[v]}).hip_safety_status, 'URGENT_REVIEW'))
}
test('HIP02 traumatic major neuro urgent', () => assert.equal(flags({recent_trauma:'YES',post_trauma_walking:'NO_MARKED_WALKING_DIFFICULTY',limb_threatening_screen:['NEW_MAJOR_DISTAL_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA']}).hip_safety_status,'URGENT_REVIEW'))
test('HIP02 major neuro without trauma review+neuro', () => {
  const f=flags({limb_threatening_screen:['NEW_MAJOR_DISTAL_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA']}); assert.equal(f.hip_safety_status,'REVIEW_REQUIRED'); assert.equal(f.neuro_assessment_required,true); assert.equal(f.expedited_referral_consider,true)
})
test('HIP03 marked walking difficulty -> review + imaging + expedited', () => {
  const f=flags({recent_trauma:'YES',post_trauma_walking:'MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY'}); assert.equal(f.hip_safety_status,'REVIEW_REQUIRED'); assert.equal(f.fracture_imaging_consider,true); assert.equal(f.expedited_referral_consider,true)
})
test('HIP04 full stress pattern -> review + imaging + stress + lock', () => {
  const f=flags({stress_fracture_pattern:['ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN','RECENT_REPETITIVE_LOAD_RUNNING_JUMPING_MARCH_OR_LOAD_INCREASE','PROGRESSIVE_WEIGHT_BEARING_PAIN_OR_WORSENING_WALKING_TOLERANCE']}); assert.equal(f.hip_safety_status,'REVIEW_REQUIRED'); assert.equal(f.fracture_imaging_consider,true); assert.equal(f.stress_fracture_assessment_required,true); assert.equal(f.loading_exercise_lock,true)
})
test('HIP04 partial pattern does not auto-diagnose stress fracture', () => { const f=flags({stress_fracture_pattern:['ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN']}); assert.equal(f.hip_safety_status,'REVIEW_REQUIRED'); assert.equal(f.stress_fracture_assessment_required,false) })
test('HIP05 localized infection review', () => { const f=flags({infection_screen:'LOCALIZED_STABLE_CONCERN'}); assert.equal(f.hip_safety_status,'REVIEW_REQUIRED'); assert.equal(f.infection_assessment_required,true) })
test('HIP05 systemic OR rapidly worsening urgent', () => { const f=flags({infection_screen:'SYSTEMIC_OR_RAPIDLY_WORSENING'}); assert.equal(f.hip_safety_status,'URGENT_REVIEW'); assert.equal(f.infection_assessment_required,true) })
test('HIP06 progressive neuro review+expedited', () => { const f=flags({progressive_neuro_screen:'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS'}); assert.equal(f.hip_safety_status,'REVIEW_REQUIRED'); assert.equal(f.neuro_assessment_required,true); assert.equal(f.expedited_referral_consider,true) })
test('adapter excludes HIP_00 and HIP_03A', () => { const s=toHipState({HIP_00:'UNKNOWN',HIP_01:'NO',HIP_02:['NONE'],HIP_03A:'DONE_TOLD_NORMAL',HIP_04:['NONE'],HIP_05:'NO_CONCERN',HIP_06:'NO'},false); assert.equal(Object.hasOwn(s,'HIP_00'),false); assert.equal(Object.hasOwn(s,'HIP_03A'),false); assert.equal(computeHipFlags(s).hip_safety_status,'CLEAR') })
console.log(`\n${passed} passed, 0 failed`)
