/**
 * Micro Follow-up (round 3 Phase D). A short (30-60s) patient-facing
 * check-in that reuses the PREVIOUS visit's own Follow-up Targets as
 * candidate items -- this file introduces no new "what should we re-ask"
 * rule of its own, it only packages the FollowUpTarget[] the clinician
 * already picked on an earlier visit into up to 3 candidate items, plus a
 * fixed set of always-present short questions (overall change, new
 * symptom, treatment/herbal adverse effect).
 *
 * No clinical branching lives here. A reported new symptom or adverse
 * effect never triggers an automatic safety escalation, threshold, or
 * regional routing change -- it only sets `microFollowUpNeedsAttention()`
 * to true so the clinician sees an "추가 확인 필요" flag at the next visit.
 * What happens next is always the clinician's own judgment call.
 *
 * This file defines the data model. Two separate write paths exist for a
 * MicroFollowUpResponse (server/microFollowUpStore.js + the routes in
 * server/index.js): a doctor/staff session can save one directly (e.g. a
 * clinician noting a check-in over the phone), and -- since round 4 -- the
 * PATIENT's own device can also submit one, through a completely separate,
 * un-doctor-token-gated public route (`GET`/`POST /api/follow-up-session/
 * :token`) reached via `src/screens/FollowUpScreen.tsx`'s `#follow-up=
 * <token>` hash link. That link carries a scoped, single-use capability
 * token (server/followUpSessionStore.js) rather than the doctor token --
 * `src/App.tsx` still never references any doctor-token-gated read from the
 * patient tablet app (enforced by an existing regression test), and
 * `src/lib/followUpClient.ts` structurally cannot import doctorToken.ts/
 * serverClient.ts (also enforced by a regression test) -- so the two paths
 * stay fully separate identity boundaries even though they both end up
 * calling the same `saveResponse`.
 */
import { sanitizeArray, sanitizeShape } from './sanitize'
import { readablePriorVisitFollowUpTarget } from './longitudinal'

export type MicroFollowUpCandidateItem = {
  id: string
  label: string
  /** 이미 조립된 "이전 baseline: ..." 문구 -- 빈 값(진짜 미기록)은 "기록 없음", 손상된 값은 실패 토큰으로 구분한다. */
  baselineText: string
  /** null이면 렌더하지 않음(진짜 미기록) -- wrong-typed면 실패 토큰 문자열. */
  postTreatmentText: string | null
}

/**
 * Built from the previous visit's own FollowUpTarget[] -- caps at 3 per
 * the North Star's "1-3 targets, 30-60s" budget. Keeps the clinician's own
 * prior ordering; does not re-rank or select which targets "matter most".
 *
 * 12차 독립 리뷰 MEDIUM-3: `prior` ultimately comes from
 * `PatientHistoryResult`, which the server returns from an unauthenticated-
 * PUT-stored workspace with no runtime validation -- a legacy/hand-crafted
 * record can have this be a non-array, or contain elements missing
 * `baseline`/`postTreatmentValue` entirely (`.slice(...).map is not a
 * function`, `.trim is not a function` were both live-reproduced). Accept
 * `unknown` and validate every layer instead of trusting the declared
 * `FollowUpTarget[]` type.
 *
 * 13차 독립 리뷰 LOW-2: 이전 구현은 "필드가 없음"과 "필드가 wrong-typed로
 * 손상됨"을 둘 다 빈 문자열 `''`로 뭉개서, `previousBaseline.trim()`이
 * 항상 falsy가 되어 두 경우 모두 "기록 없음"으로 표시했다 -- 그러나 실제로
 * 손상된 값은 "기록이 없다"는 사실이 아니라 "무엇이 있었는지 알 수 없다"는
 * 사실이다. longitudinal.ts의 `readablePriorVisitFollowUpTarget`이 이미
 * PriorVisitHistoryCard용으로 이 정확한 구분을 구현해뒀으므로(동일한
 * FollowUpTarget shape) 새로 만들지 않고 재사용한다.
 */
export function microFollowUpCandidatesFromPriorTargets(prior: unknown): MicroFollowUpCandidateItem[] {
  const arr = Array.isArray(prior) ? prior : []
  return arr.slice(0, 3).map((raw, index) => {
    const readable = readablePriorVisitFollowUpTarget(raw, index)
    return {
      id: readable.id,
      label: readable.label,
      baselineText: readable.baselineText,
      postTreatmentText: readable.postTreatmentText,
    }
  })
}

export type MicroFollowUpTargetRating = {
  targetId: string
  label: string
  /** Patient's own short rating for this one target today -- a raw value, same free-text-or-scale shape as the original FollowUpTarget field, never a computed score. */
  patientReportedValue: string
}

export type MicroFollowUpResponse = {
  visit_id: string
  patient_id: string
  targetRatings: MicroFollowUpTargetRating[]
  /** Patient's own short answer -- free text, never inferred. */
  overallChange: string
  newSymptomReported: boolean
  newSymptomNote: string
  adverseEffectReported: boolean
  adverseEffectNote: string
  submitted_at: string
}

export function emptyMicroFollowUpResponse(visitId: string, patientId: string): MicroFollowUpResponse {
  return {
    visit_id: visitId,
    patient_id: patientId,
    targetRatings: [],
    overallChange: '',
    newSymptomReported: false,
    newSymptomNote: '',
    adverseEffectReported: false,
    adverseEffectNote: '',
    submitted_at: '',
  }
}

const MICRO_FOLLOW_UP_TARGET_RATING_TEMPLATE: MicroFollowUpTargetRating = {
  targetId: '',
  label: '',
  patientReportedValue: '',
}

/**
 * 13차 독립 리뷰 MEDIUM-1: `MicroFollowUpResponse`는 환자 자신의 기기(공개,
 * doctor-token 없는 `#follow-up=<token>` 경로)나 직원 대면 대필로 저장되고,
 * `server/microFollowUpStore.js`는 컨테이너만 방어할 뿐(`overallChange ??
 * ''`) 원소/leaf는 검증하지 않는다 -- 레거시/손상된 저장 파일이면
 * `targetRatings`가 배열이 아니거나 `label`이 wrong-typed거나
 * `overallChange`/`newSymptomNote`/`adverseEffectNote`가 문자열이 아닐 때
 * MicroFollowUpCard의 `.trim()`/React child 렌더가 그대로 크래시했다(round
 * 12가 이 카드의 "이전 방문 후보" 절반은 고쳤지만 "오늘 환자 응답" 절반은
 * 그대로 남겨뒀다). deriveReproductiveStatus류와 동일하게, 여기서도
 * "값이 없음"과 "값이 손상됨"을 구분하지 않는다 -- 둘 다 안전한 빈
 * 기본값으로 fail-close한다(이 카드는 참고용 raw 텍스트일 뿐 안전
 * computation에 관여하지 않으므로 무해하다).
 */
export function readableMicroFollowUpResponse(value: unknown): MicroFollowUpResponse | null {
  if (value === null || value === undefined) return null
  const empty = emptyMicroFollowUpResponse('', '')
  const sanitized = sanitizeShape(empty, value)
  const raw = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    ...sanitized,
    targetRatings: sanitizeArray(MICRO_FOLLOW_UP_TARGET_RATING_TEMPLATE, raw.targetRatings),
  }
}

/**
 * True when anything here needs a clinician's eyes before the next
 * scheduled reassessment -- purely a display flag; it never changes any
 * routing/safety computation and never selects a Safety Mini-Gate question.
 */
export function microFollowUpNeedsAttention(response: MicroFollowUpResponse): boolean {
  return response.newSymptomReported || response.adverseEffectReported
}

/**
 * Core Reduction P2 (Phase 5 Synthesis v1.2 §2.3/§2.11, Phase 7 §3.2 block
 * ③ "지난 대비"): the left-column summary shows one PATIENT_FACT-styled
 * quote line, distinct from the full MicroFollowUpCard (which stays in
 * lane2, unchanged, gated by `open={needsAttention}` above). This never
 * invents a value the patient did not type -- it picks the single most
 * informative already-recorded string, in a fixed priority order (an
 * adverse-effect/new-symptom note first, since those are what
 * needsAttention flags; then the free-text overall-change answer; then the
 * first target rating), and returns null when nothing was ever recorded so
 * the caller can omit the block entirely rather than render an empty quote.
 */
export function microFollowUpQuoteLine(response: MicroFollowUpResponse | null): string | null {
  if (!response) return null
  if (response.adverseEffectReported && response.adverseEffectNote.trim()) {
    return response.adverseEffectNote.trim()
  }
  if (response.newSymptomReported && response.newSymptomNote.trim()) {
    return response.newSymptomNote.trim()
  }
  if (response.overallChange.trim()) return response.overallChange.trim()
  const firstRated = response.targetRatings.find((t) => t.patientReportedValue.trim() !== '')
  if (firstRated) return `${firstRated.label}: ${firstRated.patientReportedValue.trim()}`
  return null
}
