// Recorder 결과(전사/구조화 노트) 저장 계층. visitStore.js와 동일한
// atomic-write JSON-파일 패턴이지만, 한 visit에 여러 recording이 있을 수
// 있으므로 파일 1개 = recording 1개다: <resultsDir>/<visit_id>/<recording_id>.json.
// 같은 recording_id로 다시 오면(재전송/네트워크 재시도) 새 파일을 만들지
// 않고 기존 파일을 덮어쓴다(idempotent) — created_at은 최초 저장 시각을
// 유지하고 updated_at만 갱신한다.
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
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

  // 보존기한(retention) 정리. store.js의 cleanupOlderThan(days)과 같은 규칙
  // (days<=0이면 아무것도 안 지움) — recorder-results/는 <visitId>/<recordingId>.json
  // 구조라서 visit 디렉터리를 순회한 뒤 그 안의 recording 파일들을 각각 검사한다.
  async function cleanupOlderThan(days) {
    if (!(days > 0)) return 0
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    let deleted = 0
    let visitIds
    try {
      visitIds = await readdir(resultsDir)
    } catch (err) {
      if (err.code === 'ENOENT') return 0
      throw err
    }
    for (const visitId of visitIds) {
      const dir = visitDir(resultsDir, visitId)
      let files
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
      } catch {
        continue
      }
      for (const f of files) {
        const filePath = path.join(dir, f)
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
    }
    return deleted
  }

  // 파일럿 종료 후 전체 삭제(store.js purgeAll에서 호출). visit 디렉터리
  // 전체를 지운다 — recording 파일 개수를 세서 반환한다(store.js의
  // purgeAll과 같은 "삭제 건수만" 원칙).
  async function purgeAll() {
    let deleted = 0
    let visitIds
    try {
      visitIds = await readdir(resultsDir)
    } catch (err) {
      if (err.code === 'ENOENT') return 0
      throw err
    }
    for (const visitId of visitIds) {
      const dir = visitDir(resultsDir, visitId)
      try {
        const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
        deleted += files.length
      } catch {
        // ignore — still attempt the rm below
      }
      await rm(dir, { recursive: true, force: true })
    }
    return deleted
  }

  return { saveResult, listResults, cleanupOlderThan, purgeAll }
}
