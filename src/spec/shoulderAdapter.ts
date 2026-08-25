/**
 * Layer 2 of the SHOULDER_V1 port (see shoulderLogic.ts's top comment):
 * translates this app's real `Responses`/`DoctorPayload` into
 * `ShoulderState`. All translation risk lives here.
 *
 * The one thing this file does that lbpAdapter.ts/neckAdapter.ts don't:
 * it calls `neckAdapter.ts`'s `toNeckState`/`toNeckStateFromDoctorPayload`
 * and `neckLogic.ts`'s `computeNeckFlags` DIRECTLY and takes only the
 * resulting `.neck_safety_status` -- this is the actual code-level
 * implementation of "canonical NECK safety is reused, never re-copied"
 * (v0.1.1 §2/§8, Fable integration invariant #2). No NECK enum, threshold,
 * or field is re-declared anywhere in this file.
 */

import type { AnswerValue, Responses } from '../types'
import type { ReproductiveStatus } from './coreSpec'
import type { ShoulderState } from './shoulderLogic'
import type { DoctorPayload } from '../doctor/types'
import { toNeckState, toNeckStateFromDoctorPayload } from './neckAdapter'
import { computeNeckFlags } from './neckLogic'

const asStringArray = (v: AnswerValue): string[] | undefined => (Array.isArray(v) ? v : undefined)

const asString = (v: AnswerValue): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * App.tsx submission-path adapter. `coreGeneralRed` is
 * `computeFlags(r).general_red` -- passed in rather than imported to avoid
 * a circular import (coreSpec.ts is the one that imports FROM this file;
 * see lbpAdapter.ts's top comment for the same pattern with
 * `deriveReproductiveStatus`).
 */
export function toShoulderState(
  r: Responses,
  repro: ReproductiveStatus,
  coreGeneralRed: boolean,
  clinicianObjectiveCuffWeakness: ShoulderState['clinician_objective_cuff_weakness'],
): ShoulderState {
  const neckFlags = computeNeckFlags(toNeckState(r, repro))

  return {
    shoulder_recent_trauma: asString(r['SH01']) as ShoulderState['shoulder_recent_trauma'],
    shoulder_trauma_emergency_screen: asStringArray(r['SH02']),
    shoulder_acute_traumatic_cuff_concern: asString(r['SH03']) as ShoulderState['shoulder_acute_traumatic_cuff_concern'],
    shoulder_infection_emergency_screen: asString(r['SH04']) as ShoulderState['shoulder_infection_emergency_screen'],
    shoulder_nonmechanical_cardiac_gap_screen: asString(
      r['SH05'],
    ) as ShoulderState['shoulder_nonmechanical_cardiac_gap_screen'],
    shoulder_bilateral_similar_stiff_pain: asString(r['SH06']) as ShoulderState['shoulder_bilateral_similar_stiff_pain'],
    neck_safety_status: neckFlags.neck_safety_status,
    core_safety_already_urgent: coreGeneralRed,
    clinician_objective_cuff_weakness: clinicianObjectiveCuffWeakness,
  }
}

/**
 * DoctorView-side counterpart, reading from the structured
 * `DoctorPayload['responses']` shape. `coreGeneralRed` here is
 * `payload.flags.general_red` (the caller already has the full
 * `DoctorPayload`, not just `.responses`).
 */
export function toShoulderStateFromDoctorPayload(
  r: DoctorPayload['responses'],
  coreGeneralRed: boolean,
  clinicianObjectiveCuffWeakness: ShoulderState['clinician_objective_cuff_weakness'],
): ShoulderState {
  const m = r.modules.shoulder
  const neckFlags = computeNeckFlags(toNeckStateFromDoctorPayload(r))

  return {
    shoulder_recent_trauma: asString(m.recent_trauma) as ShoulderState['shoulder_recent_trauma'],
    shoulder_trauma_emergency_screen: asStringArray(m.trauma_emergency_screen),
    shoulder_acute_traumatic_cuff_concern: asString(
      m.acute_traumatic_cuff_concern,
    ) as ShoulderState['shoulder_acute_traumatic_cuff_concern'],
    shoulder_infection_emergency_screen: asString(
      m.infection_emergency_screen,
    ) as ShoulderState['shoulder_infection_emergency_screen'],
    shoulder_nonmechanical_cardiac_gap_screen: asString(
      m.nonmechanical_cardiac_gap_screen,
    ) as ShoulderState['shoulder_nonmechanical_cardiac_gap_screen'],
    shoulder_bilateral_similar_stiff_pain: asString(
      m.bilateral_similar_stiff_pain,
    ) as ShoulderState['shoulder_bilateral_similar_stiff_pain'],
    neck_safety_status: neckFlags.neck_safety_status,
    core_safety_already_urgent: coreGeneralRed,
    clinician_objective_cuff_weakness: clinicianObjectiveCuffWeakness,
  }
}
