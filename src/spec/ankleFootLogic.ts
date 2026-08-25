/**
 * ANKLE_FOOT_V1 pure safety engine.
 * Literal port of the clinically CLOSED A1-A8 contract and Tablet Question Set v0.1.
 * AF_00 is routing/tagging only and deliberately never enters this state.
 */

export type AnkleFootSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'
type WalkStatus = 'CAN_WALK_NORMALLY' | 'CAN_WALK_BUT_MARKED_DIFFICULTY' | 'CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS' | 'UNKNOWN'
type InfectionStatus = 'NO_CONCERN' | 'LOCALIZED_STABLE_RED_HOT_SWOLLEN_OR_WOUND' | 'SYSTEMIC_OR_RAPIDLY_WORSENING' | 'SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN' | 'UNKNOWN'
type DvtStatus = 'NO' | 'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN' | 'UNKNOWN'
type NeuroStatus = 'NO' | 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS' | 'UNKNOWN'

const AF02_URGENT_ALWAYS = new Set([
  'SEVERE_OPEN_INJURY_OR_BONE_EXPOSURE',
  'UNCONTROLLED_HEAVY_BLEEDING',
  'FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE',
])
const AF02_TRAUMA_NEURO = 'NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA'
const AF04_REVIEW = 'MARKED_MIDFOOT_FUNCTION_OR_WEIGHT_BEARING_DIFFICULTY'
const AF05_REVIEW = new Set([
  'SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF',
  'NEW_MARKED_LOSS_OF_PUSH_OFF_OR_TOE_RISE',
])

export interface AnkleFootState {
  recent_trauma?: YesNoUnknown // AF_01
  limb_threatening_screen?: string[] // AF_02
  post_trauma_walking?: WalkStatus // AF_03, shown only AF_01=YES
  midfoot_supportive_screen?: string[] // AF_04, conditional
  achilles_rupture_screen?: string[] // AF_05, conditional
  infection_screen?: InfectionStatus // AF_06
  dvt_pattern?: DvtStatus // AF_07, conditional
  progressive_neuro_screen?: NeuroStatus // AF_08
  af04_shown: boolean
  af05_shown: boolean
  af07_shown: boolean
  core_safety_already_urgent: boolean
}

export interface AnkleFootComputedFields {
  ankle_foot_safety_status: AnkleFootSafetyStatus
  fracture_imaging_consider: boolean
  achilles_rupture_assessment_required: boolean
  infection_assessment_required: boolean
  dvt_assessment_required: boolean
  neuro_assessment_required: boolean
  expedited_referral_consider: boolean
}

const exact = (a: string[] | undefined, v: string): boolean => Array.isArray(a) && a.length === 1 && a[0] === v

export function computeAnkleFootFlags(s: AnkleFootState): AnkleFootComputedFields {
  let urgent = s.core_safety_already_urgent
  let review = false
  let fracture = false
  let achilles = false
  let infection = false
  let dvt = false
  let neuro = false
  let expedited = false

  // AF_01 is protected. UNKNOWN/missing fail closed; YES/NO alone do not escalate.
  if (s.recent_trauma === undefined || s.recent_trauma === 'UNKNOWN') review = true
  const trauma = s.recent_trauma === 'YES'

  // AF_02 is always shown and protected.
  const af02 = s.limb_threatening_screen
  if (!af02 || af02.length === 0) review = true
  else {
    if (af02.some((v) => AF02_URGENT_ALWAYS.has(v))) urgent = true
    if (af02.includes(AF02_TRAUMA_NEURO)) {
      if (trauma) urgent = true
      else {
        review = true
        neuro = true
        expedited = true
      }
    }
    if (af02.includes('UNKNOWN')) review = true
    if (!exact(af02, 'NONE')) review = true
  }

  // AF_03 is shown only for concrete trauma YES.
  if (trauma) {
    if (s.post_trauma_walking === undefined || s.post_trauma_walking === 'UNKNOWN') review = true
    if (s.post_trauma_walking === 'CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS') {
      review = true
      fracture = true
    }
  }

  // AF_04: plantar bruising alone is supportive only. Marked dysfunction is REVIEW + imaging.
  if (s.af04_shown) {
    const af04 = s.midfoot_supportive_screen
    if (!af04 || af04.length === 0) review = true
    else {
      if (af04.includes(AF04_REVIEW)) {
        review = true
        fracture = true
      }
      if (af04.includes('UNKNOWN')) review = true
      // NEW_PLANTAR_MIDFOOT_BRUISING_NOTICED alone deliberately does not escalate.
      if (!exact(af04, 'NONE') &&
          !exact(af04, 'NEW_PLANTAR_MIDFOOT_BRUISING_NOTICED') &&
          !af04.includes(AF04_REVIEW) &&
          !af04.includes('UNKNOWN')) review = true
    }
  }

  // AF_05: either Achilles item alone is enough (OR semantics); never automatic URGENT.
  if (s.af05_shown) {
    const af05 = s.achilles_rupture_screen
    if (!af05 || af05.length === 0) {
      review = true
      achilles = true
      expedited = true
    } else if (af05.some((v) => AF05_REVIEW.has(v))) {
      review = true
      achilles = true
      expedited = true
    } else if (af05.includes('UNKNOWN')) {
      review = true
      achilles = true
      expedited = true
    } else if (!exact(af05, 'NONE')) {
      review = true
      achilles = true
      expedited = true
    }
  }

  // AF_06 opaque single-choice OR semantics.
  if (s.infection_screen === undefined || s.infection_screen === 'UNKNOWN') {
    review = true
    infection = true
  } else if (s.infection_screen === 'LOCALIZED_STABLE_RED_HOT_SWOLLEN_OR_WOUND') {
    review = true
    infection = true
  } else if (
    s.infection_screen === 'SYSTEMIC_OR_RAPIDLY_WORSENING' ||
    s.infection_screen === 'SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN'
  ) {
    urgent = true
    review = true
    infection = true
  }

  // AF_07 conditional DVT screen. Wells is never computed here.
  if (s.af07_shown) {
    if (s.dvt_pattern === undefined || s.dvt_pattern === 'UNKNOWN') {
      review = true
      dvt = true
    } else if (s.dvt_pattern === 'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN') {
      review = true
      dvt = true
    }
  }

  // AF_08 protected non-traumatic progressive neurologic screen.
  if (s.progressive_neuro_screen === undefined || s.progressive_neuro_screen === 'UNKNOWN') {
    review = true
    neuro = true
    expedited = true
  } else if (s.progressive_neuro_screen === 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS') {
    review = true
    neuro = true
    expedited = true
  }

  const ankle_foot_safety_status: AnkleFootSafetyStatus = urgent
    ? 'URGENT_REVIEW'
    : review
      ? 'REVIEW_REQUIRED'
      : 'CLEAR'

  return {
    ankle_foot_safety_status,
    fracture_imaging_consider: fracture,
    achilles_rupture_assessment_required: achilles,
    infection_assessment_required: infection,
    dvt_assessment_required: dvt,
    neuro_assessment_required: neuro,
    expedited_referral_consider: expedited,
  }
}
