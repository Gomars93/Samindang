import type { AnswerValue, Responses } from '../types'
import type { AnkleFootState } from './ankleFootLogic'
import type { DoctorPayload } from '../doctor/types'

const YES_NO_UNKNOWN = new Set(['YES', 'NO', 'UNKNOWN'])
const WALK = new Set(['CAN_WALK_NORMALLY', 'CAN_WALK_BUT_MARKED_DIFFICULTY', 'CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS', 'UNKNOWN'])
const INFECTION = new Set([
  'NO_CONCERN',
  'LOCALIZED_STABLE_RED_HOT_SWOLLEN_OR_WOUND',
  'SYSTEMIC_OR_RAPIDLY_WORSENING',
  'SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN',
  'UNKNOWN',
])
const DVT = new Set(['NO', 'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN', 'UNKNOWN'])
const NEURO = new Set(['NO', 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS', 'UNKNOWN'])

const AF02 = new Set([
  'SEVERE_OPEN_INJURY_OR_BONE_EXPOSURE',
  'UNCONTROLLED_HEAVY_BLEEDING',
  'FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE',
  'NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA',
  'NONE',
  'UNKNOWN',
])
const AF04 = new Set([
  'NEW_PLANTAR_MIDFOOT_BRUISING_NOTICED',
  'MARKED_MIDFOOT_FUNCTION_OR_WEIGHT_BEARING_DIFFICULTY',
  'NONE',
  'UNKNOWN',
])
const AF05 = new Set([
  'SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF',
  'NEW_MARKED_LOSS_OF_PUSH_OFF_OR_TOE_RISE',
  'NONE',
  'UNKNOWN',
])

const asAllowedString = (v: AnswerValue, allowed: ReadonlySet<string>): string | undefined =>
  typeof v === 'string' && allowed.has(v) ? v : undefined

/** Strict protected multi-choice validator. Invalid values, empty arrays, duplicates,
 * and NONE/UNKNOWN mixed with anything else normalize to undefined, which the engine
 * treats as the CLOSED fail-closed path. */
const asProtectedMulti = (v: AnswerValue, allowed: ReadonlySet<string>): string[] | undefined => {
  if (!Array.isArray(v) || v.length === 0) return undefined
  if (v.some((x) => !allowed.has(x))) return undefined
  if (new Set(v).size !== v.length) return undefined
  if ((v.includes('NONE') || v.includes('UNKNOWN')) && v.length !== 1) return undefined
  return v
}

export interface AnkleFootShownState {
  af04_shown: boolean
  af05_shown: boolean
  af07_shown: boolean
}

/** App submission adapter. AF_00 is deliberately not mapped: routing/tagging only. */
export function toAnkleFootState(
  r: Responses,
  coreGeneralRed: boolean,
  shown: AnkleFootShownState,
): AnkleFootState {
  return {
    recent_trauma: asAllowedString(r['AF_01'], YES_NO_UNKNOWN) as AnkleFootState['recent_trauma'],
    limb_threatening_screen: asProtectedMulti(r['AF_02'], AF02),
    post_trauma_walking: asAllowedString(r['AF_03'], WALK) as AnkleFootState['post_trauma_walking'],
    midfoot_supportive_screen: asProtectedMulti(r['AF_04'], AF04),
    achilles_rupture_screen: asProtectedMulti(r['AF_05'], AF05),
    infection_screen: asAllowedString(r['AF_06'], INFECTION) as AnkleFootState['infection_screen'],
    dvt_pattern: asAllowedString(r['AF_07'], DVT) as AnkleFootState['dvt_pattern'],
    progressive_neuro_screen: asAllowedString(r['AF_08'], NEURO) as AnkleFootState['progressive_neuro_screen'],
    af04_shown: shown.af04_shown,
    af05_shown: shown.af05_shown,
    af07_shown: shown.af07_shown,
    core_safety_already_urgent: coreGeneralRed,
  }
}


export function toAnkleFootStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): AnkleFootState {
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
