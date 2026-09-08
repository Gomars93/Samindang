/**
 * LBP v1 Batch 1 (G2/G3/G4/G5) — the LBP-specific "오늘 확인할 것" generator.
 *
 * Docs ref: LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md §7.2/§2.2/§2.3.
 *
 * Scope, deliberately narrow (§7.5 "금지" -- no new clinical semantics
 * beyond these four rules, no scoring, no priority beyond CONTEXTUAL):
 *   (a) 목표 동작 재현 -- always suggested for a CLEAR LBP patient (it is the
 *       anchor itself, not conditioned on any other fact).
 *   (b) FROZEN `flags.leg_symptom_present === 'YES'` -> 하지직거상/슬럼프
 *       (v0.1 engine's `buildNeurodynamicCheck`, hand-off doc §14 "leg
 *       symptom -> SLR/Slump").
 *   (c) `responses.modules.lbp.claudication_walking === 'YES'` (tablet
 *       LBP_08) -> 보행 가능시간·거리 (v0.1 engine's
 *       `buildWalkingToleranceCheck`, hand-off doc §14 "walking/standing
 *       leg pattern -> walking tolerance").
 *   (d) FROZEN `flags.lbp_neuro_baseline_required === true`
 *       (`computeNeuroBaselineRequired`: bilateral leg symptoms without a
 *       concrete neuro feature) -> 하지 신경학적 기본검사(감각·반사). Opus
 *       delta review of Batch 1 (item 5): a CLOSED connection to an
 *       already-approved FROZEN value lane 1 already surfaces as the
 *       "신경학적 기저검사 필요" chip -- not a new clinical judgment.
 *
 * Nothing is generated when:
 *   - `payload.responses.safety_flags.lbp == null` (not an LBP patient --
 *     same applicability signal `LbpSafetyPanel`/`isFlagsUsable` use).
 *   - the computed LBP flags are not a well-formed, recognizable shape
 *     (fail closed -- a corrupted/legacy record must never fabricate a
 *     suggestion from garbage data).
 *   - `flags.lbp_safety_status !== 'CLEAR'` (REVIEW_REQUIRED/URGENT_REVIEW
 *     -- safety comes first; the clinician can still add any item manually
 *     via LBP_CLINICIAN_ADDABLE_EXAMS).
 * UNKNOWN never triggers anything (leg_symptom_present UNKNOWN does not
 * suggest SLR/Slump; claudication_walking UNKNOWN/unanswered does not
 * suggest walking tolerance).
 *
 * The how/why help text below (LBP_EXAM_HELP / LBP_DIRECTIONAL_RESPONSE_HELP)
 * is copied VERBATIM from the v0.1 research engine
 * (`lbpActionAdaptiveEngine.experimental.ts` on
 * `origin/claude/feat-lbp-action-adaptive-engine-prototype`, functions
 * buildTargetFunctionCheck/buildNeurodynamicCheck/buildWalkingToleranceCheck/
 * buildHipCheck/buildSijCheck/buildObjectiveNeuroCheck/buildLumbarMovementCheck)
 * -- no other code from that file is ported.
 */
import { emptyExamResult, type ExamSuggestionReason, type PhysicalExamSuggestion } from './examSuggestion'
import type { DoctorPayload } from '../types'

export type ExamHelp = { howKo: string; whyKo: string }

/** Verbatim copy of the v0.1 engine's per-check `help` blocks, keyed by this codebase's exam suggestion id. */
export const LBP_EXAM_HELP: Record<string, ExamHelp> = {
  lbp_exam_target_function_reproduction: {
    howKo: '환자가 선택한 목표 동작을 안전한 범위에서 직접 수행하게 하고 평소 증상·기능제한이 재현되는지 확인합니다.',
    whyKo: '통증점수만이 아니라 실제 생활기능의 전후 변화를 비교하기 위한 기준점입니다.',
  },
  lbp_exam_neurodynamic: {
    howKo:
      '하지직거상 또는 슬럼프 동작에서 환자가 평소 느끼는 하지 통증·저림이 재현되는지 봅니다. 단순 햄스트링 당김과 익숙한 하지증상을 구분합니다.',
    whyKo: '검사 각도 자체보다 평소 하지증상과 일치하는 반응인지가 현재 재활·추적 계획에 더 중요합니다.',
  },
  lbp_exam_walking_tolerance: {
    howKo: '환자가 현재 증상 때문에 쉬어야 하기 전까지 실제로 걸을 수 있는 시간이나 거리를 짧게 확인합니다.',
    whyKo: '향후 호전 여부를 같은 기능지표로 비교하고 걷기·활동량 회복 계획을 조절하기 위해 확인합니다.',
  },
  lbp_exam_hip_screen: {
    howKo:
      '고관절 굽힘과 안쪽돌림을 중심으로 빠르게 움직임을 비교하고, 익숙한 증상 재현이나 뚜렷한 제한이 있을 때만 필요한 상세검사를 확장합니다.',
    whyKo: '허리와 고관절이 함께 기여하는 환자에서 실제 치료 타깃을 놓치지 않기 위한 선별입니다.',
  },
  lbp_exam_sij_screen: {
    howKo: '허리·고관절 소견과 함께 비교하면서 필요한 경우 여러 통증유발검사의 일관된 익숙한 증상 재현 여부를 확인합니다.',
    whyKo: '단일 FABER/Patrick 결과로 진단하기 위한 것이 아니라, 천장관절을 실제 치료 타깃에 포함할지 판단하기 위한 확인입니다.',
  },
  lbp_exam_neuro_baseline: {
    howKo: '하지의 근력·감각·반사를 빠르게 확인합니다. 이상이 있을 때만 필요한 세부 항목을 확장 기록하는 방식을 전제로 합니다.',
    whyKo: '환자가 느끼는 저림·힘 빠짐과 객관적인 신경학적 이상을 구분하기 위한 확인입니다.',
  },
}

function lbpExamItem(id: string, title: string, reasonFacts: ExamSuggestionReason[]): PhysicalExamSuggestion {
  return {
    id,
    title,
    priority: 'CONTEXTUAL',
    reasonFacts,
    source: 'SUGGESTED',
    result: emptyExamResult(),
    help: LBP_EXAM_HELP[id],
  }
}

/**
 * Fixed list the clinician can add manually from "확인 추가" regardless of
 * what the automatic rules produced -- always available (even when safety
 * is not CLEAR, when the generator itself returns []). Never auto-inserted.
 */
export const LBP_CLINICIAN_ADDABLE_EXAMS: PhysicalExamSuggestion[] = [
  lbpExamItem('lbp_exam_hip_screen', '고관절 빠른 선별', [{ text: '원장 직접 추가', provenance: 'OBSERVED' }]),
  lbpExamItem('lbp_exam_sij_screen', '천장관절 기여 확인', [{ text: '원장 직접 추가', provenance: 'OBSERVED' }]),
  lbpExamItem('lbp_exam_neurodynamic', '하지직거상 또는 슬럼프검사', [{ text: '원장 직접 추가', provenance: 'OBSERVED' }]),
  lbpExamItem('lbp_exam_walking_tolerance', '실제 보행 가능시간·거리 확인', [{ text: '원장 직접 추가', provenance: 'OBSERVED' }]),
  lbpExamItem('lbp_exam_neuro_baseline', '하지 신경학적 기본검사(감각·반사)', [
    { text: '원장 직접 추가', provenance: 'OBSERVED' },
  ]),
]

const VALID_LBP_SAFETY_STATUS = new Set(['CLEAR', 'REVIEW_REQUIRED', 'URGENT_REVIEW'])
const VALID_YES_NO_UNKNOWN = new Set(['YES', 'NO', 'UNKNOWN'])

/**
 * Fail-closed shape guard for the computed LBP flags this generator reads.
 * `payload.responses.safety_flags.lbp` is normally FROZEN-computed (never
 * hand-typed), but a real submission's DoctorPayload still round-trips
 * through the server as JSON -- a legacy/corrupted record must degrade to
 * "generate nothing", never crash or fabricate a suggestion from a
 * wrong-typed value.
 */
function isUsableLbpFlags(
  flags: unknown,
): flags is { lbp_safety_status: string; leg_symptom_present: string; lbp_neuro_baseline_required: boolean } {
  if (typeof flags !== 'object' || flags === null) return false
  const f = flags as Record<string, unknown>
  return (
    typeof f.lbp_safety_status === 'string' &&
    VALID_LBP_SAFETY_STATUS.has(f.lbp_safety_status) &&
    typeof f.leg_symptom_present === 'string' &&
    VALID_YES_NO_UNKNOWN.has(f.leg_symptom_present) &&
    typeof f.lbp_neuro_baseline_required === 'boolean'
  )
}

/**
 * §7.2 G2: `DoctorPayload` -> automatic LBP exam suggestions. See file
 * header for the exact (and exhaustive) rule table.
 */
export function generateLbpExamSuggestions(payload: DoctorPayload): PhysicalExamSuggestion[] {
  const flags = payload?.responses?.safety_flags?.lbp
  if (flags == null) return []
  if (!isUsableLbpFlags(flags)) return []
  if (flags.lbp_safety_status !== 'CLEAR') return []

  const items: PhysicalExamSuggestion[] = [
    lbpExamItem('lbp_exam_target_function_reproduction', '목표 동작 재현', [
      { text: '목표 기능을 정한 뒤 실제 동작에서 평소 증상·제한이 재현되는지 확인', provenance: 'DERIVED' },
    ]),
  ]

  if (flags.leg_symptom_present === 'YES') {
    items.push(
      lbpExamItem('lbp_exam_neurodynamic', '하지직거상 또는 슬럼프검사', [
        { text: '하지 통증·저림/신경증상 보고(환자 응답)', provenance: 'PATIENT_FACT' },
      ]),
    )
  }

  if (payload.responses?.modules?.lbp?.claudication_walking === 'YES') {
    items.push(
      lbpExamItem('lbp_exam_walking_tolerance', '실제 보행 가능시간·거리 확인', [
        { text: '서 있거나 걸을수록 엉덩이·다리 증상 악화(환자 응답)', provenance: 'PATIENT_FACT' },
      ]),
    )
  }

  // Opus delta review item 5 (approved CLOSED FROZEN-value connection, no
  // new semantics): FROZEN computeNeuroBaselineRequired -- bilateral leg
  // symptoms without a concrete neuro feature -- already drives lane 1's
  // "신경학적 기저검사 필요" chip. Strict === true (fail closed on anything
  // else, including a wrong-typed value the guard above already rejects).
  if (flags.lbp_neuro_baseline_required === true) {
    items.push(
      lbpExamItem('lbp_exam_neuro_baseline', '하지 신경학적 기본검사(감각·반사)', [
        { text: '양쪽 다리 증상(시스템 계산 — 신경학적 기저검사 필요)', provenance: 'DERIVED' },
      ]),
    )
  }

  return items
}

/**
 * §7.2: merges freshly-generated auto suggestions into an already-saved
 * list (or []) without ever touching a previously-recorded result.
 *   - Every existing item keeps its `result` exactly as stored.
 *   - Any generated id not already present is appended at the end.
 *   - `help` is reattached to every item by id from LBP_EXAM_HELP (help is
 *     never persisted -- see persistence.ts's EXAM_SUGGESTION_TEMPLATE,
 *     which omits the key so it drops out on save/reload).
 * Idempotent: merging the result of a merge against the same payload
 * produces the same list (no duplicate ids, no result mutation).
 */
export function mergeLbpExamSuggestions(
  existing: PhysicalExamSuggestion[],
  payload: DoctorPayload,
): PhysicalExamSuggestion[] {
  return mergeExamSuggestions(LBP_EXAM_HELP, generateLbpExamSuggestions(payload), existing)
}

/**
 * 부위 팩 일반화(2026-09-06): 같은 병합 규칙을 임의의 도움말 표·생성 결과에
 * 대해 적용한다. 요통은 위 래퍼가, 다른 부위는 그 팩의 `examHelp`와
 * `generateExamSuggestions(payload)`가 넘긴다. 규칙은 위 요통 주석 그대로:
 * 기존 결과는 절대 건드리지 않고, 새 id만 뒤에 붙이며, 도움말은 id로 다시 붙인다.
 */
export function mergeExamSuggestions(
  examHelp: Readonly<Record<string, ExamHelp>>,
  generated: readonly PhysicalExamSuggestion[],
  existing: PhysicalExamSuggestion[],
): PhysicalExamSuggestion[] {
  const reattached = existing.map((item) => {
    const help = examHelp[item.id]
    return help ? { ...item, help } : item
  })
  const existingIds = new Set(reattached.map((i) => i.id))
  const toAdd = generated.filter((g) => !existingIds.has(g.id))
  return [...reattached, ...toAdd]
}

/**
 * §7.2 G3: the clinician's observed direction-of-movement response --
 * recording only, never a computed judgment. Default `NOT_ASSESSED` must
 * never render or persist as a normal/negative value (never "정상").
 */
export type LbpDirectionalResponse =
  | 'NOT_ASSESSED'
  | 'FLEXION_FAVORABLE'
  | 'EXTENSION_FAVORABLE'
  | 'NO_CLEAR_DIRECTION'
  | 'DISTAL_WORSENING'
  | 'UNCLEAR'

export const LBP_DIRECTIONAL_RESPONSE_OPTIONS: { value: LbpDirectionalResponse; label: string }[] = [
  { value: 'NOT_ASSESSED', label: '미시행' },
  { value: 'FLEXION_FAVORABLE', label: '숙이면(굴곡) 호전' },
  { value: 'EXTENSION_FAVORABLE', label: '젖히면(신전) 호전' },
  { value: 'NO_CLEAR_DIRECTION', label: '뚜렷한 방향 없음' },
  { value: 'DISTAL_WORSENING', label: '다리 쪽으로 퍼짐(원위부 악화)' },
  { value: 'UNCLEAR', label: '불명확' },
]

const LBP_DIRECTIONAL_RESPONSE_VALUES = new Set(LBP_DIRECTIONAL_RESPONSE_OPTIONS.map((o) => o.value))

export function isValidLbpDirectionalResponse(v: unknown): v is LbpDirectionalResponse {
  return typeof v === 'string' && LBP_DIRECTIONAL_RESPONSE_VALUES.has(v as LbpDirectionalResponse)
}

export function lbpDirectionalResponseLabel(v: LbpDirectionalResponse): string {
  return LBP_DIRECTIONAL_RESPONSE_OPTIONS.find((o) => o.value === v)?.label ?? ''
}

// 부위 무관 별칭 — 값 6개는 "움직임 방향에 대한 증상 반응"이라는 개념이라 부위
// 이름이 들어 있지 않다. 어느 부위에서 이 카드를 켤지는 팩의
// `directionalResponseApplicable`이 정한다.
export type DirectionalResponse = LbpDirectionalResponse
export const DIRECTIONAL_RESPONSE_OPTIONS = LBP_DIRECTIONAL_RESPONSE_OPTIONS
export const isValidDirectionalResponse = isValidLbpDirectionalResponse

/** Verbatim copy of the v0.1 engine's `buildLumbarMovementCheck` help block. */
export const LBP_DIRECTIONAL_RESPONSE_HELP: ExamHelp = {
  howKo:
    '서서 허리를 굽히고, 뒤로 젖히고, 좌우로 기울이며 평소 증상의 재현·감소를 봅니다. 하지증상이 있다면 몸쪽으로 줄거나 더 아래로 퍼지는지도 관찰합니다.',
  whyKo: '모든 방향의 각도를 기록하기 위한 검사가 아니라, 실제 운동·재평가 방향을 바꿀 만한 증상반응이 있는지 확인하기 위한 검사입니다.',
}
