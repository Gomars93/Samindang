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
