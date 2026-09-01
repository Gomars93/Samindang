/**
 * Core Reduction P2 — 레인1 요약 상태 union (Phase 5 Synthesis v1.2 §2.2,
 * Phase 7 UI spec §1.1/§6.1).
 *
 * 독립 검수 HIGH-1 (severity 보존): URGENT는 오직 부위 SafetyPanel 자신의
 * 명시적 `urgent_review` 판정에서만 나온다. 그 외 두 신호는 URGENT를
 * 만들지 않는다 -- generic `requires_staff_check`(flags는 읽을 수 있고,
 * 그 안의 일반 staff-review 신호가 true인 경우)는 "확인 필요"일 뿐이고,
 * flags 자체를 못 읽거나(`flagsUnusable`) 부위 계산이 불가하거나
 * (`perRegionPanel.calcUnavailable`) 안전 관련 필드가 손상됐으면
 * (`hasUnreadableSafetyField`) "계산불가"일 뿐이다 -- 셋 다 실제 임상
 * 위험 판정이 아니라 "확인이 필요하다"/"계산을 신뢰할 수 없다"는 신호이므로,
 * Core Reduction이 이걸 새로운 URGENT 의미로 승격하면 안 된다(기존 승인된
 * severity 의미를 그대로 보존).
 *
 * 우선순위(내림차순): explicit regional URGENT > (flagsUnusable ∪
 * perRegionPanel.calcUnavailable ∪ hasUnreadableSafetyField)=계산불가 >
 * (staffCheckRequired ∪ review_required)=확인 필요 > CLEAR > 해당없음.
 * 계산불가와 확인 필요가 동시에 성립할 수 있는 레코드(예: flags는 못 읽지만
 * 어떤 부위는 review_required)는 항상 계산불가가 이긴다 -- "계산 자체를
 * 신뢰할 수 없다"가 "일부는 확인 필요하다"보다 강한 경고이기 때문이며, 이
 * 순서는 기존 §1.1-#2(계산불가가 CLEAR보다 항상 우선)의 자연스러운 확장일
 * 뿐 새로운 임상 해석이 아니다.
 *
 * 이 모든 축은 반드시 배선돼 있어야 한다 -- 하나라도 빠지면 Phase 6이
 * 지적한 것과 같은 fail-open으로 조용히 퇴행한다: 부위 하나의
 * calc-unavailable만으로도 CLEAR가 되면 안 되고, 부위 URGENT 판정은 다른
 * 모든 부위가 CLEAR여도 여전히 URGENT를 만들 수 있어야 하고, (MAJOR-2,
 * Phase 10 closing review) `hasUnreadableSafetyField`도 단독으로 CLEAR를
 * 막아야 한다.
 *
 * This module never recomputes clinical logic itself. Each region's
 * SafetyPanel (DoctorView.tsx / HipSafetyPanel.tsx / AnkleFootSafetyPanel.tsx
 * / TmjSafetyPanel.tsx) is a pure, stateless function component that already
 * makes the "applicable / calc-unavailable / clear / review_required /
 * urgent_review" decision via its own gate (`safety_flags.<region> == null`
 * -> not applicable) and renders exactly one of a small set of className
 * shapes (`doctor__lbpSafety--unavailable|clear|review_required|urgent_review`,
 * shared verbatim across all 9 regions). Calling each panel function
 * directly (not as JSX) during DoctorWorkspace's render and reading the
 * className off the returned element reuses that SAME decision instead of
 * forking a second, drift-prone copy of 9 regions' worth of gating logic --
 * exactly the reuse Phase 6's delta gate asked for (§1.1-#5 fail-open
 * regression guard: a herbal-derived record must feed the identical union
 * input a pain-derived record would).
 */
import type { ReactElement } from 'react'
import type { DoctorPayload } from '../types'
import { commonSafetyBannerReason, hasUnreadableSafetyField } from '../CommonSafetyBanner'

export type Lane1Status = 'URGENT' | '확인 필요' | '계산불가' | 'CLEAR' | '해당없음'

export type Lane1RegionInput = {
  /** e.g. 'lbp', 'neck' -- used only for stable ordering, never displayed. */
  key: string
  /** Short Korean label used in the "계산불가 — 목" style suffix (§1.1-#3). */
  label: string
  /** The already-rendered (or null) React element this region's SafetyPanel produced. */
  element: ReactElement | null
}

type RegionStatus = 'not_applicable' | 'unavailable' | 'clear' | 'review_required' | 'urgent_review'

function classNameOf(el: ReactElement | null): string {
  if (el == null) return ''
  const props = el.props as { className?: unknown } | null | undefined
  return typeof props?.className === 'string' ? props.className : ''
}

/**
 * Fail-closed by construction: any shape this function does not recognize
 * (a future panel refactor that renames the class, a wrong-typed element)
 * is treated as `unavailable`, never as `clear` -- an unrecognized shape
 * must never silently read as "safe" (§1.1-#2's exact concern, generalized
 * to "unknown" as well as "explicitly unavailable").
 */
function regionStatus(el: ReactElement | null): RegionStatus {
  if (el == null) return 'not_applicable'
  const cls = classNameOf(el)
  if (cls.includes('--unavailable')) return 'unavailable'
  if (cls.includes('--urgent_review')) return 'urgent_review'
  if (cls.includes('--review_required')) return 'review_required'
  if (cls.includes('--clear')) return 'clear'
  return 'unavailable'
}

export type Lane1Summary = {
  status: Lane1Status
  /** Short region labels with an unavailable computed status, in region order. */
  calcUnavailableLabels: string[]
  urgentLabels: string[]
  reviewLabels: string[]
  clearLabels: string[]
  /** True when at least one region's safety_flags.<region> is non-null for this record. */
  anyRegionApplicable: boolean
  /**
   * The common danger-banner condition this summary folded in
   * (CommonSafetyBanner.tsx) -- true whenever the top banner would show,
   * for EITHER reason below. Kept for backward compatibility with existing
   * fixtures/consumers; does not by itself imply URGENT (see
   * `flagsUnusable`/`staffCheckRequired` for which reason actually fired).
   */
  commonBannerDanger: boolean
  /**
   * 독립 검수 HIGH-1: flags 자체를 구조적으로 못 읽음(계산 자체를 신뢰할
   * 수 없음) -- `계산불가`로만 표시하고, 이것만으로 URGENT를 만들지 않는다.
   */
  flagsUnusable: boolean
  /**
   * 독립 검수 HIGH-1: flags는 읽었고 그 안의 generic staff-review 신호가
   * true -- `확인 필요`로만 표시하고, 이것만으로 URGENT를 만들지 않는다.
   */
  staffCheckRequired: boolean
  /**
   * MAJOR-2 (Phase 10 closing review): true when CommonSafetyBanner's own
   * `hasUnreadableSafetyField` fires for this record (malformed/unreadable
   * safety-relevant field, e.g. medication_use) -- a separate axis from
   * `commonBannerDanger`, folded into the union so it can force at least
   * `계산불가` without ever raising `URGENT` by itself.
   */
  unreadableSafetyField: boolean
}

/**
 * Phase 7 §1.1-#3: "계산불가 — [부위명]" -- single region names it directly,
 * multiple regions join with the same 병기 punctuation used elsewhere in
 * this shell (§2.6-3's `·`).
 */
export function formatCalcUnavailableSuffix(labels: string[]): string | null {
  if (labels.length === 0) return null
  return `계산불가 — ${labels.join(' · ')}`
}

export function computeLane1Summary(payload: DoctorPayload, regions: Lane1RegionInput[]): Lane1Summary {
  const { flagsUnusable, staffCheckRequired } = commonSafetyBannerReason(payload)
  const commonBannerDanger = flagsUnusable || staffCheckRequired
  // MAJOR-2: a third, independent axis -- "can we even read this record's
  // safety fields" is not the same question as "does the common banner's
  // own danger condition fire". Computed directly from payload.responses/
  // flags, the same inputs SafetyGlance itself reads, so this can never
  // drift from what the full-record view actually warns about.
  const unreadableSafetyField = hasUnreadableSafetyField(payload.responses, payload.flags)

  const statuses = regions.map((r) => ({ ...r, status: regionStatus(r.element) }))
  const applicable = statuses.filter((r) => r.status !== 'not_applicable')
  const calcUnavailable = applicable.filter((r) => r.status === 'unavailable')
  const urgent = applicable.filter((r) => r.status === 'urgent_review')
  const review = applicable.filter((r) => r.status === 'review_required')
  const clear = applicable.filter((r) => r.status === 'clear')

  // 독립 검수 HIGH-1: URGENT는 오직 부위 SafetyPanel 자신의 명시적
  // urgent_review 판정에서만 나온다(union, not intersection -- §1.1-#4:
  // 다른 모든 부위가 CLEAR여도 하나의 urgent_review가 여전히 URGENT를
  // 만든다). generic `staffCheckRequired`나 `flagsUnusable`은 그 자체로
  // URGENT를 만들지 않는다 -- 둘 다 "확인이 필요하다"/"계산을 신뢰할 수
  // 없다"는 신호일 뿐, 임상적 위험 판정 자체가 아니다.
  let status: Lane1Status
  if (urgent.length > 0) {
    status = 'URGENT'
  } else if (flagsUnusable || calcUnavailable.length > 0 || unreadableSafetyField) {
    // §1.1-#2 + MAJOR-2 + HIGH-1: flags 자체를 못 읽거나, 부위 계산이
    // 불가하거나, 안전 관련 필드가 손상됐으면 계산 자체를 신뢰할 수 없다
    // -- CLEAR는 절대 아니지만, 이것만으로 URGENT도 아니다. 계산불가와
    // 확인 필요가 동시에 성립할 수 있는 레코드는 항상 계산불가가 이긴다
    // ("계산을 신뢰할 수 없다"가 "일부는 확인 필요하다"보다 강한 경고).
    status = '계산불가'
  } else if (staffCheckRequired || review.length > 0) {
    status = '확인 필요'
  } else if (applicable.length === 0) {
    // §1.1-#6: "해당없음" is reserved for records with zero safety-relevant
    // region panels -- never used as a stand-in for "calc failed".
    status = '해당없음'
  } else {
    status = 'CLEAR'
  }

  return {
    status,
    calcUnavailableLabels: calcUnavailable.map((r) => r.label),
    urgentLabels: urgent.map((r) => r.label),
    reviewLabels: review.map((r) => r.label),
    clearLabels: clear.map((r) => r.label),
    anyRegionApplicable: applicable.length > 0,
    commonBannerDanger,
    flagsUnusable,
    staffCheckRequired,
    unreadableSafetyField,
  }
}

/**
 * The 좌측 요약 "관련 부위" list only ever needs to name regions that are
 * NOT plain CLEAR -- ordered so urgent regions sort first. Phase 7 §1.1-#17
 * (delta C-2) requires the truncation below to never let a lower-severity
 * region crowd an URGENT one out of the visible slots; putting urgent
 * first here is what makes that guarantee hold by construction rather than
 * by a separate priority check at truncation time.
 */
export function relatedRegionLabels(summary: Lane1Summary): string[] {
  return [...summary.urgentLabels, ...summary.reviewLabels, ...summary.calcUnavailableLabels]
}

/**
 * Phase 7 §3.2 좌측 요약 절단 규칙: 최대 2개 부위 + `외 N`(3번째부터). Callers
 * MUST pass an already priority-ordered list (see `relatedRegionLabels`)
 * -- this function only slices, it does not itself know which region is
 * more severe.
 */
export function truncateRegionLabels(labels: string[], max = 2): { shown: string[]; overflowCount: number } {
  if (labels.length <= max) return { shown: labels, overflowCount: 0 }
  return { shown: labels.slice(0, max), overflowCount: labels.length - max }
}
