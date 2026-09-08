/**
 * 부위 팩 조립기 — 원장 승인 전 팩(DRAFT)을 최소 입력으로 만들고, 원장 CLOSED 문서가
 * 나온 팩은 같은 조립기에 7필드·단계표·규칙·검사 쌍을 채우고 `productionApproved: true`를
 * 켠다(목, 2026-09-07). 파일명은 역사적 이유로 그대로 둔다.
 *
 * 승인 전 팩의 규칙(`docs/PAIN_REGION_PACK_DRAFT_CONTENT_v0.1.md`):
 *   - `productionApproved: false` 고정. 엔진·화면·서버 어디에도 닿지 않는다
 *     (`isPackActive`, `activeRegionPack`, 서버 `DETAIL_CHECK_REGION_QUESTION_IDS`).
 *   - 임상 내용(패턴·운동·검사)은 원장 문서(Notion 매선 프로토콜)에서 **이름만**
 *     옮겨 적는다. 시작 기준·용량·중단 기준·단계표는 원장이 채우기 전까지 빈
 *     값이며 `packContentGaps`가 그 빈 칸을 전부 나열한다 — 빈 칸이 하나라도
 *     있는 팩은 승인할 수 없다(`tests/region-pack.spec.mjs`).
 *   - 적격성 규칙은 운동마다 하나씩 기본값으로 만든다. 요통과 달리
 *     `requiresStableNeuro: false`, `stopOnDistalWorsening: false` — 이 부위들에는
 *     원장이 입력하는 신경 소견·원위 악화 입력이 아직 없어서, true로 두면 모든
 *     운동이 영원히 보류된다. 부위 안전 잠금(L0)은 `evaluateSafety`가 따로 건다.
 *     원장이 부위별로 다르게 정하면 팩 파일에서 행 단위로 바꾼다.
 */
import type { DoctorPayload } from '../../types'
import type { FollowUpTarget } from '../finalAssessment'
import { followUpTarget } from '../finalAssessment'
import { emptyExamResult, type PhysicalExamSuggestion } from '../examSuggestion'
import type {
  HypothesisPattern,
  RegionCoreExercise,
  RegionJudgmentInputs,
  RegionKey,
  RegionPack,
  RegionPackProvenance,
  RegionRehabDomain,
  RegionSafetyEvaluation,
} from '../regionPack'
import { REGION_LABEL_KO } from '../regionPack'
import type { ExamHelp, DirectionalResponse } from '../lbpExamSuggestions'
import { buildEligibilityRule, type EligibilityRuleOptions, type LbpExerciseEligibilityRule } from '../lbpExerciseEligibility'
import type { LbpExerciseStageAssignment } from '../lbpExerciseStageTable'

export type DraftExercise = {
  id: string
  /** 원장 문서의 이름(영문이면 그대로) — 출처 대조용. */
  sourceName: string
  displayNameKo: string
  /** 원장 문서에 있으면 옮겨 적고, 없으면 '' — 승인 전 채워야 한다. */
  startingDoseKo?: string
  startingCriteriaKo?: readonly string[]
  stopReviewKo?: readonly string[]
  regressionKo?: string
  progressionKo?: string
  acceptableResponseKo?: readonly string[]
  /** 팩의 목표 기능 enum 값. 비어 있으면 어떤 목표 기능에도 매칭되지 않아 후보에 오르지 못한다 — 승인 전 채워야 한다. */
  targetFunctions?: readonly string[]
  /** E-3: 팩 `rehabDomains`의 id. 미배정이면 '' — `packContentGaps`가 나열한다. */
  domain?: string
  /** 후보 카드 "이유" 한 줄(요통의 전략 라벨 자리). 생략하면 `domain`의 라벨을 쓴다. */
  strategyLabelKo?: string
  /**
   * 행 단위 적격성 옵션(원장 CLOSED 문서). 생략하면 DRAFT 기본값
   * `{ stopOnDistalWorsening: false, requiresStableNeuro: false }` — 이유는 파일 헤더.
   */
  rule?: EligibilityRuleOptions
}

export type DraftExam = {
  id: string
  title: string
  help?: ExamHelp
}

export type DraftPackSpec = {
  region: RegionKey
  sourceDocument: string
  hypothesisPatterns: readonly HypothesisPattern[]
  /** `{ id, label }` — id는 `<region>_tf_*`, enum 값은 id에서 `<region>_tf_` 접두를 뗀 대문자. */
  targetFunctions: readonly { id: string; label: string; placeholder?: string }[]
  exercises: readonly DraftExercise[]
  clinicianAddableExams: readonly DraftExam[]
  /** 운동 id → 단계. 문서에 없으면 비워 두고 `packContentGaps`가 나열한다. */
  stageTable?: Readonly<Record<string, LbpExerciseStageAssignment>>
  evaluateSafety: (payload: DoctorPayload, judgment: RegionJudgmentInputs) => RegionSafetyEvaluation
  /** 방향성 반응 카드가 이 부위에 의미가 있는가(원장 결정). 기본 false. */
  directionalResponseApplicable?: boolean
  /** E-1: 부위별 방향성 칩 라벨·도움말(생략 시 요통 문구). */
  directionalResponseLabels?: Readonly<Partial<Record<DirectionalResponse, string>>>
  directionalResponseHelp?: ExamHelp
  /** E-2: 신경 상태를 파생할 검사 id(객관적 결손 검사만). 생략 = [] = `evaluateSafety` 값 그대로(UNKNOWN). */
  neuroExamIds?: readonly string[]
  /** E-3: PR #30 재활 도메인 표. */
  rehabDomains: readonly RegionRehabDomain[]
  /** 필드별 출처 — 승인 게이트(`packContentGaps`). */
  provenance: RegionPackProvenance
  /** 검사 id → POSITIVE일 때 "직접 뒷받침"으로 올라가는 운동 id(순위 버킷만, 필터 아님). 생략 = {}. */
  directSupportByExam?: Readonly<Record<string, readonly string[]>>
  detailCheckQuestionIds?: readonly string[]
  /**
   * 승인 스위치. 기본 false(DRAFT). true는 원장 CLOSED 문서가 있고 `provenance` 전 필드가
   * `CLINICIAN_APPROVED`이며 `packContentGaps === []`일 때만 — `tests/region-pack.spec.mjs` D절이 막는다.
   */
  productionApproved?: boolean
}

function tfEnum(region: RegionKey, id: string): string {
  const prefix = `${region}_tf_`
  return (id.startsWith(prefix) ? id.slice(prefix.length) : id).toUpperCase()
}

export function buildDraftPack(spec: DraftPackSpec): RegionPack {
  const targetFunctions: FollowUpTarget[] = spec.targetFunctions.map((t) => followUpTarget(t.id, t.label))
  const targetFunctionIdToEnum: Record<string, string | undefined> = {}
  const targetFunctionPlaceholders: Record<string, string> = {}
  for (const t of spec.targetFunctions) {
    // `*_tf_custom`(자유 입력)은 요통과 같은 이유로 어떤 enum에도 매핑하지 않는다.
    if (!t.id.endsWith('_tf_custom')) targetFunctionIdToEnum[t.id] = tfEnum(spec.region, t.id)
    if (t.placeholder) targetFunctionPlaceholders[t.id] = t.placeholder
  }
  const domainLabel = new Map(spec.rehabDomains.map((d) => [d.id, d.labelKo]))
  const coreExercises: RegionCoreExercise[] = spec.exercises.map((e) => ({
    exerciseId: e.id,
    displayNameKo: e.displayNameKo,
    domain: e.domain ?? '',
    startingCriteriaKo: e.startingCriteriaKo ?? [],
    startingDoseKo: e.startingDoseKo ?? '',
    acceptableResponseKo: e.acceptableResponseKo ?? [],
    stopReviewKo: e.stopReviewKo ?? [],
    regressionKo: e.regressionKo ?? '',
    progressionKo: e.progressionKo ?? '',
    targetFunctions: e.targetFunctions ?? [],
    strategyLabelKo: e.strategyLabelKo ?? (e.domain ? domainLabel.get(e.domain) ?? '' : ''),
  }))
  const known = new Set(coreExercises.map((e) => e.exerciseId))
  const ruleOptions = new Map(spec.exercises.map((e) => [e.id, e.rule]))
  const eligibilityRules: LbpExerciseEligibilityRule[] = coreExercises.map((e) =>
    buildEligibilityRule((id) => known.has(id), e.exerciseId, {
      stopOnDistalWorsening: false,
      requiresStableNeuro: false,
      ...(ruleOptions.get(e.exerciseId) ?? {}),
    }),
  )
  const examHelp: Record<string, ExamHelp> = {}
  const clinicianAddableExams: PhysicalExamSuggestion[] = spec.clinicianAddableExams.map((x) => {
    if (x.help) examHelp[x.id] = x.help
    return {
      id: x.id,
      title: x.title,
      priority: 'CONTEXTUAL',
      reasonFacts: [{ text: '원장 직접 추가', provenance: 'OBSERVED' }],
      source: 'SUGGESTED',
      result: emptyExamResult(),
      help: x.help,
    }
  })
  return {
    region: spec.region,
    labelKo: REGION_LABEL_KO[spec.region],
    productionApproved: spec.productionApproved ?? false,
    sourceDocument: spec.sourceDocument,
    hypothesisPatterns: spec.hypothesisPatterns,
    targetFunctions,
    targetFunctionIdToEnum,
    targetFunctionPlaceholders,
    coreExercises,
    stageTable: spec.stageTable ?? {},
    eligibilityRules,
    directionalResponseApplicable: spec.directionalResponseApplicable ?? false,
    directionalResponseLabels: spec.directionalResponseLabels,
    directionalResponseHelp: spec.directionalResponseHelp,
    neuroExamIds: spec.neuroExamIds ?? [],
    rehabDomains: spec.rehabDomains,
    provenance: spec.provenance,
    directSupportByExam: spec.directSupportByExam ?? {},
    examHelp,
    clinicianAddableExams,
    // 승인된 자동 검사 규칙이 없다 — 항상 []. 규칙은 PAIN_EXAM_RECOMMENDATION_TEMPLATE.md의 APPROVED 행에서만 온다.
    generateExamSuggestions: () => [],
    evaluateSafety: spec.evaluateSafety,
    detailCheckQuestionIds: spec.detailCheckQuestionIds ?? [],
  }
}

/**
 * 승인 전에 채워야 하는 빈 칸을 전부 나열한다. 빈 배열 = 승인 가능한 형태.
 * (내용이 맞는지는 원장이 보고, 여기서는 "비어 있지 않은가"만 본다.)
 */
export function packContentGaps(pack: RegionPack): string[] {
  const gaps: string[] = []
  if (pack.hypothesisPatterns.length === 0) gaps.push('hypothesisPatterns: 패턴 0개')
  for (const p of pack.hypothesisPatterns) {
    if (!p.labelKo.trim()) gaps.push(`hypothesisPatterns.${p.id}.labelKo 비어 있음`)
    if (!p.patientEasyLabelKo.trim()) gaps.push(`hypothesisPatterns.${p.id}.patientEasyLabelKo 비어 있음`)
  }
  const nonCustomTfs = pack.targetFunctions.filter((t) => !t.id.endsWith('_tf_custom'))
  if (nonCustomTfs.length === 0) gaps.push('targetFunctions: 자유 입력 외 목표 기능 0개')
  if (pack.coreExercises.length === 0) gaps.push('coreExercises: 운동 0개')
  const ruleIds = new Set(pack.eligibilityRules.map((r) => r.exerciseId))
  const domainIds = new Set(pack.rehabDomains.map((d) => d.id))
  for (const e of pack.coreExercises) {
    const at = `coreExercises.${e.exerciseId}`
    if (!e.displayNameKo.trim()) gaps.push(`${at}.displayNameKo 비어 있음`)
    if (!domainIds.has(e.domain)) gaps.push(`${at}.domain '${e.domain}' — rehabDomains에 없음 (E-3 도메인 미배정)`)
    if (e.startingCriteriaKo.length === 0) gaps.push(`${at}.startingCriteriaKo 비어 있음`)
    if (!e.startingDoseKo.trim()) gaps.push(`${at}.startingDoseKo 비어 있음`)
    if (e.stopReviewKo.length === 0) gaps.push(`${at}.stopReviewKo 비어 있음`)
    if (!e.regressionKo.trim()) gaps.push(`${at}.regressionKo 비어 있음`)
    // 요통 Core-20은 FLEXION/EXTENSION/CUSTOM처럼 목표 기능 칩에 매핑되지 않는
    // enum 값도 갖는다(문서화된 상태 — `LBP_LUMBAR_02`는 그래서 v1에서 도달
    // 불가, `tests/lbp-exercise-recommendation.spec.mjs`가 그 집합을 고정한다).
    // 여기서는 "값이 하나도 없음"만 빈 칸으로 본다 — 매핑 여부는 그 테스트의 몫.
    if (e.targetFunctions.length === 0) gaps.push(`${at}.targetFunctions 비어 있음 (어떤 목표 기능에도 매칭되지 않음)`)
    if (pack.stageTable[e.exerciseId] === undefined) gaps.push(`stageTable.${e.exerciseId} 없음 (단계 확정 시 후보에서 사라짐)`)
    if (!ruleIds.has(e.exerciseId)) gaps.push(`eligibilityRules.${e.exerciseId} 없음 (후보에서 조용히 빠짐)`)
  }
  if (!pack.sourceDocument.trim()) gaps.push('sourceDocument 비어 있음')
  // E-2: 신경 파생 검사 id는 이 팩이 실제로 낼 수 있는 검사여야 한다 — 자동 제안(`examHelp` 키)
  // 또는 "확인 추가" 목록. 아니면 원장이 그 검사를 기록할 길이 없어 신경 상태가 영원히 UNKNOWN이다.
  const knownExamIds = new Set([...Object.keys(pack.examHelp), ...pack.clinicianAddableExams.map((x) => x.id)])
  for (const id of pack.neuroExamIds) {
    if (!knownExamIds.has(id)) gaps.push(`neuroExamIds.${id} — examHelp/clinicianAddableExams에 없는 검사 id`)
  }
  // 출처 게이트(요통 동등성 설계 §4): 원장 승인(CLINICIAN_APPROVED)이 아닌 필드는 전부 빈 칸이다.
  // PR #30 프레임워크·아카이브 후보·Claude 초안은 승인 전 원장이 행마다 유지/삭제/확정해야 한다.
  for (const [field, prov] of Object.entries(pack.provenance)) {
    if (prov !== 'CLINICIAN_APPROVED') gaps.push(`provenance.${field} = ${prov} (원장 확정 전)`)
  }
  return gaps
}
