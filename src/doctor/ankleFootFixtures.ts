import {
  ALL_QUESTIONS,
  buildResponsePayload,
  buildRoutingPayload,
  buildSajuInput,
  computeFlags,
  pruneStaleResponses,
} from '../spec/coreSpec'
import { computeSaju } from '../saju'
import type { Responses } from '../types'
import type { DoctorFixture, DoctorPayload } from './types'

const emptyResponses = (): Responses =>
  Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))

const BASE_DEFAULTS: Responses = {
  ID_02: '1234',
  MED_USE: 'none',
  HISTORY_01: ['none'],
  ALLERGY_01: 'none',
  SURGERY_01: 'none',
  TEST_01: 'none',
  FREE_01: 'none',
  HERB_APPETITE: 'normal',
  HERB_THERMAL: 'cold_sensitive',
  HERB_THIRST: 'normal',
  HERB_SWEAT: 'normal',
  BIRTH_02: 'solar',
  BIRTH_03: 'o',
  BIRTH_03A: 'exact',
}

let seq = 0

function buildFixture(name: string, patch: Responses): DoctorFixture {
  seq += 1
  const merged: Responses = { ...emptyResponses(), ...BASE_DEFAULTS, ...patch }
  const { responses } = pruneStaleResponses(merged)
  const payload: DoctorPayload = {
    questionnaire_version: '1.0',
    session_id: `ankle-foot-fixture-${seq}`,
    responses: buildResponsePayload(responses),
    flags: computeFlags(responses),
    routing: buildRoutingPayload(responses),
    myungri_calculation: computeSaju(buildSajuInput(responses)),
    metadata: { session_started_at: null, answers: {} },
  }
  return { name, payload }
}

const PAIN_BASE: Responses = {
  ID_03: 'female',
  BIRTH_01: '19880615',
  VISIT_01: 'symptom',
  VISIT_02_SYMPTOM_MAIN: 'pain',
  VISIT_03_SYMPTOM_DURATION: 'within_1w',
  VISIT_04_SYMPTOM_IMPACT: 'moderate',
  SECONDARY_01: ['none'],
  SAFETY_01: ['none'],
  PAIN_01: 'leg_foot',
  PAIN_02: ['aching', 'movement_related'],
  PAIN_04: 'none',
}

export const ANKLE_FOOT_DOCTOR_FIXTURES: DoctorFixture[] = [
  buildFixture('발목 통증 (ANKLE_FOOT, 안전 확인 완료)', {
    ...PAIN_BASE,
    ID_01: '안전예시',
    AF_00: 'ANKLE',
    AF_01: 'NO',
    AF_02: ['NONE'],
    AF_06: 'NO_CONCERN',
    AF_08: 'NO',
  }),
  buildFixture('발목 뒤 통증 (ANKLE_FOOT, 아킬레스 평가 필요)', {
    ...PAIN_BASE,
    ID_01: '아킬레스예시',
    AF_00: 'HEEL_POSTERIOR_ANKLE',
    AF_01: 'YES',
    AF_02: ['NONE'],
    AF_03: 'CAN_WALK_NORMALLY',
    AF_05: ['SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF'],
    AF_06: 'NO_CONCERN',
    AF_08: 'NO',
  }),
  buildFixture('발 통증 (ANKLE_FOOT, 순환 응급 확인)', {
    ...PAIN_BASE,
    ID_01: '응급예시',
    AF_00: 'FOOT_TOES',
    AF_01: 'NO',
    AF_02: ['FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE'],
    AF_06: 'NO_CONCERN',
    AF_08: 'NO',
  }),
]
