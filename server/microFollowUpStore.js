// Micro Follow-up 응답 저장 계층 (round 3 Phase D). visitStore.js/
// recorderResultStore.js와 동일한 atomic-write JSON-파일 패턴. 한 visit당
// micro follow-up 응답은 최대 1건이므로 파일 1개 = visit 1개다:
// <followUpDir>/<visit_id>.json.
//
// Round 6 review fix (idempotent acceptance): saveResponse used to
// unconditionally overwrite any existing record for the same visit_id.
// That was a real data-loss risk: server/store.js's submitFollowUpSession
// calls this INSIDE consumeTokenWithAction's actionFn, which runs BEFORE
// the token is marked CONSUMED -- if this save succeeds but that final
// CONSUMED write then fails, the token stays ACTIVE and the patient's
// client can legitimately retry with the exact same one-time link. A
// second overwrite-based save would silently replace the first accepted
// answer. A saved response is now write-once/immutable: once a record
// exists for a visit_id, every later call (retry or otherwise) returns
// that existing record completely unchanged rather than overwriting it --
// there is no supported "edit a submitted Micro Follow-up answer" flow, so
// treating the first durable save as final is correct, not merely
// convenient.
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
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

// Round 8: who physically entered the answers. This is NOT the broader
// clinical Provenance enum (PATIENT_FACT/OBSERVED/...) used elsewhere in
// this codebase -- both values here are still PATIENT-REPORTED FACTS. A
// STAFF_ASSISTED response means a staff member read the same fixed
// questions aloud and typed the patient's own answers for a patient who
// cannot use a device; it must NEVER be read as a clinician-observed
// finding. Anything unrecognized normalizes to PATIENT_SELF, the
// conservative default (never silently upgrade an unknown value into a
// staff-attributed one).
const INPUT_PROVENANCES = new Set(['PATIENT_SELF', 'STAFF_ASSISTED'])
function normalizeInputProvenance(value) {
  return typeof value === 'string' && INPUT_PROVENANCES.has(value) ? value : 'PATIENT_SELF'
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
    inputProvenance,
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
      // Write-once: a response already saved for this visit is final. See
      // the module doc comment above for why this must never overwrite.
      if (existing) return existing
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
        inputProvenance: normalizeInputProvenance(inputProvenance),
        created_at: now,
        updated_at: now,
        submitted_at: now,
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

  // Independent-review finding: *.json만 지우면 크래시로 남은 *.json.tmp
  // 고아 파일이 "전체 삭제" 이후에도 남는다. 디렉터리 자체를 rm -rf해
  // 파일명 패턴과 무관하게 확실히 비운다.
  async function purgeAll() {
    let count = 0
    try {
      count = (await readdir(followUpDir)).filter((f) => f.endsWith('.json')).length
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    await rm(followUpDir, { recursive: true, force: true })
    return count
  }

  return { saveResponse, getResponse, cleanupOlderThan, purgeAll }
}
