/**
 * 원장용 요약 화면(DoctorView) 미리보기용 예시 데이터.
 *
 * 절대 payload JSON을 손으로 쓰지 않는다 — 실제 App.tsx `phase === 'done'`과
 * 동일한 builder(buildResponsePayload/buildRoutingPayload/computeFlags/
 * computeSaju+buildSajuInput)를 손으로 만든 응답(Responses) 위에 그대로
 * 실행해서 payload를 만든다. 그래야 스펙이 바뀌면 fixture도 자동으로 같이
 * 깨지거나 같이 맞아 떨어진다(드리프트 불가능).
 */
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

/** 대부분의 fixture가 공유하는, 문진 시나리오와 무관한 최소 공통 응답. */
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
    session_id: `fixture-${seq}`,
    responses: buildResponsePayload(responses),
    flags: computeFlags(responses),
    routing: buildRoutingPayload(responses),
    myungri_calculation: computeSaju(buildSajuInput(responses)),
    metadata: { session_started_at: null, answers: {} },
  }

  return { name, payload }
}

export const DOCTOR_FIXTURES: DoctorFixture[] = [
  buildFixture('수면 주호소 + 동반 소화/통증', {
    ID_01: '김민준',
    ID_03: 'male',
    BIRTH_01: '19850312',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    VISIT_03_SYMPTOM_DURATION: '1_3m',
    VISIT_04_SYMPTOM_IMPACT: 'moderate',
    SECONDARY_01: ['digestion', 'pain'],
    SAFETY_01: ['none'],
    SLEEP_01: ['sleep_onset', 'night_awakenings'],
    SLEEP_02: '3_4_days',
    SLEEP_03: ['racing_thoughts'],
    SEC_GI_01: ['indigestion', 'reflux'],
    SEC_PAIN_01: ['neck_shoulder'],
    MED_USE: 'yes',
    MED_TYPES: ['psych'],
  }),

  // 음력 + 윤달 케이스 (1995년 윤8월 15일은 manseryeok에서 실제로 변환 가능함).
  buildFixture('여성 건강 주호소', {
    ID_01: '이서연',
    ID_03: 'female',
    BIRTH_01: '19950815',
    BIRTH_02: 'lunar',
    BIRTH_02A: 'yes',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'women',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    WOMEN_01: ['irregular_cycle', 'menopause_symptoms'],
    WOMEN_02: 'irregular_current',
    WOMEN_03: ['hot_flash', 'sweating'],
    WOMEN_SAFETY_01: ['menopause'],
  }),

  buildFixture('임신 상담', {
    ID_01: '박지현',
    ID_03: 'female',
    BIRTH_01: '19960120',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'pregnancy',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    PREGNANCY_01: 'pregnant',
    PREGNANCY_02: 'second_trimester',
    PREGNANCY_03: ['nausea', 'fatigue'],
  }),

  buildFixture('산후 회복', {
    ID_01: '최유진',
    ID_03: 'female',
    BIRTH_01: '19910815',
    VISIT_01: 'women',
    VISIT_02_WOMEN: 'postpartum',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    POSTPARTUM_01: '6w_to_3m',
    POSTPARTUM_02: ['fatigue_recovery', 'sleep_fatigue'],
    POSTPARTUM_03: 'yes',
  }),

  // 출생시간 모름(time-unknown) 케이스 -> myungri_calculation.status === 'partial'
  buildFixture('체중 관리', {
    ID_01: '정도윤',
    ID_03: 'male',
    BIRTH_01: '19880703',
    BIRTH_03: 'unknown',
    VISIT_01: 'weight',
    SECONDARY_01: ['sleep'],
    SAFETY_01: ['none'],
    SEC_SLEEP_01: ['nonrestorative'],
    WEIGHT_01: 'weight_loss',
    WEIGHT_02: ['snacking_night_eating', 'stress_eating'],
    WEIGHT_03: 'gaining',
    WEIGHT_04: 'lifestyle',
  }),

  buildFixture('체질·보약', {
    ID_01: '한지호',
    ID_03: 'male',
    BIRTH_01: '19790910',
    VISIT_01: 'constitution',
    VISIT_02_CONST: 'constitution',
    SECONDARY_01: ['fatigue'],
    SAFETY_01: ['none'],
    SEC_FATIGUE_01: ['morning_fatigue'],
    CONST_ENERGY: 'tired_recovers',
    CONST_SLEEP: 'frequent_waking',
    CONST_DIGESTION: 'occasional',
    CONST_BOWEL: 'regular',
  }),

  // MENOPAUSE_SLEEP v0.2 Compact: Gate=yes + maintenance/early_waking 최악
  // branch + 우선 확인 필요 sleep disorder flag 동시 발생 케이스.
  buildFixture('여성 수면 주호소 + 갱년기 연동', {
    ID_01: '강수정',
    ID_03: 'female',
    BIRTH_01: '19740612',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    VISIT_03_SYMPTOM_DURATION: '1_3m',
    VISIT_04_SYMPTOM_IMPACT: 'moderate',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    SLEEP_01: ['night_awakenings', 'early_waking'],
    SLEEP_02: '5_plus_days',
    SLEEP_03: ['heat_sweat'],
    MS_GATE_01: 'yes',
    MS_01: 'cycle_changing',
    MS_02: 'several_week',
    MS_03: 'frequent',
    MS_04: '5_6h',
    MS_05: ['witnessed_apnea'],
    MS_06: 'two_three',
    MS_07: '30_60m',
    WOMEN_SAFETY_01: ['none'],
  }),

  // SAFETY_01 red flag + BOWEL_03='yes' 동시 발생 -> requires_staff_check true.
  // 자시(23:00~00:59) 출생 -> policy.pending_approval에 day_boundary 포함.
  buildFixture('안전 확인 필요', {
    ID_01: '오세훈',
    ID_03: 'male',
    BIRTH_01: '19750501',
    BIRTH_03: 'ja',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'bowel',
    VISIT_03_SYMPTOM_DURATION: 'over_1y',
    VISIT_04_SYMPTOM_IMPACT: 'severe',
    SECONDARY_01: ['none'],
    SAFETY_01: ['sudden_severe_pain'],
    BOWEL_01: ['constipation', 'abdominal_discomfort'],
    BOWEL_02: 'less_than_3_per_week',
    BOWEL_03: 'yes',
    BOWEL_04: 'often',
  }),
]
