from pathlib import Path

p=Path('src/spec/coreSpec.ts')
s=p.read_text()

def once(old,new):
    global s
    assert old in s, f'anchor missing: {old[:80]}'
    assert s.count(old)==1, f'anchor count {s.count(old)}: {old[:80]}'
    s=s.replace(old,new,1)

once("import { computeWristHandFlags, isWh06WoundShown, isWh07aShown } from './wristHandLogic'\n",
     "import { computeWristHandFlags, isWh06WoundShown, isWh07aShown } from './wristHandLogic'\nimport { toAnkleFootState } from './ankleFootAdapter'\nimport { computeAnkleFootFlags } from './ankleFootLogic'\n")

anchor="export const IS_PRIMARY_WRIST_HAND_SAFETY = (r: Responses) =>\n  IS_PRIMARY_ARM_HAND(r) && ['FOREARM', 'WRIST_HAND', 'DIFFUSE_OR_MULTIPLE', 'UNKNOWN'].includes(r['ELBOW_00'] as string)\n"
insert=anchor+"\n/** ANKLE_FOOT_V1: leg_foot downstream router. AF_00 is visibility/tagging only. */\nexport const IS_PRIMARY_ANKLE_FOOT = (r: Responses) => IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'leg_foot'\nconst AF_VALID_REGIONS = ['LOWER_LEG_CALF','ANKLE','HEEL_POSTERIOR_ANKLE','FOOT_TOES','DIFFUSE_OR_MULTIPLE','UNKNOWN']\nexport const IS_PRIMARY_ANKLE_FOOT_SAFETY = (r: Responses) =>\n  IS_PRIMARY_ANKLE_FOOT(r) && AF_VALID_REGIONS.includes(r['AF_00'] as string)\nconst IS_AF_04_SHOWN = (r: Responses) =>\n  IS_PRIMARY_ANKLE_FOOT_SAFETY(r) && r['AF_01'] === 'YES' && ['FOOT_TOES','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(r['AF_00'] as string)\nconst IS_AF_05_SHOWN = (r: Responses) =>\n  IS_PRIMARY_ANKLE_FOOT_SAFETY(r) && r['AF_01'] === 'YES' && ['LOWER_LEG_CALF','ANKLE','HEEL_POSTERIOR_ANKLE','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(r['AF_00'] as string)\nconst IS_AF_07_SHOWN = (r: Responses) =>\n  IS_PRIMARY_ANKLE_FOOT_SAFETY(r) && ['LOWER_LEG_CALF','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(r['AF_00'] as string)\n"
once(anchor,insert)

questions=r'''const ANKLE_FOOT_ROUTING_QUESTIONS: Question[] = [
  {
    id: 'AF_00', variable: 'ankle_foot_region_discriminator', input: 'single_choice',
    question: '지금 가장 불편한 부위는 어디에 가장 가깝나요?', required: true, step: '상세 증상',
    showIf: IS_PRIMARY_ANKLE_FOOT,
    options: [
      { value: 'LOWER_LEG_CALF', label: '종아리·아래다리' }, { value: 'ANKLE', label: '발목' },
      { value: 'HEEL_POSTERIOR_ANKLE', label: '뒤꿈치·발목 뒤쪽' }, { value: 'FOOT_TOES', label: '발·발가락' },
      { value: 'DIFFUSE_OR_MULTIPLE', label: '여러 부위가 비슷하게 불편함' }, { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
]

const ANKLE_FOOT_QUESTIONS: Question[] = [
  { id:'AF_01', variable:'ankle_foot_recent_trauma', input:'single_choice', question:'최근 넘어지거나 접질리거나 부딪히는 등 이 부위에 다친 일이 있었나요?', required:true, step:'상세 증상', showIf:IS_PRIMARY_ANKLE_FOOT_SAFETY, options:[{value:'YES',label:'네'},{value:'NO',label:'아니요'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_02', variable:'ankle_foot_limb_threatening_screen', input:'multi_choice', question:'지금 이 부위나 발에 다음과 같은 변화가 있나요?', required:true, step:'상세 증상', showIf:IS_PRIMARY_ANKLE_FOOT_SAFETY, exclusive:['NONE','UNKNOWN'], options:[
    {value:'SEVERE_OPEN_INJURY_OR_BONE_EXPOSURE',label:'심한 열린 상처가 있거나 뼈가 보임'}, {value:'UNCONTROLLED_HEAVY_BLEEDING',label:'피가 많이 나고 잘 멎지 않음'}, {value:'FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE',label:'발이 갑자기 매우 차갑거나 창백·푸르게 변함'}, {value:'NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA',label:'다친 뒤 발·발가락 감각이나 힘이 갑자기 크게 떨어짐'}, {value:'NONE',label:'해당 없음'}, {value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_03', variable:'ankle_foot_post_trauma_walking', input:'single_choice', question:'다친 뒤 지금 체중을 싣거나 걸을 때 어느 정도인가요?', required:true, step:'상세 증상', showIf:(r)=>IS_PRIMARY_ANKLE_FOOT_SAFETY(r)&&r['AF_01']==='YES', options:[{value:'CAN_WALK_NORMALLY',label:'평소처럼 걸을 수 있음'},{value:'CAN_WALK_BUT_MARKED_DIFFICULTY',label:'걸을 수 있지만 많이 불편함'},{value:'CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS',label:'체중을 싣기 어렵거나 4걸음을 걷기 어려움'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_04', variable:'ankle_foot_midfoot_supportive_screen', input:'multi_choice', question:'다친 뒤 발 중간 부위와 관련해 다음 중 해당되는 것이 있나요?', required:true, step:'상세 증상', showIf:IS_AF_04_SHOWN, exclusive:['NONE','UNKNOWN'], options:[{value:'NEW_PLANTAR_MIDFOOT_BRUISING_NOTICED',label:'발바닥 중간에 새 멍이 생긴 것을 봄'},{value:'MARKED_MIDFOOT_FUNCTION_OR_WEIGHT_BEARING_DIFFICULTY',label:'발 중간 통증 때문에 체중을 싣거나 걷기가 매우 어려움'},{value:'NONE',label:'해당 없음'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_05', variable:'ankle_foot_achilles_rupture_screen', input:'multi_choice', question:'다친 뒤 발목 뒤쪽이나 종아리와 관련해 다음 중 해당되는 것이 있나요?', required:true, step:'상세 증상', showIf:IS_AF_05_SHOWN, exclusive:['NONE','UNKNOWN'], options:[{value:'SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF',label:'발목 뒤나 종아리에서 갑자기 뚝/퍽 하는 느낌이나 소리가 남'},{value:'NEW_MARKED_LOSS_OF_PUSH_OFF_OR_TOE_RISE',label:'발로 밀어내거나 까치발 서는 힘이 갑자기 크게 떨어짐'},{value:'NONE',label:'해당 없음'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_06', variable:'ankle_foot_infection_screen', input:'single_choice', question:'현재 발이나 발목에 붉음·열감·붓기·상처와 관련해 가장 가까운 상태를 골라주세요.', required:true, step:'상세 증상', showIf:IS_PRIMARY_ANKLE_FOOT_SAFETY, options:[{value:'NO_CONCERN',label:'해당 없음'},{value:'LOCALIZED_STABLE_RED_HOT_SWOLLEN_OR_WOUND',label:'국소적으로 붉거나 뜨겁고 붓거나 상처가 있지만 빠르게 심해지지는 않음'},{value:'SYSTEMIC_OR_RAPIDLY_WORSENING',label:'몸 상태가 많이 안 좋거나 붓기·통증이 빠르게 심해지고 있음'},{value:'SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN',label:'검게 변함·심한 순환장애·깊은 감염이 걱정될 정도의 변화가 있음'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_07', variable:'ankle_foot_dvt_pattern', input:'single_choice', question:'최근 한쪽 종아리나 아래다리가 새로 붓고 아픈가요?', required:true, step:'상세 증상', showIf:IS_AF_07_SHOWN, options:[{value:'NO',label:'아니요'},{value:'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN',label:'네, 한쪽이 새로 붓고 아파요'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
  { id:'AF_08', variable:'ankle_foot_progressive_neuro_screen', input:'single_choice', question:'외상과 별개로 발이나 발가락의 감각 저하 또는 힘 빠짐이 새로 생기거나 진행하고 있나요?', required:true, step:'상세 증상', showIf:IS_PRIMARY_ANKLE_FOOT_SAFETY, options:[{value:'NO',label:'아니요'},{value:'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS',label:'네, 새로 생기거나 점점 심해지고 있어요'},{value:'UNKNOWN',label:'잘 모르겠어요'}] },
]

'''
once("/* ---------- Fatigue 상세 Module (primary concern === fatigue 인 경우만) ---------- */", questions+"/* ---------- Fatigue 상세 Module (primary concern === fatigue 인 경우만) ---------- */")

once("  ...WRIST_HAND_QUESTIONS,\n  ...FATIGUE_QUESTIONS,", "  ...WRIST_HAND_QUESTIONS,\n  ...ANKLE_FOOT_ROUTING_QUESTIONS,\n  ...ANKLE_FOOT_QUESTIONS,\n  ...FATIGUE_QUESTIONS,")

once("  WH_07A: (r) => computeWristHandFlags(toWristHandState(r, computeFlags(r).general_red)).wrist_hand_safety_status === 'URGENT_REVIEW',\n}",
'''  WH_07A: (r) => computeWristHandFlags(toWristHandState(r, computeFlags(r).general_red)).wrist_hand_safety_status === 'URGENT_REVIEW',
  AF_02: (r) => IS_PRIMARY_ANKLE_FOOT_SAFETY(r) && computeAnkleFootFlags(toAnkleFootState(r, computeFlags(r).general_red, { af04_shown: IS_AF_04_SHOWN(r), af05_shown: IS_AF_05_SHOWN(r), af07_shown: IS_AF_07_SHOWN(r) })).ankle_foot_safety_status === 'URGENT_REVIEW',
  AF_06: (r) => IS_PRIMARY_ANKLE_FOOT_SAFETY(r) && computeAnkleFootFlags(toAnkleFootState(r, computeFlags(r).general_red, { af04_shown: IS_AF_04_SHOWN(r), af05_shown: IS_AF_05_SHOWN(r), af07_shown: IS_AF_07_SHOWN(r) })).ankle_foot_safety_status === 'URGENT_REVIEW',
}''')

once("            : null,\n    modules_activated: modulesActivated(r),", "            : IS_PRIMARY_ANKLE_FOOT_SAFETY(r)\n              ? 'ANKLE_FOOT'\n              : null,\n    modules_activated: modulesActivated(r),")

once("    wrist_hand: IS_PRIMARY_WRIST_HAND_SAFETY(r) ? computeWristHandFlags(toWristHandState(r, computeFlags(r).general_red)) : null,\n  },",
'''    wrist_hand: IS_PRIMARY_WRIST_HAND_SAFETY(r) ? computeWristHandFlags(toWristHandState(r, computeFlags(r).general_red)) : null,
    ankle_foot: IS_PRIMARY_ANKLE_FOOT_SAFETY(r)
      ? computeAnkleFootFlags(toAnkleFootState(r, computeFlags(r).general_red, { af04_shown: IS_AF_04_SHOWN(r), af05_shown: IS_AF_05_SHOWN(r), af07_shown: IS_AF_07_SHOWN(r) }))
      : null,
  },''')

# Insert raw module immediately before fatigue module in buildResponsePayload only.
idx=s.index("export const buildResponsePayload")
pos=s.index("    fatigue: {", idx)
s=s[:pos]+'''    ankle_foot: {
      region_discriminator: r['AF_00'], recent_trauma: r['AF_01'], limb_threatening_screen: r['AF_02'],
      post_trauma_walking: r['AF_03'], midfoot_supportive_screen: r['AF_04'], achilles_rupture_screen: r['AF_05'],
      infection_screen: r['AF_06'], dvt_pattern: r['AF_07'], progressive_neuro_screen: r['AF_08'],
    },
'''+s[pos:]

p.write_text(s)

# Append DoctorPayload adapter after core payload shape exists.
a=Path('src/spec/ankleFootAdapter.ts'); t=a.read_text()
if "toAnkleFootStateFromDoctorPayload" not in t:
    t=t.replace("import type { AnkleFootState } from './ankleFootLogic'\n", "import type { AnkleFootState } from './ankleFootLogic'\nimport type { DoctorPayload } from '../doctor/types'\n")
    t += '''\n\nexport function toAnkleFootStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): AnkleFootState {
  const m = r.modules.ankle_foot
  const raw: Responses = {
    AF_01: m.recent_trauma, AF_02: m.limb_threatening_screen, AF_03: m.post_trauma_walking,
    AF_04: m.midfoot_supportive_screen, AF_05: m.achilles_rupture_screen, AF_06: m.infection_screen,
    AF_07: m.dvt_pattern, AF_08: m.progressive_neuro_screen,
  }
  const region = m.region_discriminator
  return toAnkleFootState(raw, coreGeneralRed, {
    af04_shown: raw.AF_01 === 'YES' && ['FOOT_TOES','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(region as string),
    af05_shown: raw.AF_01 === 'YES' && ['LOWER_LEG_CALF','ANKLE','HEEL_POSTERIOR_ANKLE','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(region as string),
    af07_shown: ['LOWER_LEG_CALF','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(region as string),
  })
}
'''
    a.write_text(t)

# Add focused core integration assertions.
it=Path('tests/integration.spec.mjs'); x=it.read_text()
marker="/* ANKLE_FOOT_V1 CORE INTEGRATION */"
if marker not in x:
    x += r'''

/* ANKLE_FOOT_V1 CORE INTEGRATION */
{
  let r = emptyResponses()
  r = { ...r, VISIT_01:'symptom', VISIT_02_SYMPTOM_MAIN:'pain', PAIN_01:'leg_foot', AF_00:'ANKLE', AF_01:'NO', AF_02:['NONE'], AF_06:'NO_CONCERN', AF_08:'NO' }
  const ids = visibleIds(r)
  assert('AF core: leg_foot shows AF_00', ids.has('AF_00'))
  assert('AF core: valid AF_00 shows protected AF_01/02/06/08', ['AF_01','AF_02','AF_06','AF_08'].every((id)=>ids.has(id)))
  const payload = buildResponsePayload(r)
  assert('AF core: safety payload exists', payload.safety_flags.ankle_foot?.ankle_foot_safety_status === 'CLEAR')
  assert('AF core: raw module preserves AF_00', payload.modules.ankle_foot.region_discriminator === 'ANKLE')
  assert('AF core: routing detail labels ANKLE_FOOT', buildRoutingPayload(r).primary_module_detail === 'ANKLE_FOOT')

  const urgent = { ...r, AF_02:['UNCONTROLLED_HEAVY_BLEEDING'] }
  assert('AF core: urgent engine reaches payload', buildResponsePayload(urgent).safety_flags.ankle_foot?.ankle_foot_safety_status === 'URGENT_REVIEW')
  assert('AF core: AF_02 urgent triggers StaffCheck', STAFF_CHECK_TRIGGERS.AF_02(urgent) === true)

  const calf = { ...r, AF_00:'LOWER_LEG_CALF', AF_07:'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN' }
  assert('AF core: calf exposes AF_07', visibleIds(calf).has('AF_07'))
  assert('AF core: DVT pattern only REVIEW', buildResponsePayload(calf).safety_flags.ankle_foot?.ankle_foot_safety_status === 'REVIEW_REQUIRED')
}
'''
    it.write_text(x)
