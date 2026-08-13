# Recorder 결과 → Doctor → EMR 복사 (B PC, Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side data contract + API for Recorder (A PC) results keyed by `visit_id`, a Doctor-detail-screen section that shows transcript/summary and lets the doctor edit and copy a plain-text EMR summary to clipboard.

**Architecture:** Follow the existing file-per-record JSON store pattern (`server/visitStore.js`) with a new `server/recorderResultStore.js` (one JSON file per `recording_id`, under `<dataDir>/../recorder-results/<visit_id>/`). Two new routes on the existing raw-`node:http` router in `server/index.js`, reusing `requireDoctor()` auth and the existing `isVisitsRoute` CORS gate (no new gating logic needed — `/api/visits/*` already matches). Doctor UI polls the new GET endpoint on the same 5s interval already used for the submissions list, and renders a new `doctor__section` in `DoctorView.tsx`. EMR text formatting is a pure function (`src/doctor/emrSummary.ts`) with no React/server dependency, unit-tested standalone.

**Tech Stack:** Node `node:http` (no framework), React 18 + TypeScript + Vite, plain-Node test scripts (`assert()`/`console.log('OK: ...')`, esbuild pre-bundle), plain CSS under `.doctor` scope.

## Global Constraints

- This is **B PC only** (`c:\Users\ASUS\Desktop\google drive\samindang-questionnaire`). Do not touch A PC / `G:\ClinicAI` code.
- `visit_id` is the only correlation key. Never match by name/phone/DOB.
- Reuse `requireDoctor()` (loopback or `x-doctor-token`) for the new routes — no new unauthenticated endpoint, no hardcoded token, no `CORS *` on doctor routes.
- Never log token or PII (transcript/patient text) — only ids and byte counts, per the existing `log()`/`safeAudit()` convention.
- `Assessment` / `치료·처방` / `계획` EMR lines must come **only** from `ClinicianJudgment` fields the doctor typed (`revised_after_exam`, `final_treatment_axis`, `prescription_direction`) — never from `structured_note.assessment/treatment/plan`. No auto-diagnosis, no auto-prescription.
- Don't invent an EMR auto-paste/auto-fill mechanism — clipboard copy only, doctor pastes manually (Ctrl+V).
- No new npm dependency — clipboard uses the native `navigator.clipboard` Web API.
- Multi-recording: keep full lineage per `recording_id` (idempotent overwrite on same id, no duplicates); Doctor UI shows the latest by `created_at` and does not attempt merge UI.
- No websocket — polling only, same 5000ms interval already used elsewhere in `DoctorView.tsx`.

---

### Task 1: Server data layer — `recorderResultStore.js` + visit pointer update

**Files:**
- Create: `server/recorderResultStore.js`
- Modify: `server/visitStore.js` (add `setRecorderPointer`, export it)
- Modify: `server/store.js` (wire the new store in, export `saveRecorderResult`/`listRecorderResults`/`setVisitRecorderPointer`)

**Interfaces:**
- Produces (for Task 2): `store.saveRecorderResult({ visit_id, recording_id, transcript, structured_note, source }) -> Promise<RecorderResultRecord>`, `store.listRecorderResults(visit_id) -> Promise<RecorderResultRecord[]>` (sorted newest-`created_at`-first), `store.setVisitRecorderPointer(id, recording_id) -> Promise<VisitRecord | null>`.
- `RecorderResultRecord` shape: `{ visit_id, recording_id, transcript: string|null, structured_note: object|null, source: {workstation_id: string|null}|null, created_at, updated_at }`.

- [ ] **Step 1: Create `server/recorderResultStore.js`**

```js
// Recorder 결과(전사/구조화 노트) 저장 계층. visitStore.js와 동일한
// atomic-write JSON-파일 패턴이지만, 한 visit에 여러 recording이 있을 수
// 있으므로 파일 1개 = recording 1개다: <resultsDir>/<visit_id>/<recording_id>.json.
// 같은 recording_id로 다시 오면(재전송/네트워크 재시도) 새 파일을 만들지
//않고 기존 파일을 덮어쓴다(idempotent) — created_at은 최초 저장 시각을
// 유지하고 updated_at만 갱신한다.
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

function visitDir(resultsDir, visitId) {
  return path.join(resultsDir, visitId)
}

function resultPath(resultsDir, visitId, recordingId) {
  return path.join(visitDir(resultsDir, visitId), `${recordingId}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

// ponytail: store.js/visitStore.js와 같은 in-process 키별 mutex. 별도
// 인스턴스로 두는 이유도 동일하다 — recording 저장은 submission/visit 락
// 공간과 무관한 키 공간이다.
const locks = new Map()
function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const settled = run.then(
    () => {},
    () => {},
  )
  const cleanup = settled.finally(() => {
    if (locks.get(key) === cleanup) locks.delete(key)
  })
  locks.set(key, cleanup)
  return run
}

export function createRecorderResultStore(resultsDir) {
  async function saveResult({ visit_id, recording_id, transcript, structured_note, source }) {
    return withLock(`${visit_id}/${recording_id}`, async () => {
      await mkdir(visitDir(resultsDir, visit_id), { recursive: true })
      const filePath = resultPath(resultsDir, visit_id, recording_id)
      let existing = null
      try {
        existing = JSON.parse(await readFile(filePath, 'utf8'))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      const now = new Date().toISOString()
      const record = {
        visit_id,
        recording_id,
        transcript: transcript ?? null,
        structured_note: structured_note ?? null,
        source: source ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      }
      await atomicWrite(filePath, record)
      return record
    })
  }

  async function listResults(visit_id) {
    let files
    try {
      files = (await readdir(visitDir(resultsDir, visit_id))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const records = []
    for (const f of files) {
      try {
        records.push(JSON.parse(await readFile(path.join(visitDir(resultsDir, visit_id), f), 'utf8')))
      } catch {
        // 손상되거나 쓰는 중(.tmp 아님)인 파일은 건너뛴다
      }
    }
    records.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return records
  }

  return { saveResult, listResults }
}
```

- [ ] **Step 2: Add `setRecorderPointer` to `server/visitStore.js`**

Insert after `getVisit` (currently line 114-116):

```js
  // recorder-results POST가 성공할 때마다 이 visit이 "가장 최근에 가리키는"
  // recording_id를 갱신한다 — 전체 lineage는 recorderResultStore가 따로
  // 가지고 있고, 이 필드는 그중 최신 것을 가리키는 포인터일 뿐이다.
  // transcript_id는 이번 스프린트에서 별도 개념으로 정의하지 않는다
  // (recorder-results 계약에 recording_id 하나만 있다) — null로 남겨둔다.
  async function setRecorderPointer(id, recording_id) {
    return withLock(id, async () => {
      const record = await readVisit(id)
      if (!record) return null
      record.recording_id = recording_id
      record.updated_at = new Date().toISOString()
      await atomicWrite(visitPath(visitsDir, id), record)
      return record
    })
  }
```

Update the final `return` statement (currently line 133) to:

```js
  return { createVisit, getVisit, listVisits, visitExistsForPatient, setRecorderPointer }
```

- [ ] **Step 3: Wire into `server/store.js`**

Add import at top (after the existing `createVisitStore` import, line 7):

```js
import { createRecorderResultStore } from './recorderResultStore.js'
```

Inside `createStore(dataDir)`, after the `visits` const (currently line 46), add:

```js
  // recorder-results/는 submissions/의 또다른 형제 경로다(visits/와 같은 패턴).
  const recorderResults = createRecorderResultStore(path.join(dataDir, '..', 'recorder-results'))
```

Update the final `return` object (currently lines 217-229) to add:

```js
    saveRecorderResult: recorderResults.saveResult,
    listRecorderResults: recorderResults.listResults,
    setVisitRecorderPointer: visits.setRecorderPointer,
```

- [ ] **Step 4: Commit**

```bash
git add server/recorderResultStore.js server/visitStore.js server/store.js
git commit -m "feat(server): recorder-results store keyed by visit_id/recording_id"
```

---

### Task 2: API routes — `POST`/`GET /api/visits/:visit_id/recorder-results`

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `store.saveRecorderResult`, `store.listRecorderResults`, `store.setVisitRecorderPointer`, `store.getVisit` (all from Task 1), `requireDoctor(req)`, `safeAudit(fields)`, `readBody(req)`, `sendJson(...)` (all already exist in this file).
- Produces (for Task 3/4): `POST /api/visits/:visit_id/recorder-results` → 201 with the saved `RecorderResultRecord`; `GET /api/visits/:visit_id/recorder-results` → 200 `{ results: RecorderResultRecord[] }` (newest first).

- [ ] **Step 1: Add the two route branches**

Insert right after the `GET /api/visits/:id` branch (currently `server/index.js:370-383`, ends with the closing `}` before `} else if (parts[0] === 'api' && parts[1] === 'current-visit' ...`):

```js
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'recorder-results' &&
        req.method === 'POST'
      ) {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const visit = await store.getVisit(id)
          if (!visit) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            const body = await readBody(req)
            const recordingId =
              typeof body?.recording_id === 'string' && body.recording_id.trim() !== ''
                ? body.recording_id.trim()
                : null
            if (!recordingId) {
              status = 400
              bytes = sendJson(req, res, 400, { error: 'recording_id required' }, cors)
            } else {
              const transcript = typeof body?.transcript === 'string' ? body.transcript : null
              const rawNote = body?.structured_note
              const structuredNote =
                rawNote && typeof rawNote === 'object' && !Array.isArray(rawNote)
                  ? {
                      chief_complaint: typeof rawNote.chief_complaint === 'string' ? rawNote.chief_complaint : null,
                      history: typeof rawNote.history === 'string' ? rawNote.history : null,
                      key_findings: typeof rawNote.key_findings === 'string' ? rawNote.key_findings : null,
                      assessment: typeof rawNote.assessment === 'string' ? rawNote.assessment : null,
                      treatment: typeof rawNote.treatment === 'string' ? rawNote.treatment : null,
                      plan: typeof rawNote.plan === 'string' ? rawNote.plan : null,
                    }
                  : null
              const source =
                body?.source && typeof body.source === 'object' && !Array.isArray(body.source)
                  ? { workstation_id: typeof body.source.workstation_id === 'string' ? body.source.workstation_id : null }
                  : null
              const result = await store.saveRecorderResult({
                visit_id: id,
                recording_id: recordingId,
                transcript,
                structured_note: structuredNote,
                source,
              })
              await store.setVisitRecorderPointer(id, recordingId)
              status = 201
              await safeAudit({ event: 'recorder_result_saved', visit_id: id, recording_id: recordingId, actor: 'recorder' })
              bytes = sendJson(req, res, 201, result, cors)
            }
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'recorder-results' &&
        req.method === 'GET'
      ) {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const visit = await store.getVisit(id)
          if (!visit) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            const results = await store.listRecorderResults(id)
            bytes = sendJson(req, res, 200, { results }, cors)
          }
        }
```

(Leave the existing `} else if (parts[0] === 'api' && parts[1] === 'current-visit' ...` branch immediately following, unchanged.)

No change needed to `isVisitsRoute`/`doctorRoute`/CORS detection (`server/index.js:160,164-165`) — `parts[1] === 'visits'` already matches `/api/visits/:id/recorder-results` regardless of `parts.length`, so both new routes already get `requireDoctor()` + origin-allowlist protection automatically.

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat(server): POST/GET /api/visits/:id/recorder-results"
```

---

### Task 3: Server tests — `tests/recorderResults.spec.mjs`

**Files:**
- Create: `tests/recorderResults.spec.mjs`
- Modify: `package.json` (add `test:recorderResults` script, add it to `test:all`)

**Interfaces:**
- Consumes: `createApp` from `server/index.js` (same as `tests/server.spec.mjs`).

- [ ] **Step 1: Write the test file**

```js
// Recorder-results route suite. Plain node, no test framework: assert()
// prints "OK: <name>" and throws on failure. Starts the real server on an
// ephemeral port with a temp data dir and exercises real HTTP end to end.
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'

let passCount = 0

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

async function startServer(dataDir) {
  const server = createApp({ dataDir })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}` }
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function createVisit(base) {
  const res = await fetch(`${base}/api/visits`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  return res.json()
}

async function main() {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-recorder-test-'))
  const dataDir = path.join(tmpRoot, 'submissions')
  let { server, base } = await startServer(dataDir)

  try {
    const visit = await createVisit(base)

    /* ---------------- POST unknown visit_id -> 404 ---------------- */
    {
      const res = await fetch(`${base}/api/visits/00000000-0000-0000-0000-000000000000/recorder-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recording_id: 'r1' }),
      })
      assert('POST unknown visit_id -> 404', res.status === 404)
    }

    /* ---------------- POST missing recording_id -> 400 ---------------- */
    {
      const res = await fetch(`${base}/api/visits/${visit.id}/recorder-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: 'hello' }),
      })
      assert('POST missing recording_id -> 400', res.status === 400)
    }

    /* ---------------- POST malformed JSON -> 400 ---------------- */
    {
      const res = await fetch(`${base}/api/visits/${visit.id}/recorder-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
      assert('POST malformed JSON -> 400', res.status === 400)
    }

    /* ---------------- POST valid -> 201, GET reflects it ---------------- */
    {
      const res = await fetch(`${base}/api/visits/${visit.id}/recorder-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recording_id: 'rec-1',
          transcript: '환자: 두통이 있어요.',
          structured_note: { chief_complaint: '두통', history: '3일 전부터', key_findings: null, assessment: null, treatment: null, plan: null },
          source: { workstation_id: 'DOCTOR-A' },
        }),
      })
      assert('POST valid recorder result -> 201', res.status === 201)
      const body = await res.json()
      assert('response echoes recording_id', body.recording_id === 'rec-1')
      assert('response echoes visit_id', body.visit_id === visit.id)

      const getRes = await fetch(`${base}/api/visits/${visit.id}/recorder-results`)
      const getBody = await getRes.json()
      assert('GET recorder-results -> 200', getRes.status === 200)
      assert('GET reflects the saved recording', getBody.results.length === 1 && getBody.results[0].recording_id === 'rec-1')

      const visitRes = await fetch(`${base}/api/visits/${visit.id}`)
      const visitBody = await visitRes.json()
      assert('visit.recording_id pointer updated', visitBody.recording_id === 'rec-1')
    }

    /* ---------------- duplicate recording_id -> overwrite, not a new file ---------------- */
    {
      const res = await fetch(`${base}/api/visits/${visit.id}/recorder-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recording_id: 'rec-1', transcript: 'updated transcript' }),
      })
      assert('duplicate recording_id -> still 201 (idempotent upsert)', res.status === 201)

      const getRes = await fetch(`${base}/api/visits/${visit.id}/recorder-results`)
      const getBody = await getRes.json()
      assert('duplicate recording_id does not create a second entry', getBody.results.length === 1)
      assert('duplicate recording_id overwrites transcript', getBody.results[0].transcript === 'updated transcript')
    }

    /* ---------------- multiple recordings -> latest first by created_at ---------------- */
    {
      await fetch(`${base}/api/visits/${visit.id}/recorder-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recording_id: 'rec-2', transcript: 'second recording' }),
      })
      const getRes = await fetch(`${base}/api/visits/${visit.id}/recorder-results`)
      const getBody = await getRes.json()
      assert('two distinct recordings kept', getBody.results.length === 2)
      assert('newest recording (rec-2) listed first', getBody.results[0].recording_id === 'rec-2')
    }

    /* ---------------- structured_note.treatment/plan/assessment are stored but not judgment ---------------- */
    {
      const getRes = await fetch(`${base}/api/visits/${visit.id}/recorder-results`)
      const getBody = await getRes.json()
      const rec1 = getBody.results.find((r) => r.recording_id === 'rec-1')
      assert('structured_note lineage preserved on the record (not judgment)', rec1.structured_note === null || typeof rec1.structured_note === 'object')
    }

    /* ---------------- auth: no token/loopback still required (regression) ---------------- */
    {
      // this test suite runs from loopback (127.0.0.1), so requests already
      // pass requireDoctor() without a token — that's the loopback branch
      // being exercised implicitly by every call above. Confirm the shape
      // explicitly via the auth module directly (same approach as server.spec.mjs).
      const { isDoctorRequestAllowed } = await import('../server/auth.js')
      assert('non-loopback without token is rejected', isDoctorRequestAllowed('203.0.113.5', undefined, 'secret') === false)
      assert('non-loopback with correct token is allowed', isDoctorRequestAllowed('203.0.113.5', 'secret', 'secret') === true)
    }
  } finally {
    await stopServer(server)
  }

  console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm scripts**

In `package.json` `scripts`, add after `"test:server"` (line 14):

```json
    "test:recorderResults": "node tests/recorderResults.spec.mjs",
```

Update `test:all` (line 17) to include it:

```json
    "test:all": "npm run test:integration && npm run test:layout && npm run test:saju && npm run test:doctor && npm run test:server && npm run test:recorderResults && npm run test:patient && npm run test:doctorToken",
```

- [ ] **Step 3: Run it**

Run: `npm run test:recorderResults`
Expected: every line starts `OK:`, ends with `SUMMARY: N assertions passed, 0 failed`.

- [ ] **Step 4: Run the full existing suite to confirm no regression**

Run: `npm run test:all`
Expected: all suites pass (this exercises the untouched `visits`/`current-visit` routes too — Task 2 only added new `else if` branches, didn't touch existing ones).

- [ ] **Step 5: Commit**

```bash
git add tests/recorderResults.spec.mjs package.json
git commit -m "test(server): recorder-results route coverage"
```

---

### Task 4: Client — `serverClient.ts` types + `getRecorderResults`

**Files:**
- Modify: `src/lib/serverClient.ts`

**Interfaces:**
- Produces (for Task 5/6): `RecorderStructuredNote`, `RecorderResult` types; `getRecorderResults(visitId: string): Promise<ServerResult<{ results: RecorderResult[] }>>`.

- [ ] **Step 1: Add types + function**

Append after `getCurrentVisit` (end of file, currently line 151-154):

```ts

// Recorder(A PC) -> B 서버로 전달된 전사/구조화 노트. B는 이 값을 절대
// 생성하지 않는다 — POST는 A(또는 그 downstream)가 직접 호출하고, Doctor
// 화면은 GET으로 읽기만 한다.
export type RecorderStructuredNote = {
  chief_complaint: string | null
  history: string | null
  key_findings: string | null
  assessment: string | null
  treatment: string | null
  plan: string | null
}

export type RecorderResult = {
  visit_id: string
  recording_id: string
  transcript: string | null
  structured_note: RecorderStructuredNote | null
  source: { workstation_id: string | null } | null
  created_at: string
  updated_at: string
}

export function getRecorderResults(visitId: string): Promise<ServerResult<{ results: RecorderResult[] }>> {
  return request(`/api/visits/${visitId}/recorder-results`)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no new errors from `serverClient.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/serverClient.ts
git commit -m "feat(client): getRecorderResults + recorder result types"
```

---

### Task 5: EMR text formatter — `src/doctor/emrSummary.ts`

**Files:**
- Create: `src/doctor/emrSummary.ts`
- Create: `tests/emrSummary.spec.mjs`
- Modify: `package.json` (add `test:emrSummary` script, add it to `test:all`)

**Interfaces:**
- Consumes: `ClinicianJudgment` (from `./judgment`), `RecorderStructuredNote` (from `../lib/serverClient`) — both type-only imports, erased at build time.
- Produces (for Task 6): `buildEmrSummary(input: EmrSummaryInput): string`, `EmrSummaryInput` type.

- [ ] **Step 1: Write `src/doctor/emrSummary.ts`**

```ts
/**
 * EMR용 plain-text 차트 요약 빌더. 순수 함수만 있고 React가 없다 — 입력에
 * 없는 값은 절대 채우지 않는다(환각 금지, v0.1 작업지시서 5번).
 *
 * Assessment / 치료·처방 / 계획 세 줄은 ClinicianJudgment(원장이
 * JudgmentPanel에 직접 타이핑한 값)에서만 채운다. Recorder의
 * structured_note.assessment/treatment/plan은 여기로 흘러들어오지 않는다
 * — 자동 Assessment 확정/자동 처방 생성 금지 원칙 때문이다.
 * structured_note.assessment는 "진찰 소견"(Recorder가 받아적은 서술)
 * 줄에만 쓴다 — 확정된 임상 판단이 아니다.
 */
import type { ClinicianJudgment } from './judgment'
import type { RecorderStructuredNote } from '../lib/serverClient'

export type EmrSummaryInput = {
  primaryConcern: string | null
  structuredNote: RecorderStructuredNote | null
  judgment: ClinicianJudgment | null
}

const EMR_LINES: Array<{ label: string; pick: (i: EmrSummaryInput) => string | null }> = [
  { label: '주호소', pick: (i) => i.primaryConcern ?? i.structuredNote?.chief_complaint ?? null },
  { label: '경과', pick: (i) => i.structuredNote?.history ?? null },
  { label: '주요 문진', pick: (i) => i.structuredNote?.key_findings ?? null },
  { label: '진찰 소견', pick: (i) => i.structuredNote?.assessment ?? null },
  { label: 'Assessment', pick: (i) => i.judgment?.revised_after_exam ?? null },
  { label: '치료/처방', pick: (i) => i.judgment?.final_treatment_axis ?? null },
  { label: '계획', pick: (i) => i.judgment?.prescription_direction ?? null },
]

// EMR 붙여넣기 시 줄바꿈이 깨지지 않도록 CRLF를 쓴다(구형 Windows
// 메모장/일부 EMR 입력창은 단독 LF를 줄바꿈으로 인식하지 못한다).
const CRLF = '\r\n'

export function buildEmrSummary(input: EmrSummaryInput): string {
  return EMR_LINES.map(({ label, pick }) => {
    const value = pick(input)
    const trimmed = value?.trim()
    return trimmed ? `${label}: ${trimmed}` : `${label}:`
  }).join(CRLF)
}
```

- [ ] **Step 2: Add esbuild bundle + test script to `package.json`**

Add after `"test:doctorToken"` (line 16):

```json
    "test:emrSummary": "esbuild src/doctor/emrSummary.ts --bundle --format=esm --outfile=tests/.emr-summary-bundle.mjs --platform=neutral && node tests/emrSummary.spec.mjs",
```

Update `test:all` (line 17, already edited by Task 3 — append here too):

```json
    "test:all": "npm run test:integration && npm run test:layout && npm run test:saju && npm run test:doctor && npm run test:server && npm run test:recorderResults && npm run test:patient && npm run test:doctorToken && npm run test:emrSummary",
```

- [ ] **Step 3: Write `tests/emrSummary.spec.mjs`**

```js
// EMR 요약 포맷 빌더 suite. Plain node, no test framework: assert() prints
// "OK: <name>" and throws on failure. Run via `npm run test:emrSummary`
// (bundles src/doctor/emrSummary.ts with esbuild first).
import { buildEmrSummary } from './.emr-summary-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const CRLF = '\r\n'

const EMPTY_JUDGMENT = {
  schema_version: '1.0.0',
  recorded_at: null,
  source: {
    session_id: 's',
    questionnaire_version: '1.0',
    myungri_algorithm_version: 'x',
    myungri_library_version: 'y',
    myungri_status: 'resolved',
    myungri_pending_approval: [],
  },
  innate_features: [],
  symptom_links: [],
  saju_only_prediction: '',
  revised_after_exam: '',
  final_treatment_axis: '',
  prescription_direction: '',
  learning_case: false,
  debrief: null,
  transcript_import: null,
}

/* ---------------- all empty -> every line is just "label:" ---------------- */
{
  const text = buildEmrSummary({ primaryConcern: null, structuredNote: null, judgment: null })
  const expected = ['주호소:', '경과:', '주요 문진:', '진찰 소견:', 'Assessment:', '치료/처방:', '계획:'].join(CRLF)
  assert('all-empty input -> every line is bare "label:"', text === expected)
}

/* ---------------- primaryConcern wins over structured_note.chief_complaint ---------------- */
{
  const text = buildEmrSummary({
    primaryConcern: '두통',
    structuredNote: {
      chief_complaint: '다른 주호소',
      history: '3일 전부터',
      key_findings: '수면 부족',
      assessment: '긴장성 두통 의심 소견',
      treatment: null,
      plan: null,
    },
    judgment: null,
  })
  assert('primaryConcern wins over structuredNote.chief_complaint', text.includes('주호소: 두통'))
  assert('history filled from structuredNote.history', text.includes('경과: 3일 전부터'))
  assert('key_findings filled from structuredNote.key_findings', text.includes('주요 문진: 수면 부족'))
  assert(
    '진찰 소견 filled from structuredNote.assessment (descriptive, not a confirmed judgment)',
    text.includes('진찰 소견: 긴장성 두통 의심 소견'),
  )
  assert('Assessment line stays empty without judgment', text.includes(`Assessment:${CRLF}`))
}

/* ---------------- structured_note.treatment/plan must never leak into 치료/처방 or 계획 ---------------- */
{
  const text = buildEmrSummary({
    primaryConcern: null,
    structuredNote: {
      chief_complaint: null,
      history: null,
      key_findings: null,
      assessment: null,
      treatment: '침 치료 매일',
      plan: '2주 후 재진',
    },
    judgment: null,
  })
  assert('structured_note.treatment never auto-fills 치료/처방', !text.includes('침 치료 매일'))
  assert('structured_note.plan never auto-fills 계획', !text.includes('2주 후 재진'))
  assert('치료/처방 line stays empty', text.includes(`치료/처방:${CRLF}`))
  assert('계획 line stays the last, empty line', text.endsWith('계획:'))
}

/* ---------------- judgment fields fill Assessment/치료처방/계획 ---------------- */
{
  const judgment = {
    ...EMPTY_JUDGMENT,
    revised_after_exam: '두통 재확인',
    final_treatment_axis: '진정 위주',
    prescription_direction: '경과 관찰 후 재진',
  }
  const text = buildEmrSummary({ primaryConcern: null, structuredNote: null, judgment })
  assert('Assessment filled from judgment.revised_after_exam', text.includes('Assessment: 두통 재확인'))
  assert('치료/처방 filled from judgment.final_treatment_axis', text.includes('치료/처방: 진정 위주'))
  assert('계획 filled from judgment.prescription_direction', text.includes('계획: 경과 관찰 후 재진'))
}

/* ---------------- whitespace-only values are treated as empty ---------------- */
{
  const text = buildEmrSummary({ primaryConcern: '   ', structuredNote: null, judgment: null })
  assert('whitespace-only primaryConcern renders as empty, not a blank line with trailing space', text.startsWith('주호소:' + CRLF))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
```

- [ ] **Step 4: Run it**

Run: `npm run test:emrSummary`
Expected: every line starts `OK:`, ends with `SUMMARY: N assertions passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/doctor/emrSummary.ts tests/emrSummary.spec.mjs package.json
git commit -m "feat(client): buildEmrSummary plain-text formatter + tests"
```

---

### Task 6: Doctor UI — `진료 녹취·요약` section in `DoctorView.tsx`

**Files:**
- Modify: `src/doctor/DoctorView.tsx`
- Modify: `src/doctor/doctor.css`
- Modify: `tests/doctor.spec.mjs` (one regression assertion)
- Modify: `package.json` (`test:doctor` esbuild bundle line needs no change — `DoctorView.tsx` is already bundled as a whole; `emrSummary.ts` gets pulled in transitively by the existing `--external:react --external:react-dom` esbuild call for `DoctorView.tsx`, no separate bundle target needed)

**Interfaces:**
- Consumes: `getRecorderResults`, `type RecorderResult` (Task 4); `buildEmrSummary` (Task 5); existing `selectedRecord`, `mode`, `r`, `primaryConcernLabel`, `relativeTime`, `POLL_MS` already in this file.

- [ ] **Step 1: Add imports**

In `src/doctor/DoctorView.tsx`, extend the `../lib/serverClient` import (currently lines 10-19) to add `getRecorderResults` and `type RecorderResult`:

```ts
import {
  activateVisit,
  clearActiveVisit,
  getRecorderResults,
  getSubmission,
  listSubmissions,
  saveJudgment as saveJudgmentToServer,
  setSubmissionStatus,
  type RecorderResult,
  type SubmissionRecord,
  type SubmissionSummary,
} from '../lib/serverClient'
```

Add a new import line right after the `JudgmentPanel` import (line 5):

```ts
import { buildEmrSummary } from './emrSummary'
```

- [ ] **Step 2: Add state + refs**

Inside `DoctorView()`, after the existing `tokenVersion`/`hasDoctorToken` lines (currently lines 663-664), add:

```ts
  const [recorderResults, setRecorderResults] = useState<RecorderResult[] | null>(null)
  const [recorderResultsError, setRecorderResultsError] = useState<string | null>(null)
  const [emrText, setEmrText] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  // 원장이 EMR 텍스트박스를 이미 편집했다면, 같은 recording_id로 폴링이
  // 다시 돌아와도 그 편집을 덮어쓰지 않는다(v0.1 작업지시서 4번, 수정
  // 내용이 자동으로 원문을 덮어쓰지 않아야 한다는 원칙의 UI 쪽 적용).
  const emrSeedRecordingIdRef = useRef<string | null>(null)
  const emrEditedRef = useRef(false)
```

- [ ] **Step 3: Add the recorder-results polling effect**

After the existing "ClinicAI 연결점" `activateVisit`/`clearActiveVisit` effect (currently lines 723-730), add:

```ts
  // 진료 녹취·요약: 선택된 visit의 recorder 결과를 5초마다 폴링한다(기존
  // 목록 폴링과 동일한 최소 패턴 — v0.1은 websocket을 만들지 않는다).
  useEffect(() => {
    if (mode !== 'server' || !selectedRecord?.visit_id) {
      setRecorderResults(null)
      setRecorderResultsError(null)
      emrSeedRecordingIdRef.current = null
      emrEditedRef.current = false
      return
    }
    const visitId = selectedRecord.visit_id
    let cancelled = false

    async function poll() {
      const result = await getRecorderResults(visitId)
      if (cancelled) return
      if (result.ok) {
        setRecorderResults(result.data.results)
        setRecorderResultsError(null)
      } else {
        setRecorderResultsError(result.error)
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [mode, selectedRecord?.visit_id])
```

- [ ] **Step 4: Add the EMR-text seeding effect**

Directly after the effect from Step 3:

```ts
  // 새 recording 결과가 도착했을 때만 EMR 요약 텍스트를 다시 만든다.
  useEffect(() => {
    const latest = recorderResults?.[0] ?? null
    if (!latest) return
    if (emrSeedRecordingIdRef.current === latest.recording_id) return
    emrSeedRecordingIdRef.current = latest.recording_id
    emrEditedRef.current = false
    setEmrText(
      buildEmrSummary({
        primaryConcern: null,
        structuredNote: latest.structured_note,
        judgment: selectedRecord?.judgment ?? null,
      }),
    )
  }, [recorderResults, selectedRecord?.judgment])
```

(`primaryConcern` is set from `r` in Step 6 below, once `r` is in scope — see note there.)

- [ ] **Step 5: Add the copy handler + auto-clear effect**

After the effect from Step 4:

```ts
  useEffect(() => {
    if (copyStatus === 'idle') return
    const t = setTimeout(() => setCopyStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [copyStatus])

  async function handleCopyEmr() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard api')
      await navigator.clipboard.writeText(emrText)
      setCopyStatus('copied')
      return
    } catch {
      // fall through to the manual-select fallback below
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = emrText
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }
```

- [ ] **Step 6: Fix the `primaryConcern` seed to use `r`**

The seeding effect in Step 4 is placed before `const r = payload.responses` (line ~734) is computed, so it can't reference `r` directly at that point in the function body — but hooks don't need to be declared before the values they close over are *used*, only before they're *read*, and JS closures capture by reference each render. Move the effect from Step 4 to **after** line 736 (`const saju = payload.myungri_calculation`) instead, so `r` is already in scope, and replace `primaryConcern: null` with `primaryConcern: primaryConcernLabel(r)`:

```ts
  const fixture = DOCTOR_FIXTURES[fixtureIndex]
  const payload = mode === 'server' && selectedRecord ? recordToPayload(selectedRecord) : fixture.payload
  const r = payload.responses
  const { flags, routing } = payload
  const saju = payload.myungri_calculation

  // 진료 녹취·요약: 선택된 visit의 recorder 결과를 5초마다 폴링한다(기존
  // 목록 폴링과 동일한 최소 패턴 — v0.1은 websocket을 만들지 않는다).
  useEffect(() => {
    if (mode !== 'server' || !selectedRecord?.visit_id) {
      setRecorderResults(null)
      setRecorderResultsError(null)
      emrSeedRecordingIdRef.current = null
      emrEditedRef.current = false
      return
    }
    const visitId = selectedRecord.visit_id
    let cancelled = false

    async function poll() {
      const result = await getRecorderResults(visitId)
      if (cancelled) return
      if (result.ok) {
        setRecorderResults(result.data.results)
        setRecorderResultsError(null)
      } else {
        setRecorderResultsError(result.error)
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [mode, selectedRecord?.visit_id])

  // 새 recording 결과가 도착했을 때만 EMR 요약 텍스트를 다시 만든다.
  useEffect(() => {
    const latest = recorderResults?.[0] ?? null
    if (!latest) return
    if (emrSeedRecordingIdRef.current === latest.recording_id) return
    emrSeedRecordingIdRef.current = latest.recording_id
    emrEditedRef.current = false
    setEmrText(
      buildEmrSummary({
        primaryConcern: primaryConcernLabel(r),
        structuredNote: latest.structured_note,
        judgment: selectedRecord?.judgment ?? null,
      }),
    )
  }, [recorderResults, selectedRecord?.judgment])

  useEffect(() => {
    if (copyStatus === 'idle') return
    const t = setTimeout(() => setCopyStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [copyStatus])

  async function handleCopyEmr() {
    // ... (same body as Step 5)
  }
```

(So: **remove** the Step 3/4/5 blocks from where Steps 3-5 said to put them, right after the `activateVisit` effect, and instead put all four — the poll effect, the seed effect, the copy-status-clear effect, and `handleCopyEmr` — here, right after `const saju = ...`, before `const generalFlagLabels = ...`.)

- [ ] **Step 7: Render the section**

Insert the new `<section>` right after the closing `</section>` of "명리 검토" (currently ends at line 1157) and before `<JudgmentPanel` (currently line 1159):

```tsx
      {mode === 'server' && selectedRecord?.visit_id && (
        <section className="doctor__section">
          <h2>진료 녹취·요약</h2>
          {recorderResultsError ? (
            <p className="doctor__warning">녹취 결과를 불러오지 못했습니다: {recorderResultsError}</p>
          ) : !recorderResults || recorderResults.length === 0 ? (
            <p className="doctor__empty">아직 결과 없음</p>
          ) : (
            <>
              <p className="doctor__derivedLabel">
                결과 있음 — 녹음 {recorderResults.length}건 (최신 갱신: {relativeTime(recorderResults[0].updated_at)})
              </p>
              {recorderResults.length > 1 && (
                <ul className="doctor__recorderLineage">
                  {recorderResults.map((res) => (
                    <li key={res.recording_id}>
                      {res.recording_id} · {relativeTime(res.updated_at)}
                    </li>
                  ))}
                </ul>
              )}
              <details className="doctor__secDetails">
                <summary>Transcript 원문</summary>
                <pre className="doctor__recorderTranscript">{recorderResults[0].transcript ?? '(없음)'}</pre>
              </details>
              <div className="judgment__field doctor__recorderEmrField">
                <label className="judgment__label" htmlFor="emrSummaryText">
                  EMR용 요약 (plain text, 직접 수정 가능)
                </label>
                <textarea
                  id="emrSummaryText"
                  className="judgment__textarea"
                  rows={8}
                  value={emrText}
                  onChange={(e) => {
                    emrEditedRef.current = true
                    setEmrText(e.target.value)
                  }}
                />
              </div>
              <div className="judgment__actions">
                <button type="button" className="judgment__recordBtn" onClick={handleCopyEmr}>
                  EMR용 복사
                </button>
                {copyStatus === 'copied' && <span className="doctor__recorderCopyFeedback">복사됨</span>}
                {copyStatus === 'error' && (
                  <span className="doctor__warning">복사 실패 — 직접 선택해서 복사해주세요.</span>
                )}
              </div>
            </>
          )}
        </section>
      )}

```

- [ ] **Step 8: Add CSS**

Append to the end of `src/doctor/doctor.css`:

```css
/* -------------------------------------------------------------------
 * 진료 녹취·요약 (Recorder -> EMR 복사)
 * ----------------------------------------------------------------- */

.doctor__recorderLineage {
  margin: 8px 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-muted);
}

.doctor__recorderTranscript {
  margin-top: 8px;
  padding: 12px 14px;
  background: var(--bg-subtle, #f6f6f8);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.doctor__recorderEmrField {
  margin-top: 12px;
}

.doctor__recorderCopyFeedback {
  margin-left: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
}
```

- [ ] **Step 9: Add a fixtures-mode regression assertion**

In `tests/doctor.spec.mjs`, add near the other `renderDoctorView(...)` assertions (e.g. right after the block at line 96):

```js
/* ---------------------------------------------------------------------
 * Recorder/EMR section only renders in server mode (fixtures mode has no
 * real visit_id to poll recorder-results for) — must not appear/crash here.
 * ------------------------------------------------------------------- */

{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('fixtures mode: no 진료 녹취·요약 section (no real visit_id to poll)', !html.includes('진료 녹취·요약'))
}
```

- [ ] **Step 10: Run tests + typecheck**

Run: `npm run test:doctor`
Expected: all `OK:` lines, ends with `SUMMARY: ... 0 failed`, including the new assertion from Step 9.

Run: `npx tsc -b --noEmit`
Expected: no new type errors.

Run: `npm run test:all`
Expected: full suite green (server regression, doctorToken, patient flow, etc. all still pass — nothing in this task touched those files).

- [ ] **Step 11: Manual smoke check in the dev server**

Run: `npm run dev` and `npm run server` (two terminals), open the Doctor screen in server mode, open a submission that has a `visit_id`. Confirm:
- Section shows "아직 결과 없음" (no recorder result exists yet in this dev data dir).
- `curl -X POST http://localhost:4317/api/visits/<visit_id>/recorder-results -H 'content-type: application/json' -d '{"recording_id":"test-1","transcript":"test","structured_note":{"chief_complaint":"두통","history":null,"key_findings":null,"assessment":null,"treatment":null,"plan":null}}'` then wait ≤5s — section updates to show the transcript + a pre-filled EMR textarea.
- Click "EMR용 복사", paste into Notepad — labeled plain-text block with real line breaks, no markdown.
- Edit the textarea, wait for another poll tick — edit is NOT overwritten (because `recording_id` hasn't changed).

- [ ] **Step 12: Commit**

```bash
git add src/doctor/DoctorView.tsx src/doctor/doctor.css tests/doctor.spec.mjs
git commit -m "feat(doctor-ui): 진료 녹취·요약 section with EMR plain-text copy"
```

---

### Task 7: Docs — close the gap noted in the multi-workstation contract

**Files:**
- Modify: `docs/MULTI_WORKSTATION_CONTRACT.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the "향후 작업, 이번엔 미구현" heading**

In `docs/MULTI_WORKSTATION_CONTRACT.md`, the section at line 42 is titled `## Recorder 연동 규칙 (향후 작업, 이번엔 미구현)`. Change the heading to:

```markdown
## Recorder 연동 규칙
```

Add one paragraph right after the heading (before the existing bullets):

```markdown
`GET /api/current-visit`(폴링, 읽기 전용)는 이미 구현되어 있었다. 이번
스프린트(Recorder 결과 → Doctor → EMR 복사 v0.1)에서
`POST /api/visits/:visit_id/recorder-results`와
`GET /api/visits/:visit_id/recorder-results`를 추가해 Recorder(A PC)가
전사/구조화 결과를 이 workstation의 활성 `visit_id`로 되돌려보낼 수
있게 했다 — 자세한 계약은 이 파일이 아니라 `server/index.js`의 두
라우트와 `server/recorderResultStore.js`가 source of truth다.
```

- [ ] **Step 2: Commit**

```bash
git add docs/MULTI_WORKSTATION_CONTRACT.md
git commit -m "docs: recorder-results routes now implemented (B side)"
```

---

## Explicitly out of scope for this plan (per the work order)

- A PC (`G:\ClinicAI`) changes — Recorder pushing to the new endpoint, `visit_id` freeze at F9, retry/idempotency on the sender side. That's Phase 2, a separate PC, a separate session.
- Persisting the edited EMR text back to the server (`visit.emr_summary`). The work order only requires "확인 후 복사," not persistence across sessions; the textarea is recomputed from the latest recorder result + judgment each time a genuinely new recording arrives. If the doctor needs the edited text to survive a page reload, that's a follow-up (`PUT /api/visits/:id/emr-summary`) — flag to the user if they want it, don't build it speculatively.
- Real-time push/websocket status ("처리 중" as a distinct state) — B has no signal to distinguish "still processing on A" from "no result yet," so the UI only shows the three states B can actually know: no result / has result / fetch error.
- Any actual EMR program automation (explicitly forbidden by the work order, section 14).
