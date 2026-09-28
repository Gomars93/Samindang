/**
 * Midlife v0.1 안전 판정 — 순수 함수, 입력은 `midlifeAdapter.ts`가 만든 상태.
 *
 * 규칙 원본: PO 2026-09-27 지시(`DECISIONS.md` 같은 날 항목,
 * `docs/MIDLIFE_UI_IA_v0.2.md` §4). 이 파일은 그 목록을 **그대로** 옮길 뿐
 * 새 임계값·점수·해석을 만들지 않는다. 두 단계는 절대 섞지 않는다:
 *
 *   URGENT_REVIEW        — 한의원 진료를 멈추고 즉시 대응해야 하는 환자
 *   PRIORITY_EVALUATION  — 한의원 진료는 가능하지만 외부 평가가 밀리면 안 되는 환자
 *
 * URGENT는 불완전한 입력보다 항상 이긴다(fail-closed): 답이 일부 비어 있어도
 * 이미 URGENT 근거가 하나 있으면 URGENT다. 반대로 URGENT 근거가 없는데 판정에
 * 필요한 답이 비었거나 형식이 틀리면 CLEAR가 아니라 INCOMPLETE다 —
 * 모르는 것을 "안전"으로 읽지 않는다(UNKNOWN ≠ NO).
 */

export type MidlifePregnancyStatus = 'yes' | 'unknown' | 'no'

export type MidlifeState = {
  /** 공통 안전문항 SAFETY_01에서 'none' 외 값이 있는지 — 모든 환자 공통 URGENT. */
  generalRed: boolean
  /** MID_01. null = 아직 안 물음/안 답함. */
  cycleChange: string | null
  /** MID_08 원본. null = 아직 안 답함. */
  urgentItems: string[] | null
  /** MID_09 원본. null = 아직 안 답함. */
  priorityItems: string[] | null
  /** WOMEN_SAFETY_01에서 읽은 임신 가능성. null = 아직 안 답함. */
  pregnancy: MidlifePregnancyStatus | null
  /** 어댑터가 저장값의 형식 오류를 발견했는지(레거시/손상). */
  malformed: boolean
}

export type MidlifeSafetyStatus = 'URGENT_REVIEW' | 'PRIORITY_EVALUATION' | 'CLEAR' | 'INCOMPLETE'

export type MidlifeUrgentReason =
  | 'general_red'
  | 'heavy_bleeding_faint'
  | 'self_harm_plan'
  | 'pregnancy_with_bleeding'

export type MidlifePriorityReason =
  | 'postmenopausal_bleeding'
  | 'abnormal_bleeding'
  | 'postcoital_bleeding'
  | 'bloating_pelvic'
  | 'weight_loss_fever'
  | 'palpitation_persistent'
  | 'pregnancy_unknown_with_bleeding'

export type MidlifeSafety = {
  status: MidlifeSafetyStatus
  urgentReasons: MidlifeUrgentReason[]
  priorityReasons: MidlifePriorityReason[]
  /** 출혈 관련 PRIORITY 값이 하나라도 있는지 — 명세의 `abnormal_bleeding_flag`. */
  abnormalBleeding: boolean
}

/** 원장 화면 표기. 판정 근거를 그대로 적는다 — 진단명이 아니다. */
export const MIDLIFE_URGENT_REASON_LABEL: Record<MidlifeUrgentReason, string> = {
  general_red: '공통 안전문항 양성(흉통·호흡곤란·신경학적 증상·의식소실·대량 출혈 등)',
  heavy_bleeding_faint: '대량 출혈 + 어지러움/실신 경향(순환 불안정 의심)',
  self_harm_plan: '구체적인 자살·자해 생각 또는 계획',
  pregnancy_with_bleeding: '임신 가능성 + 출혈',
}

export const MIDLIFE_PRIORITY_REASON_LABEL: Record<MidlifePriorityReason, string> = {
  postmenopausal_bleeding: '폐경 후 출혈',
  abnormal_bleeding: '지속·반복 비정상 출혈',
  postcoital_bleeding: '성교 후 출혈',
  bloating_pelvic: '지속적 복부팽만·골반통·종괴감',
  weight_loss_fever: '설명되지 않는 체중감소·발열',
  palpitation_persistent: '지속적이거나 운동 시 악화하는 심계항진',
  pregnancy_unknown_with_bleeding: '임신 여부 미확인 + 출혈',
}

const PRIORITY_ITEM_VALUES: MidlifePriorityReason[] = [
  'postmenopausal_bleeding',
  'abnormal_bleeding',
  'postcoital_bleeding',
  'bloating_pelvic',
  'weight_loss_fever',
  'palpitation_persistent',
]

const BLEEDING_ITEM_VALUES = ['postmenopausal_bleeding', 'abnormal_bleeding', 'postcoital_bleeding']

export function computeMidlifeSafety(s: MidlifeState): MidlifeSafety {
  const urgent = s.urgentItems ?? []
  const priority = s.priorityItems ?? []

  const bleedingItems = priority.filter((v) => BLEEDING_ITEM_VALUES.includes(v))
  const abnormalBleeding = bleedingItems.length > 0

  const urgentReasons: MidlifeUrgentReason[] = []
  if (s.generalRed) urgentReasons.push('general_red')
  if (urgent.includes('heavy_bleeding_faint')) urgentReasons.push('heavy_bleeding_faint')
  if (urgent.includes('self_harm_plan')) urgentReasons.push('self_harm_plan')
  if (s.pregnancy === 'yes' && (abnormalBleeding || urgent.includes('heavy_bleeding_faint'))) {
    urgentReasons.push('pregnancy_with_bleeding')
  }

  const priorityReasons: MidlifePriorityReason[] = PRIORITY_ITEM_VALUES.filter((v) => priority.includes(v))
  // 12개월 이상 무월경이라고 답한 사람의 출혈은 어느 선택지로 골랐든 폐경 후 출혈로 읽는다.
  if (s.cycleChange === 'amenorrhea_12m_plus' && abnormalBleeding && !priorityReasons.includes('postmenopausal_bleeding')) {
    priorityReasons.unshift('postmenopausal_bleeding')
  }
  // 임신 여부를 모르는 상태의 출혈 — PO 확인 대기 중인 보수적 표시(URGENT로 올리지 않는다).
  if (s.pregnancy === 'unknown' && abnormalBleeding) priorityReasons.push('pregnancy_unknown_with_bleeding')

  let status: MidlifeSafetyStatus
  if (urgentReasons.length > 0) {
    status = 'URGENT_REVIEW'
  } else if (
    s.malformed ||
    s.urgentItems === null ||
    s.priorityItems === null ||
    // 출혈이 있는데 임신 가능성을 모르면(미응답) 임신 조합 URGENT를 배제할 수 없다.
    (abnormalBleeding && s.pregnancy === null)
  ) {
    status = 'INCOMPLETE'
  } else if (priorityReasons.length > 0) {
    status = 'PRIORITY_EVALUATION'
  } else {
    status = 'CLEAR'
  }

  return { status, urgentReasons, priorityReasons, abnormalBleeding }
}
