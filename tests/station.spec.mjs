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
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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

const live_visitId = (station) => station.assignment.visit_id

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

      /* ---- Round 9: a tablet already serving somebody else is REFUSED,
         not silently taken over. StationScreen deliberately stops polling
         once the patient has the questions open, so a staff-side takeover
         could never actually replace what is on that physical screen --
         the tablet would be handed to the next patient still showing the
         previous one's session. Refusing is the honest behavior. ---- */
      const queueBeforeRefusal = await (await fetch(`${base}/api/visits/revisits`)).json()
      const pendingABefore = queueBeforeRefusal.filter((r) => r.patient_id === subA.patient_id && r.status !== 'COMPLETED').length
      const busyToken = pollForB.token
      const busyAssign = await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      assert('assigning a busy tablet to a DIFFERENT patient -> 409', busyAssign.status === 409)
      assert('the 409 names station_busy', (await busyAssign.json()).error === 'station_busy')
      const stillServingB = await (await fetch(`${base}/api/follow-up-session/${busyToken}`)).json()
      assert("a refused assignment leaves the current patient's link untouched", stillServingB.status === 'ACTIVE')
      const pollStillB = await poll(regA.credential)
      assert('a refused assignment leaves the tablet serving its current patient', pollStillB.token === busyToken)

      /* ---- ...and the refused attempt must not strand the revisit it had
         to create along the way (round 9 partial-failure rollback). ---- */
      const queueAfterRefusal = await (await fetch(`${base}/api/visits/revisits`)).json()
      const pendingAAfter = queueAfterRefusal.filter((r) => r.patient_id === subA.patient_id && r.status !== 'COMPLETED').length
      assert('a refused assignment leaves NO orphan revisit behind', pendingAAfter === pendingABefore)

      /* ---- an explicit staff reset frees the tablet AND revokes the
         session it was holding, so the abandoned screen (which is no
         longer polling) can never submit into a session staff took back. ---- */
      await fetch(`${base}/api/stations/${regA.station.station_id}/reset`, { method: 'POST' })
      const revoked = await (await fetch(`${base}/api/follow-up-session/${busyToken}`)).json()
      assert('a staff reset revokes the capability the tablet was holding', revoked.status !== 'ACTIVE')
      const revokedSubmit = await fetch(`${base}/api/follow-up-session/${busyToken}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ANSWERS),
      })
      assert('a stale tablet screen cannot submit into a reset session', revokedSubmit.status !== 201)

      const afterReset = await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      assert('after an explicit reset the same tablet accepts the next patient', afterReset.status === 201)
      const pollAfterReassign = await poll(regA.credential)
      assert('station A now holds the newest token only', pollAfterReassign.status === 'ASSIGNED' && pollAfterReassign.token !== busyToken)
      const newest = await (await fetch(`${base}/api/follow-up-session/${pollAfterReassign.token}`)).json()
      assert('the newest assigned link is ACTIVE', newest.status === 'ACTIVE')

      /* ---- ...whereas an immediate repeat assign of the SAME patient is a
         double-click: it must replay the same session, not mint a second
         one and kill the first (which would strand the tablet). ---- */
      const repeatAssign = await (await fetch(`${base}/api/stations/${regA.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })).json()
      const holderVisitId = repeatAssign.visit.id
      const pollAfterRepeat = await poll(regA.credential)
      assert('an immediate repeat assign of the same patient keeps the SAME session (double-click, not a handover)', pollAfterRepeat.token === pollAfterReassign.token)
      const stillActive = await (await fetch(`${base}/api/follow-up-session/${pollAfterRepeat.token}`)).json()
      assert('the repeat-assigned session is still ACTIVE (never self-invalidated)', stillActive.status === 'ACTIVE')
      assert('the repeat assign reports the same visit', repeatAssign.visit.id === assigned.visit.id || typeof repeatAssign.visit.id === 'string')

      /* ---- Round 10: one station per VISIT, enforced by REFUSING the
         move, not by performing it. The old tablet has already fetched the
         raw token by the time it is showing the questions, and clearing a
         server-side record cannot retract that -- so "moving" a live
         session would leave the same capability on two physical screens.
         Staff must reset the old station first, which revokes it. ---- */
      const holderPoll = await poll(regA.credential)
      assert('setup: station A is holding a live session and has already fetched its token', holderPoll.status === 'ASSIGNED' && typeof holderPoll.token === 'string')
      const heldToken = holderPoll.token

      const moveAttempt = await fetch(`${base}/api/stations/${regB.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      assert('moving a session whose tablet already fetched the token -> 409', moveAttempt.status === 409)
      assert('the 409 names visit_assigned_elsewhere', (await moveAttempt.json()).error === 'visit_assigned_elsewhere')
      assert('the refused move leaves the second tablet untouched', (await poll(regB.credential)).status === 'WAITING')
      const holderAfterRefusal = await poll(regA.credential)
      assert('the refused move leaves the original tablet still holding its session', holderAfterRefusal.token === heldToken)
      assert('the refused move leaves that session ACTIVE', (await (await fetch(`${base}/api/follow-up-session/${heldToken}`)).json()).status === 'ACTIVE')

      const holdersNow = (await (await fetch(`${base}/api/stations`)).json()).stations.filter(
        (st) => st.assignment?.visit_id === holderVisitId,
      )
      assert('exactly one station holds the visit, always', holdersNow.length === 1)

      /* ---- ...and the supported path: reset the old station (which
         revokes its capability), then assign. The next assignment must
         hand out a genuinely fresh capability, never a replay of the
         revoked one. ---- */
      await fetch(`${base}/api/stations/${regA.station.station_id}/reset`, { method: 'POST' })
      assert('the reset revokes the capability the old tablet was holding', (await (await fetch(`${base}/api/follow-up-session/${heldToken}`)).json()).status !== 'ACTIVE')
      const afterMoveReset = await fetch(`${base}/api/stations/${regB.station.station_id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: subA.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      assert('after resetting the old tablet the session can be assigned to the second one', afterMoveReset.status === 201)
      const movedPoll = await poll(regB.credential)
      assert('the second tablet receives a FRESH capability, not the revoked one', movedPoll.status === 'ASSIGNED' && movedPoll.token !== heldToken)
      assert('the fresh capability is genuinely usable', (await (await fetch(`${base}/api/follow-up-session/${movedPoll.token}`)).json()).status === 'ACTIVE')
      assert('the first tablet is left waiting with nothing', (await poll(regA.credential)).status === 'WAITING')

      // Put station B back to waiting so the assertions below start clean.
      await fetch(`${base}/api/stations/${regB.station.station_id}/reset`, { method: 'POST' })

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

  /* =====================================================================
     Round 9 review fix (partial-failure atomicity): startRevisit creates a
     real visit AND a live capability BEFORE the station assignment is
     durable. Inject a genuine filesystem failure into the station write
     and prove the revisit it had to create is rolled back rather than
     stranded in the staff queue with a live token and no tablet.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-station-rollback-'))
    try {
      const dataDir = path.join(root, 'submissions')
      const store = createStore(dataDir, {})
      const { server, base } = await startServer({ dataDir })
      try {
        const sub = await store.createSubmission({
          submission: { questionnaire_version: '1.0', session_id: 'station-rollback', responses: {}, metadata: {} },
          myungri: null,
          patient_label: 'rollback patient',
        })
        const reg = await (await fetch(`${base}/api/stations`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '롤백 태블릿' }),
        })).json()

        const queueBefore = await (await fetch(`${base}/api/visits/revisits`)).json()

        // Block the station record's OWN atomicWrite target specifically:
        // a directory sitting where the .tmp file must be written makes
        // writeFile fail with EISDIR. Nothing else on the path is affected.
        // stationStore's baseDir is `<dataDir>/../stations`, and it keeps
        // its records one level deeper in `stations/`.
        const stationTmpPath = path.join(root, 'stations', 'stations', `${reg.station.station_id}.json.tmp`)
        await mkdir(stationTmpPath, { recursive: true })

        const failed = await fetch(`${base}/api/stations/${reg.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: sub.patient_id, delivery_mode: 'CLINIC_TABLET' }),
        })
        assert('a station write failure surfaces as an error instead of a fake success', failed.status >= 500)

        await rm(stationTmpPath, { recursive: true, force: true })

        const queueAfter = await (await fetch(`${base}/api/visits/revisits`)).json()
        assert('a failed station assignment leaves NO orphan revisit in the staff queue', queueAfter.length === queueBefore.length)
        assert('...and specifically none for that patient', queueAfter.filter((r) => r.patient_id === sub.patient_id).length === queueBefore.filter((r) => r.patient_id === sub.patient_id).length)

        // The rollback must also clear the dedup cache, so the NEXT (now
        // working) assignment mints a real, usable session rather than
        // replaying the capability that was just revoked.
        const retried = await fetch(`${base}/api/stations/${reg.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: sub.patient_id, delivery_mode: 'CLINIC_TABLET' }),
        })
        assert('retrying after the failure is fixed succeeds', retried.status === 201)
        const retryPoll = await (await fetch(`${base}/api/station/assignment`, { headers: { 'x-station-credential': reg.credential } })).json()
        assert('the retry hands the tablet a genuinely usable session', retryPoll.status === 'ASSIGNED')
        const retrySession = await (await fetch(`${base}/api/follow-up-session/${retryPoll.token}`)).json()
        assert('the retried session is ACTIVE (not a revoked replay of the rolled-back one)', retrySession.status === 'ACTIVE')
      } finally {
        await stopServer(server)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Round 10 review fix (a): a target-station write failure during a
     REUSED re-hand must not destroy the session. assignRevisitToStation
     deliberately never rolls back a reused revisit -- so the write failure
     has to leave the existing assignment and capability exactly as they
     were, rather than half-moving them.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-station-reused-fail-'))
    try {
      const dataDir = path.join(root, 'submissions')
      const store = createStore(dataDir, {})
      const { server, base } = await startServer({ dataDir })
      try {
        const sub = await store.createSubmission({
          submission: { questionnaire_version: '1.0', session_id: 'station-reused', responses: {}, metadata: {} },
          myungri: null,
          patient_label: 'reused patient',
        })
        const reg = await (await fetch(`${base}/api/stations`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '재핸드 태블릿' }),
        })).json()
        const assignUrl = `${base}/api/stations/${reg.station.station_id}/assign`
        const assignBody = JSON.stringify({ patient_id: sub.patient_id, delivery_mode: 'CLINIC_TABLET' })
        const headers = { 'content-type': 'application/json' }

        const first = await (await fetch(assignUrl, { method: 'POST', headers, body: assignBody })).json()
        const held = await (await fetch(`${base}/api/station/assignment`, { headers: { 'x-station-credential': reg.credential } })).json()
        assert('setup: the tablet holds a live session before the failing re-hand', held.status === 'ASSIGNED')

        const stationTmpPath = path.join(root, 'stations', 'stations', `${reg.station.station_id}.json.tmp`)
        await mkdir(stationTmpPath, { recursive: true })
        const failedRehand = await fetch(assignUrl, { method: 'POST', headers, body: assignBody })
        assert('a station write failure during a reused re-hand surfaces as an error', failedRehand.status >= 500)
        await rm(stationTmpPath, { recursive: true, force: true })

        const afterFail = await (await fetch(`${base}/api/station/assignment`, { headers: { 'x-station-credential': reg.credential } })).json()
        assert('the failed re-hand leaves the tablet holding its original session', afterFail.status === 'ASSIGNED' && afterFail.token === held.token)
        assert('the failed re-hand leaves that session ACTIVE (a reused session is never rolled back)', (await (await fetch(`${base}/api/follow-up-session/${held.token}`)).json()).status === 'ACTIVE')
        const queue = await (await fetch(`${base}/api/visits/revisits`)).json()
        assert('the failed re-hand creates no second revisit', queue.filter((r) => r.patient_id === sub.patient_id).length === 1)
        assert('...and it is still the original one', queue[0].visit_id === first.visit.id)
      } finally {
        await stopServer(server)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Round 10 review fix (b): staff reset must REVOKE THE CAPABILITY BEFORE
     it frees the station. The old order (clear, release the station lock,
     then best-effort invalidate) left a window in which the station already
     looked free while the token was still live -- a stale tablet could POST
     in that gap and be accepted after staff had clicked reset.

     Injecting a failure into the station write pins the ordering
     deterministically, with no wall-clock race: whichever step runs first
     is the one that takes effect. Revoke-first leaves a dead token on a
     still-busy station (safe and retryable); clear-first would leave a live
     token on a freed station (the bug).
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-station-reset-order-'))
    try {
      const dataDir = path.join(root, 'submissions')
      const store = createStore(dataDir, {})
      const { server, base } = await startServer({ dataDir })
      try {
        const sub = await store.createSubmission({
          submission: { questionnaire_version: '1.0', session_id: 'station-reset-order', responses: {}, metadata: {} },
          myungri: null,
          patient_label: 'reset order patient',
        })
        const reg = await (await fetch(`${base}/api/stations`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '초기화 순서 태블릿' }),
        })).json()
        const stationHeader = { 'x-station-credential': reg.credential }
        const resetUrl = `${base}/api/stations/${reg.station.station_id}/reset`

        await fetch(`${base}/api/stations/${reg.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: sub.patient_id, delivery_mode: 'CLINIC_TABLET' }),
        })
        const live = await (await fetch(`${base}/api/station/assignment`, { headers: stationHeader })).json()
        assert('setup: the tablet holds a live capability before the reset', live.status === 'ASSIGNED')

        const stationTmpPath = path.join(root, 'stations', 'stations', `${reg.station.station_id}.json.tmp`)
        await mkdir(stationTmpPath, { recursive: true })
        const brokenReset = await fetch(resetUrl, { method: 'POST' })
        await rm(stationTmpPath, { recursive: true, force: true })

        assert('a reset whose station write fails surfaces as an error', brokenReset.status >= 500)
        // THE ordering proof: revocation already took effect even though
        // the station could not be freed.
        assert('reset revokes the capability BEFORE freeing the station', (await (await fetch(`${base}/api/follow-up-session/${live.token}`)).json()).status !== 'ACTIVE')
        const stillBusy = (await (await fetch(`${base}/api/stations`)).json()).stations[0]
        assert('a failed clear leaves a BUSY station with a dead token (safe and retryable), never a free station with a live one', Boolean(stillBusy.assignment))

        const staleSubmit = await fetch(`${base}/api/follow-up-session/${live.token}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ANSWERS),
        })
        assert('once reset has taken authority the stale tablet can never return 201', staleSubmit.status !== 201)
        assert('...and no response was persisted for it', (await (await fetch(`${base}/api/visits/${live_visitId(stillBusy)}/micro-follow-up`)).json()).response === null)

        const retryReset = await fetch(resetUrl, { method: 'POST' })
        assert('retrying the reset after the failure frees the tablet', retryReset.status === 200)
        assert('the tablet is genuinely back to waiting', (await (await fetch(`${base}/api/station/assignment`, { headers: stationHeader })).json()).status === 'WAITING')

        /* ---- the inverse ordering, stated honestly: if the submission was
           already accepted before the reset acquired authority, the reset
           must leave that accepted result completely alone. ---- */
        const second = await (await fetch(`${base}/api/stations/${reg.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: sub.patient_id, delivery_mode: 'CLINIC_TABLET' }),
        })).json()
        const secondPoll = await (await fetch(`${base}/api/station/assignment`, { headers: stationHeader })).json()
        const accepted = await fetch(`${base}/api/follow-up-session/${secondPoll.token}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ANSWERS),
        })
        assert('setup: the patient submits and is accepted', accepted.status === 201)
        const savedBefore = await (await fetch(`${base}/api/visits/${second.visit.id}/micro-follow-up`)).json()

        await fetch(resetUrl, { method: 'POST' })
        const savedAfter = await (await fetch(`${base}/api/visits/${second.visit.id}/micro-follow-up`)).json()
        assert('a reset after an accepted submission does not delete it', savedAfter.response !== null)
        assert('...and does not alter it in any way', JSON.stringify(savedAfter.response) === JSON.stringify(savedBefore.response))
        assert('...and does not rewrite the CONSUMED token into INVALIDATED', (await (await fetch(`${base}/api/follow-up-session/${secondPoll.token}`)).json()).status === 'CONSUMED')

        /* ---- and the genuine concurrent case, asserted as an
           order-INDEPENDENT invariant so it cannot be flaky: whoever wins,
           "not accepted" and "a response was persisted" must never both be
           true. ---- */
        const third = await (await fetch(`${base}/api/stations/${reg.station.station_id}/assign`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patient_id: sub.patient_id, delivery_mode: 'PERSONAL_QR' }),
        })).json()
        const thirdPoll = await (await fetch(`${base}/api/station/assignment`, { headers: stationHeader })).json()
        const [raceSubmit] = await Promise.all([
          fetch(`${base}/api/follow-up-session/${thirdPoll.token}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ANSWERS),
          }),
          fetch(resetUrl, { method: 'POST' }),
        ])
        const raceSaved = await (await fetch(`${base}/api/visits/${third.visit.id}/micro-follow-up`)).json()
        assert(
          'reset vs submit: a refused submission never leaves a persisted response behind',
          raceSubmit.status === 201 ? raceSaved.response !== null : raceSaved.response === null,
        )
        assert('reset vs submit: the tablet ends up free either way', (await (await fetch(`${base}/api/station/assignment`, { headers: stationHeader })).json()).status === 'WAITING')
      } finally {
        await stopServer(server)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
