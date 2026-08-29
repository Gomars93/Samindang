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
import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
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
      // startRevisitDedupWindowMs kept tiny (not the 5s production default)
      // so this suite can prove "the window expired, this is now a
      // genuinely separate action" without actually sleeping for seconds.
      const store = createStore(wfDataDir, { followUpTokenTtlMinutes: 30, followUpTokenRetentionHours: 24, startRevisitDedupWindowMs: 50 })

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

      /* ---- Round 6 review fix (duplicate-start prevention): an immediate
         repeat call for the SAME patient (double-click / network retry,
         well within the dedup window) must return the exact SAME visit and
         the exact SAME token -- never mint a second visit/token pair for
         one intended click. Since the plaintext token can never be
         regenerated later (see followUpSessionStore.js), replaying it is
         the only way a legitimately-retried request still gets it. ---- */
      const startedImmediateRepeat = await store.startRevisit(patientP)
      assert(
        'an immediate repeat start-revisit for the same patient returns the SAME visit (dedup, not a duplicate)',
        startedImmediateRepeat.visit.id === started.visit.id,
      )
      assert(
        'an immediate repeat start-revisit returns the SAME token as the original call',
        startedImmediateRepeat.token === started.token,
      )

      /* ---- Round 17 (restart-safe / multi-process correctness): a
         start-revisit for the SAME patient AFTER the in-memory dedup
         window has elapsed, while the FIRST revisit is STILL UNANSWERED,
         is no longer treated as "a genuinely separate action" -- that
         assumption was exactly the restart/retry duplication gap this
         round closes (a process restart, or a retry landing on a second
         process after an owner-lock takeover, is invisible to the 5s
         in-memory cache but must not mint a second live capability for
         one intended click). Durable state is now consulted
         (server/store.js's findPendingRevisitForPatient): an unanswered,
         non-invalidated revisit is REUSED -- a fresh token reissued onto
         the SAME visit_id, never a second visit. The genuinely-new-visit
         case (the prior revisit was actually ANSWERED first) is unchanged
         and covered by the longitudinal-continuity regression below. ---- */
      await new Promise((resolve) => setTimeout(resolve, 80))
      const startedAgain = await store.startRevisit(patientP)
      assert('a start-revisit past the dedup window, while still unanswered, REUSES the same pending visit instead of duplicating it', startedAgain.visit.id === started.visit.id)
      // `created: false` (no new visit) but `reused: false` (a genuinely
      // NEW token was minted onto the existing visit, unlike the fast
      // in-memory-cache-hit path above which is `reused: true`) -- see
      // store.js's startRevisit doc comment on why these are two
      // independent flags now, not one.
      assert('the reuse creates no new visit (created: false)', startedAgain.created === false)
      assert('the reuse mints a genuinely new token, so it is NOT reused: true (a real follow_up_session_issued event happened)', startedAgain.reused === false)
      assert(
        'the reused revisit issues a genuinely FRESH token, never the original plaintext (which can never be recovered once dropped)',
        startedAgain.token !== started.token,
      )
      const originalTokenAfterReuse = await store.resolveFollowUpSession(started.token)
      assert(
        'the original (pre-reuse) token is invalidated once a fresh one is reissued onto the same visit, same as any other reissue',
        originalTokenAfterReuse.status === 'INVALIDATED',
      )

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
      // Round 17: submit using startedAgain.token, the currently-live one
      // for this visit -- started.token was just invalidated above by the
      // reissue-on-reuse, exactly like any other reissue supersedes its
      // predecessor.
      const submitResult = await store.submitFollowUpSession(startedAgain.token, fakeAnswers)
      assert('submitFollowUpSession succeeds for a valid ACTIVE token', submitResult.ok === true)
      assert('submitted response is attached to the token\'s OWN visit_id, not a client-supplied one', submitResult.visit_id === startedAgain.visit.id)
      const savedRating = submitResult.response.targetRatings.find((r) => r.targetId === 'ft1')
      assert('server re-resolves the label from its own snapshot, ignoring the client-supplied fake label', savedRating.label === 'LBP_12')
      assert('server never persists the client-injected fake label text anywhere', !JSON.stringify(submitResult.response).includes('HACKED LABEL'))
      assert('a target id NOT in the token\'s snapshot is silently dropped, never trusted', !submitResult.response.targetRatings.some((r) => r.targetId === 'not-a-real-target-id'))
      assert('needsAttention-driving field (newSymptomReported) round-trips correctly', submitResult.response.newSymptomReported === true)

      /* ---- double-submit: the same token cannot be consumed twice ---- */
      const doubleSubmit = await store.submitFollowUpSession(startedAgain.token, fakeAnswers)
      assert('double-submit with the same token fails closed', doubleSubmit.ok === false && doubleSubmit.reason === 'consumed')
      const responseAfterDouble = await store.getMicroFollowUpResponse(startedAgain.visit.id)
      assert('the response saved by the FIRST submit is not overwritten/duplicated by the double-submit attempt', responseAfterDouble.targetRatings.length === submitResult.response.targetRatings.length)

      /* ---- Round 17: NOW that this revisit has actually been ANSWERED,
         a further start-revisit for the same patient is once again a
         genuinely NEW, separate action (this is the pre-existing
         longitudinal-continuity scenario: patient answered, doctor later
         starts a fresh follow-up) and gets an INDEPENDENT visit_id and
         token -- the "still pending" reuse above never applies once a
         response exists. ---- */
      const startedThird = await store.startRevisit(patientP)
      assert('once the pending revisit has been answered, a further start-revisit creates a genuinely NEW, separate visit', startedThird.visit.id !== startedAgain.visit.id)
      assert('the new visit is reported as reused: false', startedThird.reused === false)

      /* ---- visit-scoping: the new (third) visit is untouched by the
         earlier submission ---- */
      const secondVisitResponse = await store.getMicroFollowUpResponse(startedThird.visit.id)
      assert('a DIFFERENT visit for the same patient has no response leaked into it', secondVisitResponse === null)

      /* ---- listRevisitQueue: status transitions + needs_attention flag ---- */
      const queueAfterSubmit = await store.listRevisitQueue()
      const completedRow = queueAfterSubmit.find((r) => r.visit_id === startedAgain.visit.id)
      assert('listRevisitQueue: a submitted revisit shows COMPLETED', completedRow.status === 'COMPLETED')
      assert('listRevisitQueue: needs_attention is true when a new symptom was reported (operational flag only)', completedRow.needs_attention === true)

      const waitingRow = queueAfterSubmit.find((r) => r.visit_id === startedThird.visit.id)
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
     Part 2.6 (round 6 review fixes): reissue failure-safety (both
     new-token-record and pointer-write failure points), idempotent
     acceptance across the token-consume boundary, and genuinely
     concurrent start-revisit calls.
     ===================================================================== */
  {
    const r6Root = await mkdtemp(path.join(tmpdir(), 'samindang-followup-review6-'))
    try {
      const followUpBaseDir = path.join(r6Root, 'follow-up-sessions')
      const sessions = createFollowUpSessionStore(followUpBaseDir, { ttlMinutes: 30 })
      const tokensDirPath = path.join(followUpBaseDir, 'tokens')
      const pointersDirPath = path.join(followUpBaseDir, 'by-visit')

      /* ---- reissue failure-safety (a): the NEW token-record write fails.
         The OLD token must never be touched (not read, not invalidated) --
         a failure this early must leave the previously-working patient
         link exactly as it was. The old file is moved aside for the
         duration of the block (issueToken's phase 1 doesn't read/write it
         at all, so this doesn't change what's being exercised) and moved
         back before the "still works" assertion. ---- */
      const { token: oldTokenA } = await sessions.issueToken({ visit_id: 'r6-visit-a', patient_id: 'r6-patient-a', targets: [] })
      const tokensBackupDirPath = path.join(r6Root, 'tokens-backup-a')
      await mkdir(tokensBackupDirPath, { recursive: true })
      for (const f of await readdir(tokensDirPath)) {
        await rename(path.join(tokensDirPath, f), path.join(tokensBackupDirPath, f))
      }
      await rm(tokensDirPath, { recursive: true, force: true })
      await writeFile(tokensDirPath, 'blocking file, not a directory', 'utf8')

      let reissueAThrew = false
      try {
        await sessions.issueToken({ visit_id: 'r6-visit-a', patient_id: 'r6-patient-a', targets: [] })
      } catch {
        reissueAThrew = true
      }
      assert('reissue failure-safety (a): a failed new-token-record write propagates instead of silently succeeding', reissueAThrew)

      await unlink(tokensDirPath)
      await mkdir(tokensDirPath, { recursive: true })
      for (const f of await readdir(tokensBackupDirPath)) {
        await rename(path.join(tokensBackupDirPath, f), path.join(tokensDirPath, f))
      }
      const stillWorksA = await sessions.consumeToken(oldTokenA)
      assert('reissue failure-safety (a): the OLD token is untouched and still consumes successfully after the failed reissue attempt', stillWorksA.ok === true)

      /* ---- reissue failure-safety (b): the new token record write
         SUCCEEDS, but the POINTER write that would switch the visit over
         to it then fails. The orphaned new token record must be cleaned
         up (no net growth in tokens/), and the OLD token/pointer must
         still be exactly as they were -- still ACTIVE, still usable. ---- */
      const { token: oldTokenB } = await sessions.issueToken({ visit_id: 'r6-visit-b', patient_id: 'r6-patient-b', targets: [] })
      const pointersBackupDirPath = path.join(r6Root, 'pointers-backup-b')
      await mkdir(pointersBackupDirPath, { recursive: true })
      for (const f of await readdir(pointersDirPath)) {
        await rename(path.join(pointersDirPath, f), path.join(pointersBackupDirPath, f))
      }
      await rm(pointersDirPath, { recursive: true, force: true })
      await writeFile(pointersDirPath, 'blocking file, not a directory', 'utf8')

      const tokenFileCountBefore = (await readdir(tokensDirPath)).length
      let reissueBThrew = false
      try {
        await sessions.issueToken({ visit_id: 'r6-visit-b', patient_id: 'r6-patient-b', targets: [] })
      } catch {
        reissueBThrew = true
      }
      assert('reissue failure-safety (b): a failed pointer write propagates instead of silently succeeding', reissueBThrew)
      const tokenFileCountAfter = (await readdir(tokensDirPath)).length
      assert(
        'reissue failure-safety (b): the orphaned new token record written before the pointer failure is cleaned up (no net change in tokens/ file count)',
        tokenFileCountAfter === tokenFileCountBefore,
      )

      await unlink(pointersDirPath)
      await mkdir(pointersDirPath, { recursive: true })
      for (const f of await readdir(pointersBackupDirPath)) {
        await rename(path.join(pointersBackupDirPath, f), path.join(pointersDirPath, f))
      }
      const stillWorksB = await sessions.consumeToken(oldTokenB)
      assert('reissue failure-safety (b): the OLD token is untouched and still consumes successfully after the failed pointer write', stillWorksB.ok === true)

      /* ---- idempotent acceptance across the consume boundary: a failure
         AFTER the durable response save succeeds but WHILE the final
         token-consume write fails must leave the token retriable, and the
         retry must never overwrite the already-accepted first answer.
         Blocks only the ONE specific token's own .tmp write target, not
         the whole tokens/ directory, so this needs no separate isolated
         root -- nothing else in this suite touches that exact file. ---- */
      const idemStore = createStore(path.join(r6Root, 'idem-submissions'), { followUpTokenTtlMinutes: 30 })
      const idemSub = await idemStore.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-r6-idem', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'r6 idem patient',
      })
      await idemStore.saveWorkspace(
        idemSub.id,
        emptyWorkspaceFor({ painFollowUpTargets: [{ id: 'idemTarget', label: 'Idem Target', baseline: '5', postTreatmentValue: '' }] }),
      )
      const idemRevisit = await idemStore.startRevisit(idemSub.patient_id)
      const idemTokenHash = hashToken(idemRevisit.token)
      const idemTokenTmpPath = path.join(r6Root, 'idem-submissions', '..', 'follow-up-sessions', 'tokens', `${idemTokenHash}.json.tmp`)
      await mkdir(idemTokenTmpPath, { recursive: true })

      let firstSubmitThrew = false
      try {
        await idemStore.submitFollowUpSession(idemRevisit.token, {
          targetRatings: [{ targetId: 'idemTarget', patientReportedValue: 'FIRST-ACCEPTED-VALUE' }],
          overallChange: '좋아짐',
          newSymptomReported: false,
          newSymptomNote: '',
          adverseEffectReported: false,
          adverseEffectNote: '',
        })
      } catch {
        firstSubmitThrew = true
      }
      assert('idempotent acceptance: a failure between response-save-success and token-consume-persistence propagates', firstSubmitThrew)

      const responseAfterFirstAttempt = await idemStore.getMicroFollowUpResponse(idemRevisit.visit.id)
      assert('idempotent acceptance: the response save itself succeeded despite the later token-consume failure', responseAfterFirstAttempt !== null)
      assert(
        "idempotent acceptance: the saved response carries the FIRST attempt's value",
        responseAfterFirstAttempt.targetRatings[0].patientReportedValue === 'FIRST-ACCEPTED-VALUE',
      )

      await rm(idemTokenTmpPath, { recursive: true, force: true })

      const idemRetryResult = await idemStore.submitFollowUpSession(idemRevisit.token, {
        targetRatings: [{ targetId: 'idemTarget', patientReportedValue: 'SECOND-CONFLICTING-VALUE' }],
        overallChange: '나빠짐',
        newSymptomReported: true,
        newSymptomNote: 'should never be saved',
        adverseEffectReported: false,
        adverseEffectNote: '',
      })
      assert('idempotent acceptance: retrying the SAME token succeeds once the transient failure is gone', idemRetryResult.ok === true)
      assert(
        "idempotent acceptance: retry does NOT overwrite the first accepted answer",
        idemRetryResult.response.targetRatings[0].patientReportedValue === 'FIRST-ACCEPTED-VALUE',
      )
      const responseAfterRetry = await idemStore.getMicroFollowUpResponse(idemRevisit.visit.id)
      assert(
        "idempotent acceptance: the durably saved response still carries the FIRST attempt's value after retry, never the second",
        responseAfterRetry.targetRatings[0].patientReportedValue === 'FIRST-ACCEPTED-VALUE',
      )
      assert(
        "idempotent acceptance: the conflicting second attempt's text never made it into storage",
        !JSON.stringify(responseAfterRetry).includes('SECOND-CONFLICTING-VALUE') && !JSON.stringify(responseAfterRetry).includes('should never be saved'),
      )

      /* ---- genuinely CONCURRENT start-revisit calls (not just sequential)
         for the same patient must still only create ONE visit. ---- */
      const concurrentSub = await idemStore.createSubmission({
        submission: { questionnaire_version: '1.0', session_id: 'sess-r6-concurrent', responses: {}, metadata: {} },
        myungri: null,
        patient_label: 'r6 concurrent patient',
      })
      const [concurrentA, concurrentB] = await Promise.all([
        idemStore.startRevisit(concurrentSub.patient_id),
        idemStore.startRevisit(concurrentSub.patient_id),
      ])
      assert('concurrent start-revisit: two simultaneous calls for the same patient resolve to the SAME visit (no duplicate)', concurrentA.visit.id === concurrentB.visit.id)
      assert('concurrent start-revisit: two simultaneous calls resolve to the SAME token', concurrentA.token === concurrentB.token)
      const revisitsForConcurrentPatient = (await idemStore.listVisits()).filter(
        (v) => v.patient_id === concurrentSub.patient_id && v.submission_id === null,
      )
      assert('concurrent start-revisit: exactly ONE revisit visit exists on disk, not two', revisitsForConcurrentPatient.length === 1)
    } finally {
      await rm(r6Root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2.7 (round 7 review fix): pointer authority. A reissue's phase-2
     pointer swap can succeed while its phase-3 best-effort invalidation of
     the OLD token then fails -- the old record's own `status` field is
     left stuck at ACTIVE even though the pointer has already moved on.
     resolveToken/consumeTokenWithAction must not trust that stale status:
     the pointer is the single source of truth for which token is really
     active for a visit.
     ===================================================================== */
  {
    const r7Root = await mkdtemp(path.join(tmpdir(), 'samindang-followup-review7-'))
    try {
      const followUpBaseDir = path.join(r7Root, 'follow-up-sessions')
      const sessions = createFollowUpSessionStore(followUpBaseDir, { ttlMinutes: 30 })
      const tokensDirPath = path.join(followUpBaseDir, 'tokens')

      const { token: tokenA } = await sessions.issueToken({ visit_id: 'r7-visit', patient_id: 'r7-patient', targets: [] })

      // Force phase 3's write (invalidating tokenA) to fail by blocking
      // its OWN .tmp write target specifically -- tokenB's own record
      // write and the pointer switch are both untouched by this, so both
      // must succeed normally.
      const tokenAHash = hashToken(tokenA)
      const tokenATmpPath = path.join(tokensDirPath, `${tokenAHash}.json.tmp`)
      await mkdir(tokenATmpPath, { recursive: true })

      const { token: tokenB } = await sessions.issueToken({ visit_id: 'r7-visit', patient_id: 'r7-patient', targets: [] })

      await rm(tokenATmpPath, { recursive: true, force: true })

      // The on-disk record for tokenA is still (incorrectly) ACTIVE --
      // this is the exact stale state phase 3's failure leaves behind.
      const rawRecordAAfterFailure = JSON.parse(await readFile(path.join(tokensDirPath, `${tokenAHash}.json`), 'utf8'))
      assert('pointer authority: setup check -- tokenA record is still stuck ACTIVE on disk after the injected phase-3 failure', rawRecordAAfterFailure.status === 'ACTIVE')

      const resolvedA = await sessions.resolveToken(tokenA)
      assert('pointer authority: resolveToken(oldToken) reports INVALIDATED, not the stale ACTIVE status, once the pointer has moved on', resolvedA.status === 'INVALIDATED')

      const resolvedB = await sessions.resolveToken(tokenB)
      assert('pointer authority: resolveToken(newToken) is unaffected and still reports ACTIVE', resolvedB.status === 'ACTIVE')

      const consumeA = await sessions.consumeToken(tokenA)
      assert('pointer authority: consumeToken(oldToken) fails closed with reason invalidated, never succeeds', consumeA.ok === false && consumeA.reason === 'invalidated')

      const rawRecordAAfterConsumeAttempt = JSON.parse(await readFile(path.join(tokensDirPath, `${tokenAHash}.json`), 'utf8'))
      assert('pointer authority: consumeTokenWithAction self-heals the stale on-disk status to INVALIDATED once it observes the mismatch', rawRecordAAfterConsumeAttempt.status === 'INVALIDATED')

      const consumeB = await sessions.consumeToken(tokenB)
      assert('pointer authority: consumeToken(newToken) still succeeds normally -- the fix does not affect the actually-active token', consumeB.ok === true)
      assert('pointer authority: consumeToken(newToken) consumed the correct visit', consumeB.record.visit_id === 'r7-visit')
    } finally {
      await rm(r7Root, { recursive: true, force: true })
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

  /* =====================================================================
     Part 2.8 (round 9 review fix): pointer-authority TOCTOU. Checking the
     pointer is not enough on its own -- the check and the act have to be
     mutually exclusive with issueToken's pointer swap, or an old-token
     request that read the OLD authoritative pointer can keep running and
     still complete an acceptance AFTER the swap has already moved on.
     These two tests pin both directions of that mutual exclusion, and are
     deterministic rather than timing-dependent: withLock installs its map
     entry synchronously when called, so a call issued first is guaranteed
     to hold the visit lock before a call issued after it can queue on it.
     ===================================================================== */
  {
    const r9Root = await mkdtemp(path.join(tmpdir(), 'samindang-followup-review9-'))
    try {
      const sessions = createFollowUpSessionStore(path.join(r9Root, 'follow-up-sessions'), { ttlMinutes: 30 })

      /* ---- direction 1: the swap wins the lock -> the superseded token
         must fail closed, and must NEVER run its durable action ---- */
      const { token: oldToken } = await sessions.issueToken({ visit_id: 'r9-visit', patient_id: 'r9-patient', targets: [] })

      let actionRan = false
      // issueToken is called FIRST, so it holds `visit:r9-visit` for its
      // whole two-phase swap; the consume below queues behind it.
      const reissue = sessions.issueToken({ visit_id: 'r9-visit', patient_id: 'r9-patient', targets: [] })
      const racedConsume = sessions.consumeTokenWithAction(oldToken, async () => {
        actionRan = true
        return 'should never happen'
      })
      const [{ token: newToken }, racedResult] = await Promise.all([reissue, racedConsume])

      assert('TOCTOU: a superseded token cannot complete an acceptance once the pointer swap wins', racedResult.ok === false)
      assert('TOCTOU: the superseded acceptance fails specifically as invalidated', racedResult.reason === 'invalidated')
      assert('TOCTOU: the superseded token never runs its durable action (no orphan response is saved)', actionRan === false)

      const newStillWorks = await sessions.resolveToken(newToken)
      assert('TOCTOU: the newly issued token is unaffected and still ACTIVE', newStillWorks.status === 'ACTIVE')

      /* ---- direction 2: an acceptance already in flight wins the lock ->
         a reissue must WAIT for it, and the answer the patient already
         submitted stands (the token is genuinely consumed, not lost) ---- */
      const { token: liveToken } = await sessions.issueToken({ visit_id: 'r9-visit-2', patient_id: 'r9-patient-2', targets: [] })

      let releaseAction
      const actionGate = new Promise((resolve) => {
        releaseAction = resolve
      })
      let actionStarted = false
      const slowConsume = sessions.consumeTokenWithAction(liveToken, async () => {
        actionStarted = true
        await actionGate
        return 'durably saved'
      })
      // Wait until the acceptance is genuinely inside its critical section.
      while (!actionStarted) await new Promise((r) => setImmediate(r))

      let reissueSettled = false
      const blockedReissue = sessions
        .issueToken({ visit_id: 'r9-visit-2', patient_id: 'r9-patient-2', targets: [] })
        .then((r) => {
          reissueSettled = true
          return r
        })
      // Give the reissue every chance to run if it were NOT blocked.
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
      assert('TOCTOU: a reissue cannot interleave with an acceptance that already holds the visit lock', reissueSettled === false)

      releaseAction()
      const acceptedResult = await slowConsume
      await blockedReissue

      assert('TOCTOU: the in-flight acceptance completes successfully', acceptedResult.ok === true)
      assert('TOCTOU: the accepted durable action result is preserved', acceptedResult.actionResult === 'durably saved')
      assert('TOCTOU: the accepted token really is CONSUMED (the commit was not lost to the reissue)', acceptedResult.record.status === 'CONSUMED')

      /* ---- and the same mutual exclusion applies to the read path ---- */
      const { token: readToken } = await sessions.issueToken({ visit_id: 'r9-visit-3', patient_id: 'r9-patient-3', targets: [] })
      const reissue3 = sessions.issueToken({ visit_id: 'r9-visit-3', patient_id: 'r9-patient-3', targets: [] })
      const racedResolve = sessions.resolveToken(readToken)
      await reissue3
      const resolvedOld = await racedResolve
      assert('TOCTOU: a read racing the swap reports the superseded token as INVALIDATED, never ACTIVE', resolvedOld.status === 'INVALIDATED')
    } finally {
      await rm(r9Root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2.9 (round 17, restart-safe / multi-process correctness batch):
     cleanup-vs-reissue pointer race. Before this round, the retention
     cleanup's pointer-sweep read a visit's by-visit/ pointer, saw its
     referenced token file already gone (aged off by the token-file loop
     just above it, or by a prior cleanup run), and unlinked the pointer --
     WITHOUT taking the same `visit:<id>` lock issueToken's own two-phase
     pointer swap uses. If a doctor reissued in that exact window, cleanup
     could destroy the pointer to the capability that was JUST handed to
     the patient, even though the reissue itself had already succeeded.
     Reproduce the dangling-pointer precondition directly (delete a
     token's file off disk, simulating "already aged off"), then run
     cleanup and a reissue CONCURRENTLY with NO artificial ordering -- the
     fix makes both take the same lock, so the invariant must hold
     regardless of which one's lock acquisition happens to land first. ---- */
  {
    const cleanupRoot = await mkdtemp(path.join(tmpdir(), 'samindang-followup-cleanup-race-'))
    try {
      const followUpDir = path.join(cleanupRoot, 'follow-up-sessions')
      const sessions = createFollowUpSessionStore(followUpDir, { ttlMinutes: 30 })
      const visitId = 'cleanup-race-visit'

      await sessions.issueToken({ visit_id: visitId, patient_id: 'cleanup-race-patient', targets: [] })

      const pointerFilePath = path.join(followUpDir, 'by-visit', `${visitId}.json`)
      const pointerBefore = JSON.parse(await readFile(pointerFilePath, 'utf8'))
      await unlink(path.join(followUpDir, 'tokens', `${pointerBefore.active_token_hash}.json`))

      // No forced ordering -- both orderings must be safe under the fix
      // (see this block's comment above for why).
      await Promise.all([
        sessions.cleanupOlderThan(24),
        sessions.issueToken({ visit_id: visitId, patient_id: 'cleanup-race-patient', targets: [] }),
      ])

      const pointerAfterRaw = await readFile(pointerFilePath, 'utf8').catch(() => null)
      assert('cleanup-vs-reissue race: the pointer file was not destroyed by the race', pointerAfterRaw !== null)
      const pointerAfter = JSON.parse(pointerAfterRaw)
      const referencedTokenExists = await readFile(path.join(followUpDir, 'tokens', `${pointerAfter.active_token_hash}.json`), 'utf8')
        .then(() => true)
        .catch(() => false)
      assert(
        'cleanup-vs-reissue race: the pointer always references a token file that actually exists (never left dangling)',
        referencedTokenExists,
      )

      const afterStatus = await sessions.getActiveForVisit(visitId)
      assert(
        'cleanup-vs-reissue race: the visit resolves to an ACTIVE session no matter which side (cleanup vs reissue) won the lock first',
        afterStatus?.status === 'ACTIVE',
      )
    } finally {
      await rm(cleanupRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2.10 (round 17): the same optional x-expected-updated-at CAS
     precondition contract, at the visit-owned workspace boundary
     (saveVisitWorkspace) -- server/store.js's saveJudgment/saveWorkspace
     already prove the submission-owned side in tests/server.spec.mjs (the
     real HTTP boundary, including the 409 route mapping); this proves the
     visit-owned side's store-level contract returns the SAME
     {ok:false, reason:'conflict', current} shape instead of silently
     overwriting a newer save, and that omitting the precondition stays
     unconditional last-write-wins (no behavior change for any existing
     caller).
     ===================================================================== */
  {
    const casRoot = await mkdtemp(path.join(tmpdir(), 'samindang-followup-workspace-cas-'))
    try {
      const casStore = createStore(path.join(casRoot, 'submissions'))
      const visit = await casStore.createVisit({ patient_id: 'cas-visit-patient', submission_id: null })

      const v1 = await casStore.saveVisitWorkspace(visit.id, { note: 'v1' })
      assert('saveVisitWorkspace with no precondition -> ok:true (unconditional, backward-compatible default)', v1.ok === true)

      const v2 = await casStore.saveVisitWorkspace(visit.id, { note: 'v2' }, { expectedUpdatedAt: v1.record.updated_at })
      assert('saveVisitWorkspace with a MATCHING precondition -> ok:true', v2.ok === true)
      assert('the matching-precondition save actually took effect', v2.record.workspace.note === 'v2')

      const v3 = await casStore.saveVisitWorkspace(visit.id, { note: 'v3-should-be-refused' }, { expectedUpdatedAt: v1.record.updated_at })
      assert('saveVisitWorkspace with a STALE precondition -> ok:false, reason:conflict (lost-update refused)', v3.ok === false && v3.reason === 'conflict')
      assert('the stale-precondition refusal hands back the CURRENT (v2) record, proving v3 never landed', v3.current?.workspace?.note === 'v2')
    } finally {
      await rm(casRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
