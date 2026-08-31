/**
 * 13차 독립 리뷰 HIGH-2: `deserializeWorkspaceState`/`deserializeVisitWorkspaceState`
 * (persistence.ts/visitWorkspace.ts) validate CONTAINERS only (`isArray`/
 * `isRecord`) — an array element or a nested record's own leaf can still be
 * wrong-typed. `server/store.js` stores the PUT body verbatim
 * (`record.workspace = workspace`, no schema validation), so a legacy/
 * hand-crafted record can have e.g. `painFollowUpTargets[0].baseline = 7`
 * (a number) -- the previous shallow spread/array-passthrough let that
 * reach `emrPreview.ts`'s `.trim()` and crash the ENTIRE clinical record
 * view (DoctorRecordErrorBoundary wraps CommonSafetyBanner and every
 * SafetyPanel too, not just this one card). `deserializeWorkspaceState`'s
 * own doc comment already promises "Never throws … degrades to
 * emptyWorkspaceState() field-by-field" — this module makes that promise
 * true down to every leaf, not just the top-level field.
 *
 * `sanitizeShape` walks a known-good `template` value and, for each key,
 * only copies the raw value across when its runtime type actually matches
 * the template's (string keeps string, `string | null` keeps string-or-
 * null, nested records recurse, arrays are handled by the caller via
 * `sanitizeArray` since a template's own array field carries no per-element
 * shape to validate against). Anything that doesn't match keeps the
 * template's default -- never crashes, never invents a value.
 */
export function isSanitizeRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function sanitizeShape<T extends Record<string, unknown>>(template: T, raw: unknown): T {
  if (!isSanitizeRecord(raw)) return template
  const result = { ...template }
  for (const key of Object.keys(template) as (keyof T)[]) {
    const rawVal = raw[key as string]
    if (rawVal === undefined) continue
    const templateVal = template[key]
    if (templateVal === null) {
      // `string | null` / `number | null` fields (recordedAt, afterVisitCount, ...).
      if (rawVal === null || typeof rawVal === 'string' || typeof rawVal === 'number') {
        result[key] = rawVal as T[keyof T]
      }
      continue
    }
    if (Array.isArray(templateVal)) {
      // Container-only guard here -- callers that need element-level
      // validation for a specific array field use sanitizeArray directly.
      if (Array.isArray(rawVal)) result[key] = rawVal as T[keyof T]
      continue
    }
    if (isSanitizeRecord(templateVal)) {
      if (isSanitizeRecord(rawVal)) result[key] = sanitizeShape(templateVal, rawVal) as T[keyof T]
      continue
    }
    if (typeof templateVal === typeof rawVal) {
      result[key] = rawVal as T[keyof T]
    }
  }
  return result
}

/** Sanitizes every element of an array field against a known element template -- never throws, drops nothing (a bad element becomes the template default, not skipped, so array length/order is preserved). */
export function sanitizeArray<T extends Record<string, unknown>>(template: T, raw: unknown): T[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => sanitizeShape(template, item))
}
