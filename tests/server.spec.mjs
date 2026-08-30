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
import { __setLastTouchedForTest, isValidWorkstationId } from '../server/activeVisit.js'

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

    /* ---------------- workspace PUT stores + persists, submission/myungri/judgment unchanged (Doctor Clinical Workspace round 2 Phase 2) ---------------- */
    {
      const beforeWorkspace = await (await fetch(`${base}/api/submissions/${createdId}`)).json()
      assert('record has workspace key (null initially)', beforeWorkspace.workspace === null)

      const workspace = {
        schema_version: '1.0.0',
        painExamSuggestions: [
          {
            id: 'slr',
            title: 'SLR',
            priority: 'MUST_CHECK',
            reasonFacts: [],
            source: 'SUGGESTED',
            result: { status: 'POSITIVE', laterality: 'LEFT', note: 'test note', recordedAt: new Date().toISOString() },
          },
        ],
        painFinalAssessment: {
          finalWorkingAssessment: 'wk-a',
          treatmentFocus: '',
          interventionPerformedOrPlanned: '',
          immediateRetestTarget: '',
          recordedAt: new Date().toISOString(),
        },
        painFollowUpTargets: [],
        herbalPatternCandidates: [],
        herbalClinicianObservations: [],
        herbalFinalAssessment: {
          finalPatternOrMechanism: '',
          treatmentPrinciple: '',
          prescriptionPlanNote: '',
          symptomsToTrack: '',
          recordedAt: null,
        },
        herbalFollowUpTargets: [],
        updated_at: new Date().toISOString(),
      }
      const putRes = await fetch(`${base}/api/submissions/${createdId}/workspace`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workspace),
      })
      assert('PUT workspace -> 200', putRes.status === 200)

      const getRes = await fetch(`${base}/api/submissions/${createdId}`)
      const record = await getRes.json()
      assert(
        'workspace persisted on GET',
        record.workspace && record.workspace.painFinalAssessment.finalWorkingAssessment === 'wk-a',
      )
      assert(
        'workspace persisted exam result round-trips exactly (status/laterality/note)',
        record.workspace.painExamSuggestions[0].result.status === 'POSITIVE' &&
          record.workspace.painExamSuggestions[0].result.laterality === 'LEFT' &&
          record.workspace.painExamSuggestions[0].result.note === 'test note',
      )
      assert(
        'workspace save leaves submission unchanged',
        (() => {
          try {
            assert2.deepStrictEqual(record.submission, recordBefore.submission)
            return true
          } catch {
            return false
          }
        })(),
      )
      assert(
        'workspace save leaves myungri unchanged',
        (() => {
          try {
            assert2.deepStrictEqual(record.myungri, recordBefore.myungri)
            return true
          } catch {
            return false
          }
        })(),
      )
      assert(
        'workspace save leaves the previously-saved judgment unchanged',
        record.judgment && record.judgment.innate_features[0] === 'a',
      )

      const unauthedRes = await fetch(`${base}/api/submissions/${createdId}/workspace`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify(workspace),
      })
      assert('PUT workspace without doctor auth -> 403 (same guard as judgment)', unauthedRes.status === 403)

      const missingRes = await fetch(`${base}/api/submissions/00000000-0000-0000-0000-000000000000/workspace`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workspace),
      })
      assert('PUT workspace for unknown id -> 404', missingRes.status === 404)
    }

    /* ---------------- Round 17: optional x-expected-updated-at CAS
       precondition on judgment/workspace saves. Absent, unconditional
       last-write-wins exactly as every test above already exercises;
       supplied and matching, succeeds; supplied and stale (someone else's
       write landed since the caller last read), refused with 409 and the
       server-authoritative current record handed back so the client can
       merge/re-apply without a second round trip. ---------------- */
    {
      const currentBefore = await (await fetch(`${base}/api/submissions/${createdId}`)).json()
      const staleUpdatedAt = currentBefore.updated_at

      const judgmentV2 = {
        recorded_at: new Date().toISOString(),
        source: { session_id: 'sess-1', questionnaire_version: '1.0' },
        innate_features: ['cas-v2'],
        symptom_links: [],
        saju_only_prediction: '',
        revised_after_exam: '',
        final_treatment_axis: '',
        prescription_direction: '',
        learning_case: false,
        debrief: null,
        transcript_import: null,
      }
      const casMatchRes = await fetch(`${base}/api/submissions/${createdId}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-expected-updated-at': staleUpdatedAt },
        body: JSON.stringify(judgmentV2),
      })
      assert('PUT judgment with a MATCHING x-expected-updated-at -> 200 (precondition holds)', casMatchRes.status === 200)
      const afterV2 = await (await fetch(`${base}/api/submissions/${createdId}`)).json()
      assert('the matching-precondition judgment save actually took effect', afterV2.judgment.innate_features[0] === 'cas-v2')
      assert('a successful save changes updated_at (staleUpdatedAt is now genuinely stale)', afterV2.updated_at !== staleUpdatedAt)

      const judgmentV3 = { ...judgmentV2, innate_features: ['cas-v3-should-be-refused'] }
      const casStaleRes = await fetch(`${base}/api/submissions/${createdId}/judgment`, {
        method: 'PUT',
        // Deliberately reusing the NOW-STALE updated_at from before the v2
        // save above -- simulates a second Doctor Workspace tab (or a
        // stale GET) whose in-memory copy predates v2's write.
        headers: { 'content-type': 'application/json', 'x-expected-updated-at': staleUpdatedAt },
        body: JSON.stringify(judgmentV3),
      })
      assert('PUT judgment with a STALE x-expected-updated-at -> 409 (lost-update refused, not silently overwritten)', casStaleRes.status === 409)
      const casStaleBody = await casStaleRes.json()
      assert('the 409 body reports conflict', casStaleBody.error === 'conflict')
      assert(
        'the 409 body hands back the CURRENT (v2) record, not the caller\'s stale view -- server-authoritative state wins',
        casStaleBody.current?.judgment?.innate_features?.[0] === 'cas-v2',
      )
      const afterRefusedWrite = await (await fetch(`${base}/api/submissions/${createdId}`)).json()
      assert('the refused v3 write never actually landed -- v2 is still the persisted judgment', afterRefusedWrite.judgment.innate_features[0] === 'cas-v2')

      // Same contract on the workspace route, using the fresh updated_at
      // the judgment save above just produced.
      const currentAfterJudgment = await (await fetch(`${base}/api/submissions/${createdId}`)).json()
      const workspaceCasBody = { schema_version: '1.0.0', painFinalAssessment: { finalWorkingAssessment: 'cas-workspace-v2' } }
      const workspaceCasMatch = await fetch(`${base}/api/submissions/${createdId}/workspace`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-expected-updated-at': currentAfterJudgment.updated_at },
        body: JSON.stringify(workspaceCasBody),
      })
      assert('PUT workspace with a MATCHING x-expected-updated-at -> 200', workspaceCasMatch.status === 200)

      const workspaceCasStale = await fetch(`${base}/api/submissions/${createdId}/workspace`, {
        method: 'PUT',
        // Reuses the now-stale pre-workspace-save updated_at.
        headers: { 'content-type': 'application/json', 'x-expected-updated-at': currentAfterJudgment.updated_at },
        body: JSON.stringify({ schema_version: '1.0.0', painFinalAssessment: { finalWorkingAssessment: 'should-be-refused' } }),
      })
      assert('PUT workspace with a STALE x-expected-updated-at -> 409', workspaceCasStale.status === 409)
      const workspaceCasStaleBody = await workspaceCasStale.json()
      assert(
        'the workspace 409 hands back the current record with the ACCEPTED workspace save, not the refused one',
        workspaceCasStaleBody.current?.workspace?.painFinalAssessment?.finalWorkingAssessment === 'cas-workspace-v2',
      )

      // Omitting the header entirely is still unconditional last-write-wins
      // -- no behavior change for every caller that doesn't opt in.
      const noHeaderRes = await fetch(`${base}/api/submissions/${createdId}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...judgmentV2, innate_features: ['no-precondition-save'] }),
      })
      assert('PUT judgment with NO x-expected-updated-at header -> 200, unconditional as before (backward-compatible default)', noHeaderRes.status === 200)
    }

    /* ---------------- Round 17 closing-review finding: nextUpdatedAt
       monotonicity had ZERO test coverage even though it is what makes the
       whole CAS precondition above actually work -- `new Date().
       toISOString()` only has millisecond resolution, and under fast
       back-to-back saves (confirmed empirically: this exact scenario is
       what made `npm run test:all` flaky before the fix) two real,
       distinct writes to one record CAN complete within the same
       millisecond, producing an identical updated_at and silently
       defeating the CAS check (a stale precondition would be wrongly
       ACCEPTED). Fire a burst of rapid saves with NO artificial delay and
       assert every updated_at strictly differs from the one before it,
       and that a precondition captured from an EARLIER save in the burst
       is still correctly refused as stale after later ones land. ---------------- */
    {
      const burstJudgment = (n) => ({
        recorded_at: new Date().toISOString(),
        source: { session_id: 'sess-1', questionnaire_version: '1.0' },
        innate_features: [`burst-${n}`],
        symptom_links: [],
        saju_only_prediction: '',
        revised_after_exam: '',
        final_treatment_axis: '',
        prescription_direction: '',
        learning_case: false,
        debrief: null,
        transcript_import: null,
      })
      const updatedAts = []
      for (let n = 0; n < 20; n++) {
        const res = await fetch(`${base}/api/submissions/${createdId}/judgment`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(burstJudgment(n)),
        })
        const record = await res.json()
        updatedAts.push(record.updated_at)
      }
      const allDistinct = new Set(updatedAts).size === updatedAts.length
      assert('nextUpdatedAt: 20 rapid back-to-back saves with no delay all produce a strictly distinct updated_at (no same-millisecond collision)', allDistinct)
      const strictlyIncreasing = updatedAts.every((v, i) => i === 0 || v > updatedAts[i - 1])
      assert('nextUpdatedAt: the sequence of updated_at values is strictly increasing (monotonic, not just distinct/shuffled)', strictlyIncreasing)

      // A precondition captured from an EARLY save in that same rapid
      // burst must still be correctly recognized as stale after later
      // saves landed -- proving the CAS check actually distinguishes them,
      // not just that the values happen to differ.
      const staleFromBurst = updatedAts[0]
      const rejectedRes = await fetch(`${base}/api/submissions/${createdId}/judgment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-expected-updated-at': staleFromBurst },
        body: JSON.stringify(burstJudgment('should-be-refused')),
      })
      assert('nextUpdatedAt: a precondition captured from the FIRST save in a rapid burst is correctly refused as stale once later saves landed', rejectedRes.status === 409)
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

      /* -------- workspace isolation across the same two submissions (round 2 Phase 2) -------- */
      const emptyHerbalFinal = {
        finalPatternOrMechanism: '',
        treatmentPrinciple: '',
        prescriptionPlanNote: '',
        symptomsToTrack: '',
        recordedAt: null,
      }
      const workspaceFor = (label) => ({
        schema_version: '1.0.0',
        painExamSuggestions: [],
        painFinalAssessment: {
          finalWorkingAssessment: label,
          treatmentFocus: '',
          interventionPerformedOrPlanned: '',
          immediateRetestTarget: '',
          recordedAt: new Date().toISOString(),
        },
        painFollowUpTargets: [],
        herbalPatternCandidates: [],
        herbalClinicianObservations: [],
        herbalFinalAssessment: emptyHerbalFinal,
        herbalFollowUpTargets: [],
        updated_at: new Date().toISOString(),
      })

      await fetch(`${base}/api/submissions/${a.id}/workspace`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workspaceFor('workspace-only-on-a')),
      })

      const recA2 = await (await fetch(`${base}/api/submissions/${a.id}`)).json()
      const recB2 = await (await fetch(`${base}/api/submissions/${b.id}`)).json()
      assert(
        'workspace saved on submission A appears on A',
        recA2.workspace?.painFinalAssessment.finalWorkingAssessment === 'workspace-only-on-a',
      )
      assert('workspace saved on submission A does NOT appear on B', recB2.workspace === null)
      assert(
        "workspace save on A leaves A's earlier judgment (from this same block) untouched",
        recA2.judgment?.innate_features[0] === 'only-on-a',
      )
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

      // visit_id는 이번 스프린트에서 추가된 선택 키다(visit_created/
      // visit_activated/visit_cleared에서만 쓰임) — 그 외 키는 여전히 없다.
      const allowedKeys = new Set(['ts', 'event', 'submission_id', 'status', 'actor', 'visit_id'])
      assert(
        'audit log: every line for this submission has ONLY the allowed keys',
        forThisId.length > 0 && forThisId.every((l) => Object.keys(l).every((k) => allowedKeys.has(k))),
      )
      // 제출 하나를 만들면 submission_created뿐 아니라 visit_created도 같은
      // 요청 흐름 안에서(patient가 트리거) 생기므로 둘 다 patient, 나머지
      // (조회/상태변경/판단저장)는 전부 doctor.
      assert(
        'audit log: submission_created + visit_created(tablet flow) actor is patient, everything else is doctor',
        forThisId.find((l) => l.event === 'submission_created')?.actor === 'patient' &&
          forThisId.find((l) => l.event === 'visit_created')?.actor === 'patient' &&
          forThisId
            .filter((l) => l.event !== 'submission_created' && l.event !== 'visit_created')
            .every((l) => l.actor === 'doctor'),
      )
      assert(
        'audit log: exactly one visit_created line for this submission',
        forThisId.filter((l) => l.event === 'visit_created').length === 1,
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

    /* ---------------- visit layer: submitting creates a visit tied to the submission ---------------- */
    let visitTestPatientId
    {
      const created = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-visit-basic' })),
        })
      ).json()
      const record = await (await fetch(`${base}/api/submissions/${created.id}`)).json()
      assert('submission record has patient_id (string)', typeof record.patient_id === 'string' && record.patient_id !== '')
      assert('submission record has visit_id (string)', typeof record.visit_id === 'string' && record.visit_id !== '')
      visitTestPatientId = record.patient_id

      const visitRes = await fetch(`${base}/api/visits/${record.visit_id}`)
      const visit = await visitRes.json()
      assert('GET /api/visits/:id -> 200', visitRes.status === 200)
      assert('visit.submission_id matches the submission that created it', visit.submission_id === record.id)
      assert('visit.patient_id matches the submission record', visit.patient_id === record.patient_id)
      assert('visit.judgment_ref is "submission" (judgment lives on the submission)', visit.judgment_ref === 'submission')
      assert(
        'visit has null placeholders for future ClinicAI/EMR fields',
        visit.recording_id === null && visit.transcript_id === null && visit.emr_summary === null,
      )
    }

    /* ---------------- visit layer: no name-based matching — same name/phone, different session -> different patient_id ---------------- */
    {
      const samePersonPayload = (sessionId) =>
        validPayload({
          session_id: sessionId,
          responses: { patient: { patient_name: '김철수', phone_last4: '5555' } },
        })
      const a = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(samePersonPayload('sess-samename-a')),
        })
      ).json()
      const b = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(samePersonPayload('sess-samename-b')),
        })
      ).json()
      const recA = await (await fetch(`${base}/api/submissions/${a.id}`)).json()
      const recB = await (await fetch(`${base}/api/submissions/${b.id}`)).json()
      assert(
        'two different tablet submissions with identical patient_name/phone_last4 get DIFFERENT patient_id',
        recA.patient_id !== recB.patient_id,
      )
      assert('...and different visit_id too', recA.visit_id !== recB.visit_id)
    }

    /* ---------------- visit layer: idempotent resubmit does NOT create a second visit ---------------- */
    {
      const sid = 'sess-idem-visit'
      const first = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: sid })),
        })
      ).json()
      const firstRecord = await (await fetch(`${base}/api/submissions/${first.id}`)).json()

      const dup = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: sid })),
        })
      ).json()
      assert('idempotent resubmit -> duplicate:true, same id', dup.duplicate === true && dup.id === first.id)

      const allVisits = await (await fetch(`${base}/api/visits`)).json()
      const visitsForPatient = allVisits.filter((v) => v.patient_id === firstRecord.patient_id)
      assert(
        'idempotent resubmit: exactly one visit file exists for that patient_id/submission chain',
        visitsForPatient.length === 1 && visitsForPatient[0].id === firstRecord.visit_id,
      )
    }

    /* ---------------- visit layer: POST /api/visits with an existing patient_id -> "재진" (2nd visit, same patient, no submission) ---------------- */
    let revisitId
    {
      const res = await fetch(`${base}/api/visits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: visitTestPatientId }),
      })
      const visit = await res.json()
      assert('POST /api/visits with existing patient_id -> 201', res.status === 201)
      assert('re-visit keeps the SAME patient_id', visit.patient_id === visitTestPatientId)
      assert('re-visit gets a DIFFERENT visit_id from the original', typeof visit.id === 'string' && visit.id !== '')
      assert('re-visit has submission_id: null (no questionnaire this time)', visit.submission_id === null)
      assert('re-visit has judgment_ref: null (documented gap — no submission to hang judgment on)', visit.judgment_ref === null)
      revisitId = visit.id

      const allVisits = await (await fetch(`${base}/api/visits`)).json()
      const visitsForPatient = allVisits.filter((v) => v.patient_id === visitTestPatientId)
      assert('patient now has 2 visits on file', visitsForPatient.length === 2)
    }

    /* ---------------- visit layer: POST /api/visits with an unknown patient_id -> 400 ---------------- */
    {
      const res = await fetch(`${base}/api/visits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: 'no-such-patient-ever-existed' }),
      })
      assert('POST /api/visits with unknown patient_id -> 400', res.status === 400)
    }

    /* ---------------- visit layer: POST /api/visits with no patient_id -> mints a fresh patient_id ---------------- */
    let freshVisit
    {
      const res = await fetch(`${base}/api/visits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      freshVisit = await res.json()
      assert('POST /api/visits with no patient_id -> 201', res.status === 201)
      assert('a visit with no linked patient still gets a fresh patient_id', typeof freshVisit.patient_id === 'string' && freshVisit.patient_id !== '')
      assert('fresh visit submission_id is null', freshVisit.submission_id === null)
    }

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

      const clearRes2 = await fetch(`${base}/api/current-visit/clear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstation_id: 'bad id!' }),
      })
      assert('POST clear with invalid workstation_id -> 400', clearRes2.status === 400)
    }

    /* ---------------- multi-workstation isolation: DOCTOR-A and DOCTOR-B never affect each other ---------------- */
    {
      // Two fresh visits, minted directly (no questionnaire needed) so this
      // block is self-contained regardless of what earlier blocks activated.
      const visitA = await (await fetch(`${base}/api/visits`, { method: 'POST' })).json()
      const visitB = await (await fetch(`${base}/api/visits`, { method: 'POST' })).json()
      const visitA2 = await (await fetch(`${base}/api/visits`, { method: 'POST' })).json()

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

    /* ---------------- restart: active visit is NEVER restored, even though visit files persist ---------------- */
    {
      // "재시작 시 활성 방문을 다시 불러오지 않는다"는 전제를 정적으로도
      // 확인한다 — activeVisit.js는 파일시스템을 아예 건드리지 않는다(디스크에서
      // 다시 읽어올 코드 경로 자체가 없다).
      const activeVisitSrc = await readFile(fileURLToPath(new URL('../server/activeVisit.js', import.meta.url)), 'utf8')
      assert(
        'server/activeVisit.js never imports node:fs (in-memory only, nothing to restore on boot)',
        !activeVisitSrc.includes("from 'node:fs"),
      )

      // Explicitly clear (end-of-shift equivalent) before restart, then confirm the
      // restarted process still starts with no active visit while visit files persist.
      await fetch(`${base}/api/current-visit/clear`, { method: 'POST' })
      await stopServer(server)
      const restarted = await startServer(dataDir)
      server = restarted.server
      base = restarted.base

      const curAfterRestart = await (await fetch(`${base}/api/current-visit`)).json()
      assert('restart: GET /api/current-visit -> {active:false}', curAfterRestart.active === false)

      const doctorAAfterRestart = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-A`)).json()
      const doctorBAfterRestart = await (await fetch(`${base}/api/current-visit?workstation_id=DOCTOR-B`)).json()
      assert('G. restart: DOCTOR-A starts inactive', doctorAAfterRestart.active === false)
      assert('G. restart: DOCTOR-B starts inactive', doctorBAfterRestart.active === false)

      const visitsAfterRestart = await (await fetch(`${base}/api/visits`)).json()
      assert(
        'restart: visit files persisted and are still listable via GET /api/visits',
        visitsAfterRestart.some((v) => v.patient_id === visitTestPatientId),
      )
    }

    /* ---------------- 병목 7/8: same submission reselected (with an API restart in between) -> same persistent visit_id ---------------- */
    {
      const created = await (
        await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-reselect-same-visit' })),
        })
      ).json()
      const firstSelect = await (await fetch(`${base}/api/submissions/${created.id}`)).json()
      const v1 = firstSelect.visit_id
      assert('reselect: first select has a visit_id', typeof v1 === 'string' && v1 !== '')

      // Reselect without restarting -> same visit_id.
      const reselectNoRestart = await (await fetch(`${base}/api/submissions/${created.id}`)).json()
      assert('reselect: same visit_id without restart', reselectNoRestart.visit_id === v1)

      // Restart the API, then reselect the same submission -> still the same visit_id
      // (current-visit pointer resets on restart, but the persistent visit does not).
      await stopServer(server)
      const restartedAgain = await startServer(dataDir)
      server = restartedAgain.server
      base = restartedAgain.base

      const reselectAfterRestart = await (await fetch(`${base}/api/submissions/${created.id}`)).json()
      assert('reselect: same visit_id after API restart', reselectAfterRestart.visit_id === v1)
    }
  } finally {
    await stopServer(server)
    await rm(tmpRoot, { recursive: true, force: true })
  }

  /* ---------------- retention cleanup (store-level, no HTTP) ---------------- */
  {
    // 별도 루트 아래 nest한다(retDir/../visits가 곧바로 OS 임시 루트에
    // 생기는 걸 막기 위해) — store.createSubmission이 이제 방문 파일도
    // 만들기 때문에, 정리 시 그 파일도 함께 지워지도록 한다.
    const retRoot = await mkdtemp(path.join(tmpdir(), 'samindang-retention-'))
    const retDir = path.join(retRoot, 'submissions')
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
      await rm(retRoot, { recursive: true, force: true })
    }
  }

  /* ---------------- longitudinal patient history (round 3 Phase C) ---------------- */
  {
    // The main `server`/`base` from the top-level try block was already
    // stopped above (see the `finally` that closes it) -- this block needs
    // its own live HTTP server, so it gets its own temp dir/server pair,
    // same shape as the retention block above but with real HTTP calls.
    const histRoot = await mkdtemp(path.join(tmpdir(), 'samindang-history-'))
    const histDataDir = path.join(histRoot, 'submissions')
    const { server: histServer, base: histBase } = await startServer(histDataDir)
    try {
    const histStore = createStore(histDataDir)

    const emptyWorkspaceFor = (overrides) => ({
      schema_version: '1.1.0',
      painExamSuggestions: [],
      painFinalAssessment: { finalWorkingAssessment: '', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
      painFollowUpTargets: [],
      herbalPatternCandidates: [],
      herbalClinicianObservations: [],
      herbalFinalAssessment: { finalPatternOrMechanism: '', treatmentPrinciple: '', prescriptionPlanNote: '', symptomsToTrack: '', recordedAt: null },
      herbalFollowUpTargets: [],
      painCarePlan: { currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: '', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: '', recordedAt: null },
      herbalCarePlan: { currentManagementGoal: '', medicationPlanNote: '', homeLifestyleManagement: '', symptomsToObserve: '', adverseEffectContactInstruction: '', nextVisitCheckItem: '', recordedAt: null },
      nextReassessmentPlan: { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' },
      painReassessment: { items: [], finalReassessmentNote: '', recordedAt: null },
      herbalReassessment: { items: [], finalReassessmentNote: '', recordedAt: null },
      painRehabSuggestions: [],
      additionalConcernPromotion: { status: 'NOT_FLAGGED', clinicianNote: '', promotedAt: null },
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    })

    // Patient P's FIRST visit: a real submission with a workspace carrying
    // follow-up targets / final assessment / a next-reassessment plan.
    const subA = await histStore.createSubmission({
      submission: { questionnaire_version: '1.0', session_id: 'sess-hist-a', responses: {}, metadata: { primary_concern: '요통' } },
      myungri: null,
      patient_label: 'hist-patient-a',
    })
    const patientId = subA.patient_id
    await histStore.saveWorkspace(
      subA.id,
      emptyWorkspaceFor({
        painFinalAssessment: { finalWorkingAssessment: '단순 요통 1차 판단', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-01-01T00:00:00.000Z' },
        painFollowUpTargets: [{ id: 'ft1', label: 'LBP_12', baseline: '7', postTreatmentValue: '5' }],
        nextReassessmentPlan: { status: 'DATE', targetDate: '2026-02-01', afterVisitCount: null, note: '2주 뒤 재검' },
      }),
    )

    // Patient Q: a completely different patient/submission, used both as an
    // "other patient" isolation check and as the underlying submission a
    // second visit for patient P can point at (this codebase's tablet path
    // always mints a fresh patient_id per submission -- see visitStore.js's
    // identity-rule comment -- so a *returning* patient's actual follow-up
    // questionnaire is not yet wired end to end; the visit-level linkage
    // below stands in for that until that flow exists).
    const subQ = await histStore.createSubmission({
      submission: { questionnaire_version: '1.0', session_id: 'sess-hist-q', responses: {}, metadata: { primary_concern: '어깨통증' } },
      myungri: null,
      patient_label: 'hist-patient-q',
    })
    await histStore.saveWorkspace(
      subQ.id,
      emptyWorkspaceFor({
        painFinalAssessment: { finalWorkingAssessment: '환자 Q 전용 판단 -- 절대 P에게 노출되면 안 됨', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-01-05T00:00:00.000Z' },
      }),
    )

    // Patient P's SECOND visit, pointing at a fresh submission of its own
    // (subB) -- exercises the same patient_id appearing across two
    // DIFFERENT submission records.
    const subB = await histStore.createSubmission({
      submission: { questionnaire_version: '1.0', session_id: 'sess-hist-b', responses: {}, metadata: { primary_concern: '요통' } },
      myungri: null,
      patient_label: 'hist-patient-a-visit2',
    })
    await histStore.saveWorkspace(
      subB.id,
      emptyWorkspaceFor({
        painFinalAssessment: { finalWorkingAssessment: '2차 방문 판단', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-02-01T00:00:00.000Z' },
        painFollowUpTargets: [{ id: 'ft1', label: 'LBP_12', baseline: '5', postTreatmentValue: '3' }],
      }),
    )
    const visitB = await histStore.createVisit({ patient_id: patientId, submission_id: subB.id })

    // An OLDER visit for patient P with NO submission at all (e.g. a
    // documented-gap "재진" created via POST /api/visits with no
    // questionnaire) -- must be safely skipped, not crash.
    await histStore.createVisit({ patient_id: patientId, submission_id: null })

    const res = await fetch(`${histBase}/api/patients/${encodeURIComponent(patientId)}/history?excludeVisitId=${encodeURIComponent(subA.visit_id)}`)
    assert('GET /api/patients/:id/history -> 200', res.status === 200)
    const body = await res.json()
    assert('history response patient_id matches the requested patient exactly', body.patient_id === patientId)
    assert(
      'history: excludeVisitId removed patient P\'s own current visit, submission-less visit safely skipped -> exactly 1 remaining',
      body.visits.length === 1,
    )
    const only = body.visits[0]
    assert('history: the one remaining visit is patient P\'s SECOND visit (subB), not the excluded first one', only.visit_id === visitB.id)
    assert('history: pain_follow_up_targets carries the RAW baseline/postTreatmentValue text, no computed delta', only.pain_follow_up_targets[0].baseline === '5' && only.pain_follow_up_targets[0].postTreatmentValue === '3')
    assert('history: pain_final_assessment_summary is patient P\'s own text', only.pain_final_assessment_summary === '2차 방문 판단')
    assert('history: response body never contains patient Q\'s final assessment text', !JSON.stringify(body).includes('환자 Q 전용 판단'))

    const resNoExclude = await fetch(`${histBase}/api/patients/${encodeURIComponent(patientId)}/history`)
    const bodyNoExclude = await resNoExclude.json()
    assert(
      'history without excludeVisitId: both of patient P\'s submission-backed visits are returned, submission-less one skipped',
      bodyNoExclude.visits.length === 2,
    )

    const resOther = await fetch(`${histBase}/api/patients/${encodeURIComponent(subQ.patient_id)}/history`)
    const bodyOther = await resOther.json()
    assert('history for patient Q returns only patient Q\'s own visit, never patient P\'s', bodyOther.visits.length === 1 && bodyOther.visits[0].submission_id === subQ.id)

    const resUnknown = await fetch(`${histBase}/api/patients/${encodeURIComponent('00000000-0000-0000-0000-000000000000')}/history`)
    assert('history for an unknown/never-seen patient_id -> 200 with an empty visits[] (not 404, not a crash)', resUnknown.status === 200)
    const bodyUnknown = await resUnknown.json()
    assert('history for unknown patient_id: visits is an empty array', Array.isArray(bodyUnknown.visits) && bodyUnknown.visits.length === 0)

    const resNoAuth = await fetch(`${histBase}/api/patients/${encodeURIComponent(patientId)}/history`, {
      headers: { origin: 'https://evil.example.com' },
    })
    assert('GET /api/patients/:id/history without doctor auth (evil Origin) -> 403, same guard as every other doctor route', resNoAuth.status === 403)
    } finally {
      await stopServer(histServer)
      await rm(histRoot, { recursive: true, force: true })
    }
  }

  /* ---------------- micro follow-up (round 3 Phase D) ---------------- */
  {
    const mfuRoot = await mkdtemp(path.join(tmpdir(), 'samindang-microfollowup-'))
    const mfuDataDir = path.join(mfuRoot, 'submissions')
    const { server: mfuServer, base: mfuBase } = await startServer(mfuDataDir)
    try {
      const created = await (
        await fetch(`${mfuBase}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-mfu-1' })),
        })
      ).json()
      const record = await (await fetch(`${mfuBase}/api/submissions/${created.id}`)).json()
      const visitId = record.visit_id

      const beforeRes = await fetch(`${mfuBase}/api/visits/${visitId}/micro-follow-up`)
      const before = await beforeRes.json()
      assert('GET micro-follow-up before any save -> 200 with response: null', beforeRes.status === 200 && before.response === null)

      const postRes = await fetch(`${mfuBase}/api/visits/${visitId}/micro-follow-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetRatings: [{ targetId: 'ft1', label: 'LBP_12', patientReportedValue: '4' }],
          overallChange: '조금 좋아짐',
          newSymptomReported: true,
          newSymptomNote: '어깨도 아픔',
          adverseEffectReported: false,
          adverseEffectNote: '',
        }),
      })
      const posted = await postRes.json()
      assert('POST micro-follow-up -> 201', postRes.status === 201)
      assert('POST micro-follow-up response carries the visit_id it was saved under', posted.visit_id === visitId)
      assert('POST micro-follow-up response carries the visit\'s own patient_id, not a client-supplied one', posted.patient_id === record.patient_id)
      assert('POST micro-follow-up preserves targetRatings exactly', posted.targetRatings.length === 1 && posted.targetRatings[0].patientReportedValue === '4')
      assert('POST micro-follow-up preserves newSymptomReported/Note', posted.newSymptomReported === true && posted.newSymptomNote === '어깨도 아픔')

      const afterRes = await fetch(`${mfuBase}/api/visits/${visitId}/micro-follow-up`)
      const after = await afterRes.json()
      assert('GET micro-follow-up after save returns the saved response, not null', after.response !== null && after.response.overallChange === '조금 좋아짐')

      const missingVisit = await fetch(`${mfuBase}/api/visits/00000000-0000-0000-0000-000000000000/micro-follow-up`)
      assert('GET micro-follow-up for an unknown visit_id -> 404', missingVisit.status === 404)
      const missingVisitPost = await fetch(`${mfuBase}/api/visits/00000000-0000-0000-0000-000000000000/micro-follow-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert('POST micro-follow-up for an unknown visit_id -> 404', missingVisitPost.status === 404)

      // Round 6 review fix (idempotent acceptance): saveResponse is now
      // write-once per visit_id (see microFollowUpStore.js's doc comment),
      // so this sanitization check needs its OWN fresh visit -- `visitId`
      // above already has a saved response and would just return it
      // unchanged rather than exercising the malformed-input coercion path.
      const createdForMalformed = await (
        await fetch(`${mfuBase}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload({ session_id: 'sess-mfu-malformed' })),
        })
      ).json()
      const recordForMalformed = await (await fetch(`${mfuBase}/api/submissions/${createdForMalformed.id}`)).json()
      const malformedPost = await fetch(`${mfuBase}/api/visits/${recordForMalformed.visit_id}/micro-follow-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetRatings: 'not-an-array', newSymptomReported: 'yes' }),
      })
      const malformedBody = await malformedPost.json()
      assert('POST micro-follow-up with malformed targetRatings -> 201 with [] (never throws/500s)', malformedPost.status === 201 && Array.isArray(malformedBody.targetRatings) && malformedBody.targetRatings.length === 0)
      assert('POST micro-follow-up coerces a non-boolean newSymptomReported to a real boolean', malformedBody.newSymptomReported === true)

      // A second POST for the SAME (already-saved) visitId is now a no-op
      // replay -- it must return the FIRST response unchanged, never
      // silently overwrite it with different content.
      const secondPostSameVisit = await fetch(`${mfuBase}/api/visits/${visitId}/micro-follow-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetRatings: [{ targetId: 'ft1', label: 'LBP_12', patientReportedValue: 'SHOULD NOT OVERWRITE' }],
          overallChange: '나빠짐',
          newSymptomReported: false,
          newSymptomNote: '',
          adverseEffectReported: false,
          adverseEffectNote: '',
        }),
      })
      const secondPostBody = await secondPostSameVisit.json()
      assert('POST micro-follow-up: a second save for the same visit_id is write-once and returns the FIRST response unchanged', secondPostSameVisit.status === 201 && secondPostBody.targetRatings[0].patientReportedValue === '4')
      assert('POST micro-follow-up: the second attempt\'s conflicting text never made it into storage', !JSON.stringify(secondPostBody).includes('SHOULD NOT OVERWRITE'))

      const noAuth = await fetch(`${mfuBase}/api/visits/${visitId}/micro-follow-up`, { headers: { origin: 'https://evil.example.com' } })
      assert('GET micro-follow-up without doctor auth (evil Origin) -> 403, same guard as every other doctor route', noAuth.status === 403)
      const noAuthPost = await fetch(`${mfuBase}/api/visits/${visitId}/micro-follow-up`, {
        method: 'POST',
        headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert('POST micro-follow-up without doctor auth (evil Origin) -> 403', noAuthPost.status === 403)
    } finally {
      await stopServer(mfuServer)
      await rm(mfuRoot, { recursive: true, force: true })
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
    // 기존 10개(submissions x4 + visits x4 + current-visit GET + current-visit/clear) +
    // Task 2에서 POST/GET /api/visits/:id/recorder-results 2개 추가되어 12개가 됐고,
    // Doctor Clinical Workspace round 2 Phase 2에서 PUT /api/submissions/:id/workspace
    // 1개가 추가되어 13개가 됐다(judgment 라우트와 동일한 doctor-only 가드 패턴).
    // Round 3 Phase C에서 GET /api/patients/:patientId/history 1개가 추가되어
    // 14개가 됐다(같은 doctor-only 가드, exact patient_id match만 사용).
    // Round 3 Phase D에서 POST/GET /api/visits/:id/micro-follow-up 2개가
    // 추가되어 16개가 됐다(recorder-results와 동일한 doctor-only 가드 패턴 --
    // 환자 태블릿에서 직접 호출하지 않는다, microFollowUp.ts의 OPERATIONAL
    // INTEGRATION REQUIRED 주석 참고).
    // Round 3(revisit linkage)에서 6개가 추가되어 22개가 됐다: PUT
    // /api/visits/:id/workspace, GET /api/visits/revisits, POST
    // /api/patients/:patientId/start-revisit, GET/POST(reissue)/POST(invalidate)
    // /api/visits/:id/follow-up-session 계열 -- 전부 같은 doctor-only 가드.
    // 공개 환자용 /api/follow-up-session/:token(GET/POST) 2개는 의도적으로
    // 이 목록에 포함되지 않는다(patient POST /api/submissions와 같은 위치의
    // 공개 엔드포인트 -- followUpSessionStore.js의 토큰 검증이 인증을 대신한다).
    // isLocalOnly는 완전히 제거됐다(server/auth.js).
    // Round 8(clinic tablet stations)에서 4개가 추가되어 26개가 됐다:
    // POST/GET /api/stations, POST /api/stations/:id/assign, POST
    // /api/stations/:id/reset -- 전부 접수/직원용이라 같은 doctor-only 가드.
    // 태블릿 자신의 라우트 2개(GET /api/station/assignment, POST
    // /api/station/complete)는 의도적으로 이 목록에 포함되지 않는다: 기기
    // credential로 인증하는 환자 대면 기기용 엔드포인트이며, 공개 환자용
    // /api/follow-up-session/:token과 동일한 위치다(stationStore.js의
    // credential 검증이 인증을 대신한다).
    // CRM v0.3.1 Round 6(persistence)에서 7개(라우트 코드 블록 기준 -- 일부는
    // 여러 HTTP 라우트를 한 requireDoctor 가드 아래 묶어서 처리한다)가
    // 추가되어 33개가 됐다: POST /api/crm/episodes, GET
    // /api/crm/episodes/:id, GET /api/crm/episodes/:id/tasks, POST
    // /api/crm/episodes/:id/{pause,complete,reopen}(한 블록), POST
    // /api/crm/tasks, GET /api/crm/tasks/:id, POST
    // /api/crm/tasks/:id/{resolve,snooze,cancel,supersede,claim,seen}(한
    // 블록) -- 전부 같은 doctor-only 가드이며 CRM UI는 아직 없다(이번
    // 라운드는 의도적으로 서버 persistence만).
    // CRM v0.3.1 Round 11(Today Queue read path)에서 1개가 추가되어
    // 34개가 됐다: GET /api/crm/tasks(컬렉션, Today Queue 소스) -- 같은
    // doctor-only 가드, CRM UI는 여전히 없다.
    // CRM v0.3.1 Round 14(Sigma identity linkage)에서 2개가 추가되어
    // 36개가 됐다: POST /api/crm/patient-identity(명시적 확인 링크 생성),
    // GET /api/crm/patient-identities(Today Queue enrichment 배치 조회) --
    // 같은 doctor-only 가드.
    // Quick Revisit 발송(SOLAPI 스캐폴드)에서 4개가 추가되어 40개가 됐다:
    // POST/GET /api/visits/:id/messages, POST /api/messages/:id/retry,
    // POST /api/messages/:id/cancel -- 전부 같은 doctor-only 가드. 공개
    // provider 콜백 POST /api/messages/webhook은 의도적으로 이 목록에
    // 포함되지 않는다(provider_message_id 자체가 추측 불가능한 값이라
    // 이것이 인증을 대신한다 -- 태블릿/스테이션 공개 라우트와 동일한 위치).
    // Medication/Herbal-course batch에서 6개가 추가되어 46개가 됐다:
    // GET /api/crm/episodes?patient_uuid(환자별 Episode 조회),
    // GET /api/crm/episodes/:id/medication-courses,
    // POST /api/crm/medication-courses,
    // GET /api/crm/medication-courses/:id,
    // POST /api/crm/medication-courses/:id/check-tasks,
    // POST /api/crm/medication-courses/:id/shift-start -- 전부 같은
    // doctor-only 가드.
    assert(
      'server has exactly the 46 doctor-guarded route groups calling requireDoctor (submissions x5 + visits x6 + current-visit GET + current-visit/clear + patients/:id/history + micro-follow-up x2 + visit workspace/revisit-queue/start-revisit/follow-up-session x6 + stations x4 + crm x16 + messaging x4)',
      requireDoctorCalls === 46,
    )
    assert(
      'isLocalOnly no longer exists anywhere in server/index.js (fully retired)',
      !serverIndexSrc.includes('isLocalOnly'),
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

  /* ---------------- 8th independent review MEDIUM-2: listSubmissions
   * requires_staff_check tri-state (unit-level, store.js directly) ----------------
   * submission.flags is computed client-side and stored verbatim (see
   * createApp's POST /api/submissions handler) -- listSubmissions used to
   * coerce an unusable flags object to `?? false`, making the triage badge
   * in the doctor queue silently claim "no red flag" for a record whose
   * flags are actually unreadable. isFlagsUsable(server/store.js) now
   * makes this field tri-state: boolean when flags is structurally usable,
   * the string 'unknown' otherwise. */
  {
    const m2Root = await mkdtemp(path.join(tmpdir(), 'samindang-m2-flags-'))
    const m2DataDir = path.join(m2Root, 'submissions')
    try {
      const m2Store = createStore(m2DataDir)
      const wellFormed = await m2Store.createSubmission({
        submission: {
          questionnaire_version: '1.0',
          session_id: 'm2-well-formed',
          responses: {},
          flags: {
            general_red: true,
            gi_needs_review: false,
            bowel_needs_review: false,
            sleep_disorder_review: false,
            sleep_disorder_priority_review: false,
            response_consistency_review: false,
            requires_staff_check: true,
          },
        },
        myungri: null,
        patient_label: 'well-formed patient',
      })
      const hollow = await m2Store.createSubmission({
        submission: {
          questionnaire_version: '1.0',
          session_id: 'm2-hollow',
          responses: {},
          flags: {},
        },
        myungri: null,
        patient_label: 'hollow patient',
      })
      const missing = await m2Store.createSubmission({
        submission: {
          questionnaire_version: '1.0',
          session_id: 'm2-missing',
          responses: {},
          // flags entirely absent -- a pre-flags-field legacy record.
        },
        myungri: null,
        patient_label: 'missing-flags patient',
      })

      const listed = await m2Store.listSubmissions()
      const byId = Object.fromEntries(listed.map((s) => [s.id, s]))
      assert(
        'store.js MEDIUM-2: well-formed flags -> requires_staff_check is the real boolean (true)',
        byId[wellFormed.id].requires_staff_check === true,
      )
      assert(
        'store.js MEDIUM-2: hollow flags ({}) -> requires_staff_check is the string "unknown", never coerced to false',
        byId[hollow.id].requires_staff_check === 'unknown',
      )
      assert(
        'store.js MEDIUM-2: missing flags (undefined) -> requires_staff_check is "unknown", never coerced to false',
        byId[missing.id].requires_staff_check === 'unknown',
      )
    } finally {
      await rm(m2Root, { recursive: true, force: true })
    }
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
  assert(
    'guard: this is the exact mechanism GET /api/current-visit now shares (non-loopback + correct token -> allowed)',
    isDoctorRequestAllowed('192.168.1.50', 'secret', 'secret') === true,
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

  console.log(`\n${passCount} assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
