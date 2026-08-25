/**
 * 원장 판단(clinician judgment) 데이터 계약. 순수 타입 + 헬퍼만 있고 React가
 * 없다.
 *
 * 이 파일은 컨테이너일 뿐이다 — 명리 지식, 증상-십신/오행 매핑, 임상 규칙을
 * 절대 담지 않는다. 모든 해석 문자열은 원장이 직접 타이핑한 값이며, 소프트웨어가
 * 생성하지 않는다. 향후 AI/규칙엔진이 후보 판단을 만들어내더라도 그 결과는
 * 이 ClinicianJudgment 안에 절대 합쳐 넣지 않고, Shadow Mode 비교가 정직하게
 * 유지되도록 완전히 별도의 네임스페이스에 저장해야 한다.
 */

export const JUDGMENT_SCHEMA_VERSION = '1.0.0'

export const MAX_INNATE_FEATURES = 3
export const MAX_SYMPTOM_LINKS = 2

export type DebriefAnswers = { q1: string; q2: string; q3: string; q4: string }

export const DEBRIEF_QUESTIONS = [
  '이 사주에서 제일 중요하게 본 것은 무엇인가?',
  '사주만 보고 어떤 임상문제를 예상했는가?',
  '실제 문진·맥·설을 보고 무엇을 수정했는가?',
  '그 수정이 처방을 어떻게 바꿨는가?',
] as const

export type ClinicianJudgment = {
  schema_version: string
  recorded_at: string | null
  source: {
    session_id: string
    questionnaire_version: string
    myungri_algorithm_version: string
    myungri_library_version: string
    myungri_status: 'resolved' | 'partial' | 'unresolved'
    myungri_pending_approval: string[]
  }
  innate_features: string[]
  symptom_links: string[]
  saju_only_prediction: string
  revised_after_exam: string
  final_treatment_axis: string
  prescription_direction: string
  learning_case: boolean
  debrief: DebriefAnswers | null
  transcript_import: null
  /**
   * LBP_V1: 원장이 진찰 후 입력하는 객관적 하지 근력저하 소견. 환자 태블릿
   * 문진에는 없는 항목 — 결정 §1-2: 환자 자가보고(LBP_02의
   * SUBJECTIVE_WEAKNESS)와는 별개로, CES 문항과 무관하게 URGENT_REVIEW를
   * 발생시킬 수 있다(src/spec/lbpLogic.ts의 lbpSafetyStatus 참고).
   * `undefined`(미입력)는 "아직 진찰 안 함"을 뜻하며 그 자체로 안전 문제가
   * 아니다 — lbp_v1.0.yaml의 clinician_objective_motor_deficit.default:
   * not_yet_assessed와 동일한 의미. LBP 주호소가 아닌 환자는 항상 undefined.
   */
  lbp_objective_motor_deficit?: 'NONE' | 'SEVERE_OR_PROGRESSIVE' | 'UNKNOWN'
  /**
   * SHOULDER_V1: 원장이 진찰 후 입력하는 객관적 회전근개 근력저하 소견.
   * v0.1.1 §11 expedited_referral_consider의 세 번째 트리거 —
   * SH03(환자 자가보고 급성 팔 들기/힘 저하)와 무관하게, 외상 후 진찰에서
   * 새로운 객관적 근력저하가 확인되면 신속 의뢰 고려 flag를 올릴 수 있다
   * (src/spec/shoulderLogic.ts의 expeditedReferralConsider 참고).
   * `undefined`(미입력)는 "아직 진찰 안 함"을 뜻하며 그 자체로 안전 문제가
   * 아니다 — lbp_objective_motor_deficit과 동일한 의미. SHOULDER 주호소가
   * 아닌 환자는 항상 undefined.
   */
  shoulder_objective_cuff_weakness?: 'NONE' | 'NEW_WEAKNESS_AFTER_TRAUMA' | 'UNKNOWN'
}

/** createEmptyJudgment 입력 — 어떤 계산/문진 스냅샷을 참조하는지에 대한 provenance만. */
export type JudgmentSourcePayload = {
  session_id: string
  questionnaire_version: string
  myungri_algorithm_version: string
  myungri_library_version: string
  myungri_status: 'resolved' | 'partial' | 'unresolved'
  myungri_pending_approval: string[]
}

export function createEmptyJudgment(payload: JudgmentSourcePayload): ClinicianJudgment {
  return {
    schema_version: JUDGMENT_SCHEMA_VERSION,
    recorded_at: null,
    source: {
      session_id: payload.session_id,
      questionnaire_version: payload.questionnaire_version,
      myungri_algorithm_version: payload.myungri_algorithm_version,
      myungri_library_version: payload.myungri_library_version,
      myungri_status: payload.myungri_status,
      myungri_pending_approval: payload.myungri_pending_approval,
    },
    innate_features: [],
    symptom_links: [],
    saju_only_prediction: '',
    revised_after_exam: '',
    final_treatment_axis: '',
    prescription_direction: '',
    learning_case: false,
    debrief: null,
    transcript_import: null,
  }
}

function isIsoOrNull(v: string | null): boolean {
  if (v === null) return true
  return !Number.isNaN(Date.parse(v))
}

export function validateJudgment(j: ClinicianJudgment): { ok: boolean; errors: string[] } {
  const errors: string[] = []

  if (j.innate_features.length > MAX_INNATE_FEATURES) {
    errors.push(`핵심 선천 특징은 최대 ${MAX_INNATE_FEATURES}개까지만 입력할 수 있습니다.`)
  }
  if (j.symptom_links.length > MAX_SYMPTOM_LINKS) {
    errors.push(`현재 증상과 연결되는 핵심은 최대 ${MAX_SYMPTOM_LINKS}개까지만 입력할 수 있습니다.`)
  }
  if (!isIsoOrNull(j.recorded_at)) {
    errors.push('기록 시각(recorded_at) 형식이 올바르지 않습니다.')
  }

  return { ok: errors.length === 0, errors }
}

export function finalizeJudgment(j: ClinicianJudgment): ClinicianJudgment {
  return {
    ...j,
    recorded_at: new Date().toISOString(),
    innate_features: j.innate_features.filter((s) => s.trim() !== ''),
    symptom_links: j.symptom_links.filter((s) => s.trim() !== ''),
  }
}
