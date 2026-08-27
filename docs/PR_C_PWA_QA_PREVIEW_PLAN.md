# PR C — PWA standalone mode + formal QA preview: implementation-ready plan

Status: **planning only, not started**. No code in this PR.

Base: branch from merged `main` once PR #23 lands. Suggested branch name:
`claude/feat-pwa-qa-preview`.

## 1. What exists today (verified by direct source inspection)

- No manifest, no service worker, no PWA-related meta tags anywhere in
  `index.html` or `src/` (confirmed via search across the repo).
- `App.tsx`/`vite.config.ts` already have a `VITE_PREVIEW_MODE` env-var
  convention (`.github/workflows/pages-preview.yml` sets it,
  `PreviewBanner.tsx` reads `import.meta.env.VITE_PREVIEW_MODE !== 'true'`
  to no-op in production). This is the natural pattern to extend for a
  `#qa` synthetic-scenario route -- same "opt-in via explicit env var,
  completely inert otherwise" shape.
- `src/lib/serverClient.ts`'s `isServerConfigured()` already gates all
  real network submission on `VITE_SAMINDANG_SERVER_URL` being set --
  the existing preview workflow already leaves this empty for a
  read-only, NO-PHI demo build. PR C's QA route should reuse this exact
  mechanism, not invent a second one.
- The PR-23-specific preview workflow (`.github/workflows/
  pr-23-preview.yml`, shipped in this same PR #23) already demonstrates
  the "mirror the live root, add a sibling sub-path, never overwrite
  production" pattern GitHub Pages' single-artifact-per-deploy model
  requires. PR C's formal QA route is simpler than that (it's a route
  within the SAME build, not a separate deploy), so it does not need
  this mirroring trick -- just a client-side route guard.

## 2. PWA (manifest, standalone, icons, caching)

### 2.1 Manifest + standalone

- `public/manifest.webmanifest` (new): `name`/`short_name` "삼인당 상세문진",
  `start_url` and `scope` **must** account for the two different deploy
  bases this repo already has (`vite.config.ts`: `/` for normal
  prod/dev, `/Samindang/` for the `ghpages` preview mode, override-able
  via `VITE_PAGES_BASE_PATH`) -- the manifest's `start_url`/`scope` need
  to be generated (or templated) per-build, not hardcoded, or the PWA
  will silently break on the GitHub Pages preview specifically. Simplest
  approach: generate `manifest.webmanifest` from a small build-time
  step (or Vite plugin) that reads the same base-path resolution
  `vite.config.ts` already computes, rather than a static public file.
- `display: "standalone"`, `theme_color`/`background_color` matching
  `index.html`'s existing `<meta name="theme-color" content="#FAFAF7">`
  and the `--bg`/`--primary` CSS tokens.
- `<link rel="manifest">` + `apple-touch-icon`/`theme-color` meta tags
  added to `index.html`.

### 2.2 Icons

- Local only (repo policy already implicit in this codebase -- no
  remote asset dependencies anywhere in `src/`, e.g. BodyMap's SVG
  silhouette is inline specifically to avoid a remote-asset dependency).
  New `public/icons/` with the standard PWA size set (192x192, 512x512,
  maskable variant). Needs actual artwork -- **this is a design asset
  dependency, same category of blocker as PR #23's body-map PNGs**: flag
  it early rather than discovering a missing/placeholder icon late.

### 2.3 Caching strategy -- explicit, conservative

Per the governing task's own invariant: **never casually cache PHI/API/
patient/doctor data.** Concretely:

- Service worker (Workbox or hand-written, decide at implementation time
  based on bundle-size budget) caches **only the static app shell**:
  built JS/CSS/HTML/icons. Never registers a cache route for anything
  under the local handoff server's API paths (`server/` in this repo,
  LAN-only per `docs/RUNBOOK_LOCAL_HANDOFF.md`) or any patient-data
  fetch/submit call.
- Explicit stale-update strategy: **network-first for the HTML shell**
  (so a clinic tablet always gets the latest deployed build when online,
  never stuck on a stale cached version with an old clinical spec),
  **cache-first for hashed JS/CSS assets** (safe -- Vite's content-hash
  filenames mean a stale cache entry for an old hash is simply never
  requested again once a new build ships). This mirrors the standard
  Vite PWA plugin default, not a novel scheme.
- No background sync, no offline submission queueing. This app requires
  the local handoff server for real submission; a patient's answers
  should never be silently queued client-side across a network outage
  without staff visibility. Explicitly **not** in scope for PR C unless
  a human decides otherwise later -- this is a plausible confusion point
  ("PWA" often implies full offline-first) worth flagging up front.

### 2.4 Build-SHA indicator

Already partially exists: `PreviewBanner.tsx` already reads
`VITE_PREVIEW_SHA` (added in PR #23 for the `pr-23-preview.yml` workflow).
PR C's "build SHA indicator" requirement can likely reuse this exact
mechanism/env var rather than inventing a second one -- worth confirming
at implementation time whether it should show unconditionally (not just
in preview mode) somewhere low-visibility (e.g. doctor-side footer) for
production support/debugging purposes.

## 3. Formal QA preview (`#qa` route)

### 3.1 Route shape

- A `#qa` hash route (no server-side routing needed, matches this SPA's
  existing all-client-side navigation) that renders a **scenario
  selector** screen instead of `StartScreen`.
- Gated the same way `PreviewBanner` already is: only meaningful when
  `VITE_PREVIEW_MODE === 'true'` (or a new, more specific
  `VITE_QA_MODE` if the two need to be independently toggleable --
  decide at implementation time; reusing the existing flag is simpler
  and matches "explicit opt-in env var" precedent unless there's a
  concrete reason to separate them, e.g. wanting the QA route available
  in a build that isn't otherwise preview-banner'd).

### 3.2 Scenario selector

- Presents a list of synthetic (no real PHI) starting scenarios --
  reuse the EXACT fixture shape already defined in `src/doctor/
  fixtures.ts`/`ankleFootFixtures.ts` for the doctor-side testing
  pattern, but for the PATIENT side this means synthetic `Responses`
  objects that seed `App.tsx`'s state at a specific point (e.g. "patient
  mid-LBP-module, chronic onset, about to see the decade selector") --
  useful for exactly the kind of targeted screen QA this task's Phase 3
  needed to do by hand-scripting a full click-through every time.
- Each scenario needs: a human-readable label, the seed `Responses`
  object (or a `phase`/`currentId` override), and ideally an "expected
  route" annotation (what screen this should land on) so the QA view can
  self-check and flag drift if a coreSpec.ts routing change silently
  changes where a scenario lands -- this doubles as a lightweight,
  visual companion to the existing `tests/integration.spec.mjs` routing
  assertions, not a replacement for them.

### 3.3 Patient/doctor/test views

The governing task's phrase "patient/doctor/test/expected-route views"
suggests four sub-modes within `#qa`:
- **patient**: renders the real `App.tsx` patient flow seeded from a
  scenario (what this task manually did via Playwright driving during
  PR #23's real-device QA -- `#qa` would make that repeatable without a
  headless-browser script).
- **doctor**: renders `DoctorView` against the scenario's resulting
  payload (reuses `src/doctor/fixtures.ts`'s existing pattern almost
  directly).
- **test**: a raw JSON/data dump of the scenario's `Responses` +
  computed flags, for debugging without needing devtools.
- **expected-route**: shows the scenario's declared expected screen
  next to the actual computed one (routing truth-table style), flags a
  mismatch visually.

This is the most open-ended part of PR C and would benefit from one
round of UX sketching (could reuse the `design` skill/Claude Design
canvas for a quick mockup) before implementation, since it's a new
internal tool with no existing precedent in this codebase to extract
from (unlike PR B, which is mostly extraction of existing panels).

## 4. Reusable components/patterns already available

- `VITE_PREVIEW_MODE` env-var gating pattern (`PreviewBanner.tsx`,
  `vite.config.ts`) -- reuse directly for `#qa` gating.
- `isServerConfigured()` (`src/lib/serverClient.ts`) -- reuse to keep
  `#qa` scenarios from ever attempting a real network submission.
- `src/doctor/fixtures.ts` -- pattern (not the fixtures themselves) for
  how this repo already represents synthetic full-record test data;
  the new patient-side scenario objects should follow the same shape
  conventions for consistency.
- `.github/workflows/pages-preview.yml` / `pr-23-preview.yml` -- existing
  NO-PHI preview-deploy conventions (`VITE_SAMINDANG_SERVER_URL` left
  empty) -- PR C's `#qa` route runs inside the SAME build these
  workflows already produce, so no new deploy infrastructure is needed
  unless the manifest's base-path templating (§2.1) requires a build
  step change.

## 5. Tests needed

- `tests/preview-build.spec.mjs` (existing) extended: manifest exists in
  the built output, references valid local icon paths (no remote URLs),
  `start_url`/`scope` match the build's actual base path for both normal
  and `ghpages` modes.
- New source-level guard: the service worker's cache-route list never
  matches the local handoff server's API path pattern or any submission
  endpoint (regex/string-absence check against the SW source, same style
  as this repo's existing "adapter never reads AF_00" source-level
  guards in `tests/ankle-foot.spec.mjs`).
- New `tests/qa-route.spec.mjs` (or folded into `patient-flow.spec.mjs`):
  each scenario's seed data actually produces the declared expected
  route when run through the real `visibleQuestions()`/routing functions
  from `coreSpec.ts` -- this is where the "expected-route" self-check
  becomes a real automated regression, not just a manual UI feature.
- Regression: `#qa` route (and manifest/SW registration) is a complete
  no-op when `VITE_PREVIEW_MODE`/`VITE_QA_MODE` is unset -- production
  build must be byte-identical in behavior to before PR C for any
  non-QA, non-preview build.

## 6. Estimated implementation order

1. Manifest + icons + `index.html` meta tags (no service worker yet) --
   lowest-risk, immediately demoable, unblocks getting the icon design
   asset dependency resolved early.
2. Service worker with the conservative shell-only caching strategy
   (§2.3), tested specifically for "never caches an API/PHI path."
3. `#qa` route: scenario selector + patient/test views first (reuses
   existing `App.tsx` almost directly).
4. `#qa` doctor view (reuses `fixtures.ts` pattern).
5. `#qa` expected-route self-check + its backing automated test (§5).
6. Full regression + FROZEN diff check (PR C should also touch zero
   `src/spec/*Logic.ts`/`*Adapter.ts` files).
