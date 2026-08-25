/** TMJ_V1 pure safety engine. Literal port of T1-T8 CLOSED + Tablet v0.1. HFJ_00 never enters state. */
export type TmjSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type DentalInfection = 'NO_CONCERN' | 'LOCALIZED_TOOTH_OR_GUM_PAIN_SWELLING_OR_PUS_TASTE' | 'FEVER_WITH_LOCALIZED_DENTAL_OR_ORAL_CONCERN' | 'LARGE_OR_SPREADING_SWELLING_OR_SEVERE_SYSTEMIC_ILLNESS' | 'EYE_AIRWAY_OR_SWALLOW_COMPROMISE' | 'UNKNOWN'
type Neuro = 'NO' | 'NEW_OR_PERSISTENT_FACIAL_NUMBNESS_OR_FOCAL_NEURO_CHANGE' | 'UNKNOWN'
type Lock = 'NO_CURRENT_FIXED_LOCK' | 'CURRENTLY_LOCKED_AND_CANNOT_OPEN_OR_CLOSE_NORMALLY' | 'UNKNOWN'

const TMJ01_URGENT = new Set([
  'JAW_CURRENTLY_STUCK_OPEN_OR_ABNORMAL_POSITION',
  'SEVERE_FACIAL_OR_JAW_TRAUMA_WITH_GROSS_DEFORMITY',
  'UNCONTROLLED_HEAVY_ORAL_BLEEDING',
  'BREATHING_OR_SWALLOWING_COMPROMISE_WITH_SWELLING_OR_INJURY',
])
const TMJ01_REVIEW = 'TRAUMA_WITH_NEW_BITE_CHANGE_OR_MARKED_FUNCTION_LOSS'
const GCA_PATTERN = new Set(['NEW_JAW_CLAUDICATION_WITH_CHEWING','NEW_SCALP_OR_TEMPORAL_PAIN_TENDERNESS_PATTERN'])
const GCA_VISUAL = 'NEW_TRANSIENT_VISUAL_DISTURBANCE_DIPLOPIA_OR_VISUAL_LOSS'

export interface TmjState {
  trauma_injury_screen?: string[]
  dental_oral_infection_screen?: DentalInfection
  gca_history_screen?: string[]
  facial_neuro_screen?: Neuro
  current_lock_screen?: Lock
  patient_age?: number
  core_safety_already_urgent: boolean
}
export interface TmjComputedFields {
  tmj_safety_status: TmjSafetyStatus
  trauma_or_dislocation_assessment_required: boolean
  dental_or_oral_assessment_required: boolean
  infection_assessment_required: boolean
  gca_assessment_required: boolean
  neuro_assessment_required: boolean
  expedited_referral_consider: boolean
}
const exact=(a:string[]|undefined,v:string)=>Array.isArray(a)&&a.length===1&&a[0]===v

export function computeTmjFlags(s: TmjState): TmjComputedFields {
  let urgent=s.core_safety_already_urgent
  let review=false
  let trauma=false
  let dental=false
  let infection=false
  let gca=false
  let neuro=false
  let expedited=false

  const t1=s.trauma_injury_screen
  if(!t1||t1.length===0) review=true
  else {
    if(t1.some(v=>TMJ01_URGENT.has(v))) urgent=true
    if(t1.includes(TMJ01_REVIEW)){review=true;trauma=true}
    if(t1.includes('UNKNOWN')) review=true
    if(!exact(t1,'NONE')) review=true
  }

  const t2=s.dental_oral_infection_screen
  if(t2===undefined||t2==='UNKNOWN') review=true
  else if(t2==='LOCALIZED_TOOTH_OR_GUM_PAIN_SWELLING_OR_PUS_TASTE'||t2==='FEVER_WITH_LOCALIZED_DENTAL_OR_ORAL_CONCERN'){
    review=true;dental=true;infection=true
  } else if(t2==='LARGE_OR_SPREADING_SWELLING_OR_SEVERE_SYSTEMIC_ILLNESS'||t2==='EYE_AIRWAY_OR_SWALLOW_COMPROMISE'){
    urgent=true;review=true;infection=true
  }

  const t3=s.gca_history_screen
  if(!t3||t3.length===0) review=true
  else if(t3.includes('UNKNOWN')) review=true
  else if(!exact(t3,'NONE')){
    review=true
    const compatible=t3.some(v=>GCA_PATTERN.has(v))
    const visual=t3.includes(GCA_VISUAL)
    if(compatible){
      // Age is a final-payload modifier. Unknown age cannot be treated as negative.
      if(s.patient_age===undefined){gca=true;expedited=true}
      else if(s.patient_age>=50){
        gca=true;expedited=true
        if(visual) urgent=true
      }
    }
  }

  const t4=s.facial_neuro_screen
  if(t4===undefined||t4==='UNKNOWN') review=true
  else if(t4==='NEW_OR_PERSISTENT_FACIAL_NUMBNESS_OR_FOCAL_NEURO_CHANGE'){
    review=true;neuro=true;expedited=true
  }

  const t5=s.current_lock_screen
  if(t5===undefined||t5==='UNKNOWN') review=true
  else if(t5==='CURRENTLY_LOCKED_AND_CANNOT_OPEN_OR_CLOSE_NORMALLY'){
    review=true;trauma=true
  }

  return {
    tmj_safety_status:urgent?'URGENT_REVIEW':review?'REVIEW_REQUIRED':'CLEAR',
    trauma_or_dislocation_assessment_required:trauma,
    dental_or_oral_assessment_required:dental,
    infection_assessment_required:infection,
    gca_assessment_required:gca,
    neuro_assessment_required:neuro,
    expedited_referral_consider:expedited,
  }
}
