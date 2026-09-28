/**
 * Midlife(갱년기·중년기 여성) v0.1 태블릿 문항 — `docs/MIDLIFE_UI_IA_v0.2.md`.
 *
 * 5단계: 1 생애단계 → 2 주요 증상 → 3 안전 확인 → 4 기존 진료 → 5 목표.
 * 한 화면 한 질문. 선택지는 기본 1열(`list`, 최소 높이 `--btn-min-h` 72px)이고,
 * 선택지가 10개를 넘는 증상·목표 화면(MID_04/13/14)만 2열 카드(`grid2`,
 * 최소 높이 104px)다 -- 1열이면 태블릿 한 화면을 넘는다. 안전 화면
 * (MID_08/09)은 저장소 규칙대로 항상 1열이다.
 *
 * 구조(PO 2026-09-27): 여성건강 진입(`VISIT_00_INTENT='women'` →
 * `VISIT_02_WOMEN`)·내비게이션·저장 인프라는 재사용하고, 임상 문항은 기존
 * `WOMEN_*`/`MS_*`를 억지로 재활용하지 않고 이 파일에 따로 둔다.
 *
 * 임신 가능성은 여기서 다시 묻지 않는다 — 기존 `WOMEN_SAFETY_01`(병력정보)이
 * 모든 여성에게 이미 나오고, 한약 안전·부위 팩이 전부 그 값을
 * (`deriveReproductiveStatus`) 읽는다. 같은 사실을 두 번 물어 값이 갈라지는
 * 것을 막기 위함이다. 임신 가능성 조합 안전 규칙은 `midlifeLogic.ts` 참고.
 *
 * `life_stage`는 태블릿에서 묻지도 계산하지도 않는다. 원자료(월경 변화·마지막
 * 월경·호르몬제)만 모으고, 생애단계는 원장이 Doctor View에서 고른다 —
 * 자동 분류는 이번 범위가 아니다(임상 자동진단 금지).
 *
 * 문구는 PO 검토 전 초안이다(v0.2 명세 §3 참고). 값(value)은 저장 키라
 * 한번 실제 환자 데이터가 쌓이면 바꾸지 않는다 — 라벨은 바꿔도 된다.
 */
import type { Option, Question, Responses } from '../types'
import { primaryConcernKey } from './visitRouting'

export const MIDLIFE_CONCERN_KEY = 'midlife'

export const IS_PRIMARY_MIDLIFE = (r: Responses): boolean => primaryConcernKey(r) === MIDLIFE_CONCERN_KEY

const GROUP = '갱년기 문진'
const TOTAL = 5
const section = (index: number, label: string) => ({ group: GROUP, index, total: TOTAL, label })

export const MIDLIFE_SECTIONS = [
  section(1, '생애단계'),
  section(2, '주요 증상'),
  section(3, '안전 확인'),
  section(4, '기존 진료'),
  section(5, '목표'),
] as const

/** 월경 판단이 불가능한 경우(자궁 수술·약물 등) -- 아래 폐경 후 출혈 규칙이 이 값을 무월경으로 읽지 않게 따로 둔다. */
export const CYCLE_NOT_ASSESSABLE = 'not_assessable'
export const CYCLE_AMENORRHEA_12M = 'amenorrhea_12m_plus'

/**
 * 주요 증상 선택지. 목표(MID_13/14)도 같은 목록에서 고른다 — 두 목록이
 * 따로 놀면 "가장 불편한 것"과 "가장 먼저 좋아지고 싶은 것"을 원장이
 * 나란히 비교할 수 없다.
 */
const SYMPTOM_OPTIONS: Option[] = [
  { value: 'hot_flash_sweat', label: '열감·땀' },
  { value: 'sleep', label: '수면 불편' },
  { value: 'mood_anxiety', label: '기분 변화·불안·우울' },
  { value: 'palpitation', label: '가슴 두근거림' },
  { value: 'joint_muscle', label: '관절·근육 통증' },
  { value: 'fatigue', label: '피로·기력 저하' },
  { value: 'memory_focus', label: '집중력·기억력 저하' },
  { value: 'genitourinary', label: '질 건조·소변 불편' },
  { value: 'weight_change', label: '체중 변화' },
  { value: 'headache', label: '두통' },
  { value: 'other', label: '그 밖의 증상' },
]

const PRIORITY_EXTRA_OPTIONS: Option[] = [
  { value: 'understand_body', label: '내 몸 상태 알기' },
  { value: 'plan_tests', label: '검사·치료 계획 알기' },
]

const PRIORITY_OPTIONS: Option[] = [...SYMPTOM_OPTIONS.filter((o) => o.value !== 'other'), ...PRIORITY_EXTRA_OPTIONS]

/**
 * 3단계 안전 확인 — URGENT. PO(2026-09-27) 목록 중 공통 안전문항
 * `SAFETY_01`(모든 환자, 이 모듈보다 먼저 나옴)이 이미 묻는 것
 * (흉통·심한 호흡곤란 / 급성 신경학적 증상 / 의식소실 / 멈추지 않는 출혈)은
 * 다시 묻지 않고 `midlifeLogic`이 그 답을 URGENT로 합친다. 여기서는 공통
 * 문항에 없는 두 가지만 묻는다.
 *
 * '해당 없음'은 맨 앞 -- 저장소의 단일 규칙(다지선다의 none은 index 0,
 * `tests/integration.spec.mjs` W9)을 안전 화면도 그대로 따른다.
 */
export const MIDLIFE_URGENT_OPTIONS: Option[] = [
  { value: 'none', label: '해당 없음' },
  { value: 'heavy_bleeding_faint', label: '출혈이 많아 어지럽거나 쓰러질 것 같아요' },
  { value: 'self_harm_plan', label: '자해·자살에 대한 구체적인 생각이나 계획이 있어요' },
]

/** 3단계 안전 확인 — PRIORITY EVALUATION(외부 평가가 밀리면 안 되는 것). */
const PRIORITY_EVAL_OPTIONS: Option[] = [
  { value: 'none', label: '해당 없음' },
  { value: 'postmenopausal_bleeding', label: '월경이 1년 넘게 없다가 출혈이 있었어요' },
  { value: 'abnormal_bleeding', label: '월경 외 출혈, 또는 월경이 너무 많거나 길어요' },
  { value: 'postcoital_bleeding', label: '성관계 후 출혈이 있었어요' },
  { value: 'bloating_pelvic', label: '배가 계속 부풀거나, 아랫배 통증·덩어리가 느껴져요' },
  { value: 'weight_loss_fever', label: '이유 없이 체중이 줄거나 열이 계속 나요' },
  { value: 'palpitation_persistent', label: '두근거림이 계속되거나 움직이면 심해져요' },
]

/** 폐경 후 출혈 선택지는 12개월 이상 무월경이라고 답한 사람에게만 보인다(다른 사람에겐 뜻이 없다). */
const priorityEvalOptionsFor = (r: Responses): Option[] =>
  r['MID_01'] === CYCLE_AMENORRHEA_12M
    ? PRIORITY_EVAL_OPTIONS
    : PRIORITY_EVAL_OPTIONS.filter((o) => o.value !== 'postmenopausal_bleeding')

export const MIDLIFE_QUESTIONS: Question[] = [
  /* ---------- 1. 생애단계 ---------- */
  {
    id: 'MID_01',
    variable: 'cycle_change',
    input: 'single_choice',
    question: '최근 1년, 월경(생리)은 어땠나요?',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[0],
    showIf: IS_PRIMARY_MIDLIFE,
    options: [
      { value: 'regular', label: '규칙적' },
      { value: 'slightly_changed', label: '조금 달라짐' },
      { value: 'very_irregular', label: '많이 불규칙' },
      { value: CYCLE_AMENORRHEA_12M, label: '1년 넘게 없음' },
      { value: CYCLE_NOT_ASSESSABLE, label: '수술·약 때문에 알기 어려움' },
    ],
  },
  {
    id: 'MID_02',
    variable: 'last_menstrual_period',
    input: 'single_choice',
    question: '마지막 월경은 언제였나요?',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[0],
    // 12개월 이상 무월경이면 답이 이미 정해져 있고, 판단 불가면 물을 수 없다.
    showIf: (r) =>
      IS_PRIMARY_MIDLIFE(r) && r['MID_01'] != null && r['MID_01'] !== CYCLE_AMENORRHEA_12M && r['MID_01'] !== CYCLE_NOT_ASSESSABLE,
    options: [
      { value: 'within_1m', label: '1개월 안' },
      { value: '1_3m', label: '1~3개월 전' },
      { value: '3_12m', label: '3~12개월 전' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'MID_03',
    variable: 'hormone_or_contraception_use',
    input: 'multi_choice',
    question: '호르몬제나 피임약을 쓰나요?',
    helper: '호르몬 루프도 포함해요. 모두 골라주세요.',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[0],
    exclusive: ['none', 'unknown'],
    showIf: IS_PRIMARY_MIDLIFE,
    options: [
      { value: 'none', label: '안 써요' },
      { value: 'hormone_therapy', label: '갱년기 호르몬제' },
      { value: 'contraceptive', label: '피임약·호르몬 루프' },
      { value: 'stopped_within_1y', label: '1년 안에 끊음' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },

  /* ---------- 2. 주요 증상 (+ Baseline PRO 3개) ---------- */
  {
    id: 'MID_04',
    variable: 'top_symptoms',
    input: 'multi_choice',
    question: '가장 불편한 증상은?',
    helper: '2개까지 골라주세요.',
    required: true,
    // 선택지가 10개를 넘어 1열이면 태블릿 한 화면을 넘는다 -- 2열 카드(최소 높이 104px).
    layout: 'grid2',
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[1],
    max: 2,
    showIf: IS_PRIMARY_MIDLIFE,
    options: SYMPTOM_OPTIONS,
  },
  {
    id: 'MID_05',
    variable: 'primary_symptom_0_10',
    input: 'numeric_scale',
    question: '지난 1주, 가장 불편한 증상은 얼마나 심했나요?',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[1],
    showIf: IS_PRIMARY_MIDLIFE,
    scale: { min: 0, max: 10, minLabel: '없음', maxLabel: '견디기 힘듦' },
  },
  {
    id: 'MID_06',
    variable: 'sleep_satisfaction_0_10',
    input: 'numeric_scale',
    question: '지난 1주, 잠은 얼마나 만족스러웠나요?',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[1],
    showIf: IS_PRIMARY_MIDLIFE,
    scale: { min: 0, max: 10, minLabel: '전혀 아님', maxLabel: '매우 만족' },
  },
  {
    id: 'MID_07',
    variable: 'function_interference_0_10',
    input: 'numeric_scale',
    question: '지난 1주, 증상으로 일상에 지장이 얼마나 있었나요?',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[1],
    showIf: IS_PRIMARY_MIDLIFE,
    scale: { min: 0, max: 10, minLabel: '지장 없음', maxLabel: '아무것도 못 함' },
  },

  /* ---------- 3. 안전 확인 ---------- */
  {
    id: 'MID_08',
    variable: 'midlife_urgent_screen',
    input: 'multi_choice',
    question: '지금 이런 상태가 있나요?',
    helper: '해당되면 바로 직원이 도와드려요.',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[2],
    exclusive: 'none',
    showIf: IS_PRIMARY_MIDLIFE,
    options: MIDLIFE_URGENT_OPTIONS,
  },
  {
    id: 'MID_09',
    variable: 'midlife_priority_screen',
    input: 'multi_choice',
    question: '최근 이런 일이 있었나요?',
    helper: '모두 골라주세요.',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[2],
    exclusive: 'none',
    showIf: IS_PRIMARY_MIDLIFE,
    options: PRIORITY_EVAL_OPTIONS,
    optionsIf: priorityEvalOptionsFor,
  },

  /* ---------- 4. 기존 진료 ---------- */
  {
    id: 'MID_10',
    variable: 'recent_provider_use',
    input: 'multi_choice',
    question: '최근 1년, 이 증상으로 다닌 병원은?',
    helper: '모두 골라주세요.',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[3],
    exclusive: 'none',
    showIf: IS_PRIMARY_MIDLIFE,
    options: [
      { value: 'none', label: '없어요' },
      { value: 'gynecology', label: '산부인과' },
      { value: 'internal_family', label: '내과·가정의학과' },
      { value: 'psychiatry', label: '정신건강의학과' },
      { value: 'other_korean_medicine', label: '다른 한의원' },
      { value: 'other', label: '그 밖의 병원' },
    ],
  },
  {
    id: 'MID_11',
    variable: 'existing_test_results',
    input: 'multi_choice',
    question: '최근 1년 안에 받은 검사는?',
    helper: '결과지가 있으면 보여주세요.',
    required: true,
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[3],
    exclusive: ['none', 'unknown'],
    showIf: IS_PRIMARY_MIDLIFE,
    options: [
      { value: 'none', label: '없어요' },
      { value: 'pelvic_ultrasound', label: '부인과 초음파' },
      { value: 'cervical_screening', label: '자궁경부암 검사' },
      { value: 'hormone_test', label: '호르몬 검사' },
      { value: 'bone_density', label: '골밀도' },
      { value: 'blood_test', label: '혈액검사(빈혈·갑상선)' },
      { value: 'breast_exam', label: '유방 검사' },
      { value: 'unknown', label: '잘 모르겠어요' },
    ],
  },
  /*
   * MID_12(coordination_burden, "병원·검사·약 챙기기가 부담되나요?")는 삭제했다
   * (PO 2026-09-28). 원장이 모든 환자에게 조율(navigation) 역할을 하므로 답이
   * 진료 방향을 바꾸지 않았고 — v0.1 원칙 "진료방향을 바꾸지 않는 문항은 제외" —
   * 조율 필요의 객관 근거는 MID_10(다닌 병원)·MID_11(받은 검사)과 7칸 ⑥ 외부평가
   * 미해결 수가 이미 보여준다. ID는 재사용하지 않는다(옛 기록과 섞이지 않게).
   */

  /* ---------- 5. 목표 ---------- */
  {
    id: 'MID_13',
    variable: 'patient_priority_1',
    input: 'single_choice',
    question: '가장 먼저 좋아지고 싶은 것은?',
    required: true,
    // 선택지가 10개를 넘어 1열이면 태블릿 한 화면을 넘는다 -- 2열 카드(최소 높이 104px).
    layout: 'grid2',
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[4],
    showIf: IS_PRIMARY_MIDLIFE,
    options: PRIORITY_OPTIONS,
  },
  {
    id: 'MID_14',
    variable: 'patient_priority_2',
    input: 'single_choice',
    question: '그다음으로 좋아지고 싶은 것은?',
    required: true,
    // 선택지가 10개를 넘어 1열이면 태블릿 한 화면을 넘는다 -- 2열 카드(최소 높이 104px).
    layout: 'grid2',
    step: '상세 증상',
    section: MIDLIFE_SECTIONS[4],
    showIf: (r) => IS_PRIMARY_MIDLIFE(r) && r['MID_13'] != null,
    options: [...PRIORITY_OPTIONS, { value: 'none', label: '없어요' }],
    // 첫 번째로 고른 것은 다시 보이지 않는다.
    optionsIf: (r) => [...PRIORITY_OPTIONS, { value: 'none', label: '없어요' }].filter((o) => o.value !== r['MID_13']),
  },
  /*
   * MID_15(next_action_confidence_0_10, "앞으로 어떻게 관리할지 감이 오시나요?")는
   * PO 2026-09-28 결정으로 삭제했다. 이 값이 재려던 것("진료 끝에 다음 할 일을 아는가")은
   * 진료 *후*에 생기는데, 태블릿은 진료 *전*에 묻는다 -- 문구를 세 번 고쳐도 어색했던
   * 이유가 시점이다. 원장이 구두로 묻는 것도 어색하다는 PO 판단에 따라 점수 측정 자체를
   * 없애고, 7칸 ⑥ 외부평가 진행 상태와 ⑦ 주차 review 기록 여부(행동)로 대신 본다.
   * ID는 재사용하지 않는다(옛 기록과 섞이지 않게).
   */
]
