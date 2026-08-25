/**
 * Age-in-years helper for LBP_V1's age-dependent safety modifiers
 * (lbp_fracture_risk_age_modifier / lbp_malignancy_risk_age_modifier /
 * lbp_inflammatory_eligible / treatment_safety_status's 10-55 band). No
 * such helper existed in the app before this module -- see
 * LBP_INTEGRATION_PLAN_DRAFT.md §3.
 *
 * Reads Core's BIRTH_01 ('YYYYMMDD' string) / BIRTH_02
 * ('solar'|'lunar'|'unknown').
 *
 * KNOWN LIMITATION (documented, not silent): for `birthCalendarType ===
 * 'lunar'`, this treats the YYYYMMDD digits as if they were already a
 * Gregorian date rather than converting via the `manseryeok` lunar/solar
 * conversion the saju module uses elsewhere in this app. This can be off by
 * up to ~1 month. None of the four places patient_age feeds into LBP logic
 * are hard disease-safety locks (fracture/malignancy-risk are
 * clinician-facing context only; inflammatory_eligible is a CONSIDER-level
 * clinical flag, not a lock; the pregnancy 10-55 band only matters when
 * pregnancy_status itself is MISSING, an edge case) -- so this imprecision
 * cannot flip a CLEAR/REVIEW_REQUIRED/URGENT_REVIEW disease-safety outcome.
 * TODO(LBP_V2): reuse the saju module's manseryeok-based lunar conversion
 * here instead, once its exact export shape is confirmed, for exactness.
 */

const parseIsoLikeBirthDate = (raw: string): { year: number; month: number; day: number } | null => {
  if (!/^\d{8}$/.test(raw)) return null
  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function ageFromBirthDate(
  birthDateRaw: string | null | undefined,
  birthCalendarType: 'solar' | 'lunar' | 'unknown' | null | undefined,
  asOf: Date = new Date(),
): number | undefined {
  if (typeof birthDateRaw !== 'string' || birthCalendarType === 'unknown' || birthCalendarType == null) {
    return undefined
  }
  const parsed = parseIsoLikeBirthDate(birthDateRaw)
  if (!parsed) return undefined

  let age = asOf.getFullYear() - parsed.year
  const hasHadBirthdayThisYear =
    asOf.getMonth() + 1 > parsed.month || (asOf.getMonth() + 1 === parsed.month && asOf.getDate() >= parsed.day)
  if (!hasHadBirthdayThisYear) age -= 1

  return age >= 0 ? age : undefined
}
