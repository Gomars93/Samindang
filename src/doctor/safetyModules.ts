/**
 * Doctor View 재설계 v0.2 §11.1/§11.2/§11.3 — 안전 모듈 계산을 한 곳으로
 * 팩터링한다. 이 파일은 렌더 계층(선택자/셀렉터)이다: FROZEN
 * `src/spec/*Logic.ts`/`*Adapter.ts`의 `compute*Flags`/`to*StateFromDoctorPayload`
 * 함수를 그대로 호출만 하고, 임상 계산을 새로 만들지 않는다.
 *
 * 이전에는 각 `*SafetyPanel` 컴포넌트(DoctorView.tsx 내부 6개 + Hip/AnkleFoot/
 * Tmj 개별 파일 3개)가 이 계산을 각자 반복했다 — `deriveSafetyOverview`
 * (safetyOverview.ts)와 통합 안전 리스트(SafetySection.tsx)가 서로 다른
 * 결과를 계산할 위험이 있었다(Opus B1/B2). 이제 양쪽 다 `computeSafetyModuleRows`
 * 하나만 호출한다.
 *
 * 행 게이트(§11.2, invariant 1/Opus B3): `safety_flags.<module> !== null`인
 * 모듈 전부가 행을 만든다. `primary_module_detail`/`additional_module_detail`은
 * 정렬에만 쓰고 가시성 게이트로 쓰지 않는다 — LBP의 fail-open 게이트 결함
 * (주호소가 비-통증이고 "추가 상세상담=허리"인 환자는 safety_flags.lbp가
 * 계산되는데도 이전 게이트(`primary_module_detail === 'LBP'`)에서 렌더되지
 * 않던 문제)이 이 파일에서 자연히 해소된다.
 */
import { computeLbpFlags, diseaseSafetyLocked, treatmentSafetyLocked } from '../spec/lbpLogic'
import { toLbpStateFromDoctorPayload, ageFromDoctorPayload } from '../spec/lbpAdapter'
import { computeNeckFlags, neckDiseaseSafetyLocked, neckManipulationLocked } from '../spec/neckLogic'
import { toNeckStateFromDoctorPayload } from '../spec/neckAdapter'
import { computeShoulderFlags, shoulderSafetyLocked } from '../spec/shoulderLogic'
import { toShoulderStateFromDoctorPayload } from '../spec/shoulderAdapter'
import { computeKneeFlags, kneeSafetyLocked, KNEE08_HIP_FRACTURE_OPTION } from '../spec/kneeLogic'
import { toKneeStateFromDoctorPayload } from '../spec/kneeAdapter'
import { computeElbowFlags, elbowSafetyLocked } from '../spec/elbowLogic'
import { toElbowStateFromDoctorPayload } from '../spec/elbowAdapter'
import { computeWristHandFlags, wristHandSafetyLocked } from '../spec/wristHandLogic'
import { toWristHandStateFromDoctorPayload } from '../spec/wristHandAdapter'
import { computeHipFlags } from '../spec/hipLogic'
import { toHipStateFromDoctorPayload } from '../spec/hipAdapter'
import { computeAnkleFootFlags } from '../spec/ankleFootLogic'
import { toAnkleFootStateFromDoctorPayload } from '../spec/ankleFootAdapter'
import { computeTmjFlags } from '../spec/tmjLogic'
import { toTmjStateFromDoctorPayload } from '../spec/tmjAdapter'
import type { ClinicianJudgment } from './judgment'
import type { DoctorPayload } from './types'
import type { AnswerValue } from '../types'

export type SafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'

export type SafetyModuleKey =
  | 'lbp'
  | 'hip'
  | 'neck'
  | 'shoulder'
  | 'knee'
  | 'elbow'
  | 'wrist_hand'
  | 'ankle_foot'
  | 'tmj'

/** §11.2 행 게이트가 순회하는 9개 모듈의 고정 순서(정렬 tie-break에 사용). */
export const SAFETY_MODULE_KEYS: SafetyModuleKey[] = [
  'lbp',
  'hip',
  'neck',
  'shoulder',
  'knee',
  'elbow',
  'wrist_hand',
  'ankle_foot',
  'tmj',
]

export const SAFETY_MODULE_LABELS: Record<SafetyModuleKey, string> = {
  lbp: '허리(LBP)',
  hip: '고관절/사타구니(HIP)',
  neck: '목(NECK)',
  shoulder: '어깨(SHOULDER)',
  knee: '무릎(KNEE)',
  elbow: '팔꿈치(ELBOW)',
  wrist_hand: '손목/손(WRIST_HAND)',
  ankle_foot: '발목/발(ANKLE/FOOT)',
  tmj: '턱관절/얼굴(TMJ)',
}

export const SAFETY_STATUS_LABEL: Record<SafetyStatus, string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

export type SafetyChip = { key: string; label: string; text: string }
export type SafetyExam = { code: string; label: string }

export type SafetyModuleRow = {
  key: SafetyModuleKey
  label: string
  /** 화면에 실제로 표시할 상태 — disease status와 별개의 treatment lock만
   * 걸려 있는 경우(예: LBP 임신) CLEAR가 아니라 REVIEW_REQUIRED로 올린다
   * (§11.1 "any(*Locked===true)"와 같은 규칙, 행 레벨에서도 동일 적용). */
  status: SafetyStatus
  /** §11.3: 잠금 문구 — 접힘 여부와 무관하게 항상 노출한다. */
  lockedNotes: string[]
  /** true인 계산 플래그만 담는다(§11.3 "계산 플래그는 true만 렌더"). */
  chips: SafetyChip[]
  /** 불리언 플래그가 아닌, 값 자체가 있을 때만 뜨는 참고 문구(예: WRIST_HAND
   * X-ray context) — 안전 판정에 영향 없음을 항상 함께 명시한다. */
  extraNotes: string[]
  /** 권장 검사가 없는 모듈(HIP/ANKLE_FOOT/TMJ)은 빈 배열. */
  examCodes: SafetyExam[]
}

export type SafetyClinicianInputs = {
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
  shoulderObjectiveCuffWeakness?: ClinicianJudgment['shoulder_objective_cuff_weakness']
}

function bumpToReview(status: SafetyStatus, locked: boolean): SafetyStatus {
  if (status === 'CLEAR' && locked) return 'REVIEW_REQUIRED'
  return status
}

const LBP_TREATMENT_LABEL: Record<'CLEAR' | 'REVIEW_REQUIRED', string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
}

const LBP_EXAM_LABELS: Record<string, string> = {
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  LUMBAR_ACTIVE_MOVEMENT_RESPONSE: '요추 능동 움직임 반응 검사',
  LOWER_EXTREMITY_MOTOR_MYOTOME: '하지 근절(myotome) 근력 검사',
  SENSORY_SCREEN: '감각 검사',
  REFLEX_SCREEN: '반사 검사',
  NEURODYNAMIC_TEST_AS_INDICATED: '신경역동학 검사(필요시)',
  GAIT_AND_WALKING_TOLERANCE: '보행 및 보행 내구성 검사',
  NEUROLOGIC_EXAM: '신경학적 검사',
  HIP_SCREEN_AS_INDICATED: '고관절 검사(필요시)',
  VASCULAR_SCREEN_AS_INDICATED: '혈관 검사(필요시)',
}

/**
 * lbp_v1.0.yaml의 clinician_exam_selector.rules를 그대로 옮긴다. SIJ/hip
 * cluster 제안처럼 "원장이 의심할 때만" 해당하는 항목은 데이터로 판단할 수
 * 없어 제외한다(그 부분까지 자동 제안하면 클리니션 판단을 대신하는 것이 됨).
 */
function suggestedLbpExamCodes(flags: ReturnType<typeof computeLbpFlags>, claudicationWalking: AnswerValue): string[] {
  const codes: string[] = []
  if (flags.lbp_safety_status === 'CLEAR') {
    codes.push('TARGET_FUNCTION_REPRODUCTION', 'LUMBAR_ACTIVE_MOVEMENT_RESPONSE')
  }
  if (flags.leg_symptom_present === 'YES' || flags.leg_symptom_present === 'UNKNOWN' || flags.lbp_neuro_baseline_required) {
    for (const c of ['LOWER_EXTREMITY_MOTOR_MYOTOME', 'SENSORY_SCREEN', 'REFLEX_SCREEN']) {
      if (!codes.includes(c)) codes.push(c)
    }
  }
  if (flags.leg_symptom_present === 'YES' || flags.leg_symptom_present === 'UNKNOWN') {
    codes.push('NEURODYNAMIC_TEST_AS_INDICATED')
  }
  if (claudicationWalking === 'YES') {
    codes.push('GAIT_AND_WALKING_TOLERANCE', 'NEUROLOGIC_EXAM', 'HIP_SCREEN_AS_INDICATED', 'VASCULAR_SCREEN_AS_INDICATED')
  }
  return codes
}

function computeLbpRow(payload: DoctorPayload, lbpObjectiveMotorDeficit: ClinicianJudgment['lbp_objective_motor_deficit'] | undefined): SafetyModuleRow | null {
  if (payload.responses.safety_flags.lbp === null) return null
  const age = ageFromDoctorPayload(payload.responses)
  const state = toLbpStateFromDoctorPayload(payload.responses, lbpObjectiveMotorDeficit, age)
  const flags = computeLbpFlags(state)
  const locked = diseaseSafetyLocked(flags)
  const treatmentLocked = treatmentSafetyLocked(flags)
  const legSymptomLabel =
    flags.leg_symptom_present === 'YES' ? '있음' : flags.leg_symptom_present === 'NO' ? '없음' : '확인 필요'

  const chips: SafetyChip[] = [
    { key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.lbp_safety_status] },
    { key: 'treatment', label: '치료 안전', text: LBP_TREATMENT_LABEL[flags.treatment_safety_status] },
    { key: 'leg_symptom', label: '신경근성 증상 가능성', text: legSymptomLabel },
  ]
  if (flags.lbp_neuro_baseline_required) {
    chips.push({ key: 'neuro_baseline', label: '신경학적 기저검사', text: '필요(양쪽 다리 통증만, 자동 긴급 아님)' })
  }
  if (flags.lbp_inflammatory_pattern_consider) {
    chips.push({ key: 'inflammatory', label: '염증성 패턴', text: '고려(진단 아님)' })
  }

  const lockedNotes: string[] = []
  if (locked) {
    lockedNotes.push('안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.')
  } else if (treatmentLocked) {
    lockedNotes.push('치료 안전(임신 등) 확인 전까지 금기 민감 치료/운동은 원장 승인 없이 확정하지 않습니다.')
  }

  return {
    key: 'lbp',
    label: SAFETY_MODULE_LABELS.lbp,
    status: bumpToReview(flags.lbp_safety_status, treatmentLocked),
    lockedNotes,
    chips,
    extraNotes: [],
    examCodes: suggestedLbpExamCodes(flags, payload.responses.modules.lbp.claudication_walking).map((code) => ({
      code,
      label: LBP_EXAM_LABELS[code] ?? code,
    })),
  }
}

const NECK_RADICULAR_LABEL: Record<string, string> = {
  HIGHER_SUPPORT: '가능성 높음(임상 확인 필요)',
  CONSIDER: '고려 대상',
  LOWER_SUPPORT: '가능성 낮음',
  UNDETERMINED: '미분류(추가 확인 필요)',
}

const NECK_EXAM_LABELS: Record<string, string> = {
  CERVICAL_AROM: '경추 능동 관절가동범위 검사',
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  C5_T1_MOTOR: 'C5-T1 근절 근력 검사',
  DERMATOMAL_SENSORY: '피부분절 감각 검사',
  REFLEX_SCREEN: '반사 검사(이두근/상완요골근/삼두근)',
  SPURLING_TEST: 'Spurling 검사',
  DISTRACTION_TEST: '견인 검사(distraction)',
  ULNT_AS_INDICATED: '상지 신경역동학 검사(필요시)',
  GAIT_TANDEM: '보행/일자보행 검사',
  UE_LE_MOTOR_SENSORY: '상하지 근력·감각 검사',
  HYPERREFLEXIA_SCREEN: '반사항진 검사',
  HOFFMANN_TEST: 'Hoffmann 검사',
  BABINSKI_CLONUS_AS_INDICATED: 'Babinski/clonus 검사(필요시)',
  HAND_DEXTERITY: '손 정교운동 검사',
  UPPER_CERVICAL_EXAM: '상부 경추 검사',
  CFRT_CANDIDATE: '두개경부 굴곡회전 검사(CFRT) 후보',
  SHOULDER_AROM_PROM_RESISTED: '어깨 관절가동범위·저항 검사',
  CERVICAL_VS_SHOULDER_REPRODUCTION: '경추 vs 어깨 증상 재현 검사',
  DEEP_NECK_FLEXOR_ENDURANCE: '심부 목굴곡근 조절·지구력 검사',
  SCAPULAR_CONTROL_ENDURANCE: '견갑골 조절·지구력 검사',
  FUNCTIONAL_POSTURE_TOLERANCE: '기능적 자세 내구성 검사',
}

function suggestedNeckExamCodes(
  flags: ReturnType<typeof computeNeckFlags>,
  neck: DoctorPayload['responses']['modules']['neck'],
): string[] {
  const codes: string[] = []
  if (flags.neck_safety_status === 'CLEAR') {
    codes.push('CERVICAL_AROM', 'TARGET_FUNCTION_REPRODUCTION')
  }

  const extent = neck.distal_extent
  const neuro = neck.arm_neuro_symptoms
  const hasConcreteNeuro =
    Array.isArray(neuro) && neuro.some((v) => v === 'PARESTHESIA' || v === 'NUMBNESS' || v === 'SUBJECTIVE_WEAKNESS')
  const isNeuroNoneOnly = Array.isArray(neuro) && neuro.length === 1 && neuro[0] === 'NONE'

  if (extent === 'FOREARM' || extent === 'HAND_FINGERS' || hasConcreteNeuro) {
    for (const c of ['C5_T1_MOTOR', 'DERMATOMAL_SENSORY', 'REFLEX_SCREEN', 'SPURLING_TEST', 'DISTRACTION_TEST', 'ULNT_AS_INDICATED']) {
      if (!codes.includes(c)) codes.push(c)
    }
  }

  const cord = neck.cord_concern_screen
  const hasCordConcrete =
    Array.isArray(cord) &&
    cord.some((v) =>
      ['HAND_CLUMSINESS', 'GAIT_BALANCE_CHANGE', 'BILATERAL_OR_MULTI_LIMB_NEURO', 'RAPIDLY_WORSENING_LIMB_WEAKNESS', 'NEW_BLADDER_BOWEL_CHANGE'].includes(v),
    )
  if (hasCordConcrete || neck.cord_symptom_course === 'WORSENING') {
    for (const c of ['GAIT_TANDEM', 'UE_LE_MOTOR_SENSORY', 'HYPERREFLEXIA_SCREEN', 'HOFFMANN_TEST', 'BABINSKI_CLONUS_AS_INDICATED', 'HAND_DEXTERITY']) {
      if (!codes.includes(c)) codes.push(c)
    }
  }

  if (neck.headache_present === 'YES') {
    codes.push('UPPER_CERVICAL_EXAM', 'CFRT_CANDIDATE')
    if (!codes.includes('CERVICAL_AROM')) codes.push('CERVICAL_AROM')
  }

  if (extent === 'SHOULDER_UPPER_ARM' && isNeuroNoneOnly) {
    codes.push('SHOULDER_AROM_PROM_RESISTED', 'CERVICAL_VS_SHOULDER_REPRODUCTION')
  }

  if (neck.sustained_posture_aggravation === 'YES') {
    codes.push('DEEP_NECK_FLEXOR_ENDURANCE', 'SCAPULAR_CONTROL_ENDURANCE', 'FUNCTIONAL_POSTURE_TOLERANCE')
  }

  return codes
}

function computeNeckRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.neck === null) return null
  const state = toNeckStateFromDoctorPayload(payload.responses)
  const flags = computeNeckFlags(state)
  const locked = neckDiseaseSafetyLocked(flags)
  const manipulationLocked = neckManipulationLocked(flags)

  const chips: SafetyChip[] = [
    { key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.neck_safety_status] },
    { key: 'treatment', label: '치료 안전', text: SAFETY_STATUS_LABEL[flags.neck_treatment_safety_status] },
    { key: 'radicular', label: '신경근성 증상(방사통) 지지도', text: NECK_RADICULAR_LABEL[flags.radicular_support] ?? flags.radicular_support },
  ]
  if (flags.neck_neuro_baseline_required) {
    chips.push({ key: 'neuro_baseline', label: '신경학적 기저검사', text: '필요' })
  }
  if (flags.cervicogenic_headache_pattern_consider) {
    chips.push({ key: 'headache', label: '경인성 두통 패턴', text: '고려(진단 아님, CFRT 등 추가 검사 필요)' })
  }
  if (flags.movement_coordination_deficit_consider) {
    chips.push({ key: 'coordination', label: '자세 조절 저하', text: '고려(진단 아님)' })
  }

  const lockedNotes: string[] = []
  if (locked) {
    lockedNotes.push('안전 확인 전까지 일상적인 운동 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.')
  }
  if (manipulationLocked) {
    lockedNotes.push(
      locked
        ? '안전 확인 전까지 경추 HVLA/추나 조작·견인 제안도 함께 잠깁니다.'
        : '치료 안전(항응고제·골다공증·출혈질환·임신 등) 확인 전까지 경추 HVLA/추나 조작·견인·침습적 치료는 원장 승인 없이 확정하지 않습니다.',
    )
  }

  return {
    key: 'neck',
    label: SAFETY_MODULE_LABELS.neck,
    status: bumpToReview(flags.neck_safety_status, manipulationLocked),
    lockedNotes,
    chips,
    extraNotes: [],
    examCodes: suggestedNeckExamCodes(flags, payload.responses.modules.neck).map((code) => ({
      code,
      label: NECK_EXAM_LABELS[code] ?? code,
    })),
  }
}

const SHOULDER_EXAM_LABELS: Record<string, string> = {
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  AROM_FLEXION_ABDUCTION_ER: '능동 관절가동범위 검사(굴곡/외전/외회전)',
  PROM_ELEVATION_ER_IR: '수동 관절가동범위 검사(거상/외회전/내회전)',
  CUFF_STRENGTH_ER_ABDUCTION_IR: '회전근개 근력 검사(외회전/외전-scaption/내회전)',
  DEFORMITY_NEUROVASCULAR_FIRST: '변형·신경혈관 우선 확인',
  ACTIVE_VS_PASSIVE_ELEVATION: '능동 vs 수동 거상 비교 검사',
  LAG_DROP_ARM_ADJUNCT: 'Lag/drop-arm 검사(보조)',
  APPREHENSION_RELOCATION_IF_SAFE: '불안정성 유발 검사(안전 확인 후에만)',
  MOVEMENT_CONTROL_ASSESSMENT: '움직임 조절 평가',
}

function suggestedShoulderExamCodes(
  flags: ReturnType<typeof computeShoulderFlags>,
  shoulder: DoctorPayload['responses']['modules']['shoulder'],
): string[] {
  const codes: string[] = []
  if (flags.shoulder_safety_status === 'CLEAR') {
    codes.push('TARGET_FUNCTION_REPRODUCTION', 'AROM_FLEXION_ABDUCTION_ER', 'PROM_ELEVATION_ER_IR', 'CUFF_STRENGTH_ER_ABDUCTION_IR')
  }

  const hadTrauma = shoulder.recent_trauma === 'YES'
  const hardTraumaPositive =
    Array.isArray(shoulder.trauma_emergency_screen) &&
    shoulder.trauma_emergency_screen.some((v) => v === 'DEFORMITY_OR_STILL_OUT' || v === 'NEW_NEUROVASCULAR_CHANGE')
  const acuteCuffConcern =
    shoulder.acute_traumatic_cuff_concern === 'YES' || shoulder.acute_traumatic_cuff_concern === 'UNKNOWN'
  if (hadTrauma && (hardTraumaPositive || acuteCuffConcern)) {
    codes.push('DEFORMITY_NEUROVASCULAR_FIRST', 'ACTIVE_VS_PASSIVE_ELEVATION', 'CUFF_STRENGTH_ER_ABDUCTION_IR', 'LAG_DROP_ARM_ADJUNCT')
  }

  if (shoulder.instability_present === 'YES') {
    codes.push('APPREHENSION_RELOCATION_IF_SAFE', 'MOVEMENT_CONTROL_ASSESSMENT')
  }

  return [...new Set(codes)]
}

function computeShoulderRow(
  payload: DoctorPayload,
  shoulderObjectiveCuffWeakness: ClinicianJudgment['shoulder_objective_cuff_weakness'] | undefined,
): SafetyModuleRow | null {
  if (payload.responses.safety_flags.shoulder === null) return null
  const state = toShoulderStateFromDoctorPayload(payload.responses, payload.flags.general_red, shoulderObjectiveCuffWeakness)
  const flags = computeShoulderFlags(state)
  const locked = shoulderSafetyLocked(flags)

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.shoulder_safety_status] }]
  if (flags.expedited_referral_consider) {
    chips.push({ key: 'expedited', label: '신속 전문의 평가/의뢰 고려', text: '급성 외상 후 회전근개 파열 가능성 평가 필요' })
  }
  if (flags.pmr_or_systemic_inflammatory_pattern_consider) {
    chips.push({ key: 'pmr', label: '양측성 염증 패턴', text: '고려(진단 아님, PMR 등 전신질환 감별 필요)' })
  }

  return {
    key: 'shoulder',
    label: SAFETY_MODULE_LABELS.shoulder,
    status: flags.shoulder_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.'] : [],
    chips,
    extraNotes: [],
    examCodes: suggestedShoulderExamCodes(flags, payload.responses.modules.shoulder).map((code) => ({
      code,
      label: SHOULDER_EXAM_LABELS[code] ?? code,
    })),
  }
}

const KNEE_EXAM_LABELS: Record<string, string> = {
  GAIT_WEIGHT_BEARING: '보행/체중부하 검사',
  KNEE_AROM_PROM_EXTENSION: '능동/수동 관절가동범위 검사(신전 포함)',
  EFFUSION_ASSESSMENT: '삼출(effusion) 평가',
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  DISTAL_NEUROVASCULAR_EXAM: '원위부 신경혈관 검사',
  DEFORMITY_BONY_TENDERNESS: '변형·골압통 확인',
  FOCAL_BONY_TENDERNESS: '국소 골압통 확인',
  RADIOGRAPH_INDICATION_REVIEW: '방사선 촬영 필요성 검토',
  STRAIGHT_LEG_RAISE: '다리 들어올리기 검사(SLR)',
  ACTIVE_EXTENSION_EXTENSOR_LAG: '능동 신전/extensor lag 검사',
  EXTENSOR_MECHANISM_PALPATION: '신전기전 촉진',
  TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM: '실제 기계적 차단 vs 통증성 ROM 제한 감별',
  JOINT_LINE_EXAM: '관절선 압통 검사',
  CLINICIAN_DVT_ASSESSMENT_WELLS: '원장 DVT 평가(Wells)',
  HIP_GROIN_EXAM: '고관절/서혜부 검사',
  WEIGHT_BEARING_ASSESSMENT: '체중부하 평가',
}

function suggestedKneeExamCodes(
  flags: ReturnType<typeof computeKneeFlags>,
  knee: DoctorPayload['responses']['modules']['knee'],
): string[] {
  const codes: string[] = []
  if (flags.knee_safety_status === 'CLEAR') {
    codes.push('GAIT_WEIGHT_BEARING', 'KNEE_AROM_PROM_EXTENSION', 'EFFUSION_ASSESSMENT', 'TARGET_FUNCTION_REPRODUCTION')
  }

  const deformityNvConcern =
    (Array.isArray(knee.deformity_neurovascular_screen) &&
      knee.deformity_neurovascular_screen.some(
        (v) => v === 'GROSS_DEFORMITY_OR_STILL_OUT' || v === 'COLD_PALE_BLUE_FOOT' || v === 'MAJOR_NEW_DISTAL_NEURO_CHANGE',
      )) ||
    knee.spontaneously_reduced_dislocation_screen === 'YES'
  if (deformityNvConcern) {
    codes.push('DISTAL_NEUROVASCULAR_EXAM', 'DEFORMITY_BONY_TENDERNESS')
  }

  if (flags.fracture_imaging_consider) {
    codes.push('FOCAL_BONY_TENDERNESS', 'RADIOGRAPH_INDICATION_REVIEW')
  }

  if (knee.extensor_mechanism_concern === 'YES' || knee.extensor_mechanism_concern === 'UNKNOWN') {
    codes.push('STRAIGHT_LEG_RAISE', 'ACTIVE_EXTENSION_EXTENSOR_LAG', 'EXTENSOR_MECHANISM_PALPATION')
  }

  if (knee.true_locked_extension_block === 'YES' || knee.true_locked_extension_block === 'UNKNOWN') {
    codes.push('TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM', 'JOINT_LINE_EXAM')
  }

  if (flags.dvt_assessment_required) {
    codes.push('CLINICIAN_DVT_ASSESSMENT_WELLS')
  }

  const hipGroinConcern =
    Array.isArray(knee.referred_non_knee_redflag_screen) && knee.referred_non_knee_redflag_screen.includes(KNEE08_HIP_FRACTURE_OPTION)
  if (hipGroinConcern) {
    codes.push('HIP_GROIN_EXAM', 'WEIGHT_BEARING_ASSESSMENT')
  }

  return [...new Set(codes)]
}

function computeKneeRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.knee === null) return null
  const state = toKneeStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeKneeFlags(state)
  const locked = kneeSafetyLocked(flags)

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.knee_safety_status] }]
  if (flags.expedited_referral_consider) chips.push({ key: 'expedited', label: '신속 의뢰 고려', text: '예' })
  if (flags.fracture_imaging_consider) chips.push({ key: 'fracture_imaging', label: '골절·영상 평가 고려', text: '예' })
  if (flags.dvt_assessment_required) chips.push({ key: 'dvt', label: 'DVT 평가 필요', text: '예' })

  return {
    key: 'knee',
    label: SAFETY_MODULE_LABELS.knee,
    status: flags.knee_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.'] : [],
    chips,
    extraNotes: flags.dvt_assessment_required
      ? ['DVT 가능성을 확정한 것이 아니라 clinician-side 평가/Wells 확인이 필요합니다.']
      : [],
    examCodes: suggestedKneeExamCodes(flags, payload.responses.modules.knee).map((code) => ({
      code,
      label: KNEE_EXAM_LABELS[code] ?? code,
    })),
  }
}

const ELBOW_EXAM_LABELS: Record<string, string> = {
  ELBOW_AROM_PROM_FLEXION_EXTENSION: '능동/수동 관절가동범위 검사(굴곡-신전)',
  FOREARM_PRONATION_SUPINATION: '전완 회내/회외 검사',
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  GRIP_FUNCTIONAL_LOAD: '악력/기능적 부하 검사',
  DEFORMITY_BONY_TENDERNESS: '변형·골압통 확인',
  DISTAL_NEUROVASCULAR_EXAM: '원위부 신경혈관 검사',
  RADIOGRAPH_INDICATION_REVIEW: '방사선 촬영 필요성 검토',
  HOOK_TEST: 'Hook test',
  RESISTED_SUPINATION_FLEXION: '저항 회외/굴곡 검사',
  TENDON_CONTOUR_GAP: '건 윤곽/결손 촉진',
  ACTIVE_EXTENSION_AGAINST_RESISTANCE: '저항 능동 신전 검사',
  EXTENSOR_LAG_PALPABLE_DEFECT: 'Extensor lag/촉지 가능한 결손 확인',
  TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM: '실제 기계적 차단 vs 통증성 ROM 제한 감별',
  EFFUSION_ASSESSMENT: '삼출(effusion) 평가',
  ULNAR_SENSORY_DISTRIBUTION: '척골신경 감각분포 검사',
  INTRINSIC_HAND_STRENGTH_COORDINATION: '수내재근 근력/협조 검사',
}

function suggestedElbowExamCodes(
  flags: ReturnType<typeof computeElbowFlags>,
  elbow: DoctorPayload['responses']['modules']['elbow'],
): string[] {
  const codes: string[] = []
  if (flags.elbow_safety_status === 'CLEAR') {
    codes.push('ELBOW_AROM_PROM_FLEXION_EXTENSION', 'FOREARM_PRONATION_SUPINATION', 'TARGET_FUNCTION_REPRODUCTION', 'GRIP_FUNCTIONAL_LOAD')
  }

  const deformityNvConcern =
    (Array.isArray(elbow.deformity_neurovascular_screen) &&
      elbow.deformity_neurovascular_screen.some(
        (v) => v === 'GROSS_DEFORMITY_OR_STILL_OUT' || v === 'COLD_PALE_BLUE_HAND' || v === 'MAJOR_NEW_DISTAL_NEURO_CHANGE',
      )) ||
    elbow.spontaneously_reduced_dislocation_screen === 'YES'
  if (deformityNvConcern) {
    codes.push('DEFORMITY_BONY_TENDERNESS', 'DISTAL_NEUROVASCULAR_EXAM')
  }

  if (flags.fracture_imaging_consider) {
    codes.push('RADIOGRAPH_INDICATION_REVIEW')
  }

  if (elbow.distal_biceps_concern === 'YES' || elbow.distal_biceps_concern === 'UNKNOWN') {
    codes.push('HOOK_TEST', 'RESISTED_SUPINATION_FLEXION', 'TENDON_CONTOUR_GAP')
  }

  if (elbow.distal_triceps_concern === 'YES' || elbow.distal_triceps_concern === 'UNKNOWN') {
    codes.push('ACTIVE_EXTENSION_AGAINST_RESISTANCE', 'EXTENSOR_LAG_PALPABLE_DEFECT')
  }

  if (elbow.true_locked_rom_block === 'YES' || elbow.true_locked_rom_block === 'UNKNOWN') {
    codes.push('TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM', 'EFFUSION_ASSESSMENT')
  }

  if (flags.neuro_assessment_required) {
    codes.push('ULNAR_SENSORY_DISTRIBUTION', 'INTRINSIC_HAND_STRENGTH_COORDINATION')
  }

  return [...new Set(codes)]
}

function computeElbowRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.elbow === null) return null
  const state = toElbowStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeElbowFlags(state)
  const locked = elbowSafetyLocked(flags)

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.elbow_safety_status] }]
  if (flags.expedited_referral_consider) chips.push({ key: 'expedited', label: '신속 의뢰 고려', text: '예' })
  if (flags.fracture_imaging_consider) chips.push({ key: 'fracture_imaging', label: '골절·영상 평가 고려', text: '예' })
  if (flags.neuro_assessment_required) chips.push({ key: 'neuro', label: '신경학적 평가 필요', text: '예' })
  if (flags.infection_assessment_required) chips.push({ key: 'infection', label: '감염 평가 필요', text: '예' })

  return {
    key: 'elbow',
    label: SAFETY_MODULE_LABELS.elbow,
    status: flags.elbow_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.'] : [],
    chips,
    extraNotes: [],
    examCodes: suggestedElbowExamCodes(flags, payload.responses.modules.elbow).map((code) => ({
      code,
      label: ELBOW_EXAM_LABELS[code] ?? code,
    })),
  }
}

const WRIST_HAND_EXAM_LABELS: Record<string, string> = {
  WRIST_HAND_AROM_PROM: '손목/손가락 능동·수동 관절가동범위 검사',
  GRIP_PINCH_FUNCTIONAL: '악력/집는 힘 기능 평가',
  DEFORMITY_BONY_TENDERNESS: '변형·골압통 확인',
  DISTAL_NEUROVASCULAR_EXAM: '원위부 신경혈관 검사',
  RADIOGRAPH_INDICATION_REVIEW: '방사선 촬영 필요성 검토',
  SCAPHOID_SNUFFBOX_TENDERNESS: '주상골/스너프박스 압통 평가',
  FLEXOR_EXTENSOR_TENDON_INTEGRITY: '굴곡/신전건 기능 검사',
  WOUND_ERYTHEMA_SPREAD_ASSESSMENT: '상처/발적 확산 평가',
  FLEXOR_SHEATH_PALPATION: 'Flexor sheath(굴건막) 촉진',
  MEDIAN_ULNAR_SENSORY_DISTRIBUTION: '정중/척골신경 감각분포 검사',
  THENAR_INTRINSIC_STRENGTH: '무지대립근/수내재근 근력 검사',
}

const WRIST_HAND_XRAY_CONTEXT_LABEL: Record<string, string> = {
  NOT_DONE: '아직 X-ray를 찍지 않음(환자 보고)',
  DONE_TOLD_NORMAL: 'X-ray 촬영, 정상이라고 들었음(환자 보고)',
  DONE_TOLD_ABNORMAL: 'X-ray 촬영, 이상이 있다고 들었음(환자 보고)',
  DONE_RESULT_UNKNOWN: 'X-ray 촬영, 결과를 모름(환자 보고)',
  UNKNOWN: 'X-ray 여부 잘 모르겠다고 답변(환자 보고)',
}

function suggestedWristHandExamCodes(
  flags: ReturnType<typeof computeWristHandFlags>,
  wristHand: DoctorPayload['responses']['modules']['wrist_hand'],
): string[] {
  const codes: string[] = []
  if (flags.wrist_hand_safety_status === 'CLEAR') {
    codes.push('WRIST_HAND_AROM_PROM', 'GRIP_PINCH_FUNCTIONAL')
  }

  const deformityNvConcern =
    Array.isArray(wristHand.deformity_neurovascular_open_injury_screen) &&
    wristHand.deformity_neurovascular_open_injury_screen.some(
      (v) =>
        v === 'GROSS_DEFORMITY_OR_STILL_OUT' ||
        v === 'COLD_PALE_BLUE_DIGITS' ||
        v === 'MAJOR_NEW_DISTAL_NEURO_CHANGE' ||
        v === 'UNCONTROLLED_HEAVY_BLEEDING' ||
        v === 'SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE',
    )
  if (deformityNvConcern) {
    codes.push('DEFORMITY_BONY_TENDERNESS', 'DISTAL_NEUROVASCULAR_EXAM')
  }

  if (flags.fracture_imaging_consider) {
    codes.push('RADIOGRAPH_INDICATION_REVIEW', 'SCAPHOID_SNUFFBOX_TENDERNESS')
  }

  if (flags.tendon_injury_assessment_required) {
    codes.push('FLEXOR_EXTENSOR_TENDON_INTEGRITY')
  }

  if (flags.infection_assessment_required) {
    codes.push('WOUND_ERYTHEMA_SPREAD_ASSESSMENT', 'FLEXOR_SHEATH_PALPATION')
  }

  if (flags.neuro_assessment_required) {
    codes.push('MEDIAN_ULNAR_SENSORY_DISTRIBUTION', 'THENAR_INTRINSIC_STRENGTH')
  }

  return [...new Set(codes)]
}

function computeWristHandRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.wrist_hand === null) return null
  const state = toWristHandStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeWristHandFlags(state)
  const locked = wristHandSafetyLocked(flags)
  const wristHand = payload.responses.modules.wrist_hand
  const xrayContext = typeof wristHand.prior_xray_context === 'string' ? wristHand.prior_xray_context : null

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.wrist_hand_safety_status] }]
  if (flags.expedited_referral_consider) chips.push({ key: 'expedited', label: '신속 의뢰 고려', text: '예' })
  if (flags.fracture_imaging_consider) chips.push({ key: 'fracture_imaging', label: '골절·영상 평가 고려', text: '예' })
  if (flags.tendon_injury_assessment_required) chips.push({ key: 'tendon', label: '힘줄 손상 평가 필요', text: '예' })
  if (flags.infection_assessment_required) chips.push({ key: 'infection', label: '감염 평가 필요', text: '예' })
  if (flags.neuro_assessment_required) chips.push({ key: 'neuro', label: '신경학적 평가 필요', text: '예' })

  const extraNotes: string[] = []
  if (xrayContext) {
    extraNotes.push(
      `${WRIST_HAND_XRAY_CONTEXT_LABEL[xrayContext] ?? xrayContext} — 안전 판정에는 영향을 주지 않는 환자 보고 정보입니다.`,
    )
  }

  return {
    key: 'wrist_hand',
    label: SAFETY_MODULE_LABELS.wrist_hand,
    status: flags.wrist_hand_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.'] : [],
    chips,
    extraNotes,
    examCodes: suggestedWristHandExamCodes(flags, wristHand).map((code) => ({
      code,
      label: WRIST_HAND_EXAM_LABELS[code] ?? code,
    })),
  }
}

export function computeHipRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.hip === null) return null
  const state = toHipStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeHipFlags(state)
  const locked = flags.hip_safety_status !== 'CLEAR'

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.hip_safety_status] }]
  if (flags.expedited_referral_consider) chips.push({ key: 'expedited', label: '신속 의뢰 고려', text: '예' })
  if (flags.fracture_imaging_consider) chips.push({ key: 'fracture_imaging', label: '골절 영상검사 고려', text: '예' })
  if (flags.stress_fracture_assessment_required) chips.push({ key: 'stress_fracture', label: '피로골절 평가 필요', text: '예' })
  if (flags.infection_assessment_required) chips.push({ key: 'infection', label: '감염 평가 필요', text: '예' })
  if (flags.neuro_assessment_required) chips.push({ key: 'neuro', label: '신경학적 평가 필요', text: '예' })
  if (flags.loading_exercise_lock) chips.push({ key: 'loading_lock', label: '부하운동 잠금', text: '예' })

  const extraNotes: string[] = []
  if (flags.stress_fracture_assessment_required) {
    extraNotes.push('피로골절을 확진하는 것이 아니라 clinician-side 평가/영상검사 판단이 필요한 패턴 신호입니다 — 확인 전까지 일상적인 부하운동 추천은 잠깁니다.')
  }
  if (flags.infection_assessment_required) {
    extraNotes.push('환자 문진만으로 감염을 확진하지 않습니다 — 발열이 없다고 해서 감염 가능성이 배제되지 않습니다.')
  }
  if (flags.fracture_imaging_consider) {
    extraNotes.push('환자보고 이전 X-ray 결과는 참고 맥락일 뿐이며 이번 영상검사 필요성이나 안전 확인 단계를 낮추지 않습니다.')
  }

  return {
    key: 'hip',
    label: SAFETY_MODULE_LABELS.hip,
    status: flags.hip_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다.'] : [],
    chips,
    extraNotes,
    examCodes: [],
  }
}

export function computeAnkleFootRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.ankle_foot === null) return null
  const state = toAnkleFootStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeAnkleFootFlags(state)
  const locked = flags.ankle_foot_safety_status !== 'CLEAR'

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.ankle_foot_safety_status] }]
  if (flags.expedited_referral_consider) chips.push({ key: 'expedited', label: '신속 의뢰 고려', text: '예' })
  if (flags.fracture_imaging_consider) chips.push({ key: 'fracture_imaging', label: '골절·영상 평가 고려', text: '예' })
  if (flags.achilles_rupture_assessment_required) chips.push({ key: 'achilles', label: '아킬레스건 평가 필요', text: '예' })
  if (flags.infection_assessment_required) chips.push({ key: 'infection', label: '감염/당뇨발 평가 필요', text: '예' })
  if (flags.dvt_assessment_required) chips.push({ key: 'dvt', label: 'DVT 평가 필요', text: '예' })
  if (flags.neuro_assessment_required) chips.push({ key: 'neuro', label: '신경학적 평가 필요', text: '예' })

  const extraNotes: string[] = []
  if (flags.dvt_assessment_required) {
    extraNotes.push('DVT 가능성을 확정한 것이 아니라 clinician-side 평가/Wells 확인이 필요합니다.')
  }
  if (flags.achilles_rupture_assessment_required) {
    extraNotes.push('환자 문진만으로 파열을 확정하지 않습니다 — Thompson test 및 국소 진찰은 clinician 확인 영역입니다.')
  }
  if (flags.fracture_imaging_consider) {
    extraNotes.push('환자보고 체중부하/기능 정보는 영상 평가 고려 신호이며 Ottawa rule 결과를 자동 생성하지 않습니다.')
  }

  return {
    key: 'ankle_foot',
    label: SAFETY_MODULE_LABELS.ankle_foot,
    status: flags.ankle_foot_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다.'] : [],
    chips,
    extraNotes,
    examCodes: [],
  }
}

export function computeTmjRow(payload: DoctorPayload): SafetyModuleRow | null {
  if (payload.responses.safety_flags.tmj === null) return null
  const age = ageFromDoctorPayload(payload.responses)
  const state = toTmjStateFromDoctorPayload(payload.responses, payload.flags.general_red, age)
  const flags = computeTmjFlags(state)
  const locked = flags.tmj_safety_status !== 'CLEAR'

  const chips: SafetyChip[] = [{ key: 'status', label: '안전 확인', text: SAFETY_STATUS_LABEL[flags.tmj_safety_status] }]
  if (flags.expedited_referral_consider) chips.push({ key: 'expedited', label: '신속 의뢰 고려', text: '예' })
  if (flags.trauma_or_dislocation_assessment_required) chips.push({ key: 'trauma', label: '외상·탈구 평가 필요', text: '예' })
  if (flags.dental_or_oral_assessment_required) chips.push({ key: 'dental', label: '치과·구강 평가 필요', text: '예' })
  if (flags.infection_assessment_required) chips.push({ key: 'infection', label: '감염 평가 필요', text: '예' })
  if (flags.gca_assessment_required) chips.push({ key: 'gca', label: '측두동맥염(GCA) 평가 필요', text: '예' })
  if (flags.neuro_assessment_required) chips.push({ key: 'neuro', label: '신경학적 평가 필요', text: '예' })

  const extraNotes: string[] = []
  if (flags.gca_assessment_required) {
    extraNotes.push('측두동맥염(GCA) 확진이 아니라 clinician-side 평가/의뢰 판단이 필요한 패턴 신호입니다 — 생년월일 미상인 경우도 negative로 처리하지 않습니다.')
  }
  if (flags.dental_or_oral_assessment_required) {
    extraNotes.push('환자 문진만으로 치아 농양·감염을 확진하지 않습니다 — 구강 진찰은 clinician 확인 영역입니다.')
  }
  if (flags.trauma_or_dislocation_assessment_required) {
    extraNotes.push('환자보고 교합 변화/개폐구 기능 정보는 평가 필요 신호이며 객관적 ROM·정복 여부를 자동 판정하지 않습니다.')
  }

  return {
    key: 'tmj',
    label: SAFETY_MODULE_LABELS.tmj,
    status: flags.tmj_safety_status,
    lockedNotes: locked ? ['안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다.'] : [],
    chips,
    extraNotes,
    examCodes: [],
  }
}

const SEVERITY_RANK: Record<SafetyStatus, number> = { URGENT_REVIEW: 2, REVIEW_REQUIRED: 1, CLEAR: 0 }

/**
 * §11.1/§11.2 — 9개 모듈 전부를 계산하고, `safety_flags.<key> !== null`인
 * 것만 골라 정렬해서 돌려준다.
 *
 * 정렬: 심각도(URGENT>REVIEW>CLEAR) 우선 — 10초 스캔 목표(§4)상 위험한
 * 행이 위에 있어야 한다. 동일 심각도 안에서는 primary_module_detail로
 * 태깅된 모듈 → additional_module_detail로 태깅된 모듈 → 나머지는
 * SAFETY_MODULE_KEYS 고정 순서(§11.2 "primary/additional은 정렬에만 사용").
 */
export function computeSafetyModuleRows(payload: DoctorPayload, clinicianInputs: SafetyClinicianInputs = {}): SafetyModuleRow[] {
  const rows: SafetyModuleRow[] = []
  const lbp = computeLbpRow(payload, clinicianInputs.lbpObjectiveMotorDeficit)
  if (lbp) rows.push(lbp)
  const hip = computeHipRow(payload)
  if (hip) rows.push(hip)
  const neck = computeNeckRow(payload)
  if (neck) rows.push(neck)
  const shoulder = computeShoulderRow(payload, clinicianInputs.shoulderObjectiveCuffWeakness)
  if (shoulder) rows.push(shoulder)
  const knee = computeKneeRow(payload)
  if (knee) rows.push(knee)
  const elbow = computeElbowRow(payload)
  if (elbow) rows.push(elbow)
  const wristHand = computeWristHandRow(payload)
  if (wristHand) rows.push(wristHand)
  const ankleFoot = computeAnkleFootRow(payload)
  if (ankleFoot) rows.push(ankleFoot)
  const tmj = computeTmjRow(payload)
  if (tmj) rows.push(tmj)

  const detailToKey: Record<string, SafetyModuleKey> = {
    LBP: 'lbp',
    HIP: 'hip',
    NECK: 'neck',
    SHOULDER: 'shoulder',
    KNEE: 'knee',
    ELBOW: 'elbow',
    WRIST_HAND: 'wrist_hand',
    ANKLE_FOOT: 'ankle_foot',
    TMJ: 'tmj',
  }
  const primaryKey = payload.routing.primary_module_detail ? detailToKey[payload.routing.primary_module_detail] : undefined
  const additionalKey = payload.routing.additional_module_detail ? detailToKey[payload.routing.additional_module_detail] : undefined

  function tagRank(key: SafetyModuleKey): number {
    if (key === primaryKey) return 0
    if (key === additionalKey) return 1
    return 2
  }

  return rows.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.status] - SEVERITY_RANK[a.status]
    if (severityDiff !== 0) return severityDiff
    const tagDiff = tagRank(a.key) - tagRank(b.key)
    if (tagDiff !== 0) return tagDiff
    return SAFETY_MODULE_KEYS.indexOf(a.key) - SAFETY_MODULE_KEYS.indexOf(b.key)
  })
}
