/**
 * Stable public follow-up URL contract (BizM batch).
 *
 * Before this file existed, DoctorView.tsx's own `patientFollowUpLink()`
 * built the one-time follow-up URL from `window.location.origin` +
 * `window.location.pathname` -- correct enough for a QR code or a copy-link
 * button opened from whatever host happens to be running DoctorView at the
 * time, but wrong for a real Kakao Alimtalk template: the URL's BASE
 * (domain + path) must stay fixed and known in advance for BizM's own
 * template-review/approval process, independent of which host/sub-path a
 * doctor's browser happens to be on that day (local LAN server, a GitHub
 * Pages preview under `/doctor-pr/`, etc. -- see vite.config.ts's `base`
 * comment for the full list of hosts this app is actually deployed under).
 * (An earlier version of this comment additionally claimed the button URL
 * is registered once, statically, and never sent per-request -- that
 * specific claim turned out to be wrong; see bizmAdapter.js's header on the
 * per-request `button1.url_mobile`/`url_pc` construction. The stable-BASE
 * requirement this file solves is unaffected either way: BizM's template
 * review still needs a fixed, known domain+path shape, whether the final
 * per-send URL is built by substituting into a static template or
 * constructed fresh in a button object each time.)
 *
 * `VITE_SAMINDANG_PUBLIC_FOLLOWUP_BASE_URL` is the one explicit, deliberate
 * source of truth for that base -- set once, at build time, to whatever
 * host BizM's real template was actually reviewed/approved against (see
 * bizmAdapter.js's header for the current, evidence-graded understanding of
 * exactly how the per-send button URL reaches BizM). Every caller that
 * needs to build or display a real patient-facing follow-up link
 * (copy-link, QR code, the Alimtalk/SMS message body itself) goes through
 * `buildPublicFollowUpLink()` here -- never re-derives the base itself --
 * so there is exactly one place that knows this URL's shape, matching this
 * codebase's existing one-canonical-builder convention (see
 * MessagingPanel.tsx's own doc comment on why `link` is a prop, not rebuilt
 * locally).
 *
 * Fail-closed by design: a production build (anything that is not Vite's
 * own dev server, `import.meta.env.DEV`) with the env var unset or blank
 * returns `null` rather than silently falling back to whatever host
 * happens to be serving the page -- a wrong-but-plausible-looking link is
 * worse than an honest "설정되지 않음" state, since the wrong link would
 * still LOOK like it worked right up until a patient actually taps it, and
 * would silently diverge from whatever base BizM's own template was
 * actually reviewed/approved against.
 * import.meta.env.DEV is Vite's own "this is the dev server" flag (true
 * only for `vite`/`npm run dev`, false for any built artifact -- see
 * vite.config.ts), so the origin+pathname fallback below can never leak
 * into a real deployed build, only a developer's own local session.
 */
const CONFIGURED_BASE = import.meta.env.VITE_SAMINDANG_PUBLIC_FOLLOWUP_BASE_URL as string | undefined

/** Ensures exactly one trailing slash, so `${base}#follow-up=...` never
 *  produces a double slash or a missing one depending on how the env var
 *  happened to be written. */
function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/**
 * Returns the configured public follow-up base URL (trailing slash
 * guaranteed), the dev-server-only same-origin fallback, or `null` when
 * neither applies -- callers MUST handle `null` explicitly (show an honest
 * "설정되지 않음" state), never substitute a guess of their own.
 */
export function resolvePublicFollowUpBaseUrl(): string | null {
  if (typeof CONFIGURED_BASE === 'string' && CONFIGURED_BASE.trim() !== '') {
    return withTrailingSlash(CONFIGURED_BASE.trim())
  }
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`
  }
  return null
}

/** True exactly when `resolvePublicFollowUpBaseUrl()` would return a real
 *  (non-null) base -- lets a caller render a warning state before ever
 *  trying to build a link, rather than reacting to a null link string. */
export function isPublicFollowUpBaseConfigured(): boolean {
  return resolvePublicFollowUpBaseUrl() !== null
}

/**
 * Builds the one-time patient-facing follow-up URL for a given raw token.
 * Preserves the existing `#follow-up=<token>` route contract App.tsx's own
 * `parseFollowUpToken()` already parses (see src/App.tsx) -- only the base
 * origin/path this fragment is appended to has changed, never the fragment
 * shape itself. Returns `null` when the public base itself is not
 * configured (see resolvePublicFollowUpBaseUrl) -- callers must render an
 * explicit "not configured" state rather than ever falling back to
 * building a link from the current page's own origin in that case.
 */
export function buildPublicFollowUpLink(token: string): string | null {
  const base = resolvePublicFollowUpBaseUrl()
  if (base === null) return null
  return `${base}#follow-up=${token}`
}

/**
 * 플로우 정렬 4/5: the patient's READ-ONLY care-plan page (`#care-plan=<token>`,
 * see src/screens/CarePlanScreen.tsx). Same base-URL resolution as the
 * follow-up link -- one place knows where the public SPA lives -- and the
 * same null-when-unconfigured contract, so the doctor card can refuse to
 * show a link that would not open on a phone.
 */
export function buildPublicCarePlanLink(token: string): string | null {
  const base = resolvePublicFollowUpBaseUrl()
  if (base === null) return null
  return `${base}#care-plan=${token}`
}
