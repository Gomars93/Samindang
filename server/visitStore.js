// 방문(visit) 저장 계층. store.js(제출) 위에 얹는 얇은 레이어 — 방문 1건 =
// 파일 1개(JSON), submissions 폴더의 형제 경로(기본 `../visits`)에 둔다.
// 저장 패턴(atomic write: .tmp 쓰고 rename)은 store.js와 동일하게 맞춘다.
//
// 신원 규칙(절대 원칙, 재설계 금지): patient_id는 이름/전화번호로 자동
// 매칭하지 않는다. 새 patient_id를 만드는 것이 항상 안전한 기본값이다 —
// 동명이인이 같은 patient_id로 잘못 묶이는 사고를 방지한다. 같은 환자의
// 재진(같은 patient_id로 새 visit)은 원장이 명시적으로 기존 patient_id를
// 지정해야만 만들어진다 (server/index.js의 POST /api/visits, patient_id
// 존재 검증 포함 — visitExistsForPatient).
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

function visitPath(visitsDir, id) {
  return path.join(visitsDir, `${id}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

// Round 17: same reasoning as server/store.js's identical helper -- keeps
// `updated_at` strictly monotonic across successive writes to one visit
// record even within the same millisecond, so saveVisitWorkspace's
// optional expectedUpdatedAt CAS precondition (and setRecorderPointer,
// which touches the same field on the same record) can't silently defeat
// each other's conflict detection.
function nextUpdatedAt(previous) {
  const now = new Date()
  if (previous && now.toISOString() <= previous) {
    return new Date(new Date(previous).getTime() + 1).toISOString()
  }
  return now.toISOString()
}

// ponytail: store.js의 withLock과 모양은 같지만 일부러 별도 인스턴스로
// 둔다 — visit 생성은 submission id 락 공간과 무관한 별개의 키 공간이라
// 같은 맵을 공유해도 얻는 게 없고, store.js 내부 Map을 export하면 결합도만
// 늘어난다. 두 파일 다 "이 프로세스가 데이터 디렉터리를 혼자 소유한다"는
// 같은 전제 위에 있다(server.js 문서화된 전제와 동일). Round 17부터 이
// 전제는 server/ownerLock.js가 CLI 부팅 시점에 실제로 강제한다 -- 자세한
// 내용은 store.js의 동일 주석 참고.
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

// 모든 visit 생성을 이 키 하나로 직렬화한다 — 파일럿 규모(하루 수십 건)의
// 동시 생성 정도는 이 정도 직렬화로 충분하고, 별도 락 공간을 patient_id별로
// 나눌 이득이 없다.
const VISIT_CREATE_LOCK_KEY = '__visit_create__'

export function createVisitStore(visitsDir) {
  async function ensureDir() {
    await mkdir(visitsDir, { recursive: true })
  }

  async function listFiles() {
    await ensureDir()
    return (await readdir(visitsDir)).filter((f) => f.endsWith('.json'))
  }

  async function readVisit(id) {
    try {
      const raw = await readFile(visitPath(visitsDir, id), 'utf8')
      return JSON.parse(raw)
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  async function visitExistsForPatient(patientId) {
    if (!patientId) return false
    for (const f of await listFiles()) {
      try {
        const v = JSON.parse(await readFile(path.join(visitsDir, f), 'utf8'))
        if (v.patient_id === patientId) return true
      } catch {
        // 손상되거나 쓰는 중인 파일은 건너뛴다
      }
    }
    return false
  }

  // patient_id를 생략하면 새 환자로 취급해 새 patient_id를 만든다(태블릿
  // 제출 경로가 항상 이렇게 호출한다). patient_id를 넘기면 그 값을 그대로
  // 쓴다 — 호출자가 이미 실존 patient_id인지 검증했다는 전제다(재진 생성
  // 경로, POST /api/visits).
  async function createVisit({ patient_id, submission_id = null } = {}) {
    return withLock(VISIT_CREATE_LOCK_KEY, async () => {
      await ensureDir()
      const id = randomUUID()
      const now = new Date().toISOString()
      const record = {
        id,
        patient_id: patient_id ?? randomUUID(),
        created_at: now,
        updated_at: now,
        submission_id: submission_id ?? null,
        // 아래 셋은 지금은 항상 null이다 — 미래의 ClinicAI/EMR 연동을 위한
        // 자리표시자일 뿐, 이번 스프린트에서 채우는 로직은 없다.
        recording_id: null,
        transcript_id: null,
        // submission_id가 있으면 임상 판단은 그 submission의 기존
        // judgment 엔드포인트에 이미 산다(중복 저장하지 않는다). 없으면
        // (문진 없는 미래의 재진) 지금은 판단을 기록할 UI가 없다는 뜻이고,
        // 그건 의도적으로 남겨둔 다음 스프린트의 갭이다.
        judgment_ref: submission_id ? 'submission' : null,
        emr_summary: null,
        // Round 3 (revisit linkage): the visit-owned clinician workspace, used
        // ONLY when this visit has no submission_id (a no-questionnaire
        // revisit). When submission_id is set, the submission's own
        // `workspace` field (server/store.js's saveWorkspace) remains the
        // single source of truth -- this field stays null for those visits,
        // never a duplicate copy (see saveVisitWorkspace below).
        workspace: null,
      }
      await atomicWrite(visitPath(visitsDir, id), record)
      return record
    })
  }

  async function getVisit(id) {
    return readVisit(id)
  }

  // Round 3 (revisit linkage): same read-modify-write-under-lock shape as
  // store.js's saveWorkspace, but for a visit that has no submission (a
  // no-questionnaire revisit) -- this is the visit's OWN workspace, never
  // written into the previous visit/submission's record.
  //
  // Round 4 review fix: single-source-of-truth enforcement moved down to
  // THIS layer, not just the HTTP route -- a submission-backed visit's
  // workspace must only ever be written through store.js's saveWorkspace
  // (PUT /api/submissions/:id/workspace). Rejecting only at the route would
  // leave any other future caller of this store function free to write a
  // second, divergent copy. Returns a discriminated result rather than the
  // old bare-`record`-or-`null` shape so the caller can tell "not found"
  // apart from "found but wrong kind of visit".
  // Round 17: `expectedUpdatedAt` is an OPTIONAL compare-and-swap
  // precondition, identical contract to server/store.js's
  // saveJudgment/saveWorkspace (see their doc comment) -- absent, this is
  // the original unconditional last-write-wins save; supplied and stale,
  // this returns `{ok:false, reason:'conflict', current: record}` instead
  // of silently overwriting a newer write, carrying the fresh record so
  // the caller never needs a second read.
  async function saveVisitWorkspace(id, workspace, { expectedUpdatedAt } = {}) {
    return withLock(id, async () => {
      const record = await readVisit(id)
      if (!record) return { ok: false, reason: 'not_found' }
      if (record.submission_id !== null) return { ok: false, reason: 'submission_backed' }
      if (expectedUpdatedAt != null && record.updated_at !== expectedUpdatedAt) {
        return { ok: false, reason: 'conflict', current: record }
      }
      record.workspace = workspace
      record.updated_at = nextUpdatedAt(record.updated_at)
      await atomicWrite(visitPath(visitsDir, id), record)
      return { ok: true, record }
    })
  }

  // Round 4 review fix (startRevisit atomicity): rollback-only primitive.
  // Never exposed via any HTTP route -- store.js's startRevisit is the only
  // caller, used exclusively to undo a visit it just created in this same
  // request when the follow-up token issuance that must accompany it fails,
  // so a caller can never observe a no-submission revisit visit with no
  // token. Best-effort: if the delete itself fails, the caller still
  // surfaces the original error rather than masking it.
  async function deleteVisitForRollbackOnly(id) {
    return withLock(id, async () => {
      await unlink(visitPath(visitsDir, id)).catch((err) => {
        if (err.code !== 'ENOENT') throw err
      })
    })
  }

  // recorder-results POST가 성공할 때마다 이 visit이 "가장 최근에 가리키는"
  // recording_id를 갱신한다 — 전체 lineage는 recorderResultStore가 따로
  // 가지고 있고, 이 필드는 그중 최신 것을 가리키는 포인터일 뿐이다.
  // transcript_id는 이번 스프린트에서 별도 개념으로 정의하지 않는다
  // (recorder-results 계약에 recording_id 하나만 있다) — null로 남겨둔다.
  async function setRecorderPointer(id, recording_id) {
    return withLock(id, async () => {
      const record = await readVisit(id)
      if (!record) return null
      record.recording_id = recording_id
      record.updated_at = nextUpdatedAt(record.updated_at)
      await atomicWrite(visitPath(visitsDir, id), record)
      return record
    })
  }

  async function listVisits() {
    const files = await listFiles()
    const records = []
    for (const f of files) {
      try {
        const v = JSON.parse(await readFile(path.join(visitsDir, f), 'utf8'))
        records.push({
          id: v.id,
          patient_id: v.patient_id,
          created_at: v.created_at,
          updated_at: v.updated_at ?? v.created_at,
          submission_id: v.submission_id,
        })
      } catch {
        // 손상되거나 쓰는 중(.tmp 아님)인 파일은 목록에서 건너뛴다
      }
    }
    records.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return records
  }

  // Round 3 Phase C(longitudinal linkage): 정확히 이 patient_id와 일치하는
  // visit만 돌려준다 — 이름/전화/생년월일 기반 매칭은 이 함수 어디에도
  // 없다(파일에 이미 존재하는 patient_id 문자열의 엄격한 동등 비교뿐).
  // patientId가 falsy면 빈 배열(안전한 기본값).
  async function listVisitsForPatient(patientId) {
    if (!patientId) return []
    const files = await listFiles()
    const records = []
    for (const f of files) {
      try {
        const v = JSON.parse(await readFile(path.join(visitsDir, f), 'utf8'))
        if (v.patient_id === patientId) {
          // workspace included so store.js's getPatientHistory can summarize
          // a no-submission revisit's own visit-owned workspace without a
          // second read per visit (round 4 review fix: longitudinal
          // continuity across revisits).
          records.push({
            id: v.id,
            patient_id: v.patient_id,
            created_at: v.created_at,
            submission_id: v.submission_id,
            workspace: v.workspace ?? null,
          })
        }
      } catch {
        // 손상되거나 쓰는 중인 파일은 건너뛴다
      }
    }
    records.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return records
  }

  /** 파일럿 종료 후 전체 삭제(scripts/purge-data.mjs 전용). 없어도 조용히 넘어간다.
   * Independent-review finding: *.json만 지우면 크래시로 남은 *.json.tmp
   * 고아 파일(atomicWrite의 rename 직전에 죽은 경우 -- 임상 메모를 담고
   * 있을 수 있음)이 "전체 삭제"를 약속한 뒤에도 디스크에 남는다.
   * recorderResultStore.purgeAll처럼 디렉터리 자체를 rm -rf해 파일명
   * 패턴과 무관하게 확실히 비운다. */
  async function purgeAll() {
    let count = 0
    try {
      count = (await listFiles()).length
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    await rm(visitsDir, { recursive: true, force: true })
    return count
  }

  return {
    createVisit,
    getVisit,
    listVisits,
    listVisitsForPatient,
    visitExistsForPatient,
    setRecorderPointer,
    saveVisitWorkspace,
    deleteVisitForRollbackOnly,
    purgeAll,
  }
}
