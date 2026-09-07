/**
 * 부위 팩(Region Pack) — 통증 전 부위 진료 프로세스 통일의 데이터 계약.
 *
 * Docs ref: `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md` §3,
 * `DECISIONS.md` 2026-09-06 "PO 지시: 통증 전 부위에 요통 진료 프로세스 적용".
 *
 * 원칙:
 * - **엔진 1개 + 팩 N개.** 판단 로직(단계 제안·적격성·추천 조립·임상가설·검사
 *   제안 병합)은 부위와 무관한 함수이고, 부위마다 다른 것은 전부 이 타입의 값
 *   (데이터)이다. 요통 팩(`regionPacks/lbp.ts`)은 기존 요통 모듈의 상수를 옮겨
 *   적은 것이지 새 판단이 아니다.
 * - **콘텐츠는 원장 승인 문서에서만.** `productionApproved`가 false인 팩은 코드에
 *   존재해도 화면에 아무것도 내지 않는다(`isPackActive`). Claude는 부위별 운동·
 *   가설·검사 규칙을 창작하지 않는다(`docs/CLINICAL_OS_NORTH_STAR.md:100`).
 * - 이 파일은 타입과 라벨만 갖는다 — 판단 로직도, 부위별 값도 여기 두지 않는다.
 */
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import type { FollowUpTarget } from './finalAssessment'
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { LbpExerciseEligibilityRule } from './lbpExerciseEligibility'
import type { LbpExerciseStageAssignment } from './lbpExerciseStageTable'
import type { ExamHelp, DirectionalResponse } from './lbpExamSuggestions'

/** `payload.responses.safety_flags`의 키와 동일 (`src/spec/coreSpec.ts` `safety_flags:` 블록). */
export type RegionKey = 'lbp' | 'neck' | 'shoulder' | 'knee' | 'hip' | 'ankle_foot' | 'elbow' | 'wrist_hand' | 'tmj'

export const REGION_KEYS: readonly RegionKey[] = ['lbp', 'neck', 'shoulder', 'knee', 'hip', 'ankle_foot', 'elbow', 'wrist_hand', 'tmj']

/** `DoctorWorkspace.tsx`의 `REGION_LABEL`과 글자 단위로 같아야 한다 — 같은 부위가 화면 두 곳에서 다르게 읽히지 않게. */
export const REGION_LABEL_KO: Record<RegionKey, string> = {
  lbp: '허리',
  neck: '목',
  shoulder: '어깨',
  knee: '무릎',
  elbow: '팔꿈치',
  wrist_hand: '손목/손',
  hip: '고관절',
  ankle_foot: '발목/발',
  tmj: '턱관절',
}

export function isRegionKey(v: unknown): v is RegionKey {
  return typeof v === 'string' && (REGION_KEYS as readonly string[]).includes(v)
}

/**
 * 팩이 선언하는 관리지향 가설 패턴 한 개. `particleKo`는 환자 문장에서
 * `patientEasyLabelKo` 뒤에 오는 과/와. 타입은 여기 두고 `lbpWorkingHypothesis.ts`
 * 가 가져다 쓴다 — 그 파일을 import하는 소스의 집합은
 * `tests/lbp-working-hypothesis.spec.mjs`(D-8)가 정확히 고정하고 있어서, 타입
 * 하나 때문에 그 목록을 넓히지 않는다.
 */
export type HypothesisPattern = {
  id: string
  labelKo: string
  patientEasyLabelKo: string
  particleKo: '과' | '와'
}

/**
 * 팩 필드별 콘텐츠 출처(요통 동등성 설계 §4 "출처 신뢰 표기", DECISIONS 2026-09-07 PO 승인).
 * - `CLINICIAN_APPROVED`  원장 승인 문서에서 옮김 + 팩 승인 완료(요통 Core-20). 유일하게 승인 가능한 값.
 * - `CLINICIAN_DOCUMENT`  원장이 쓴 문서에서 옮겼지만 이 팩 용도로는 아직 확정 전(예: 원장 검사 스크립트).
 * - `PR30_FRAMEWORK`      PR #30 복구 재활 아키텍처(가이드라인 인용, REFERENCE ONLY)에서 옮김. 한국어 라벨은 Claude 초안.
 * - `ARCHIVE_CANDIDATE`   Notion 아카이브 매선 프로토콜("원장 발목 포맷의 AI 확장" 가능성) — 후보 목록으로만, 승인 시 행마다 유지/삭제.
 * - `CLAUDE_DRAFT`        원장 문서에 없어 Claude가 채운 초안(목표 기능·환자용 쉬운 말 등).
 * `packContentGaps`는 `CLINICIAN_APPROVED`가 아닌 필드를 전부 빈 칸으로 나열한다 — 출처 표기가 곧 승인 게이트다.
 */
export type RegionContentProvenance = 'CLINICIAN_APPROVED' | 'CLINICIAN_DOCUMENT' | 'PR30_FRAMEWORK' | 'ARCHIVE_CANDIDATE' | 'CLAUDE_DRAFT'

export type RegionPackProvenance = Readonly<
  Record<'hypothesisPatterns' | 'targetFunctions' | 'coreExercises' | 'stageTable' | 'clinicianAddableExams' | 'directSupportByExam', RegionContentProvenance>
>

/** 재활 도메인 한 행 — PR #30 "Rehabilitation domains"(목 9·어깨 8·무릎 11), 요통은 카탈로그 도메인 13. 운동 행의 `domain`이 이 id 공간을 가리킨다. */
export type RegionRehabDomain = {
  id: string
  labelKo: string
}

/** Core 세트 한 행 — 요통 `LbpCoreExerciseMetadata`와 같은 필드에 `strategyLabelKo`(후보 카드 "이유" 한 줄)와 `domain`(E-3)을 얹은 형태. */
export type RegionCoreExercise = {
  exerciseId: string
  displayNameKo: string
  /** 팩 `rehabDomains`의 id. 도메인 분류 보존용(E-3) — 추천 엔진은 읽지 않는다(진단·도메인 → 운동 자동 매핑 금지). '' = 미배정. */
  domain: string
  startingCriteriaKo: readonly string[]
  startingDoseKo: string
  acceptableResponseKo: readonly string[]
  stopReviewKo: readonly string[]
  regressionKo: string
  progressionKo: string
  /** 팩의 `targetFunctionIdToEnum` 값 공간의 문자열. */
  targetFunctions: readonly string[]
  strategyLabelKo: string
}

export type RegionNeuroStatus = 'STABLE' | 'NEW_OR_WORSENING' | 'UNKNOWN'

/**
 * 부위 안전 재계산 결과. `applicable`이 false면 이 환자는 그 부위 환자가 아니다
 * (`safety_flags.<region> == null` — 이 저장소의 적용 가능성 관례).
 * `routineCareAllowed`는 반드시 **재계산된** 안전 판정에서 와야 한다 — 태블릿
 * 제출 시점 스냅샷이 아니라(`lbpEligibilityContext.ts` 헤더 RF-2).
 */
export type RegionSafetyEvaluation = {
  applicable: boolean
  routineCareAllowed: boolean
  treatmentSafetyLocked: boolean
  neuroStatus: RegionNeuroStatus
}

/** 원장이 진찰 후 입력하는 부위별 객관 소견 — 팩의 `evaluateSafety`가 읽는 부분만. */
export type RegionJudgmentInputs = Pick<ClinicianJudgment, 'lbp_objective_motor_deficit' | 'shoulder_objective_cuff_weakness'>

export type RegionPack = {
  region: RegionKey
  labelKo: string
  /** false면 엔진이 이 부위에 대해 아무것도 내지 않는다 — "구현 완료 ≠ 임상 활성화". */
  productionApproved: boolean
  /** 원장 승인 문서명(+날짜). 승인 전 팩은 출처와 DRAFT 표기를 함께 적는다. */
  sourceDocument: string
  /** L3 임상가설 — 원장이 고르는 관리지향 패턴. 선언 순서가 유일한 순서. */
  hypothesisPatterns: readonly HypothesisPattern[]
  /** L2 목표 기능 프리셋 — 기존 `FollowUpTarget` 배관을 그대로 탄다(새 저장 필드 없음). */
  targetFunctions: readonly FollowUpTarget[]
  /** 목표 기능 id → Core 행의 `targetFunctions` 값. 자유 입력(`*_tf_custom`)은 의도적으로 매핑하지 않는다. */
  targetFunctionIdToEnum: Readonly<Record<string, string | undefined>>
  targetFunctionPlaceholders: Readonly<Record<string, string>>
  /** L4 Core 세트. 추천에 오르는 운동은 이 목록뿐이다. */
  coreExercises: readonly RegionCoreExercise[]
  /** L5 운동별 단계. 표에 없는 id는 어느 단계에서도 후보가 아니다. */
  stageTable: Readonly<Record<string, LbpExerciseStageAssignment>>
  /** L6 운동별 안전 게이트. 규칙이 없는 Core 행은 후보에서 조용히 빠진다(RF-13). */
  eligibilityRules: readonly LbpExerciseEligibilityRule[]
  /** 방향성 반응 카드·게이트가 이 부위에 의미가 있는가. false면 카드를 렌더하지 않고 값은 NOT_ASSESSED로 고정된다. */
  directionalResponseApplicable: boolean
  /**
   * E-1: 방향성 반응 6값의 부위별 칩 라벨. 값 집합·저장 형식은 공통(요통과 같음)이고 라벨만
   * 바뀐다(목: "팔 쪽으로 퍼짐"). 없거나 빠진 값은 요통 라벨(`DIRECTIONAL_RESPONSE_OPTIONS`)을 쓴다.
   */
  directionalResponseLabels?: Readonly<Partial<Record<DirectionalResponse, string>>>
  /** E-1: 방향성 반응 카드 ⓘ 도움말. 없으면 요통 문구(`LBP_DIRECTIONAL_RESPONSE_HELP`). */
  directionalResponseHelp?: ExamHelp
  /**
   * E-2 (D-1, DECISIONS 2026-09-07): 이 부위의 신경 상태를 파생할 검사 id들(`clinicianAddableExams` 또는
   * 자동 제안에 있는 id). 비어 있지 않으면 추천 엔진은 `evaluateSafety().neuroStatus` 대신 기록된 검사
   * 결과로 `neuroStatus`를 만든다 — 하나라도 POSITIVE → NEW_OR_WORSENING(전체 차단, RF-3b), 전부 NEGATIVE →
   * STABLE, 그 밖(미시행·UNCLEAR·LIMITED·NOT_PERFORMED·항목 없음) → UNKNOWN. 비어 있으면(요통) 기존 경로 그대로.
   * 여기 넣는 검사는 "객관적 신경학적 결손(새로 생김/악화)" 의미의 검사만 — 유발 검사(Spurling 등)는 넣지 않는다.
   */
  neuroExamIds: readonly string[]
  /** E-3: 이 부위의 재활 도메인 표(PR #30). 운동 행의 `domain`이 가리키는 id 공간. 추천 엔진은 읽지 않는다. */
  rehabDomains: readonly RegionRehabDomain[]
  /** 필드별 콘텐츠 출처 — `packContentGaps`의 승인 게이트. */
  provenance: RegionPackProvenance
  /** 검사 id → 그 검사가 POSITIVE일 때 "직접 뒷받침"으로 올라가는 운동 id들 (요통: 하지직거상/슬럼프 → LBP_NEURAL_01). */
  directSupportByExam: Readonly<Record<string, readonly string[]>>
  /** L1 검사 제안의 ⓘ 도움말(id별). 저장되지 않고 병합 시 다시 붙는다. */
  examHelp: Readonly<Record<string, ExamHelp>>
  /** L1 원장이 "확인 추가"로 언제든 넣을 수 있는 고정 목록. 자동 삽입되지 않는다. */
  clinicianAddableExams: readonly PhysicalExamSuggestion[]
  /** L1 자동 검사 제안 규칙. 승인된 규칙이 없으면 항상 []. */
  generateExamSuggestions: (payload: DoctorPayload) => PhysicalExamSuggestion[]
  /** L0 재계산 안전 판정 → 운동 추천의 차단·잠금·신경 상태. */
  evaluateSafety: (payload: DoctorPayload, judgment: RegionJudgmentInputs) => RegionSafetyEvaluation
  /** L8 재검 시점 도달 시 다시 묻는 이 부위의 초진 문항 id(공통 문항 제외). `server/detailCheck.js`의 표와 일치해야 한다. */
  detailCheckQuestionIds: readonly string[]
}

/** 승인된 팩만 화면·엔진에 닿는다. */
export function isPackActive(pack: RegionPack | null | undefined): pack is RegionPack {
  return pack != null && pack.productionApproved === true
}
