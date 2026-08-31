/**
 * Core Reduction P2 — 레인1 요약 상태 union (Phase 5 Synthesis v1.2 §2.2,
 * Phase 7 UI spec §1.1/§6.1).
 *
 * `lane1Summary = commonBannerCondition ∪ (⋃ perRegionPanel.calcUnavailable)`
 * -- both halves MUST be wired or this silently regresses to the exact
 * fail-open class Phase 6 flagged (감시 리스크 1): a per-region
 * calc-unavailable panel alone must never let the summary read CLEAR, and
 * the common danger banner alone must be able to raise URGENT even when
 * every region panel is CLEAR.
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
import { commonSafetyBannerActive } from '../CommonSafetyBanner'

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
  /** The common danger-banner condition this summary folded in (CommonSafetyBanner.tsx). */
  commonBannerDanger: boolean
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
  const commonBannerDanger = commonSafetyBannerActive(payload)

  const statuses = regions.map((r) => ({ ...r, status: regionStatus(r.element) }))
  const applicable = statuses.filter((r) => r.status !== 'not_applicable')
  const calcUnavailable = applicable.filter((r) => r.status === 'unavailable')
  const urgent = applicable.filter((r) => r.status === 'urgent_review')
  const review = applicable.filter((r) => r.status === 'review_required')
  const clear = applicable.filter((r) => r.status === 'clear')

  // Union, not intersection (§1.1-#4): the common banner and ANY urgent
  // region can each independently raise the summary to URGENT, regardless
  // of what every other region reads.
  let status: Lane1Status
  if (commonBannerDanger || urgent.length > 0) {
    status = 'URGENT'
  } else if (calcUnavailable.length > 0) {
    // §1.1-#2: a single calc-unavailable region blocks CLEAR even when the
    // common banner is quiet and every other region is CLEAR.
    status = '계산불가'
  } else if (review.length > 0) {
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
