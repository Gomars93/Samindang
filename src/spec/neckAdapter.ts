/**
 * Layer 2 of the NECK_V1 port (see neckLogic.ts's top comment): translates
 * this app's real `Responses`/`DoctorPayload` into `NeckState`. All
 * translation risk lives here, independently testable — enum case mapping,
 * MISSING-vs-`undefined` contract, onset-bucket/pregnancy derivation.
 *
 * `mapOnsetBucket`/`mapPregnancyStatus`/`mapPatientSex` duplicate small
 * helpers that also exist (unexported) in lbpAdapter.ts. This is
 * deliberate, not an oversight: each module owns a self-contained,
 * independently-portable adapter (same convention neckLogic.ts's top
 * comment documents for the engine layer) rather than reaching into another
 * module's internals or introducing a shared utility neither module asked
 * for.
 */

import type { AnswerValue, Responses } from '../types'
import type { ReproductiveStatus } from './coreSpec'
import type { NeckState } from './neckLogic'
import type { DoctorPayload } from '../doctor/types'

const asStringArray = (v: AnswerValue): string[] | undefined => (Array.isArray(v) ? v : undefined)

const asString = (v: AnswerValue): string | undefined => (typeof v === 'string' ? v : undefined)

/** Same duration buckets as lbpAdapter.ts's mapOnsetBucket — see that file's comment. */
function mapOnsetBucket(duration: AnswerValue): NeckState['onset_bucket'] {
  if (duration === '3m_1y' || duration === 'over_1y') return 'M3_PLUS'
  if (duration === 'within_1w' || duration === '1w_1m' || duration === '1_3m') return 'NOT_M3_PLUS'
  if (duration === 'unknown') return 'UNKNOWN'
  return undefined
}

/** Same discriminator logic as lbpAdapter.ts's mapPregnancyStatus — see that file's comment. */
function mapPregnancyStatus(repro: ReproductiveStatus): NeckState['pregnancy_status'] {
  if (repro.source === null) return undefined
  if (repro.pregnant === true) return 'YES'
  if (repro.pregnancy_possible === true) return 'POSSIBLE'
  if (repro.pregnant === null || repro.pregnancy_possible === null) return 'UNKNOWN'
  return 'NO'
}

/**
 * `HISTORY_01`'s lowercase values -> v0.2.1 §13 uppercase category names.
 * Every option is mapped (not just OSTEOPOROSIS/BLEEDING_DISORDER/CANCER,
 * the three this module's engine actually reads) so nothing is silently
 * dropped, matching lbpAdapter.ts's HISTORY_CATEGORY_MAP convention.
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

function mapMajorHistory(history: AnswerValue): Pick<NeckState, 'major_history_present' | 'major_history_categories'> {
  if (!Array.isArray(history) || history.length === 0) return {}
  if (history.includes('none')) return { major_history_present: 'NO', major_history_categories: [] }
  return {
    major_history_present: 'YES',
    major_history_categories: history.map((v) => HISTORY_CATEGORY_MAP[v] ?? v.toUpperCase()),
  }
}

/**
 * `MED_TYPES`'s lowercase values -> §6 medication-category names.
 * `blood_thinner` -> `ANTICOAG` is the one value the engine actually checks;
 * `other_unknown` maps to `OTHER_UNKNOWN` so the engine can fail closed on
 * it (can't rule out anticoagulant use from an "other/don't know" answer).
 */
const MED_CATEGORY_MAP: Record<string, string> = {
  cardiac: 'CARDIAC',
  diabetes: 'DIABETES_MED',
  cholesterol: 'CHOLESTEROL',
  blood_thinner: 'ANTICOAG',
  psych: 'PSYCH',
  hormone: 'HORMONE',
  painkiller: 'PAINKILLER',
  other_unknown: 'OTHER_UNKNOWN',
}

function mapMedication(
  use: AnswerValue,
  types: AnswerValue,
): Pick<NeckState, 'medication_present' | 'medication_categories'> {
  if (use === 'none') return { medication_present: 'NO', medication_categories: [] }
  if (use === 'unknown') return { medication_present: 'UNKNOWN' }
  if (use === 'yes') {
    const arr = asStringArray(types)
    return {
      medication_present: 'YES',
      medication_categories: arr ? arr.map((v) => MED_CATEGORY_MAP[v] ?? v.toUpperCase()) : undefined,
    }
  }
  return {}
}

/**
 * See NeckState's field-name table (neckLogic.ts) for exactly which
 * coreSpec.ts screen `id` feeds which field.
 */
export function toNeckState(r: Responses, repro: ReproductiveStatus): NeckState {
  const history = r['HISTORY_01']

  return {
    neck_recent_significant_trauma: asString(r['NECK_01']) as NeckState['neck_recent_significant_trauma'],
    neck_cord_concern_screen: asStringArray(r['NECK_02']),
    neck_cord_symptom_course: asString(r['NECK_02A']) as NeckState['neck_cord_symptom_course'],
    neck_sudden_unusual_severe_neck_pain: asString(r['NECK_03A']) as NeckState['neck_sudden_unusual_severe_neck_pain'],
    neck_thunderclap_headache_screen: asString(r['NECK_03B']) as NeckState['neck_thunderclap_headache_screen'],
    neck_vascular_associated_screen: asStringArray(r['NECK_04']),
    neck_systemic_redflag_screen: asStringArray(r['NECK_05']),
    neck_distal_extent: asString(r['NECK_07']) as NeckState['neck_distal_extent'],
    neck_arm_neuro_symptoms: asStringArray(r['NECK_09']),
    neck_headache_present: asString(r['NECK_10']) as NeckState['neck_headache_present'],
    neck_new_or_changed_headache: asString(r['NECK_10A']) as NeckState['neck_new_or_changed_headache'],
    neck_headache_neck_link: asString(r['NECK_11']) as NeckState['neck_headache_neck_link'],
    neck_sustained_posture_aggravation: asString(r['NECK_12']) as NeckState['neck_sustained_posture_aggravation'],
    onset_bucket: mapOnsetBucket(r['VISIT_03_SYMPTOM_DURATION']),
    ...mapMajorHistory(history),
    ...mapMedication(r['MED_USE'], r['MED_TYPES']),
    pregnancy_status: mapPregnancyStatus(repro),
  }
}

/**
 * DoctorView-side counterpart to `toNeckState`, reading from the already
 * -submitted, STRUCTURED `DoctorPayload['responses']` shape instead of the
 * flat screen_id-keyed `Responses`. Same mapping helpers as `toNeckState`.
 */
export function toNeckStateFromDoctorPayload(r: DoctorPayload['responses']): NeckState {
  const m = r.modules.neck
  const history = r.medical_history.medical_history_flags

  return {
    neck_recent_significant_trauma: asString(m.recent_significant_trauma) as NeckState['neck_recent_significant_trauma'],
    neck_cord_concern_screen: asStringArray(m.cord_concern_screen),
    neck_cord_symptom_course: asString(m.cord_symptom_course) as NeckState['neck_cord_symptom_course'],
    neck_sudden_unusual_severe_neck_pain: asString(
      m.sudden_unusual_severe_neck_pain,
    ) as NeckState['neck_sudden_unusual_severe_neck_pain'],
    neck_thunderclap_headache_screen: asString(m.thunderclap_headache_screen) as NeckState['neck_thunderclap_headache_screen'],
    neck_vascular_associated_screen: asStringArray(m.vascular_associated_screen),
    neck_systemic_redflag_screen: asStringArray(m.systemic_redflag_screen),
    neck_distal_extent: asString(m.distal_extent) as NeckState['neck_distal_extent'],
    neck_arm_neuro_symptoms: asStringArray(m.arm_neuro_symptoms),
    neck_headache_present: asString(m.headache_present) as NeckState['neck_headache_present'],
    neck_new_or_changed_headache: asString(m.new_or_changed_headache) as NeckState['neck_new_or_changed_headache'],
    neck_headache_neck_link: asString(m.headache_neck_link) as NeckState['neck_headache_neck_link'],
    neck_sustained_posture_aggravation: asString(
      m.sustained_posture_aggravation,
    ) as NeckState['neck_sustained_posture_aggravation'],
    onset_bucket: mapOnsetBucket(r.visit_goal.chief_duration),
    ...mapMajorHistory(history),
    ...mapMedication(r.medication.medication_use, r.medication.medication_types),
    pregnancy_status: mapPregnancyStatus(r.reproductive_status.derived),
  }
}
