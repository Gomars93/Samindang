/**
 * 요통(LBP) 부위 팩 — 기존 요통 모듈의 상수를 `RegionPack` 형식으로 **옮겨 적은
 * 것**이지 새 판단이 아니다. 여기 있는 값을 바꾸려면 원본 모듈/문서를 먼저
 * 바꾼다:
 *   - Core-20 메타데이터: `lbpExerciseCoreMetadata.ts` (원본 문서
 *     `02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx`)
 *   - 단계표: `lbpExerciseStageTable.ts` (`docs/LBP_EXERCISE_LEVEL_DRAFT_v0.2.md`)
 *   - 적격성 규칙: `lbpExerciseEligibility.ts`
 *   - 임상가설 5패턴: `lbpWorkingHypothesis.ts` (architecture §11)
 *   - 목표 기능 9개: `lbpTargetFunction.ts` (G1)
 *   - 검사 제안 규칙 4개 + 수동 5개: `lbpExamSuggestions.ts` (G2~G5)
 *   - 안전 재계산: `src/spec/lbpLogic.ts` (FROZEN, YAML 포팅) + `lbpAdapter.ts`
 *
 * `productionApproved: true`인 유일한 팩(2026-09-06 기준). 다른 부위 팩은
 * 원장 승인 전까지 false다.
 */
import type { DoctorPayload } from '../../types'
import type { RegionCoreExercise, RegionJudgmentInputs, RegionPack, RegionSafetyEvaluation } from '../regionPack'
import { REGION_LABEL_KO } from '../regionPack'
import { LBP_CORE_EXERCISE_METADATA } from '../lbpExerciseCoreMetadata'
import { getLbpExerciseById, type LbpExerciseDomain } from '../lbpExerciseLibrary'
import { LBP_EXERCISE_STAGE_BY_ID } from '../lbpExerciseStageTable'
import { LBP_EXERCISE_ELIGIBILITY_RULES } from '../lbpExerciseEligibility'
import { LBP_HYPOTHESIS_PATTERNS } from '../lbpWorkingHypothesis'
import { LBP_TARGET_FUNCTION_ID_TO_ENUM, LBP_TARGET_FUNCTION_OPTIONS, LBP_TARGET_FUNCTION_PLACEHOLDERS } from '../lbpTargetFunction'
import { LBP_CLINICIAN_ADDABLE_EXAMS, LBP_EXAM_HELP, generateLbpExamSuggestions } from '../lbpExamSuggestions'
import { neuroStatusFromLbpObjectiveMotorDeficit } from '../lbpEligibilityContext'
import { computeLbpFlags, treatmentSafetyLocked as treatmentSafetyLockedFrozen } from '../../../spec/lbpLogic'
import { toLbpStateFromDoctorPayload, ageFromDoctorPayload } from '../../../spec/lbpAdapter'

// ---------------------------------------------------------------------------
// Domain -> Rehab Strategy static table (copied ONLY this table, per
// architecture §3 "Rehab Strategy Selector v0.1 = BYPASS", from
// `lbpRehabStrategySelector.v01.experimental.ts` on
// `origin/claude/feat-lbp-action-adaptive-engine-prototype`). Internal
// explanatory label only — never a clickable Primary/Secondary step (CLOSED,
// `DECISIONS.md` 2026-09-02). 옮긴 이유: 추천 모듈이 이 팩을 import하므로 팩이
// 추천 모듈을 다시 import하면 순환이 된다.
// ---------------------------------------------------------------------------

type LbpRehabStrategy =
  | 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT'
  | 'PHYSICAL_FUNCTION_CAPACITY'
  | 'NEURAL_MOBILITY_MANAGEMENT'
  | 'GRADED_EXPOSURE_RETURN'

const STRATEGY_LABEL_KO: Record<LbpRehabStrategy, string> = {
  SYMPTOM_RESPONSE_GUIDED_MOVEMENT: '증상반응 활용',
  PHYSICAL_FUNCTION_CAPACITY: '신체·기능능력 회복',
  NEURAL_MOBILITY_MANAGEMENT: '신경가동성 관리',
  GRADED_EXPOSURE_RETURN: '단계적 노출·복귀',
}

const REGULATION_LABEL_KO = '호흡·이완 보조'

const STRATEGY_BY_DOMAIN: Record<LbpExerciseDomain, LbpRehabStrategy | 'REGULATION'> = {
  DIRECTIONAL_RESPONSE: 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT',
  NEURAL_MOBILITY: 'NEURAL_MOBILITY_MANAGEMENT',
  GRADED_EXPOSURE: 'GRADED_EXPOSURE_RETURN',
  MIND_BODY_REGULATION: 'REGULATION',
  ACTIVITY_AEROBIC: 'PHYSICAL_FUNCTION_CAPACITY',
  LUMBAR_MOBILITY: 'PHYSICAL_FUNCTION_CAPACITY',
  HIP_MOBILITY: 'PHYSICAL_FUNCTION_CAPACITY',
  DEEP_TRUNK_ACTIVATION: 'PHYSICAL_FUNCTION_CAPACITY',
  TRUNK_CONTROL: 'PHYSICAL_FUNCTION_CAPACITY',
  TRUNK_ENDURANCE: 'PHYSICAL_FUNCTION_CAPACITY',
  HIP_STRENGTH: 'PHYSICAL_FUNCTION_CAPACITY',
  FUNCTIONAL_STRENGTH: 'PHYSICAL_FUNCTION_CAPACITY',
  LOAD_CAPACITY: 'PHYSICAL_FUNCTION_CAPACITY',
}

function strategyLabelForDomain(domain: LbpExerciseDomain): string {
  const strategy = STRATEGY_BY_DOMAIN[domain]
  return strategy === 'REGULATION' ? REGULATION_LABEL_KO : STRATEGY_LABEL_KO[strategy]
}

/** Core-20 메타데이터 + 카탈로그 도메인에서 온 전략 라벨 = 팩의 Core 행. 순서는 Core-20 선언 순서 그대로. */
const LBP_CORE_EXERCISES: readonly RegionCoreExercise[] = LBP_CORE_EXERCISE_METADATA.map((meta) => {
  const domain = getLbpExerciseById(meta.exerciseId)?.domain
  return {
    exerciseId: meta.exerciseId,
    displayNameKo: meta.displayNameKo,
    startingCriteriaKo: meta.startingCriteriaKo,
    startingDoseKo: meta.startingDoseKo,
    acceptableResponseKo: meta.acceptableResponseKo,
    stopReviewKo: meta.stopReviewKo,
    regressionKo: meta.regressionKo,
    progressionKo: meta.progressionKo,
    targetFunctions: meta.targetFunctions,
    strategyLabelKo: domain ? strategyLabelForDomain(domain) : '',
  }
})

/**
 * RF-2 (BLOCKER): 재계산 경로 — `DoctorView.tsx`의 `LbpSafetyPanel`과 정확히
 * 같은 `computeLbpFlags(toLbpStateFromDoctorPayload(responses,
 * lbpObjectiveMotorDeficit, age))`. 태블릿 제출 시점 스냅샷
 * (`payload.responses.safety_flags.lbp`)은 원장 객관 소견이 `undefined`로
 * 고정된 값이라 치료 추천의 게이트로 쓰면 안 된다(`lbpEligibilityContext.ts`
 * 헤더). 적용 가능성만은 스냅샷의 `!= null`로 본다(이 저장소의 관례).
 */
function evaluateLbpSafety(payload: DoctorPayload, judgment: RegionJudgmentInputs): RegionSafetyEvaluation {
  if (payload.responses.safety_flags.lbp == null) {
    return { applicable: false, routineCareAllowed: false, treatmentSafetyLocked: false, neuroStatus: 'UNKNOWN' }
  }
  const deficit = judgment.lbp_objective_motor_deficit
  const age = ageFromDoctorPayload(payload.responses)
  const state = toLbpStateFromDoctorPayload(payload.responses, deficit, age)
  const flags = computeLbpFlags(state)
  return {
    applicable: true,
    routineCareAllowed: flags.lbp_safety_status === 'CLEAR',
    treatmentSafetyLocked: treatmentSafetyLockedFrozen(flags),
    neuroStatus: neuroStatusFromLbpObjectiveMotorDeficit(deficit),
  }
}

export const LBP_REGION_PACK: RegionPack = {
  region: 'lbp',
  labelKo: REGION_LABEL_KO.lbp,
  productionApproved: true,
  sourceDocument: '02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx (2026-08-23) + docs/LBP_EXERCISE_LEVEL_DRAFT_v0.2.md + docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.4.md',
  hypothesisPatterns: LBP_HYPOTHESIS_PATTERNS,
  targetFunctions: LBP_TARGET_FUNCTION_OPTIONS,
  targetFunctionIdToEnum: LBP_TARGET_FUNCTION_ID_TO_ENUM,
  targetFunctionPlaceholders: LBP_TARGET_FUNCTION_PLACEHOLDERS,
  coreExercises: LBP_CORE_EXERCISES,
  stageTable: LBP_EXERCISE_STAGE_BY_ID,
  eligibilityRules: LBP_EXERCISE_ELIGIBILITY_RULES,
  directionalResponseApplicable: true,
  // (b) integration correction: LBP_NEURAL_01 is "directly supported" only
  // when the Batch-1 exam suggestion `lbp_exam_neurodynamic` (하지직거상/
  // 슬럼프) has been recorded POSITIVE.
  directSupportByExam: { lbp_exam_neurodynamic: ['LBP_NEURAL_01'] },
  examHelp: LBP_EXAM_HELP,
  clinicianAddableExams: LBP_CLINICIAN_ADDABLE_EXAMS,
  generateExamSuggestions: generateLbpExamSuggestions,
  evaluateSafety: evaluateLbpSafety,
  // `server/detailCheck.js`의 `DETAIL_CHECK_LBP_QUESTION_IDS`와 같아야 한다
  // (`tests/detail-check.spec.mjs` parity).
  detailCheckQuestionIds: ['LBP_12', 'LBP_13', 'LBP_14'],
}
