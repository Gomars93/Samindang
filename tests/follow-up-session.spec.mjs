// Follow-up Session security + workflow suite (round 3: secure revisit
// linkage). Plain node, no test framework: assert() prints "OK: <name>" and
// throws on failure -- same convention as tests/server.spec.mjs. Covers the
// capability-token security properties explicitly required for this
// feature: token randomness/format, plaintext-never-persisted,
// visit-scoping, invalid/expired/consumed rejection, cross-patient
// isolation, reissue-invalidates-old, GET-reveals-no-identifiers,
// POST-can't-overwrite-labels, doctor-token-absent-from-patient-flow,
// no-name/phone/DOB-matching, and CORS/body-size-guards-intact -- plus the
// end-to-end revisit workflow.
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../server/index.js'
import { createStore } from '../server/store.js'
import { createFollowUpSessionStore, hashToken, isValidTokenFormat } from '../server/followUpSessionStore.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function emptyWorkspaceFor(overrides) {
  return {
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
  }
}

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}` }
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function main() {
  /* =====================================================================
     Part 1: followUpSessionStore.js unit-level security properties
     (direct import, no HTTP) -- token randomness/format,
     plaintext-never-persisted, visit-scoping, invalid/expired/consumed
     rejection, reissue-invalidates-old, target cap/no-reorder.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-followup-store-'))
    try {
      const store = createFollowUpSessionStore(tmpRoot, { ttlMinutes: 30 })

      /* ---- token format / randomness ---- */
      const { token: tokenA } = await store.issueToken({
        visit_id: 'visit-A',
        patient_id: 'patient-A',
        targets: [{ id: 't1', label: 'LBP_12' }],
      })
      assert('issued token matches base64url format regex', isValidTokenFormat(tokenA))
      assert('issued token has no padding/URL-unsafe chars', !/[+/=]/.test(tokenA))
      assert('issued token length implies >=128-bit entropy (32 bytes -> 43 base64url chars)', tokenA.length === 43)

      const { token: tokenA2 } = await store.issueToken({ visit_id: 'visit-A2', patient_id: 'patient-A', targets: [] })
      assert('two issued tokens are never identical', tokenA !== tokenA2)
      assert('hashToken is deterministic', hashToken(tokenA) === hashToken(tokenA))
      assert('hashToken differs for different raw tokens', hashToken(tokenA) !== hashToken(tokenA2))

      /* ---- plaintext never persisted ---- */
      const tokenFile = path.join(tmpRoot, 'tokens', `${hashToken(tokenA)}.json`)
      const onDisk = await readFile(tokenFile, 'utf8')
      assert('persisted token record does NOT contain the raw plaintext token', !onDisk.includes(tokenA))
      assert('persisted token record is keyed by hash, not visit_id', path.basename(tokenFile) === `${hashToken(tokenA)}.json`)
      const pointerFile = path.join(tmpRoot, 'by-visit', 'visit-A.json')
      const pointerOnDisk = await readFile(pointerFile, 'utf8')
      assert('visit pointer file does NOT contain the raw plaintext token either', !pointerOnDisk.includes(tokenA))

      /* ---- resolveToken: format-invalid input fails closed without a match ---- */
      assert('resolveToken(garbage) -> null (fails closed on malformed format)', (await store.resolveToken('not-a-real-token')) === null)
      assert('resolveToken(empty string) -> null', (await store.resolveToken('')) === null)
      assert('resolveToken(valid-shaped but never-issued token) -> null', (await store.resolveToken('a'.repeat(43))) === null)

      /* ---- resolveToken round-trip: only id/label ever readable ---- */
      const resolved = await store.resolveToken(tokenA)
      assert('resolveToken round-trip returns the correct visit_id', resolved.visit_id === 'visit-A')
      assert('resolveToken round-trip returns the correct patient_id (server-side only, never sent to a public client)', resolved.patient_id === 'patient-A')
      assert('resolveToken round-trip targets carry only id/label', Object.keys(resolved.targets[0]).sort().join(',') === 'id,label')

      /* ---- visit scoping: a token for visit-A never resolves as visit-A2 or vice versa ---- */
      const resolvedA2 = await store.resolveToken(tokenA2)
      assert('token for visit-A2 resolves to visit-A2, never visit-A', resolvedA2.visit_id === 'visit-A2')
      assert('token for visit-A does not leak visit-A2 data', resolved.visit_id !== resolvedA2.visit_id)

      /* ---- target cap at 3, original order preserved (no ranking) ---- */
      const { record: recordCapped } = await store.issueToken({
        visit_id: 'visit-cap',
        patient_id: 'patient-cap',
        targets: [
          { id: 't1', label: 'first' },
          { id: 't2', label: 'second' },
          { id: 't3', label: 'third' },
          { id: 't4', label: 'fourth' },
          { id: 't5', label: 'fifth' },
        ],
      })
      assert('issueToken caps targets at 3', recordCapped.targets.length === 3)
      assert(
        'issueToken preserves original candidate order (no re-ranking)',
        recordCapped.targets.map((t) => t.id).join(',') === 't1,t2,t3',
      )

      /* ---- consume once, double-submit fails closed ---- */
      const consumed1 = await store.consumeToken(tokenA)
      assert('consumeToken succeeds the first time', consumed1.ok === true)
      const consumed2 = await store.consumeToken(tokenA)
      assert('consumeToken (double-submit) fails closed the second time', consumed2.ok === false && consumed2.reason === 'consumed')

      /* ---- invalid token format on consume ---- */
      const consumedGarbage = await store.consumeToken('garbage!!')
      assert('consumeToken(malformed format) -> invalid', consumedGarbage.ok === false && consumedGarbage.reason === 'invalid')

      /* ---- expired token rejection (negative TTL -> already-expired at issuance) ---- */
      const expiringStore = createFollowUpSessionStore(tmpRoot, { ttlMinutes: -1 })
      const { token: expiredToken } = await expiringStore.issueToken({ visit_id: 'visit-expired', patient_id: 'patient-x', targets: [] })
      const consumedExpired = await expiringStore.consumeToken(expiredToken)
      assert('consumeToken(expired) -> expired, fails closed', consumedExpired.ok === false && consumedExpired.reason === 'expired')

      /* ---- invalidate ---- */
      const { token: tokenToInvalidate } = await store.issueToken({ visit_id: 'visit-inv', patient_id: 'patient-inv', targets: [] })
      await store.invalidateActiveForVisit('visit-inv')
      const consumedInvalidated = await store.consumeToken(tokenToInvalidate)
      assert('consumeToken(invalidated) -> invalidated, fails closed', consumedInvalidated.ok === false && consumedInvalidated.reason === 'invalidated')

      /* ---- reissue invalidates the previously-active token for the same visit ---- */
      const { token: tokenGen1 } = await store.issueToken({ visit_id: 'visit-reissue', patient_id: 'patient-r', targets: [] })
      const { token: tokenGen2 } = await store.issueToken({ visit_id: 'visit-reissue', patient_id: 'patient-r', targets: [] })
      assert('reissue produces a different raw token', tokenGen1 !== tokenGen2)
      const consumedOldAfterReissue = await store.consumeToken(tokenGen1)
      assert('the OLD token is invalidated after reissue', consumedOldAfterReissue.ok === false && consumedOldAfterReissue.reason === 'invalidated')
      const consumedNewAfterReissue = await store.consumeToken(tokenGen2)
      assert('the NEW token from reissue still consumes successfully', consumedNewAfterReissue.ok === true)

      /* ---- doctor-facing status read never exposes the raw token ---- */
      const { token: tokenGen3 } = await store.issueToken({ visit_id: 'visit-status', patient_id: 'patient-s', targets: [] })
      const status = await store.getActiveForVisit('visit-status')
      assert('doctor status read has no field equal to the raw token', JSON.stringify(status) !== JSON.stringify({ token: tokenGen3 }) && !JSON.stringify(status).includes(tokenGen3))
      assert('doctor status read carries only the hash, not plaintext', status.token_hash === hashToken(tokenGen3))

      /* ---- stale by-visit pointer cleanup (round 4 review fix): once a
         token file is aged off by cleanupOlderThan, its visit's pointer
         file (which only ever points at ONE token_hash at a time) must be
         cleaned up too, not left behind forever ---- */
      const { token: tokenForPointerTest } = await store.issueToken({ visit_id: 'visit-pointer-cleanup', patient_id: 'patient-ptr', targets: [] })
      const pointerFilePath = path.join(tmpRoot, 'by-visit', 'visit-pointer-cleanup.json')
      const pointerExistsBefore = await readFile(pointerFilePath, 'utf8').then(() => true).catch(() => false)
      assert('pointer file exists right after issuance', pointerExistsBefore)
      await store.consumeToken(tokenForPointerTest)
      // Backdate consumed_at so cleanupOlderThan(1) actually ages it off.
      const tokenFilePathForPointerTest = path.join(tmpRoot, 'tokens', `${hashToken(tokenForPointerTest)}.json`)
      const tokenOnDiskForPointerTest = JSON.parse(await readFile(tokenFilePathForPointerTest, 'utf8'))
      tokenOnDiskForPointerTest.consumed_at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      await writeFile(tokenFilePathForPointerTest, JSON.stringify(tokenOnDiskForPointerTest, null, 2), 'utf8')
      await store.cleanupOlderThan(1)
      const pointerExistsAfter = await readFile(pointerFilePath, 'utf8').then(() => true).catch(() => false)
      assert('the stale by-visit pointer file is removed once its token is cleaned up, not left behind forever', !pointerExistsAfter)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2: server/store.js-level workflow (deriveMicroFollowUpCandidates /
     startRevisit / submitFollowUpSession / listRevisitQueue) -- no HTTP,
     direct store calls, mirrors tests/server.spec.mjs's own
     longitudinal-history test setup pattern.
     ===================================================================== */
  {
    const wfRoot = await mkdtemp(path.join(tmpdir(), 'samindang-followup-workflow-'))
    const wfDataDir = path.join(wfRoot, 'submissions')
    try {
      const store = createStore(wfDataDir, { followUpTokenTtlMinutes: 30, followUpTokenRetentionHours: 24 })

      // Patient P: one prior real submission carrying pain + herbal
      // follow-up targets (order matters -- pain first, then herbal, per
      // deriveMicroFollowUpCandidates's own doc comment).
      const subP = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-p', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'patient P',
      })
      const patientP = subP.patient_id
      await store.saveWorkspace(
        subP.id,
        emptyWorkspaceFor({
          painFollowUpTargets: [
            { id: 'ft1', label: 'LBP_12', baseline: '7', postTreatmentValue: '5' },
            { id: 'ft2', label: 'LBP_ROM', baseline: '중등도 제한', postTreatmentValue: '경도 제한' },
          ],
          herbalFollowUpTargets: [{ id: 'ft3', label: '수면질', baseline: '나쁨', postTreatmentValue: '보통' }],
        }),
      )

      // Patient Q: a completely separate patient with its own prior targets
      // -- used to prove cross-patient isolation below.
      const subQ = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-q', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'patient Q',
      })
      const patientQ = subQ.patient_id
      await store.saveWorkspace(
        subQ.id,
        emptyWorkspaceFor({ painFollowUpTargets: [{ id: 'ftQ', label: 'Q_ONLY_TARGET -- 절대 P에게 노출되면 안 됨', baseline: '', postTreatmentValue: '' }] }),
      )

      // Patient R: no prior submission at all -- deriveMicroFollowUpCandidates
      // must return [] and never invent items.
      const visitRNoSubmission = await store.createVisit({ patient_id: undefined, submission_id: null })
      const patientR = visitRNoSubmission.patient_id

      /* ---- listRevisitQueue: NOT_STARTED (a revisit visit with no token issued yet) ---- */
      const queueBeforeAnyToken = await store.listRevisitQueue()
      const notStartedRow = queueBeforeAnyToken.find((r) => r.visit_id === visitRNoSubmission.id)
      assert('listRevisitQueue: a revisit visit with no token issued yet shows NOT_STARTED', notStartedRow.status === 'NOT_STARTED')

      /* ---- deriveMicroFollowUpCandidates: order + cap + no invention ---- */
      const candidatesP = await store.deriveMicroFollowUpCandidates(patientP, undefined)
      assert('candidates preserve pain-then-herbal order, no ranking', candidatesP.map((c) => c.id).join(',') === 'ft1,ft2,ft3')
      assert('candidates carry only id/label (patient-safe)', Object.keys(candidatesP[0]).sort().join(',') === 'id,label')

      const candidatesR = await store.deriveMicroFollowUpCandidates(patientR, undefined)
      assert('a patient with no prior submission-backed visit gets [] candidates, never invented items', Array.isArray(candidatesR) && candidatesR.length === 0)

      /* ---- cross-patient isolation ---- */
      const candidatesQ = await store.deriveMicroFollowUpCandidates(patientQ, undefined)
      assert('patient Q candidates never include patient P\'s target ids', !candidatesQ.some((c) => c.id === 'ft1' || c.id === 'ft2' || c.id === 'ft3'))
      assert('patient P candidates never include patient Q\'s target id', !candidatesP.some((c) => c.id === 'ftQ'))

      /* ---- startRevisit: one action creates visit + issues token together ---- */
      const started = await store.startRevisit(patientP)
      assert('startRevisit creates a NEW visit distinct from the prior submission-backed visit', started.visit.id !== subP.visit_id)
      assert('startRevisit new visit keeps the SAME patient_id (no name/phone/DOB re-matching)', started.visit.patient_id === patientP)
      assert('startRevisit new visit has submission_id null (no-questionnaire revisit)', started.visit.submission_id === null)
      assert('startRevisit issues a token scoped to the new visit', started.session.visit_id === started.visit.id)
      assert('startRevisit token snapshot matches derived candidates', started.session.targets.map((t) => t.id).join(',') === 'ft1,ft2,ft3')

      /* ---- visit-scoping: a second revisit for the SAME patient gets an
         INDEPENDENT visit_id and token, never reusing the first ---- */
      const startedAgain = await store.startRevisit(patientP)
      assert('a second start-revisit for the same patient creates yet another distinct visit', startedAgain.visit.id !== started.visit.id)
      assert('the first revisit\'s token is unaffected by the second (different visit -> different pointer)', started.session.visit_id !== startedAgain.session.visit_id)

      /* ---- submitFollowUpSession: server resolves labels from its OWN
         snapshot, ignores any client-supplied label / unknown target id ---- */
      const fakeAnswers = {
        targetRatings: [
          { targetId: 'ft1', label: 'HACKED LABEL -- client should never control this', patientReportedValue: '좋아짐' },
          { targetId: 'not-a-real-target-id', label: 'INJECTED', patientReportedValue: '나빠짐' },
        ],
        overallChange: '좋아짐',
        newSymptomReported: true,
        newSymptomNote: '새로 생긴 저림',
        adverseEffectReported: false,
        adverseEffectNote: '',
      }
      const submitResult = await store.submitFollowUpSession(started.token, fakeAnswers)
      assert('submitFollowUpSession succeeds for a valid ACTIVE token', submitResult.ok === true)
      assert('submitted response is attached to the token\'s OWN visit_id, not a client-supplied one', submitResult.visit_id === started.visit.id)
      const savedRating = submitResult.response.targetRatings.find((r) => r.targetId === 'ft1')
      assert('server re-resolves the label from its own snapshot, ignoring the client-supplied fake label', savedRating.label === 'LBP_12')
      assert('server never persists the client-injected fake label text anywhere', !JSON.stringify(submitResult.response).includes('HACKED LABEL'))
      assert('a target id NOT in the token\'s snapshot is silently dropped, never trusted', !submitResult.response.targetRatings.some((r) => r.targetId === 'not-a-real-target-id'))
      assert('needsAttention-driving field (newSymptomReported) round-trips correctly', submitResult.response.newSymptomReported === true)

      /* ---- double-submit: the same token cannot be consumed twice ---- */
      const doubleSubmit = await store.submitFollowUpSession(started.token, fakeAnswers)
      assert('double-submit with the same token fails closed', doubleSubmit.ok === false && doubleSubmit.reason === 'consumed')
      const responseAfterDouble = await store.getMicroFollowUpResponse(started.visit.id)
      assert('the response saved by the FIRST submit is not overwritten/duplicated by the double-submit attempt', responseAfterDouble.targetRatings.length === submitResult.response.targetRatings.length)

      /* ---- visit-scoping: the second revisit's own visit is untouched by
         the first revisit's submission ---- */
      const secondVisitResponse = await store.getMicroFollowUpResponse(startedAgain.visit.id)
      assert('a DIFFERENT visit for the same patient has no response leaked into it', secondVisitResponse === null)

      /* ---- listRevisitQueue: status transitions + needs_attention flag ---- */
      const queueAfterSubmit = await store.listRevisitQueue()
      const completedRow = queueAfterSubmit.find((r) => r.visit_id === started.visit.id)
      assert('listRevisitQueue: a submitted revisit shows COMPLETED', completedRow.status === 'COMPLETED')
      assert('listRevisitQueue: needs_attention is true when a new symptom was reported (operational flag only)', completedRow.needs_attention === true)

      const waitingRow = queueAfterSubmit.find((r) => r.visit_id === startedAgain.visit.id)
      assert('listRevisitQueue: an issued-but-unanswered revisit shows WAITING_FOR_PATIENT', waitingRow.status === 'WAITING_FOR_PATIENT')
      assert('listRevisitQueue: needs_attention is false with no response yet', waitingRow.needs_attention === false)

      const startedNoTargetsPatient = await store.startRevisit(patientR)
      const queueAfterR = await store.listRevisitQueue()
      const noTargetsRow = queueAfterR.find((r) => r.visit_id === startedNoTargetsPatient.visit.id)
      assert('a revisit for a patient with no prior targets is still tracked in the queue (never disappears)', noTargetsRow !== undefined)
      assert('a revisit with a freshly-issued token (even with 0 targets) shows WAITING_FOR_PATIENT, not NOT_STARTED', noTargetsRow.status === 'WAITING_FOR_PATIENT')

      /* ---- listRevisitQueue: EXPIRED (token issued but its TTL has already elapsed, never answered) ---- */
      const expiredQueueStore = createStore(wfDataDir, { followUpTokenTtlMinutes: -1 })
      const expiredVisit = await expiredQueueStore.startRevisit(patientP)
      const queueWithExpired = await expiredQueueStore.listRevisitQueue()
      const expiredRow = queueWithExpired.find((r) => r.visit_id === expiredVisit.visit.id)
      assert('listRevisitQueue: an issued-but-never-answered token past its TTL shows EXPIRED', expiredRow.status === 'EXPIRED')

      /* ---- retention decoupling: follow-up-session token cleanup must run
         INDEPENDENTLY of the ordinary medical-record retention gate -- a
         clinic disabling/limiting SAMINDANG_RETENTION_DAYS must not
         silently also stop cleaning up spent one-time tokens (this was a
         design mistake caught and corrected mid-implementation; see
         DECISIONS.md). Proven here by backdating a CONSUMED token file on
         disk, then showing the medical-record cleanup path never removes
         it, while the dedicated follow-up-session cleanup path does. ---- */
      const retentionStore = createStore(wfDataDir, { followUpTokenTtlMinutes: 30, followUpTokenRetentionHours: 1 })
      const forRetention = await retentionStore.startRevisit(patientP)
      await retentionStore.submitFollowUpSession(forRetention.token, {
        targetRatings: [],
        overallChange: '',
        newSymptomReported: false,
        newSymptomNote: '',
        adverseEffectReported: false,
        adverseEffectNote: '',
      })
      const tokenFilePath = path.join(wfRoot, 'follow-up-sessions', 'tokens', `${hashToken(forRetention.token)}.json`)
      const tokenOnDisk = JSON.parse(await readFile(tokenFilePath, 'utf8'))
      tokenOnDisk.consumed_at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48h ago, well past the 1h retention window
      await writeFile(tokenFilePath, JSON.stringify(tokenOnDisk, null, 2), 'utf8')

      const deletedByMedicalRecordCleanup = await retentionStore.cleanupOlderThan(1)
      assert(
        'medical-record cleanupOlderThan(days) never deletes follow-up-session token files as a side effect',
        deletedByMedicalRecordCleanup === 0,
      )
      const tokenStillOnDiskAfterMedicalCleanup = JSON.parse(await readFile(tokenFilePath, 'utf8'))
      assert(
        'the backdated consumed token file still exists after the medical-record-only cleanup ran',
        tokenStillOnDiskAfterMedicalCleanup.status === 'CONSUMED',
      )

      const deletedByFollowUpCleanup = await retentionStore.cleanupFollowUpSessions()
      assert('the DEDICATED follow-up-session cleanup, called on its own, removes the backdated spent token', deletedByFollowUpCleanup >= 1)
      let tokenFileGone = false
      try {
        await readFile(tokenFilePath, 'utf8')
      } catch (err) {
        tokenFileGone = err.code === 'ENOENT'
      }
      assert('the token file is actually gone from disk after cleanupFollowUpSessions', tokenFileGone)
    } finally {
      await rm(wfRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2.5 (round 4 review fixes): required regression scenario for
     longitudinal continuity, startRevisit atomicity under failure, and
     submitFollowUpSession durability/retriability under failure.
     ===================================================================== */
  {
    const r5Root = await mkdtemp(path.join(tmpdir(), 'samindang-followup-review5-'))
    const r5DataDir = path.join(r5Root, 'submissions')
    try {
      const store = createStore(r5DataDir, { followUpTokenTtlMinutes: 30, followUpTokenRetentionHours: 24 })

      /* ---- required regression scenario: Initial selects target A ->
         Revisit 1 patient enters current A + clinician selects target B ->
         Revisit 2 must receive B (not initial A), prior visits immutable ---- */
      const subInit = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-r5-init', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'r5 patient',
      })
      const r5PatientId = subInit.patient_id
      await store.saveWorkspace(
        subInit.id,
        emptyWorkspaceFor({
          painFinalAssessment: { finalWorkingAssessment: 'INITIAL 판단', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-01-01T00:00:00.000Z' },
          painFollowUpTargets: [{ id: 'targetA', label: 'Target A (통증)', baseline: '7', postTreatmentValue: '5' }],
        }),
      )

      // Revisit 1: candidates must be [A] (derived from the initial submission, nothing newer yet).
      const revisit1 = await store.startRevisit(r5PatientId)
      assert('regression scenario: Revisit 1 candidates derived from the initial visit -> target A', revisit1.session.targets.map((t) => t.id).join(',') === 'targetA')

      // Patient answers Revisit 1's Micro Follow-up (current value for A).
      await store.submitFollowUpSession(revisit1.token, {
        targetRatings: [{ targetId: 'targetA', patientReportedValue: '4' }],
        overallChange: '좋아짐',
        newSymptomReported: false,
        newSymptomNote: '',
        adverseEffectReported: false,
        adverseEffectNote: '',
      })

      // Clinician reviews Revisit 1 and selects a NEW target B to track going forward.
      const revisit1SaveResult = await store.saveVisitWorkspace(revisit1.visit.id, {
        schema_version: '1.0.0',
        finalAssessment: { finalWorkingAssessment: 'REVISIT 1 판단', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: '2026-01-08T00:00:00.000Z' },
        carePlan: { currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: '', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: '', recordedAt: null },
        followUpTargets: [{ id: 'targetB', label: 'Target B (걷기 시간)', baseline: '20min', postTreatmentValue: '' }],
        nextReassessmentPlan: { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' },
        reassessment: { items: [], finalReassessmentNote: '', recordedAt: null },
        updated_at: '2026-01-08T00:00:00.000Z',
      })
      assert('clinician can save the revisit workspace with the newly chosen target B', revisit1SaveResult.ok === true)

      // Revisit 2: candidates must now be [B], NOT the stale initial target A.
      const revisit2 = await store.startRevisit(r5PatientId)
      assert('regression scenario: Revisit 2 candidates come from Revisit 1s newly-chosen target B, not the stale initial target A', revisit2.session.targets.map((t) => t.id).join(',') === 'targetB')
      assert('regression scenario: Revisit 2 candidates do NOT include the old target A', !revisit2.session.targets.some((t) => t.id === 'targetA'))

      // Prior visits remain immutable: the initial submission's own workspace still shows target A untouched.
      const initialRecordAfter = await store.getSubmission(subInit.id)
      assert('regression scenario: the initial submission workspace is untouched (still target A)', initialRecordAfter.workspace.painFollowUpTargets[0].id === 'targetA')
      const revisit1RecordAfter = await store.getVisit(revisit1.visit.id)
      assert('regression scenario: Revisit 1s own workspace still shows its own target B (not overwritten by Revisit 2)', revisit1RecordAfter.workspace.followUpTargets[0].id === 'targetB')

      // History itself, from Revisit 2's own point of view (excluding itself), shows Revisit 1 as the latest -- not the initial submission.
      const historyFromRevisit2 = await store.getPatientHistory(r5PatientId, revisit2.visit.id)
      assert('regression scenario: history ordered so Revisit 1 (not the initial submission) is the latest visit', historyFromRevisit2.visits[0].visit_id === revisit1.visit.id)

      /* ---- startRevisit atomicity: if token issuance fails, the visit it
         just created must be rolled back, not left as an orphan. Uses its
         OWN isolated data dir (rather than reusing r5Root above) so
         blocking the follow-up-sessions/tokens/ directory can't also break
         reads of the OTHER, already-issued tokens still in scope above
         (listRevisitQueue reads every revisit's token status, and those
         reads would otherwise ENOTDIR on the same blocked path). ---- */
      const atomicityRoot = await mkdtemp(path.join(tmpdir(), 'samindang-followup-atomicity-'))
      try {
        const atomicityStore = createStore(path.join(atomicityRoot, 'submissions'), { followUpTokenTtlMinutes: 30 })
        const tokensDirPath = path.join(atomicityRoot, 'follow-up-sessions', 'tokens')
        // Force issueToken to fail: put a FILE at the exact path its
        // internal mkdir(tokensDir, {recursive:true}) needs to create as a
        // directory (checked before pointersDir/by-visit, so that one never
        // even gets attempted), so that call throws EEXIST before any
        // token/visit pointer is ever written.
        await mkdir(path.dirname(tokensDirPath), { recursive: true })
        await writeFile(tokensDirPath, 'blocking file, not a directory', 'utf8')
        let startRevisitThrew = false
        try {
          await atomicityStore.startRevisit('atomicity-test-patient')
        } catch {
          startRevisitThrew = true
        }
        assert('startRevisit propagates the token-issuance failure instead of silently succeeding', startRevisitThrew)
        const visitFiles = await readdir(path.join(atomicityRoot, 'visits')).catch((err) => {
          if (err.code === 'ENOENT') return [] // visits/ never even got created -- also proof of no orphan
          throw err
        })
        assert('startRevisit atomicity: no orphan no-submission visit is left behind after a failed token issuance', visitFiles.length === 0)
      } finally {
        await rm(atomicityRoot, { recursive: true, force: true })
      }

      /* ---- submitFollowUpSession durability/retriability: if the durable
         response save fails, the token must remain ACTIVE so the patient
         can retry with the exact same link, and no partial response is
         ever recorded ---- */
      const revisitForFailureTest = await store.startRevisit(r5PatientId)
      const microFollowUpDirPath = path.join(r5Root, 'micro-follow-up')
      // Force microFollowUp.saveResponse to fail the same way: replace its
      // (already-existing, from the regression scenario's earlier
      // submissions above) directory with a FILE at the same path, so its
      // internal mkdir(...) throws EEXIST.
      await rm(microFollowUpDirPath, { recursive: true, force: true })
      await writeFile(microFollowUpDirPath, 'blocking file, not a directory', 'utf8')
      let submitThrew = false
      try {
        await store.submitFollowUpSession(revisitForFailureTest.token, {
          targetRatings: [],
          overallChange: '나빠짐',
          newSymptomReported: false,
          newSymptomNote: '',
          adverseEffectReported: false,
          adverseEffectNote: '',
        })
      } catch {
        submitThrew = true
      }
      assert('submitFollowUpSession propagates a durable-save failure instead of silently succeeding', submitThrew)

      // Unblock the directory before reading back -- otherwise the read
      // itself would ENOTDIR on the still-blocked path, not report a clean
      // "nothing saved".
      await unlink(microFollowUpDirPath)
      const responseAfterFailure = await store.getMicroFollowUpResponse(revisitForFailureTest.visit.id)
      assert('no partial/lost response is recorded when the durable save failed', responseAfterFailure === null)

      // Retry with the SAME token -- must succeed, proving the token was
      // never consumed by the failed attempt.
      const retryResult = await store.submitFollowUpSession(revisitForFailureTest.token, {
        targetRatings: [],
        overallChange: '나빠짐',
        newSymptomReported: false,
        newSymptomNote: '',
        adverseEffectReported: false,
        adverseEffectNote: '',
      })
      assert('retrying with the SAME token after the failure is fixed succeeds -- the token was never burned by the failed attempt', retryResult.ok === true)
      const responseAfterRetry = await store.getMicroFollowUpResponse(revisitForFailureTest.visit.id)
      assert('the retried submission is actually saved', responseAfterRetry !== null && responseAfterRetry.overallChange === '나빠짐')

      /* ---- workspace single-source-of-truth: rejecting at the STORE layer,
         not just the HTTP route -- a submission-backed visit's workspace
         must never be writable through saveVisitWorkspace ---- */
      const submissionBackedVisitId = subInit.visit_id
      const rejectResult = await store.saveVisitWorkspace(submissionBackedVisitId, {
        schema_version: '1.0.0',
        finalAssessment: { finalWorkingAssessment: 'SHOULD NEVER BE WRITTEN', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
        carePlan: { currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: '', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: '', recordedAt: null },
        followUpTargets: [],
        nextReassessmentPlan: { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' },
        reassessment: { items: [], finalReassessmentNote: '', recordedAt: null },
        updated_at: null,
      })
      assert('store-layer: saveVisitWorkspace rejects a submission-backed visit', rejectResult.ok === false && rejectResult.reason === 'submission_backed')
      const submissionBackedVisitAfter = await store.getVisit(submissionBackedVisitId)
      assert('the submission-backed visit record itself was never mutated by the rejected write', submissionBackedVisitAfter.workspace === null)

      const notFoundResult = await store.saveVisitWorkspace('00000000-0000-0000-0000-000000000000', {})
      assert('store-layer: saveVisitWorkspace on an unknown visit id reports not_found', notFoundResult.ok === false && notFoundResult.reason === 'not_found')
    } finally {
      await rm(r5Root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 3: HTTP-level -- doctor-route auth guards, public endpoint
     no-identifier-leak, CORS/body-size/rate-limit guards, and the full
     patient-tablet-facing lifecycle end to end.
     ===================================================================== */
  {
    const httpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-followup-http-'))
    const httpDataDir = path.join(httpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir: httpDataDir, followUpTokenTtlMinutes: 30 })
    try {
      const store = createStore(httpDataDir, { followUpTokenTtlMinutes: 30 })
      const subP = await store.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-http-p', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'http patient P',
      })
      const patientId = subP.patient_id
      await store.saveWorkspace(
        subP.id,
        emptyWorkspaceFor({
          painFinalAssessment: { finalWorkingAssessment: 'CLINICIAN-ONLY NOTE -- must never reach the public endpoint', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
          painFollowUpTargets: [{ id: 'ft1', label: 'LBP_12', baseline: '7', postTreatmentValue: '5' }],
        }),
      )

      const evilOriginHeaders = { origin: 'https://evil.example.com' }
      const goodOriginHeaders = { origin: 'http://localhost:5173', 'content-type': 'application/json' }

      /* ---- doctor-route guards: every new round-3 route rejects an evil Origin ---- */
      {
        const res = await fetch(`${base}/api/patients/${encodeURIComponent(patientId)}/start-revisit`, { method: 'POST', headers: evilOriginHeaders })
        assert('POST start-revisit (evil Origin) -> 403', res.status === 403)
      }
      {
        const res = await fetch(`${base}/api/visits/revisits`, { headers: evilOriginHeaders })
        assert('GET /api/visits/revisits (evil Origin) -> 403', res.status === 403)
      }

      /* ---- start-revisit rejects an unknown patient_id (never auto-creates a patient) ---- */
      {
        const res = await fetch(`${base}/api/patients/${encodeURIComponent('never-seen-patient-id')}/start-revisit`, {
          method: 'POST',
          headers: goodOriginHeaders,
        })
        assert('POST start-revisit with unknown patient_id -> 400 (no auto-create, no name/phone/DOB fallback matching)', res.status === 400)
      }

      /* ---- start-revisit body content is ignored: only the path patient_id is ever used
         (no name/phone/DOB in the request can influence which patient this attaches to) ---- */
      let issuedVisitId
      let issuedToken
      {
        const res = await fetch(`${base}/api/patients/${encodeURIComponent(patientId)}/start-revisit`, {
          method: 'POST',
          headers: goodOriginHeaders,
          body: JSON.stringify({ patient_name: '홍길동', phone: '01000000000', dob: '1990-01-01' }),
        })
        assert('POST start-revisit -> 201', res.status === 201)
        const body = await res.json()
        assert('start-revisit response visit.patient_id is the PATH patient_id, unaffected by body name/phone/dob', body.visit.patient_id === patientId)
        assert('start-revisit response has no name/phone/dob echoed back', !('patient_name' in body) && !JSON.stringify(body).includes('01000000000'))
        issuedVisitId = body.visit.id
        issuedToken = body.token
        assert('doctor-side start-revisit response DOES legitimately carry the raw token (only place this ever happens)', typeof issuedToken === 'string' && issuedToken.length > 0)
      }

      /* ---- doctor-side follow-up-session status/workspace/reissue/invalidate: evil Origin -> 403 ---- */
      for (const [label, url, init] of [
        ['GET follow-up-session status', `${base}/api/visits/${issuedVisitId}/follow-up-session`, { headers: evilOriginHeaders }],
        ['POST follow-up-session reissue', `${base}/api/visits/${issuedVisitId}/follow-up-session/reissue`, { method: 'POST', headers: evilOriginHeaders }],
        ['POST follow-up-session invalidate', `${base}/api/visits/${issuedVisitId}/follow-up-session/invalidate`, { method: 'POST', headers: evilOriginHeaders }],
        ['PUT visit workspace', `${base}/api/visits/${issuedVisitId}/workspace`, { method: 'PUT', headers: evilOriginHeaders, body: '{}' }],
      ]) {
        const res = await fetch(url, init)
        assert(`${label} (evil Origin) -> 403`, res.status === 403)
      }

      /* ---- doctor status read never exposes the raw token ---- */
      {
        const res = await fetch(`${base}/api/visits/${issuedVisitId}/follow-up-session`, { headers: goodOriginHeaders })
        const body = await res.json()
        assert('doctor status read -> 200', res.status === 200)
        assert('doctor status read never contains the raw token string', !JSON.stringify(body).includes(issuedToken))
      }

      /* ---- PUBLIC GET: no doctor auth needed (patient tablet is a plain browser) ---- */
      let publicTargets
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(issuedToken)}`, { headers: evilOriginHeaders })
        assert('public GET follow-up-session succeeds even with an "evil" Origin (patient device has no doctor privilege to protect)', res.status === 200)
        const body = await res.json()
        assert('public GET status is ACTIVE', body.status === 'ACTIVE')
        assert('public GET reveals ONLY status/targets/expires_at -- no other keys', Object.keys(body).sort().join(',') === 'expires_at,status,targets')
        assert('public GET target items carry only id/label', Object.keys(body.targets[0]).sort().join(',') === 'id,label')
        assert('public GET response never contains the patient_id', !JSON.stringify(body).includes(patientId))
        assert('public GET response never contains the clinician\'s final-assessment note text', !JSON.stringify(body).includes('CLINICIAN-ONLY NOTE'))
        assert('public GET response never contains any name/phone-shaped patient_label text', !JSON.stringify(body).includes('http patient P'))
        publicTargets = body.targets
      }

      /* ---- PUBLIC POST: cannot overwrite target labels via the request body ---- */
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(issuedToken)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetRatings: [{ targetId: publicTargets[0].id, label: 'INJECTED LABEL FROM PATIENT DEVICE', patientReportedValue: '좋아짐' }],
            overallChange: '좋아짐',
            newSymptomReported: false,
            newSymptomNote: '',
            adverseEffectReported: true,
            adverseEffectNote: '치료 후 어지러움',
          }),
        })
        assert('public POST follow-up-session -> 201', res.status === 201)
        const body = await res.json()
        assert('public POST response body is minimal ({ok:true}), no echoed identifiers', Object.keys(body).sort().join(',') === 'ok')
      }

      /* ---- doctor-side confirms the server-resolved label won, never the injected one ---- */
      {
        const res = await fetch(`${base}/api/visits/${issuedVisitId}/micro-follow-up`, { headers: goodOriginHeaders })
        const body = await res.json()
        const savedRating = body.response.targetRatings.find((r) => r.targetId === publicTargets[0].id)
        assert('doctor-visible saved label is the server\'s own snapshot label, not the patient-injected one', savedRating.label === 'LBP_12')
        assert('the injected label text never made it into storage at all', !JSON.stringify(body).includes('INJECTED LABEL'))
        assert('adverseEffectReported/adverseEffectNote round-trip correctly', body.response.adverseEffectReported === true && body.response.adverseEffectNote === '치료 후 어지러움')
      }

      /* ---- doctor queue reflects the completed revisit with needs_attention (adverse effect) ---- */
      {
        const res = await fetch(`${base}/api/visits/revisits`, { headers: goodOriginHeaders })
        const list = await res.json()
        const row = list.find((r) => r.visit_id === issuedVisitId)
        assert('revisit queue shows COMPLETED after patient submission', row.status === 'COMPLETED')
        assert('revisit queue needs_attention true from the reported adverse effect (operational flag, never a safety classification)', row.needs_attention === true)
      }

      /* ---- consumed token: a second public POST fails closed (double-submit / re-visit link reuse) ---- */
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(issuedToken)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetRatings: [], overallChange: '', newSymptomReported: false, newSymptomNote: '', adverseEffectReported: false, adverseEffectNote: '' }),
        })
        assert('public POST with an already-consumed token -> 410', res.status === 410)
        const body = await res.json()
        assert('consumed-token rejection reports CONSUMED', body.status === 'CONSUMED')
      }
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(issuedToken)}`)
        const body = await res.json()
        assert('public GET on an already-consumed token no longer shows ACTIVE/targets', body.status === 'CONSUMED' && !('targets' in body))
      }

      /* ---- malformed / never-issued token -> INVALID, never a crash ---- */
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent('not-a-real-token-at-all')}`)
        assert('public GET with a malformed token -> 404', res.status === 404)
        const body = await res.json()
        assert('malformed token reports INVALID', body.status === 'INVALID')
      }
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent('not-a-real-token-at-all')}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        assert('public POST with a malformed token -> 404 (never a 500/crash)', res.status === 404)
      }

      /* ---- malformed PERCENT-ENCODING (not just a garbage token string) ->
         INVALID, never a 500 crash (round 4 review fix) ---- */
      {
        // A lone "%" not followed by two hex digits -- decodeURIComponent
        // throws a URIError on this. Sent raw (not encodeURIComponent'd)
        // so the malformed sequence actually reaches the server as-is.
        const res = await fetch(`${base}/api/follow-up-session/abc%zzdef`)
        assert('public GET with a malformed percent-encoded token -> 404, never a 500', res.status === 404)
        const body = await res.json()
        assert('malformed percent-encoding reports INVALID, not a generic server error', body.status === 'INVALID')
      }
      {
        const res = await fetch(`${base}/api/follow-up-session/abc%zzdef`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        assert('public POST with a malformed percent-encoded token -> 404, never a 500', res.status === 404)
      }

      /* ---- reissue invalidates the old token, issues a new working one ---- */
      let secondVisitId
      let firstTokenForReissue
      let secondTokenAfterReissue
      {
        const startRes = await fetch(`${base}/api/patients/${encodeURIComponent(patientId)}/start-revisit`, { method: 'POST', headers: goodOriginHeaders })
        const startBody = await startRes.json()
        secondVisitId = startBody.visit.id
        firstTokenForReissue = startBody.token

        const reissueRes = await fetch(`${base}/api/visits/${secondVisitId}/follow-up-session/reissue`, { method: 'POST', headers: goodOriginHeaders })
        assert('reissue -> 200', reissueRes.status === 200)
        const reissueBody = await reissueRes.json()
        secondTokenAfterReissue = reissueBody.token
        assert('reissue returns a different raw token than the original', secondTokenAfterReissue !== firstTokenForReissue)

        const oldRes = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(firstTokenForReissue)}`)
        const oldBody = await oldRes.json()
        assert('the OLD (pre-reissue) token now reports INVALIDATED via the public endpoint', oldBody.status === 'INVALIDATED')

        const newRes = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(secondTokenAfterReissue)}`)
        const newBody = await newRes.json()
        assert('the NEW (post-reissue) token is ACTIVE', newBody.status === 'ACTIVE')
      }

      /* ---- doctor-initiated invalidate makes the link stop working, with no reissue ---- */
      {
        const invalidateRes = await fetch(`${base}/api/visits/${secondVisitId}/follow-up-session/invalidate`, { method: 'POST', headers: goodOriginHeaders })
        assert('invalidate -> 200', invalidateRes.status === 200)
        const checkRes = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(secondTokenAfterReissue)}`)
        const checkBody = await checkRes.json()
        assert('a doctor-invalidated link reports INVALIDATED to the patient device', checkBody.status === 'INVALIDATED')
      }

      /* ---- expiry: a token issued with a negative TTL is already expired ---- */
      {
        const { server: expServer, base: expBase } = await startServer({ dataDir: httpDataDir, followUpTokenTtlMinutes: -1 })
        try {
          const startRes = await fetch(`${expBase}/api/patients/${encodeURIComponent(patientId)}/start-revisit`, { method: 'POST', headers: goodOriginHeaders })
          const startBody = await startRes.json()
          const getRes = await fetch(`${expBase}/api/follow-up-session/${encodeURIComponent(startBody.token)}`)
          const getBody = await getRes.json()
          assert('public GET on an expired token reports EXPIRED (fails closed, never shows stale targets)', getBody.status === 'EXPIRED' && !('targets' in getBody))
          const postRes = await fetch(`${expBase}/api/follow-up-session/${encodeURIComponent(startBody.token)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          assert('public POST on an expired token -> 410', postRes.status === 410)
          const postBody = await postRes.json()
          assert('expired-token POST reports EXPIRED', postBody.status === 'EXPIRED')
        } finally {
          await stopServer(expServer)
        }
      }

      /* ---- CORS: public follow-up-session route reflects the caller's own Origin (LAN posture, same as patient POST /api/submissions), never a fixed doctor allowlist ---- */
      {
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent('any-token-shape-1234567890123456789012')}`, { headers: evilOriginHeaders })
        assert(
          'public follow-up-session route reflects an arbitrary Origin in CORS (patient device, not a doctor-only allowlist)',
          res.headers.get('access-control-allow-origin') === 'https://evil.example.com',
        )
      }

      /* ---- body-size guard intact on the public POST route ---- */
      {
        const hugeBody = JSON.stringify({ overallChange: 'x'.repeat(2 * 1024 * 1024) })
        const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent('any-token-shape-1234567890123456789013')}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: hugeBody,
        })
        assert('public POST with an oversized body -> 413 (existing MAX_BODY_BYTES guard still applies)', res.status === 413)
      }

      /* ---- rate limiting on failed public attempts ---- */
      {
        let lastStatus
        for (let i = 0; i < 25; i++) {
          const res = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(`ratelimit-probe-token-shape-${i}-0000000000000`)}`)
          lastStatus = res.status
          if (lastStatus === 429) break
        }
        assert('repeated failed public token lookups eventually trigger 429 rate limiting', lastStatus === 429)
      }
    } finally {
      await stopServer(server)
      await rm(httpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 4: structural guarantee -- doctor-token-absent-from-patient-flow.
     followUpClient.ts (the patient tablet's own client) must never import
     serverClient.ts or doctorToken.ts, so a doctor token can structurally
     never reach any request this file makes -- not just a runtime
     coincidence of what happens to be in sessionStorage on this device.
     ===================================================================== */
  {
    const followUpClientPath = path.join(__dirname, '..', 'src', 'lib', 'followUpClient.ts')
    const src = await readFile(followUpClientPath, 'utf8')
    assert('followUpClient.ts does not import serverClient.ts', !/from\s+['"].*serverClient['"]/.test(src))
    assert('followUpClient.ts does not import doctorToken.ts', !/from\s+['"].*doctorToken['"]/.test(src))
    assert('followUpClient.ts never references x-doctor-token', !src.includes('x-doctor-token'))
    // Note: substring-match on `sessionStorage.` (actual property access), not
    // bare "sessionStorage" -- the file's own doc comment above mentions the
    // word in prose (explaining what this file deliberately avoids), which
    // is not itself a violation.
    assert('followUpClient.ts never actually accesses sessionStorage (where the doctor token lives)', !src.includes('sessionStorage.'))

    // FollowUpScreen.tsx (the patient-facing screen) must only ever import
    // followUpClient.ts for network access, never serverClient.ts directly.
    const followUpScreenPath = path.join(__dirname, '..', 'src', 'screens', 'FollowUpScreen.tsx')
    const screenSrc = await readFile(followUpScreenPath, 'utf8')
    assert('FollowUpScreen.tsx does not import serverClient.ts', !/from\s+['"].*serverClient['"]/.test(screenSrc))
    assert('FollowUpScreen.tsx does not import doctorToken.ts', !/from\s+['"].*doctorToken['"]/.test(screenSrc))
  }

  console.log(`\n${passCount} assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
