/**
 * Layer 2 of the LBP_V1 port (see lbpLogic.ts's top comment for why this is
 * a separate file from the literal Python port): translates this app's
 * real `Responses` (+ a clinician-entered exam input + patient age) into
 * `LbpState`. All translation risk lives here, where it's independently
 * testable — enum case mapping, Python's MISSING-sentinel vs. this app's
 * `null`/`undefined`, and the pregnancy-status derivation, in particular.
 */

import type { AnswerValue, Responses } from '../types'
import type { ReproductiveStatus } from './coreSpec'
import type { LbpState } from './lbpLogic'
import type { DoctorPayload } from '../doctor/types'
import { ageFromBirthDate } from '../lib/age'

/*
 * NOTE on `ReproductiveStatus` being imported here from coreSpec.ts while
 * coreSpec.ts also calls into this file: this is a type-only import
 * (`import type`), erased entirely at compile time by `isolatedModules`, so
 * it creates no runtime circular dependency. `deriveReproductiveStatus`
 * itself is called by the caller (coreSpec.ts's `buildResponsePayload`,
 * which already has it in scope) and passed in as `repro` below, rather
 * than imported as a value here -- that's what actually avoids the cycle.
 */

const asStringArray = (v: AnswerValue): string[] | undefined => (Array.isArray(v) ? v : undefined)

const asString = (v: AnswerValue): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * `HISTORY_01`'s stored values are lowercase (`'cancer'`, `'osteoporosis'`);
 * `lbp_logic.py`'s `REVIEW_HISTORY_VALUES` is uppercase (`'CANCER'`,
 * `'OSTEOPOROSIS'`). Porting `major_history_categories` through unchanged
 * would silently disable the single most informative malignancy red flag
 * (decision doc §8 cites Downie 2013: "malignancy: prior malignancy가 가장
 * informative") — this table exists specifically so that never happens.
 * Every `HISTORY_01` option is mapped (not just the two that matter to
 * `lbp_logic.py` today) so nothing is ever silently dropped.
 */
const HISTORY_CATEGORY_MAP: Record<string, string> = {
  cardiovascular: 'CARDIOVASCULAR',
  diabetes: 'DIABETES',
  cerebrovascular: 'CEREBROVASCULAR',
  liver: 'LIVER',
  kidney: 'KIDNEY',
  thyroid: 'THYROID',
  cancer: 'CANCER',
  bleeding_disorder: 'BLEEDING_DISORDER',
  mental_health: 'MENTAL_HEALTH',
  osteoporosis: 'OSTEOPOROSIS',
  other: 'OTHER',
}

function mapMajorHistory(history: AnswerValue): Pick<LbpState, 'major_history_present' | 'major_history_categories'> {
  if (!Array.isArray(history) || history.length === 0) return {}
  if (history.includes('none')) return { major_history_present: 'NO', major_history_categories: [] }
  return {
    major_history_present: 'YES',
    major_history_categories: history.map((v) => HISTORY_CATEGORY_MAP[v] ?? v.toUpperCase()),
  }
}

/**
 * `VISIT_03_SYMPTOM_DURATION` options: within_1w | 1w_1m | 1_3m | 3m_1y |
 * over_1y | unknown (coreSpec.ts:124-139). Maps cleanly onto
 * `lbp_logic.py`'s three-way `onset_bucket` (M3_PLUS / not / UNKNOWN) — see
 * plan §3. `'unknown'` and "not yet answered" both collapse to `'UNKNOWN'`,
 * matching Python's `onset_bucket in (MISSING, "UNKNOWN")` single branch.
 */
function mapOnsetBucket(duration: AnswerValue): LbpState['onset_bucket'] {
  if (duration === '3m_1y' || duration === 'over_1y') return 'M3_PLUS'
  if (duration === 'within_1w' || duration === '1w_1m' || duration === '1_3m') return 'NOT_M3_PLUS'
  if (duration === 'unknown') return 'UNKNOWN'
  return undefined
}

/**
 * `deriveReproductiveStatus(r)` (coreSpec.ts:1631-1718). Its `source` field
 * is the correct discriminator between "never asked" (`source === null` —
 * every male patient, since `WOMEN_SAFETY_01`'s `showIf` requires
 * `ID_03 === 'female'`) and "asked, possibly answered ambiguously"
 * (`source !== null`; `pregnant`/`pregnancy_possible` may still be `null`
 * for e.g. an `['unknown']` answer). See plan revision-log item 5 for the
 * full reasoning and why no separate age-band gate is needed here — the
 * ported `compute_treatment_safety_status`'s own sex/age fallback (Layer 1)
 * already handles the `source === null` (MISSING) case correctly.
 */
function mapPregnancyStatus(repro: ReproductiveStatus): LbpState['pregnancy_status'] {
  if (repro.source === null) return undefined
  if (repro.pregnant === true) return 'YES'
  if (repro.pregnancy_possible === true) return 'POSSIBLE'
  if (repro.pregnant === null || repro.pregnancy_possible === null) return 'UNKNOWN'
  return 'NO' // both explicitly false
}

function mapPatientSex(id03: AnswerValue): LbpState['patient_sex'] {
  if (id03 === 'female') return 'F'
  if (id03 === 'male') return 'M'
  return undefined
}

/**
 * See LbpState's field-name table in the plan (§4) for exactly which
 * coreSpec.ts screen `id` feeds which `LbpState` field. Kept as a single
 * explicit table here (not derived/inferred) so a reviewer can check it
 * against lbp_v1.0.yaml's `output_field` column directly.
 */
export function toLbpState(
  r: Responses,
  repro: ReproductiveStatus,
  clinicianObjectiveMotorDeficit: LbpState['clinician_objective_motor_deficit'],
  patientAge: number | undefined,
): LbpState {
  const history = r['HISTORY_01']

  return {
    lbp_distal_extent: asString(r['LBP_01']),
    lbp_leg_neuro_symptoms: asStringArray(r['LBP_02']),
    lbp_leg_side: asString(r['LBP_03']) as LbpState['lbp_leg_side'],
    lbp_ces_screen: asStringArray(r['LBP_04']),
    lbp_current_redflag_screen: asStringArray(r['LBP_05']),
    lbp_trauma_safety: asString(r['LBP_06']) as LbpState['lbp_trauma_safety'],
    onset_bucket: mapOnsetBucket(r['VISIT_03_SYMPTOM_DURATION']),
    lbp_onset_before_45: asString(r['LBP_10']) as LbpState['lbp_onset_before_45'],
    lbp_inflammatory_screen: asStringArray(r['LBP_11']),
    ...mapMajorHistory(history),
    patient_age: patientAge,
    patient_sex: mapPatientSex(r['ID_03']),
    pregnancy_status: mapPregnancyStatus(repro),
    clinician_objective_motor_deficit: clinicianObjectiveMotorDeficit,
  }
}

/**
 * DoctorView-side counterpart to `toLbpState`, for recomputing LBP flags
 * from the already-submitted, STRUCTURED `DoctorPayload['responses']`
 * (`buildResponsePayload`'s output) rather than the flat, screen_id-keyed
 * `Responses` App.tsx works with -- DoctorView never has access to the
 * original flat `Responses`, only the structured payload, so this reads
 * from the equivalent `modules.lbp.*` / `medical_history.*` /
 * `reproductive_status.derived` / `birth_info.*` / `patient.*` paths
 * instead. Uses the exact same mapping helpers as `toLbpState` (same raw
 * string values flow through either shape unchanged), so there is only one
 * place each enum/pregnancy/history mapping rule is written.
 */
export function toLbpStateFromDoctorPayload(
  r: DoctorPayload['responses'],
  clinicianObjectiveMotorDeficit: LbpState['clinician_objective_motor_deficit'],
  patientAge: number | undefined,
): LbpState {
  const m = r.modules.lbp
  const history = r.medical_history.medical_history_flags

  return {
    lbp_distal_extent: asString(m.distal_extent),
    lbp_leg_neuro_symptoms: asStringArray(m.leg_neuro_symptoms),
    lbp_leg_side: asString(m.leg_side) as LbpState['lbp_leg_side'],
    lbp_ces_screen: asStringArray(m.ces_screen),
    lbp_current_redflag_screen: asStringArray(m.current_redflag_screen),
    lbp_trauma_safety: asString(m.trauma_safety) as LbpState['lbp_trauma_safety'],
    onset_bucket: mapOnsetBucket(r.visit_goal.chief_duration),
    lbp_onset_before_45: asString(m.onset_before_45) as LbpState['lbp_onset_before_45'],
    lbp_inflammatory_screen: asStringArray(m.inflammatory_screen),
    ...mapMajorHistory(history),
    patient_age: patientAge,
    patient_sex: mapPatientSex(r.patient.patient_sex),
    pregnancy_status: mapPregnancyStatus(r.reproductive_status.derived),
    clinician_objective_motor_deficit: clinicianObjectiveMotorDeficit,
  }
}

/** DoctorView-side counterpart to coreSpec.ts's `ageFromResponses`. */
export function ageFromDoctorPayload(r: DoctorPayload['responses']): number | undefined {
  const raw = r.birth_info.birth_date
  const calendarType = r.birth_info.birth_calendar_type
  return ageFromBirthDate(
    typeof raw === 'string' ? raw : undefined,
    calendarType === 'solar' || calendarType === 'lunar' || calendarType === 'unknown'
      ? (calendarType as 'solar' | 'lunar' | 'unknown')
      : undefined,
  )
}
