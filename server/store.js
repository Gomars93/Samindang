// 저장 계층. 제출 1건 = 파일 1개(JSON). 목록은 디렉터리를 읽어서 만든다(별도 인덱스 없음).
// ponytail: 디렉터리 스캔으로 목록을 만드므로 O(n) — 파일럿 규모(하루 수십 건)에서는 충분하다.
// 제출 건수가 많아지면(수천+) 인덱스 파일이나 SQLite로 옮긴다.
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createVisitStore } from './visitStore.js'
import { createRecorderResultStore } from './recorderResultStore.js'
import { createMicroFollowUpStore } from './microFollowUpStore.js'
import { createFollowUpSessionStore } from './followUpSessionStore.js'
import { createStationStore } from './stationStore.js'

const VALID_STATUSES = new Set(['new', 'viewed', 'in_consultation', 'completed'])
// createSubmission의 session_id 중복 검사+생성을 이 키 하나로 직렬화한다.
const SESSION_INDEX_LOCK_KEY = '__session_index__'

// Round 17 (restart-safe / multi-process correctness): thrown by
// saveJudgment/saveWorkspace when a CALLER-SUPPLIED expected_updated_at
// precondition (optional -- see each function's doc comment) does not
// match the record's actual current updated_at. Carries the fresh record
// so the route can hand it straight back without a second read -- the
// directive's "server-authoritative state wins after conflicts" applies
// literally here: the conflict response IS the authoritative state.
export class StaleWriteError extends Error {
  constructor(current) {
    super('stale_write')
    this.name = 'StaleWriteError'
    this.current = current
  }
}

function recordPath(dataDir, id) {
  return path.join(dataDir, `${id}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

// Round 17: guarantees `updated_at` is strictly monotonically increasing
// across successive writes to the SAME record, even when two writes land
// in the same millisecond -- ISO-8601 via toISOString() only has
// millisecond resolution, and under fast sequential execution (confirmed
// empirically: this repo's own full test:all run, not just a contrived
// stress test) two real, distinct writes to one record CAN complete
// within the same millisecond. saveJudgment/saveWorkspace/
// saveVisitWorkspace's optional expectedUpdatedAt CAS precondition
// depends on updated_at reliably changing on every write; without this,
// two same-millisecond writes would produce identical updated_at values
// and silently defeat the very conflict check the precondition exists
// for. Every function that sets updated_at on a record CAS-guarded
// elsewhere must use this, not a bare `new Date().toISOString()` --
// setStatus included, even though it offers no CAS option itself, because
// its write still has to keep the SAME record's updated_at monotonic for
// saveJudgment/saveWorkspace's checks to stay meaningful.
function nextUpdatedAt(previous) {
  const now = new Date()
  if (previous && now.toISOString() <= previous) {
    return new Date(new Date(previous).getTime() + 1).toISOString()
  }
  return now.toISOString()
}

// ponytail: 단일 서버 프로세스 안에서만 유효한 in-process async mutex(키별
// promise 체인). 이 프로세스가 데이터 디렉터리를 혼자 소유한다는 전제라서
// 이걸로 충분하다 — 같은 데이터 디렉터리를 향해 서버 프로세스 2개를 띄우는
// 구성은 지원하지 않는다(파일 레벨 잠금이 없다). 규모가 커지면 파일 락이나
// 실제 DB 트랜잭션으로 옮긴다.
//
// Round 17: 이 전제는 이제 문서화만이 아니라 실제로 강제된다 --
// server/ownerLock.js가 CLI 부팅 경로(server/index.js의 isMain())에서
// 데이터 디렉터리별 lock/lease를 획득해, 같은 디렉터리를 향한 두 번째
// 서버 프로세스가 이 in-process 락(그리고 이 파일의 모든 다른 락 맵,
// visitStore.js/followUpSessionStore.js/stationStore.js/crmStore.js/
// microFollowUpStore.js/patientIdentityStore.js/recorderResultStore.js
// 전부 동일 전제)을 조용히 우회하지 못하도록 부팅 시점에 거부한다.
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

export function createStore(
  dataDir,
  {
    followUpTokenTtlMinutes = 30,
    followUpTokenRetentionHours = 24,
    // Configurable purely so tests can use a tiny window instead of
    // sleeping for real seconds to prove "the window expired, this is now
    // a genuinely new start" -- production always uses the 5s default.
    startRevisitDedupWindowMs = 5000,
  } = {},
) {
  // visits/는 submissions/의 형제 경로다(audit.log와 같은 패턴) — 별도
  // 데이터 디렉터리 설정이 필요 없다.
  const visits = createVisitStore(path.join(dataDir, '..', 'visits'))
  // recorder-results/는 submissions/의 또다른 형제 경로다(visits/와 같은 패턴).
  const recorderResults = createRecorderResultStore(path.join(dataDir, '..', 'recorder-results'))
  // micro-follow-up/도 같은 형제 경로 패턴(round 3 Phase D).
  const microFollowUp = createMicroFollowUpStore(path.join(dataDir, '..', 'micro-follow-up'))
  // follow-up-sessions/도 같은 형제 경로 패턴(round 3: secure revisit
  // linkage 한번쓰기 토큰).
  const followUpSessions = createFollowUpSessionStore(path.join(dataDir, '..', 'follow-up-sessions'), {
    ttlMinutes: followUpTokenTtlMinutes,
  })
  // stations/도 같은 형제 경로 패턴(round 8: 클리닉 태블릿 스테이션).
  const stations = createStationStore(path.join(dataDir, '..', 'stations'))

  async function ensureDir() {
    await mkdir(dataDir, { recursive: true })
  }

  async function listFiles() {
    await ensureDir()
    return (await readdir(dataDir)).filter((f) => f.endsWith('.json'))
  }

  async function readRecord(id) {
    try {
      const raw = await readFile(recordPath(dataDir, id), 'utf8')
      return JSON.parse(raw)
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  async function findBySessionId(sessionId) {
    if (!sessionId) return null
    for (const f of await listFiles()) {
      try {
        const r = JSON.parse(await readFile(path.join(dataDir, f), 'utf8'))
        if (r.submission?.session_id === sessionId) return r
      } catch {
        // 손상되거나 쓰는 중인 파일은 건너뛴다
      }
    }
    return null
  }

  // session_id 기준 멱등 생성: 동시에 여러 번 와도(같은 세션의 사고성 재전송,
  // 겹치는 태블릿 요청 등) 정확히 1건만 만들어지도록 전역 락으로 "중복 검사 +
  // 생성"을 하나의 원자적 구간으로 묶는다.
  async function createSubmission({ submission, myungri, patient_label }) {
    return withLock(SESSION_INDEX_LOCK_KEY, async () => {
      await ensureDir()
      const existing = await findBySessionId(submission.session_id)
      if (existing) {
        console.log(`duplicate submission detected for session_id, reusing id=${existing.id}`)
        return { ...existing, duplicate: true }
      }

      const id = randomUUID()
      const now = new Date().toISOString()
      // 새 제출 = 항상 새 환자 + 새 방문. patient_id를 이름/전화번호로
      // 자동 매칭하지 않는다(동명이인이 같은 patient_id로 잘못 묶이는
      // 사고를 방지하는 절대 원칙) — 같은 환자의 재진은 원장이 명시적으로
      // POST /api/visits에 기존 patient_id를 지정해야만 만들어진다.
      //
      // Round 17 (documented, not fixed -- Fable scoping report class B7i):
      // a process crash between this createVisit succeeding and the
      // submission's own atomicWrite below leaves an orphan visit with no
      // submission ever referencing it. Benign: findBySessionId/
      // listSubmissions only ever read submissions/, never scan visits/
      // for this, so nothing trusts the orphan; scripts/purge-data.mjs's
      // rm -rf on visits/ removes it along with everything else at pilot
      // exit; a retried createSubmission call (same session_id) creates a
      // clean new visit+submission pair rather than reusing or noticing
      // the orphan. Not worth a two-phase commit for a benign,
      // self-cleaning artifact.
      const visit = await visits.createVisit({ submission_id: id })
      const record = {
        // 저장된 레코드 "포장"(wrapper) 자체의 shape 버전. submission/myungri/judgment
        // 내부의 각 버전 필드와는 별개다 — 그 필드들은 각자의 스펙/엔진/스키마를 가리킨다.
        record_schema_version: '1.0.0',
        id,
        created_at: now,
        updated_at: now,
        status: 'new',
        patient_label,
        patient_id: visit.patient_id,
        visit_id: visit.id,
        submission,
        myungri,
        judgment: null,
        // Doctor Clinical Workspace clinician-entered state (round 2 Phase 2).
        // Sibling field to judgment, saved through its own route
        // (saveWorkspace) — never mixed into judgment's read-modify-write.
        workspace: null,
      }
      await atomicWrite(recordPath(dataDir, id), record)
      return record
    })
  }

  async function listSubmissions(limit) {
    const files = await listFiles()
    const records = []
    for (const f of files) {
      try {
        const raw = await readFile(path.join(dataDir, f), 'utf8')
        const r = JSON.parse(raw)
        // recorder_ready: visit.recording_id는 recorder-results POST가 성공할
        // 때마다 갱신되는 실제 포인터다(visitStore.setRecorderPointer) — 즉
        // "적어도 하나의 녹취 결과가 도착했다"는 근거 있는 사실이지, 추정이
        // 아니다. "전사중"/"전달오류" 같은 A PC 파이프라인 중간 상태는 B가
        // 알 방법이 없으므로(근거 없는 추정 금지) 이 필드를 만들지 않는다.
        const visit = r.visit_id ? await visits.getVisit(r.visit_id) : null
        records.push({
          id: r.id,
          created_at: r.created_at,
          updated_at: r.updated_at,
          status: r.status,
          patient_label: r.patient_label,
          primary_concern: r.submission?.metadata?.primary_concern ?? null,
          requires_staff_check: r.submission?.flags?.requires_staff_check ?? false,
          recorder_ready: Boolean(visit?.recording_id),
        })
      } catch {
        // 손상되거나 쓰는 중(.tmp 아님)인 파일은 목록에서 건너뛴다
      }
    }
    records.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return typeof limit === 'number' ? records.slice(0, limit) : records
  }

  async function getSubmission(id) {
    return readRecord(id)
  }

  // setStatus/saveJudgment는 읽기->수정->쓰기라서, 같은 id에 대해 태블릿/원장
  // 요청이 겹치면 마지막에 읽은 쪽이 먼저 쓴 쪽을 덮어쓸 수 있다(lost update).
  // id별 락으로 직렬화해 최소한 "완전히 반영되거나 안 되거나"만 일어나게 한다
  // (last-write-wins은 허용, 손상된 레코드는 허용 안 함).
  async function setStatus(id, status) {
    if (!VALID_STATUSES.has(status)) {
      throw Object.assign(new Error('invalid status'), { statusCode: 400 })
    }
    return withLock(id, async () => {
      const record = await readRecord(id)
      if (!record) return null
      const before = { submission: record.submission, myungri: record.myungri }
      record.status = status
      record.updated_at = nextUpdatedAt(record.updated_at)
      // assert: status transition must never touch submission/myungri
      if (record.submission !== before.submission || record.myungri !== before.myungri) {
        throw new Error('invariant violated: setStatus mutated submission/myungri')
      }
      await atomicWrite(recordPath(dataDir, id), record)
      return record
    })
  }

  // Round 17: `expectedUpdatedAt` is an OPTIONAL compare-and-swap
  // precondition -- absent (undefined/null), this is exactly the original
  // unconditional last-write-wins save. When supplied, it must match the
  // record's `updated_at` AS READ under this same lock; a mismatch means
  // someone else's write landed since the caller last read this record
  // (e.g. a second Doctor Workspace tab, or a stale GET that outlived a
  // colleague's save), and this save is refused with StaleWriteError
  // instead of silently overwriting their write -- the lost-accepted-write
  // hole the directive calls out. This is opt-in, not the new default:
  // setStatus (a 4-value enum toggle, idempotent, always doctor-visible)
  // deliberately keeps plain last-write-wins with no precondition option
  // at all -- see its own doc comment above, still accurate.
  async function saveJudgment(id, judgment, { expectedUpdatedAt } = {}) {
    return withLock(id, async () => {
      const record = await readRecord(id)
      if (!record) return null
      if (expectedUpdatedAt != null && record.updated_at !== expectedUpdatedAt) {
        throw new StaleWriteError(record)
      }
      const before = { submission: record.submission, myungri: record.myungri }
      record.judgment = judgment
      record.updated_at = nextUpdatedAt(record.updated_at)
      if (record.submission !== before.submission || record.myungri !== before.myungri) {
        throw new Error('invariant violated: saveJudgment mutated submission/myungri')
      }
      await atomicWrite(recordPath(dataDir, id), record)
      return record
    })
  }

  // Doctor Clinical Workspace clinician-entered state (round 2 Phase 2).
  // Same read-modify-write-under-lock shape as saveJudgment, on the same
  // per-id lock queue (so a judgment save and a workspace save for the
  // same submission still serialize against each other, never interleave
  // into a torn read). Never touches submission/myungri/judgment. See
  // saveJudgment's doc comment immediately above for the optional
  // `expectedUpdatedAt` CAS precondition -- identical contract here.
  async function saveWorkspace(id, workspace, { expectedUpdatedAt } = {}) {
    return withLock(id, async () => {
      const record = await readRecord(id)
      if (!record) return null
      if (expectedUpdatedAt != null && record.updated_at !== expectedUpdatedAt) {
        throw new StaleWriteError(record)
      }
      const before = { submission: record.submission, myungri: record.myungri, judgment: record.judgment }
      record.workspace = workspace
      record.updated_at = nextUpdatedAt(record.updated_at)
      if (
        record.submission !== before.submission ||
        record.myungri !== before.myungri ||
        record.judgment !== before.judgment
      ) {
        throw new Error('invariant violated: saveWorkspace mutated submission/myungri/judgment')
      }
      await atomicWrite(recordPath(dataDir, id), record)
      return record
    })
  }

  // Round 3 Phase C(longitudinal linkage): 이 patient_id의 이전 방문들을
  // RAW 값만 추려서 돌려준다 — 자동 호전/악화 판단이나 %계산은 절대 하지
  // 않는다(그 해석 단계는 여전히 미구현, finalAssessment.ts 참고). 이름/
  // 전화/생년월일 매칭은 여기 없다 — visits.listVisitsForPatient가 이미
  // patient_id 정확히 일치만 반환한다. excludeVisitId는 지금 보고 있는
  // 방문 자신을 "이전 방문" 목록에서 빼기 위한 것뿐, 신원 판단과 무관하다.
  //
  // Round 4 review fix (longitudinal continuity): a no-submission revisit
  // visit now DOES contribute a summary here -- previously this function
  // skipped every `!submission_id` visit entirely, which meant a SECOND
  // revisit always derived its Micro Follow-up candidates from the
  // ORIGINAL questionnaire submission's Follow-up Targets, never from the
  // clinician's newly-chosen targets on the first revisit (see
  // deriveMicroFollowUpCandidates below, and the required regression test
  // in tests/follow-up-session.spec.mjs). `follow_up_targets` is a NEW
  // profile-agnostic field present on every visit summary (submission
  // visits: pain+herbal concatenated in their existing order; revisit
  // visits: their own generic list) -- callers that want "whatever this
  // patient's most recently tracked, regardless of visit type" should read
  // this field instead of concatenating pain_follow_up_targets/
  // herbal_follow_up_targets themselves. Those two fields are left
  // unchanged for submission visits (PriorVisitHistoryCard's Pain-vs-Herbal
  // profile display still needs the split) and empty for revisit visits,
  // which have no such split by design (visitWorkspace.ts's own doc
  // comment: "a data-shape choice, not a new clinical distinction").
  async function getPatientHistory(patientId, excludeVisitId) {
    if (!patientId) return { patient_id: patientId ?? null, visits: [] }
    const visitRecords = (await visits.listVisitsForPatient(patientId)).filter((v) => v.id !== excludeVisitId)

    const summaries = []
    for (const v of visitRecords) {
      if (v.submission_id) {
        const record = await readRecord(v.submission_id)
        if (!record) continue
        const workspace = record.workspace ?? null
        const painTargets = workspace?.painFollowUpTargets ?? []
        const herbalTargets = workspace?.herbalFollowUpTargets ?? []
        summaries.push({
          visit_id: v.id,
          submission_id: v.submission_id,
          created_at: v.created_at,
          primary_concern: record.submission?.metadata?.primary_concern ?? null,
          pain_follow_up_targets: painTargets,
          herbal_follow_up_targets: herbalTargets,
          follow_up_targets: [...painTargets, ...herbalTargets],
          pain_final_assessment_summary: workspace?.painFinalAssessment?.finalWorkingAssessment || null,
          herbal_final_assessment_summary: workspace?.herbalFinalAssessment?.finalPatternOrMechanism || null,
          next_reassessment_plan: workspace?.nextReassessmentPlan ?? null,
        })
      } else {
        // No-submission revisit: read the visit-owned VisitWorkspaceState
        // instead. A revisit with no workspace saved yet (never opened, or
        // opened but nothing recorded) contributes nothing -- there is
        // genuinely nothing to summarize, not an error.
        const workspace = v.workspace ?? null
        if (!workspace) continue
        summaries.push({
          visit_id: v.id,
          submission_id: null,
          created_at: v.created_at,
          primary_concern: null,
          pain_follow_up_targets: [],
          herbal_follow_up_targets: [],
          follow_up_targets: Array.isArray(workspace.followUpTargets) ? workspace.followUpTargets : [],
          // Reuses the pain_final_assessment_summary field for the
          // revisit's own generic assessment text -- consistent with the
          // existing display pattern (PriorVisitHistoryCard/RevisitWorkspace
          // already union pain+herbal summaries under one generic "이전
          // 최종 판단" label; neither ever says "Pain" to the clinician).
          pain_final_assessment_summary: workspace.finalAssessment?.finalWorkingAssessment || null,
          herbal_final_assessment_summary: null,
          next_reassessment_plan: workspace.nextReassessmentPlan ?? null,
        })
      }
    }
    return { patient_id: patientId, visits: summaries }
  }

  // Round 3(revisit linkage): candidate Follow-up Targets for a Micro
  // Follow-up, derived ONLY from the clinician's own prior Follow-up
  // Targets on the patient's chronologically LATEST visit of any kind
  // (submission-backed or a no-submission revisit) -- no ranking/scoring
  // algorithm, no invented items. Capped at 3 total by
  // followUpSessions.issueToken itself. Returns [] (never an error) when
  // there is nothing prior to carry forward -- the caller/UI must say so
  // plainly, not invent items.
  async function deriveMicroFollowUpCandidates(patientId, excludeVisitId) {
    const history = await getPatientHistory(patientId, excludeVisitId)
    const latest = history.visits[0]
    if (!latest) return []
    return latest.follow_up_targets.map((t) => ({
      id: t.id,
      label: t.label,
    }))
  }

  // Round 3(revisit linkage): the single doctor/staff action "재진 간단
  // 문진 시작" -- creates the NEW visit for an EXISTING patient_id (the
  // caller in server/index.js already verified visitExistsForPatient,
  // exactly like the existing POST /api/visits route), derives candidate
  // targets from that patient's own prior visit, and issues one one-time
  // token scoped to the new visit_id.
  //
  // Round 4 review fix (atomicity): the visit and its token are not written
  // by a single filesystem transaction (two separate JSON files), so if
  // candidate derivation or token issuance throws AFTER the visit file is
  // already written, roll the visit back before re-throwing -- otherwise a
  // caller could be left with an orphan no-submission revisit visit that
  // has no way to ever get a token (the doctor UI would show "재진 ·
  // 시작 전" forever for a visit nobody actually meant to create yet). This
  // is still sound after the round 6 fix below: issueToken() itself is now
  // all-or-nothing (see followUpSessionStore.js), so any thrown error here
  // leaves no token/pointer artifact for the rollback to worry about.
  //
  // Round 6 review fix (duplicate-start prevention): a double-click or a
  // browser/network retry of this exact doctor action must never mint two
  // revisit visits (each with its own separate one-time token) for one
  // intended click -- the doctor would see two "재진 · 환자 입력 대기"
  // entries and only one link would ever reach the patient. Serialize per
  // patient_id (calls for two different patients never block each other)
  // and, within a short in-memory dedup window, replay the SAME result
  // (same visit, same already-issued token) for a repeat call instead of
  // creating a second visit. The plaintext token cannot be regenerated
  // later (by design -- see followUpSessionStore.js), so this cache is the
  // only way a legitimately-retried request can still receive it.
  //
  // This dedup is deliberately narrower than "any repeat call within the
  // window": it only replays a cached revisit that is STILL PENDING (no
  // MicroFollowUpResponse saved for it yet). A clinician who starts a
  // revisit, has the patient answer it, and then deliberately starts a
  // SECOND, separate revisit for the same patient shortly afterward (the
  // required longitudinal-continuity regression scenario does exactly
  // this) must get a genuinely new visit -- that revisit is no longer
  // "pending," so it is not a duplicate of anything.
  const recentStartRevisitResults = new Map() // patient_id -> { result, expiresAt }

  async function startRevisit(patientId, deliveryMode) {
    return withLock(`start-revisit:${patientId}`, async () => {
      const cached = recentStartRevisitResults.get(patientId)
      if (cached) {
        const stillFresh = cached.expiresAt > Date.now()
        const alreadyAnswered = stillFresh && Boolean(await microFollowUp.getResponse(cached.result.visit.id))
        // Round 8: a repeat call asking for a DIFFERENT delivery mode is a
        // genuinely different operational intent (e.g. the tablet station
        // is busy, so staff switches to a personal QR), not the
        // double-click this dedup exists to absorb -- let it through.
        const sameDeliveryMode = (cached.result.session.delivery_mode ?? null) === (deliveryMode ?? null)
        // Round 9: `reused` tells a composing caller (assignRevisitToStation)
        // whether THIS call created the revisit or merely replayed one an
        // earlier action already created -- a replayed revisit may already
        // be assigned to a station or have had its QR shown, so it must
        // never be rolled back by a later failure. The flag is added to a
        // shallow copy so the cached result itself stays canonical.
        //
        // Round 17: `created` is a SEPARATE flag from `reused` -- see the
        // durable-reuse branch below for why one boolean can no longer
        // capture both "should a caller skip auditing visit_created" and
        // "should a caller skip auditing follow_up_session_issued". This
        // fast in-memory-cache-hit path is the one case where BOTH are
        // true: nothing new happened at all, not even a reissued token.
        if (stillFresh && !alreadyAnswered && sameDeliveryMode) return { ...cached.result, reused: true, created: false }
        recentStartRevisitResults.delete(patientId)
      }

      // Round 17 (restart-safe / multi-process correctness): the in-memory
      // cache above is only a short (default 5s) plaintext-token-replay
      // window -- it cannot survive a process restart, and it is invisible
      // to a retry that lands on a second process after an owner-lock
      // takeover (server/ownerLock.js). Without a durable check here,
      // either of those turns a legitimately-retried "재진 시작" click into
      // a SECOND revisit visit with its own SECOND live follow-up token --
      // two "재진 · 환자 입력 대기" rows in the doctor queue, and possibly
      // two live capabilities, for one intended click. Re-read durable
      // state before creating anything new: if this patient already has an
      // unanswered ("pending") revisit whose session was never explicitly
      // invalidated -- whether it still holds a live token, an expired
      // one, or (crash window: the process died between visits.createVisit
      // and followUpSessions.issueToken below, before this function's own
      // try/catch rollback could even run) no token at all yet --
      // reissue onto THAT visit instead of minting a new one.
      // reissueFollowUpSession already tolerates a missing existing
      // session (it is the same function the doctor-facing manual reissue
      // route uses), so this one call correctly recovers all three durable
      // states. See findPendingRevisitForPatient for why an explicitly
      // INVALIDATED session (e.g. from resetStation) is deliberately
      // excluded -- that flow's "next assignment mints a fresh visit"
      // behavior is untouched by this change.
      //
      // `created: false` here is correct (no NEW visit was made) but
      // `reused: true` would NOT be -- a genuinely NEW follow-up-session
      // token IS being minted for the first time onto this visit (e.g. the
      // crash-before-issueToken recovery case has no prior session at
      // all), which callers must still audit as follow_up_session_issued.
      // Conflating this with the fast-path cache-hit's "nothing new
      // happened at all" meaning would silently drop that audit line --
      // caught by tests/audit-registry.spec.mjs's revisit-start dedup
      // test, which is exactly why `created` and `reused` are now two
      // independent flags instead of one.
      const existingPending = await findPendingRevisitForPatient(patientId)
      if (existingPending) {
        const existingSession = await followUpSessions.getActiveForVisit(existingPending.id)
        const durableSameDeliveryMode = !existingSession || (existingSession.delivery_mode ?? null) === (deliveryMode ?? null)
        if (durableSameDeliveryMode) {
          const reissued = await reissueFollowUpSession(existingPending.id, deliveryMode ?? existingSession?.delivery_mode ?? null)
          if (reissued) {
            recentStartRevisitResults.set(patientId, { result: reissued, expiresAt: Date.now() + startRevisitDedupWindowMs })
            return { ...reissued, reused: false, created: false }
          }
        }
      }

      const visit = await visits.createVisit({ patient_id: patientId, submission_id: null })
      let result
      try {
        const targets = await deriveMicroFollowUpCandidates(patientId, visit.id)
        const { token, record } = await followUpSessions.issueToken({
          visit_id: visit.id,
          patient_id: patientId,
          targets,
          delivery_mode: deliveryMode,
        })
        result = { visit, token, session: record }
      } catch (err) {
        await visits.deleteVisitForRollbackOnly(visit.id).catch(() => {})
        throw err
      }
      recentStartRevisitResults.set(patientId, { result, expiresAt: Date.now() + startRevisitDedupWindowMs })
      return { ...result, reused: false, created: true }
    })
  }

  // Round 9 review fix: undo a revisit THIS call just created, when a
  // composing operation fails after startRevisit already succeeded (see
  // assignRevisitToStation). Deliberately callable only for a
  // newly-created revisit -- never for a dedup-replayed pre-existing one.
  // Order matters: invalidate the capability first so the link is dead
  // even if the visit delete then fails, then drop the visit, then evict
  // the dedup cache entry (under the same per-patient lock startRevisit
  // uses, so a concurrent start cannot pick up a cache entry pointing at a
  // visit that is being deleted).
  async function rollbackNewRevisit(started) {
    await followUpSessions.invalidateActiveForVisit(started.visit.id).catch(() => {})
    await visits.deleteVisitForRollbackOnly(started.visit.id).catch(() => {})
    await forgetStartRevisitCache(started.visit.patient_id, started.visit.id)
  }

  // Drops the dedup cache entry for a patient IF it still names the given
  // visit. Taken under the same per-patient lock startRevisit uses, so a
  // concurrent start can never pick up a cache entry for a session that is
  // being torn down or revoked, and a cache entry belonging to some LATER
  // revisit is never evicted by accident.
  async function forgetStartRevisitCache(patientId, visitId) {
    await withLock(`start-revisit:${patientId}`, async () => {
      const cached = recentStartRevisitResults.get(patientId)
      if (cached?.result?.visit?.id === visitId) recentStartRevisitResults.delete(patientId)
    }).catch(() => {})
  }

  // Round 17: durable (not in-memory-cache) lookup of "does this patient
  // already have a revisit that is still pending?", used by startRevisit's
  // restart/multi-process-safe fallback above. A visit qualifies if it is a
  // revisit (no submission_id), nobody has answered it yet (no saved
  // MicroFollowUpResponse), AND its session -- if one was ever issued --
  // was not explicitly INVALIDATED. That last condition is deliberate:
  // resetStation's own doc comment says a reset's whole point is that "the
  // next assignment... mints a FRESH capability" -- an ACTIVE or merely
  // time-expired session is exactly the restart/crash/retry case this
  // function exists to recover (reuse, don't duplicate), but an
  // explicitly-INVALIDATED one is a deliberate staff action to close out
  // that attempt, and must keep creating a genuinely new visit exactly as
  // it always has (see tests/station.spec.mjs's reset-then-reassign
  // coverage). O(n) scan of this one patient's visits, same pilot-scale
  // tradeoff as every other list function in this file.
  async function findPendingRevisitForPatient(patientId) {
    const patientVisits = await visits.listVisitsForPatient(patientId)
    const candidates = []
    for (const v of patientVisits) {
      if (v.submission_id) continue
      const response = await microFollowUp.getResponse(v.id)
      if (response) continue
      const session = await followUpSessions.getActiveForVisit(v.id)
      if (session?.status === 'INVALIDATED') continue
      candidates.push(v)
    }
    candidates.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return candidates[0] ?? null
  }

  // Reissue: same visit, freshly re-derived candidates (in case the
  // clinician's prior-visit data changed since the original issuance),
  // brand-new token -- issueToken() itself invalidates the previous active
  // token for this visit_id.
  async function reissueFollowUpSession(visitId, deliveryMode) {
    const visit = await visits.getVisit(visitId)
    if (!visit) return null
    const targets = await deriveMicroFollowUpCandidates(visit.patient_id, visitId)
    // Round 8: carry the existing session's delivery_mode forward unless
    // the caller explicitly asks for a different one -- a plain "재발급"
    // should not silently change how the link is meant to be delivered.
    const existing = await followUpSessions.getActiveForVisit(visitId)
    const { token, record } = await followUpSessions.issueToken({
      visit_id: visitId,
      patient_id: visit.patient_id,
      targets,
      delivery_mode: deliveryMode ?? existing?.delivery_mode ?? null,
    })
    return { visit, token, session: record }
  }

  // Round 3(revisit linkage): the ONLY place that turns a raw patient token
  // into a saved MicroFollowUpResponse. Enforces every public-endpoint
  // safety rule in one spot: the token must resolve and successfully
  // consume (fails closed on invalid/expired/consumed/invalidated), and any
  // target the patient answered must have an id present in the token's own
  // server-side snapshot -- a submitted target id NOT in that snapshot is
  // silently dropped (never trusted), and every label is re-resolved from
  // the snapshot, never taken from the request body.
  //
  // Round 4 review fix (durability ordering): validate -> sanitize -> save
  // -> THEN consume, all inside consumeTokenWithAction's single per-token
  // lock. If the durable microFollowUp.saveResponse write throws (disk
  // failure, etc.), the token is never marked CONSUMED -- it stays ACTIVE
  // so the patient can retry the exact same link instead of the token being
  // burned with the answer lost. The thrown error propagates to the caller
  // (server/index.js's route handler), which is expected to surface a
  // retriable error rather than a success.
  //
  // Round 6 review fix (idempotent acceptance): the durability-ordering fix
  // above still left one window open -- if saveResponse succeeds but the
  // FINAL write that marks the token CONSUMED then fails, the token stays
  // ACTIVE and a legitimate retry re-enters this same actionFn. Without
  // more, that retry would call microFollowUp.saveResponse a second time
  // and (with the old overwrite behavior) silently replace the first
  // accepted answer. microFollowUp.saveResponse is now write-once (see its
  // own doc comment in microFollowUpStore.js): a retry's saveResponse call
  // returns the already-saved record unchanged instead of overwriting it,
  // so the token consume boundary and the response boundary are each
  // independently safe to retry, in either order.
  async function submitFollowUpSession(rawToken, answers) {
    const result = await followUpSessions.consumeTokenWithAction(rawToken, async (record) => {
      const allowedIds = new Set(record.targets.map((t) => t.id))
      const labelById = new Map(record.targets.map((t) => [t.id, t.label]))
      const targetRatings = (Array.isArray(answers?.targetRatings) ? answers.targetRatings : [])
        .filter((t) => t && typeof t.targetId === 'string' && allowedIds.has(t.targetId))
        .map((t) => ({
          targetId: t.targetId,
          label: labelById.get(t.targetId),
          patientReportedValue: typeof t.patientReportedValue === 'string' ? t.patientReportedValue.slice(0, 500) : '',
        }))
      return microFollowUp.saveResponse({
        visit_id: record.visit_id,
        patient_id: record.patient_id,
        targetRatings,
        overallChange: typeof answers?.overallChange === 'string' ? answers.overallChange.slice(0, 500) : '',
        newSymptomReported: Boolean(answers?.newSymptomReported),
        newSymptomNote: typeof answers?.newSymptomNote === 'string' ? answers.newSymptomNote.slice(0, 1000) : '',
        adverseEffectReported: Boolean(answers?.adverseEffectReported),
        adverseEffectNote: typeof answers?.adverseEffectNote === 'string' ? answers.adverseEffectNote.slice(0, 1000) : '',
        // Round 8: this path is ALWAYS the patient answering on a device
        // themselves (their own phone via QR, or a clinic tablet station
        // handed to them) -- never staff transcribing. Hardcoded, never
        // taken from the request body: a public caller must not be able to
        // claim staff attribution for its own answers.
        inputProvenance: 'PATIENT_SELF',
      })
    })
    if (!result.ok) return result
    return { ok: true, visit_id: result.record.visit_id, response: result.actionResult }
  }

  // Round 8: the single reception/staff action behind "이 환자를 접수
  // 태블릿 1에 배정". Composes the EXISTING startRevisit (with all its
  // atomicity, rollback, dedup and candidate-derivation behavior intact)
  // with the station assignment, then invalidates whatever session that
  // station was previously holding.
  //
  // Round 9 review fix (partial-failure atomicity): startRevisit creates a
  // real visit AND a live capability token before the station assignment is
  // durable. If the assignment then fails -- it throws, or the station
  // turns out to be busy serving someone else -- that revisit would sit in
  // the staff queue forever with a live token and no tablet to hand it to.
  // Roll it back on EITHER failure shape.
  //
  // The rollback is conditional on `started.created` (round 17: split out
  // from the old `!started.reused`, see startRevisit's own doc comment on
  // why one boolean stopped being enough), which is the crucial
  // distinction: startRevisit dedupes a repeated same-patient/same-mode
  // start into a pre-existing PENDING revisit, and that one belongs to an
  // earlier deliberate action (its QR may already be on screen, or it may
  // already be assigned to another station) -- OR, since round 17, it may
  // be a durable-restart-recovery reissue onto a visit this call did not
  // create. Deleting that visit because a second, unrelated assignment
  // attempt failed would destroy working state. Only a visit this very
  // call created (`created: true`) is ours to delete; if it merely
  // reissued a token onto a pre-existing visit and the assignment then
  // fails, the visit is simply left as an unassigned pending revisit with
  // a valid (if now-unused) token -- a legitimate, already-supported state
  // staff can reassign later, not a leak.
  //
  // Station uniqueness is enforced inside stations.assignSession itself --
  // see its doc comment. Nothing is ever displaced: a station already
  // serving someone else is refused ('station_busy'), and a visit already
  // assigned to another station is refused too ('visit_assigned_elsewhere')
  // rather than moved, because a move cannot retract the capability the old
  // tablet already holds. So there is no displaced session to invalidate
  // here, and no compensating transaction to get wrong.
  async function assignRevisitToStation(patientId, stationId, deliveryMode = 'CLINIC_TABLET') {
    const station = await stations.getStation(stationId)
    if (!station) return { ok: false, reason: 'station_not_found' }

    const started = await startRevisit(patientId, deliveryMode)
    let assignResult
    try {
      assignResult = await stations.assignSession(stationId, {
        visit_id: started.visit.id,
        patient_id: patientId,
        token: started.token,
        delivery_mode: deliveryMode,
      })
    } catch (err) {
      if (started.created) await rollbackNewRevisit(started)
      throw err
    }
    if (!assignResult.ok) {
      if (started.created) await rollbackNewRevisit(started)
      return assignResult
    }

    // Audit registry batch, finding A: expose `reused`/`created` (both
    // already returned by startRevisit) so the route can tell whether this
    // call actually created a new visit, issued a genuinely new token onto
    // a pre-existing one, or merely replayed an already-issued result --
    // without them, the route had no way to audit
    // visit_created/follow_up_session_issued conditionally and correctly.
    return {
      ok: true,
      visit: started.visit,
      session: started.session,
      station: assignResult.station,
      reused: started.reused,
      created: started.created,
    }
  }

  // Round 8: the station's own post-submission call. Clears the assignment
  // so the tablet returns to its waiting screen with nothing retained.
  async function completeStationAssignment(stationId) {
    return stations.clearAssignment(stationId)
  }

  // STAFF's manual reset is not the same act as the station reporting a
  // completed submission. Complete happens after the patient submitted, so
  // that visit's token is already CONSUMED and clearing the assignment is
  // the whole job. A reset happens while a session may still be OPEN ON THE
  // PHYSICAL TABLET -- and that screen has stopped polling, so nothing the
  // server does can make it navigate away. Clearing the assignment alone
  // would leave that abandoned screen able to submit into a session staff
  // has already taken back, so the reset must also revoke the capability.
  //
  // Round 10 review fix -- ORDER MATTERS, and it used to be backwards.
  // Clearing first, releasing the station lock, then invalidating left a
  // window in which the station already looked free while the token was
  // still live: a stale tablet could POST in that gap, win the visit lock,
  // and have its answer accepted after staff had already clicked reset.
  // Revoking FIRST closes it. The two orderings fail very differently:
  //   - revoke fails, station stays busy  -> a dead token on a busy
  //     station. Visible, harmless, and staff can just press reset again.
  //   - clear fails after revoke          -> same thing. Also retryable.
  //   - (old order) accept a response after reset -> silent, unrecoverable
  //     corruption of the record.
  // So revocation is the step that must take authority first, and the
  // clear is made conditional on the visit it was told to reset (see
  // stationStore.clearAssignment) so a session that legitimately landed on
  // the station while revocation waited for the visit lock is not
  // discarded by accident.
  //
  // The inverse race is handled by the same ordering rather than against
  // it: if the patient's submission already holds the visit lock when the
  // reset arrives, invalidateActiveForVisit waits, then finds the token
  // CONSUMED and leaves it alone -- an accepted answer is never rolled
  // back by a reset that lost the race.
  async function resetStation(stationId) {
    const current = await stations.getStation(stationId)
    if (!current) return { ok: false, reason: 'not_found' }
    const assignment = current.assignment ?? null

    if (assignment?.visit_id) {
      await followUpSessions.invalidateActiveForVisit(assignment.visit_id).catch(() => {})
    }

    const result = await stations.clearAssignment(stationId, assignment ? assignment.visit_id : null)

    if (assignment?.patient_id) {
      // Forget the dedup cache entry for that session, so the next
      // assignment for this patient mints a FRESH capability instead of
      // replaying the one this reset just revoked.
      await forgetStartRevisitCache(assignment.patient_id, assignment.visit_id)
    }
    return result
  }

  // Round 3(revisit linkage): "Doctor Queue" for no-submission revisit
  // visits, each enriched with an OPERATIONAL Micro Follow-up status --
  // never a diagnostic/safety classification (see microFollowUp.ts's
  // microFollowUpNeedsAttention doc comment, same rule applies here).
  // Never mixed into listSubmissions()'s own contract.
  async function listRevisitQueue() {
    const allVisits = await visits.listVisits()
    const revisits = allVisits.filter((v) => !v.submission_id)
    const results = []
    for (const v of revisits) {
      const session = await followUpSessions.getActiveForVisit(v.id)
      const response = await microFollowUp.getResponse(v.id)
      const assignedStation = await stations.findStationForVisit(v.id)
      let status
      if (response) {
        status = 'COMPLETED'
      } else if (session && session.status === 'ACTIVE' && new Date(session.expires_at).getTime() >= Date.now()) {
        // Round 8: distinguish "link issued, nobody has opened it yet" from
        // "the patient/station has actually opened the questions" using the
        // operational patient_started_at timestamp. Purely a staff-facing
        // progress cue -- no clinical meaning, no routing effect.
        status = session.patient_started_at ? 'IN_PROGRESS' : 'WAITING_FOR_PATIENT'
      } else if (session) {
        // ACTIVE-but-expired, or INVALIDATED/CONSUMED with no saved
        // response (shouldn't normally happen -- consumption and response
        // save happen together in submitFollowUpSession) -- either way the
        // clinician needs to reissue a fresh link.
        status = 'EXPIRED'
      } else {
        status = 'NOT_STARTED'
      }
      results.push({
        visit_id: v.id,
        patient_id: v.patient_id,
        created_at: v.created_at,
        updated_at: v.updated_at,
        status,
        needs_attention: Boolean(response?.newSymptomReported || response?.adverseEffectReported),
        // Round 8 operational metadata (never clinical): how this session's
        // link is meant to reach the patient, which station (if any) is
        // currently holding it, and the four workflow timestamps that let
        // the clinic see where time is actually going.
        delivery_mode: session?.delivery_mode ?? null,
        station_name: assignedStation?.name ?? null,
        input_provenance: response?.inputProvenance ?? null,
        session_created_at: session?.issued_at ?? null,
        assigned_at: assignedStation?.assignment?.assigned_at ?? null,
        patient_started_at: session?.patient_started_at ?? null,
        submitted_at: response?.submitted_at ?? null,
      })
    }
    results.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return results
  }

  // 보존기한(retention) 정리. days <= 0(또는 falsy)이면 아무것도 지우지 않는다
  // (SAMINDANG_RETENTION_DAYS=0 = 자동삭제 비활성화). 반환값은 삭제 건수뿐 —
  // 내용은 절대 로그로 남기지 않는다.
  // Round 17 (documented, not fixed -- Fable scoping report class B7ii):
  // this read-check-unlink does not take the per-id `withLock` that
  // setStatus/saveJudgment/saveWorkspace use for their own read-modify-
  // write. A record already past the retention cutoff being actively
  // edited at the exact moment this sweep reaches it could, in principle,
  // have its RMW's atomicWrite land in the gap between this function's
  // read and its unlink -- resurrecting a just-deleted expired record for
  // one write cycle before the NEXT 6-hourly sweep removes it again. Real
  // consequence is narrow (retention is measured in days, the sweep
  // interval in hours, and the record would already have to be past its
  // retention cutoff yet still actively being edited by a clinician) and
  // bounded (the record is gone again at most 6 hours later, never
  // permanently retained past policy). Not worth adding a lock a routine
  // background sweep would then have to queue behind every live edit for.
  async function cleanupOlderThan(days) {
    if (!(days > 0)) return 0
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    let deleted = 0
    for (const f of await listFiles()) {
      const filePath = path.join(dataDir, f)
      try {
        const r = JSON.parse(await readFile(filePath, 'utf8'))
        if (new Date(r.created_at).getTime() < cutoff) {
          await unlink(filePath)
          deleted++
        }
      } catch {
        // 손상되거나 쓰는 중인 파일은 건드리지 않는다
      }
    }
    // recorder-results/(전사/구조화 노트)도 같은 보존기한을 적용한다 — 가장
    // 민감한 데이터가 submissions/보다 더 오래 남아있으면 안 된다.
    deleted += await recorderResults.cleanupOlderThan(days)
    // micro-follow-up/(round 3 Phase D)도 동일하다.
    deleted += await microFollowUp.cleanupOlderThan(days)
    return deleted
  }

  // Round 3(revisit linkage): follow-up-sessions/의 정리는 일부러 위
  // cleanupOlderThan(days)와 분리된 별도 정책이다 -- 클리닉이
  // SAMINDANG_RETENTION_DAYS=0(일반 진료기록 자동삭제 비활성화)으로
  // 설정하더라도, 이미 소비/만료/무효화된 한번쓰기 토큰은 계속 훨씬 짧은
  // 창(기본 24시간, SAMINDANG_FOLLOWUP_TOKEN_RETENTION_HOURS)으로 정리
  // 되어야 한다 -- 두 정책을 같은 스위치에 묶으면 안 된다.
  async function cleanupFollowUpSessions() {
    return followUpSessions.cleanupOlderThan(followUpTokenRetentionHours)
  }

  // 파일럿 종료 후 전체 삭제(scripts/purge-data.mjs 전용). 파일 개수만 반환한다.
  // recorder-results/(전사/구조화 노트)도 함께 지운다 — 여기서 빠지면
  // "전체 삭제"라는 스크립트의 약속이 거짓이 된다.
  //
  // Data purge/audit batch: visits/도 여기 포함한다 -- 재진(revisit)
  // visit는 submission_id가 null이라 submissions/ 삭제만으로는 절대
  // 지워지지 않고, 여기 saveVisitWorkspace로 저장된 임상 메모(clinician
  // 관찰/판단)까지 포함한다. 이전에는 빠져 있었다 — purgeAll()의 "전체
  // 삭제" 약속을 거짓으로 만드는 결함이었다.
  // Independent-review finding: *.json만 지우면 크래시로 남은 *.json.tmp
  // 고아 파일(atomicWrite의 rename 직전에 죽은 경우)이 "전체 삭제" 이후에도
  // 남는다. dataDir 자체를 rm -rf해 파일명 패턴과 무관하게 확실히 비운다
  // (다음 저장 시 ensureDir()가 다시 만든다).
  async function purgeAll() {
    let deleted = (await listFiles()).length
    await rm(dataDir, { recursive: true, force: true })
    deleted += await recorderResults.purgeAll()
    deleted += await microFollowUp.purgeAll()
    deleted += await followUpSessions.purgeAll()
    deleted += await stations.purgeAll()
    deleted += await visits.purgeAll()
    return deleted
  }

  return {
    createSubmission,
    listSubmissions,
    getSubmission,
    setStatus,
    saveJudgment,
    saveWorkspace,
    getPatientHistory,
    cleanupOlderThan,
    purgeAll,
    createVisit: visits.createVisit,
    getVisit: visits.getVisit,
    listVisits: visits.listVisits,
    visitExistsForPatient: visits.visitExistsForPatient,
    saveRecorderResult: recorderResults.saveResult,
    listRecorderResults: recorderResults.listResults,
    saveMicroFollowUpResponse: microFollowUp.saveResponse,
    getMicroFollowUpResponse: microFollowUp.getResponse,
    setVisitRecorderPointer: visits.setRecorderPointer,
    saveVisitWorkspace: visits.saveVisitWorkspace,
    deriveMicroFollowUpCandidates,
    startRevisit,
    reissueFollowUpSession,
    invalidateFollowUpSession: followUpSessions.invalidateActiveForVisit,
    getFollowUpSessionStatus: followUpSessions.getActiveForVisit,
    resolveFollowUpSession: followUpSessions.resolveToken,
    markFollowUpSessionStarted: followUpSessions.markStarted,
    submitFollowUpSession,
    cleanupFollowUpSessions,
    listRevisitQueue,
    // Round 8: clinic tablet stations.
    registerStation: stations.registerStation,
    resolveStation: stations.resolveStation,
    listStations: stations.listStations,
    pollStationAssignment: stations.pollAssignment,
    assignRevisitToStation,
    completeStationAssignment,
    resetStation,
  }
}
