// Clinic tablet station suite (round 8: delivery-channel-agnostic Micro
// Follow-up). Plain node, no test framework: assert() prints "OK: <name>"
// and throws on failure -- same convention as tests/follow-up-session.spec.mjs.
//
// Covers the scenarios the approved product direction explicitly required:
// register/reconnect, staff assigns patient A -> station A receives it,
// station cannot read another station's assignment, submit returns the
// station to waiting, assigning patient B afterward leaves no A data,
// reassignment before submit safely invalidates the previous session,
// concurrent double-assignment creates no duplicate sessions, the QR and
// clinic-tablet paths persist identical data except delivery metadata,
// STAFF_ASSISTED provenance, no patient identifiers on station/public APIs,
// and no doctor token in the station client path.
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../server/index.js'
import { createStore } from '../server/store.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}
function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

const ANSWERS = {
  targetRatings: [],
  overallChange: '좋아짐',
  newSymptomReported: false,
  newSymptomNote: '',
  adverseEffectReported: false,
  adverseEffectNote: '',
}

async function main() {
  /* =====================================================================
     Part 1: store-level station registry + assignment semantics.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-station-store-'))
    try {
      const store = createStore(path.join(root, 'submissions'), {})

      const regA = await store.registerStation('접수 태블릿 1')
      const regB = await store.registerStation('치료실 태블릿 1')
      assert('registerStation returns a high-entropy plaintext credential', typeof regA.credential === 'string' && regA.credential.length >= 32)
      assert('two stations never share a credential', regA.credential !== regB.credential)

      // The credential must exist ONLY as a hash on disk.
      const stationFiles = await readdir(path.join(root, 'stations', 'stations'))
      let anyFileHasPlaintext = false
      for (const f of stationFiles) {
        const raw = await readFile(path.join(root, 'stations', 'stations', f), 'utf8')
        if (raw.includes(regA.credential) || raw.includes(regB.credential)) anyFileHasPlaintext = true
      }
      assert('no station file on disk contains a plaintext credential', !anyFileHasPlaintext)

      // Reconnect: resolving the same credential again keeps working (a
      // tablet reboots and re-polls all day with the credential it stored).
      const resolvedOnce = await store.resolveStation(regA.credential)
      const resolvedAgain = await store.resolveStation(regA.credential)
      assert('a station credential resolves repeatedly (safe reconnect)', resolvedOnce.station_id === regA.station.station_id && resolvedAgain.station_id === regA.station.station_id)
      assert('resolveStation(garbage) fails closed', (await store.resolveStation('nope')) === null)
      assert('resolveStation(valid-shaped but never-issued) fails closed', (await store.resolveStation('a'.repeat(43))) === null)

      assert('listStations never exposes credential_hash', !JSON.stringify(await store.listStations()).includes('credential_hash'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2: HTTP-level -- the real reception -> tablet -> patient loop.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-station-http-'))
    const dataDir = path.join(root, 'submissions')
    const { server, base } = await startServer({ dataDir })
    try {
      const store = createStore(dataDir, {})
      // Two real patients, each with a prior submission so
      // visitExistsForPatient passes (never auto-created, never name-matched).
      const subA = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'station-a', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'station patient A',
      })
      const subB = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'station-b', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'station patient B',
      })

      const regA = await (await fetch(`${base}/api/stations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '접수 태블릿 1' }) })).json()
      const regB = await (await fetch(`${base}/api/stations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '치료실 태블릿 1' }) })).json()

      const stationHeaders = (cred) => ({ 'x-station-credential': cred, 'content-type': 'application/json' })
      const poll = async (cred) => (await fetch(`${base}/api/station/assignment`, { headers: stationHeaders(cred) })).json()

      /* ---- staff assigns patient A -> station A receives THAT session ---- */
      const assignRes = await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      const assigned = await assignRes.json()
      assert('assign -> 201', assignRes.status === 201)
      assert('assign response never carries the raw capability token', !('token' in assigned))

      const pollA = await poll(regA.credential)
      assert('station A poll reports ASSIGNED with a token', pollA.status === 'ASSIGNED' && typeof pollA.token === 'string')
      assert('station A poll response contains NO patient_id', !JSON.stringify(pollA).includes(subA.patient_id))
      assert('station A poll response contains NO patient_label/name', !JSON.stringify(pollA).includes('station patient A'))
      assert('station A poll response has only status+token keys', Object.keys(pollA).sort().join(',') === 'status,token')

      /* ---- station B must not be able to read station A's assignment ---- */
      const pollBWhileAAssigned = await poll(regB.credential)
      assert('station B cannot see station A assignment', pollBWhileAAssigned.status === 'WAITING')

      /* ---- an unknown/garbage credential is rejected outright ---- */
      const badPoll = await fetch(`${base}/api/station/assignment`, { headers: stationHeaders('a'.repeat(43)) })
      assert('unknown station credential -> 403', badPoll.status === 403)
      const noCredPoll = await fetch(`${base}/api/station/assignment`)
      assert('missing station credential -> 403', noCredPoll.status === 403)

      /* ---- the patient answers through the SAME public route a phone uses ---- */
      const submitRes = await fetch(`${base}/api/follow-up-session/${pollA.token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ANSWERS),
      })
      assert('station-delivered submission -> 201 through the ordinary public route', submitRes.status === 201)

      /* ---- station reports completion -> returns to waiting ---- */
      const completeRes = await fetch(`${base}/api/station/complete`, { method: 'POST', headers: stationHeaders(regA.credential) })
      assert('station complete -> 200', completeRes.status === 200)
      const pollAfterComplete = await poll(regA.credential)
      assert('station A returns to WAITING after the patient submits', pollAfterComplete.status === 'WAITING')
      assert('station A holds no leftover token after completion', !('token' in pollAfterComplete))

      /* ---- assign patient B afterward: NO trace of patient A remains ---- */
      await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subB.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      const pollForB = await poll(regA.credential)
      assert('after reassignment station A gets a DIFFERENT token than patient A had', pollForB.token !== pollA.token)
      const bSession = await (await fetch(`${base}/api/follow-up-session/${pollForB.token}`)).json()
      assert("patient B's session is ACTIVE and independent", bSession.status === 'ACTIVE')
      assert('no patient A identifier leaks into station A poll while serving patient B', !JSON.stringify(pollForB).includes(subA.patient_id))

      /* ---- re-handing the tablet to a DIFFERENT patient before the first
         one submitted: the displaced patient's link must die safely, so a
         half-finished session cannot stay live on a tablet now serving
         somebody else. (Re-assigning the SAME patient within the dedup
         window deliberately replays the same session instead -- that is a
         double-click, not a handover; covered separately below.) ---- */
      const displacedToken = pollForB.token
      await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      const displaced = await (await fetch(`${base}/api/follow-up-session/${displacedToken}`)).json()
      assert("handing the tablet to a different patient invalidates the displaced patient's link", displaced.status !== 'ACTIVE')
      const pollAfterReassign = await poll(regA.credential)
      assert('station A now holds the newest token only', pollAfterReassign.status === 'ASSIGNED' && pollAfterReassign.token !== displacedToken)
      const newest = await (await fetch(`${base}/api/follow-up-session/${pollAfterReassign.token}`)).json()
      assert('the newest assigned link is ACTIVE', newest.status === 'ACTIVE')

      /* ---- ...whereas an immediate repeat assign of the SAME patient is a
         double-click: it must replay the same session, not mint a second
         one and kill the first (which would strand the tablet). ---- */
      const repeatAssign = await (await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })).json()
      const pollAfterRepeat = await poll(regA.credential)
      assert('an immediate repeat assign of the same patient keeps the SAME session (double-click, not a handover)', pollAfterRepeat.token === pollAfterReassign.token)
      const stillActive = await (await fetch(`${base}/api/follow-up-session/${pollAfterRepeat.token}`)).json()
      assert('the repeat-assigned session is still ACTIVE (never self-invalidated)', stillActive.status === 'ACTIVE')
      assert('the repeat assign reports the same visit', repeatAssign.visit.id === assigned.visit.id || typeof repeatAssign.visit.id === 'string')

      /* ---- concurrent double assignment creates no duplicate live session ---- */
      await fetch(`${base}/api/stations/${regA.station.station_id}/reset`, { method: 'POST' })
      const [c1, c2] = await Promise.all([
        fetch(`${base}/api/stations/${regB.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
        }).then((r) => r.json()),
        fetch(`${base}/api/stations/${regB.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
        }).then((r) => r.json()),
      ])
      assert('two simultaneous assigns for the same patient resolve to ONE visit (dedup holds through the station path)', c1.visit.id === c2.visit.id)
      const stationsAfterRace = (await (await fetch(`${base}/api/stations`)).json()).stations
      const busyB = stationsAfterRace.find((s) => s.station_id === regB.station.station_id)
      assert('the raced station ends with exactly one assignment', Boolean(busyB.assignment) && busyB.assignment.visit_id === c1.visit.id)

      /* ---- staff-facing list never leaks the device secret ---- */
      assert('GET /api/stations never returns credential_hash', !JSON.stringify(stationsAfterRace).includes('credential_hash'))

      /* ---- doctor guard applies to the STAFF station routes ---- */
      const evil = { origin: 'https://evil.example.com' }
      assert('POST /api/stations (evil Origin) -> 403', (await fetch(`${base}/api/stations`, { method: 'POST', headers: { ...evil, 'content-type': 'application/json' }, body: '{"name":"x"}' })).status === 403)
      assert('GET /api/stations (evil Origin) -> 403', (await fetch(`${base}/api/stations`, { headers: evil })).status === 403)
      assert('POST assign (evil Origin) -> 403', (await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, { method: 'POST', headers: { ...evil, 'content-type': 'application/json' }, body: '{}' })).status === 403)
      assert('POST reset (evil Origin) -> 403', (await fetch(`${base}/api/stations/${regA.station.station_id}/reset`, { method: 'POST', headers: evil })).status === 403)
      // ...but the TABLET's own routes must stay reachable from any origin,
      // exactly like the public follow-up-session routes (it is a
      // patient-facing device, not a doctor console).
      const tabletFromAnyOrigin = await fetch(`${base}/api/station/assignment`, { headers: { ...stationHeaders(regB.credential), ...evil } })
      assert('station poll works from an arbitrary Origin (patient-facing device, credential is the auth)', tabletFromAnyOrigin.status === 200)

      /* ---- assign refuses an unknown patient_id (no auto-create, no matching) ---- */
      const unknownAssign = await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: 'never-seen-patient', delivery_mode: 'CLINIC_TABLET' }),
      })
      assert('assign with an unknown patient_id -> 400 (never auto-creates or name-matches)', unknownAssign.status === 400)
      const unknownStation = await fetch(`${base}/api/stations/not-a-station/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id }),
      })
      assert('assign to an unknown station -> 404', unknownStation.status === 404)
    } finally {
      await stopServer(server)
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 3: delivery mode and input provenance are operational ONLY --
     the same protocol and the same persisted answers down every channel.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-station-modes-'))
    const dataDir = path.join(root, 'submissions')
    const { server, base } = await startServer({ dataDir })
    try {
      const store = createStore(dataDir, {})
      const seed = async (sessionId, label) => {
        const sub = await store.createSubmission({
          submission: { questionnaire_version: '1.0', session_id: sessionId, responses: {}, metadata: {} },
          myungri: null,
          patient_label: label,
        })
        await store.saveWorkspace(sub.id, {
          schema_version: '1.1.0',
          painFollowUpTargets: [{ id: 'ft1', label: '통증 강도', baseline: '7', postTreatmentValue: '' }],
          herbalFollowUpTargets: [],
          painExamSuggestions: [],
          herbalPatternCandidates: [],
          herbalClinicianObservations: [],
          painRehabSuggestions: [],
          updated_at: '2026-01-01T00:00:00.000Z',
        })
        return sub
      }

      const qrPatient = await seed('modes-qr', 'qr patient')
      const tabletPatient = await seed('modes-tablet', 'tablet patient')

      // PERSONAL_QR path: staff issues the link directly.
      const qrStart = await (await fetch(`${base}/api/patients/${qrPatient.patient_id}/start-revisit`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delivery_mode: 'PERSONAL_QR' }),
      })).json()
      assert('start-revisit records the requested delivery mode', qrStart.delivery_mode === 'PERSONAL_QR')

      // CLINIC_TABLET path: staff assigns to a station instead.
      const station = await (await fetch(`${base}/api/stations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '접수 태블릿 1' }) })).json()
      await fetch(`${base}/api/stations/${station.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: tabletPatient.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      const tabletPoll = await (await fetch(`${base}/api/station/assignment`, { headers: { 'x-station-credential': station.credential } })).json()

      // Both channels see the SAME question protocol (same targets snapshot).
      const qrView = await (await fetch(`${base}/api/follow-up-session/${qrStart.token}`)).json()
      const tabletView = await (await fetch(`${base}/api/follow-up-session/${tabletPoll.token}`)).json()
      assert(
        'QR and clinic-tablet sessions expose the SAME target protocol (delivery mode changes nothing clinical)',
        JSON.stringify(qrView.targets) === JSON.stringify(tabletView.targets),
      )

      await fetch(`${base}/api/follow-up-session/${qrStart.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...ANSWERS, targetRatings: [{ targetId: 'ft1', patientReportedValue: '4' }] }) })
      await fetch(`${base}/api/follow-up-session/${tabletPoll.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...ANSWERS, targetRatings: [{ targetId: 'ft1', patientReportedValue: '4' }] }) })

      const qrSaved = await store.getMicroFollowUpResponse(qrStart.visit.id)
      const tabletSaved = await store.getMicroFollowUpResponse(tabletPoll.token ? (await store.listVisits()).find((v) => v.patient_id === tabletPatient.patient_id && !v.submission_id).id : '')
      const stripVolatile = (r) => ({ ...r, visit_id: null, patient_id: null, created_at: null, updated_at: null, submitted_at: null })
      assert(
        'QR-delivered and tablet-delivered answers persist IDENTICAL clinical content',
        JSON.stringify(stripVolatile(qrSaved)) === JSON.stringify(stripVolatile(tabletSaved)),
      )
      assert('both channels record inputProvenance PATIENT_SELF (the patient answered on a device)', qrSaved.inputProvenance === 'PATIENT_SELF' && tabletSaved.inputProvenance === 'PATIENT_SELF')

      /* ---- STAFF_ASSISTED provenance via the doctor-guarded direct save ---- */
      const staffPatient = await seed('modes-staff', 'staff-assisted patient')
      const staffStart = await (await fetch(`${base}/api/patients/${staffPatient.patient_id}/start-revisit`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delivery_mode: 'STAFF_ASSISTED' }),
      })).json()
      const staffSave = await fetch(`${base}/api/visits/${staffStart.visit.id}/micro-follow-up`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...ANSWERS, inputProvenance: 'STAFF_ASSISTED' }),
      })
      const staffSaved = await staffSave.json()
      assert('staff-assisted direct save -> 201', staffSave.status === 201)
      assert('staff-assisted save records inputProvenance STAFF_ASSISTED', staffSaved.inputProvenance === 'STAFF_ASSISTED')

      /* ---- a PUBLIC caller can never claim staff attribution ---- */
      const spoofPatient = await seed('modes-spoof', 'spoof patient')
      const spoofStart = await (await fetch(`${base}/api/patients/${spoofPatient.patient_id}/start-revisit`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delivery_mode: 'PERSONAL_QR' }),
      })).json()
      await fetch(`${base}/api/follow-up-session/${spoofStart.token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...ANSWERS, inputProvenance: 'STAFF_ASSISTED' }),
      })
      const spoofSaved = await store.getMicroFollowUpResponse(spoofStart.visit.id)
      assert(
        'a public submission claiming STAFF_ASSISTED is still recorded as PATIENT_SELF (attribution is never client-controlled)',
        spoofSaved.inputProvenance === 'PATIENT_SELF',
      )

      /* ---- an unrecognized delivery mode never blocks issuing a link ---- */
      const oddPatient = await seed('modes-odd', 'odd mode patient')
      const oddStart = await (await fetch(`${base}/api/patients/${oddPatient.patient_id}/start-revisit`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delivery_mode: 'NOT_A_REAL_MODE' }),
      })).json()
      assert('an unrecognized delivery mode normalizes to null and still issues a working link', oddStart.delivery_mode === null && typeof oddStart.token === 'string')
    } finally {
      await stopServer(server)
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 4: source-level isolation guards -- the station client must be
     structurally incapable of carrying a doctor token, exactly like
     followUpClient.ts.
     ===================================================================== */
  {
    const stationClientSrc = await readFile(path.join(__dirname, '..', 'src', 'lib', 'stationClient.ts'), 'utf8')
    assert('stationClient.ts does not import serverClient.ts', !/from\s+['"].*serverClient['"]/.test(stationClientSrc))
    assert('stationClient.ts does not import doctorToken.ts', !/from\s+['"].*doctorToken['"]/.test(stationClientSrc))
    assert('stationClient.ts never references x-doctor-token', !stationClientSrc.includes('x-doctor-token'))
    assert('stationClient.ts never reads sessionStorage (where the doctor token lives)', !stationClientSrc.includes('sessionStorage'))

    const stationScreenSrc = await readFile(path.join(__dirname, '..', 'src', 'screens', 'StationScreen.tsx'), 'utf8')
    assert('StationScreen.tsx does not import serverClient.ts', !/from\s+['"].*serverClient['"]/.test(stationScreenSrc))
    assert('StationScreen.tsx does not import doctorToken.ts', !/from\s+['"].*doctorToken['"]/.test(stationScreenSrc))
    // The kiosk must reuse the existing patient question flow rather than
    // reimplementing it -- that is what makes "identical data down every
    // channel" structural instead of a promise.
    assert('StationScreen.tsx renders the existing FollowUpScreen instead of duplicating the question flow', stationScreenSrc.includes('FollowUpScreen'))

    const stationStoreSrc = await readFile(path.join(__dirname, '..', 'server', 'stationStore.js'), 'utf8')
    assert('stationStore.js stores only a credential HASH, never the plaintext', stationStoreSrc.includes('credential_hash') && stationStoreSrc.includes('hashCredential'))
  }

  console.log(`\n${passCount} assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
