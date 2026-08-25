/** HIP_V1 pure safety engine. Literal port of H1-H8 CLOSED + Tablet v0.1. HIP_00 never enters state. */
export type HipSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'
type Walking = 'NO_MARKED_WALKING_DIFFICULTY' | 'MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY' | 'UNKNOWN'
type Infection = 'NO_CONCERN' | 'LOCALIZED_STABLE_CONCERN' | 'SYSTEMIC_OR_RAPIDLY_WORSENING' | 'UNKNOWN'
type Neuro = 'NO' | 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS' | 'UNKNOWN'

const HIP02_ALWAYS_URGENT = new Set([
  'GROSS_DEFORMITY_OR_JOINT_STUCK_OUT_OF_POSITION',
  'SEVERE_OPEN_INJURY_OR_HEAVY_BLEEDING',
  'FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE',
])
const HIP02_TRAUMA_NEURO = 'NEW_MAJOR_DISTAL_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA'
const STRESS_PATTERN = new Set([
  'ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN',
  'RECENT_REPETITIVE_LOAD_RUNNING_JUMPING_MARCH_OR_LOAD_INCREASE',
  'PROGRESSIVE_WEIGHT_BEARING_PAIN_OR_WORSENING_WALKING_TOLERANCE',
])

export interface HipState {
  recent_trauma?: YesNoUnknown
  limb_threatening_screen?: string[]
  post_trauma_walking?: Walking
  stress_fracture_pattern?: string[]
  infection_screen?: Infection
  progressive_neuro_screen?: Neuro
  core_safety_already_urgent: boolean
}
export interface HipComputedFields {
  hip_safety_status: HipSafetyStatus
  fracture_imaging_consider: boolean
  stress_fracture_assessment_required: boolean
  infection_assessment_required: boolean
  neuro_assessment_required: boolean
  expedited_referral_consider: boolean
  loading_exercise_lock: boolean
}
const exact = (a: string[] | undefined, v: string) => Array.isArray(a) && a.length === 1 && a[0] === v

export function computeHipFlags(s: HipState): HipComputedFields {
  let urgent = s.core_safety_already_urgent
  let review = false
  let fracture = false
  let stress = false
  let infection = false
  let neuro = false
  let expedited = false
  let loadingLock = false

  if (s.recent_trauma === undefined || s.recent_trauma === 'UNKNOWN') review = true
  const trauma = s.recent_trauma === 'YES'

  const h2 = s.limb_threatening_screen
  if (!h2 || h2.length === 0) review = true
  else {
    if (h2.some((v) => HIP02_ALWAYS_URGENT.has(v))) urgent = true
    if (h2.includes(HIP02_TRAUMA_NEURO)) {
      if (trauma) urgent = true
      else { review = true; neuro = true; expedited = true }
    }
    if (h2.includes('UNKNOWN')) review = true
    if (!exact(h2, 'NONE')) review = true
  }

  if (trauma) {
    if (s.post_trauma_walking === undefined || s.post_trauma_walking === 'UNKNOWN') review = true
    if (s.post_trauma_walking === 'MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY') {
      review = true; fracture = true; expedited = true
    }
  }

  const h4 = s.stress_fracture_pattern
  if (!h4 || h4.length === 0) review = true
  else if (h4.includes('UNKNOWN')) review = true
  else if (!exact(h4, 'NONE')) {
    const compatible = [...STRESS_PATTERN].every((v) => h4.includes(v))
    if (compatible) {
      review = true; fracture = true; stress = true; loadingLock = true
    } else {
      // Partial positive pattern is not the CLOSED stress-fracture threshold, but remains a protected non-negative history.
      review = true
    }
  }

  if (s.infection_screen === undefined || s.infection_screen === 'UNKNOWN') {
    review = true; infection = true
  } else if (s.infection_screen === 'LOCALIZED_STABLE_CONCERN') {
    review = true; infection = true
  } else if (s.infection_screen === 'SYSTEMIC_OR_RAPIDLY_WORSENING') {
    urgent = true; review = true; infection = true
  }

  if (s.progressive_neuro_screen === undefined || s.progressive_neuro_screen === 'UNKNOWN') {
    review = true; neuro = true; expedited = true
  } else if (s.progressive_neuro_screen === 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS') {
    review = true; neuro = true; expedited = true
  }

  return {
    hip_safety_status: urgent ? 'URGENT_REVIEW' : review ? 'REVIEW_REQUIRED' : 'CLEAR',
    fracture_imaging_consider: fracture,
    stress_fracture_assessment_required: stress,
    infection_assessment_required: infection,
    neuro_assessment_required: neuro,
    expedited_referral_consider: expedited,
    loading_exercise_lock: loadingLock,
  }
}
