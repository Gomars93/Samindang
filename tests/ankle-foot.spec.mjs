import assert from 'node:assert/strict'
import { computeAnkleFootFlags } from './.ankle-foot-logic-bundle.mjs'
import { toAnkleFootState } from './.ankle-foot-adapter-bundle.mjs'

let passed = 0
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`) }

const clear = {
  recent_trauma: 'NO',
  limb_threatening_screen: ['NONE'],
  infection_screen: 'NO_CONCERN',
  progressive_neuro_screen: 'NO',
  af04_shown: false,
  af05_shown: false,
  af07_shown: false,
  core_safety_already_urgent: false,
}

const flags = (patch = {}) => computeAnkleFootFlags({ ...clear, ...patch })

test('clear baseline', () => assert.equal(flags().ankle_foot_safety_status, 'CLEAR'))
test('core urgent dominates', () => assert.equal(flags({ core_safety_already_urgent: true }).ankle_foot_safety_status, 'URGENT_REVIEW'))
test('AF01 UNKNOWN fails closed', () => assert.equal(flags({ recent_trauma: 'UNKNOWN' }).ankle_foot_safety_status, 'REVIEW_REQUIRED'))
test('AF01 missing fails closed', () => assert.equal(flags({ recent_trauma: undefined }).ankle_foot_safety_status, 'REVIEW_REQUIRED'))

for (const v of ['SEVERE_OPEN_INJURY_OR_BONE_EXPOSURE','UNCONTROLLED_HEAVY_BLEEDING','FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE']) {
  test(`AF02 ${v} standalone urgent`, () => assert.equal(flags({ limb_threatening_screen: [v] }).ankle_foot_safety_status, 'URGENT_REVIEW'))
}
test('AF02 traumatic major distal neuro urgent', () => assert.equal(flags({ recent_trauma:'YES', limb_threatening_screen:['NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA'], post_trauma_walking:'CAN_WALK_NORMALLY' }).ankle_foot_safety_status, 'URGENT_REVIEW'))
test('AF02 same neuro without trauma is review+neuro+expedited', () => {
  const f = flags({ limb_threatening_screen:['NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA'] })
  assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.neuro_assessment_required, true); assert.equal(f.expedited_referral_consider, true)
})

test('AF03 cannot bear weight -> review + imaging', () => {
  const f = flags({ recent_trauma:'YES', post_trauma_walking:'CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS' })
  assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.fracture_imaging_consider, true)
})
test('AF03 marked difficulty does not invent Ottawa positive', () => {
  const f = flags({ recent_trauma:'YES', post_trauma_walking:'CAN_WALK_BUT_MARKED_DIFFICULTY' })
  assert.notEqual(f.ankle_foot_safety_status, 'URGENT_REVIEW')
})

test('AF04 plantar bruising alone supportive only', () => assert.equal(flags({ af04_shown:true, midfoot_supportive_screen:['NEW_PLANTAR_MIDFOOT_BRUISING_NOTICED'] }).ankle_foot_safety_status, 'CLEAR'))
test('AF04 marked midfoot dysfunction -> review + imaging', () => {
  const f = flags({ af04_shown:true, midfoot_supportive_screen:['MARKED_MIDFOOT_FUNCTION_OR_WEIGHT_BEARING_DIFFICULTY'] })
  assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.fracture_imaging_consider, true)
})

for (const v of ['SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF','NEW_MARKED_LOSS_OF_PUSH_OFF_OR_TOE_RISE']) {
  test(`AF05 ${v} alone -> review + Achilles + expedited`, () => {
    const f = flags({ af05_shown:true, achilles_rupture_screen:[v] })
    assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.achilles_rupture_assessment_required, true); assert.equal(f.expedited_referral_consider, true)
  })
}

test('AF06 localized stable infection review', () => {
  const f = flags({ infection_screen:'LOCALIZED_STABLE_RED_HOT_SWOLLEN_OR_WOUND' })
  assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.infection_assessment_required, true)
})
for (const v of ['SYSTEMIC_OR_RAPIDLY_WORSENING','SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN']) {
  test(`AF06 ${v} urgent`, () => {
    const f = flags({ infection_screen:v }); assert.equal(f.ankle_foot_safety_status, 'URGENT_REVIEW'); assert.equal(f.infection_assessment_required, true)
  })
}

test('AF07 unilateral calf pattern -> review + DVT', () => {
  const f = flags({ af07_shown:true, dvt_pattern:'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN' })
  assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.dvt_assessment_required, true)
})
test('AF07 hidden missing does not escalate', () => assert.equal(flags({ af07_shown:false, dvt_pattern:undefined }).ankle_foot_safety_status, 'CLEAR'))

test('AF08 progressive neuro -> review + neuro + expedited', () => {
  const f = flags({ progressive_neuro_screen:'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS' })
  assert.equal(f.ankle_foot_safety_status, 'REVIEW_REQUIRED'); assert.equal(f.neuro_assessment_required, true); assert.equal(f.expedited_referral_consider, true)
})

test('adapter does not use AF_00 as safety input', () => {
  const r = { AF_00:'UNKNOWN', AF_01:'NO', AF_02:['NONE'], AF_06:'NO_CONCERN', AF_08:'NO' }
  const s = toAnkleFootState(r, false, { af04_shown:false, af05_shown:false, af07_shown:false })
  assert.equal(Object.hasOwn(s, 'AF_00'), false)
  assert.equal(computeAnkleFootFlags(s).ankle_foot_safety_status, 'CLEAR')
})

console.log(`\n${passed} passed, 0 failed`)
