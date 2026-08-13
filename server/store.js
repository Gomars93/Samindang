// 저장 계층. 제출 1건 = 파일 1개(JSON). 목록은 디렉터리를 읽어서 만든다(별도 인덱스 없음).
// ponytail: 디렉터리 스캔으로 목록을 만드므로 O(n) — 파일럿 규모(하루 수십 건)에서는 충분하다.
// 제출 건수가 많아지면(수천+) 인덱스 파일이나 SQLite로 옮긴다.
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createVisitStore } from './visitStore.js'
import { createRecorderResultStore } from './recorderResultStore.js'

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

export function createStore(dataDir) {
  // visits/는 submissions/의 형제 경로다(audit.log와 같은 패턴) — 별도
  // 데이터 디렉터리 설정이 필요 없다.
  const visits = createVisitStore(path.join(dataDir, '..', 'visits'))
  // recorder-results/는 submissions/의 또다른 형제 경로다(visits/와 같은 패턴).
  const recorderResults = createRecorderResultStore(path.join(dataDir, '..', 'recorder-results'))

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
    return deleted
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
    return deleted
  }

  return {
    createSubmission,
    listSubmissions,
    getSubmission,
    setStatus,
    saveJudgment,
    cleanupOlderThan,
    purgeAll,
    createVisit: visits.createVisit,
    getVisit: visits.getVisit,
    listVisits: visits.listVisits,
    visitExistsForPatient: visits.visitExistsForPatient,
    saveRecorderResult: recorderResults.saveResult,
    listRecorderResults: recorderResults.listResults,
    setVisitRecorderPointer: visits.setRecorderPointer,
  }
}
