// Micro Follow-up 응답 저장 계층 (round 3 Phase D). visitStore.js/
// recorderResultStore.js와 동일한 atomic-write JSON-파일 패턴. 한 visit당
// micro follow-up 응답은 최대 1건이므로 파일 1개 = visit 1개다:
// <followUpDir>/<visit_id>.json. 같은 visit_id로 다시 저장하면(재전송) 새
// 파일을 만들지 않고 기존 파일을 덮어쓴다(idempotent) — created_at은 최초
// 저장 시각을 유지하고 updated_at만 갱신한다.
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

function resultPath(followUpDir, visitId) {
  return path.join(followUpDir, `${visitId}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

// store.js/visitStore.js와 같은 in-process 키별 mutex.
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

export function createMicroFollowUpStore(followUpDir) {
  async function saveResponse({
    visit_id,
    patient_id,
    targetRatings,
    overallChange,
    newSymptomReported,
    newSymptomNote,
    adverseEffectReported,
    adverseEffectNote,
  }) {
    return withLock(visit_id, async () => {
      await mkdir(followUpDir, { recursive: true })
      const filePath = resultPath(followUpDir, visit_id)
      let existing = null
      try {
        existing = JSON.parse(await readFile(filePath, 'utf8'))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      const now = new Date().toISOString()
      const record = {
        visit_id,
        patient_id,
        targetRatings: Array.isArray(targetRatings) ? targetRatings : [],
        overallChange: overallChange ?? '',
        newSymptomReported: Boolean(newSymptomReported),
        newSymptomNote: newSymptomNote ?? '',
        adverseEffectReported: Boolean(adverseEffectReported),
        adverseEffectNote: adverseEffectNote ?? '',
        created_at: existing?.created_at ?? now,
        updated_at: now,
        submitted_at: existing?.submitted_at ?? now,
      }
      await atomicWrite(filePath, record)
      return record
    })
  }

  async function getResponse(visit_id) {
    try {
      return JSON.parse(await readFile(resultPath(followUpDir, visit_id), 'utf8'))
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  // 보존기한(retention) 정리. store.js/recorderResultStore.js와 같은 규칙
  // (days<=0이면 아무것도 안 지움).
  async function cleanupOlderThan(days) {
    if (!(days > 0)) return 0
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    let deleted = 0
    let files
    try {
      files = (await readdir(followUpDir)).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return 0
      throw err
    }
    for (const f of files) {
      const filePath = path.join(followUpDir, f)
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
    return deleted
  }

  async function purgeAll() {
    let files
    try {
      files = (await readdir(followUpDir)).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return 0
      throw err
    }
    for (const f of files) {
      await unlink(path.join(followUpDir, f)).catch(() => {})
    }
    return files.length
  }

  return { saveResponse, getResponse, cleanupOlderThan, purgeAll }
}
