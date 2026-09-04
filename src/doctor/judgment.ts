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
  /**
   * Batch 4.1-C (§16.1): 4.1-C 이후 어떤 UI도 이 필드에 쓰지 않는다 —
   * deprecated, 새 코드에서 읽지 말 것. PO 결정 2026-09-04: 사주 해석
   * 성격의 자유서술 입력을 뺀다(JudgmentPanel.tsx의 TextList 입력 + 설명
   * 개요 read-back 모두 제거). 타입/기본값/`MAX_INNATE_FEATURES`/
   * `MAX_SYMPTOM_LINKS`/`validateJudgment`의 길이 검증/`finalizeJudgment`의
   * 빈 문자열 필터를 그대로 유지하는 이유는 saju_only_prediction 등과
   * 동일 — server/**(FROZEN)와 tests/server.spec.mjs가 이 필드를 저장·CAS
   * round-trip 프로브로 쓰고(`:212`,`:231`,`:325`,`:357-391`), 이미 저장된
   * 레코드의 값이 round-trip되어 파괴되지 않아야 하기 때문(원본 JSON
   * 아코디언에는 계속 보임).
   */
  innate_features: string[]
  /** Batch 4.1-C: 위와 동일 — deprecated, 새 코드에서 읽지 말 것. */
  symptom_links: string[]
  /**
   * Batch 4.1-A (§15.2/§15.3): 4.1-A 이후 어떤 UI도 이 필드에 쓰지 않는다 —
   * deprecated, 새 코드에서 읽지 말 것. 타입/기본값을 유지하는 이유는
   * server/**(FROZEN)와 tests/server.spec.mjs의 판단 fixture가 이 키들을
   * 담은 payload 모양을 그대로 쓰고, 이미 저장된 레코드의 값이 round-trip
   * 되어 파괴되지 않아야 하기 때문(원본 JSON 아코디언에는 계속 보임).
   */
  saju_only_prediction: string
  /** Batch 4.1-A: 위와 동일 — deprecated, 새 코드에서 읽지 말 것. */
  revised_after_exam: string
  /** Batch 4.1-A: 위와 동일 — deprecated, 새 코드에서 읽지 말 것. */
  final_treatment_axis: string
  /** Batch 4.1-A: 위와 동일 — deprecated, 새 코드에서 읽지 말 것. */
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
    // Batch 4.1-C: deprecated defaults, kept for payload-shape/round-trip
    // reasons only — see ClinicianJudgment's field-level comments above.
    innate_features: [],
    symptom_links: [],
    // Batch 4.1-A: deprecated defaults, kept for payload-shape/round-trip
    // reasons only — see ClinicianJudgment's field-level comments above.
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

/**
 * Round 18 (stale-write conflict wiring) -- same contract shape as
 * WorkspaceSaveOutcome in workspace/persistence.ts, kept as a sibling type
 * here rather than a shared generic because ClinicianJudgment's conflict
 * `current` can legitimately be `null` (no judgment has ever been saved for
 * this submission yet), which WorkspaceState's cannot.
 */
export type JudgmentSaveOutcome =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: { current: ClinicianJudgment | null; currentUpdatedAt: string } }
  // P0-8 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.9): same
  // `kind` addition as WorkspaceSaveOutcome (workspace/persistence.ts) --
  // lets JudgmentPanel show an inline "인증 만료 — 토큰 다시 입력" recovery
  // instead of the generic "저장 실패" text when the failure is
  // serverClient.ts's 'auth' kind (401/403). Optional, so this stays
  // backward-compatible with every existing `{ ok: false }` caller.
  | { ok: false; conflict?: undefined; kind?: 'auth' | 'network' | 'other' }

/**
 * 독립 검수 HIGH-2: ObjectiveExamFindingsCard(원장 진찰 소견 — 안전 판정에
 * 영향을 줄 수 있는 clinician observation)도 JudgmentPanel과 정확히 같은
 * `judgment` 필드를 저장하는 두 번째 writer이므로, stale-write 시 자동
 * retry/merge 대신 같은 conflict 계약을 그대로 쓴다. `JudgmentSaveOutcome`과
 * 다른 점은 성공 시 `updatedAt`이 필요 없다는 것뿐이다 -- 이 카드는 CAS
 * 기준을 자체 ref로 추적하지 않고 DoctorView.tsx가 소유한 selectedRecord를
 * 매 저장마다 그대로 읽으므로, 성공 후에는 selectedRecord 갱신
 * (setSelectedRecord)만으로 다음 시도의 기준이 이미 최신이 된다.
 */
export type ObjectiveExamSaveOutcome =
  | { ok: true }
  | { ok: false; conflict: { current: ClinicianJudgment | null; currentUpdatedAt: string } }
  | { ok: false; conflict?: undefined; kind: 'auth' | 'network' | 'other' }
