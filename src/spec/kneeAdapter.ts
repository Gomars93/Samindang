/**
 * Layer 2 of the KNEE_V1 port (see kneeLogic.ts's top comment): translates
 * this app's real `Responses`/`DoctorPayload` into `KneeState`. All
 * translation risk lives here.
 *
 * Unlike shoulderAdapter.ts, this file does not call into any other
 * module's adapter/logic -- KNEE_V1 has no shared-population safety engine
 * to reuse (kneeLogic.ts's top comment / Opus v0.2 K9 finding). It is a
 * plain string/string[] mapping, matching lbpAdapter.ts's/neckAdapter.ts's
 * shape for a module with no clinician-entered objective field in this
 * iteration (Fable integration plan §3.2/§5.5 -- no new JudgmentPanel field).
 */

import type { AnswerValue, Responses } from '../types'
import type { KneeState } from './kneeLogic'
import type { DoctorPayload } from '../doctor/types'

const asStringArray = (v: AnswerValue): string[] | undefined => (Array.isArray(v) ? v : undefined)

const asString = (v: AnswerValue): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * App.tsx submission-path adapter. `coreGeneralRed` is
 * `computeFlags(r).general_red` -- passed in rather than imported, same
 * pattern as toShoulderState/toLbpState (avoids a circular import with
 * coreSpec.ts).
 */
export function toKneeState(r: Responses, coreGeneralRed: boolean): KneeState {
  return {
    knee_recent_trauma_or_sudden_load: asString(r['KNEE_01']) as KneeState['knee_recent_trauma_or_sudden_load'],
    knee_deformity_neurovascular_screen: asStringArray(r['KNEE_02']),
    knee_spontaneously_reduced_dislocation_screen: asString(
      r['KNEE_02A'],
    ) as KneeState['knee_spontaneously_reduced_dislocation_screen'],
    knee_post_trauma_weight_bearing_failure: asString(
      r['KNEE_03'],
    ) as KneeState['knee_post_trauma_weight_bearing_failure'],
    knee_extensor_mechanism_concern: asString(r['KNEE_04']) as KneeState['knee_extensor_mechanism_concern'],
    knee_true_locked_extension_block: asString(r['KNEE_05']) as KneeState['knee_true_locked_extension_block'],
    knee_unilateral_leg_dvt_symptom_screen: asString(
      r['KNEE_06'],
    ) as KneeState['knee_unilateral_leg_dvt_symptom_screen'],
    knee_dvt_risk_context: asStringArray(r['KNEE_06A']),
    knee_dvt_pe_associated_screen: asStringArray(r['KNEE_06B']),
    knee_septic_joint_emergency_screen: asString(
      r['KNEE_07'],
    ) as KneeState['knee_septic_joint_emergency_screen'],
    knee_referred_non_knee_redflag_screen: asStringArray(r['KNEE_08']),
    core_safety_already_urgent: coreGeneralRed,
  }
}

/**
 * DoctorView-side counterpart, reading from the structured
 * `DoctorPayload['responses']` shape. `coreGeneralRed` here is
 * `payload.flags.general_red` (the caller already has the full
 * `DoctorPayload`, not just `.responses`).
 */
export function toKneeStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): KneeState {
  const m = r.modules.knee

  return {
    knee_recent_trauma_or_sudden_load: asString(
      m.recent_trauma_or_sudden_load,
    ) as KneeState['knee_recent_trauma_or_sudden_load'],
    knee_deformity_neurovascular_screen: asStringArray(m.deformity_neurovascular_screen),
    knee_spontaneously_reduced_dislocation_screen: asString(
      m.spontaneously_reduced_dislocation_screen,
    ) as KneeState['knee_spontaneously_reduced_dislocation_screen'],
    knee_post_trauma_weight_bearing_failure: asString(
      m.post_trauma_weight_bearing_failure,
    ) as KneeState['knee_post_trauma_weight_bearing_failure'],
    knee_extensor_mechanism_concern: asString(
      m.extensor_mechanism_concern,
    ) as KneeState['knee_extensor_mechanism_concern'],
    knee_true_locked_extension_block: asString(
      m.true_locked_extension_block,
    ) as KneeState['knee_true_locked_extension_block'],
    knee_unilateral_leg_dvt_symptom_screen: asString(
      m.unilateral_leg_dvt_symptom_screen,
    ) as KneeState['knee_unilateral_leg_dvt_symptom_screen'],
    knee_dvt_risk_context: asStringArray(m.dvt_risk_context),
    knee_dvt_pe_associated_screen: asStringArray(m.dvt_pe_associated_screen),
    knee_septic_joint_emergency_screen: asString(
      m.septic_joint_emergency_screen,
    ) as KneeState['knee_septic_joint_emergency_screen'],
    knee_referred_non_knee_redflag_screen: asStringArray(m.referred_non_knee_redflag_screen),
    core_safety_already_urgent: coreGeneralRed,
  }
}
