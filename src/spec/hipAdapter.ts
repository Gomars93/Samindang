import type { AnswerValue, Responses } from '../types'
import type { DoctorPayload } from '../doctor/types'
import type { HipState } from './hipLogic'

const YES_NO_UNKNOWN = new Set(['YES', 'NO', 'UNKNOWN'])
const WALKING = new Set(['NO_MARKED_WALKING_DIFFICULTY', 'MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY', 'UNKNOWN'])
const INFECTION = new Set(['NO_CONCERN', 'LOCALIZED_STABLE_CONCERN', 'SYSTEMIC_OR_RAPIDLY_WORSENING', 'UNKNOWN'])
const NEURO = new Set(['NO', 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS', 'UNKNOWN'])
const HIP02 = new Set([
  'GROSS_DEFORMITY_OR_JOINT_STUCK_OUT_OF_POSITION',
  'SEVERE_OPEN_INJURY_OR_HEAVY_BLEEDING',
  'NEW_MAJOR_DISTAL_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA',
  'FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE',
  'NONE',
  'UNKNOWN',
])
const HIP04 = new Set([
  'ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN',
  'RECENT_REPETITIVE_LOAD_RUNNING_JUMPING_MARCH_OR_LOAD_INCREASE',
  'PROGRESSIVE_WEIGHT_BEARING_PAIN_OR_WORSENING_WALKING_TOLERANCE',
  'NONE',
  'UNKNOWN',
])

const asAllowedString = (v: AnswerValue, allowed: ReadonlySet<string>): string | undefined =>
  typeof v === 'string' && allowed.has(v) ? v : undefined

const asProtectedMulti = (v: AnswerValue, allowed: ReadonlySet<string>): string[] | undefined => {
  if (!Array.isArray(v) || v.length === 0) return undefined
  if (v.some((x) => !allowed.has(x))) return undefined
  if (new Set(v).size !== v.length) return undefined
  if ((v.includes('NONE') || v.includes('UNKNOWN')) && v.length !== 1) return undefined
  return v
}

/** HIP_00 is intentionally omitted: routing/tagging only. HIP_03A is optional non-gating context. */
export function toHipState(r: Responses, coreGeneralRed: boolean): HipState {
  return {
    recent_trauma: asAllowedString(r['HIP_01'], YES_NO_UNKNOWN) as HipState['recent_trauma'],
    limb_threatening_screen: asProtectedMulti(r['HIP_02'], HIP02),
    post_trauma_walking: asAllowedString(r['HIP_03'], WALKING) as HipState['post_trauma_walking'],
    stress_fracture_pattern: asProtectedMulti(r['HIP_04'], HIP04),
    infection_screen: asAllowedString(r['HIP_05'], INFECTION) as HipState['infection_screen'],
    progressive_neuro_screen: asAllowedString(r['HIP_06'], NEURO) as HipState['progressive_neuro_screen'],
    core_safety_already_urgent: coreGeneralRed,
  }
}

/** DoctorView panel path -- same allowlists/exclusions as toHipState, sourced from the submitted payload's modules.hip block instead of raw Responses. */
export function toHipStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): HipState {
  const m = r.modules.hip
  return {
    recent_trauma: asAllowedString(m.recent_trauma, YES_NO_UNKNOWN) as HipState['recent_trauma'],
    limb_threatening_screen: asProtectedMulti(m.limb_threatening_screen, HIP02),
    post_trauma_walking: asAllowedString(m.post_trauma_walking, WALKING) as HipState['post_trauma_walking'],
    stress_fracture_pattern: asProtectedMulti(m.stress_fracture_pattern, HIP04),
    infection_screen: asAllowedString(m.infection_screen, INFECTION) as HipState['infection_screen'],
    progressive_neuro_screen: asAllowedString(m.progressive_neuro_screen, NEURO) as HipState['progressive_neuro_screen'],
    core_safety_already_urgent: coreGeneralRed,
  }
}
