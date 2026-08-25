import type { Question, Responses } from '../types'

/**
 * TMJ_V1 question definitions from the clinically CLOSED Tablet Question Set v0.1.
 * Kept separate from coreSpec so later HFJ routing integration remains a minimal,
 * auditable import/splice and HEADACHE_CRANIAL stays explicitly out of scope.
 */
export const IS_PRIMARY_HFJ_POPULATION = (r: Responses): boolean =>
  r['VISIT_01'] === 'symptom' &&
  r['VISIT_02_SYMPTOM_MAIN'] === 'pain' &&
  r['PAIN_01'] === 'head_face_jaw'

export const IS_PRIMARY_TMJ_SAFETY = (r: Responses): boolean =>
  IS_PRIMARY_HFJ_POPULATION(r) &&
  ['JAW_TMJ_MASTICATORY', 'FACIAL_NEURALGIC', 'DENTAL_OR_ORAL', 'DIFFUSE_OR_MULTIPLE', 'UNKNOWN'].includes(
    r['HFJ_00'] as string,
  )

export const TMJ_ROUTING_QUESTIONS: Question[] = [
  {
    id: 'HFJ_00',
    variable: 'head_face_jaw_discriminator',
    input: 'single_choice',
    question: '머리·얼굴·턱 중 지금 가장 불편한 부위나 양상은 어디에 가깝나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_HFJ_POPULATION,
    options: [
      { value: 'JAW_TMJ_MASTICATORY', label: '턱관절·씹을 때 턱이 불편해요' },
      { value: 'HEADACHE_CRANIAL', label: '두통·머리 쪽이 가장 불편해요' },
      { value: 'FACIAL_NEURALGIC', label: '얼굴 감각·신경통 같은 불편함이 중심이에요' },
      { value: 'DENTAL_OR_ORAL', label: '치아·잇몸·입안 쪽이 가장 불편해요' },
      { value: 'DIFFUSE_OR_MULTIPLE', label: '여러 부위가 비슷하게 불편해요' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
]

export const TMJ_QUESTIONS: Question[] = [
  {
    id: 'TMJ_01',
    variable: 'tmj_trauma_dislocation_screen',
    input: 'multi_choice',
    question: '현재 턱·얼굴과 관련해 다음 중 해당되는 것이 있나요?',
    helper: '해당되는 것을 모두 선택해주세요. 응급 확인이 필요한 내용이 포함되어 있습니다.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_TMJ_SAFETY,
    exclusive: ['NONE', 'UNKNOWN'],
    options: [
      { value: 'JAW_CURRENTLY_STUCK_OPEN_OR_ABNORMAL_POSITION', label: '턱이 열린 채 또는 비정상 위치로 고정되어 돌아오지 않아요' },
      { value: 'SEVERE_FACIAL_OR_JAW_TRAUMA_WITH_GROSS_DEFORMITY', label: '심한 얼굴·턱 외상 뒤 모양이 크게 변했어요' },
      { value: 'UNCONTROLLED_HEAVY_ORAL_BLEEDING', label: '입안에서 많은 출혈이 계속돼요' },
      { value: 'BREATHING_OR_SWALLOWING_COMPROMISE_WITH_SWELLING_OR_INJURY', label: '붓기나 다친 뒤 숨쉬거나 삼키기가 어려워요' },
      { value: 'TRAUMA_WITH_NEW_BITE_CHANGE_OR_MARKED_FUNCTION_LOSS', label: '다친 뒤 교합이 달라졌거나 입을 여닫는 기능이 크게 떨어졌어요' },
      { value: 'NONE', label: '해당 없음' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'TMJ_02',
    variable: 'tmj_dental_infection_screen',
    input: 'single_choice',
    question: '치아·잇몸·입안 통증이나 붓기와 관련해 현재 상태는 어떤가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_TMJ_SAFETY,
    options: [
      { value: 'NO_CONCERN', label: '그런 문제는 없어요' },
      { value: 'LOCALIZED_TOOTH_OR_GUM_PAIN_SWELLING_OR_PUS_TASTE', label: '한 부위 치아·잇몸 통증/붓기 또는 고름·이상한 맛이 있어요' },
      { value: 'FEVER_WITH_LOCALIZED_DENTAL_OR_ORAL_CONCERN', label: '국소 치아·입안 문제와 함께 열이 나요' },
      { value: 'LARGE_OR_SPREADING_SWELLING_OR_SEVERE_SYSTEMIC_ILLNESS', label: '붓기가 크거나 퍼지고 있거나 전신 상태가 많이 안 좋아요' },
      { value: 'EYE_AIRWAY_OR_SWALLOW_COMPROMISE', label: '눈 주변·기도·삼킴에 영향을 줄 정도의 붓기/증상이 있어요' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'TMJ_03',
    variable: 'tmj_gca_history_screen',
    input: 'multi_choice',
    question: '최근 새로 생긴 다음 증상이 있나요?',
    helper: '해당되는 것을 모두 선택해주세요.',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_TMJ_SAFETY,
    exclusive: ['NONE', 'UNKNOWN'],
    options: [
      { value: 'NEW_JAW_CLAUDICATION_WITH_CHEWING', label: '씹을수록 턱이 아프거나 쉽게 지쳐 쉬어야 해요' },
      { value: 'NEW_SCALP_OR_TEMPORAL_PAIN_TENDERNESS_PATTERN', label: '관자놀이·두피 쪽에 새 통증이나 누르면 아픈 느낌이 있어요' },
      { value: 'NEW_TRANSIENT_VISUAL_DISTURBANCE_DIPLOPIA_OR_VISUAL_LOSS', label: '새로 시야가 흐려지거나 겹쳐 보이거나 잠깐이라도 안 보인 적이 있어요' },
      { value: 'NONE', label: '해당 없음' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'TMJ_04',
    variable: 'tmj_facial_neuro_screen',
    input: 'single_choice',
    question: '얼굴 감각이 새로 둔해졌거나 지속되는 저림·감각 이상, 또는 한쪽 얼굴 기능의 뚜렷한 변화가 있나요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_TMJ_SAFETY,
    options: [
      { value: 'NO', label: '아니요' },
      { value: 'NEW_OR_PERSISTENT_FACIAL_NUMBNESS_OR_FOCAL_NEURO_CHANGE', label: '네' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
  {
    id: 'TMJ_05',
    variable: 'tmj_current_lock_screen',
    input: 'single_choice',
    question: '현재 턱이 걸려서 평소처럼 입을 열거나 닫을 수 없는 상태인가요?',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_TMJ_SAFETY,
    options: [
      { value: 'NO_CURRENT_FIXED_LOCK', label: '아니요' },
      { value: 'CURRENTLY_LOCKED_AND_CANNOT_OPEN_OR_CLOSE_NORMALLY', label: '네, 현재 정상적으로 열거나 닫기 어렵습니다' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
]
