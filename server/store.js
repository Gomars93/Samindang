// 저장 계층. 제출 1건 = 파일 1개(JSON). 목록은 디렉터리를 읽어서 만든다(별도 인덱스 없음).
// ponytail: 디렉터리 스캔으로 목록을 만드므로 O(n) — 파일럿 규모(하루 수십 건)에서는 충분하다.
// 제출 건수가 많아지면(수천+) 인덱스 파일이나 SQLite로 옮긴다.
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createVisitStore } from './visitStore.js'
import { createRecorderResultStore } from './recorderResultStore.js'
import { createMicroFollowUpStore } from './microFollowUpStore.js'
import { createFollowUpSessionStore } from './followUpSessionStore.js'

const VALID_STATUSES = new Set(['new', 'viewed', 'in_consultation', 'completed'])
// createSubmission의 session_id 중복 검사+생성을 이 키 하나로 직렬화한다.
const SESSION_INDEX_LOCK_KEY = '__session_index__'

function recordPath(dataDir, id) {
  return path.join(dataDir, `${id}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

// ponytail: 단일 서버 프로세스 안에서만 유효한 in-process async mutex(키별
// promise 체인). 이 프로세스가 데이터 디렉터리를 혼자 소유한다는 전제라서
// 이걸로 충분하다 — 같은 데이터 디렉터리를 향해 서버 프로세스 2개를 띄우는
// 구성은 지원하지 않는다(파일 레벨 잠금이 없다). 규모가 커지면 파일 락이나
// 실제 DB 트랜잭션으로 옮긴다.
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

export function createStore(dataDir, { followUpTokenTtlMinutes = 30, followUpTokenRetentionHours = 24 } = {}) {
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
      record.updated_at = new Date().toISOString()
      // assert: status transition must never touch submission/myungri
      if (record.submission !== before.submission || record.myungri !== before.myungri) {
        throw new Error('invariant violated: setStatus mutated submission/myungri')
      }
      await atomicWrite(recordPath(dataDir, id), record)
      return record
    })
  }

  async function saveJudgment(id, judgment) {
    return withLock(id, async () => {
      const record = await readRecord(id)
      if (!record) return null
      const before = { submission: record.submission, myungri: record.myungri }
      record.judgment = judgment
      record.updated_at = new Date().toISOString()
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
  // into a torn read). Never touches submission/myungri/judgment.
  async function saveWorkspace(id, workspace) {
    return withLock(id, async () => {
      const record = await readRecord(id)
      if (!record) return null
      const before = { submission: record.submission, myungri: record.myungri, judgment: record.judgment }
      record.workspace = workspace
      record.updated_at = new Date().toISOString()
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
  // 시작 전" forever for a visit nobody actually meant to create yet).
  async function startRevisit(patientId) {
    const visit = await visits.createVisit({ patient_id: patientId, submission_id: null })
    try {
      const targets = await deriveMicroFollowUpCandidates(patientId, visit.id)
      const { token, record } = await followUpSessions.issueToken({
        visit_id: visit.id,
        patient_id: patientId,
        targets,
      })
      return { visit, token, session: record }
    } catch (err) {
      await visits.deleteVisitForRollbackOnly(visit.id).catch(() => {})
      throw err
    }
  }

  // Reissue: same visit, freshly re-derived candidates (in case the
  // clinician's prior-visit data changed since the original issuance),
  // brand-new token -- issueToken() itself invalidates the previous active
  // token for this visit_id.
  async function reissueFollowUpSession(visitId) {
    const visit = await visits.getVisit(visitId)
    if (!visit) return null
    const targets = await deriveMicroFollowUpCandidates(visit.patient_id, visitId)
    const { token, record } = await followUpSessions.issueToken({
      visit_id: visitId,
      patient_id: visit.patient_id,
      targets,
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
      })
    })
    if (!result.ok) return result
    return { ok: true, visit_id: result.record.visit_id, response: result.actionResult }
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
      let status
      if (response) {
        status = 'COMPLETED'
      } else if (session && session.status === 'ACTIVE' && new Date(session.expires_at).getTime() >= Date.now()) {
        status = 'WAITING_FOR_PATIENT'
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
      })
    }
    results.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return results
  }

  // 보존기한(retention) 정리. days <= 0(또는 falsy)이면 아무것도 지우지 않는다
  // (SAMINDANG_RETENTION_DAYS=0 = 자동삭제 비활성화). 반환값은 삭제 건수뿐 —
  // 내용은 절대 로그로 남기지 않는다.
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
  async function purgeAll() {
    let deleted = 0
    for (const f of await listFiles()) {
      await unlink(path.join(dataDir, f)).catch(() => {})
      deleted++
    }
    deleted += await recorderResults.purgeAll()
    deleted += await microFollowUp.purgeAll()
    deleted += await followUpSessions.purgeAll()
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
    submitFollowUpSession,
    cleanupFollowUpSessions,
    listRevisitQueue,
  }
}
