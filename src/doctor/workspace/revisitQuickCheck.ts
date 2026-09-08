/**
 * Revisit Quick Check (LBP v1 Batch 3, `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md`
 * §9) — the 30-60 second clinician-recorded check-in for a routine revisit
 * visit ("재진은 30~60초 체크"). Pure types + tiny helpers, no React (same
 * convention as finalAssessment.ts/rehabSuggestion.ts).
 *
 * Five independent chip groups, each starting `NOT_ASSESSED`. NOT_ASSESSED
 * is never treated as 없음/정상 -- `deriveRevisitQuickCheckGuidance` below
 * only ever reads `NO`/`SAME`/etc. as the specific chip the clinician
 * pressed, never infers one from an unanswered item (see its own doc
 * comment and rule 7/8).
 *
 * The patient's own MicroFollowUpResponse (오늘 환자 입력, 태블릿 30~60초
 * 응답) is a SEPARATE record and must never be auto-copied in here -- this
 * module has no function that reads a MicroFollowUpResponse at all, and
 * RevisitQuickCheckCard.tsx's hint text says so explicitly (출처 분리
 * 원칙, DECISIONS.md 2026-09-02 "PO 재확인").
 *
 * No score, weight, or numeric threshold is computed anywhere in this file
 * (PO 결정, DECISIONS.md 2026-09-03 "Batch 3 브리프"). `deriveRevisitQuickCheckGuidance`
 * is a direct chip-state -> sentence lookup, never an aggregate/points
 * system, and `computeDetailCheckDue` reports only facts the clinician
 * themselves already set on a prior `NextReassessmentPlan` -- it invents no
 * timing rule of its own.
 */
import { isSanitizeRecord } from './sanitize'

/* ---------------------------- chip value types ---------------------------- */

export type QuickCheckChange = 'NOT_ASSESSED' | 'BETTER' | 'SAME' | 'WORSE'

export type QuickCheckYesNo = 'NOT_ASSESSED' | 'NO' | 'YES'

export type QuickCheckExerciseAdherence =
  | 'NOT_ASSESSED'
  | 'NOT_PRESCRIBED'
  | 'NOT_DONE'
  | 'PARTIAL'
  | 'DONE_AS_PLANNED'
  | 'DONE_TOO_HARD'
  | 'DONE_TOO_EASY'

export type RevisitQuickCheck = {
  /** 목표 기능 변화. */
  targetFunctionChange: QuickCheckChange
  /** 전체 증상 반응. */
  overallResponse: QuickCheckChange
  /** 새 신경증상·위험신호. */
  newNeuroOrRedFlag: QuickCheckYesNo
  /** 운동 실제 시행·난이도. */
  exerciseAdherence: QuickCheckExerciseAdherence
  /** 치료 후 이상반응. */
  adverseEffect: QuickCheckYesNo
  /** 짧은 메모 1칸(선택) -- 이상반응/신경증상 내용 등. 그 외 free text 없음. */
  note: string
  /** 5항목 중 하나라도 NOT_ASSESSED가 아니게 된 시점. 전부 NOT_ASSESSED면 null. */
  recordedAt: string | null
}

export function emptyRevisitQuickCheck(): RevisitQuickCheck {
  return {
    targetFunctionChange: 'NOT_ASSESSED',
    overallResponse: 'NOT_ASSESSED',
    newNeuroOrRedFlag: 'NOT_ASSESSED',
    exerciseAdherence: 'NOT_ASSESSED',
    adverseEffect: 'NOT_ASSESSED',
    note: '',
    recordedAt: null,
  }
}

/* ------------------------------- Korean labels ------------------------------ */

/** targetFunctionChange / overallResponse share this label set. */
export const QUICK_CHECK_CHANGE_LABEL: Record<QuickCheckChange, string> = {
  NOT_ASSESSED: '미평가',
  BETTER: '좋아짐',
  SAME: '비슷함',
  WORSE: '나빠짐',
}

/** Chips actually rendered for a QuickCheckChange group -- NOT_ASSESSED has
 * no chip of its own; it is the "nothing pressed yet" state, reached by
 * re-clicking the active chip (NextReassessmentPlanCard convention). */
export const QUICK_CHECK_CHANGE_OPTIONS: QuickCheckChange[] = ['BETTER', 'SAME', 'WORSE']

/** newNeuroOrRedFlag / adverseEffect share this label set. */
export const QUICK_CHECK_YES_NO_LABEL: Record<QuickCheckYesNo, string> = {
  NOT_ASSESSED: '미평가',
  NO: '없음',
  YES: '있음',
}

export const QUICK_CHECK_YES_NO_OPTIONS: QuickCheckYesNo[] = ['NO', 'YES']

export const QUICK_CHECK_EXERCISE_ADHERENCE_LABEL: Record<QuickCheckExerciseAdherence, string> = {
  NOT_ASSESSED: '미평가',
  NOT_PRESCRIBED: '처방 없음',
  NOT_DONE: '안 함',
  PARTIAL: '일부만',
  DONE_AS_PLANNED: '계획대로',
  DONE_TOO_HARD: '했지만 너무 어려움',
  DONE_TOO_EASY: '했지만 너무 쉬움',
}

export const QUICK_CHECK_EXERCISE_ADHERENCE_OPTIONS: QuickCheckExerciseAdherence[] = [
  'NOT_PRESCRIBED',
  'NOT_DONE',
  'PARTIAL',
  'DONE_AS_PLANNED',
  'DONE_TOO_HARD',
  'DONE_TOO_EASY',
]

/** Group titles, in display order -- also the order `summarizeRevisitQuickCheckKo` joins in. */
export const REVISIT_QUICK_CHECK_GROUP_TITLE = {
  targetFunctionChange: '목표 기능 변화',
  overallResponse: '전체 증상 반응',
  newNeuroOrRedFlag: '새 신경증상·위험신호',
  exerciseAdherence: '운동 실제 시행·난이도',
  adverseEffect: '치료 후 이상반응',
} as const

/* -------------------------------- isValid* -------------------------------- */

export function isValidQuickCheckChange(v: unknown): v is QuickCheckChange {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(QUICK_CHECK_CHANGE_LABEL, v)
}

export function isValidQuickCheckYesNo(v: unknown): v is QuickCheckYesNo {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(QUICK_CHECK_YES_NO_LABEL, v)
}

export function isValidQuickCheckExerciseAdherence(v: unknown): v is QuickCheckExerciseAdherence {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(QUICK_CHECK_EXERCISE_ADHERENCE_LABEL, v)
}

/* ------------------------------ sanitization ------------------------------ */

/**
 * `RevisitQuickCheck` is stored inside `VisitWorkspaceState`, saved through
 * the same unauthenticated PUT `/api/visits/:id/workspace` route as every
 * other field there (see visitWorkspace.ts's own doc comment) -- a
 * hand-crafted or legacy record can hold anything. Each enum field is
 * validated against its own `isValid*` guard; anything missing/unknown/
 * wrong-typed degrades to `NOT_ASSESSED`, never to a normal/negative value.
 * A record with no `revisitQuickCheck` field at all (legacy, pre-Batch-3)
 * degrades to `emptyRevisitQuickCheck()` via the same path -- `raw` is then
 * `undefined`, which fails the `isSanitizeRecord` check below.
 */
export function sanitizeRevisitQuickCheck(raw: unknown): RevisitQuickCheck {
  const empty = emptyRevisitQuickCheck()
  if (!isSanitizeRecord(raw)) return empty
  return {
    targetFunctionChange: isValidQuickCheckChange(raw.targetFunctionChange) ? raw.targetFunctionChange : 'NOT_ASSESSED',
    overallResponse: isValidQuickCheckChange(raw.overallResponse) ? raw.overallResponse : 'NOT_ASSESSED',
    newNeuroOrRedFlag: isValidQuickCheckYesNo(raw.newNeuroOrRedFlag) ? raw.newNeuroOrRedFlag : 'NOT_ASSESSED',
    exerciseAdherence: isValidQuickCheckExerciseAdherence(raw.exerciseAdherence)
      ? raw.exerciseAdherence
      : 'NOT_ASSESSED',
    adverseEffect: isValidQuickCheckYesNo(raw.adverseEffect) ? raw.adverseEffect : 'NOT_ASSESSED',
    note: typeof raw.note === 'string' ? raw.note : '',
    recordedAt: typeof raw.recordedAt === 'string' ? raw.recordedAt : null,
  }
}

/* ----------------------------------- (b) ----------------------------------- */

/**
 * The exact sentence for rule 1 (§9.2(b)) -- exported so
 * RevisitQuickCheckCard.tsx can identify which guidance line is the safety
 * one by value rather than by array position (position would break if a
 * future edit reorders the rules below).
 */
export const REVISIT_QUICK_CHECK_SAFETY_LINE =
  '새 신경증상·위험신호: 안전 확인부터. 재초진 문진(태블릿) 또는 신경학적 기본검사를 고려하세요.'

export type RevisitQuickCheckGuidance = {
  lines: string[]
  safetyRefreshSuggested: boolean
}

/**
 * §10.1: appended once, after every rule 1-6 sentence, when (and only when)
 * rule 2 (이상반응), rule 3 (악화), or rule 4 (계획대로 시행+변화 없음)
 * fired -- those three are the cases where a look at "오늘 재검" (the
 * detail-check form) is actually useful. Rule 1 already carries a stronger
 * sentence of its own; rules 5/6 (운동 조정 계열) and rule 7 (유지·진행) do
 * not get this line (알림 피로 방지, §10.1). No `<details>` is opened
 * automatically by this -- it is plain text, same as every other line here.
 */
export const REVISIT_QUICK_CHECK_DETAIL_CHECK_HINT =
  "필요하면 아래 '오늘 재검'을 펼쳐 이전 검사 결과와 비교하세요."

/**
 * §9.2(b): chip-state -> sentence, direct correspondence only. No score, no
 * weight, no threshold. Every sentence here is copied verbatim from the
 * brief -- this function adds no clinical interpretation beyond what each
 * rule's own chip condition already states.
 *
 * Rules 1-6 are independent (a visit can match more than one -- e.g. a new
 * red flag AND a reported worsening both produce their own line). Rule 7
 * fires only when NONE of 1-6 matched AND all five chips have been
 * answered AND both safety-relevant chips read negative; rule 8 is the
 * silent fallback (some chips still NOT_ASSESSED, nothing else matched) --
 * NOT_ASSESSED is never read as "없음", so an unanswered neuro/red-flag chip
 * alone is enough to keep rule 7 from firing.
 */
export function deriveRevisitQuickCheckGuidance(value: RevisitQuickCheck): RevisitQuickCheckGuidance {
  const lines: string[] = []
  let safetyRefreshSuggested = false
  let detailCheckHintNeeded = false

  // Rule 1.
  if (value.newNeuroOrRedFlag === 'YES') {
    safetyRefreshSuggested = true
    lines.push(REVISIT_QUICK_CHECK_SAFETY_LINE)
  }
  // Rule 2.
  if (value.adverseEffect === 'YES') {
    lines.push('치료 후 이상반응 기록됨: 처치 계획 재검토.')
    detailCheckHintNeeded = true
  }
  // Rule 3.
  if (value.targetFunctionChange === 'WORSE' || value.overallResponse === 'WORSE') {
    lines.push('악화: 계획 재검토.')
    detailCheckHintNeeded = true
  }
  // Rule 4.
  if (
    value.exerciseAdherence === 'DONE_AS_PLANNED' &&
    value.targetFunctionChange === 'SAME' &&
    value.overallResponse === 'SAME'
  ) {
    lines.push('계획대로 시행했는데 변화 없음: 운동·처치 계획 재검토 고려.')
    detailCheckHintNeeded = true
  }
  // Rule 5.
  if (value.exerciseAdherence === 'DONE_TOO_HARD') {
    lines.push('운동이 어려움: 쉬운 단계 또는 다른 운동 고려.')
  } else if (value.exerciseAdherence === 'DONE_TOO_EASY') {
    lines.push('운동이 쉬움: 진행 단계 고려(원장 판단).')
  }
  // Rule 6.
  if (value.exerciseAdherence === 'NOT_DONE' || value.exerciseAdherence === 'PARTIAL') {
    lines.push('운동 시행 부족: 장애 요인 확인.')
  }

  // §10.1 tail hint: only when rule 2/3/4 fired, always last, exactly once.
  if (detailCheckHintNeeded) {
    lines.push(REVISIT_QUICK_CHECK_DETAIL_CHECK_HINT)
  }

  // Rule 7 (only considered when 1-6 produced nothing) / Rule 8 (fallback, stays []).
  if (lines.length === 0) {
    const allAssessed =
      value.targetFunctionChange !== 'NOT_ASSESSED' &&
      value.overallResponse !== 'NOT_ASSESSED' &&
      value.newNeuroOrRedFlag !== 'NOT_ASSESSED' &&
      value.exerciseAdherence !== 'NOT_ASSESSED' &&
      value.adverseEffect !== 'NOT_ASSESSED'
    if (allAssessed && value.newNeuroOrRedFlag === 'NO' && value.adverseEffect === 'NO') {
      lines.push('유지·진행 가능(원장 판단).')
    }
  }

  return { lines, safetyRefreshSuggested }
}

/* ----------------------------------- (c) ----------------------------------- */

export type DetailCheckDue = {
  reason: 'DATE' | 'VISIT_COUNT'
  /** Display-ready fact, e.g. "날짜 지정 2026-09-01" / "방문 3회 후" -- no computed judgment. */
  planLabel: string
  /** The visit that set the plan being reported due, raw ISO string ('' if unreadable). */
  sourceVisitCreatedAt: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * §9.2(c): "세부 체크 주기 도달" — a pure fact check against a plan the
 * clinician themselves already set on a PRIOR visit's `NextReassessmentPlan`.
 * No number here is invented by the system; every value compared
 * (`targetDate`, `afterVisitCount`) was typed/picked by a clinician on an
 * earlier visit via NextReassessmentPlanCard.
 *
 * `priorVisits` is expected to be `PatientHistoryResult['visits']` (most
 * recent first, current visit already excluded by the caller) but is typed
 * `unknown` and defended at every layer -- it is the same untrusted-PUT
 * projection `longitudinal.ts`'s other readers guard against.
 *
 * Walk from the most recent prior visit backward. A visit whose plan is
 * absent -- `null`/`undefined`, the server's own default for "no plan set
 * on this visit" -- or whose plan object has no `status` key or is
 * explicitly `UNSET` carries no information -- skip it and keep looking
 * (this is the "9.1의 plan 소실 결함 수정": an unchanged-since plan must not
 * vanish just because the immediately prior visit never touched it). The
 * FIRST visit whose plan has a real (non-`UNSET`) `status` is the "유효
 * plan" -- evaluation stops there. If that plan is present but unreadable
 * -- not an object at all, or an object whose `status` is not a string --
 * or its DATE/VISIT_COUNT fields are
 * malformed, or its status is `CLINICIAN_DECIDES` or an unrecognized
 * string, the result is `null` (this codebase never guesses at a timing
 * rule) and the scan halts immediately -- it does NOT fall back to an
 * older prior visit's plan, because that plan was already superseded by
 * this one and reporting it as due could surface a stale date.
 */
export function computeDetailCheckDue(priorVisits: unknown, todayISO: string): DetailCheckDue | null {
  const visits = Array.isArray(priorVisits) ? priorVisits : []
  for (let k = 0; k < visits.length; k++) {
    const visit = visits[k]
    if (!isSanitizeRecord(visit)) continue
    const planRaw = visit.nextReassessmentPlan
    if (planRaw === null || planRaw === undefined) continue
    if (!isSanitizeRecord(planRaw)) return null
    if (planRaw.status === undefined || planRaw.status === 'UNSET') continue

    const createdAtRaw = visit.createdAt
    const sourceVisitCreatedAt = typeof createdAtRaw === 'string' ? createdAtRaw : ''

    if (typeof planRaw.status !== 'string') return null

    if (planRaw.status === 'DATE') {
      const targetDate = planRaw.targetDate
      if (typeof targetDate !== 'string' || !ISO_DATE_RE.test(targetDate)) return null
      if (todayISO >= targetDate) {
        return { reason: 'DATE', planLabel: `날짜 지정 ${targetDate}`, sourceVisitCreatedAt }
      }
      return null
    }

    if (planRaw.status === 'VISIT_COUNT') {
      const n = planRaw.afterVisitCount
      if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return null
      if (k + 1 >= n) {
        return { reason: 'VISIT_COUNT', planLabel: `방문 ${n}회 후`, sourceVisitCreatedAt }
      }
      return null
    }

    // CLINICIAN_DECIDES, or an unrecognized status string -- never due, never guessed.
    return null
  }
  return null
}

/* ----------------------------------- (e) ----------------------------------- */

/**
 * §9.2(e): one read-only recap line for a prior REVISIT's own quick check.
 * NOT_ASSESSED items are omitted entirely (never rendered as "없음"); when
 * every item is NOT_ASSESSED there is nothing worth a line, so this
 * returns `null` and the caller omits the row.
 */
export function summarizeRevisitQuickCheckKo(value: RevisitQuickCheck): string | null {
  const parts: string[] = []
  if (value.targetFunctionChange !== 'NOT_ASSESSED') {
    parts.push(`목표 기능 ${QUICK_CHECK_CHANGE_LABEL[value.targetFunctionChange]}`)
  }
  if (value.overallResponse !== 'NOT_ASSESSED') {
    parts.push(`전체 반응 ${QUICK_CHECK_CHANGE_LABEL[value.overallResponse]}`)
  }
  if (value.newNeuroOrRedFlag !== 'NOT_ASSESSED') {
    parts.push(`신경증상·위험신호 ${QUICK_CHECK_YES_NO_LABEL[value.newNeuroOrRedFlag]}`)
  }
  if (value.exerciseAdherence !== 'NOT_ASSESSED') {
    parts.push(`운동 ${QUICK_CHECK_EXERCISE_ADHERENCE_LABEL[value.exerciseAdherence]}`)
  }
  if (value.adverseEffect !== 'NOT_ASSESSED') {
    parts.push(`이상반응 ${QUICK_CHECK_YES_NO_LABEL[value.adverseEffect]}`)
  }
  if (parts.length === 0) return null
  return `이전 간단 체크: ${parts.join(' · ')}`
}
