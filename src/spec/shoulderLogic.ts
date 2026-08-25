/**
 * SHOULDER_V1 safety-state logic.
 *
 * Two layers, same convention as neckLogic.ts's top comment. Ground truth
 * here is `SHOULDER_V1_Tablet_Question_Set_v0.1.1_CLOSED.md` §10-12
 * (Shoulder Safety Engine, Expedited Referral Flag, Intervention Lock) --
 * CLINICAL DECISIONS CLOSED (Opus v0.1 review -> v0.1 tablet draft -> Opus
 * v0.2 review [F1/F2/F3] -> v0.1.1 mechanical fixes -> re-review not
 * required per Opus v0.2's own conclusion).
 *
 * The single most load-bearing design point in this file: `ShoulderState`
 * does NOT re-derive cervical/neurological safety. It takes the ALREADY
 * -COMPUTED `neck_safety_status` as an input field. §10 rule 1 ("canonical
 * NECK/shared safety engine == URGENT_REVIEW") and the REVIEW_REQUIRED
 * counterpart are both satisfied by folding that single value into this
 * engine's own urgent/review computation -- never by re-implementing any
 * NECK_01-05 threshold here. `shoulderAdapter.ts` is what actually calls
 * `neckAdapter.ts`'s `toNeckState` and `neckLogic.ts`'s `computeNeckFlags`
 * directly (v0.1.1 §8 / Fable integration invariant #2) -- this file only
 * consumes the resulting status, exactly the way it would consume any
 * other pre-computed boolean/enum input.
 *
 * SHOULDER_V1 deliberately has NO separate treatment-safety engine (unlike
 * LBP_V1/NECK_V1) -- v0.1.1 §12 states "필요한 treatment safety는 기존
 * 공통 치료안전 계층에서 처리한다." This file does not compute
 * medication/pregnancy/osteoporosis treatment safety for shoulder; that is
 * an intentional v1 scope boundary from the CLOSED spec itself, not an
 * omission introduced here.
 *
 * MISSING contract: identical to lbpLogic.ts/neckLogic.ts -- unanswered
 * fields are `undefined`, never `null`.
 */

// ---------------------------------------------------------------------------
// Layer 1: literal port of SHOULDER_V1_Tablet_Question_Set_v0.1.1_CLOSED.md §10-12
// ---------------------------------------------------------------------------

import type { NeckSafetyStatus } from './neckLogic'

export type ShoulderSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

/** SH02 hard tier -- §10: unconditional URGENT_REVIEW. */
const SH02_URGENT = new Set(['DEFORMITY_OR_STILL_OUT', 'NEW_NEUROVASCULAR_CHANGE'])
/** SH02 soft tier -- §10: REVIEW_REQUIRED only. */
const SH02_REVIEW_ONLY = 'SEVERE_SWELLING_OR_CANNOT_MOVE'

export interface ShoulderState {
  shoulder_recent_trauma?: YesNoUnknown // SH01
  shoulder_trauma_emergency_screen?: string[] // SH02 (show_when SH01 === YES)
  shoulder_acute_traumatic_cuff_concern?: YesNoUnknown // SH03 (show_when SH01 === YES)
  shoulder_infection_emergency_screen?: YesNoUnknown // SH04
  shoulder_nonmechanical_cardiac_gap_screen?: YesNoUnknown // SH05
  shoulder_bilateral_similar_stiff_pain?: YesNoUnknown // SH06
  /**
   * Output of computeNeckFlags(toNeckState(...)) -- see this file's top
   * comment. Always present for the population this engine is ever run
   * against (any PAIN_01 === 'neck_shoulder' patient answers canonical
   * NECK_01-05 unconditionally, per F1), so this is not optional the way
   * the SH0x fields are.
   */
  neck_safety_status: NeckSafetyStatus
  /** Core's computeFlags(r).general_red -- §10 rule 6 / §3 SH05 skip note. */
  core_safety_already_urgent: boolean
  /** Clinician-entered exam finding -- §11's third expedited-referral trigger. */
  clinician_objective_cuff_weakness?: 'NONE' | 'NEW_WEAKNESS_AFTER_TRAUMA' | 'UNKNOWN'
}

export interface ShoulderComputedFields {
  shoulder_safety_status: ShoulderSafetyStatus
  expedited_referral_consider: boolean
  pmr_or_systemic_inflammatory_pattern_consider: boolean
}

const arraysEqual = (a: string[] | undefined, b: string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i])

/** SH01 status. §10 F3: YES alone never forces review (SH02/SH03 catch real risk instead). */
function sh01Status(v: ShoulderState['shoulder_recent_trauma']): { review: boolean; shown: boolean } {
  if (v === 'UNKNOWN' || v === undefined) return { review: true, shown: false }
  return { review: false, shown: v === 'YES' }
}

/**
 * SH02 status. Mirrors neckLogic.ts's n02Status shape: exactly `['NONE']`
 * is the only negative candidate; `shown=false` (SH01 !== 'YES') means this
 * screen was never applicable and contributes nothing.
 */
function sh02Status(v: string[] | undefined, shown: boolean): { urgent: boolean; review: boolean } {
  if (!shown) return { urgent: false, review: false }
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => SH02_URGENT.has(x))) return { urgent: true, review: true }
  if (v.includes(SH02_REVIEW_ONLY)) return { urgent: false, review: true }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/**
 * SH03 status. §10/§11: URGENT_REVIEW로 자동 승격하지 않는다-- YES/UNKNOWN
 * only ever reach REVIEW_REQUIRED, paired with expedited_referral_consider.
 */
function sh03Status(
  v: ShoulderState['shoulder_acute_traumatic_cuff_concern'],
  shown: boolean,
): { review: boolean; expedited: boolean } {
  if (!shown) return { review: false, expedited: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true, expedited: true }
  return { review: false, expedited: false } // 'NO'
}

function sh04Status(v: ShoulderState['shoulder_infection_emergency_screen']): { urgent: boolean; review: boolean } {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

function sh05Status(v: ShoulderState['shoulder_nonmechanical_cardiac_gap_screen']): { urgent: boolean; review: boolean } {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

/**
 * Port of v0.1.1 §10 Shoulder Safety Engine. §10's REVIEW_REQUIRED bullet
 * "canonical systemic screen positive/UNKNOWN/invalid" is not re-checked
 * separately here -- NECK_05 is part of the canonical NECK engine, so any
 * such positive already surfaces through `neck_safety_status` itself
 * (neckLogic.ts's own n05Status). Re-checking it here would be exactly the
 * kind of duplicate reimplementation constraint #4 prohibits.
 */
function shoulderSafetyStatus(s: ShoulderState): ShoulderSafetyStatus {
  const sh01 = sh01Status(s.shoulder_recent_trauma)
  const sh02 = sh02Status(s.shoulder_trauma_emergency_screen, sh01.shown)
  const sh03 = sh03Status(s.shoulder_acute_traumatic_cuff_concern, sh01.shown)
  const sh04 = sh04Status(s.shoulder_infection_emergency_screen)
  const sh05 = sh05Status(s.shoulder_nonmechanical_cardiac_gap_screen)

  const urgent =
    s.neck_safety_status === 'URGENT_REVIEW' ||
    sh02.urgent ||
    sh04.urgent ||
    sh05.urgent ||
    s.core_safety_already_urgent === true

  if (urgent) return 'URGENT_REVIEW'

  const review =
    s.neck_safety_status === 'REVIEW_REQUIRED' || sh01.review || sh02.review || sh03.review || sh04.review || sh05.review

  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/**
 * Port of v0.1.1 §11 Expedited Referral Flag. NOT a 4th safety status --
 * always computed alongside shoulder_safety_status, never merged into it.
 */
function expeditedReferralConsider(s: ShoulderState): boolean {
  const sh01Shown = s.shoulder_recent_trauma === 'YES'
  const sh03 = sh03Status(s.shoulder_acute_traumatic_cuff_concern, sh01Shown)
  if (sh03.expedited) return true
  return s.clinician_objective_cuff_weakness === 'NEW_WEAKNESS_AFTER_TRAUMA'
}

/**
 * `shoulder_safety_status !== 'CLEAR'` -- §12: locks BOTH routine exercise
 * recommendation AND routine shoulder manual-treatment suggestion. Unlike
 * NECK_V1, SHOULDER_V1 does not define a separate manipulation-risk lock
 * domain (§12: "NECK와 달리 shoulder-specific HVLA catastrophic-risk lock
 * domain을 새로 만들지 않는다") -- a single lock function is therefore
 * correct here, not an oversight relative to neckLogic.ts's two-lock split.
 */
export const shoulderSafetyLocked = (f: ShoulderComputedFields): boolean => f.shoulder_safety_status !== 'CLEAR'

/**
 * Port of v0.1.1's full computed-fields set. Always computed whenever
 * SHOULDER_V1 is active for a patient -- i.e. for the ENTIRE
 * `PAIN_01 === 'neck_shoulder'` population, never gated on NS01 (F1).
 */
export function computeShoulderFlags(state: ShoulderState): ShoulderComputedFields {
  return {
    shoulder_safety_status: shoulderSafetyStatus(state),
    expedited_referral_consider: expeditedReferralConsider(state),
    pmr_or_systemic_inflammatory_pattern_consider: state.shoulder_bilateral_similar_stiff_pain === 'YES',
  }
}
