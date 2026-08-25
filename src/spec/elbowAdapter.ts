/**
 * Layer 2 of the ELBOW_V1 port (see elbowLogic.ts's top comment): translates
 * this app's real `Responses`/`DoctorPayload` into `ElbowState`. All
 * translation risk lives here.
 *
 * Like kneeAdapter.ts, this file does not call into any other module's
 * adapter/logic -- ELBOW_V1 has no shared-population safety engine to reuse
 * (elbowLogic.ts's top comment / CLOSED Tablet doc §6). It is a plain
 * string/string[] mapping, matching kneeAdapter.ts's shape for a module
 * with no clinician-entered objective field in this iteration
 * (`ELBOW_V1_Fable_Integration_Plan_v0.1.md` §3.2 -- no new JudgmentPanel
 * field).
 *
 * F1-style invariant: `ELBOW_00` (arm_hand_region_discriminator) is
 * deliberately NOT read here -- it is routing/tagging only, consumed
 * exclusively by coreSpec.ts's `IS_PRIMARY_ELBOW_SAFETY` gate, and never
 * enters `ElbowState`.
 */

import type { AnswerValue, Responses } from '../types'
import type { ElbowState } from './elbowLogic'
import type { DoctorPayload } from '../doctor/types'

const asStringArray = (v: AnswerValue): string[] | undefined => (Array.isArray(v) ? v : undefined)

const asString = (v: AnswerValue): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * App.tsx submission-path adapter. `coreGeneralRed` is
 * `computeFlags(r).general_red` -- passed in rather than imported, same
 * pattern as toKneeState/toShoulderState/toLbpState (avoids a circular
 * import with coreSpec.ts).
 */
export function toElbowState(r: Responses, coreGeneralRed: boolean): ElbowState {
  return {
    elbow_recent_trauma_or_sudden_load: asString(r['ELBOW_01']) as ElbowState['elbow_recent_trauma_or_sudden_load'],
    elbow_deformity_neurovascular_screen: asStringArray(r['ELBOW_02']),
    elbow_spontaneously_reduced_dislocation_screen: asString(
      r['ELBOW_02A'],
    ) as ElbowState['elbow_spontaneously_reduced_dislocation_screen'],
    elbow_post_trauma_functional_loss: asString(r['ELBOW_03']) as ElbowState['elbow_post_trauma_functional_loss'],
    elbow_distal_biceps_concern: asString(r['ELBOW_04']) as ElbowState['elbow_distal_biceps_concern'],
    elbow_distal_triceps_concern: asString(r['ELBOW_05']) as ElbowState['elbow_distal_triceps_concern'],
    elbow_true_locked_rom_block: asString(r['ELBOW_06']) as ElbowState['elbow_true_locked_rom_block'],
    elbow_septic_joint_emergency_screen: asString(
      r['ELBOW_07'],
    ) as ElbowState['elbow_septic_joint_emergency_screen'],
    elbow_posterior_bursal_screen: asString(r['ELBOW_08']) as ElbowState['elbow_posterior_bursal_screen'],
    elbow_ulnar_sensory_screen: asString(r['ELBOW_09']) as ElbowState['elbow_ulnar_sensory_screen'],
    elbow_ulnar_motor_progression_screen: asStringArray(r['ELBOW_09A']),
    elbow_referred_proximal_screen: asStringArray(r['ELBOW_10']),
    elbow_cardiac_associated_screen: asStringArray(r['ELBOW_11']),
    core_safety_already_urgent: coreGeneralRed,
  }
}

/**
 * DoctorView-side counterpart, reading from the structured
 * `DoctorPayload['responses']` shape. `coreGeneralRed` here is
 * `payload.flags.general_red` (the caller already has the full
 * `DoctorPayload`, not just `.responses`).
 */
export function toElbowStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): ElbowState {
  const m = r.modules.elbow

  return {
    elbow_recent_trauma_or_sudden_load: asString(
      m.recent_trauma_or_sudden_load,
    ) as ElbowState['elbow_recent_trauma_or_sudden_load'],
    elbow_deformity_neurovascular_screen: asStringArray(m.deformity_neurovascular_screen),
    elbow_spontaneously_reduced_dislocation_screen: asString(
      m.spontaneously_reduced_dislocation_screen,
    ) as ElbowState['elbow_spontaneously_reduced_dislocation_screen'],
    elbow_post_trauma_functional_loss: asString(
      m.post_trauma_functional_loss,
    ) as ElbowState['elbow_post_trauma_functional_loss'],
    elbow_distal_biceps_concern: asString(m.distal_biceps_concern) as ElbowState['elbow_distal_biceps_concern'],
    elbow_distal_triceps_concern: asString(m.distal_triceps_concern) as ElbowState['elbow_distal_triceps_concern'],
    elbow_true_locked_rom_block: asString(m.true_locked_rom_block) as ElbowState['elbow_true_locked_rom_block'],
    elbow_septic_joint_emergency_screen: asString(
      m.septic_joint_emergency_screen,
    ) as ElbowState['elbow_septic_joint_emergency_screen'],
    elbow_posterior_bursal_screen: asString(m.posterior_bursal_screen) as ElbowState['elbow_posterior_bursal_screen'],
    elbow_ulnar_sensory_screen: asString(m.ulnar_sensory_screen) as ElbowState['elbow_ulnar_sensory_screen'],
    elbow_ulnar_motor_progression_screen: asStringArray(m.ulnar_motor_progression_screen),
    elbow_referred_proximal_screen: asStringArray(m.referred_proximal_screen),
    elbow_cardiac_associated_screen: asStringArray(m.cardiac_associated_screen),
    core_safety_already_urgent: coreGeneralRed,
  }
}
