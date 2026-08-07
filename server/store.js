// 저장 계층. 제출 1건 = 파일 1개(JSON). 목록은 디렉터리를 읽어서 만든다(별도 인덱스 없음).
// ponytail: 디렉터리 스캔으로 목록을 만드므로 O(n) — 파일럿 규모(하루 수십 건)에서는 충분하다.
// 제출 건수가 많아지면(수천+) 인덱스 파일이나 SQLite로 옮긴다.
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const VALID_STATUSES = new Set(['new', 'viewed', 'in_consultation', 'completed'])

function recordPath(dataDir, id) {
  return path.join(dataDir, `${id}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

export function createStore(dataDir) {
  async function ensureDir() {
    await mkdir(dataDir, { recursive: true })
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

  async function createSubmission({ submission, myungri, patient_label }) {
    await ensureDir()
    const id = randomUUID()
    const now = new Date().toISOString()
    const record = {
      id,
      created_at: now,
      updated_at: now,
      status: 'new',
      patient_label,
      submission,
      myungri,
      judgment: null,
    }
    await atomicWrite(recordPath(dataDir, id), record)
    return record
  }

  async function listSubmissions(limit) {
    await ensureDir()
    const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'))
    const records = []
    for (const f of files) {
      try {
        const raw = await readFile(path.join(dataDir, f), 'utf8')
        const r = JSON.parse(raw)
        records.push({
          id: r.id,
          created_at: r.created_at,
          updated_at: r.updated_at,
          status: r.status,
          patient_label: r.patient_label,
          primary_concern: r.submission?.metadata?.primary_concern ?? null,
          requires_staff_check: r.submission?.flags?.requires_staff_check ?? false,
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

  async function setStatus(id, status) {
    if (!VALID_STATUSES.has(status)) {
      throw Object.assign(new Error('invalid status'), { statusCode: 400 })
    }
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
  }

  async function saveJudgment(id, judgment) {
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
  }

  return { createSubmission, listSubmissions, getSubmission, setStatus, saveJudgment }
}
