/**
 * 임상가설(Working Hypothesis) — 부위 무관 본체.
 *
 * 원본은 요통 v1 Batch 2.5c의 `lbpWorkingHypothesis.ts`(architecture §11)이며,
 * 부위 팩 일반화(2026-09-06, `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md`
 * §3)에서 **패턴 목록을 첫 인자로 받는 함수**로 여기 옮겼다. `lbpWorkingHypothesis.ts`
 * 는 요통 5패턴을 넘기는 래퍼만 남는다(옛 이름·동작 그대로).
 *
 * 불변 원칙(요통 원본 그대로):
 *   - 점수·임계값·순위·진단명 없음. 모든 `support` 값은 원장이 직접 고른 기록이다.
 *   - `patientSentenceDraftKoFor`는 초안일 뿐 — 원장이 "안내문에 넣기"를 눌러야만
 *     `PainCarePlan.patientInstruction`에 들어간다("adopt, never automatic").
 *   - 가설 → 운동 추천 연결 금지(§11.7). 이 모듈은 추천 모듈을 import하지 않는다.
 */
import type { HypothesisPattern } from './regionPack'
export type { HypothesisPattern }

export type HypothesisSupport = 'UNJUDGED' | 'HIGHER' | 'CONSIDER' | 'LOWER'

/** UNJUDGED first (the default, stored value). Cards render only the OTHER 3 as chips. */
export const HYPOTHESIS_SUPPORT_OPTIONS: readonly HypothesisSupport[] = ['UNJUDGED', 'HIGHER', 'CONSIDER', 'LOWER']

export const HYPOTHESIS_SUPPORT_LABEL_KO: Record<HypothesisSupport, string> = {
  UNJUDGED: '미판단',
  HIGHER: '가능성 높음',
  CONSIDER: '고려',
  LOWER: '가능성 낮음',
}

export function isValidHypothesisSupport(v: unknown): v is HypothesisSupport {
  return typeof v === 'string' && (HYPOTHESIS_SUPPORT_OPTIONS as readonly string[]).includes(v)
}

/** 패턴 id가 팩마다 다르므로 키는 string. 요통 값(`LbpWorkingHypothesis`)은 그대로 이 타입에 대입된다. */
export type WorkingHypothesis = {
  supports: Record<string, HypothesisSupport>
  recordedAt: string | null
}

export function emptyWorkingHypothesis(patterns: readonly HypothesisPattern[]): WorkingHypothesis {
  const supports: Record<string, HypothesisSupport> = {}
  for (const p of patterns) supports[p.id] = 'UNJUDGED'
  return { supports, recordedAt: null }
}

/** True when every pattern is still UNJUDGED (the untouched default). */
export function isWorkingHypothesisBlank(patterns: readonly HypothesisPattern[], v: WorkingHypothesis): boolean {
  return patterns.every((p) => (v.supports[p.id] ?? 'UNJUDGED') === 'UNJUDGED')
}

/**
 * Never throws — a legacy record with no field at all, a non-object, or a
 * corrupted `supports` sub-record all degrade to the empty value
 * field-by-field. Each pattern id is validated INDEPENDENTLY so one corrupt/
 * unknown-string sibling never blanks the others. An unrecognized string
 * value degrades to 'UNJUDGED', never silently rendered/persisted as a real
 * clinical value. Ids the pack does not declare are dropped.
 */
export function sanitizeWorkingHypothesis(patterns: readonly HypothesisPattern[], raw: unknown): WorkingHypothesis {
  const empty = emptyWorkingHypothesis(patterns)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return empty
  const r = raw as Record<string, unknown>
  const rawSupports =
    typeof r.supports === 'object' && r.supports !== null && !Array.isArray(r.supports)
      ? (r.supports as Record<string, unknown>)
      : {}
  const supports = { ...empty.supports }
  for (const p of patterns) {
    const v = rawSupports[p.id]
    supports[p.id] = isValidHypothesisSupport(v) ? v : 'UNJUDGED'
  }
  return {
    supports,
    recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : null,
  }
}

/**
 * 팩을 모르는 저장 계층용 정화: 알려진 support 값을 가진 문자열 키만 남긴다.
 * 어느 패턴이 유효한지는 읽는 쪽이 팩의 패턴 목록으로 다시 거른다
 * (`sanitizeWorkingHypothesis`). 값이 아예 없으면 빈 supports.
 */
export function sanitizeWorkingHypothesisLoose(raw: unknown): WorkingHypothesis {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { supports: {}, recordedAt: null }
  const r = raw as Record<string, unknown>
  const rawSupports =
    typeof r.supports === 'object' && r.supports !== null && !Array.isArray(r.supports)
      ? (r.supports as Record<string, unknown>)
      : {}
  const supports: Record<string, HypothesisSupport> = {}
  for (const [id, v] of Object.entries(rawSupports)) {
    if (typeof id === 'string' && id.length > 0 && id.length <= 64 && isValidHypothesisSupport(v)) supports[id] = v
  }
  return { supports, recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : null }
}

/**
 * §11.3: EMR/재진 recap 한 줄. UNJUDGED 패턴은 생략(계산이 아니라 원장이
 * 고른 값의 직접 대응). 전부 UNJUDGED면 `null` — 호출부가 줄 자체를
 * 렌더하지 않는다(EMR에서 "임상 가설:" 빈 줄이 남지 않는다).
 */
export function summarizeWorkingHypothesisKo(patterns: readonly HypothesisPattern[], v: WorkingHypothesis): string | null {
  const parts = patterns
    .filter((p) => v.supports[p.id] !== undefined && v.supports[p.id] !== 'UNJUDGED')
    .map((p) => `${p.labelKo} ${HYPOTHESIS_SUPPORT_LABEL_KO[v.supports[p.id]]}`)
  if (parts.length === 0) return null
  return `임상 가설: ${parts.join(' · ')}`
}

/**
 * §11.3/§11.7: the fixed clause every patient draft sentence must contain,
 * verbatim, so a mutation that drops/rewords it is mechanically detectable
 * (`tests/lbp-working-hypothesis.spec.mjs` asserts on this exact string).
 */
export const HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO = '확정 진단이 아니라 경과를 보며 다시 판단합니다.'

/**
 * §11.3: builds the ONE plain-language draft sentence when — and only when —
 * exactly one pattern is `HIGHER`. Zero HIGHER patterns means there is
 * nothing confident enough to draft; two or more means the clinician should
 * write the sentence themselves — both return `null`, and the card renders
 * no draft box at all in either case.
 */
export function patientSentenceDraftKoFor(patterns: readonly HypothesisPattern[], v: WorkingHypothesis): string | null {
  const higher = patterns.filter((p) => v.supports[p.id] === 'HIGHER')
  if (higher.length !== 1) return null
  const p = higher[0]
  return `오늘은 ${p.patientEasyLabelKo}${p.particleKo} 관련된 통증으로 보고 치료했습니다. ${HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO}`
}

/**
 * §11.1/§11.4: the ONLY way a hypothesis-derived sentence ever reaches
 * `PainCarePlan.patientInstruction` — called exclusively from an explicit
 * "안내문에 넣기" click. Idempotent and additive-only. 부위와 무관한 문자열
 * 연산이라 부위 인자가 없다.
 */
export function appendHypothesisSentenceToPatientInstruction(existingPatientInstruction: string, sentence: string): string {
  if (!sentence) return existingPatientInstruction
  if (existingPatientInstruction.includes(sentence)) return existingPatientInstruction
  return existingPatientInstruction.trim() ? `${existingPatientInstruction}\n${sentence}` : sentence
}

/**
 * §11.4 (재진): "이전 가설 이어받기" — copies the prior visit's `supports`
 * into today's value, stamped with today's time. Only ever called from an
 * explicit clinician click. Double-guarded: a `null`/blank prior has nothing
 * to offer, and today's value already having a real pick is never silently
 * replaced.
 */
export function applyWorkingHypothesisCarryForward(
  patterns: readonly HypothesisPattern[],
  today: WorkingHypothesis,
  prior: WorkingHypothesis | null,
  now: string,
): WorkingHypothesis {
  if (!prior || isWorkingHypothesisBlank(patterns, prior) || !isWorkingHypothesisBlank(patterns, today)) return today
  return { supports: { ...prior.supports }, recordedAt: now }
}

/**
 * 재진 가설 카드 게이트 — 이 환자가 그 부위 환자인가. 두 신호의 OR:
 *   1. 이력 속 최신 제출의 `safety_flags.<region>`이 `!= null` (적용 가능성 관례).
 *   2. 오늘 기록에 이미 판단된 패턴이 있다 — 이 신호가 없으면 첫 신호가 잠시
 *      꺼진 순간 원장이 자기 기록을 볼 수도 고칠 수도 없게 된다.
 */
export function isRegionPatientForRevisitHypothesisGate(
  patterns: readonly HypothesisPattern[],
  priorSubmissionSafetyFlagsForRegion: unknown,
  todayHypothesis: WorkingHypothesis,
): boolean {
  return priorSubmissionSafetyFlagsForRegion != null || !isWorkingHypothesisBlank(patterns, todayHypothesis)
}
