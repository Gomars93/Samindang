import type { Question, Responses } from '../types'

/**
 * HIP_V1 question definitions from the clinically CLOSED Tablet Question Set v0.1.
 * Kept separate from coreSpec so the later shared low_back_pelvis wiring is a
 * minimal import/splice and cannot accidentally rewrite FROZEN LBP questions.
 */
export const IS_PRIMARY_HIP_POPULATION = (r: Responses): boolean =>
  r['VISIT_01'] === 'symptom' &&
  r['VISIT_02_SYMPTOM_MAIN'] === 'pain' &&
  r['PAIN_01'] === 'low_back_pelvis'

export const IS_PRIMARY_HIP_SAFETY = (r: Responses): boolean =>
  IS_PRIMARY_HIP_POPULATION(r) &&
  ['BUTTOCK_PELVIS_DOMINANT', 'HIP_GROIN_DOMINANT', 'SIMILAR_OR_MULTIPLE', 'UNKNOWN'].includes(
    r['HIP_00'] as string,
  )

export const HIP_ROUTING_QUESTIONS: Question[] = [
  {
    id: 'HIP_00',
    variable: 'hip_region_discriminator',
    input: 'single_choice',
    question: '허리·골반 부위 중 지금 가장 불편한 곳은 어디에 가깝나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HIP_POPULATION,
    options: [
      { value: 'LOW_BACK_DOMINANT', label: '허리가 가장 불편해요' },
      { value: 'BUTTOCK_PELVIS_DOMINANT', label: '엉덩이·골반 쪽이 가장 불편해요' },
      { value: 'HIP_GROIN_DOMINANT', label: '고관절·사타구니 쪽이 가장 불편해요' },
      { value: 'SIMILAR_OR_MULTIPLE', label: '여러 부위가 비슷하게 불편해요' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
]

export const HIP_QUESTIONS: Question[] = [
  {
    id: 'HIP_01',
    variable: 'hip_recent_trauma',
    input: 'single_choice',
    question: '최근 넘어지거나 부딪히거나 사고를 당하는 등 엉덩관절·골반 부위를 다친 일이 있었나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HIP_SAFETY,
    options: [
      { value: 'YES', label: '네' },
      { value: 'NO', label: '아니요' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'HIP_02',
    variable: 'hip_limb_threatening_screen',
    input: 'multi_choice',
    question: '현재 다음 중 해당되는 것이 있나요?',
    helper: '해당되는 것을 모두 선택해주세요. 해당 내용이 있으면 직원이 바로 확인합니다.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HIP_SAFETY,
    exclusive: ['NONE', 'UNKNOWN'],
    options: [
      { value: 'GROSS_DEFORMITY_OR_JOINT_STUCK_OUT_OF_POSITION', label: '관절 모양이 심하게 변했거나 제자리로 돌아오지 않은 느낌' },
      { value: 'SEVERE_OPEN_INJURY_OR_HEAVY_BLEEDING', label: '심하게 벌어진 상처나 많은 출혈' },
      { value: 'NEW_MAJOR_DISTAL_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA', label: '다친 뒤 다리·발의 감각이나 힘이 새로 크게 떨어짐' },
      { value: 'FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE', label: '발이 갑자기 차갑거나 창백·푸르게 변하는 등 혈액순환 이상' },
      { value: 'NONE', label: '해당 없음' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'HIP_03',
    variable: 'hip_post_trauma_walking',
    input: 'single_choice',
    question: '다친 뒤 고관절·사타구니가 아프면서 체중을 싣거나 걷기가 많이 어려워졌나요?',
    required: true,
    step: '상세 증상',
    showIf: (r) => IS_PRIMARY_HIP_SAFETY(r) && r['HIP_01'] === 'YES',
    options: [
      { value: 'NO_MARKED_WALKING_DIFFICULTY', label: '아니요' },
      { value: 'MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY', label: '네, 많이 어렵습니다' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'HIP_03A',
    variable: 'hip_prior_imaging_context',
    input: 'single_choice',
    question: '이번 증상 때문에 이미 X-ray 등 검사를 받은 적이 있나요?',
    required: false,
    step: '상세 증상',
    showIf: (r) =>
      IS_PRIMARY_HIP_SAFETY(r) &&
      (r['HIP_03'] === 'MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY' || r['HIP_03'] === 'UNKNOWN'),
    options: [
      { value: 'NOT_DONE_OR_UNKNOWN', label: '검사하지 않았거나 잘 모르겠어요' },
      { value: 'DONE_TOLD_NORMAL', label: '검사했고 정상이라고 들었어요' },
      { value: 'DONE_TOLD_ABNORMAL', label: '검사했고 이상이 있다고 들었어요' },
    ],
  },
  {
    id: 'HIP_04',
    variable: 'hip_stress_fracture_pattern',
    input: 'multi_choice',
    question: '최근 고관절·사타구니 통증과 관련해 다음 중 해당되는 것이 있나요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HIP_SAFETY,
    exclusive: ['NONE', 'UNKNOWN'],
    options: [
      { value: 'ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN', label: '뚜렷한 사고 없이 서서히 시작된 깊은 고관절·사타구니 통증' },
      { value: 'RECENT_REPETITIVE_LOAD_RUNNING_JUMPING_MARCH_OR_LOAD_INCREASE', label: '최근 달리기·점프·행군 등 반복 부하나 운동량이 크게 늘었음' },
      { value: 'PROGRESSIVE_WEIGHT_BEARING_PAIN_OR_WORSENING_WALKING_TOLERANCE', label: '체중을 실을수록 아프고 걷는 거리가 점점 줄어듦' },
      { value: 'NONE', label: '해당 없음' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'HIP_05',
    variable: 'hip_infection_screen',
    input: 'single_choice',
    question: '고관절·사타구니 통증과 함께 열이 나거나 전신이 많이 아프거나, 통증이 빠르게 심해지는 양상이 있나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HIP_SAFETY,
    options: [
      { value: 'NO_CONCERN', label: '그런 양상은 없어요' },
      { value: 'LOCALIZED_STABLE_CONCERN', label: '국소적으로 불편하지만 빠르게 악화되지는 않아요' },
      { value: 'SYSTEMIC_OR_RAPIDLY_WORSENING', label: '전신이 많이 아프거나 통증이 빠르게 심해지고 있어요' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'HIP_06',
    variable: 'hip_progressive_neuro_screen',
    input: 'single_choice',
    question: '다친 일이 뚜렷하지 않은데도 최근 다리·발의 감각 저하나 힘 빠짐이 새로 생기거나 점점 심해지고 있나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HIP_SAFETY,
    options: [
      { value: 'NO', label: '아니요' },
      { value: 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS', label: '네' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
]
