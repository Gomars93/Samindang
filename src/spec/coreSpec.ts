/**
 * 삼인당 태블릿 상세문진 Master Spec v1.0 기반 질문 정의.
 * (docs/삼인당_태블릿_상세문진_Master_Spec_v1.0.md)
 *
 * v0.2의 9개 primary_goal_bucket 평면 선택 구조는 폐기되었다.
 * v1.0은 "주호소 1개 + 동반문제 최대 2개" 구조다. 상세 증상 Module은
 * Sleep / GI(digestion) / Bowel(bowel) / Urinary(urinary) / Pain(pain) /
 * Fatigue(fatigue) / Stress(stress) / Women(women) / Pregnancy(pregnancy) /
 * Postpartum(postpartum) / Weight(weight)까지 전부 구현했다. 이 Sprint
 * 이후로는 secondary short screen / Router 확장이 남은 작업이다.
 *
 * 질문 문구 / value / show_if는 Master Spec v1.0 원문 그대로이며 임의로
 * 추가·수정하지 않는다.
 */
import type { Option, Question, Responses } from '../types'
import type { SajuInput, TimeBranchKey } from '../saju/types'

const has = (r: Responses, id: string, v: string): boolean => {
  const cur = r[id]
  return Array.isArray(cur) && cur.includes(v)
}

export const STEPS = [
  '환자 확인',
  '방문 목적',
  '상담 내용',
  '상세 증상',
  '전신 정보',
  '병력정보',
  '출생정보',
  '마무리',
] as const

export const PATIENT_QUESTIONS: Question[] = [
  {
    id: 'ID_01',
    variable: 'patient_name',
    input: 'short_text',
    question: '성함을 입력해주세요',
    required: true,
    step: '환자 확인',
    maxLength: 20,
    placeholder: '성함',
  },
  {
    id: 'ID_02',
    variable: 'phone_last4',
    input: 'numeric',
    question: '휴대폰 번호 끝 4자리를 입력해주세요',
    required: true,
    step: '환자 확인',
    maxLength: 4,
  },
  {
    id: 'ID_03',
    variable: 'patient_sex',
    input: 'single_choice',
    question: '성별을 선택해주세요',
    required: true,
    step: '환자 확인',
    options: [
      { value: 'male', label: '남성' },
      { value: 'female', label: '여성' },
    ],
  },
]

/* ---------- 2. 방문 목적 ---------- */

const VISIT_01_OPTIONS: Option[] = [
  { value: 'symptom', label: '불편한 증상이 있어요' },
  { value: 'women', label: '여성 건강·임신·산후 상담이에요' },
  { value: 'weight', label: '체중 관리 상담이에요' },
  { value: 'constitution', label: '체질·보약 상담을 받고 싶어요' },
]

const VISIT_QUESTIONS: Question[] = [
  {
    id: 'VISIT_01',
    variable: 'visit_goal',
    input: 'single_choice',
    question: '오늘 가장 먼저 상담받고 싶은 것은 무엇인가요?',
    helper: '가장 중요한 한 가지를 골라주세요. 다른 불편함도 뒤에서 함께 확인합니다.',
    required: true,
    step: '방문 목적',
    options: VISIT_01_OPTIONS,
    // 남성 환자에게는 여성 건강·임신·산후 선택지를 표시하지 않는다.
    optionsIf: (r) =>
      r['ID_03'] === 'male'
        ? VISIT_01_OPTIONS.filter((o) => o.value !== 'women')
        : VISIT_01_OPTIONS,
  },
  {
    id: 'VISIT_02_SYMPTOM_MAIN',
    variable: 'primary_symptom',
    input: 'single_choice',
    question: '지금 가장 불편한 증상은 무엇인가요?',
    required: true,
    step: '방문 목적',
    showIf: (r) => r['VISIT_01'] === 'symptom',
    options: [
      { value: 'sleep', label: '잠이 불편해요' },
      { value: 'digestion', label: '속이나 소화가 불편해요' },
      { value: 'bowel', label: '대변이 불편해요' },
      { value: 'pain', label: '아픈 곳이 있어요' },
      { value: 'urinary', label: '소변이나 방광이 불편해요' },
      { value: 'fatigue', label: '기운이 없고 피곤해요' },
      { value: 'stress', label: '스트레스나 마음이 힘들어요' },
      { value: 'other', label: '그 밖의 증상이 있어요' },
    ],
  },
  {
    id: 'VISIT_02A_SYMPTOM_OTHER',
    variable: 'primary_symptom_other',
    input: 'short_text',
    question: '가장 불편한 증상을 짧게 적어주세요.',
    required: true,
    step: '방문 목적',
    maxLength: 50,
    showIf: (r) => r['VISIT_02_SYMPTOM_MAIN'] === 'other',
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'VISIT_03_SYMPTOM_DURATION',
    variable: 'chief_duration',
    input: 'single_choice',
    question: '언제부터 불편하셨나요?',
    required: true,
    step: '방문 목적',
    showIf: (r) => r['VISIT_01'] === 'symptom',
    options: [
      { value: 'within_1w', label: '1주 이내' },
      { value: '1w_1m', label: '1주~1개월' },
      { value: '1_3m', label: '1~3개월' },
      { value: '3m_1y', label: '3개월~1년' },
      { value: 'over_1y', label: '1년 이상' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'VISIT_04_SYMPTOM_IMPACT',
    variable: 'chief_impact',
    input: 'single_choice',
    question: '일상생활에 얼마나 영향을 주나요?',
    required: true,
    step: '방문 목적',
    showIf: (r) => r['VISIT_01'] === 'symptom',
    options: [
      { value: 'minimal', label: '거의 지장이 없어요' },
      { value: 'mild', label: '조금 불편해요' },
      { value: 'moderate', label: '많이 불편해요' },
      { value: 'severe', label: '일상생활이 어려울 정도예요' },
    ],
  },
  {
    id: 'VISIT_02_WOMEN',
    variable: 'women_goal',
    input: 'single_choice',
    question: '어떤 상담이 가장 필요하신가요?',
    required: true,
    step: '방문 목적',
    showIf: (r) => r['VISIT_01'] === 'women',
    options: [
      { value: 'women', label: '생리·갱년기 등 여성 건강' },
      { value: 'pregnancy', label: '임신 관련 상담' },
      { value: 'postpartum', label: '출산 후 회복 상담' },
    ],
  },
  {
    id: 'VISIT_02_CONST',
    variable: 'constitution_goal',
    input: 'single_choice',
    question: '어떤 상담을 가장 원하시나요?',
    required: true,
    step: '방문 목적',
    showIf: (r) => r['VISIT_01'] === 'constitution',
    options: [
      { value: 'constitution', label: '체질과 전반적인 몸 상태를 보고 싶어요' },
      { value: 'tonic', label: '기력 보강·보약 상담을 받고 싶어요' },
      { value: 'general', label: '특별한 증상은 없지만 건강 관리를 상담하고 싶어요' },
    ],
  },
]

/* ---------- 7. 동반문제 / 8. Red Flag ---------- */

/**
 * 주호소를 secondary_concerns 카테고리 값으로 정규화한다.
 * pregnancy/postpartum은 동반문제 화면에 별도 항목이 없으므로 women으로 합친다.
 * 체질·보약(visit_goal=constitution)은 동반문제 카테고리가 없으므로 null.
 */
export const primaryConcernKey = (r: Responses): string | null => {
  const goal = r['VISIT_01']
  if (goal === 'symptom') {
    const v = r['VISIT_02_SYMPTOM_MAIN']
    return typeof v === 'string' ? v : null
  }
  if (goal === 'women') {
    const v = r['VISIT_02_WOMEN']
    return typeof v === 'string' ? v : null
  }
  if (goal === 'weight') return 'weight'
  return null
}

const primaryConcernSecondaryKey = (r: Responses): string | null => {
  const key = primaryConcernKey(r)
  if (key === 'pregnancy' || key === 'postpartum') return 'women'
  return key
}

const SECONDARY_OPTIONS: Option[] = [
  { value: 'sleep', label: '잠' },
  { value: 'digestion', label: '속·소화' },
  { value: 'bowel', label: '대변' },
  { value: 'pain', label: '통증' },
  { value: 'urinary', label: '소변·방광' },
  { value: 'fatigue', label: '피로·기력' },
  { value: 'stress', label: '스트레스·마음' },
  { value: 'women', label: '여성 건강' },
  { value: 'weight', label: '체중 관리' },
  { value: 'other', label: '그 밖의 증상' },
  { value: 'none', label: '없음' },
]

const SAFETY_QUESTIONS: Question[] = [
  {
    id: 'SECONDARY_01',
    variable: 'secondary_concerns',
    input: 'multi_choice',
    question: '함께 상담하고 싶은 다른 불편함이 있나요?',
    helper: '최대 2개까지 선택해주세요.',
    required: true,
    step: '상담 내용',
    exclusive: 'none',
    max: 2,
    options: SECONDARY_OPTIONS,
    // 이미 선택한 주호소와 동일한 항목, 남성의 "여성 건강"은 목록에서 제외한다.
    optionsIf: (r) => {
      const exclude = new Set<string>()
      const primary = primaryConcernSecondaryKey(r)
      if (primary) exclude.add(primary)
      if (r['ID_03'] === 'male') exclude.add('women')
      return SECONDARY_OPTIONS.filter((o) => !exclude.has(o.value))
    },
  },
  {
    id: 'SECONDARY_01A',
    variable: 'secondary_other_text',
    input: 'short_text',
    question: '가장 불편한 그 밖의 증상을 짧게 적어주세요.',
    required: true,
    step: '상담 내용',
    maxLength: 50,
    showIf: (r) => has(r, 'SECONDARY_01', 'other'),
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'SAFETY_01',
    variable: 'red_flag_general',
    input: 'multi_choice',
    question: '지금 아래와 같은 증상이 있나요?',
    required: true,
    step: '상담 내용',
    exclusive: 'none',
    options: [
      { value: 'chest_breathing', label: '새로 생긴 심한 가슴 통증이나 숨쉬기가 매우 힘든 증상' },
      { value: 'focal_neuro', label: '갑자기 한쪽 팔·다리에 힘이 빠지거나 말하기 어려운 증상' },
      { value: 'loc_seizure', label: '의식을 잃었거나 경련을 한 증상' },
      { value: 'sudden_severe_pain', label: '갑자기 시작된 매우 심한 두통이나 통증' },
      { value: 'uncontrolled_bleeding', label: '멈추지 않는 심한 출혈' },
      { value: 'high_fever_illness', label: '고열과 함께 몸 상태가 매우 좋지 않음' },
      { value: 'none', label: '해당 없음' },
    ],
  },
]

/* ---------- Sleep 상세 Module (primary concern === sleep 인 경우만) ---------- */

const IS_PRIMARY_SLEEP = (r: Responses) => primaryConcernKey(r) === 'sleep'

const SLEEP_QUESTIONS: Question[] = [
  {
    id: 'SLEEP_01',
    variable: 'sleep_problems',
    input: 'multi_choice',
    question: '잠에서 불편한 점이 있나요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_SLEEP,
    options: [
      { value: 'sleep_onset', label: '잠들기 어려워요' },
      { value: 'night_awakenings', label: '자다가 자주 깨요' },
      { value: 'early_waking', label: '너무 일찍 깨요' },
      { value: 'nonrestorative', label: '충분히 자도 개운하지 않아요' },
    ],
  },
  {
    id: 'SLEEP_02',
    variable: 'sleep_frequency_per_week',
    input: 'single_choice',
    question: '일주일에 며칠 정도 불편한가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_SLEEP,
    options: [
      { value: '1_2_days', label: '1~2일' },
      { value: '3_4_days', label: '3~4일' },
      { value: '5_plus_days', label: '5일 이상' },
      { value: 'almost_daily', label: '거의 매일' },
    ],
  },
  {
    id: 'SLEEP_03',
    variable: 'awakening_reasons',
    input: 'multi_choice',
    question: '주로 왜 깨시나요?',
    required: true,
    step: '상세 증상',
    exclusive: 'no_particular_reason',
    showIf: (r) => IS_PRIMARY_SLEEP(r) && has(r, 'SLEEP_01', 'night_awakenings'),
    options: [
      { value: 'urination', label: '소변 때문에' },
      { value: 'pain', label: '통증 때문에' },
      { value: 'heat_sweat', label: '더워서 또는 땀 때문에' },
      { value: 'racing_thoughts', label: '생각이 많아져서' },
      { value: 'no_particular_reason', label: '특별한 이유 없이' },
      { value: 'other', label: '기타' },
    ],
  },
  {
    id: 'SLEEP_03A',
    variable: 'awakening_other',
    input: 'short_text',
    question: '다른 이유가 있다면 짧게 적어주세요.',
    required: true,
    step: '상세 증상',
    maxLength: 50,
    showIf: (r) => IS_PRIMARY_SLEEP(r) && has(r, 'SLEEP_03', 'other'),
    placeholder: '짧게 적어주세요',
  },
]

/* ---------- GI 상세 Module (primary concern === digestion 인 경우만) ---------- */

const IS_PRIMARY_GI = (r: Responses) => primaryConcernKey(r) === 'digestion'

const GI_QUESTIONS: Question[] = [
  {
    id: 'GI_01',
    variable: 'gi_problems',
    input: 'multi_choice',
    question: '속이나 소화에서 어떤 점이 가장 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_GI,
    options: [
      { value: 'indigestion', label: '소화가 잘 안 되고 더부룩해요' },
      { value: 'epigastric_discomfort', label: '명치나 윗배가 답답하거나 아파요' },
      { value: 'reflux', label: '속이 쓰리거나 신물이 올라와요' },
      { value: 'nausea', label: '메스껍거나 구역감이 있어요' },
      { value: 'poor_appetite', label: '입맛이 없어요' },
    ],
  },
  {
    id: 'GI_02',
    variable: 'gi_meal_relation',
    input: 'single_choice',
    question: '주로 언제 더 불편한가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_GI,
    options: [
      { value: 'after_meals', label: '식후에 더 불편해요' },
      { value: 'when_hungry', label: '공복에 더 불편해요' },
      { value: 'both', label: '식후와 공복 모두 불편해요' },
      { value: 'unrelated', label: '식사와 큰 관계가 없어요' },
      { value: 'not_sure', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'GI_03',
    variable: 'gi_unable_to_eat_or_drink',
    input: 'single_choice',
    question: '최근 음식이나 물을 먹기 어려울 정도인가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_GI,
    options: [
      { value: 'yes', label: '네' },
      { value: 'no', label: '아니요' },
    ],
  },
]

/* ---------- Bowel 상세 Module (primary concern === bowel 인 경우만) ---------- */

const IS_PRIMARY_BOWEL = (r: Responses) => primaryConcernKey(r) === 'bowel'

const BOWEL_QUESTIONS: Question[] = [
  {
    id: 'BOWEL_01',
    variable: 'bowel_problems',
    input: 'multi_choice',
    question: '대변에서 어떤 점이 가장 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_BOWEL,
    options: [
      { value: 'constipation', label: '변이 잘 안 나오거나 딱딱해요' },
      { value: 'diarrhea', label: '묽은 변이나 설사가 잦아요' },
      { value: 'alternating', label: '변비와 설사가 번갈아 있어요' },
      { value: 'incomplete_emptying', label: '보고 나도 덜 본 느낌이 있어요' },
      { value: 'abdominal_discomfort', label: '배가 아프거나 불편하면서 대변 문제가 있어요' },
    ],
  },
  {
    id: 'BOWEL_02',
    variable: 'bowel_frequency',
    input: 'single_choice',
    question: '평소 대변은 얼마나 자주 보시나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_BOWEL,
    options: [
      { value: 'less_than_3_per_week', label: '일주일에 2번 이하' },
      { value: 'three_to_six_per_week', label: '일주일에 3~6번' },
      { value: 'one_to_two_per_day', label: '하루 1~2번' },
      { value: 'three_or_more_per_day', label: '하루 3번 이상' },
      { value: 'varies', label: '들쭉날쭉해요' },
    ],
  },
  {
    id: 'BOWEL_03',
    variable: 'blood_or_black_stool',
    input: 'single_choice',
    question: '최근 대변에 피가 섞이거나 검게 나온 적이 있나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_BOWEL,
    options: [
      { value: 'yes', label: '네' },
      { value: 'no', label: '아니요' },
      { value: 'not_sure', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'BOWEL_04',
    variable: 'bowel_straining',
    input: 'single_choice',
    question: '변을 볼 때 많이 힘을 줘야 하나요?',
    required: true,
    step: '상세 증상',
    showIf: (r) => IS_PRIMARY_BOWEL(r) && has(r, 'BOWEL_01', 'constipation'),
    options: [
      { value: 'often', label: '자주 그래요' },
      { value: 'sometimes', label: '가끔 그래요' },
      { value: 'rarely', label: '거의 그렇지 않아요' },
    ],
  },
]

/* ---------- Urinary 상세 Module (primary concern === urinary 인 경우만) ---------- */

const IS_PRIMARY_URINARY = (r: Responses) => primaryConcernKey(r) === 'urinary'

const URINARY_QUESTIONS: Question[] = [
  {
    id: 'URINARY_01',
    variable: 'urinary_problems',
    input: 'multi_choice',
    question: '소변이나 방광에서 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_URINARY,
    options: [
      { value: 'frequency', label: '소변을 자주 봐요' },
      { value: 'urgency', label: '갑자기 소변이 마려워 참기 어려워요' },
      { value: 'nocturia', label: '밤에 자다가 소변 때문에 깨요' },
      { value: 'voiding_difficulty', label: '소변이 잘 나오지 않거나 약해요' },
      { value: 'incomplete_emptying', label: '소변을 봐도 덜 본 느낌이 있어요' },
      { value: 'dysuria', label: '소변 볼 때 아프거나 불편해요' },
      { value: 'incontinence', label: '소변이 새는 경우가 있어요' },
    ],
  },
  {
    id: 'URINARY_02',
    variable: 'urinary_burden_frequency',
    input: 'single_choice',
    question: '하루 중 얼마나 자주 불편한가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_URINARY,
    options: [
      { value: 'occasionally', label: '가끔 있어요' },
      { value: 'several_times_daily', label: '하루에 몇 번 있어요' },
      { value: 'most_of_day', label: '거의 하루 종일 신경 쓰여요' },
      { value: 'variable', label: '상황에 따라 달라요' },
    ],
  },
  {
    id: 'URINARY_03',
    variable: 'nocturia_count',
    input: 'single_choice',
    question: '밤에 보통 몇 번 정도 소변 때문에 깨나요?',
    required: true,
    step: '상세 증상',
    showIf: (r) => IS_PRIMARY_URINARY(r) && has(r, 'URINARY_01', 'nocturia'),
    options: [
      { value: 'one', label: '1번' },
      { value: 'two', label: '2번' },
      { value: 'three_or_more', label: '3번 이상' },
      { value: 'variable', label: '날마다 달라요' },
    ],
  },
  {
    id: 'URINARY_04',
    variable: 'leakage_pattern',
    input: 'multi_choice',
    question: '소변이 주로 언제 새나요?',
    required: true,
    step: '상세 증상',
    exclusive: 'unknown',
    showIf: (r) => IS_PRIMARY_URINARY(r) && has(r, 'URINARY_01', 'incontinence'),
    options: [
      { value: 'stress', label: '기침·재채기·웃거나 힘줄 때' },
      { value: 'urge', label: '갑자기 마려울 때 참지 못하고' },
      { value: 'other_activity', label: '움직이거나 일상생활 중 특별한 이유 없이' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
]

/* ---------- Pain 상세 Module (primary concern === pain 인 경우만) ---------- */

const IS_PRIMARY_PAIN = (r: Responses) => primaryConcernKey(r) === 'pain'

const PAIN_QUESTIONS: Question[] = [
  {
    id: 'PAIN_01',
    variable: 'primary_location',
    input: 'single_choice',
    question: '어디가 가장 불편한가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_PAIN,
    options: [
      { value: 'neck_shoulder', label: '목·어깨' },
      { value: 'low_back_pelvis', label: '허리·골반' },
      { value: 'arm_hand', label: '팔·손' },
      { value: 'leg_foot', label: '다리·발' },
      { value: 'knee', label: '무릎' },
      { value: 'head_face_jaw', label: '머리·얼굴·턱' },
      { value: 'chest_rib', label: '가슴·갈비뼈 주변' },
      { value: 'abdomen', label: '배 주변' },
      { value: 'other', label: '그 밖의 부위' },
    ],
  },
  {
    id: 'PAIN_01A',
    variable: 'location_other',
    input: 'short_text',
    question: '어느 부위인지 짧게 적어주세요.',
    required: true,
    step: '상세 증상',
    maxLength: 50,
    showIf: (r) => IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'other',
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'PAIN_02',
    variable: 'pain_qualities',
    input: 'multi_choice',
    question: '어떤 느낌의 통증인가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_PAIN,
    options: [
      { value: 'aching', label: '뻐근하거나 묵직해요' },
      { value: 'sharp', label: '찌르거나 쑤셔요' },
      { value: 'burning', label: '타는 듯하거나 화끈거려요' },
      { value: 'numb_tingling', label: '저리거나 감각이 둔해요' },
      { value: 'tight_stiff', label: '당기거나 뻣뻣해요' },
      { value: 'movement_related', label: '움직일 때 더 아파요' },
      { value: 'rest_pain', label: '가만히 있어도 아파요' },
    ],
  },
  {
    id: 'PAIN_04',
    variable: 'radiation',
    input: 'single_choice',
    question: '통증이 다른 곳으로 퍼지거나 저린 느낌이 있나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_PAIN,
    options: [
      { value: 'none', label: '없어요' },
      { value: 'upper_limb', label: '팔이나 손 쪽으로 퍼져요' },
      { value: 'lower_limb', label: '엉덩이·다리·발 쪽으로 퍼져요' },
      { value: 'other', label: '다른 부위로 퍼져요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'PAIN_04A',
    variable: 'radiation_other',
    input: 'short_text',
    question: '어디로 퍼지는지 짧게 적어주세요.',
    required: true,
    step: '상세 증상',
    maxLength: 50,
    showIf: (r) => IS_PRIMARY_PAIN(r) && r['PAIN_04'] === 'other',
    placeholder: '짧게 적어주세요',
  },
]

/* ---------- Fatigue 상세 Module (primary concern === fatigue 인 경우만) ---------- */

const IS_PRIMARY_FATIGUE = (r: Responses) => primaryConcernKey(r) === 'fatigue'

const FATIGUE_QUESTIONS: Question[] = [
  {
    id: 'FATIGUE_01',
    variable: 'fatigue_patterns',
    input: 'multi_choice',
    question: '피로가 주로 어떻게 느껴지나요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_FATIGUE,
    options: [
      { value: 'morning_fatigue', label: '아침부터 기운이 없어요' },
      { value: 'exertional_fatigue', label: '조금만 움직여도 쉽게 지쳐요' },
      { value: 'later_day_fatigue', label: '오후나 저녁에 더 처져요' },
      { value: 'poor_recovery', label: '쉬어도 회복이 잘 안 돼요' },
      { value: 'heaviness', label: '몸이 무겁고 늘어져요' },
      { value: 'sleepiness', label: '졸리고 잠이 쏟아져요' },
    ],
  },
  {
    id: 'FATIGUE_02',
    variable: 'fatigue_worst_time',
    input: 'single_choice',
    question: '피로가 하루 중 어느 때 가장 심한가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_FATIGUE,
    options: [
      { value: 'morning', label: '아침' },
      { value: 'daytime', label: '낮' },
      { value: 'evening', label: '저녁' },
      { value: 'all_day', label: '하루 종일' },
      { value: 'variable', label: '날마다 달라요' },
    ],
  },
  {
    id: 'FATIGUE_03',
    variable: 'fatigue_recovery_after_rest',
    input: 'single_choice',
    question: '쉬거나 자고 나면 피로가 얼마나 회복되나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_FATIGUE,
    options: [
      { value: 'good_recovery', label: '대부분 회복돼요' },
      { value: 'partial_recovery', label: '조금 나아져요' },
      { value: 'poor_recovery', label: '거의 그대로예요' },
      { value: 'sometimes_worse', label: '오히려 더 피곤할 때도 있어요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
]

/* ---------- Stress 상세 Module (primary concern === stress 인 경우만) ---------- */

const IS_PRIMARY_STRESS = (r: Responses) => primaryConcernKey(r) === 'stress'

const STRESS_QUESTIONS: Question[] = [
  {
    id: 'STRESS_01',
    variable: 'stress_problems',
    input: 'multi_choice',
    question: '요즘 가장 힘든 점은 무엇인가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_STRESS,
    options: [
      { value: 'worry', label: '걱정이나 생각이 많아요' },
      { value: 'tension', label: '긴장되고 예민해요' },
      { value: 'irritability', label: '짜증이나 화가 자주 나요' },
      { value: 'low_mood', label: '마음이 가라앉고 의욕이 없어요' },
      { value: 'palpitation_tightness', label: '가슴이 두근거리거나 답답할 때가 있어요' },
      { value: 'somatic_worsening', label: '스트레스를 받으면 몸 증상이 심해져요' },
    ],
  },
  {
    id: 'STRESS_03',
    variable: 'stress_associated_symptoms',
    input: 'multi_choice',
    question: '스트레스가 심해질 때 함께 나타나는 증상이 있나요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: IS_PRIMARY_STRESS,
    options: [
      { value: 'sleep', label: '잠이 더 불편해져요' },
      { value: 'digestion', label: '소화가 더 불편해져요' },
      { value: 'pain', label: '두통이나 통증이 심해져요' },
      { value: 'cardiac_sensation', label: '가슴 두근거림·답답함이 생겨요' },
      { value: 'sweating_heat', label: '땀이 나거나 몸이 달아올라요' },
      { value: 'none', label: '특별한 몸 증상은 없어요' },
    ],
  },
]

/* ---------- Women 상세 Module (women_goal === women 인 경우만) ---------- */

const IS_PRIMARY_WOMEN = (r: Responses) => primaryConcernKey(r) === 'women'

const WOMEN_MENSTRUAL_TRIGGERS = ['irregular_cycle', 'flow_change', 'dysmenorrhea', 'premenstrual']

const WOMEN_QUESTIONS: Question[] = [
  {
    id: 'WOMEN_01',
    variable: 'women_problems',
    input: 'multi_choice',
    question: '어떤 점이 가장 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_WOMEN,
    options: [
      { value: 'irregular_cycle', label: '생리 주기가 불규칙해요' },
      { value: 'dysmenorrhea', label: '생리통이 심해요' },
      { value: 'flow_change', label: '생리양이 너무 많거나 적어요' },
      { value: 'premenstrual', label: '생리 전후 몸이나 기분 변화가 심해요' },
      { value: 'discharge_discomfort', label: '냉·분비물이나 질 불편감이 있어요' },
      { value: 'menopause_symptoms', label: '갱년기 증상이 있어요' },
      { value: 'other', label: '그 밖의 여성 건강 상담' },
    ],
  },
  {
    id: 'WOMEN_01A',
    variable: 'women_other_text',
    input: 'short_text',
    question: '어떤 내용인지 짧게 적어주세요.',
    required: true,
    step: '상세 증상',
    maxLength: 50,
    showIf: (r) => IS_PRIMARY_WOMEN(r) && has(r, 'WOMEN_01', 'other'),
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'WOMEN_02',
    variable: 'menstrual_status',
    input: 'single_choice',
    question: '현재 생리는 어떤 상태인가요?',
    required: true,
    step: '상세 증상',
    showIf: (r) =>
      IS_PRIMARY_WOMEN(r) && WOMEN_MENSTRUAL_TRIGGERS.some((v) => has(r, 'WOMEN_01', v)),
    options: [
      { value: 'currently_menstruating', label: '생리 중이에요' },
      { value: 'regular_current', label: '최근에도 규칙적으로 하고 있어요' },
      { value: 'irregular_current', label: '불규칙하게 하고 있어요' },
      { value: 'amenorrhea_months', label: '몇 달째 생리가 없어요' },
      { value: 'menopause', label: '폐경했어요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'WOMEN_03',
    variable: 'menopause_symptoms',
    input: 'multi_choice',
    question: '갱년기와 관련해 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: (r) => IS_PRIMARY_WOMEN(r) && has(r, 'WOMEN_01', 'menopause_symptoms'),
    options: [
      { value: 'hot_flash', label: '얼굴이나 몸이 갑자기 달아올라요' },
      { value: 'sweating', label: '땀이 많이 나요' },
      { value: 'sleep', label: '잠이 불편해요' },
      { value: 'palpitation_anxiety', label: '가슴이 두근거리거나 불안해요' },
      { value: 'mood_change', label: '기분 변화가 심해요' },
      { value: 'genitourinary_discomfort', label: '건조감이나 비뇨·생식기 불편감이 있어요' },
    ],
  },
]

/* ---------- Pregnancy 상세 Module (women_goal === pregnancy 인 경우만) ---------- */

const IS_PRIMARY_PREGNANCY = (r: Responses) => primaryConcernKey(r) === 'pregnancy'

const PREGNANCY_QUESTIONS: Question[] = [
  {
    id: 'PREGNANCY_01',
    variable: 'pregnancy_status',
    input: 'single_choice',
    question: '현재 임신 상태는 어떻게 되나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_PREGNANCY,
    options: [
      { value: 'pregnant', label: '임신 중이에요' },
      { value: 'possible', label: '임신 가능성이 있어요' },
      { value: 'trying', label: '임신을 준비 중이에요' },
      { value: 'fertility', label: '난임·임신 준비 상담이에요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'PREGNANCY_02',
    variable: 'trimester',
    input: 'single_choice',
    question: '현재 임신 몇 주 정도인가요?',
    required: true,
    step: '상세 증상',
    showIf: (r) => IS_PRIMARY_PREGNANCY(r) && r['PREGNANCY_01'] === 'pregnant',
    options: [
      { value: 'first_trimester', label: '12주 이하' },
      { value: 'second_trimester', label: '13~27주' },
      { value: 'third_trimester', label: '28주 이상' },
      { value: 'unknown', label: '정확히 모르겠어요' },
    ],
  },
  {
    id: 'PREGNANCY_03',
    variable: 'pregnancy_concerns',
    input: 'multi_choice',
    question: '임신과 관련해 가장 상담하고 싶은 내용은 무엇인가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_PREGNANCY,
    options: [
      { value: 'nausea', label: '입덧·메스꺼움' },
      { value: 'digestion', label: '소화 불편' },
      { value: 'pain', label: '통증·몸 불편' },
      { value: 'fatigue', label: '피로·기력 저하' },
      { value: 'sleep', label: '수면 불편' },
      { value: 'edema', label: '붓기' },
      { value: 'fertility', label: '임신 준비·난임 관련' },
      { value: 'other', label: '기타' },
    ],
  },
  {
    id: 'PREGNANCY_03A',
    variable: 'pregnancy_other_text',
    input: 'short_text',
    question: '어떤 내용인지 짧게 적어주세요.',
    required: true,
    step: '상세 증상',
    maxLength: 50,
    showIf: (r) => IS_PRIMARY_PREGNANCY(r) && has(r, 'PREGNANCY_03', 'other'),
    placeholder: '짧게 적어주세요',
  },
]

/* ---------- Postpartum 상세 Module (women_goal === postpartum 인 경우만) ---------- */

const IS_PRIMARY_POSTPARTUM = (r: Responses) => primaryConcernKey(r) === 'postpartum'

const POSTPARTUM_QUESTIONS: Question[] = [
  {
    id: 'POSTPARTUM_01',
    variable: 'time_since_delivery',
    input: 'single_choice',
    question: '출산 후 얼마나 지났나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_POSTPARTUM,
    options: [
      { value: 'within_6_weeks', label: '6주 이내' },
      { value: '6w_to_3m', label: '6주~3개월' },
      { value: '3_to_6m', label: '3~6개월' },
      { value: '6_to_12m', label: '6~12개월' },
      { value: 'over_1y', label: '1년 이상' },
    ],
  },
  {
    id: 'POSTPARTUM_02',
    variable: 'postpartum_problems',
    input: 'multi_choice',
    question: '출산 후 어떤 점이 가장 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_POSTPARTUM,
    options: [
      { value: 'fatigue_recovery', label: '기운이 없고 회복이 더뎌요' },
      { value: 'musculoskeletal_pain', label: '허리·골반·관절이 아파요' },
      { value: 'edema_heaviness', label: '몸이 붓거나 무거워요' },
      { value: 'sleep_fatigue', label: '잠이 부족하고 피곤해요' },
      { value: 'temperature_sweating', label: '땀이 많이 나거나 더위·추위가 심해졌어요' },
      { value: 'urinary', label: '소변·방광이 불편해요' },
      { value: 'pelvic_core_recovery', label: '배·골반저 회복이 걱정돼요' },
      { value: 'breastfeeding', label: '수유 관련 상담이 필요해요' },
      { value: 'other', label: '기타' },
    ],
  },
  {
    id: 'POSTPARTUM_02A',
    variable: 'postpartum_other_text',
    input: 'short_text',
    question: '어떤 내용인지 짧게 적어주세요.',
    required: true,
    step: '상세 증상',
    maxLength: 50,
    showIf: (r) => IS_PRIMARY_POSTPARTUM(r) && has(r, 'POSTPARTUM_02', 'other'),
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'POSTPARTUM_03',
    variable: 'breastfeeding_status',
    input: 'single_choice',
    question: '현재 모유수유 중인가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_POSTPARTUM,
    options: [
      { value: 'yes', label: '네' },
      { value: 'no', label: '아니요' },
      { value: 'mixed', label: '혼합수유 중이에요' },
    ],
  },
]

/* ---------- Weight 상세 Module (visit_goal === weight 인 경우만) ---------- */

const IS_PRIMARY_WEIGHT = (r: Responses) => primaryConcernKey(r) === 'weight'

const WEIGHT_QUESTIONS: Question[] = [
  {
    id: 'WEIGHT_01',
    variable: 'weight_goal',
    input: 'single_choice',
    question: '체중 관리에서 가장 원하는 것은 무엇인가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_WEIGHT,
    options: [
      { value: 'weight_loss', label: '체중을 줄이고 싶어요' },
      { value: 'fat_loss', label: '체지방을 줄이고 싶어요' },
      { value: 'appetite_control', label: '식욕 조절이 가장 어려워요' },
      { value: 'maintenance', label: '요요 없이 유지하고 싶어요' },
      { value: 'health_management', label: '전반적인 건강 관리를 함께 하고 싶어요' },
    ],
  },
  {
    id: 'WEIGHT_02',
    variable: 'weight_contributing_factors',
    input: 'multi_choice',
    question: '체중이 늘거나 빠지는 데 가장 영향을 주는 것은 무엇인가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'unknown',
    showIf: IS_PRIMARY_WEIGHT,
    options: [
      { value: 'large_portions', label: '식사량이 많아요' },
      { value: 'snacking_night_eating', label: '간식·야식이 많아요' },
      { value: 'sweets_carbs', label: '단 음식이나 탄수화물을 자주 먹어요' },
      { value: 'stress_eating', label: '스트레스 받으면 많이 먹어요' },
      { value: 'low_activity', label: '활동량이 적어요' },
      { value: 'poor_sleep', label: '잠이 부족하거나 불규칙해요' },
      { value: 'unknown', label: '특별한 이유를 잘 모르겠어요' },
    ],
  },
  {
    id: 'WEIGHT_03',
    variable: 'recent_weight_change',
    input: 'single_choice',
    question: '최근 체중 변화는 어떤가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_WEIGHT,
    options: [
      { value: 'gaining', label: '최근 계속 늘고 있어요' },
      { value: 'stable', label: '비슷하게 유지돼요' },
      { value: 'losing', label: '줄고 있어요' },
      { value: 'fluctuating', label: '오르내림이 커요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'WEIGHT_04',
    variable: 'previous_attempts',
    input: 'single_choice',
    question: '다이어트나 체중 관리 경험이 있나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_WEIGHT,
    options: [
      { value: 'none', label: '처음이에요' },
      { value: 'lifestyle', label: '식단·운동 위주로 해봤어요' },
      { value: 'herbal_supplement', label: '한약이나 보조제를 써봤어요' },
      { value: 'medical', label: '병원 처방약이나 주사를 써봤어요' },
      { value: 'multiple', label: '여러 방법을 해봤어요' },
    ],
  },
]

/* ---------- 동반문제(secondary_concerns) 짧은 화면. 각 카테고리당 1문항. ---------- */

/** primary와 동일한 카테고리면 짧은 화면을 또 보여주지 않는다(방어적으로 두 조건 모두 확인). */
const SEC_NOT_PRIMARY = (key: string) => (r: Responses) => primaryConcernKey(r) !== key

const SEC_NOT_PRIMARY_WOMEN = (r: Responses) => {
  const key = primaryConcernKey(r)
  return key !== 'women' && key !== 'pregnancy' && key !== 'postpartum'
}

const SECONDARY_SHORT_QUESTIONS: Question[] = [
  {
    id: 'SEC_SLEEP_01',
    variable: 'sec_sleep_problems',
    input: 'multi_choice',
    question: '잠에 대해서는 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'sleep') && SEC_NOT_PRIMARY('sleep')(r),
    options: [
      { value: 'sleep_onset', label: '잠들기 어려워요' },
      { value: 'night_awakenings', label: '자다가 자주 깨요' },
      { value: 'early_waking', label: '너무 일찍 깨요' },
      { value: 'nonrestorative', label: '충분히 자도 개운하지 않아요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_GI_01',
    variable: 'sec_gi_problems',
    input: 'multi_choice',
    question: '속이나 소화에 대해서는 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'digestion') && SEC_NOT_PRIMARY('digestion')(r),
    options: [
      { value: 'indigestion', label: '소화가 잘 안 되고 더부룩해요' },
      { value: 'epigastric_discomfort', label: '명치나 윗배가 답답하거나 아파요' },
      { value: 'reflux', label: '속이 쓰리거나 신물이 올라와요' },
      { value: 'nausea', label: '메스껍거나 구역감이 있어요' },
      { value: 'poor_appetite', label: '입맛이 없어요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_BOWEL_01',
    variable: 'sec_bowel_problems',
    input: 'multi_choice',
    question: '대변에 대해서는 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'bowel') && SEC_NOT_PRIMARY('bowel')(r),
    options: [
      { value: 'constipation', label: '변이 잘 안 나오거나 딱딱해요' },
      { value: 'diarrhea', label: '묽은 변이나 설사가 잦아요' },
      { value: 'alternating', label: '변비와 설사가 번갈아 있어요' },
      { value: 'incomplete_emptying', label: '보고 나도 덜 본 느낌이 있어요' },
      { value: 'abdominal_discomfort', label: '배가 아프거나 불편하면서 대변 문제가 있어요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_PAIN_01',
    variable: 'sec_pain_locations',
    input: 'multi_choice',
    question: '아픈 곳은 어디인가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'pain') && SEC_NOT_PRIMARY('pain')(r),
    options: [
      { value: 'neck_shoulder', label: '목·어깨' },
      { value: 'low_back_pelvis', label: '허리·골반' },
      { value: 'arm_hand', label: '팔·손' },
      { value: 'leg_foot', label: '다리·발' },
      { value: 'knee', label: '무릎' },
      { value: 'head_face_jaw', label: '머리·얼굴·턱' },
      { value: 'chest_rib', label: '가슴·갈비뼈 주변' },
      { value: 'abdomen', label: '배 주변' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_URINARY_01',
    variable: 'sec_urinary_problems',
    input: 'multi_choice',
    question: '소변이나 방광에 대해서는 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'urinary') && SEC_NOT_PRIMARY('urinary')(r),
    options: [
      { value: 'frequency', label: '소변을 자주 봐요' },
      { value: 'urgency', label: '갑자기 소변이 마려워 참기 어려워요' },
      { value: 'nocturia', label: '밤에 자다가 소변 때문에 깨요' },
      { value: 'voiding_difficulty', label: '소변이 잘 나오지 않거나 약해요' },
      { value: 'incomplete_emptying', label: '소변을 봐도 덜 본 느낌이 있어요' },
      { value: 'dysuria', label: '소변 볼 때 아프거나 불편해요' },
      { value: 'incontinence', label: '소변이 새는 경우가 있어요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_FATIGUE_01',
    variable: 'sec_fatigue_patterns',
    input: 'multi_choice',
    question: '피로에 대해서는 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'fatigue') && SEC_NOT_PRIMARY('fatigue')(r),
    options: [
      { value: 'morning_fatigue', label: '아침부터 기운이 없어요' },
      { value: 'exertional_fatigue', label: '조금만 움직여도 쉽게 지쳐요' },
      { value: 'later_day_fatigue', label: '오후나 저녁에 더 처져요' },
      { value: 'poor_recovery', label: '쉬어도 회복이 잘 안 돼요' },
      { value: 'heaviness', label: '몸이 무겁고 늘어져요' },
      { value: 'sleepiness', label: '졸리고 잠이 쏟아져요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_STRESS_01',
    variable: 'sec_stress_problems',
    input: 'multi_choice',
    question: '스트레스나 마음에 대해서는 어떤 점이 힘든가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'stress') && SEC_NOT_PRIMARY('stress')(r),
    options: [
      { value: 'worry', label: '걱정이나 생각이 많아요' },
      { value: 'tension', label: '긴장되고 예민해요' },
      { value: 'irritability', label: '짜증이나 화가 자주 나요' },
      { value: 'low_mood', label: '마음이 가라앉고 의욕이 없어요' },
      { value: 'palpitation_tightness', label: '가슴이 두근거리거나 답답할 때가 있어요' },
      { value: 'somatic_worsening', label: '스트레스를 받으면 몸 증상이 심해져요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_WOMEN_01',
    variable: 'sec_women_problems',
    input: 'multi_choice',
    question: '여성 건강에 대해서는 어떤 점이 불편한가요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    exclusive: 'none',
    showIf: (r) => has(r, 'SECONDARY_01', 'women') && SEC_NOT_PRIMARY_WOMEN(r),
    options: [
      { value: 'irregular_cycle', label: '생리 주기가 불규칙해요' },
      { value: 'dysmenorrhea', label: '생리통이 심해요' },
      { value: 'flow_change', label: '생리양이 너무 많거나 적어요' },
      { value: 'premenstrual', label: '생리 전후 몸이나 기분 변화가 심해요' },
      { value: 'discharge_discomfort', label: '냉·분비물이나 질 불편감이 있어요' },
      { value: 'menopause_symptoms', label: '갱년기 증상이 있어요' },
      { value: 'none', label: '특별히 없어요' },
    ],
  },
  {
    id: 'SEC_WEIGHT_01',
    variable: 'sec_weight_goal',
    input: 'single_choice',
    question: '체중 관리에서는 무엇을 가장 원하시나요?',
    required: true,
    step: '상세 증상',
    showIf: (r) => has(r, 'SECONDARY_01', 'weight') && SEC_NOT_PRIMARY('weight')(r),
    options: [
      { value: 'weight_loss', label: '체중을 줄이고 싶어요' },
      { value: 'fat_loss', label: '체지방을 줄이고 싶어요' },
      { value: 'appetite_control', label: '식욕 조절이 가장 어려워요' },
      { value: 'maintenance', label: '요요 없이 유지하고 싶어요' },
      { value: 'health_management', label: '전반적인 건강 관리를 함께 하고 싶어요' },
    ],
  },
]

/* ---------- 11. 체질·보약 추가 문항 ---------- */

const CONSTITUTION_BASIC_QUESTIONS: Question[] = [
  {
    id: 'CONST_ENERGY',
    variable: 'energy_recovery',
    input: 'single_choice',
    question: '평소 기운과 회복력은 어떠신가요?',
    required: true,
    step: '전신 정보',
    showIf: (r) => r['VISIT_01'] === 'constitution',
    options: [
      { value: 'sufficient', label: '충분한 편이에요' },
      { value: 'tired_recovers', label: '쉽게 피곤하지만 쉬면 회복돼요' },
      { value: 'frequent_poor', label: '자주 피곤하고 회복이 더뎌요' },
      { value: 'always_exhausted', label: '늘 기운이 없고 쉽게 지쳐요' },
    ],
  },
  {
    id: 'CONST_SLEEP',
    variable: 'sleep_basic',
    input: 'single_choice',
    question: '평소 잠은 어떠신가요?',
    required: true,
    step: '전신 정보',
    showIf: (r) => r['VISIT_01'] === 'constitution',
    options: [
      { value: 'normal', label: '특별히 불편하지 않아요' },
      { value: 'onset_difficulty', label: '잠들기 어려워요' },
      { value: 'frequent_waking', label: '자주 깨요' },
      { value: 'nonrestorative', label: '자도 개운하지 않아요' },
    ],
  },
  {
    id: 'CONST_DIGESTION',
    variable: 'digestion_basic',
    input: 'single_choice',
    question: '속이나 소화는 어떠신가요?',
    required: true,
    step: '전신 정보',
    showIf: (r) => r['VISIT_01'] === 'constitution',
    options: [
      { value: 'normal', label: '특별히 불편하지 않아요' },
      { value: 'occasional', label: '가끔 불편해요' },
      { value: 'frequent', label: '자주 불편해요' },
      { value: 'severe', label: '식사가 부담스러울 정도예요' },
    ],
  },
  {
    id: 'CONST_BOWEL',
    variable: 'bowel_basic',
    input: 'single_choice',
    question: '대변은 어떠신가요?',
    required: true,
    step: '전신 정보',
    showIf: (r) => r['VISIT_01'] === 'constitution',
    options: [
      { value: 'regular', label: '규칙적이고 편해요' },
      { value: 'constipation', label: '변비가 있어요' },
      { value: 'loose', label: '묽거나 설사를 자주 해요' },
      { value: 'alternating', label: '변비와 설사가 번갈아 있어요' },
    ],
  },
]

/* ---------- 10. 한약 처방 참고용 최소 공통정보 ---------- */

const HERBAL_REFERENCE_QUESTIONS: Question[] = [
  {
    id: 'HERB_APPETITE',
    variable: 'appetite_level',
    input: 'single_choice',
    question: '평소 식욕은 어떠신가요?',
    required: true,
    step: '전신 정보',
    options: [
      { value: 'low', label: '적은 편이에요' },
      { value: 'normal', label: '보통이에요' },
      { value: 'good', label: '좋은 편이에요' },
      { value: 'excessive', label: '지나치게 강한 편이에요' },
      { value: 'irregular', label: '일정하지 않아요' },
    ],
  },
  {
    id: 'HERB_THERMAL',
    variable: 'thermal_tendency',
    input: 'single_choice',
    question: '평소 추위와 더위는 어떠신가요?',
    required: true,
    step: '전신 정보',
    options: [
      { value: 'cold_sensitive', label: '추위를 많이 타요' },
      { value: 'heat_sensitive', label: '더위를 많이 타요' },
      { value: 'both', label: '둘 다 많이 타요' },
      { value: 'neither', label: '둘 다 특별하지 않아요' },
    ],
  },
  {
    id: 'HERB_THIRST',
    variable: 'thirst_level',
    input: 'single_choice',
    question: '평소 갈증은 어떠신가요?',
    required: true,
    step: '전신 정보',
    options: [
      { value: 'minimal', label: '갈증이 거의 없어요' },
      { value: 'normal', label: '보통이에요' },
      { value: 'frequent', label: '자주 목이 말라요' },
      { value: 'severe', label: '물을 마셔도 갈증이 심해요' },
    ],
  },
  {
    id: 'HERB_SWEAT',
    variable: 'sweat_pattern',
    input: 'single_choice',
    question: '평소 땀은 어떤 편인가요?',
    required: true,
    step: '전신 정보',
    options: [
      { value: 'normal', label: '특별하지 않아요' },
      { value: 'low', label: '적은 편이에요' },
      { value: 'high', label: '많은 편이에요' },
      { value: 'exertion_excessive', label: '조금만 움직여도 많이 나요' },
      { value: 'night_sweat', label: '잘 때 땀이 나요' },
    ],
  },
]

/* ---------- 12~19. 병력·안전정보 / 출생정보 / 자유입력 ---------- */

const HISTORY_QUESTIONS: Question[] = [
  {
    id: 'MED_USE',
    variable: 'medication_use',
    input: 'single_choice',
    question: '현재 복용하거나 사용하는 약·주사·건강기능식품이 있나요?',
    required: true,
    step: '병력정보',
    helperIf: (r) =>
      r['MED_USE'] === 'yes' || r['MED_USE'] === 'unknown'
        ? '약봉투·처방전·복용약 사진이 있으면 진료 때 보여주세요.'
        : undefined,
    options: [
      { value: 'none', label: '없어요' },
      { value: 'yes', label: '있어요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'MED_TYPES',
    variable: 'medication_types',
    input: 'multi_choice',
    question: '해당하는 약의 종류를 알려주시면 진료에 도움이 됩니다.',
    helper: '해당되는 항목을 모두 선택해주세요. (선택 사항)',
    required: false,
    step: '병력정보',
    showIf: (r) => r['MED_USE'] === 'yes' || r['MED_USE'] === 'unknown',
    options: [
      { value: 'cardiac', label: '혈압·심장약' },
      { value: 'diabetes', label: '당뇨약' },
      { value: 'cholesterol', label: '콜레스테롤약' },
      { value: 'blood_thinner', label: '혈액을 묽게 하는 약' },
      { value: 'psych', label: '수면·정신건강 관련 약' },
      { value: 'hormone', label: '호르몬 관련 약' },
      { value: 'painkiller', label: '진통제' },
      { value: 'other_unknown', label: '기타 / 잘 모르겠어요' },
    ],
  },
  {
    id: 'HISTORY_01',
    variable: 'medical_history_flags',
    input: 'multi_choice',
    question: '현재 치료 중이거나 진단받은 중요한 질환이 있나요?',
    required: true,
    step: '병력정보',
    exclusive: 'none',
    options: [
      { value: 'cardiovascular', label: '심장·혈관 질환' },
      { value: 'diabetes', label: '당뇨' },
      { value: 'cerebrovascular', label: '뇌혈관 질환' },
      { value: 'liver', label: '간 질환' },
      { value: 'kidney', label: '신장 질환' },
      { value: 'thyroid', label: '갑상선 질환' },
      { value: 'cancer', label: '암' },
      { value: 'bleeding_disorder', label: '출혈 관련 질환' },
      { value: 'mental_health', label: '정신건강 관련 질환' },
      { value: 'other', label: '기타' },
      { value: 'none', label: '없음' },
    ],
  },
  {
    id: 'ALLERGY_01',
    variable: 'allergy_yn',
    input: 'single_choice',
    question: '약·한약·음식으로 심한 알레르기나 이상반응이 있었나요?',
    required: true,
    step: '병력정보',
    options: [
      { value: 'none', label: '없어요' },
      { value: 'yes', label: '있어요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'ALLERGY_02',
    variable: 'allergy_detail',
    input: 'short_text',
    question: '어떤 알레르기나 이상반응이 있었는지 짧게 적어주세요.',
    required: true,
    step: '병력정보',
    maxLength: 50,
    showIf: (r) => r['ALLERGY_01'] === 'yes',
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'SURGERY_01',
    variable: 'surgery_yn',
    input: 'single_choice',
    question: '큰 수술이나 입원 치료를 받은 적이 있나요?',
    required: true,
    step: '병력정보',
    options: [
      { value: 'none', label: '없어요' },
      { value: 'yes', label: '있어요' },
    ],
  },
  {
    id: 'SURGERY_02',
    variable: 'surgery_detail',
    input: 'short_text',
    question: '어떤 수술·입원이었는지 중요한 내용만 짧게 적어주세요.',
    required: true,
    step: '병력정보',
    maxLength: 50,
    showIf: (r) => r['SURGERY_01'] === 'yes',
    placeholder: '짧게 적어주세요',
  },
  {
    id: 'WOMEN_SAFETY_01',
    variable: 'reproductive_status',
    input: 'multi_choice',
    question: '현재 해당되는 것이 있나요?',
    required: true,
    step: '병력정보',
    exclusive: 'none',
    // 산후 주호소는 POSTPARTUM_01(경과)+POSTPARTUM_03(수유)이 이미 충분히 묻는다.
    // 임신 주호소는 PREGNANCY_01이 'pregnant'로 확정된 경우만 충분하고,
    // possible/trying/fertility/unknown/미응답인 경우는 수유·산후 여부가 전혀
    // 확인되지 않으므로 그대로 물어야 한다(난임·임신 준비 상담에서 안전 정보 누락 방지).
    showIf: (r) => {
      const key = primaryConcernKey(r)
      if (r['ID_03'] !== 'female') return false
      if (key === 'postpartum') return false
      if (key === 'pregnancy' && r['PREGNANCY_01'] === 'pregnant') return false
      return true
    },
    options: [
      { value: 'pregnant', label: '임신 중이에요' },
      { value: 'pregnancy_possible', label: '임신 가능성이 있어요' },
      { value: 'postpartum_1y', label: '출산 후 1년 이내예요' },
      { value: 'breastfeeding', label: '모유수유 중이에요' },
      { value: 'menopause', label: '폐경했어요' },
      { value: 'none', label: '해당 없음' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'TEST_01',
    variable: 'recent_test_flag',
    input: 'single_choice',
    question: '최근 건강검진이나 검사에서 이상이 있다고 들은 내용이 있나요?',
    required: true,
    step: '병력정보',
    helperIf: (r) =>
      r['TEST_01'] === 'yes' ? '검사 결과지가 있으면 진료 때 보여주세요.' : undefined,
    options: [
      { value: 'none', label: '없어요' },
      { value: 'yes', label: '있어요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
]

export type ReproductiveStatus = {
  source: 'WOMEN_SAFETY_01' | 'pregnancy_module' | 'postpartum_module' | null
  raw: string[] | null
  pregnant: boolean | null
  pregnancy_possible: boolean | null
  postpartum_1y: boolean | null
  breastfeeding: boolean | null
}

const POSTPARTUM_WITHIN_1Y = ['within_6_weeks', '6w_to_3m', '3_to_6m', '6_to_12m']

/**
 * 임신/산후 사실 하나를 여러 화면(WOMEN_SAFETY_01, Pregnancy/Postpartum Module)이
 * 중복으로 물을 수 있어 실제로 어느 화면 답을 근거로 쓸지 정리한다.
 * null ≠ none ≠ unknown: 확인되지 않은 사실은 반드시 null로 둔다.
 */
export const deriveReproductiveStatus = (r: Responses): ReproductiveStatus => {
  const key = primaryConcernKey(r)

  if (key === 'postpartum') {
    const since = r['POSTPARTUM_01']
    const feeding = r['POSTPARTUM_03']
    const raw: string[] = []
    if (typeof since === 'string') raw.push(since)
    if (typeof feeding === 'string') raw.push(feeding)
    return {
      source: 'postpartum_module',
      raw: raw.length > 0 ? raw : null,
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y:
        typeof since === 'string' ? POSTPARTUM_WITHIN_1Y.includes(since) : null,
      breastfeeding:
        typeof feeding === 'string' ? feeding === 'yes' || feeding === 'mixed' : null,
    }
  }

  // 임신 주호소에서 PREGNANCY_01이 'pregnant'로 확정되면 한약 안전성상
  // 가장 중요한 사실이 이미 확보된 것이므로 이를 우선한다.
  if (key === 'pregnancy' && r['PREGNANCY_01'] === 'pregnant') {
    return {
      source: 'pregnancy_module',
      raw: ['pregnant'],
      pregnant: true,
      pregnancy_possible: false,
      postpartum_1y: null,
      breastfeeding: null,
    }
  }

  const answer = r['WOMEN_SAFETY_01']
  if (Array.isArray(answer)) {
    // 임신 주호소에서 WOMEN_SAFETY_01도 함께 응답된 경우가 있을 수 있다(예: PREGNANCY_01
    // 'possible' 상태에서 안전 문진에도 답함). 이때는 WOMEN_SAFETY_01을
    // source로 유지하되, PREGNANCY_01에서 밝힌 'possible' 사실이 WOMEN_SAFETY_01
    // 응답에 반영되지 않았다면 그 사실을 잃지 않도록 보정한다.
    const pregnancyPossibleFromModule =
      key === 'pregnancy' && r['PREGNANCY_01'] === 'possible'

    if (answer.length === 1 && answer[0] === 'unknown') {
      return {
        source: 'WOMEN_SAFETY_01',
        raw: answer,
        pregnant: null,
        pregnancy_possible: pregnancyPossibleFromModule ? true : null,
        postpartum_1y: null,
        breastfeeding: null,
      }
    }
    return {
      source: 'WOMEN_SAFETY_01',
      raw: answer,
      pregnant: answer.includes('pregnant'),
      pregnancy_possible: answer.includes('pregnancy_possible') || pregnancyPossibleFromModule,
      postpartum_1y: answer.includes('postpartum_1y'),
      breastfeeding: answer.includes('breastfeeding'),
    }
  }

  return {
    source: null,
    raw: null,
    pregnant: null,
    pregnancy_possible: null,
    postpartum_1y: null,
    breastfeeding: null,
  }
}

const BIRTH_QUESTIONS: Question[] = [
  {
    id: 'BIRTH_01',
    variable: 'birth_date',
    input: 'numeric',
    question: '생년월일을 입력해주세요.',
    helper: '숫자만 입력해주세요. 예: 19900101',
    required: true,
    step: '출생정보',
    maxLength: 8,
    placeholder: 'YYYYMMDD',
  },
  {
    id: 'BIRTH_02',
    variable: 'birth_calendar_type',
    input: 'single_choice',
    question: '양력·음력을 알고 계신가요?',
    required: true,
    step: '출생정보',
    options: [
      { value: 'solar', label: '양력' },
      { value: 'lunar', label: '음력' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'BIRTH_02A',
    variable: 'lunar_leap_month',
    input: 'single_choice',
    question: '음력 생일이 윤달이었나요?',
    helper: '윤달이 아니면 "평달이에요"를 선택해주세요.',
    required: true,
    step: '출생정보',
    showIf: (r) => r['BIRTH_02'] === 'lunar',
    options: [
      { value: 'no', label: '평달이에요' },
      { value: 'yes', label: '윤달이에요' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'BIRTH_03',
    variable: 'birth_time_branch',
    input: 'single_choice',
    question: '태어난 시간대를 선택해주세요.',
    helper: '정확한 시간을 모르셔도 괜찮습니다.',
    required: true,
    step: '출생정보',
    options: [
      { value: 'ja', label: '밤 11시 ~ 새벽 1시 (자시)' },
      { value: 'chuk', label: '새벽 1시 ~ 새벽 3시 (축시)' },
      { value: 'in', label: '새벽 3시 ~ 새벽 5시 (인시)' },
      { value: 'myo', label: '새벽 5시 ~ 아침 7시 (묘시)' },
      { value: 'jin', label: '아침 7시 ~ 오전 9시 (진시)' },
      { value: 'sa', label: '오전 9시 ~ 오전 11시 (사시)' },
      { value: 'o', label: '오전 11시 ~ 오후 1시 (오시)' },
      { value: 'mi', label: '오후 1시 ~ 오후 3시 (미시)' },
      { value: 'sin', label: '오후 3시 ~ 오후 5시 (신시)' },
      { value: 'yu', label: '오후 5시 ~ 저녁 7시 (유시)' },
      { value: 'sul', label: '저녁 7시 ~ 밤 9시 (술시)' },
      { value: 'hae', label: '밤 9시 ~ 밤 11시 (해시)' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'BIRTH_03A',
    variable: 'birth_time_confidence',
    input: 'single_choice',
    question: '그 시간대가 얼마나 정확한가요?',
    required: true,
    step: '출생정보',
    showIf: (r) => r['BIRTH_03'] !== 'unknown' && r['BIRTH_03'] !== null,
    options: [
      { value: 'exact', label: '정확히 알아요' },
      { value: 'approximate', label: '대략 그 정도예요' },
    ],
  },
]

const FREE_TEXT_QUESTIONS: Question[] = [
  {
    id: 'FREE_01',
    variable: 'free_text_yn',
    input: 'single_choice',
    question: '문진에서 묻지 않았지만 원장에게 꼭 말씀하고 싶은 내용이 있나요?',
    required: true,
    step: '마무리',
    options: [
      { value: 'none', label: '없어요' },
      { value: 'yes', label: '있어요' },
    ],
  },
  {
    id: 'FREE_02',
    variable: 'free_text_detail',
    input: 'short_text',
    question: '원장에게 전하고 싶은 내용을 적어주세요.',
    required: true,
    step: '마무리',
    maxLength: 100,
    showIf: (r) => r['FREE_01'] === 'yes',
    placeholder: '100자 이내로 적어주세요',
  },
]

export const CORE_QUESTIONS: Question[] = [
  ...VISIT_QUESTIONS,
  ...SAFETY_QUESTIONS,
  ...SLEEP_QUESTIONS,
  ...GI_QUESTIONS,
  ...BOWEL_QUESTIONS,
  ...URINARY_QUESTIONS,
  ...PAIN_QUESTIONS,
  ...FATIGUE_QUESTIONS,
  ...STRESS_QUESTIONS,
  ...WOMEN_QUESTIONS,
  ...PREGNANCY_QUESTIONS,
  ...POSTPARTUM_QUESTIONS,
  ...WEIGHT_QUESTIONS,
  ...SECONDARY_SHORT_QUESTIONS,
  ...CONSTITUTION_BASIC_QUESTIONS,
  ...HERBAL_REFERENCE_QUESTIONS,
  ...HISTORY_QUESTIONS,
  ...BIRTH_QUESTIONS,
  ...FREE_TEXT_QUESTIONS,
]

export const ALL_QUESTIONS: Question[] = [...PATIENT_QUESTIONS, ...CORE_QUESTIONS]

/**
 * Red Flag / module-level safety flag 규칙. 진단하지 않고 직원 확인 필요
 * 여부만 판단한다. GI_03/BOWEL_03의 "네"는 각 Module 화면 제출 직후 기존
 * StaffCheckScreen과 동일한 안내를 띄우는 후보 flag로만 쓴다(8장).
 */
export const computeFlags = (r: Responses) => {
  const generalRed = has(r, 'SAFETY_01', 'chest_breathing')
    || has(r, 'SAFETY_01', 'focal_neuro')
    || has(r, 'SAFETY_01', 'loc_seizure')
    || has(r, 'SAFETY_01', 'sudden_severe_pain')
    || has(r, 'SAFETY_01', 'uncontrolled_bleeding')
    || has(r, 'SAFETY_01', 'high_fever_illness')

  const giNeedsReview = r['GI_03'] === 'yes'
  const bowelNeedsReview = r['BOWEL_03'] === 'yes'

  return {
    general_red: generalRed,
    gi_needs_review: giNeedsReview,
    bowel_needs_review: bowelNeedsReview,
    requires_staff_check: generalRed || giNeedsReview || bowelNeedsReview,
  }
}

/**
 * 화면 제출 직후 즉시 StaffCheckScreen을 띄우는 화면과 판정 조건.
 * SAFETY_01(공통 Red Flag)뿐 아니라 GI_03/BOWEL_03의 module-level safety
 * flag 후보도 동일한 기존 flow로 연결한다(새 safety architecture 없음).
 */
export const STAFF_CHECK_TRIGGERS: Record<string, (r: Responses) => boolean> = {
  SAFETY_01: (r) => computeFlags(r).general_red,
  GI_03: (r) => r['GI_03'] === 'yes',
  BOWEL_03: (r) => r['BOWEL_03'] === 'yes',
}

/* ---------- 9. 상세 Module 연결점 (router target, placeholder) ---------- */

/** 주호소 -> 다음 Sprint에서 연결할 상세 Module 이름 (아직 구현하지 않음) */
export const MODULE_ROUTES: Record<string, string> = {
  sleep: 'Sleep',
  digestion: 'GI',
  bowel: 'Bowel',
  pain: 'Pain',
  urinary: 'Urinary',
  fatigue: 'Fatigue',
  stress: 'Stress',
  women: 'Women',
  pregnancy: 'Pregnancy',
  postpartum: 'Postpartum',
  weight: 'Weight',
}

/**
 * 주호소 기준 router target. 아직 Module 화면은 없으므로 이름만 반환한다.
 * 향후 Router는 주호소만이 아니라 동반문제 + Module 결과를 함께 참고해야 한다(스펙 9장).
 */
export const primaryModuleTarget = (r: Responses): string | null => {
  const key = primaryConcernKey(r)
  return key ? MODULE_ROUTES[key] ?? null : null
}

export const secondaryModuleTargets = (r: Responses): string[] => {
  const v = r['SECONDARY_01']
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string' && x in MODULE_ROUTES)
    .map((x) => MODULE_ROUTES[x])
}

/** 동반문제 카테고리 -> 짧은 화면 screen_id. other/none은 짧은 화면이 없다. */
export const SECONDARY_SHORT_SCREENS: Record<string, string> = {
  sleep: 'SEC_SLEEP_01',
  digestion: 'SEC_GI_01',
  bowel: 'SEC_BOWEL_01',
  pain: 'SEC_PAIN_01',
  urinary: 'SEC_URINARY_01',
  fatigue: 'SEC_FATIGUE_01',
  stress: 'SEC_STRESS_01',
  women: 'SEC_WOMEN_01',
  weight: 'SEC_WEIGHT_01',
}

/** 동반문제 중 현재 짧은 화면이 실제로 보이는 카테고리의 router target 목록. */
export const secondaryScreensActivated = (r: Responses): string[] => {
  const visible = new Set(visibleQuestions(r).map((q) => q.id))
  return Object.entries(SECONDARY_SHORT_SCREENS)
    .filter(([, screenId]) => visible.has(screenId))
    .map(([key]) => MODULE_ROUTES[key])
}

/** 이번 Sprint 기준 실제로 문항까지 구현된 Module. 나머지는 router target만 존재한다. */
export const modulesActivated = (r: Responses): string[] => {
  const key = primaryConcernKey(r)
  if (key === 'sleep') return ['Sleep']
  if (key === 'digestion') return ['GI']
  if (key === 'bowel') return ['Bowel']
  if (key === 'urinary') return ['Urinary']
  if (key === 'pain') return ['Pain']
  if (key === 'fatigue') return ['Fatigue']
  if (key === 'stress') return ['Stress']
  if (key === 'women') return ['Women']
  if (key === 'pregnancy') return ['Pregnancy']
  if (key === 'postpartum') return ['Postpartum']
  if (key === 'weight') return ['Weight']
  return []
}

/** Router가 참고할 라우팅 정보 한 덩어리(주호소 + 동반문제 + 실제로 보인 화면 목록). */
export const buildRoutingPayload = (r: Responses) => {
  const primaryTarget = primaryModuleTarget(r)
  const secondaryScreens = secondaryScreensActivated(r)
  const allTargets: string[] = []
  if (primaryTarget) allTargets.push(primaryTarget)
  for (const t of secondaryScreens) {
    if (!allTargets.includes(t)) allTargets.push(t)
  }

  return {
    primary_concern: primaryConcernKey(r),
    primary_module: primaryTarget,
    modules_activated: modulesActivated(r),
    secondary_concerns: r['SECONDARY_01'],
    secondary_screens: secondaryScreens,
    all_targets: allTargets,
  }
}

export const visibleQuestions = (r: Responses): Question[] =>
  ALL_QUESTIONS.filter((q) => !q.showIf || q.showIf(r))

/**
 * stale branch cleanup.
 * 뒤로가기로 상위 선택이 바뀌어 show_if를 더 이상 만족하지 않는 화면의 응답을 null로 되돌린다.
 * 연쇄 의존까지 반영되도록 변화가 없을 때까지 반복한다.
 */
export const pruneStaleResponses = (
  r: Responses,
): { responses: Responses; removed: string[] } => {
  let cur = r
  const removed: string[] = []

  for (;;) {
    const visibleQs = visibleQuestions(cur)
    const visible = new Set(visibleQs.map((q) => q.id))
    const stale = ALL_QUESTIONS.filter(
      (q) => !visible.has(q.id) && cur[q.id] !== null && cur[q.id] !== undefined,
    )

    // optionsIf가 있는 multi_choice는 화면이 보이는 상태에서도 저장된 값에
    // 더 이상 허용되지 않는 옵션이 남아있을 수 있다(예: SECONDARY_01에서
    // 주호소로 바뀐 값). 현재 허용된 옵션과 교집합만 남긴다.
    const leaked: { id: string; values: string[] }[] = []
    for (const q of visibleQs) {
      if (q.input !== 'multi_choice' || !q.optionsIf) continue
      const stored = cur[q.id]
      if (!Array.isArray(stored)) continue
      const allowed = new Set(q.optionsIf(cur).map((o) => o.value))
      const filtered = stored.filter((v) => allowed.has(v))
      if (filtered.length !== stored.length) {
        leaked.push({ id: q.id, values: filtered })
      }
    }

    if (stale.length === 0 && leaked.length === 0) break

    const next: Responses = { ...cur }
    for (const q of stale) {
      next[q.id] = null
      removed.push(q.id)
    }
    for (const l of leaked) {
      next[l.id] = l.values
      removed.push(l.id)
    }
    cur = next
  }

  return { responses: cur, removed }
}

/**
 * 문진 응답 -> Saju 계산 엔진 입력 어댑터.
 * 엔진(src/saju)은 타입만 참조하고, 런타임 계산 호출은 App.tsx에서 한다.
 */
export const buildSajuInput = (r: Responses): SajuInput => {
  const calendarType = r['BIRTH_02'] === 'solar' || r['BIRTH_02'] === 'lunar' ? r['BIRTH_02'] : 'unknown'
  const timeBranch =
    typeof r['BIRTH_03'] === 'string' ? (r['BIRTH_03'] as TimeBranchKey | 'unknown') : null

  return {
    birthDateRaw: typeof r['BIRTH_01'] === 'string' ? r['BIRTH_01'] : '',
    calendarType,
    lunarLeapMonth:
      calendarType === 'lunar'
        ? ((r['BIRTH_02A'] as 'yes' | 'no' | 'unknown' | null) ?? 'unknown')
        : null,
    timeBranch,
    timeConfidence: (r['BIRTH_03A'] as 'exact' | 'approximate' | null) ?? null,
    sex: (r['ID_03'] as 'male' | 'female' | null) ?? null,
  }
}

/* ---------- Dev JSON: Master Spec 23장 그룹 구조 ---------- */

export const buildResponsePayload = (r: Responses) => ({
  patient: {
    patient_name: r['ID_01'],
    phone_last4: r['ID_02'],
    patient_sex: r['ID_03'],
  },
  visit_goal: {
    visit_goal: r['VISIT_01'],
    primary_symptom: r['VISIT_02_SYMPTOM_MAIN'],
    primary_symptom_other: r['VISIT_02A_SYMPTOM_OTHER'],
    chief_duration: r['VISIT_03_SYMPTOM_DURATION'],
    chief_impact: r['VISIT_04_SYMPTOM_IMPACT'],
    women_goal: r['VISIT_02_WOMEN'],
    constitution_goal: r['VISIT_02_CONST'],
  },
  primary_concern: {
    key: primaryConcernKey(r),
    router_target: primaryModuleTarget(r),
  },
  secondary_concerns: {
    secondary_concerns: r['SECONDARY_01'],
    secondary_other_text: r['SECONDARY_01A'],
    router_targets: secondaryModuleTargets(r),
  },
  safety_flags: {
    red_flag_general: r['SAFETY_01'],
    ...computeFlags(r),
  },
  modules: {
    sleep: {
      problems: r['SLEEP_01'],
      frequency_per_week: r['SLEEP_02'],
      awakening_reasons: r['SLEEP_03'],
      awakening_other: r['SLEEP_03A'],
    },
    gi: {
      problems: r['GI_01'],
      meal_relation: r['GI_02'],
      unable_to_eat_or_drink: r['GI_03'],
    },
    bowel: {
      problems: r['BOWEL_01'],
      frequency: r['BOWEL_02'],
      blood_or_black_stool: r['BOWEL_03'],
      straining: r['BOWEL_04'],
    },
    urinary: {
      problems: r['URINARY_01'],
      burden_frequency: r['URINARY_02'],
      nocturia_count: r['URINARY_03'],
      leakage_pattern: r['URINARY_04'],
    },
    pain: {
      primary_location: r['PAIN_01'],
      location_other: r['PAIN_01A'],
      pain_qualities: r['PAIN_02'],
      radiation: r['PAIN_04'],
      radiation_other: r['PAIN_04A'],
    },
    fatigue: {
      patterns: r['FATIGUE_01'],
      worst_time: r['FATIGUE_02'],
      recovery_after_rest: r['FATIGUE_03'],
    },
    stress: {
      problems: r['STRESS_01'],
      associated_symptoms: r['STRESS_03'],
    },
    women: {
      problems: r['WOMEN_01'],
      other_text: r['WOMEN_01A'],
      menstrual_status: r['WOMEN_02'],
      menopause_symptoms: r['WOMEN_03'],
    },
    pregnancy: {
      status: r['PREGNANCY_01'],
      trimester: r['PREGNANCY_02'],
      concerns: r['PREGNANCY_03'],
      other_text: r['PREGNANCY_03A'],
    },
    postpartum: {
      time_since_delivery: r['POSTPARTUM_01'],
      problems: r['POSTPARTUM_02'],
      other_text: r['POSTPARTUM_02A'],
      breastfeeding_status: r['POSTPARTUM_03'],
    },
    weight: {
      goal: r['WEIGHT_01'],
      contributing_factors: r['WEIGHT_02'],
      recent_weight_change: r['WEIGHT_03'],
      previous_attempts: r['WEIGHT_04'],
    },
  },
  secondary_modules: {
    sleep: { problems: r['SEC_SLEEP_01'] },
    gi: { problems: r['SEC_GI_01'] },
    bowel: { problems: r['SEC_BOWEL_01'] },
    pain: { locations: r['SEC_PAIN_01'] },
    urinary: { problems: r['SEC_URINARY_01'] },
    fatigue: { patterns: r['SEC_FATIGUE_01'] },
    stress: { problems: r['SEC_STRESS_01'] },
    women: { problems: r['SEC_WOMEN_01'] },
    weight: { goal: r['SEC_WEIGHT_01'] },
  },
  constitution_basics: {
    energy_recovery: r['CONST_ENERGY'],
    sleep_basic: r['CONST_SLEEP'],
    digestion_basic: r['CONST_DIGESTION'],
    bowel_basic: r['CONST_BOWEL'],
    appetite_level: r['HERB_APPETITE'],
    thermal_tendency: r['HERB_THERMAL'],
    thirst_level: r['HERB_THIRST'],
    sweat_pattern: r['HERB_SWEAT'],
  },
  medication: {
    medication_use: r['MED_USE'],
    medication_types: r['MED_TYPES'],
  },
  medical_history: {
    medical_history_flags: r['HISTORY_01'],
  },
  allergy: {
    allergy_yn: r['ALLERGY_01'],
    allergy_detail: r['ALLERGY_02'],
  },
  surgery_history: {
    surgery_yn: r['SURGERY_01'],
    surgery_detail: r['SURGERY_02'],
  },
  reproductive_status: {
    reproductive_status: r['WOMEN_SAFETY_01'],
    derived: deriveReproductiveStatus(r),
  },
  recent_tests: {
    recent_test_flag: r['TEST_01'],
  },
  birth_info: {
    birth_date: r['BIRTH_01'],
    birth_calendar_type: r['BIRTH_02'],
    lunar_leap_month: r['BIRTH_02A'],
    birth_time_branch: r['BIRTH_03'],
    birth_time_confidence: r['BIRTH_03A'],
  },
  free_text: {
    free_text_yn: r['FREE_01'],
    free_text_detail: r['FREE_02'],
  },
})
