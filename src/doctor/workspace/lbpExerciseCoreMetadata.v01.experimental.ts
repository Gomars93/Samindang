/**
 * LBP Exercise Core Metadata v0.1
 *
 * EXPERIMENTAL CLINICAL METADATA ONLY — NOT A RECOMMENDER.
 *
 * Purpose:
 * - deepen a small, high-utility subset of the canonical 57-item catalog first;
 * - provide start criteria / pragmatic starting dose / acceptable response /
 *   stop-review / regression / progression / target-function links;
 * - keep patient→exercise ranking and diagnosis→exercise mapping OUT of scope.
 *
 * Evidence boundary:
 * - broad exercise categories are supported by LBP guidelines;
 * - exact exercise-specific dose below is a pragmatic Samindang starting default,
 *   NOT a validated universal threshold and NOT a treatment-response cutoff;
 * - clinician judgment and patient response override these defaults.
 */

import type { LbpExerciseTargetFunction } from './lbpExerciseLibrary.v01.experimental'
import { getLbpExerciseById } from './lbpExerciseLibrary.v01.experimental'

export type LbpCoreExerciseMetadata = {
  exerciseId: string
  status: 'DRAFT_CLINICAL_METADATA'
  startingCriteriaKo: readonly string[]
  startingDoseKo: string
  acceptableResponseKo: readonly string[]
  stopReviewKo: readonly string[]
  regressionKo: string
  progressionKo: string
  targetFunctions: readonly LbpExerciseTargetFunction[]
}

export const LBP_CORE_EXERCISE_METADATA_POLICY = {
  coreSetVersion: 'CORE_20_V0_1',
  itemCount: 20,
  doseMeaning: 'PRAGMATIC_STARTING_DEFAULT_NOT_CLINICAL_THRESHOLD',
  rankingIncluded: false,
  patientMappingIncluded: false,
  diagnosisMappingIncluded: false,
  productionApproved: false,
  selectionPrincipleKo:
    '향후 추천은 진단명 단독이 아니라 기능·irritability·증상반응·목표·안전성을 함께 사용한다.',
} as const

function row(
  exerciseId: string,
  startingCriteriaKo: readonly string[],
  startingDoseKo: string,
  acceptableResponseKo: readonly string[],
  stopReviewKo: readonly string[],
  regressionKo: string,
  progressionKo: string,
  targetFunctions: readonly LbpExerciseTargetFunction[],
): LbpCoreExerciseMetadata {
  if (!getLbpExerciseById(exerciseId)) {
    throw new Error(`Unknown canonical LBP exercise id: ${exerciseId}`)
  }
  return {
    exerciseId,
    status: 'DRAFT_CLINICAL_METADATA',
    startingCriteriaKo,
    startingDoseKo,
    acceptableResponseKo,
    stopReviewKo,
    regressionKo,
    progressionKo,
    targetFunctions,
  }
}

export const LBP_CORE_EXERCISE_METADATA: readonly LbpCoreExerciseMetadata[] = [
  row(
    'LBP_ACT_01',
    ['독립 보행 또는 필요한 보조도구로 안전하게 걸을 수 있음', '짧은 보행에서 증상이 급격히 누적되지 않고 필요 시 중단·휴식 가능'],
    '1회 5~10분, 하루 1~2회부터 시작. 현재 허용량에 따라 더 짧게 시작 가능.',
    ['허리/하지의 익숙한 증상이 경미하게 느껴져도 보행 중 계속 누적되지 않음', '휴식 후 기저 수준 쪽으로 회복됨'],
    ['새로운 또는 진행하는 신경증상', '뚜렷한 하지 원위부 증상 확산이 반복적으로 누적', '보행 후 회복되지 않는 현저한 악화'],
    '2~5분으로 줄이거나 평지·느린 속도·휴식 지점을 사용',
    '연속시간 또는 속도 중 한 가지만 점진적으로 증가',
    ['WALKING', 'STANDING', 'WORK'],
  ),
  row(
    'LBP_ACT_02',
    ['연속 보행은 제한되지만 짧은 보행 구간은 허용 가능', '보행과 휴식을 스스로 조절할 수 있음'],
    '2~5분 보행 후 충분히 회복하는 휴식을 두고 약 3회 반복부터 시작. 개인 허용량에 맞춰 조정.',
    ['각 보행 구간의 증상이 이전 구간보다 지속적으로 누적되지 않음', '휴식 후 다음 구간을 다시 시작할 정도로 회복됨'],
    ['회복 구간을 두어도 증상이 계속 악화', '새로운 또는 진행하는 신경증상', '보행 허용량이 세션마다 뚜렷하게 감소'],
    '보행 구간을 더 짧게 하고 휴식 구간을 늘림',
    '보행 구간 연장 또는 휴식 구간 단축 중 한 가지만 변경',
    ['WALKING', 'STANDING', 'WORK'],
  ),
  row(
    'LBP_LUMBAR_02',
    ['네발기기 자세를 유지할 수 있음', '작은 범위의 허리·골반 움직임에서 날카로운 통증이나 원위부 증상 증가가 없음'],
    '천천히 5~8회, 1~2세트부터 시작.',
    ['편안한 범위의 당김 또는 가벼운 익숙한 불편', '반복하면서 움직임이 더 편안해지거나 최소한 악화되지 않음'],
    ['하지 원위부 증상이 반복할수록 더 멀리 내려감', '날카로운 통증 또는 운동 후 지속되는 뚜렷한 악화'],
    '움직임 범위를 줄이거나 골반 움직임만 작게 시행',
    '증상 반응이 안정적이면 범위를 조금 넓히거나 호흡과 함께 천천히 반복',
    ['FLEXION', 'EXTENSION', 'CUSTOM'],
  ),
  row(
    'LBP_LUMBAR_03',
    ['바로 누워 무릎을 세운 자세가 가능', '작은 좌우 회전에서 날카로운 통증이나 하지 원위부 증상 증가가 없음'],
    '좌우 각 5~8회, 1~2세트부터 시작.',
    ['허리·둔부의 가벼운 당김', '좌우 움직임 후 증상이 기저 수준으로 돌아옴'],
    ['회전할수록 증상이 뚜렷하게 누적', '새로운 하지 저림·방사통 또는 날카로운 통증'],
    '범위를 줄이거나 무릎 아래/사이에 지지물을 사용',
    '증상 없이 좌우 범위를 조금씩 확대하거나 끝범위에서 짧게 호흡',
    ['SLEEP', 'CUSTOM'],
  ),
  row(
    'LBP_DIR_02',
    ['엎드린 자세를 견딜 수 있음', '신전 방향 노출에서 하지 증상이 원위부로 뚜렷하게 증가하지 않음'],
    '10~30초 유지 × 3~5회부터 시작하고 매 반복 후 증상 분포를 재확인.',
    ['허리의 국소 불편은 가능', '하지 증상이 줄거나 몸쪽으로 이동하거나 최소한 원위부로 증가하지 않음'],
    ['하지 증상이 더 아래로 퍼지는 반응이 반복', '새로운 저림·감각저하·근력저하 또는 견디기 어려운 악화'],
    'prone lying 또는 더 낮은 신전 범위',
    '반응이 유리하면 유지시간을 늘리거나 repeated extension으로 진행',
    ['EXTENSION', 'STANDING', 'WALKING'],
  ),
  row(
    'LBP_DIR_03',
    ['신전 반복에 대한 증상 반응을 확인할 수 있음', '반복 시 하지 증상이 원위부로 증가하지 않고 기저 신경학적 상태가 안정적임'],
    '5~10회 1세트부터 시행한 뒤 즉시 증상 위치·강도·기능반응을 재확인.',
    ['허리 국소 증상의 일시적 증가는 가능하나 하지 증상은 몸쪽으로 이동하거나 안정적', '반복 후 목표동작이 같거나 더 편해짐'],
    ['반복할수록 하지 증상이 더 아래로 진행', '새로운 또는 진행하는 신경증상', '운동 종료 후에도 뚜렷한 악화가 지속'],
    'prone-on-elbows 또는 더 작은 신전 범위',
    '유리한 반응이 재현되면 반복수·가동범위·빈도 중 한 항목만 점진 증가',
    ['EXTENSION', 'STANDING', 'WALKING'],
  ),
  row(
    'LBP_DIR_04',
    ['굴곡 방향 노출이 증상·기능에 유리하거나 최소한 악화시키지 않는 반응이 확인됨', '굴곡 반복에서 새로운 신경학적 악화가 없음'],
    '5~10회 1세트부터 시행하고 반복 전후 증상 분포와 목표기능을 비교.',
    ['편안한 당김 또는 허리 국소 증상의 경미한 변화', '반복 후 하지 증상이 악화되지 않고 기능이 같거나 더 편해짐'],
    ['하지 증상이 반복할수록 원위부로 증가', '새로운 또는 진행하는 신경증상', '운동 후 기저 수준보다 뚜렷한 악화가 지속'],
    '범위를 줄이거나 더 지지된 자세에서 시행',
    '반응이 유리하면 가동범위 또는 반복수를 한 번에 하나씩 증가',
    ['FLEXION', 'SITTING', 'DRESSING'],
  ),
  row(
    'LBP_HIP_MOB_01',
    ['지지물을 이용해 안정적으로 서거나 반무릎 자세를 취할 수 있음', '골반을 과도하게 전방경사하지 않고 전방 고관절의 부드러운 당김을 만들 수 있음'],
    '20~30초 × 2회/측, 하루 1~2회부터 시작.',
    ['전방 고관절·대퇴의 당김', '운동 후 원래 허리통증이 지속적으로 증가하지 않음'],
    ['허리 통증이 명확히 증가해 지속', '새로운 방사통·저림', '고관절의 날카로운 관절통'],
    '보폭을 줄이고 벽/의자 지지, 필요 시 10~15초로 단축',
    '증상 없이 hip extension tolerance가 좋아지면 보폭 또는 유지시간을 소폭 증가',
    ['STANDING', 'WALKING', 'LIFTING', 'WORK'],
  ),
  row(
    'LBP_DEEP_TRUNK_01',
    ['편안하게 호흡하면서 복부에 낮은 강도의 긴장을 만들 수 있음', '수축 자체가 허리·하지 증상을 뚜렷하게 증가시키지 않음'],
    '편안한 호흡을 유지하며 5초 × 5~10회부터 시작.',
    ['복부의 가벼운 긴장·피로', '허리통증을 억지로 참기 위한 최대수축이 아님'],
    ['숨을 참아야만 유지 가능', '허리 또는 하지 증상이 반복할수록 증가'],
    '수축 강도와 유지시간을 줄이고 자연호흡부터 연습',
    '10초 내외의 편안한 유지 또는 간단한 팔다리 움직임에 수축을 연결',
    ['SIT_TO_STAND', 'LIFTING', 'WORK', 'CUSTOM'],
  ),
  row(
    'LBP_DEEP_TRUNK_03',
    ['바로 누운 자세에서 편안한 호흡과 낮은 강도의 trunk control이 가능', '한쪽 발을 미끄러뜨릴 때 골반·허리 증상이 뚜렷하게 증가하지 않음'],
    '좌우 각 5~8회, 1~2세트부터 시작.',
    ['복부의 가벼운 피로', '작은 골반 움직임은 허용되나 증상이 누적되지 않음'],
    ['허리통증이 반복할수록 증가', '새로운 하지 증상 또는 숨참/과도한 경직'],
    '미끄러뜨리는 거리를 줄이거나 한쪽만 시행',
    '슬라이드 범위를 늘리거나 좌우 교대, 이후 dead-bug regression 계열로 진행 가능',
    ['SIT_TO_STAND', 'LIFTING', 'CUSTOM'],
  ),
  row(
    'LBP_TRUNK_03',
    ['네발기기에서 균형을 유지할 수 있음', '팔만 또는 다리만 움직일 때 증상이 안정적이고 trunk control이 가능'],
    '5회 × 2세트부터 시작(원문 예시; 환자 상태에 따라 수정).',
    ['몸통·둔부의 가벼운 피로', '허리 또는 하지 증상이 반복할수록 누적되지 않음'],
    ['새 신경증상', '뚜렷한 distal symptom 증가', '견디기 어려운 악화'],
    '팔만 또는 다리만 시행하고 필요 시 지지면 확대',
    '반복수·hold·부하 중 한 항목만 점진적으로 증가',
    ['LIFTING', 'STANDING', 'WORK'],
  ),
  row(
    'LBP_TRUNK_END_01',
    ['바로 누워 무릎을 세운 자세가 가능', '작은 hip extension에서 허리·하지 증상이 뚜렷하게 증가하지 않음'],
    '5~10회, 1~2세트부터 시작.',
    ['둔부·후면 사슬의 근육 피로', '허리의 경미한 국소 불편이 누적되지 않는 범위'],
    ['허리통증이 반복할수록 증가', '하지 원위부 증상 증가 또는 햄스트링 경련이 지속'],
    '골반을 조금만 들거나 짧은 isometric hold로 축소',
    '반복수 또는 hold를 늘린 뒤 필요 시 bridge progression으로 진행',
    ['SIT_TO_STAND', 'STANDING', 'WALKING'],
  ),
  row(
    'LBP_HIP_STR_03',
    ['지지물을 잡고 안정적으로 설 수 있음', '골반을 크게 기울이지 않고 다리를 옆으로 움직일 수 있음'],
    '좌우 각 8~12회, 1~2세트부터 시작.',
    ['둔근의 국소 피로', '지지측 허리·고관절 증상이 일시적으로 가볍게 느껴질 수 있으나 누적되지 않음'],
    ['균형 상실 위험', '고관절의 날카로운 통증', '허리·하지 증상이 반복할수록 증가'],
    '양손 지지, 작은 범위, 반복수 감소',
    '지지 손을 줄이거나 반복수를 늘린 뒤 필요 시 밴드 저항 추가',
    ['STANDING', 'WALKING', 'WORK'],
  ),
  row(
    'LBP_FUNC_01',
    ['안전한 높이의 의자에서 일어날 수 있음', '낙상 위험이나 심한 기립성 증상이 별도 평가 없이 남아 있지 않음'],
    '5~10회, 1~2세트부터 시작.',
    ['허벅지·둔부의 근육 피로', '익숙한 허리 불편이 경미하게 나타나도 반복할수록 누적되지 않음'],
    ['일어설수록 통증·불안정성이 증가', '새로운 하지 신경증상', '현저한 어지럼 또는 균형 상실'],
    '높은 의자, 팔걸이/손 지지, 반복수 감소',
    '손 지지 제거 → 낮은 좌면 → 가벼운 외부부하 순으로 한 단계씩 진행',
    ['SIT_TO_STAND', 'WORK', 'CUSTOM'],
  ),
  row(
    'LBP_FUNC_05',
    ['서서 균형을 유지할 수 있음', '고관절을 뒤로 보내는 작은 범위에서 증상이 관리 가능'],
    '5~8회, 1~2세트의 기술 연습부터 시작.',
    ['둔부·햄스트링의 당김 또는 근육 피로', '허리 국소 불편이 반복할수록 누적되지 않음'],
    ['숙일수록 통증이 빠르게 증가', '하지 증상이 원위부로 진행', '균형 상실 또는 동작 조절이 어려움'],
    '벽에 엉덩이 터치, 막대기 cue, 작은 가동범위',
    '가동범위 확대 후 가벼운 물체를 포함하고 이후 load-capacity 운동으로 연결',
    ['FLEXION', 'LIFTING', 'WORK'],
  ),
  row(
    'LBP_LOAD_02',
    ['무부하 hip hinge를 통제된 형태로 수행 가능', '현재 증상 irritability가 고부하 연습을 허용하고 안전 관련 제한이 해소됨'],
    '가벼운 부하 또는 높은 시작 위치에서 5~8회, 1~2세트의 기술 연습부터 시작.',
    ['둔부·하지·몸통의 근육 피로', '세트 후 증상이 기저 수준 쪽으로 회복되고 기능이 악화되지 않음'],
    ['부하가 증가할수록 허리/하지 증상이 누적', '새로운 신경증상', '동작 통제가 무너지는데도 부하를 유지해야 함'],
    '부하 제거, 시작 위치 높이기, hip hinge 기술 연습으로 회귀',
    '가동범위 → 반복수 → 부하 순으로 한 번에 한 요소만 증가',
    ['LIFTING', 'WORK'],
  ),
  row(
    'LBP_NEURAL_01',
    ['slider 범위에서 신경을 강하게 당기는 느낌이 아니라 부드러운 왕복 움직임이 가능', '기저 신경학적 상태가 안정적이고 반복할수록 하지 증상이 누적되지 않음'],
    '부드러운 왕복 5~10회/측, 1~2세트부터 시작.',
    ['가벼운 신경 당김 또는 일시적 익숙한 증상', '각 반복 사이 증상이 풀리고 세션 후 원위부 증상이 증가하지 않음'],
    ['저림·통증이 반복할수록 더 아래로 퍼짐', '새로운 또는 진행하는 감각저하·근력저하', '운동 후 원위부 증상 증가가 지속'],
    '고관절·무릎·발목의 움직임 범위를 줄이고 한 관절의 excursion을 최소화',
    '증상 안정성을 유지한 채 가동범위 또는 반복수를 조금 증가; sustained tensioner로 자동 전환하지 않음',
    ['SITTING', 'WALKING', 'CUSTOM'],
  ),
  row(
    'LBP_EXPOSURE_01',
    ['숙이기가 중요한 목표기능 또는 회피 활동이며 낮은 범위에서는 안전하게 시도 가능', '현재 safety gate가 routine exposure를 허용함'],
    '편안한 범위에서 3~5회 controlled exposure부터 시작하고 반응을 기록.',
    ['익숙한 불편이 경미하게 나타날 수 있으나 반복할수록 공포·긴장 또는 증상이 누적되지 않음', '운동 직후 목표동작이 같거나 더 자연스러움'],
    ['증상이 반복할수록 뚜렷하게 증가', '하지 증상이 원위부로 진행', '새로운 신경증상'],
    '지지물을 사용하고 범위·속도·반복수를 줄임',
    '가동범위 → 반복수 → 가벼운 물체/업무 맥락 순으로 단계적으로 증가',
    ['FLEXION', 'DRESSING', 'LIFTING', 'WORK'],
  ),
  row(
    'LBP_EXPOSURE_03',
    ['짧은 앉기 자체는 가능하고 자세변경/중단 선택권이 있음', '오래 앉기가 실제 목표기능 또는 회피 활동과 연결됨'],
    '현재 편안히 가능한 시간보다 짧은 구간으로 1~3회 노출하고 종료 후 반응을 기록.',
    ['노출 중 익숙한 불편이 약간 증가할 수 있으나 자세변경·휴식 후 회복 가능', '다음 노출에서 허용시간이 급격히 줄지 않음'],
    ['앉을수록 하지 원위부 증상이 명확히 누적', '새로운 신경증상', '휴식 후에도 기저 수준으로 회복되지 않는 악화'],
    '노출시간을 줄이고 중간 자세변경·짧은 걷기 구간을 허용',
    '연속시간 또는 총 노출시간 중 한 항목만 점진적으로 증가',
    ['SITTING', 'WORK'],
  ),
  row(
    'LBP_REG_01',
    ['편안한 자세에서 자연호흡이 가능', '호흡 훈련이 어지럼·호흡곤란을 유발하지 않음'],
    '2~5분의 편안한 느린 호흡·이완부터 시작, 하루 1~2회 또는 필요 시.',
    ['호흡이 편안해지고 긴장도가 낮아지는 느낌', '통증이 반드시 감소해야 성공으로 보지 않음'],
    ['어지럼·호흡곤란·불안이 증가', '억지로 깊게 숨쉬어야 하거나 증상이 악화'],
    '1~2분 자연호흡 관찰로 줄이고 깊이·속도를 강제하지 않음',
    '5~10분으로 늘리거나 통증 유발 활동 전후의 regulation routine으로 연결',
    ['SLEEP', 'SITTING', 'CUSTOM'],
  ),
]

const CORE_METADATA_BY_ID = new Map(
  LBP_CORE_EXERCISE_METADATA.map((item) => [item.exerciseId, item]),
)

export function getLbpCoreExerciseMetadata(
  exerciseId: string,
): LbpCoreExerciseMetadata | undefined {
  return CORE_METADATA_BY_ID.get(exerciseId)
}
