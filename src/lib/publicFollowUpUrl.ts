/**
 * Stable public follow-up URL contract (BizM batch).
 *
 * Before this file existed, DoctorView.tsx's own `patientFollowUpLink()`
 * built the one-time follow-up URL from `window.location.origin` +
 * `window.location.pathname` -- correct enough for a QR code or a copy-link
 * button opened from whatever host happens to be running DoctorView at the
 * time, but wrong for a real Kakao Alimtalk template: BizM's template
 * button URL is registered ONCE, at template-approval time, and can never
 * be silently changed by which host/sub-path a doctor's browser happens to
 * be on that day (local LAN server, a GitHub Pages preview under
 * `/doctor-pr/`, etc. -- see vite.config.ts's `base` comment for the full
 * list of hosts this app is actually deployed under).
 *
 * `VITE_SAMINDANG_PUBLIC_FOLLOWUP_BASE_URL` is the one explicit, deliberate
 * source of truth for that base -- set once, at build time, to whatever
 * host BizM's real template button URL was actually registered against
 * (see docs in bizmAdapter.js's header on the `#{followup_token}`-in-URL
 * button pattern). Every caller that needs to build or display a real
 * patient-facing follow-up link (copy-link, QR code, the Alimtalk/SMS
 * message body itself) goes through `buildPublicFollowUpLink()` here --
 * never re-derives the base itself -- so there is exactly one place that
 * knows this URL's shape, matching this codebase's existing
 * one-canonical-builder convention (see MessagingPanel.tsx's own doc
 * comment on why `link` is a prop, not rebuilt locally).
 *
 * Fail-closed by design: a production build (anything that is not Vite's
 * own dev server, `import.meta.env.DEV`) with the env var unset or blank
 * returns `null` rather than silently falling back to whatever host
 * happens to be serving the page -- a wrong-but-plausible-looking link is
 * worse than an honest "설정되지 않음" state, since the wrong link would
 * still LOOK like it worked right up until a patient actually taps it (or
 * BizM's already-registered template button, which points at the ORIGINAL
 * configured base regardless of what this build's `window.location` says,
 * silently diverges from what this build's copy-link/QR paths show).
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
