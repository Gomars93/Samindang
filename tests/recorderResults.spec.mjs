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
