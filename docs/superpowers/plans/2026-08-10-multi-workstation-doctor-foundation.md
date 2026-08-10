# Multi-Workstation Doctor Foundation v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Doctor "current visit" concept from one global in-memory value to one per `workstation_id`, so Doctor A (A PC) and Doctor B (B PC, the central server) can each have an independent active visit, while keeping every existing single-workstation caller working unchanged.

**Architecture:** `server/activeVisit.js` moves from a single `let activeVisit` to a `Map<workstation_id, entry>` keyed by a validated workstation id (default key `"default"` when omitted, preserving today's behavior byte-for-byte for callers that never pass one). `GET /api/current-visit` moves from the stricter `isLocalOnly` (loopback-only, no token, no CORS) guard to the same `requireDoctor()` guard (loopback OR `x-doctor-token`) plus the doctor CORS/origin-allowlist already used by every other doctor route — this is what lets A PC's browser reach B PC's current-visit over LAN. The Doctor React UI gets a `workstation_id` stored in `localStorage`, chosen from a preset dropdown on first run (typo-proofing), shown as a small badge, and gates visit-activation calls until set.

**Tech Stack:** Node `node:http` server (no framework), plain-`assert` Node test script (`tests/server.spec.mjs`), React + TypeScript (Vite) for Doctor UI, esbuild-bundled SSR test (`tests/doctor.spec.mjs`).

## Global Constraints

- workstation_id format: `/^[A-Za-z0-9_-]{1,32}$/` — enforced both server-side (400 on violation) and client-side (setup UI blocks save).
- No PII (patient name, doctor real name, email, phone) may ever be placed in a workstation_id.
- No hardcoded `DOCTOR-A`/`DOCTOR-B` in server logic — only as the *default preset list* on the client, itself overridable via `VITE_SAMINDANG_WORKSTATIONS`.
- Omitted `workstation_id` on any current-visit endpoint must behave exactly as today (single global visit), via an internal `"default"` key.
- Do not touch: A PC Recorder code, recording/transcript/structured-output logic, LLM code, 명리 Rule Engine, EMR/cloud integration, name-based patient matching, submissions/visits security model (beyond the one deliberate current-visit GET change in Task 2), Patient Tablet UI.
- `npm run test:all`, `npx tsc -b`, `npx vite build` must all pass before the final commit.

---

## Task 1: Server storage layer — workstation-keyed `activeVisit.js`

**Files:**
- Modify: `server/activeVisit.js` (full rewrite of the storage internals, same public shape per entry)
- Test: `tests/server.spec.mjs` (new unit-level block, see Step 3)

**Interfaces:**
- Produces (consumed by Task 2 and Task 3):
  - `export function isValidWorkstationId(id: unknown): boolean`
  - `export const DEFAULT_WORKSTATION_ID: string` (value `"default"`)
  - `export function activateVisit(visit: {id: string, patient_id: string, submission_id: string|null}, workstationId?: string): {patient_id, visit_id, submission_id, active_since, last_touched}`
  - `export function clearActiveVisit(workstationId?: string): void`
  - `export function getActiveVisit(workstationId?: string): {patient_id, visit_id, submission_id, active_since, last_touched} | null`
  - `export function __setLastTouchedForTest(iso: string, workstationId?: string): void`

- [ ] **Step 1: Rewrite `server/activeVisit.js`**

Replace the entire file with:

```js
// "지금 진료실에 누가 있는가" — workstation(원장 PC/브라우저)별로 프로세스
// 메모리에만 존재하는 값이다. 디스크에 절대 저장하지 않는다 — 서버 재시작은
// 항상 이 값을 모두 비운다(이게 의도된 동작이다: 재시작 후 예전 활성 방문이
// 되살아나면 안 된다).
//
// 여러 원장 workstation(예: DOCTOR-A, DOCTOR-B)이 동시에 서로 다른 환자를
// 진료 중일 수 있으므로, 단일 값이 아니라 workstation_id로 키가 나뉜 맵이다.
// workstation_id를 생략한 호출은 DEFAULT_WORKSTATION_ID로 취급한다 — 기존
// single-workstation 호출/테스트가 그대로 동작하기 위한 하위호환 경로다.
//
// 이것은 ClinicAI 같은 미래의 외부 녹음/기록 시스템(그리고 이제는 다른 원장
// workstation의 Doctor 화면)이 "지금 이 workstation에서 진료 중인 환자가
// 누구인지" 폴링할 수 있게 하는 연결점(server/index.js의
// GET /api/current-visit)일 뿐이다 — 녹음/전사 관련 로직은 이 저장소 어디에도
// 없다.
const activeVisits = new Map() // workstation_id -> entry

export const DEFAULT_WORKSTATION_ID = 'default'

const DEFAULT_TTL_MINUTES = 30

// 환자 식별정보(이름/전화 등)를 절대 담지 않는다 — 형식만 검증한다.
const WORKSTATION_ID_RE = /^[A-Za-z0-9_-]{1,32}$/

export function isValidWorkstationId(id) {
  return typeof id === 'string' && WORKSTATION_ID_RE.test(id)
}

function resolveWorkstationId(workstationId) {
  return workstationId === undefined || workstationId === null || workstationId === ''
    ? DEFAULT_WORKSTATION_ID
    : workstationId
}

function ttlMinutes() {
  const raw = Number(process.env.SAMINDANG_ACTIVE_VISIT_TTL_MINUTES ?? DEFAULT_TTL_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES
}

/**
 * @param {{ id: string, patient_id: string, submission_id: string|null }} visit
 * @param {string} [workstationId]
 */
export function activateVisit(visit, workstationId) {
  const key = resolveWorkstationId(workstationId)
  const iso = new Date().toISOString()
  const entry = {
    patient_id: visit.patient_id,
    visit_id: visit.id,
    submission_id: visit.submission_id,
    active_since: iso,
    last_touched: iso,
  }
  activeVisits.set(key, entry)
  return entry
}

export function clearActiveVisit(workstationId) {
  activeVisits.delete(resolveWorkstationId(workstationId))
}

// 만료를 읽을 때마다(lazy) 확인한다 — setInterval을 따로 두지 않는다.
// 이유: 진료 하나가 TTL 안에 끝나는 게 보통이고, 폴링 주기가 짧아 다음
// 읽기에서 바로 만료가 반영되면 충분하다. 실시간 타이머보다 테스트하기도 더
// 결정적이다(실제 시간 대신 last_touched 값만 조작하면 됨). 각 workstation의
// TTL은 서로 완전히 독립이다 — Map 키가 다르므로 한 workstation의 만료가
// 다른 workstation의 entry에 영향을 줄 수 없다.
//
// ponytail: last_touched는 활성화 시점 이후로 갱신되지 않는다(읽기가 TTL을
// 연장하지 않음) — 진료가 TTL(기본 30분)보다 길어지면 만료된다. 필요해지면
// "터치"(heartbeat) 엔드포인트를 추가한다.
export function getActiveVisit(workstationId) {
  const key = resolveWorkstationId(workstationId)
  const entry = activeVisits.get(key)
  if (!entry) return null
  const ageMs = Date.now() - new Date(entry.last_touched).getTime()
  if (ageMs > ttlMinutes() * 60 * 1000) {
    activeVisits.delete(key)
    return null
  }
  return entry
}

// 테스트 전용 훅: 실제 타이머 없이 TTL 만료를 결정적으로 재현하기 위해
// last_touched를 과거로 되돌린다. production 코드 경로에서는 절대 호출되지
// 않는다 — server/index.js는 이 함수를 import하지 않는다.
export function __setLastTouchedForTest(iso, workstationId) {
  const entry = activeVisits.get(resolveWorkstationId(workstationId))
  if (entry) entry.last_touched = iso
}
```

- [ ] **Step 2: Run the existing server suite to confirm nothing else breaks yet**

Run: `npm run test:server`
Expected: Several FAILs — `server/index.js` still imports `isLocalOnly`-based GET logic and calls `activateVisit(visit)`/`getActiveVisit()`/`clearActiveVisit()` with the old (still-compatible) no-arg signatures, so most existing assertions should still PASS since omitted `workstationId` resolves to `"default"`. Confirm the only failures are unrelated to this file (there should be none yet — Task 1 alone must not regress anything, since the public call sites in `server/index.js` haven't changed and default-key behavior matches old global behavior exactly).

- [ ] **Step 3: Add workstation-id validation unit tests to `tests/server.spec.mjs`**

Add this import at the top of `tests/server.spec.mjs` (alongside the existing `__setLastTouchedForTest` import):

```js
import { __setLastTouchedForTest, isValidWorkstationId } from '../server/activeVisit.js'
```

Add this block right after the existing `/* ---------------- isOriginAllowedForDoctor (unit-level) ---------------- */` block (before the final `console.log(...)` line, i.e. just before line 1042 in the current file):

```js
  /* ---------------- isValidWorkstationId (unit-level) ---------------- */
  assert('workstation id guard: simple id -> valid', isValidWorkstationId('DOCTOR-A') === true)
  assert('workstation id guard: underscore/digits -> valid', isValidWorkstationId('doctor_2') === true)
  assert('workstation id guard: empty string -> invalid', isValidWorkstationId('') === false)
  assert('workstation id guard: contains space -> invalid', isValidWorkstationId('DOCTOR A') === false)
  assert('workstation id guard: contains slash (path-traversal-ish) -> invalid', isValidWorkstationId('a/b') === false)
  assert('workstation id guard: contains dot-dot -> invalid', isValidWorkstationId('..') === false)
  assert('workstation id guard: 33 chars (over limit) -> invalid', isValidWorkstationId('a'.repeat(33)) === false)
  assert('workstation id guard: 32 chars (at limit) -> valid', isValidWorkstationId('a'.repeat(32)) === true)
  assert('workstation id guard: non-string -> invalid', isValidWorkstationId(123) === false)
  assert('workstation id guard: undefined -> invalid', isValidWorkstationId(undefined) === false)
```

- [ ] **Step 4: Run tests to verify the new assertions pass**

Run: `npm run test:server`
Expected: PASS, including all ten new `workstation id guard:` assertions.

- [ ] **Step 5: Commit**

```bash
git add server/activeVisit.js tests/server.spec.mjs
git commit -m "feat: key active visit storage by workstation_id"
```

---

## Task 2: Server routes — wire `workstation_id` through the API, extend LAN reach for GET current-visit

**Files:**
- Modify: `server/index.js:13-14, 132-150, 277-391`
- Modify: `server/auth.js` (remove now-unused `isLocalOnly`)

**Interfaces:**
- Consumes: `isValidWorkstationId`, `DEFAULT_WORKSTATION_ID`, `activateVisit(visit, workstationId)`, `clearActiveVisit(workstationId)`, `getActiveVisit(workstationId)` from Task 1.
- Produces (consumed by Task 3 tests and Task 4 client): the three current-visit endpoints below, all workstation-aware, all under the same `requireDoctor()` + CORS/origin-allowlist guard as every other doctor route.

```
GET  /api/current-visit?workstation_id=<id>            (workstation_id optional -> "default")
  -> 200 {active:true, workstation_id, patient_id, visit_id, submission_id, active_since}
  -> 200 {active:false, workstation_id}
  -> 400 {error:'invalid workstation_id'}   (workstation_id present but malformed)
  -> 403 {error:'forbidden'}                (not requireDoctor() / bad origin)

POST /api/visits/:id/activate    body: { workstation_id?: string }
  -> 200 {active:true, workstation_id, patient_id, visit_id, submission_id, active_since}
  -> 400 {error:'invalid workstation_id'}
  -> 404 {error:'not found'}                (unknown visit id, unchanged)
  -> 403 {error:'forbidden'}

POST /api/current-visit/clear    body: { workstation_id?: string }
  -> 200 {ok:true, workstation_id}
  -> 400 {error:'invalid workstation_id'}
  -> 403 {error:'forbidden'}
```

**Why GET current-visit's guard changes (read before implementing):** today `GET /api/current-visit` uses `isLocalOnly` — loopback-only, deliberately *stricter* than the other doctor routes, with a code comment saying it must never be weakened (see `server/auth.js:38-42` currently). That invariant assumed a single-PC deployment where only a local process (future ClinicAI) ever reads it. Multi-workstation breaks that assumption: A PC's Doctor browser must read B PC's current-visit over LAN, which is not loopback from B's point of view. The approved design (see `docs/superpowers/specs/2026-08-10-multi-workstation-doctor-foundation-design.md` §5) is to fold this route into the existing `requireDoctor()` + origin-allowlist model — the same model already trusted for submissions/visits — rather than inventing a new, weaker mechanism. `isLocalOnly` becomes dead code and is removed.

- [ ] **Step 1: Remove `isLocalOnly` from `server/auth.js`**

Delete this block (currently the last block in the file):

```js
// GET /api/current-visit는 ClinicAI 같은 미래의 로컬 프로세스/스크립트 전용
// 연결점이다 — 원장 라우트보다 더 엄격하게 막는다: token bypass 없음, Origin
// 허용목록 예외 없음, loopback이 아니면 무조건 거부. isDoctorRequestAllowed를
// 재사용/완화하지 않고 별도 함수로 둔 이유이기도 하다(이 라우트는 절대
// 약해지면 안 되고, 다른 원장 라우트를 실수로 강화하지도 않는다).
export function isLocalOnly(remoteAddress) {
  return isLoopback(remoteAddress)
}
```

Replace it with nothing (just remove the block; `isLoopback` stays since `isDoctorRequestAllowed` still uses it).

Add one sentence to the top-of-file comment (`server/auth.js:1-4`) so the file explains the current model accurately — append after the existing comment:

```js
// GET /api/current-visit는 과거 loopback 전용 별도 가드(isLocalOnly)를 썼지만,
// multi-workstation 지원을 위해 다른 원장 라우트와 동일한 requireDoctor() +
// origin allowlist 모델로 통합했다(2026-08 설계 변경, 
// docs/superpowers/specs/2026-08-10-multi-workstation-doctor-foundation-design.md
// 참고).
```

- [ ] **Step 2: Update imports in `server/index.js`**

Change:

```js
import { isDoctorRequestAllowed, isOriginAllowedForDoctor, isLocalOnly } from './auth.js'
import { activateVisit, clearActiveVisit, getActiveVisit } from './activeVisit.js'
```

to:

```js
import { isDoctorRequestAllowed, isOriginAllowedForDoctor } from './auth.js'
import {
  activateVisit,
  clearActiveVisit,
  getActiveVisit,
  isValidWorkstationId,
  DEFAULT_WORKSTATION_ID,
} from './activeVisit.js'
```

- [ ] **Step 3: Fold GET current-visit into `doctorRoute` and drop its CORS special-case**

Replace (currently `server/index.js:139-150`):

```js
    // 모든 /api/submissions, /api/visits 라우트와 /api/current-visit/clear가
    // 원장용이다 — 예외는 patient POST(제출 생성) 한 건뿐.
    const isSubmissionsRoute =
      parts[1] === 'submissions' && !(parts.length === 2 && req.method === 'POST')
    const isVisitsRoute = parts[1] === 'visits'
    const isCurrentVisitClear = parts[1] === 'current-visit' && parts.length === 3 && parts[2] === 'clear'
    const doctorRoute = parts[0] === 'api' && (isSubmissionsRoute || isVisitsRoute || isCurrentVisitClear)
    // GET /api/current-visit는 원장 라우트가 아니다 — 더 엄격한 별도 가드
    // (isLocalOnly)를 쓰고, 브라우저 cross-origin 용도가 아니므로 CORS
    // 헤더를 아예 붙이지 않는다(access-control-allow-origin 없음).
    const isCurrentVisitRead = parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 2
    const cors = isCurrentVisitRead ? {} : corsHeaders(req, { doctorRoute })
```

with:

```js
    // 모든 /api/submissions, /api/visits, /api/current-visit(GET/clear
    // 둘 다) 라우트가 원장용이다 — 예외는 patient POST(제출 생성) 한 건뿐.
    // GET /api/current-visit는 과거 별도의 더 엄격한 가드를 썼지만, 다른
    // workstation의 Doctor 화면이 LAN으로 읽어야 하므로 다른 원장 라우트와
    // 동일한 requireDoctor()+origin allowlist 모델로 통합했다.
    const isSubmissionsRoute =
      parts[1] === 'submissions' && !(parts.length === 2 && req.method === 'POST')
    const isVisitsRoute = parts[1] === 'visits'
    const isCurrentVisitClear = parts[1] === 'current-visit' && parts.length === 3 && parts[2] === 'clear'
    const isCurrentVisitRead =
      parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 2 && req.method === 'GET'
    const doctorRoute =
      parts[0] === 'api' && (isSubmissionsRoute || isVisitsRoute || isCurrentVisitClear || isCurrentVisitRead)
    const cors = corsHeaders(req, { doctorRoute })
```

- [ ] **Step 4: Add a shared `workstation_id` parser/validator helper**

Add this function next to `remoteAddress`/`requireDoctor` (around `server/index.js:128-134`):

```js
  // workstation_id가 없으면 undefined를 돌려준다(activeVisit.js가 이를
  // DEFAULT_WORKSTATION_ID로 취급) — 값이 있는데 형식이 틀리면 null을 돌려줘
  // 호출부가 400으로 거부하게 한다.
  function parseWorkstationId(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined
    return isValidWorkstationId(raw) ? raw : null
  }
```

- [ ] **Step 5: Wire `workstation_id` into the activate route**

Replace the activate handler body (currently `server/index.js:314-345`, inside the `parts[3] === 'activate'` branch):

```js
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const workstationId = parseWorkstationId(body?.workstation_id)
          if (workstationId === null) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid workstation_id' }, cors)
          } else {
            const visit = await store.getVisit(id)
            if (!visit) {
              status = 404
              bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
            } else {
              const active = activateVisit(visit, workstationId)
              await safeAudit({
                event: 'visit_activated',
                visit_id: active.visit_id,
                submission_id: active.submission_id ?? undefined,
                actor: 'doctor',
              })
              bytes = sendJson(
                req,
                res,
                200,
                {
                  active: true,
                  workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID,
                  patient_id: active.patient_id,
                  visit_id: active.visit_id,
                  submission_id: active.submission_id,
                  active_since: active.active_since,
                },
                cors,
              )
            }
          }
        }
```

Note this branch previously called `readBody(req)` nowhere (activate never read a body before) — it now does, which is why `workstationId` is parsed from `body?.workstation_id` with optional chaining (handles a missing/empty body the same as `readBody` returning `undefined`).

- [ ] **Step 6: Wire `workstation_id` into the clear route**

Replace (currently `server/index.js:360-369`):

```js
      } else if (parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 3 && parts[2] === 'clear' && req.method === 'POST') {
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const prev = getActiveVisit()
          clearActiveVisit()
          await safeAudit({ event: 'visit_cleared', visit_id: prev?.visit_id ?? undefined, actor: 'doctor' })
          bytes = sendJson(req, res, 200, { ok: true }, cors)
        }
```

with:

```js
      } else if (parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 3 && parts[2] === 'clear' && req.method === 'POST') {
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const workstationId = parseWorkstationId(body?.workstation_id)
          if (workstationId === null) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid workstation_id' }, cors)
          } else {
            const prev = getActiveVisit(workstationId)
            clearActiveVisit(workstationId)
            await safeAudit({ event: 'visit_cleared', visit_id: prev?.visit_id ?? undefined, actor: 'doctor' })
            bytes = sendJson(req, res, 200, { ok: true, workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID }, cors)
          }
        }
```

- [ ] **Step 7: Wire `workstation_id` into GET current-visit and switch its guard**

Replace (currently `server/index.js:370-391`):

```js
      } else if (parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 2 && req.method === 'GET') {
        // ClinicAI 연결점. 원장 라우트보다 엄격한 별도 가드(loopback만,
        // 토큰/Origin 예외 없음) — audit 로그도 남기지 않는다(읽기라서;
        // audit는 상태변경만 기록한다). 응답에 patient_id/visit_id/
        // submission_id/active_since 외 어떤 필드도(성함/전화번호 등) 절대
        // 포함하지 않는다.
        if (!isLocalOnly(remoteAddress(req))) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const active = getActiveVisit()
          const body = active
            ? {
                active: true,
                patient_id: active.patient_id,
                visit_id: active.visit_id,
                submission_id: active.submission_id,
                active_since: active.active_since,
              }
            : { active: false }
          bytes = sendJson(req, res, 200, body, cors)
        }
```

with:

```js
      } else if (parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 2 && req.method === 'GET') {
        // ClinicAI 연결점이자, 다른 원장 workstation의 Doctor 화면이 자기
        // workstation_id의 활성 방문을 폴링하는 경로다. 다른 원장 라우트와
        // 동일한 requireDoctor()+origin allowlist를 쓴다(위 doctorRoute
        // 분기에서 이미 origin 검사를 마쳤다). audit 로그는 남기지 않는다
        // (읽기라서; audit는 상태변경만 기록한다). 응답에 patient_id/
        // visit_id/submission_id/active_since 외 어떤 필드도(성함/전화번호
        // 등) 절대 포함하지 않는다.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const workstationId = parseWorkstationId(url.searchParams.get('workstation_id'))
          if (workstationId === null) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid workstation_id' }, cors)
          } else {
            const active = getActiveVisit(workstationId)
            const body = active
              ? {
                  active: true,
                  workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID,
                  patient_id: active.patient_id,
                  visit_id: active.visit_id,
                  submission_id: active.submission_id,
                  active_since: active.active_since,
                }
              : { active: false, workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID }
            bytes = sendJson(req, res, 200, body, cors)
          }
        }
```

- [ ] **Step 8: Run the full server test file to see the expected breakage**

Run: `npm run test:server`
Expected: FAIL — several assertions in the existing current-visit block (`tests/server.spec.mjs:787-893`) and the route-count assertion (`tests/server.spec.mjs:976-983`) now fail, because they encode the *old* behavior (exact key sets without `workstation_id`, evil-Origin GET returning 200, `isLocalOnly` being referenced by name, 9 `requireDoctor` calls). This is expected — Task 3 rewrites them to match the new, approved contract. Do not "fix" `server/index.js` to make old assertions pass again; the old assertions are the ones that are now wrong.

- [ ] **Step 9: Commit (server-side implementation only; tests still red)**

```bash
git add server/index.js server/auth.js
git commit -m "feat: workstation-scoped current-visit API, fold GET into requireDoctor for LAN access"
```

---

## Task 3: Server tests — rewrite existing current-visit assertions, add multi-workstation scenarios A–H

**Files:**
- Modify: `tests/server.spec.mjs`

**Interfaces:**
- Consumes: everything produced in Task 1 and Task 2 (API contract above).

- [ ] **Step 1: Update the top-of-file import**

Change:

```js
import { isDoctorRequestAllowed, isOriginAllowedForDoctor, isLocalOnly } from '../server/auth.js'
import { __setLastTouchedForTest } from '../server/activeVisit.js'
```

to:

```js
import { isDoctorRequestAllowed, isOriginAllowedForDoctor } from '../server/auth.js'
import { __setLastTouchedForTest, isValidWorkstationId } from '../server/activeVisit.js'
```

(The `isValidWorkstationId` unit tests from Task 1 Step 3 already use this import — this step just removes the now-dead `isLocalOnly` import so the file doesn't reference a deleted export.)

- [ ] **Step 2: Rewrite the existing current-visit block (`tests/server.spec.mjs:787-893`) for the default-workstation contract**

Replace the entire block from `/* ---------------- active visit: activate/replace/clear/expiry via GET /api/current-visit (ClinicAI-facing) ---------------- */` through the `isLocalOnly` unit-assertions block (i.e. everything currently spanning lines 787–893) with:

```js
    /* ---------------- active visit: activate/replace/clear/expiry via GET /api/current-visit, default workstation (backward compat) ---------------- */
    {
      // No workstation_id passed anywhere in this block -> resolves to the
      // "default" key, proving single-workstation callers behave exactly as
      // before multi-workstation support existed.
      const basic = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-active-a' })),
        })
      ).json()
      const recA = await (await fetch(`${base}/api/submissions/${basic.id}`)).json()

      const actA = await (await fetch(`${base}/api/visits/${recA.visit_id}/activate`, { method: 'POST' })).json()
      assert('activate visit A returns active:true with matching ids', actA.active === true && actA.visit_id === recA.visit_id)
      assert('activate with no workstation_id -> resolves to "default"', actA.workstation_id === 'default')

      const curA = await (await fetch(`${base}/api/current-visit`)).json()
      assert('GET /api/current-visit (no workstation_id) reflects visit A', curA.active === true && curA.visit_id === recA.visit_id)
      assert(
        'GET /api/current-visit response has EXACTLY the documented key set (active variant)',
        Object.keys(curA).sort().join(',') === 'active,active_since,patient_id,submission_id,visit_id,workstation_id',
      )

      // activate visit B (the re-visit created earlier) on the same (default)
      // workstation -> replaces A, does not accumulate.
      const actB = await (await fetch(`${base}/api/visits/${revisitId}/activate`, { method: 'POST' })).json()
      assert('activate visit B succeeds', actB.active === true && actB.visit_id === revisitId)

      const curB = await (await fetch(`${base}/api/current-visit`)).json()
      assert('GET /api/current-visit now reflects B, not A (replacement, not accumulation)', curB.visit_id === revisitId)
      assert('current-visit submission_id is null for the re-visit (no questionnaire)', curB.submission_id === null)

      // clear -> {active:false, workstation_id} only.
      const clearRes = await fetch(`${base}/api/current-visit/clear`, { method: 'POST' })
      assert('POST /api/current-visit/clear -> 200', clearRes.status === 200)
      const curCleared = await (await fetch(`${base}/api/current-visit`)).json()
      assert('after clear, GET /api/current-visit -> active:false', curCleared.active === false)
      assert(
        'cleared response has EXACTLY {active,workstation_id} — no other keys',
        Object.keys(curCleared).sort().join(',') === 'active,workstation_id',
      )

      // expiry: activate again, then simulate TTL having passed via the test-only hook.
      const actC = await (await fetch(`${base}/api/visits/${recA.visit_id}/activate`, { method: 'POST' })).json()
      assert('re-activate visit A for expiry test', actC.active === true)
      __setLastTouchedForTest(new Date(Date.now() - 31 * 60 * 1000).toISOString())
      const curExpired = await (await fetch(`${base}/api/current-visit`)).json()
      assert('expired active visit (TTL passed) -> active:false', curExpired.active === false)

      // Never leaks patient name/phone: plant a canary, activate its visit, check the response text.
      const canary = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            validPayload({
              session_id: 'sess-current-visit-canary',
              responses: { patient: { patient_name: 'CURRENT_VISIT_NAME_CANARY', phone_last4: '4242' } },
            }),
          ),
        })
      ).json()
      const canaryRecord = await (await fetch(`${base}/api/submissions/${canary.id}`)).json()
      await fetch(`${base}/api/visits/${canaryRecord.visit_id}/activate`, { method: 'POST' })
      const curCanaryRes = await fetch(`${base}/api/current-visit`)
      const curCanaryText = await curCanaryRes.text()
      assert('GET /api/current-visit never contains the planted patient name', !curCanaryText.includes('CURRENT_VISIT_NAME_CANARY'))
      assert('GET /api/current-visit never contains the planted phone digits', !curCanaryText.includes('4242'))
      const curCanary = JSON.parse(curCanaryText)
      assert(
        'GET /api/current-visit (active) has EXACTLY the documented key set — no name/phone fields sneak in',
        Object.keys(curCanary).sort().join(',') === 'active,active_since,patient_id,submission_id,visit_id,workstation_id',
      )
      await fetch(`${base}/api/current-visit/clear`, { method: 'POST' })

      /* ---------------- GET /api/current-visit now shares the doctor Origin allowlist ---------------- */
      // Before multi-workstation support, this route deliberately ignored the
      // Origin allowlist (it was loopback-only, non-browser-facing). Now that
      // another workstation's Doctor browser must reach it over LAN, it uses
      // the exact same requireDoctor()+origin-allowlist guard as every other
      // doctor route — proven here by an evil Origin now getting 403, same as
      // /api/submissions.
      const evilOriginDoctorRoute = await fetch(`${base}/api/submissions`, {
        headers: { origin: 'https://evil.example.com' },
      })
      assert('doctor route (loopback + evil Origin) -> 403', evilOriginDoctorRoute.status === 403)

      const evilOriginCurrentVisit = await fetch(`${base}/api/current-visit`, {
        headers: { origin: 'https://evil.example.com' },
      })
      assert(
        'GET /api/current-visit (loopback + evil Origin) -> 403, same as other doctor routes now',
        evilOriginCurrentVisit.status === 403,
      )

      const goodOriginCurrentVisit = await fetch(`${base}/api/current-visit`, {
        headers: { origin: 'http://localhost:5173' },
      })
      assert(
        'GET /api/current-visit (loopback + localhost Origin) -> 200 and reflects that origin in CORS header',
        goodOriginCurrentVisit.status === 200 &&
          goodOriginCurrentVisit.headers.get('access-control-allow-origin') === 'http://localhost:5173',
      )
    }

    /* ---------------- invalid workstation_id -> 400, on all three current-visit endpoints ---------------- */
    {
      const getRes = await fetch(`${base}/api/current-visit?workstation_id=${encodeURIComponent('bad id!')}`)
      assert('GET /api/current-visit with invalid workstation_id -> 400', getRes.status === 400)

      const activateRes = await fetch(`${base}/api/visits/${revisitId}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'bad id!' }),
      })
      assert('POST activate with invalid workstation_id -> 400', activateRes.status === 400)

      const clearRes = await fetch(`${base}/api/current-visit/clear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'bad id!' }),
      })
      assert('POST clear with invalid workstation_id -> 400', clearRes.status === 400)
    }

    /* ---------------- multi-workstation isolation: DOCTOR-A and DOCTOR-B never affect each other ---------------- */
    {
      // Two fresh visits, minted directly (no questionnaire needed) so this
      // block is self-contained regardless of what earlier blocks activated.
      const visitAResp = await fetch(`${base}/api/visits`, { method: 'POST' })
      const visitA = await visitAResp.json()
      const visitBResp = await fetch(`${base}/api/visits`, { method: 'POST' })
      const visitB = await visitBResp.json()
      const visitA2Resp = await fetch(`${base}/api/visits`, { method: 'POST' })
      const visitA2 = await visitA2Resp.json()

      // A. DOCTOR-A -> visitA, DOCTOR-B -> visitB; each GET reflects only its own.
      await fetch(`${base}/api/visits/${visitA.id}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'DOCTOR-A' }),
      })
      await fetch(`${base}/api/visits/${visitB.id}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'DOCTOR-B' }),
      })
      const getA1 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-A`)).json()
      const getB1 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-B`)).json()
      assert('A. GET DOCTOR-A reflects visitA', getA1.active === true && getA1.visit_id === visitA.id)
      assert('A. GET DOCTOR-B reflects visitB', getB1.active === true && getB1.visit_id === visitB.id)

      // B. Changing DOCTOR-A to a new visit leaves DOCTOR-B untouched.
      await fetch(`${base}/api/visits/${visitA2.id}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'DOCTOR-A' }),
      })
      const getA2 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-A`)).json()
      const getB2 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-B`)).json()
      assert('B. DOCTOR-A now reflects visitA2', getA2.visit_id === visitA2.id)
      assert('B. DOCTOR-B still reflects visitB, unaffected by A changing', getB2.visit_id === visitB.id)

      // C. Clearing DOCTOR-A leaves DOCTOR-B untouched.
      await fetch(`${base}/api/current-visit/clear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'DOCTOR-A' }),
      })
      const getA3 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-A`)).json()
      const getB3 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-B`)).json()
      assert('C. DOCTOR-A is inactive after its own clear', getA3.active === false)
      assert('C. DOCTOR-B is still active, unaffected by A clearing', getB3.active === true && getB3.visit_id === visitB.id)

      // D. TTL expiry on DOCTOR-B alone leaves any other workstation untouched.
      __setLastTouchedForTest(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'DOCTOR-B')
      const getB4 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-B`)).json()
      assert('D. DOCTOR-B expired via TTL -> inactive', getB4.active === false)
      const getA4 = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-A`)).json()
      assert('D. DOCTOR-A (already inactive from C) is still inactive, not resurrected by B expiring', getA4.active === false)

      // E. invalid workstation_id already covered above (400).

      // F. unknown visit_id -> 404, regardless of workstation_id.
      const unknownActivate = await fetch(`${base}/api/visits/00000000-0000-0000-0000-000000000000/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'DOCTOR-A' }),
      })
      assert('F. activate with unknown visit_id -> 404 (workstation_id present)', unknownActivate.status === 404)
    }
```

- [ ] **Step 3: Extend the existing restart block (scenario G) to check every workstation touched in this run**

In the restart block (currently `tests/server.spec.mjs:895-922`), after the existing `curAfterRestart` assertion, add:

```js
      const doctorAAfterRestart = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-A`)).json()
      const doctorBAfterRestart = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-B`)).json()
      assert('G. restart: DOCTOR-A starts inactive', doctorAAfterRestart.active === false)
      assert('G. restart: DOCTOR-B starts inactive', doctorBAfterRestart.active === false)
```

(Place these two lines directly after the existing `assert('restart: GET /api/current-visit -> {active:false}', ...)` line and before the `visitsAfterRestart` check.)

- [ ] **Step 4: Update the doctor-route-count assertion (`tests/server.spec.mjs:962-984`)**

Replace:

```js
    const requireDoctorCalls = (serverIndexSrc.match(/!requireDoctor\(req\)/g) ?? []).length
    // 기존 4개(submissions list/get/status/judgment) + 이번 스프린트에서 추가된
    // 5개(visits create/list/get/activate, current-visit/clear) = 9개.
    // GET /api/current-visit는 이 목록에 없다 — requireDoctor가 아니라 더
    // 엄격한 isLocalOnly를 쓴다(아래 별도 assert).
    assert(
      'server has exactly the 9 doctor-guarded routes calling requireDoctor (submissions x4 + visits x4 + current-visit/clear)',
      requireDoctorCalls === 9,
    )
    assert(
      'GET /api/current-visit uses isLocalOnly, not requireDoctor/isDoctorRequestAllowed/isOriginAllowedForDoctor',
      serverIndexSrc.includes('isLocalOnly(remoteAddress(req))'),
    )
```

with:

```js
    const requireDoctorCalls = (serverIndexSrc.match(/!requireDoctor\(req\)/g) ?? []).length
    // 기존 9개(submissions x4 + visits x4 + current-visit/clear) + 이번
    // multi-workstation 작업에서 GET /api/current-visit도 requireDoctor로
    // 통합되어 10개가 됐다. isLocalOnly는 완전히 제거됐다(server/auth.js).
    assert(
      'server has exactly the 10 doctor-guarded routes calling requireDoctor (submissions x4 + visits x4 + current-visit GET + current-visit/clear)',
      requireDoctorCalls === 10,
    )
    assert(
      'isLocalOnly no longer exists anywhere in server/index.js (fully retired)',
      !serverIndexSrc.includes('isLocalOnly'),
    )
```

- [ ] **Step 5: Cross-PC token scenario (LAN reachability), unit-level**

This proves the exact mechanism A PC will rely on to reach B's `GET /api/current-visit` — a non-loopback remote address with the correct `x-doctor-token` is allowed, without one it's denied. Real cross-machine traffic can't be produced inside this single-process test (see Task 6's manual LAN smoke test for the real-network proof), but the guard function itself is fully exercised here. Add this to the existing `/* ---------------- doctor-endpoint guard (unit-level, fake remoteAddress) ---------------- */` block (`tests/server.spec.mjs:1006-1026`), right after the existing five assertions in that block:

```js
  assert(
    'guard: this is the exact mechanism GET /api/current-visit now shares (non-loopback + correct token -> allowed)',
    isDoctorRequestAllowed('192.168.1.50', 'secret', 'secret') === true,
  )
```

- [ ] **Step 6: Run the full server suite**

Run: `npm run test:server`
Expected: PASS, all assertions including the new A–H multi-workstation block, the rewritten default-workstation block, the 400-on-invalid-workstation_id block, and the updated route-count assertion.

- [ ] **Step 7: Run the full test:all suite to confirm no cross-file regressions**

Run: `npm run test:all`
Expected: PASS (other suites — integration/layout/saju/doctor/patient — don't touch current-visit and shouldn't be affected by this task).

- [ ] **Step 8: Commit**

```bash
git add tests/server.spec.mjs
git commit -m "test: rewrite current-visit coverage for workstation_id, add A-H multi-workstation scenarios"
```

---

## Task 4: Client API layer — `serverClient.ts`, `vite-env.d.ts`

**Files:**
- Modify: `src/lib/serverClient.ts:1-9, 107-126`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: the API contract from Task 2/3.
- Produces (consumed by Task 5):
  - `export type ActiveVisit = { active: true; workstation_id: string; patient_id: string; visit_id: string; submission_id: string | null; active_since: string }`
  - `export type CurrentVisitResult = ActiveVisit | { active: false; workstation_id: string }`
  - `export function activateVisit(visitId: string, workstationId?: string): Promise<ServerResult<CurrentVisitResult>>`
  - `export function clearActiveVisit(workstationId?: string): Promise<ServerResult<{ ok: true; workstation_id: string }>>`
  - `export function getCurrentVisit(workstationId?: string): Promise<ServerResult<CurrentVisitResult>>`

- [ ] **Step 1: Add doctor-token header support to `request()`**

Change the top of `src/lib/serverClient.ts`:

```ts
const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
const TIMEOUT_MS = 8000
```

to:

```ts
const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
// LAN Doctor access (e.g. A PC's browser reaching B PC's server): loopback
// has no token requirement, but a cross-machine request needs the same
// x-doctor-token the server checks in requireDoctor(). Harmless to send on
// every request — the server only inspects this header on doctor routes.
const DOCTOR_TOKEN = import.meta.env.VITE_SAMINDANG_DOCTOR_TOKEN as string | undefined
const TIMEOUT_MS = 8000
```

Then change the `fetch()` call inside `request()`:

```ts
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...init.headers },
    })
```

to:

```ts
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(DOCTOR_TOKEN ? { 'x-doctor-token': DOCTOR_TOKEN } : {}),
        ...init.headers,
      },
    })
```

- [ ] **Step 2: Update the current-visit section of `serverClient.ts` (currently lines 107-126)**

Replace:

```ts
// ClinicAI 연결점(server/activeVisit.js)의 원장 화면 쪽 절반. "지금 이
// 방문을 진료 중으로 표시한다/표시를 지운다"만 한다 — 녹음/전사는 이 서버
// 어디에도 없다.
export type ActiveVisit = {
  active: true
  patient_id: string
  visit_id: string
  submission_id: string | null
  active_since: string
}
export type CurrentVisitResult = ActiveVisit | { active: false }

export function activateVisit(visitId: string): Promise<ServerResult<CurrentVisitResult>> {
  return request(`/api/visits/${visitId}/activate`, { method: 'POST' })
}

export function clearActiveVisit(): Promise<ServerResult<{ ok: true }>> {
  return request('/api/current-visit/clear', { method: 'POST' })
}
```

with:

```ts
// ClinicAI 연결점(server/activeVisit.js)의 원장 화면 쪽 절반. "지금 이
// 방문을 진료 중으로 표시한다/표시를 지운다"만 한다 — 녹음/전사는 이 서버
// 어디에도 없다. workstation_id는 이 브라우저/PC의 진료 워크스테이션 id
// (src/doctor/workstation.ts)이며, 생략하면 서버가 "default" 키로 취급한다
// (단일 workstation 하위호환).
export type ActiveVisit = {
  active: true
  workstation_id: string
  patient_id: string
  visit_id: string
  submission_id: string | null
  active_since: string
}
export type CurrentVisitResult = ActiveVisit | { active: false; workstation_id: string }

export function activateVisit(visitId: string, workstationId?: string): Promise<ServerResult<CurrentVisitResult>> {
  return request(`/api/visits/${visitId}/activate`, {
    method: 'POST',
    body: JSON.stringify({ workstation_id: workstationId }),
  })
}

export function clearActiveVisit(workstationId?: string): Promise<ServerResult<{ ok: true; workstation_id: string }>> {
  return request('/api/current-visit/clear', {
    method: 'POST',
    body: JSON.stringify({ workstation_id: workstationId }),
  })
}

export function getCurrentVisit(workstationId?: string): Promise<ServerResult<CurrentVisitResult>> {
  const qs = workstationId ? `?workstation_id=${encodeURIComponent(workstationId)}` : ''
  return request(`/api/current-visit${qs}`)
}
```

- [ ] **Step 3: Add the two new env vars to `src/vite-env.d.ts`**

Add inside `interface ImportMetaEnv` (after `VITE_SAMINDANG_IDLE_MINUTES`):

```ts
  /**
   * 원장 화면이 LAN으로 다른 workstation의 서버에 접근할 때 보낼
   * x-doctor-token. loopback에서는 필요 없다(서버가 loopback을 이미
   * 허용하므로). 미설정 시 헤더를 아예 보내지 않는다.
   */
  readonly VITE_SAMINDANG_DOCTOR_TOKEN?: string
  /**
   * 워크스테이션 설정 화면에 보여줄 프리셋 목록, 쉼표로 구분(예:
   * "DOCTOR-A,DOCTOR-B"). 미설정 시 기본값 DOCTOR-A,DOCTOR-B 사용. 오타
   * 방지를 위해 선택형 UI에 쓰인다 — 자유 입력도 별도로 가능하다.
   */
  readonly VITE_SAMINDANG_WORKSTATIONS?: string
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b`
Expected: PASS (no errors — `activateVisit`/`clearActiveVisit` callers in `DoctorView.tsx` still compile because the new params are optional; Task 5 updates the call sites anyway).

- [ ] **Step 5: Commit**

```bash
git add src/lib/serverClient.ts src/vite-env.d.ts
git commit -m "feat(client): workstation_id + doctor-token support in serverClient"
```

---

## Task 5: Doctor UI — workstation identity, setup screen, badge, gated activation

**Files:**
- Create: `src/doctor/workstation.ts`
- Create: `src/doctor/WorkstationSetup.tsx`
- Modify: `src/doctor/DoctorView.tsx:705-716, 732-776`
- Modify: `src/doctor/doctor.css`
- Test: `tests/doctor.spec.mjs`

**Interfaces:**
- Consumes: `activateVisit`, `clearActiveVisit` from Task 4 (`src/lib/serverClient.ts`).
- Produces: `WorkstationSetup` component consumed by `DoctorView.tsx`; `getStoredWorkstationId`, `setStoredWorkstationId`, `isValidWorkstationId`, `presetWorkstationIds` consumed by both.

```ts
// src/doctor/workstation.ts contract:
export function isValidWorkstationId(id: string): boolean
export function getStoredWorkstationId(): string | null
export function setStoredWorkstationId(id: string): void   // throws if invalid
export function presetWorkstationIds(): string[]
```

- [ ] **Step 1: Create `src/doctor/workstation.ts`**

```ts
/**
 * 이 브라우저/PC의 진료 워크스테이션 identity. localStorage에 최초 1회
 * 저장하고, 이후 브라우저 재시작에도 그대로 유지한다. A/B/C를 코드에
 * 하드코딩하지 않는다 — 프리셋 목록은 VITE_SAMINDANG_WORKSTATIONS로
 * 바꿀 수 있다. 절대 환자 이름/원장 실명/전화/이메일 등 PII를 담지 않는다
 * (형식 검증만, 의미 검증은 하지 않는다 — PII 금지는 UI 안내 문구와 이
 * 문서로 지킨다).
 */
const STORAGE_KEY = 'samindang.doctor.workstation_id'

// server/activeVisit.js의 WORKSTATION_ID_RE와 반드시 동일하게 유지한다.
const WORKSTATION_ID_RE = /^[A-Za-z0-9_-]{1,32}$/

export function isValidWorkstationId(id: string): boolean {
  return WORKSTATION_ID_RE.test(id)
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function getStoredWorkstationId(): string | null {
  if (!hasLocalStorage()) return null
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw && isValidWorkstationId(raw) ? raw : null
}

export function setStoredWorkstationId(id: string): void {
  if (!isValidWorkstationId(id)) throw new Error('invalid workstation id')
  if (!hasLocalStorage()) return
  localStorage.setItem(STORAGE_KEY, id)
}

export function presetWorkstationIds(): string[] {
  const raw = import.meta.env.VITE_SAMINDANG_WORKSTATIONS as string | undefined
  const parsed = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : ['DOCTOR-A', 'DOCTOR-B']
}
```

- [ ] **Step 2: Create `src/doctor/WorkstationSetup.tsx`**

```tsx
import { useState } from 'react'
import { isValidWorkstationId, presetWorkstationIds, setStoredWorkstationId } from './workstation'

/**
 * 최초 1회(또는 미설정 시) 진료 워크스테이션을 고르는 화면. 오타 방지를
 * 위해 프리셋 버튼 선택이 기본이고, 자유 입력은 "기타" 케이스로만 보조
 * 제공한다 — 둘 다 같은 형식 검증을 통과해야 저장된다.
 */
export function WorkstationSetup({ onSet }: { onSet: (id: string) => void }) {
  const presets = presetWorkstationIds()
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function choose(id: string) {
    if (!isValidWorkstationId(id)) {
      setError('워크스테이션 ID는 영문/숫자/-(하이픈)/_(밑줄)만 사용, 1~32자여야 합니다.')
      return
    }
    setStoredWorkstationId(id)
    onSet(id)
  }

  return (
    <div className="doctor__banner">
      <strong>워크스테이션 설정 필요</strong>
      <p>이 PC/브라우저에서 사용할 진료 워크스테이션을 선택하세요. 선택 후에는 브라우저 재시작 후에도 그대로 유지됩니다.</p>
      <div className="doctor__pickerRow">
        {presets.map((id) => (
          <button key={id} type="button" className="judgment__recordBtn" onClick={() => choose(id)}>
            {id}
          </button>
        ))}
        <button type="button" className="judgment__recordBtn" onClick={() => setCustomMode(true)}>
          기타(직접 입력)
        </button>
      </div>
      {customMode && (
        <div className="doctor__pickerRow">
          <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="예: DOCTOR-C" />
          <button type="button" className="judgment__recordBtn" onClick={() => choose(customValue.trim())}>
            저장
          </button>
        </div>
      )}
      {error && <p className="doctor__empty">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Wire workstation state into `DoctorView.tsx`**

Add the import (near the top, alongside the existing `serverClient` import):

```ts
import { WorkstationSetup } from './WorkstationSetup'
import { getStoredWorkstationId } from './workstation'
```

Add state (near the other `useState` declarations, e.g. right after `const viewedRef = useRef<Set<string>>(new Set())`):

```ts
  const [workstationId, setWorkstationId] = useState<string | null>(() => getStoredWorkstationId())
```

Replace the activation effect (currently `DoctorView.tsx:705-716`):

```ts
  // ClinicAI 연결점: 서버 모드에서 제출건을 열면(그리고 visit_id가 있으면)
  // 그 방문을 "진료 중"으로 표시한다. 닫거나(목록으로/다른 건 선택) 컴포넌트가
  // unmount되면 표시를 지운다(effect cleanup 하나로 두 상황을 다 처리).
  // fixtures 모드에서는 실제 서버 방문이 없으므로 아예 호출하지 않는다.
  useEffect(() => {
    if (mode !== 'server' || !selectedRecord?.visit_id) return
    activateVisit(selectedRecord.visit_id)
    return () => {
      // fire-and-forget: unmount/전환을 막지 않는다.
      clearActiveVisit()
    }
  }, [mode, selectedRecord?.visit_id])
```

with:

```ts
  // ClinicAI 연결점: 서버 모드에서 제출건을 열면(그리고 visit_id가 있으면)
  // 그 방문을 "이 workstation에서 진료 중"으로 표시한다. 닫거나(목록으로/
  // 다른 건 선택) 컴포넌트가 unmount되면 표시를 지운다(effect cleanup 하나로
  // 두 상황을 다 처리). fixtures 모드에서는 실제 서버 방문이 없으므로 아예
  // 호출하지 않는다. workstationId가 아직 없으면(설정 전) 절대 activate를
  // 호출하지 않는다 — 잘못 default 키에 반영되는 것을 막기 위함.
  useEffect(() => {
    if (mode !== 'server' || !selectedRecord?.visit_id || !workstationId) return
    activateVisit(selectedRecord.visit_id, workstationId)
    return () => {
      // fire-and-forget: unmount/전환을 막지 않는다.
      clearActiveVisit(workstationId)
    }
  }, [mode, selectedRecord?.visit_id, workstationId])
```

- [ ] **Step 4: Render the workstation badge / setup screen in the header**

Replace the `<header className="doctor__header">...</header>` block's closing area (currently `DoctorView.tsx:734-776`, specifically add right after the `<h1>` line):

```tsx
      <header className="doctor__header">
        <h1 className="doctor__title">진료 전 요약</h1>
        <span className="doctor__workstationBadge">
          {workstationId ? `진료 워크스테이션: ${workstationId}` : '워크스테이션 설정 필요'}
        </span>
        <div className="doctor__pickerRow">
```

(This inserts one new `<span>` directly after the `<h1>` and before the existing `<div className="doctor__pickerRow">` — everything else in the header is unchanged.)

Then, immediately after the closing `</header>` tag (before the existing `{mode === 'server' && serverError && (...)}` block), add:

```tsx
      {!workstationId && <WorkstationSetup onSet={setWorkstationId} />}
```

- [ ] **Step 5: Add badge/banner styles to `src/doctor/doctor.css`**

Add near the existing `.doctor__activeVisitBadge` rule:

```css
.doctor__workstationBadge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--surface-muted, #eef2f7);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}
```

- [ ] **Step 6: Update the SSR doctor test for the new badge**

The existing SSR test (`tests/doctor.spec.mjs`, section 14, currently around lines 478-506) renders `DoctorView` via `renderToString`. `getStoredWorkstationId()` guards on `typeof localStorage !== 'undefined'`, so under Node SSR it safely returns `null` and the setup banner renders. Add this assertion right after the existing badge block (after line 505, before the file ends):

```js
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('SSR (no localStorage): workstation badge shows "설정 필요", not a stale id', html.includes('워크스테이션 설정 필요'))
  assert('SSR (no localStorage): workstation setup banner renders (localStorage absence handled safely, no throw)', html.includes('워크스테이션 설정 필요'))
}
```

- [ ] **Step 7: Rebuild and run the doctor test**

Run: `npm run test:doctor`
Expected: PASS, including the two new assertions from Step 6 and all pre-existing ones (the pre-existing badge/section-order/fixture assertions are unaffected by this task).

- [ ] **Step 8: Full verification**

Run: `npx tsc -b && npx vite build`
Expected: PASS, no type errors, build succeeds.

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/doctor/workstation.ts src/doctor/WorkstationSetup.tsx src/doctor/DoctorView.tsx src/doctor/doctor.css tests/doctor.spec.mjs
git commit -m "feat(doctor-ui): workstation identity, setup screen, badge, gated activation"
```

---

## Task 6: Documentation — `MULTI_WORKSTATION_CONTRACT.md` and LAN smoke-test checklist

**Files:**
- Create: `docs/MULTI_WORKSTATION_CONTRACT.md`

- [ ] **Step 1: Write `docs/MULTI_WORKSTATION_CONTRACT.md`**

```markdown
# Multi-Workstation Doctor Contract v0.1

이 문서는 여러 원장 workstation(현재 B PC가 중앙 서버, A PC가 두 번째
workstation)이 하나의 Doctor 데이터 소스를 공유하면서도 각자 독립적인
"현재 진료 중인 방문"을 가질 수 있게 하는 규약이다.

## workstation_id란

- 각 Doctor 브라우저/PC를 구분하는 비식별 문자열. 예: `DOCTOR-A`, `DOCTOR-B`.
- 형식: `/^[A-Za-z0-9_-]{1,32}$/`.
- **환자 이름, 원장 실명, 전화번호, 이메일 등 PII를 절대 담지 않는다.**
- 코드에 A/B를 하드코딩하지 않는다 — 향후 `DOCTOR-C`는 프리셋 목록에 추가만
  하면 된다(`VITE_SAMINDANG_WORKSTATIONS` 환경변수, 쉼표 구분).
- 브라우저 localStorage에 최초 1회 저장되고, 이후 재시작해도 유지된다.
  같은 build를 여러 PC에서 열어도 각 브라우저의 localStorage가 다르므로
  workstation_id가 자동으로 충돌하지 않는다.
- 생략하면 서버는 내부적으로 `"default"` 키로 취급한다 — 기존
  single-workstation 동작과 완전히 하위호환된다.

## current visit ownership

- `server/activeVisit.js`가 `workstation_id -> entry` Map을 메모리에만
  들고 있다(디스크 저장 없음, 서버 재시작 시 전부 비워진다).
- 한 workstation의 activate/clear/TTL 만료는 다른 workstation의 entry에
  절대 영향을 주지 않는다 — Map 키가 다르기 때문에 구조적으로 보장된다.
- TTL: 기본 30분(`SAMINDANG_ACTIVE_VISIT_TTL_MINUTES`), workstation별로
  독립 적용.

## API

```
GET  /api/current-visit?workstation_id=<id>   (생략 시 "default")
POST /api/visits/:id/activate                 body: { workstation_id? }
POST /api/current-visit/clear                 body: { workstation_id? }
```

세 endpoint 모두 `requireDoctor()`(loopback 또는 `x-doctor-token`) +
doctor origin allowlist를 쓴다. `GET /api/current-visit`는 과거
loopback-only 별도 가드를 썼지만, 다른 workstation이 LAN으로 읽어야
하므로 다른 원장 라우트와 동일한 모델로 통합했다(2026-08 변경).

## Recorder 연동 규칙 (향후 작업, 이번엔 미구현)

- Recorder A는 `WORKSTATION_ID=DOCTOR-A` 환경변수를 가지고,
  `GET /api/current-visit?workstation_id=DOCTOR-A`만 조회한다.
- Recorder B는 `WORKSTATION_ID=DOCTOR-B`로 자기 workstation만 조회한다.
- **visit_id freeze**: 녹음 시작(F9) 순간의 `visit_id`를 그 recording
  session 동안 고정한다. 녹음 진행 중 Doctor가 같은 workstation에서 다른
  환자를 열어도(즉 current-visit이 바뀌어도) 이미 시작된 recording
  session은 영향받지 않는다 — 다음 녹음부터 새 visit_id가 적용된다.
- Recorder는 자기 workstation_id의 current-visit만 읽는다 — 다른
  workstation의 current-visit을 조회하거나 수정할 수 없다(권한이 아니라
  애초에 다른 workstation_id를 모른다는 설계).

## Privacy

- `GET /api/current-visit` 응답에는 `active`, `workstation_id`,
  `patient_id`, `visit_id`, `submission_id`, `active_since`만 포함된다.
  환자 이름/전화번호 등은 절대 포함하지 않는다(자동 테스트로 검증됨,
  `tests/server.spec.mjs`의 canary 테스트).

## 확장성

- A/B 외 C, D, ... workstation을 추가할 때 서버 코드 변경은 필요 없다 —
  클라이언트가 새 workstation_id로 요청하면 Map에 새 키가 자연히
  생긴다. 프리셋 드롭다운에 새 id를 추가하려면
  `VITE_SAMINDANG_WORKSTATIONS`만 갱신하면 된다.

## LAN Doctor 접근 수동 스모크 테스트

자동화된 단일 프로세스 테스트로는 실제 두 PC 간 네트워크 경로를 재현할
수 없다 — 아래를 A PC 브라우저에서 B PC 서버를 대상으로 실제로 실행해서
확인한다. `SAMINDANG_DOCTOR_TOKEN`을 B 서버에 설정하고,
`VITE_SAMINDANG_DOCTOR_TOKEN`을 A의 클라이언트 빌드/설정에 동일하게
맞춘 뒤:

- [ ] A 브라우저 → B Doctor View에서 제출목록 조회 성공
- [ ] visit 상세 조회 성공
- [ ] visit activate 성공
- [ ] `GET /api/current-visit?workstation_id=DOCTOR-A` 조회 성공
- [ ] clear 성공
- [ ] DOCTOR-A 상태 변경이 DOCTOR-B(B PC 자체 workstation)에 영향 없음
      (B PC 화면에서 교차 확인)
- [ ] 허용되지 않은 origin 또는 `x-doctor-token` 없는 요청은 거부됨
      (예: 토큰 없이 curl로 B 서버를 다른 LAN 기기에서 호출 → 403)
```

- [ ] **Step 2: Commit**

```bash
git add docs/MULTI_WORKSTATION_CONTRACT.md
git commit -m "docs: multi-workstation contract and LAN doctor smoke test checklist"
```

---

## Task 7: Final verification and Opus review pass

**Files:** none (verification only)

- [ ] **Step 1: Run full verification suite**

Run in order:
```bash
npm run test:all
npx tsc -b
npx vite build
```
Expected: all three PASS with no errors.

- [ ] **Step 2: Manual self-check against the spec's Opus review checklist**

Confirm each of these by reading the final diff (no code changes in this step, just verification — if any answer is "no", go back and fix the relevant task before proceeding):

- A/B current visit entries are independent (Task 3's A-H block proves this).
- One workstation's activate/clear/expiry never touches another's entry (Map keying + tests).
- workstation identity survives browser restart (localStorage, not sessionStorage or in-memory state).
- One build used on both A and B PCs doesn't collide on identity (per-browser localStorage, no build-time-only env).
- No patient-identifying info is placed in workstation_id anywhere (grep `workstation_id` usages — only ever assigned from the setup UI or `DEFAULT_WORKSTATION_ID`).
- Existing visit/submission structure (`store.js`, `visitStore.js`) is untouched.
- Doctor security wasn't broadly weakened — only `GET /api/current-visit` moved from a stricter loopback-only guard to the same `requireDoctor()`+origin-allowlist model already trusted for every other doctor route; no route became world-readable, no CORS wildcard was introduced on any doctor route.
- Recorder's future contract is fully specified in `docs/MULTI_WORKSTATION_CONTRACT.md` (workstation_id scoping + visit_id freeze) without any Recorder code being touched.
- Scope did not creep into Recorder/LLM/명리 Rule Engine/EMR/cloud — confirm via `git diff --stat` against main that only the files listed in Tasks 1-6 changed.

- [ ] **Step 3: Final clean commit (if Step 2 required fixes) or confirm working tree is clean**

```bash
git status
```
Expected: clean (everything already committed task-by-task in Tasks 1-6). If Step 2 uncovered anything to fix, make the fix, re-run Step 1, and commit with a `fix:` message before finishing.
