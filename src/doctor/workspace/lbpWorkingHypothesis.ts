/**
 * LBP v1 Batch 2.5c — Working Hypothesis 최소 형태.
 *
 * Docs ref: `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §11,
 * `DECISIONS.md`'s 2026-09-03 "LBP v1 Batch 2.5b 게이트 CLOSED + Batch 2.5c
 * PO 결정 3건" entry (CD-2.5c-1/2/3 + Fable's patient-boundary design note).
 *
 * Pure logic only, no React. Everything here is a RECORD of the
 * clinician's own selection, never a computed judgment:
 *   - No score, no threshold, no ranking, no diagnosis name.
 *   - The clinician picks every `support` value directly; nothing here
 *     infers one from questionnaire answers, exam results, or anything
 *     else in WorkspaceState.
 *   - `patientSentenceDraftKo` produces a DRAFT only — see
 *     `appendLbpHypothesisSentenceToPatientInstruction` below and this
 *     module's callers (`LbpWorkingHypothesisCard.tsx`,
 *     `DoctorWorkspace.tsx`, `RevisitWorkspace.tsx`) for the "adopt, never
 *     automatic" boundary that keeps `patientCarePlanPreview.ts` untouched
 *     (architecture §11.1): the hypothesis itself never reaches the patient
 *     output — only a sentence the clinician explicitly clicked "안내문에
 *     넣기" to copy into `PainCarePlan.patientInstruction`, the existing
 *     clinician-authored field `patientCarePlanPreview.ts` already renders.
 */

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

export type LbpHypothesisSupport = 'UNJUDGED' | 'HIGHER' | 'CONSIDER' | 'LOWER'

/**
 * UNJUDGED first (the default, stored value). `LbpWorkingHypothesisCard.tsx`
 * renders only the OTHER 3 as a chip group per pattern (5행 × 3 chip) —
 * UNJUDGED itself is never a rendered chip; it is what a pattern reverts to
 * when its currently active chip is re-clicked. Removed from render in
 * Batch 2.6 (E-2, approved `DECISIONS.md` 2026-09-04 "원장 화면 실측 감사
 * (Opus) 및 Batch 2.6 착수 / 2.5d 보류"), the same convention
 * `RevisitQuickCheckCard`'s `NOT_ASSESSED` already used. This array still
 * lists all 4 -- it is the full stored value type, not the render list.
 */
export const LBP_HYPOTHESIS_SUPPORT_OPTIONS: readonly LbpHypothesisSupport[] = ['UNJUDGED', 'HIGHER', 'CONSIDER', 'LOWER']

export const LBP_HYPOTHESIS_SUPPORT_LABEL_KO: Record<LbpHypothesisSupport, string> = {
  UNJUDGED: '미판단',
  HIGHER: '가능성 높음',
  CONSIDER: '고려',
  LOWER: '가능성 낮음',
}

export function isValidLbpHypothesisSupport(v: unknown): v is LbpHypothesisSupport {
  return typeof v === 'string' && (LBP_HYPOTHESIS_SUPPORT_OPTIONS as readonly string[]).includes(v)
}

/**
 * §11.2: deliberately just `supports` + `recordedAt` — no `note` field. A
 * free-text note for the working hypothesis is not a new field; it is the
 * existing `PainFinalAssessment.finalWorkingAssessment` the clinician
 * already fills in the same 판단·처치 lane (architecture §11.2's own
 * parenthetical: "note는 기존 자유 텍스트와 별개가 아니라 만들지 않는다").
 */
export type LbpWorkingHypothesis = {
  supports: Record<LbpHypothesisPatternId, LbpHypothesisSupport>
  recordedAt: string | null
}

export function emptyLbpWorkingHypothesis(): LbpWorkingHypothesis {
  return {
    supports: {
      LUMBAR_MOVEMENT: 'UNJUDGED',
      NEURAL: 'UNJUDGED',
      WALK_STAND_LEG: 'UNJUDGED',
      HIP: 'UNJUDGED',
      SIJ: 'UNJUDGED',
    },
    recordedAt: null,
  }
}

/** True when every pattern is still UNJUDGED (the untouched default) — used both to decide whether a "이전 가설 이어받기" carry-forward action should be offered (never overwrite a clinician's own today's picks) and by the card to decide when to stamp `recordedAt`. */
export function isLbpWorkingHypothesisBlank(v: LbpWorkingHypothesis): boolean {
  return LBP_HYPOTHESIS_PATTERN_IDS.every((id) => v.supports[id] === 'UNJUDGED')
}

/**
 * Never throws — a legacy record with no field at all, a non-object, or a
 * corrupted `supports` sub-record all degrade to
 * `emptyLbpWorkingHypothesis()` field-by-field. Each of the 5 pattern ids is
 * validated INDEPENDENTLY so one corrupt/unknown-string sibling never blanks
 * the other 4 (mirrors `persistence.ts`'s existing per-field sanitizers,
 * e.g. `sanitizeReassessmentItem`). An unrecognized string value (not one of
 * the 4 real `LbpHypothesisSupport` members) degrades to 'UNJUDGED', never
 * silently rendered/persisted as a real clinical value.
 */
export function sanitizeLbpWorkingHypothesis(raw: unknown): LbpWorkingHypothesis {
  const empty = emptyLbpWorkingHypothesis()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return empty
  const r = raw as Record<string, unknown>
  const rawSupports =
    typeof r.supports === 'object' && r.supports !== null && !Array.isArray(r.supports)
      ? (r.supports as Record<string, unknown>)
      : {}
  const supports = { ...empty.supports }
  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    const v = rawSupports[id]
    supports[id] = isValidLbpHypothesisSupport(v) ? v : 'UNJUDGED'
  }
  return {
    supports,
    recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : null,
  }
}

/**
 * §11.3: EMR/재진 recap 한 줄. UNJUDGED 패턴은 생략(계산이 아니라 원장이
 * 고른 값의 직접 대응). 전부 UNJUDGED면 `null` — 호출부가 줄 자체를
 * 렌더하지 않는다(EMR에서 "임상 가설:" 빈 줄이 남지 않는다).
 */
export function summarizeLbpWorkingHypothesisKo(v: LbpWorkingHypothesis): string | null {
  const parts = LBP_HYPOTHESIS_PATTERN_IDS.filter((id) => v.supports[id] !== 'UNJUDGED').map(
    (id) => `${LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]} ${LBP_HYPOTHESIS_SUPPORT_LABEL_KO[v.supports[id]]}`,
  )
  if (parts.length === 0) return null
  return `임상 가설: ${parts.join(' · ')}`
}

/**
 * §11.3/§11.7: the fixed clause every patient draft sentence must contain,
 * verbatim, so a mutation that drops/rewords it is mechanically detectable
 * (`tests/lbp-working-hypothesis.spec.mjs` asserts on this exact string,
 * not just "the sentence looks reassuring").
 */
export const LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO = '확정 진단이 아니라 경과를 보며 다시 판단합니다.'

/**
 * §11.3: builds the environment's ONE plain-language draft sentence when —
 * and only when — exactly one pattern is `HIGHER`. Zero HIGHER patterns
 * means there is nothing confident enough to draft; two or more means the
 * clinician should write the sentence themselves (a fixed template cannot
 * honestly join two mechanisms into one plain sentence) — both return
 * `null`, and `LbpWorkingHypothesisCard.tsx` renders no draft box at all in
 * either case (§11.4's "그 아래 회색 상자" appears only when this is
 * non-null).
 */
export function patientSentenceDraftKo(v: LbpWorkingHypothesis): string | null {
  const higher = LBP_HYPOTHESIS_PATTERN_IDS.filter((id) => v.supports[id] === 'HIGHER')
  if (higher.length !== 1) return null
  const id = higher[0]
  const easy = LBP_HYPOTHESIS_PATIENT_EASY_LABEL_KO[id]
  const particle = LBP_HYPOTHESIS_PATIENT_PARTICLE_KO[id]
  return `오늘은 ${easy}${particle} 관련된 통증으로 보고 치료했습니다. ${LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO}`
}

/**
 * §11.1/§11.4: the ONLY way a hypothesis-derived sentence ever reaches
 * `PainCarePlan.patientInstruction` — called exclusively from an explicit
 * "안내문에 넣기" click (`LbpWorkingHypothesisCard.tsx`'s
 * `onInsertPatientSentence`, wired in `DoctorWorkspace.tsx`/
 * `RevisitWorkspace.tsx`). Idempotent (never inserts the exact same
 * sentence twice) and additive-only (never replaces/clears existing text,
 * so a clinician's own edits to `patientInstruction` — including an edited
 * copy of a previously-inserted sentence — are never overwritten). Mirrors
 * `lbpExerciseRecommendation.ts`'s `appendLbpAdoptionText` pattern
 * deliberately, but kept as its own small function here rather than a
 * shared import: the two modules must stay uncoupled (§11.7 "가설→운동추천
 * 연결" 금지 — even an incidental code dependency between the hypothesis
 * and exercise modules would blur that boundary for a future reader).
 */
export function appendLbpHypothesisSentenceToPatientInstruction(existingPatientInstruction: string, sentence: string): string {
  if (!sentence) return existingPatientInstruction
  if (existingPatientInstruction.includes(sentence)) return existingPatientInstruction
  return existingPatientInstruction.trim() ? `${existingPatientInstruction}\n${sentence}` : sentence
}

/**
 * §11.4 (재진): "이전 가설 이어받기" — copies the prior visit's `supports`
 * into today's value, stamped with today's time. Only ever called from an
 * explicit clinician click (never from a load effect / render path) —
 * `tests/lbp-working-hypothesis.spec.mjs` pins this both by testing the
 * pure function's own blank-guards below AND by a structural check that
 * `RevisitWorkspace.tsx`'s one call site sits inside an `onClick` handler,
 * and that the generic `revisitCarryForward.ts` module (the other, already-
 * existing "이전 내용 이어가기" actions) never references this module at
 * all — the general carry-forward mechanism must never pick up the
 * hypothesis as a side effect of an unrelated button.
 *
 * Double-guarded exactly like `revisitCarryForward.ts`'s own apply*
 * functions (e.g. `applyJudgmentCarryForward`): a `null`/blank prior has
 * nothing to offer, and today's value already having a real pick is never
 * silently replaced — both make the "never auto-apply" property belong to
 * the operation itself, not to whichever call site remembers to check.
 */
export function applyLbpWorkingHypothesisCarryForward(
  today: LbpWorkingHypothesis,
  prior: LbpWorkingHypothesis | null,
  now: string,
): LbpWorkingHypothesis {
  if (!prior || isLbpWorkingHypothesisBlank(prior) || !isLbpWorkingHypothesisBlank(today)) return today
  return { supports: { ...prior.supports }, recordedAt: now }
}

/**
 * Opus delta review D-4 / CDR-3 (PO decision, 2026-09-04): §11.2 declares
 * this data LBP-전용. `DoctorWorkspace.tsx` already gates the initial-visit
 * card on `isLbpRecord` (`payload.responses.safety_flags.lbp != null`);
 * `RevisitWorkspace.tsx` had NO equivalent gate, so a neck/knee/shoulder/…
 * revisit's clinician could insert a lumbar sentence into that patient's
 * 안내문. This is the same two-part signal, decomposed into two plain
 * arguments so it stays a pure function callers can unit-test directly
 * without importing `SubmissionRecord`/React here:
 *
 *   1. `priorSubmissionSafetyFlagsLbp` — the raw `safety_flags.lbp` value
 *      read from the latest submission-backed visit anywhere in this
 *      patient's history (`RevisitWorkspace.tsx`'s own
 *      `rehabSourceSubmission?.submission?.submission?.responses?.safety_flags?.lbp`
 *      — the first `.submission` is that wrapper's own field holding a
 *      `SubmissionRecord`, whose OWN `.submission` field is the raw
 *      questionnaire payload; same double-nesting `recordToPayload`
 *      unwraps for `DoctorWorkspace.tsx`'s `isLbpRecord`).
 *      `!= null` is the applicability convention this whole codebase uses
 *      for `safety_flags.<region>` (see e.g. `DoctorView.tsx`'s per-region
 *      gates) — never a truthiness check, since `false`/`0` would still be
 *      a real recorded flag value.
 *   2. `todayHypothesis` — today's own `WorkspaceState.lbpWorkingHypothesis`
 *      / `VisitWorkspaceState.lbpWorkingHypothesis`. This disjunct is
 *      REQUIRED, not an edge-case nicety: without it, a hypothesis already
 *      recorded on this visit (e.g. carried forward before a submission
 *      link changed, or entered while the signal was briefly unavailable)
 *      would become unreachable/uneditable the moment the first signal is
 *      false — the clinician could never see or correct their own prior
 *      entry on this same visit.
 *
 * A patient with no submission-backed history AND a still-blank hypothesis
 * gates closed (`false`) — the safe default matches `isLbpRecord`'s own
 * `!= null` fail-closed shape on the initial-visit screen.
 */
export function isLbpPatientForRevisitHypothesisGate(
  priorSubmissionSafetyFlagsLbp: unknown,
  todayHypothesis: LbpWorkingHypothesis,
): boolean {
  return priorSubmissionSafetyFlagsLbp != null || !isLbpWorkingHypothesisBlank(todayHypothesis)
}
