// Handoff server suite. Plain node, no test framework: assert() prints
// "OK: <name>" and throws on failure. Starts the real server on an ephemeral
// port with a temp data dir and exercises real HTTP end to end.
import assert2 from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'
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
  const dataDir = await mkdtemp(path.join(tmpdir(), 'samindang-test-'))
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
        body: JSON.stringify(validPayload()),
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
  } finally {
    await stopServer(server)
    await rm(dataDir, { recursive: true, force: true })
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
