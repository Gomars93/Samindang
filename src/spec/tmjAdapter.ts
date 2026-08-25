import type { AnswerValue, Responses } from '../types'
import type { TmjState } from './tmjLogic'
import type { DoctorPayload } from '../doctor/types'

const TMJ01=new Set(['JAW_CURRENTLY_STUCK_OPEN_OR_ABNORMAL_POSITION','SEVERE_FACIAL_OR_JAW_TRAUMA_WITH_GROSS_DEFORMITY','UNCONTROLLED_HEAVY_ORAL_BLEEDING','BREATHING_OR_SWALLOWING_COMPROMISE_WITH_SWELLING_OR_INJURY','TRAUMA_WITH_NEW_BITE_CHANGE_OR_MARKED_FUNCTION_LOSS','NONE','UNKNOWN'])
const TMJ02=new Set(['NO_CONCERN','LOCALIZED_TOOTH_OR_GUM_PAIN_SWELLING_OR_PUS_TASTE','FEVER_WITH_LOCALIZED_DENTAL_OR_ORAL_CONCERN','LARGE_OR_SPREADING_SWELLING_OR_SEVERE_SYSTEMIC_ILLNESS','EYE_AIRWAY_OR_SWALLOW_COMPROMISE','UNKNOWN'])
const TMJ03=new Set(['NEW_JAW_CLAUDICATION_WITH_CHEWING','NEW_SCALP_OR_TEMPORAL_PAIN_TENDERNESS_PATTERN','NEW_TRANSIENT_VISUAL_DISTURBANCE_DIPLOPIA_OR_VISUAL_LOSS','NONE','UNKNOWN'])
const TMJ04=new Set(['NO','NEW_OR_PERSISTENT_FACIAL_NUMBNESS_OR_FOCAL_NEURO_CHANGE','UNKNOWN'])
const TMJ05=new Set(['NO_CURRENT_FIXED_LOCK','CURRENTLY_LOCKED_AND_CANNOT_OPEN_OR_CLOSE_NORMALLY','UNKNOWN'])
const asAllowedString=(v:AnswerValue,a:ReadonlySet<string>):string|undefined=>typeof v==='string'&&a.has(v)?v:undefined
const asProtectedMulti=(v:AnswerValue,a:ReadonlySet<string>):string[]|undefined=>{
  if(!Array.isArray(v)||v.length===0)return undefined
  if(v.some(x=>!a.has(x)))return undefined
  if(new Set(v).size!==v.length)return undefined
  if((v.includes('NONE')||v.includes('UNKNOWN'))&&v.length!==1)return undefined
  return v
}
/** HFJ_00 is deliberately omitted: routing/tagging only. */
export function toTmjState(r:Responses,coreGeneralRed:boolean,patientAge?:number):TmjState{
  return {
    trauma_injury_screen:asProtectedMulti(r['TMJ_01'],TMJ01),
    dental_oral_infection_screen:asAllowedString(r['TMJ_02'],TMJ02) as TmjState['dental_oral_infection_screen'],
    gca_history_screen:asProtectedMulti(r['TMJ_03'],TMJ03),
    facial_neuro_screen:asAllowedString(r['TMJ_04'],TMJ04) as TmjState['facial_neuro_screen'],
    current_lock_screen:asAllowedString(r['TMJ_05'],TMJ05) as TmjState['current_lock_screen'],
    patient_age:patientAge,
    core_safety_already_urgent:coreGeneralRed,
  }
}

/**
 * DoctorView-side counterpart, reading from the structured
 * `DoctorPayload['responses']` shape (see wristHandAdapter.ts/
 * elbowAdapter.ts's `toXStateFromDoctorPayload` for the same pattern).
 * `HFJ_00` is deliberately not read here either -- same routing/tagging
 * exclusion as `toTmjState`.
 */
export function toTmjStateFromDoctorPayload(r:DoctorPayload['responses'],coreGeneralRed:boolean,patientAge?:number):TmjState{
  const m=r.modules.tmj
  return {
    trauma_injury_screen:asProtectedMulti(m.trauma_dislocation_screen,TMJ01),
    dental_oral_infection_screen:asAllowedString(m.dental_infection_screen,TMJ02) as TmjState['dental_oral_infection_screen'],
    gca_history_screen:asProtectedMulti(m.gca_history_screen,TMJ03),
    facial_neuro_screen:asAllowedString(m.facial_neuro_screen,TMJ04) as TmjState['facial_neuro_screen'],
    current_lock_screen:asAllowedString(m.current_lock_screen,TMJ05) as TmjState['current_lock_screen'],
    patient_age:patientAge,
    core_safety_already_urgent:coreGeneralRed,
  }
}
