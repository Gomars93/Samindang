// Handoff server suite. Plain node, no test framework: assert() prints
// "OK: <name>" and throws on failure. Starts the real server on an ephemeral
// port with a temp data dir and exercises real HTTP end to end.
import assert2 from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../server/index.js'
import { createStore } from '../server/store.js'
import { isDoctorRequestAllowed, isOriginAllowedForDoctor } from '../server/auth.js'

let passCount = 0

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

function validPayload(overrides = {}) {
  return {
    questionnaire_version: '1.0',
    session_id: 'sess-1',
    responses: {
      patient: { patient_name: '홍길동', phone_last4: '1234' },
    },
    flags: { requires_staff_check: false },
    routing: { primary_module: 'Sleep' },
    myungri_calculation: { status: 'resolved' },
    metadata: { session_started_at: null, answers: {} },
    ...overrides,
  }
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

async function main() {
  // audit.log lives at dataDir/../audit.log (server/audit.js) — nest dataDir
  // one level under the mkdtemp root so the audit log stays isolated to this
  // test run instead of landing directly in the shared OS temp dir.
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-test-'))
  const dataDir = path.join(tmpRoot, 'submissions')
  const auditLogPath = path.join(tmpRoot, 'audit.log')
  let { server, base } = await startServer(dataDir)

  try {
    /* ---------------- health ---------------- */
    {
      const res = await fetch(`${base}/api/health`)
      const body = await res.json()
      assert('GET /api/health -> ok', res.status === 200 && body.ok === true && typeof body.version === 'string')
    }

    /* ---------------- POST valid submission -> 201, minimal body ---------------- */
    let createdId
    {
      const res = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validPayload()),
      })
      const body = await res.json()
      assert('POST valid submission -> 201', res.status === 201)
      assert('POST response has only id + created_at', Object.keys(body).sort().join(',') === 'created_at,id')
      assert('POST response id is a string', typeof body.id === 'string')
      createdId = body.id
    }

    /* ---------------- POST invalid body -> 400 ---------------- */
    {
      const res1 = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([1, 2, 3]),
      })
      assert('POST array body -> 400', res1.status === 400)

      const res2 = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionnaire_version: '1.0' }), // missing responses
      })
      assert('POST missing responses -> 400', res2.status === 400)
    }

    /* ---------------- POST >1MB body -> 413 ---------------- */
    {
      const huge = validPayload({ padding: 'x'.repeat(2 * 1024 * 1024) })
      const res = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(huge),
      })
      assert('POST >1MB body -> 413', res.status === 413)
    }

    /* ---------------- GET list (loopback) ---------------- */
    {
      const res = await fetch(`${base}/api/submissions`)
      const list = await res.json()
      assert('GET /api/submissions -> 200', res.status === 200)
      const found = list.find((s) => s.id === createdId)
      assert('new submission appears in list', !!found)
      assert('summary has no responses object', found.responses === undefined)
      assert('summary has patient_label', typeof found.patient_label === 'string')
    }

    /* ---------------- CORS / origin guard on doctor routes ---------------- */
    {
      const evilRes = await fetch(`${base}/api/submissions`, {
        headers: { origin: 'https://evil.example.com' },
      })
      const evilBody = await evilRes.text()
      assert('GET /api/submissions with evil Origin -> 403', evilRes.status === 403)
      assert('evil Origin response has no patient_label', !evilBody.includes('patient_label'))
      assert('evil Origin response has no submission id', !evilBody.includes(createdId))

      const localRes = await fetch(`${base}/api/submissions`, {
        headers: { origin: 'http://localhost:5173' },
      })
      assert('GET /api/submissions with localhost Origin -> 200', localRes.status === 200)
      assert(
        'localhost Origin echoed exactly in access-control-allow-origin',
        localRes.headers.get('access-control-allow-origin') === 'http://localhost:5173',
      )
      assert('doctor response has vary: origin', (localRes.headers.get('vary') ?? '').toLowerCase().includes('origin'))

      const noOriginRes = await fetch(`${base}/api/submissions`)
      assert('GET /api/submissions with no Origin -> 200 (non-browser client)', noOriginRes.status === 200)

      const preflight = await fetch(`${base}/api/submissions`, {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'GET' },
      })
      assert(
        'OPTIONS preflight on doctor route with evil Origin has no permissive allow-origin',
        preflight.headers.get('access-control-allow-origin') !== 'https://evil.example.com' &&
          preflight.headers.get('access-control-allow-origin') !== '*',
      )

      const patientPostRes = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
        body: JSON.stringify(validPayload({ session_id: 'sess-arbitrary-origin' })),
      })
      assert('POST submission with arbitrary Origin still works -> 201', patientPostRes.status === 201)
    }

    /* ---------------- GET one ---------------- */
    let recordBefore
    {
      const res = await fetch(`${base}/api/submissions/${createdId}`)
      recordBefore = await res.json()
      assert('GET /api/submissions/:id -> 200', res.status === 200)
      assert('record has separate submission key', typeof recordBefore.submission === 'object')
      assert('record has separate myungri key', typeof recordBefore.myungri === 'object')
      assert('record has judgment key (null initially)', recordBefore.judgment === null)
    }

    /* ---------------- status transition doesn't touch submission/myungri ---------------- */
    {
      const res = await fetch(`${base}/api/submissions/${createdId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'viewed' }),
      })
      const updated = await res.json()
      assert('status transition -> 200', res.status === 200)
      assert('status actually changed', updated.status === 'viewed')
      assert(
        'status transition leaves submission unchanged',
        (() => {
          try {
            assert2.deepStrictEqual(updated.submission, recordBefore.submission)
            return true
          } catch {
            return false
          }
        })(),
      )
      assert(
        'status transition leaves myungri unchanged',
        (() => {
          try {
            assert2.deepStrictEqual(updated.myungri, recordBefore.myungri)
            return true
          } catch {
            return false
          }
        })(),
      )
    }

    /* ---------------- judgment PUT stores + persists, submission unchanged ---------------- */
    {
      const judgment = {
        schema_version: '1.0.0',
        recorded_at: new Date().toISOString(),
        source: { session_id: 'sess-1', questionnaire_version: '1.0' },
        innate_features: ['a'],
        symptom_links: [],
        saju_only_prediction: '',
        revised_after_exam: '',
        final_treatment_axis: '',
        prescription_direction: '',
        learning_case: false,
        debrief: null,
        transcript_import: null,
      }
      const putRes = await fetch(`${base}/api/submissions/${createdId}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(judgment),
      })
      assert('PUT judgment -> 200', putRes.status === 200)

      const getRes = await fetch(`${base}/api/submissions/${createdId}`)
      const record = await getRes.json()
      assert('judgment persisted on GET', record.judgment && record.judgment.innate_features[0] === 'a')
      assert(
        'judgment save leaves submission unchanged',
        (() => {
          try {
            assert2.deepStrictEqual(record.submission, recordBefore.submission)
            return true
          } catch {
            return false
          }
        })(),
      )
    }

    /* ---------------- restart persistence ---------------- */
    {
      await stopServer(server)
      const restarted = await startServer(dataDir)
      server = restarted.server
      base = restarted.base

      const res = await fetch(`${base}/api/submissions`)
      const list = await res.json()
      assert('restart: submission still listed after server restart', list.some((s) => s.id === createdId))
    }

    /* ---------------- idempotency: duplicate session_id ---------------- */
    {
      const payload = validPayload({ session_id: 'sess-dup-single' })
      const res1 = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body1 = await res1.json()
      assert('first POST of a session_id -> 201', res1.status === 201)

      const res2 = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body2 = await res2.json()
      assert('second POST of same session_id -> 200 (not 201)', res2.status === 200)
      assert('second POST marked duplicate:true', body2.duplicate === true)
      assert('second POST returns the SAME id as the first', body2.id === body1.id)

      const list = await (await fetch(`${base}/api/submissions`)).json()
      assert(
        'duplicate session_id resulted in exactly one stored record',
        list.filter((s) => s.id === body1.id).length === 1,
      )
    }

    /* ---------------- idempotency under concurrency: SAME session_id ---------------- */
    {
      const sid = 'sess-dup-concurrent'
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          fetch(`${base}/api/submissions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(validPayload({ session_id: sid })),
          }).then(async (r) => ({ status: r.status, body: await r.json() })),
        ),
      )
      const ids = new Set(results.map((r) => r.body.id))
      assert('5 concurrent POSTs of the same session_id -> a single id', ids.size === 1)
      assert('exactly one 201 among the concurrent duplicate posts', results.filter((r) => r.status === 201).length === 1)
      assert(
        'the other 4 responses are 200 duplicate:true',
        results.filter((r) => r.status === 200 && r.body.duplicate === true).length === 4,
      )

      const list = await (await fetch(`${base}/api/submissions`)).json()
      assert(
        'concurrent same-session posts create exactly one record',
        list.filter((s) => s.id === [...ids][0]).length === 1,
      )
    }

    /* ---------------- concurrency: DIFFERENT session_ids each keep their own myungri ---------------- */
    {
      const inputs = Array.from({ length: 5 }, (_, i) => ({
        session_id: `sess-concurrent-diff-${i}`,
        myungri_calculation: { status: 'resolved', marker: `marker-${i}` },
      }))
      const results = await Promise.all(
        inputs.map((inp) =>
          fetch(`${base}/api/submissions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              validPayload({ session_id: inp.session_id, myungri_calculation: inp.myungri_calculation }),
            ),
          }).then(async (r) => ({ id: (await r.json()).id, ...inp })),
        ),
      )
      assert('5 concurrent different-session POSTs -> 5 distinct ids', new Set(results.map((r) => r.id)).size === 5)

      for (const r of results) {
        const rec = await (await fetch(`${base}/api/submissions/${r.id}`)).json()
        assert(`record for ${r.session_id} keeps its own session_id`, rec.submission.session_id === r.session_id)
        assert(
          `record for ${r.session_id} myungri matches its own submission, not another one`,
          rec.myungri.marker === r.myungri_calculation.marker,
        )
      }

      // simulated multiple-patient submissions: each of the 5 distinct patients
      // also gets its own clinician judgment saved, and reloading confirms it
      // stayed attached to the right patient (not leaked across submissions).
      await Promise.all(
        results.map((r) =>
          fetch(`${base}/api/submissions/${r.id}/judgment`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              schema_version: '1.0.0',
              recorded_at: new Date().toISOString(),
              source: { session_id: r.session_id, questionnaire_version: '1.0' },
              innate_features: [`feature-${r.session_id}`],
              symptom_links: [],
              saju_only_prediction: '',
              revised_after_exam: '',
              final_treatment_axis: '',
              prescription_direction: '',
              learning_case: false,
              debrief: null,
              transcript_import: null,
            }),
          }),
        ),
      )
      for (const r of results) {
        const rec = await (await fetch(`${base}/api/submissions/${r.id}`)).json()
        assert(
          `record for ${r.session_id} judgment matches its own submission, not another one`,
          rec.judgment.innate_features[0] === `feature-${r.session_id}`,
        )
        assert(
          `record for ${r.session_id} judgment.source.session_id matches`,
          rec.judgment.source.session_id === r.session_id,
        )
      }
    }

    /* ---------------- concurrency: status + judgment writes on the SAME id stay well-formed ---------------- */
    {
      const created = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-concurrent-mutate' })),
        })
      ).json()
      const id = created.id
      const before = await (await fetch(`${base}/api/submissions/${id}`)).json()

      const judgment = (n) => ({
        schema_version: '1.0.0',
        recorded_at: new Date().toISOString(),
        source: { session_id: 'sess-concurrent-mutate', questionnaire_version: '1.0' },
        innate_features: [`f${n}`],
        symptom_links: [],
        saju_only_prediction: '',
        revised_after_exam: '',
        final_treatment_axis: '',
        prescription_direction: '',
        learning_case: false,
        debrief: null,
        transcript_import: null,
      })

      await Promise.all([
        fetch(`${base}/api/submissions/${id}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'viewed' }),
        }),
        fetch(`${base}/api/submissions/${id}/judgment`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(judgment(1)),
        }),
        fetch(`${base}/api/submissions/${id}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'in_consultation' }),
        }),
        fetch(`${base}/api/submissions/${id}/judgment`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(judgment(2)),
        }),
      ])

      const after = await (await fetch(`${base}/api/submissions/${id}`)).json()
      assert(
        'concurrent writes: record ends up with one of the written statuses (well-formed)',
        ['viewed', 'in_consultation'].includes(after.status),
      )
      assert(
        'concurrent writes: record ends up with one of the written judgments (well-formed)',
        after.judgment && ['f1', 'f2'].includes(after.judgment.innate_features[0]),
      )
      assert(
        'concurrent writes: submission left untouched',
        (() => {
          try {
            assert2.deepStrictEqual(after.submission, before.submission)
            return true
          } catch {
            return false
          }
        })(),
      )
      assert(
        'concurrent writes: myungri left untouched',
        (() => {
          try {
            assert2.deepStrictEqual(after.myungri, before.myungri)
            return true
          } catch {
            return false
          }
        })(),
      )
    }

    /* ---------------- judgment isolation across two submissions ---------------- */
    {
      const a = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-isolate-a' })),
        })
      ).json()
      const b = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-isolate-b' })),
        })
      ).json()

      const judgmentFor = (label) => ({
        schema_version: '1.0.0',
        recorded_at: new Date().toISOString(),
        source: { session_id: label, questionnaire_version: '1.0' },
        innate_features: [label],
        symptom_links: [],
        saju_only_prediction: '',
        revised_after_exam: '',
        final_treatment_axis: '',
        prescription_direction: '',
        learning_case: false,
        debrief: null,
        transcript_import: null,
      })

      await fetch(`${base}/api/submissions/${a.id}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(judgmentFor('only-on-a')),
      })

      const recA = await (await fetch(`${base}/api/submissions/${a.id}`)).json()
      const recB = await (await fetch(`${base}/api/submissions/${b.id}`)).json()
      assert('judgment saved on submission A appears on A', recA.judgment?.innate_features[0] === 'only-on-a')
      assert('judgment saved on submission A does NOT appear on B', recB.judgment === null)
    }

    /* ---------------- record shape: version traceability ---------------- */
    {
      const versionedPayload = validPayload({
        session_id: 'sess-versions',
        myungri_calculation: {
          status: 'resolved',
          policy: { algorithm_version: '1.0.0' },
          engine: { library_version: '2.0.0' },
        },
      })
      const created = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(versionedPayload),
        })
      ).json()

      const judgment = {
        schema_version: '1.0.0',
        recorded_at: new Date().toISOString(),
        source: { session_id: 'sess-versions', questionnaire_version: '1.0' },
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
      await fetch(`${base}/api/submissions/${created.id}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(judgment),
      })

      const record = await (await fetch(`${base}/api/submissions/${created.id}`)).json()
      assert('stored record has record_schema_version', record.record_schema_version === '1.0.0')
      assert(
        'stored record has submission.questionnaire_version',
        typeof record.submission.questionnaire_version === 'string' && record.submission.questionnaire_version !== '',
      )
      assert(
        'stored record has myungri.policy.algorithm_version',
        typeof record.myungri.policy.algorithm_version === 'string',
      )
      assert(
        'stored record has myungri.engine.library_version',
        typeof record.myungri.engine.library_version === 'string',
      )
      assert('stored record has judgment.schema_version', record.judgment.schema_version === '1.0.0')
    }

    /* ---------------- audit log: one line per event, minimal fields, no payload leakage ---------------- */
    {
      const canaryPayload = validPayload({
        session_id: 'sess-audit-canary',
        responses: {
          patient: { patient_name: 'PRIVACY_CANARY', phone_last4: '9999' },
        },
      })
      const created = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(canaryPayload),
        })
      ).json()
      const auditId = created.id

      await fetch(`${base}/api/submissions/${auditId}`) // doctor view
      await fetch(`${base}/api/submissions/${auditId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'viewed' }),
      })
      await fetch(`${base}/api/submissions/${auditId}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema_version: '1.0.0',
          recorded_at: new Date().toISOString(),
          source: { session_id: 'sess-audit-canary', questionnaire_version: '1.0' },
          innate_features: [],
          symptom_links: [],
          saju_only_prediction: '',
          revised_after_exam: '',
          final_treatment_axis: '',
          prescription_direction: '',
          learning_case: false,
          debrief: null,
          transcript_import: null,
        }),
      })

      const auditRaw = await readFile(auditLogPath, 'utf8')
      const allLines = auditRaw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      const forThisId = allLines.filter((l) => l.submission_id === auditId)

      assert(
        'audit log: exactly one submission_created line',
        forThisId.filter((l) => l.event === 'submission_created').length === 1,
      )
      assert(
        'audit log: exactly one submission_viewed line',
        forThisId.filter((l) => l.event === 'submission_viewed').length === 1,
      )
      assert(
        'audit log: exactly one status_changed line',
        forThisId.filter((l) => l.event === 'status_changed').length === 1,
      )
      assert(
        'audit log: exactly one judgment_saved line',
        forThisId.filter((l) => l.event === 'judgment_saved').length === 1,
      )

      const allowedKeys = new Set(['ts', 'event', 'submission_id', 'status', 'actor'])
      assert(
        'audit log: every line for this submission has ONLY the allowed keys',
        forThisId.length > 0 && forThisId.every((l) => Object.keys(l).every((k) => allowedKeys.has(k))),
      )
      assert(
        'audit log: submission_created actor is patient, everything else is doctor',
        forThisId.find((l) => l.event === 'submission_created')?.actor === 'patient' &&
          forThisId.filter((l) => l.event !== 'submission_created').every((l) => l.actor === 'doctor'),
      )
      assert(
        'audit log: status_changed line carries the status value',
        forThisId.find((l) => l.event === 'status_changed')?.status === 'viewed',
      )
      assert(
        'audit log: the planted PRIVACY_CANARY marker never appears anywhere in the file',
        !auditRaw.includes('PRIVACY_CANARY'),
      )
      assert('audit log: no phone digits from the canary submission leak in', !auditRaw.includes('9999'))
    }
  } finally {
    await stopServer(server)
    await rm(tmpRoot, { recursive: true, force: true })
  }

  /* ---------------- retention cleanup (store-level, no HTTP) ---------------- */
  {
    const retDir = await mkdtemp(path.join(tmpdir(), 'samindang-retention-'))
    try {
      const store = createStore(retDir)
      const rec = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-old', responses: {} },
        myungri: null,
        patient_label: 'old patient',
      })

      // 파일을 직접 백데이트한다 — store에 created_at을 바꾸는 API가 없으므로
      // 테스트 전용으로 파일시스템을 직접 건드린다.
      const filePath = path.join(retDir, `${rec.id}.json`)
      const onDisk = JSON.parse(await readFile(filePath, 'utf8'))
      onDisk.created_at = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
      await writeFile(filePath, JSON.stringify(onDisk, null, 2), 'utf8')

      const deletedWithZero = await store.cleanupOlderThan(0)
      assert('retention: days=0 (disabled) deletes nothing', deletedWithZero === 0)
      assert('retention: days=0 record still present', (await store.getSubmission(rec.id)) !== null)

      const deleted = await store.cleanupOlderThan(1)
      assert('retention: 1-day window deletes the 40-day-old record', deleted === 1)
      assert('retention: record actually removed from disk', (await store.getSubmission(rec.id)) === null)
    } finally {
      await rm(retDir, { recursive: true, force: true })
    }
  }

  /* ---------------- patient path cannot list/read submissions ---------------- */
  {
    const appSrc = await readFile(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')
    assert(
      "patient App.tsx never references listSubmissions/getSubmission (only submits, doesn't read)",
      !appSrc.includes('listSubmissions') && !appSrc.includes('getSubmission'),
    )

    const serverIndexSrc = await readFile(fileURLToPath(new URL('../server/index.js', import.meta.url)), 'utf8')
    const requireDoctorCalls = (serverIndexSrc.match(/!requireDoctor\(req\)/g) ?? []).length
    assert(
      'server has exactly the 4 doctor-guarded routes calling requireDoctor (list/get/status/judgment)',
      requireDoctorCalls === 4,
    )
  }

  /* ---------------- git: no secrets and no runtime patient data tracked ---------------- */
  {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url))
    const tracked = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean)
    assert('git tracks no files under .data/', tracked.filter((f) => f.startsWith('.data/')).length === 0)
    assert(
      'git tracks no .env files',
      tracked.filter((f) => f === '.env' || f.startsWith('.env.')).length === 0,
    )

    let auditLogIgnored = false
    try {
      execSync('git check-ignore .data/audit.log', { cwd: repoRoot, stdio: 'pipe' })
      auditLogIgnored = true
    } catch {
      auditLogIgnored = false
    }
    assert('default audit log path (.data/audit.log) is gitignored', auditLogIgnored)
  }

  /* ---------------- doctor-endpoint guard (unit-level, fake remoteAddress) ---------------- */
  assert(
    'guard: non-loopback + no token -> denied',
    isDoctorRequestAllowed('192.168.0.55', undefined, undefined) === false,
  )
  assert(
    'guard: non-loopback + wrong token -> denied',
    isDoctorRequestAllowed('192.168.0.55', 'wrong', 'secret') === false,
  )
  assert(
    'guard: non-loopback + correct token (token configured) -> allowed',
    isDoctorRequestAllowed('192.168.0.55', 'secret', 'secret') === true,
  )
  assert(
    'guard: loopback (127.0.0.1) + no token -> allowed',
    isDoctorRequestAllowed('127.0.0.1', undefined, undefined) === true,
  )
  assert(
    'guard: loopback (::1) + no token -> allowed',
    isDoctorRequestAllowed('::1', undefined, undefined) === true,
  )

  /* ---------------- isOriginAllowedForDoctor (unit-level) ---------------- */
  assert('origin guard: undefined origin -> allowed (non-browser)', isOriginAllowedForDoctor(undefined, []) === true)
  assert('origin guard: localhost:5173 -> allowed', isOriginAllowedForDoctor('http://localhost:5173', []) === true)
  assert('origin guard: 127.0.0.1:4317 -> allowed', isOriginAllowedForDoctor('http://127.0.0.1:4317', []) === true)
  assert('origin guard: evil origin -> denied', isOriginAllowedForDoctor('https://evil.example.com', []) === false)
  assert(
    'origin guard: evil origin present in allowedOrigins -> allowed',
    isOriginAllowedForDoctor('https://evil.example.com', ['https://evil.example.com']) === true,
  )
  assert(
    'origin guard: allowedOrigins match is case-insensitive',
    isOriginAllowedForDoctor('HTTPS://EVIL.EXAMPLE.COM', ['https://evil.example.com']) === true,
  )

  console.log(`\n${passCount} assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
