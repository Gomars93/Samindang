/**
 * LBP v1 Batch 2.5c — Working Hypothesis 최소 형태 (요통 래퍼).
 *
 * Docs ref: `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §11,
 * `DECISIONS.md`'s 2026-09-03 "LBP v1 Batch 2.5b 게이트 CLOSED + Batch 2.5c
 * PO 결정 3건" entry (CD-2.5c-1/2/3 + Fable's patient-boundary design note).
 *
 * 부위 팩 일반화(2026-09-06, `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md`
 * §3): 판단 본체(패턴 목록을 첫 인자로 받는 부위 무관 함수)는
 * `workingHypothesis.ts`로 옮겼고, 이 파일은 **요통 5패턴을 넘기는 래퍼**만
 * 남는다 — 옛 이름·동작 그대로이며 `tests/lbp-working-hypothesis.spec.mjs`
 * 250단언이 그것을 고정한다.
 *
 * Everything here is a RECORD of the clinician's own selection, never a
 * computed judgment: no score, no threshold, no ranking, no diagnosis name.
 * `patientSentenceDraftKo` produces a DRAFT only — the hypothesis itself
 * never reaches the patient output; only a sentence the clinician explicitly
 * clicked "안내문에 넣기" to copy into `PainCarePlan.patientInstruction`.
 */
import type { HypothesisPattern } from './regionPack'
import {
  HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO,
  HYPOTHESIS_SUPPORT_LABEL_KO,
  HYPOTHESIS_SUPPORT_OPTIONS,
  appendHypothesisSentenceToPatientInstruction,
  applyWorkingHypothesisCarryForward,
  emptyWorkingHypothesis,
  isRegionPatientForRevisitHypothesisGate,
  isValidHypothesisSupport,
  isWorkingHypothesisBlank,
  patientSentenceDraftKoFor,
  sanitizeWorkingHypothesis,
  summarizeWorkingHypothesisKo,
  type HypothesisSupport,
  type WorkingHypothesis,
} from './workingHypothesis'

export type { HypothesisPattern, HypothesisSupport, WorkingHypothesis }
export {
  appendHypothesisSentenceToPatientInstruction,
  applyWorkingHypothesisCarryForward,
  emptyWorkingHypothesis,
  isRegionPatientForRevisitHypothesisGate,
  isWorkingHypothesisBlank,
  patientSentenceDraftKoFor,
  sanitizeWorkingHypothesis,
  summarizeWorkingHypothesisKo,
}

export type LbpHypothesisPatternId = 'LUMBAR_MOVEMENT' | 'NEURAL' | 'WALK_STAND_LEG' | 'HIP' | 'SIJ'

/** Declaration order is the only order used anywhere derived text/UI iterates these 5 patterns — deterministic, never re-sorted by support level or anything else. */
export const LBP_HYPOTHESIS_PATTERN_IDS: readonly LbpHypothesisPatternId[] = [
  'LUMBAR_MOVEMENT',
  'NEURAL',
  'WALK_STAND_LEG',
  'HIP',
  'SIJ',
]

export const LBP_HYPOTHESIS_PATTERN_LABEL_KO: Record<LbpHypothesisPatternId, string> = {
  LUMBAR_MOVEMENT: '허리 움직임 관련',
  NEURAL: '신경근 관여',
  WALK_STAND_LEG: '보행·기립 하지 패턴',
  HIP: '고관절 기여',
  SIJ: '천장관절 기여',
}

/** §11.3's 5 fixed plain-Korean expressions, used ONLY by `patientSentenceDraftKo` — deliberately not the same string as the clinician-facing pattern label above (that label names a mechanism category; this names what the patient actually feels). */
const LBP_HYPOTHESIS_PATIENT_EASY_LABEL_KO: Record<LbpHypothesisPatternId, string> = {
  LUMBAR_MOVEMENT: '허리 움직임',
  NEURAL: '다리로 뻗치는 증상',
  WALK_STAND_LEG: '오래 걷거나 서 있을 때 나타나는 다리 증상',
  HIP: '고관절',
  SIJ: '골반 뒤쪽 관절',
}

/** The 과/와 particle that correctly follows each easy-label above (받침 유무) — every label currently ends in a 받침 (증상/관절 etc.) and takes 과. Kept as a fixed per-pattern table (not computed from the string) because there are only 5 fixed expressions and computing Korean 받침 rules from an arbitrary string is unnecessary machinery for a closed set. */
const LBP_HYPOTHESIS_PATIENT_PARTICLE_KO: Record<LbpHypothesisPatternId, '과' | '와'> = {
  LUMBAR_MOVEMENT: '과',
  NEURAL: '과',
  WALK_STAND_LEG: '과',
  HIP: '과',
  SIJ: '과',
}

/** 요통 5패턴을 팩 형식으로 — 위 세 표를 한 행씩 합친 것. 순서는 `LBP_HYPOTHESIS_PATTERN_IDS`. */
export const LBP_HYPOTHESIS_PATTERNS: readonly HypothesisPattern[] = LBP_HYPOTHESIS_PATTERN_IDS.map((id) => ({
  id,
  labelKo: LBP_HYPOTHESIS_PATTERN_LABEL_KO[id],
  patientEasyLabelKo: LBP_HYPOTHESIS_PATIENT_EASY_LABEL_KO[id],
  particleKo: LBP_HYPOTHESIS_PATIENT_PARTICLE_KO[id],
}))

export type LbpHypothesisSupport = HypothesisSupport

/**
 * UNJUDGED first (the default, stored value). `LbpWorkingHypothesisCard.tsx`
 * renders only the OTHER 3 as a chip group per pattern (5행 × 3 chip) —
 * UNJUDGED itself is never a rendered chip (Batch 2.6 E-2).
 */
export const LBP_HYPOTHESIS_SUPPORT_OPTIONS: readonly LbpHypothesisSupport[] = HYPOTHESIS_SUPPORT_OPTIONS

export const LBP_HYPOTHESIS_SUPPORT_LABEL_KO: Record<LbpHypothesisSupport, string> = HYPOTHESIS_SUPPORT_LABEL_KO

export function isValidLbpHypothesisSupport(v: unknown): v is LbpHypothesisSupport {
  return isValidHypothesisSupport(v)
}

/**
 * §11.2: deliberately just `supports` + `recordedAt` — no `note` field. A
 * free-text note for the working hypothesis is not a new field; it is the
 * existing `PainFinalAssessment.finalWorkingAssessment` the clinician
 * already fills in the same 판단·처치 lane.
 */
export type LbpWorkingHypothesis = {
  supports: Record<LbpHypothesisPatternId, LbpHypothesisSupport>
  recordedAt: string | null
}

export function emptyLbpWorkingHypothesis(): LbpWorkingHypothesis {
  return emptyWorkingHypothesis(LBP_HYPOTHESIS_PATTERNS) as LbpWorkingHypothesis
}

/** True when every pattern is still UNJUDGED (the untouched default) — used both to decide whether a "이전 가설 이어받기" carry-forward action should be offered (never overwrite a clinician's own today's picks) and by the card to decide when to stamp `recordedAt`. */
export function isLbpWorkingHypothesisBlank(v: LbpWorkingHypothesis): boolean {
  return isWorkingHypothesisBlank(LBP_HYPOTHESIS_PATTERNS, v)
}

/**
 * Never throws — a legacy record with no field at all, a non-object, or a
 * corrupted `supports` sub-record all degrade to
 * `emptyLbpWorkingHypothesis()` field-by-field. Each of the 5 pattern ids is
 * validated INDEPENDENTLY so one corrupt/unknown-string sibling never blanks
 * the other 4. An unrecognized string value degrades to 'UNJUDGED', never
 * silently rendered/persisted as a real clinical value.
 */
export function sanitizeLbpWorkingHypothesis(raw: unknown): LbpWorkingHypothesis {
  return sanitizeWorkingHypothesis(LBP_HYPOTHESIS_PATTERNS, raw) as LbpWorkingHypothesis
}

/** §11.3: EMR/재진 recap 한 줄. 전부 UNJUDGED면 `null`. */
export function summarizeLbpWorkingHypothesisKo(v: LbpWorkingHypothesis): string | null {
  return summarizeWorkingHypothesisKo(LBP_HYPOTHESIS_PATTERNS, v)
}

/**
 * §11.3/§11.7: the fixed clause every patient draft sentence must contain,
 * verbatim, so a mutation that drops/rewords it is mechanically detectable
 * (`tests/lbp-working-hypothesis.spec.mjs` asserts on this exact string).
 */
export const LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO = HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO

/** §11.3: the ONE plain-language draft sentence when exactly one pattern is `HIGHER`; otherwise `null`. */
export function patientSentenceDraftKo(v: LbpWorkingHypothesis): string | null {
  return patientSentenceDraftKoFor(LBP_HYPOTHESIS_PATTERNS, v)
}

/**
 * §11.1/§11.4: the ONLY way a hypothesis-derived sentence ever reaches
 * `PainCarePlan.patientInstruction` — called exclusively from an explicit
 * "안내문에 넣기" click. Idempotent and additive-only. Kept uncoupled from
 * `lbpExerciseRecommendation.ts`'s `appendLbpAdoptionText` (§11.7 "가설→운동추천
 * 연결" 금지).
 */
export const appendLbpHypothesisSentenceToPatientInstruction = appendHypothesisSentenceToPatientInstruction

/**
 * §11.4 (재진): "이전 가설 이어받기" — only ever called from an explicit
 * clinician click (`tests/lbp-working-hypothesis.spec.mjs` pins the
 * `RevisitWorkspace.tsx` call site inside an `onClick`, and that the generic
 * `revisitCarryForward.ts` never references this module). Double-guarded:
 * a `null`/blank prior has nothing to offer, and today's value already
 * having a real pick is never silently replaced.
 */
export function applyLbpWorkingHypothesisCarryForward(
  today: LbpWorkingHypothesis,
  prior: LbpWorkingHypothesis | null,
  now: string,
): LbpWorkingHypothesis {
  return applyWorkingHypothesisCarryForward(LBP_HYPOTHESIS_PATTERNS, today, prior, now) as LbpWorkingHypothesis
}

/**
 * Opus delta review D-4 / CDR-3 (PO decision, 2026-09-04): the revisit gate
 * for the (formerly LBP-only) hypothesis card. Two-part signal — the latest
 * submission-backed visit's raw `safety_flags.lbp` (`!= null`, the
 * applicability convention) OR today's own hypothesis already non-blank (so
 * a recorded entry never becomes unreachable). A patient with no
 * submission-backed history AND a still-blank hypothesis gates closed.
 */
export function isLbpPatientForRevisitHypothesisGate(
  priorSubmissionSafetyFlagsLbp: unknown,
  todayHypothesis: LbpWorkingHypothesis,
): boolean {
  return isRegionPatientForRevisitHypothesisGate(LBP_HYPOTHESIS_PATTERNS, priorSubmissionSafetyFlagsLbp, todayHypothesis)
}
