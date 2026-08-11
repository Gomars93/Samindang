// Recorder 결과(전사/구조화 노트) 저장 계층. visitStore.js와 동일한
// atomic-write JSON-파일 패턴이지만, 한 visit에 여러 recording이 있을 수
// 있으므로 파일 1개 = recording 1개다: <resultsDir>/<visit_id>/<recording_id>.json.
// 같은 recording_id로 다시 오면(재전송/네트워크 재시도) 새 파일을 만들지
// 않고 기존 파일을 덮어쓴다(idempotent) — created_at은 최초 저장 시각을
// 유지하고 updated_at만 갱신한다.
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

function visitDir(resultsDir, visitId) {
  return path.join(resultsDir, visitId)
}

function resultPath(resultsDir, visitId, recordingId) {
  return path.join(visitDir(resultsDir, visitId), `${recordingId}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

// ponytail: store.js/visitStore.js와 같은 in-process 키별 mutex. 별도
// 인스턴스로 두는 이유도 동일하다 — recording 저장은 submission/visit 락
// 공간과 무관한 키 공간이다.
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

export function createRecorderResultStore(resultsDir) {
  async function saveResult({ visit_id, recording_id, transcript, structured_note, source }) {
    return withLock(`${visit_id}/${recording_id}`, async () => {
      await mkdir(visitDir(resultsDir, visit_id), { recursive: true })
      const filePath = resultPath(resultsDir, visit_id, recording_id)
      let existing = null
      try {
        existing = JSON.parse(await readFile(filePath, 'utf8'))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      const now = new Date().toISOString()
      const record = {
        visit_id,
        recording_id,
        transcript: transcript ?? null,
        structured_note: structured_note ?? null,
        source: source ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      }
      await atomicWrite(filePath, record)
      return record
    })
  }

  async function listResults(visit_id) {
    let files
    try {
      files = (await readdir(visitDir(resultsDir, visit_id))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const records = []
    for (const f of files) {
      try {
        records.push(JSON.parse(await readFile(path.join(visitDir(resultsDir, visit_id), f), 'utf8')))
      } catch {
        // 손상되거나 쓰는 중(.tmp 아님)인 파일은 건너뛴다
      }
    }
    records.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return records
  }

  return { saveResult, listResults }
}
