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

export type MicroFollowUpDetailAnswer = {
  questionId: string
  value: string
}

export type MicroFollowUpResponse = {
  visit_id: string
  patient_id: string
  targetRatings: MicroFollowUpTargetRating[]
  /** 플로우 정렬 5/5: raw answers to the re-asked initial-questionnaire items (empty when none were asked). */
  detailAnswers: MicroFollowUpDetailAnswer[]
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
    detailAnswers: [],
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

const MICRO_FOLLOW_UP_DETAIL_ANSWER_TEMPLATE: MicroFollowUpDetailAnswer = {
  questionId: '',
  value: '',
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
    detailAnswers: sanitizeArray(MICRO_FOLLOW_UP_DETAIL_ANSWER_TEMPLATE, raw.detailAnswers).filter((a) => a.questionId !== ''),
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
 * 「지난 대비」 한 줄에 붙는 경보 종류. `microFollowUpNeedsAttention`이
 * true/false만 돌려주는 것과 달리 **어느 쪽인지**를 말한다 -- 좌측 요약은
 * 문장 하나만 싣기 때문에, 그 문장이 "이상반응 신고"인지 "그냥 근황"인지가
 * 배지로 구분되지 않으면 원장이 같은 글자를 다르게 읽을 수 없다.
 *
 * 우선순위는 `microFollowUpQuoteLine`과 **같아야 한다** -- 배지는 이상반응을
 * 가리키는데 문장은 전반적 변화를 싣는 어긋남이 생기면, 둘을 나란히 읽는
 * 원장이 이상반응 내용을 읽었다고 착각한다. 두 함수의 분기 순서가 같음을
 * 테스트가 직접 단언한다.
 */
export type MicroFollowUpAlertKind = 'ADVERSE_EFFECT' | 'NEW_SYMPTOM'

export function microFollowUpAlertKind(response: MicroFollowUpResponse | null): MicroFollowUpAlertKind | null {
  if (!response) return null
  if (response.adverseEffectReported) return 'ADVERSE_EFFECT'
  if (response.newSymptomReported) return 'NEW_SYMPTOM'
  return null
}

export const MICRO_FOLLOW_UP_ALERT_LABEL: Readonly<Record<MicroFollowUpAlertKind, string>> = {
  ADVERSE_EFFECT: '이상반응',
  NEW_SYMPTOM: '새 증상',
}

/**
 * 환자가 이상반응/새 증상을 신고했으면서 **내용을 비워둔** 경우에 쓰는 문구.
 * 빈 문자열을 그대로 흘리면 아래 우선순위가 다음 분기로 넘어가 버린다 --
 * 그러면 "이상반응 있음"을 체크한 환자의 한 줄에 아무 일 없다는 듯한
 * 전반적 변화 문장이 실린다(아래 본문 주석 참고).
 */
const MICRO_FOLLOW_UP_EMPTY_NOTE = '(내용 없음)'

/**
 * Core Reduction P2 (Phase 5 Synthesis v1.2 §2.3/§2.11, Phase 7 §3.2 block
 * ③ "지난 대비"): the left-column summary shows one PATIENT_FACT-styled
 * quote line. This never invents a value the patient did not type -- it
 * picks the single most informative already-recorded string, in a fixed
 * priority order (an adverse-effect/new-symptom note first, since those are
 * what needsAttention flags; then the free-text overall-change answer; then
 * the first target rating), and returns null when nothing was ever recorded
 * so the caller can omit the block entirely rather than render an empty
 * quote.
 *
 * 2026-09-24 결함 수정 (PO 지시로 통증 확인 레인의 MicroFollowUpCard를
 * 떼면서 드러났다). 이전 판은 두 신고 분기를 `reported && note.trim()`으로
 * 걸었다 -- 그래서 **신고는 했는데 내용을 안 적은** 환자의 경우 조용히 다음
 * 분기로 떨어져, 이상반응 신고가 "전반적 변화: 그럭저럭이요" 같은 문장으로
 * 바뀌어 나갔다. 이 줄은 좌측 요약과 EMR 텍스트(§14.1 S) 양쪽으로 가므로,
 * 신고 자체가 화면에서도 기록에서도 사라지고 있었다는 뜻이다.
 *
 * 카드가 확인 레인에 있을 때는 그 카드가 `needsAttention`으로 저절로 펼쳐져
 * 이 구멍을 가려주고 있었다. 카드를 떼면 가려주던 것이 없어지므로, 떼기
 * **전에** 여기를 먼저 메운다.
 *
 * 고친 뒤: 신고가 있으면 내용이 비어도 그 분기에서 멈추고 `(내용 없음)`을
 * 돌려준다 -- 없는 값을 지어내는 것이 아니라 "신고는 있었고 내용은 없다"는
 * 사실 그대로다.
 */
export function microFollowUpQuoteLine(response: MicroFollowUpResponse | null): string | null {
  if (!response) return null
  if (response.adverseEffectReported) {
    return response.adverseEffectNote.trim() || MICRO_FOLLOW_UP_EMPTY_NOTE
  }
  if (response.newSymptomReported) {
    return response.newSymptomNote.trim() || MICRO_FOLLOW_UP_EMPTY_NOTE
  }
  if (response.overallChange.trim()) return response.overallChange.trim()
  const firstRated = response.targetRatings.find((t) => t.patientReportedValue.trim() !== '')
  if (firstRated) return `${firstRated.label}: ${firstRated.patientReportedValue.trim()}`
  return null
}
