/**
 * Layer 2 of the WRIST_HAND_V1 port (see wristHandLogic.ts's top comment):
 * translates this app's real `Responses`/`DoctorPayload` into
 * `WristHandState`. All translation risk lives here.
 *
 * Like kneeAdapter.ts/elbowAdapter.ts, this file does not call into any
 * other module's adapter/logic -- WRIST_HAND_V1 has no shared-population
 * safety engine to reuse (wristHandLogic.ts's top comment / CLOSED Tablet
 * doc §3 WH_13). It is a plain string/string[] mapping, matching
 * elbowAdapter.ts's shape for a module with no clinician-entered objective
 * field in this iteration (`WRIST_HAND_V1_Fable_Integration_Plan_v0.1.md`
 * §3.3 -- no new JudgmentPanel field).
 *
 * F1-style invariant: `ELBOW_00` (arm_hand_region_discriminator) is
 * deliberately NOT read here -- it is routing/tagging only, consumed
 * exclusively by coreSpec.ts's `IS_PRIMARY_WRIST_HAND_SAFETY` gate, and
 * never enters `WristHandState`.
 *
 * Second, WRIST_HAND-specific invariant: `WH_04A` (prior X-ray context) is
 * likewise deliberately NOT read here -- it is pure non-gating context
 * (Fable plan §9), preserved only in `modules.wrist_hand`'s raw block in
 * coreSpec.ts for Doctor View display, never in `WristHandState`.
 *
 * Protected single-choice fields are runtime allowlisted here rather than
 * merely type-cast. An unrecognized string is translated to `undefined`,
 * which Layer 1 already treats as the CLOSED contract's fail-closed
 * missing/malformed path (minimum REVIEW_REQUIRED). This is a translation
 * hardening only; it does not change any clinical threshold.
 */

import type { AnswerValue, Responses } from '../types'
import type { WristHandState } from './wristHandLogic'
import type { DoctorPayload } from '../doctor/types'

const asStringArray = (v: AnswerValue): string[] | undefined => (Array.isArray(v) ? v : undefined)

const YES_NO_UNKNOWN = new Set(['YES', 'NO', 'UNKNOWN'])
const INFECTION_SCREEN = new Set(['NONE', 'LOCALIZED_STABLE', 'FINGER_LOCALIZED_SWOLLEN_PAINFUL', 'SYSTEMIC_OR_RAPIDLY_SPREADING', 'UNKNOWN'])
const SENSORY_PATTERN = new Set(['MEDIAN_DISTRIBUTION', 'ULNAR_DISTRIBUTION', 'MULTIPLE_OR_BOTH', 'NONE', 'UNKNOWN'])

const asAllowedString = (v: AnswerValue, allowed: ReadonlySet<string>): string | undefined =>
  typeof v === 'string' && allowed.has(v) ? v : undefined

/**
 * App.tsx submission-path adapter. `coreGeneralRed` is
 * `computeFlags(r).general_red` -- passed in rather than imported, same
 * pattern as toElbowState/toKneeState/toShoulderState (avoids a circular
 * import with coreSpec.ts).
 */
export function toWristHandState(r: Responses, coreGeneralRed: boolean): WristHandState {
  return {
    wrist_hand_recent_trauma: asAllowedString(r['WH_01'], YES_NO_UNKNOWN) as WristHandState['wrist_hand_recent_trauma'],
    wrist_hand_deformity_neurovascular_open_injury_screen: asStringArray(r['WH_02']),
    wrist_hand_post_trauma_major_function_loss: asAllowedString(
      r['WH_03'],
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_trauma_major_function_loss'],
    wrist_hand_post_trauma_radial_thumb_base_pain: asAllowedString(
      r['WH_04'],
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_trauma_radial_thumb_base_pain'],
    wrist_hand_post_trauma_fixed_motion_block: asAllowedString(
      r['WH_05'],
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_trauma_fixed_motion_block'],
    wrist_hand_wound_exposure: asStringArray(r['WH_06']),
    wrist_hand_post_wound_active_motion_loss: asAllowedString(
      r['WH_06A'],
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_wound_active_motion_loss'],
    wrist_hand_infection_broad_screen: asAllowedString(
      r['WH_07'],
      INFECTION_SCREEN,
    ) as WristHandState['wrist_hand_infection_broad_screen'],
    wrist_hand_flexor_sheath_followup: asStringArray(r['WH_07A']),
    wrist_hand_distal_sensory_pattern: asAllowedString(
      r['WH_08'],
      SENSORY_PATTERN,
    ) as WristHandState['wrist_hand_distal_sensory_pattern'],
    wrist_hand_motor_progression_screen: asStringArray(r['WH_08A']),
    core_safety_already_urgent: coreGeneralRed,
  }
}

/**
 * DoctorView-side counterpart, reading from the structured
 * `DoctorPayload['responses']` shape. `coreGeneralRed` here is
 * `payload.flags.general_red` (the caller already has the full
 * `DoctorPayload`, not just `.responses`).
 */
export function toWristHandStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): WristHandState {
  const m = r.modules.wrist_hand

  return {
    wrist_hand_recent_trauma: asAllowedString(m.recent_trauma, YES_NO_UNKNOWN) as WristHandState['wrist_hand_recent_trauma'],
    wrist_hand_deformity_neurovascular_open_injury_screen: asStringArray(m.deformity_neurovascular_open_injury_screen),
    wrist_hand_post_trauma_major_function_loss: asAllowedString(
      m.post_trauma_major_function_loss,
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_trauma_major_function_loss'],
    wrist_hand_post_trauma_radial_thumb_base_pain: asAllowedString(
      m.post_trauma_radial_thumb_base_pain,
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_trauma_radial_thumb_base_pain'],
    wrist_hand_post_trauma_fixed_motion_block: asAllowedString(
      m.post_trauma_fixed_motion_block,
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_trauma_fixed_motion_block'],
    wrist_hand_wound_exposure: asStringArray(m.wound_exposure),
    wrist_hand_post_wound_active_motion_loss: asAllowedString(
      m.post_wound_active_motion_loss,
      YES_NO_UNKNOWN,
    ) as WristHandState['wrist_hand_post_wound_active_motion_loss'],
    wrist_hand_infection_broad_screen: asAllowedString(
      m.infection_broad_screen,
      INFECTION_SCREEN,
    ) as WristHandState['wrist_hand_infection_broad_screen'],
    wrist_hand_flexor_sheath_followup: asStringArray(m.flexor_sheath_followup),
    wrist_hand_distal_sensory_pattern: asAllowedString(
      m.distal_sensory_pattern,
      SENSORY_PATTERN,
    ) as WristHandState['wrist_hand_distal_sensory_pattern'],
    wrist_hand_motor_progression_screen: asStringArray(m.motor_progression_screen),
    core_safety_already_urgent: coreGeneralRed,
  }
}