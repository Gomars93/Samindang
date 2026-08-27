#!/usr/bin/env node
// 최소 LAN 전용 핸드오프 서버. node:http만 사용 — 새 npm 의존성 없음.
// `node server/index.js`로 바로 실행한다(빌드 단계 없음).
//
// 보안 모델: 환자용 엔드포인트는 쓰기 전용(제출만 가능, 조회 불가). 원장용
// 엔드포인트는 loopback 요청이거나 올바른 x-doctor-token 헤더가 있을 때만
// 허용한다. 파일럿 등급이며 실제 인증이 아니다 — 자세한 내용은
// docs/RUNBOOK_LOCAL_HANDOFF.md 참고.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createStore } from './store.js'
import { createAuditLog } from './audit.js'
import { isDoctorRequestAllowed, isOriginAllowedForDoctor } from './auth.js'
import {
  activateVisit,
  clearActiveVisit,
  getActiveVisit,
  isValidWorkstationId,
  DEFAULT_WORKSTATION_ID,
} from './activeVisit.js'

const VERSION = '0.1.0'
const MAX_BODY_BYTES = 1024 * 1024 // 1MB

function parseAllowedOrigins(raw) {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function createApp({ dataDir, doctorToken, allowedOrigins, retentionDays } = {}) {
  const resolvedDataDir = dataDir ?? process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'
  const store = createStore(resolvedDataDir)
  const audit = createAuditLog(resolvedDataDir)
  const configuredToken = doctorToken !== undefined ? doctorToken : process.env.SAMINDANG_DOCTOR_TOKEN
  const doctorAllowedOrigins = allowedOrigins ?? parseAllowedOrigins(process.env.SAMINDANG_ALLOWED_ORIGINS)
  const configuredRetentionDays =
    retentionDays !== undefined ? retentionDays : Number(process.env.SAMINDANG_RETENTION_DAYS ?? '30')

  function log(method, url, status, id, bytes, extra) {
    // 절대 payload 본문/환자 이름/전화번호를 로그에 남기지 않는다.
    console.log(
      `${new Date().toISOString()} ${method} ${url} ${status} id=${id ?? '-'} bytes=${bytes ?? '-'}${extra ? ` ${extra}` : ''}`,
    )
  }

  // 응답을 보내기 전에 audit 한 줄을 반드시 먼저 기록한다(순서 보장 —
  // 클라이언트가 응답을 받은 시점엔 이미 로그가 디스크에 있다). audit 기록
  // 자체가 실패해도 본 요청은 실패시키지 않는다 — id와 에러 클래스만 남긴다.
  async function safeAudit(fields) {
    try {
      await audit.logEvent(fields)
    } catch (err) {
      console.error(
        `${new Date().toISOString()} audit log write failed id=${fields.submission_id ?? '-'} err=${err.constructor.name}`,
      )
    }
  }

  // 보존기한 자동 삭제. SAMINDANG_RETENTION_DAYS=0(또는 음수)이면 비활성화.
  // 개수만 로그에 남긴다 — 내용/id는 절대 남기지 않는다.
  async function runRetention() {
    if (!(configuredRetentionDays > 0)) return
    try {
      const deleted = await store.cleanupOlderThan(configuredRetentionDays)
      if (deleted > 0) {
        console.log(
          `${new Date().toISOString()} retention: purged ${deleted} submission(s) older than ${configuredRetentionDays}d`,
        )
      }
    } catch (err) {
      console.error(`${new Date().toISOString()} retention: cleanup failed: ${err.message}`)
    }
  }

  function corsHeaders(req, { doctorRoute }) {
    const origin = req.headers.origin
    const headers = {
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type,x-doctor-token',
    }
    if (doctorRoute) {
      // 원장 라우트는 절대 임의 origin을 반사하지 않는다 — 허용 목록/localhost일
      // 때만 그 origin을 돌려준다. '*'는 doctor 라우트에 절대 쓰지 않는다.
      headers['vary'] = 'origin'
      if (origin && isOriginAllowedForDoctor(origin, doctorAllowedOrigins)) {
        headers['access-control-allow-origin'] = origin
      }
    } else {
      // 환자 제출은 LAN의 아무 origin에서나 와야 하므로 origin을 그대로 반사한다.
      if (origin) headers['access-control-allow-origin'] = origin
      else headers['access-control-allow-origin'] = '*'
    }
    return headers
  }

  function sendJson(req, res, status, body, extraHeaders = {}) {
    const json = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders })
    res.end(json)
    return Buffer.byteLength(json)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let total = 0
      const chunks = []
      let rejected = false
      req.on('data', (chunk) => {
        if (rejected) return // already rejected; drain remaining bytes without buffering
        total += chunk.length
        if (total > MAX_BODY_BYTES) {
          rejected = true
          // don't destroy the socket here — that would RST the connection before
          // our 413 response can be flushed to the client. Just stop buffering.
          reject(Object.assign(new Error('payload too large'), { statusCode: 413 }))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (chunks.length === 0) return resolve(undefined)
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(Object.assign(new Error('invalid json'), { statusCode: 400 }))
        }
      })
      req.on('error', reject)
    })
  }

  function remoteAddress(req) {
    return req.socket.remoteAddress ?? ''
  }

  function requireDoctor(req) {
    return isDoctorRequestAllowed(remoteAddress(req), req.headers['x-doctor-token'], configuredToken)
  }

  // workstation_id가 없으면 undefined를 돌려준다(activeVisit.js가 이를
  // DEFAULT_WORKSTATION_ID로 취급) — 값이 있는데 형식이 틀리면 null을 돌려줘
  // 호출부가 400으로 거부하게 한다.
  function parseWorkstationId(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined
    return isValidWorkstationId(raw) ? raw : null
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean) // ['api','submissions',':id',...]
    // 모든 /api/submissions, /api/visits, /api/current-visit(GET/clear
    // 둘 다) 라우트가 원장용이다 — 예외는 patient POST(제출 생성) 한 건뿐.
    // GET /api/current-visit는 과거 별도의 더 엄격한 가드를 썼지만, 다른
    // workstation의 Doctor 화면이 LAN으로 읽어야 하므로 다른 원장 라우트와
    // 동일한 requireDoctor()+origin allowlist 모델로 통합했다.
    const isSubmissionsRoute =
      parts[1] === 'submissions' && !(parts.length === 2 && req.method === 'POST')
    const isVisitsRoute = parts[1] === 'visits'
    const isCurrentVisitClear = parts[1] === 'current-visit' && parts.length === 3 && parts[2] === 'clear'
    const isCurrentVisitRead =
      parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 2 && req.method === 'GET'
    const doctorRoute =
      parts[0] === 'api' && (isSubmissionsRoute || isVisitsRoute || isCurrentVisitClear || isCurrentVisitRead)
    const cors = corsHeaders(req, { doctorRoute })

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return
    }

    // 방어 심층화: CORS 헤더는 브라우저만 지켜준다. loopback 요청 자체가 이미
    // 가드를 통과하므로, 서버 단에서도 허용되지 않은 브라우저 origin의 원장
    // 라우트 요청을 store에 손대기 전에 즉시 차단한다.
    if (doctorRoute && !isOriginAllowedForDoctor(req.headers.origin, doctorAllowedOrigins)) {
      const status = 403
      const bytes = sendJson(req, res, status, { error: 'forbidden' }, cors)
      log(req.method, url.pathname, status, undefined, bytes)
      return
    }

    let status = 200
    let id
    let bytes

    try {
      if (parts[0] === 'api' && parts[1] === 'health' && req.method === 'GET') {
        bytes = sendJson(req, res, 200, { ok: true, service: 'doctor-api', version: VERSION }, cors)
      } else if (parts[0] === 'api' && parts[1] === 'submissions' && parts.length === 2 && req.method === 'POST') {
        const body = await readBody(req)
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.questionnaire_version !== 'string' || !body.responses) {
          status = 400
          bytes = sendJson(req, res, 400, { error: 'invalid submission payload' }, cors)
        } else {
          const name = body.responses?.patient?.patient_name
          const phone4 = body.responses?.patient?.phone_last4
          const patient_label = [
            typeof name === 'string' && name.trim() ? name.trim() : null,
            typeof phone4 === 'string' && phone4.trim() ? `(${phone4.trim()})` : null,
          ]
            .filter(Boolean)
            .join(' ') || '(이름 없음)'
          const record = await store.createSubmission({
            submission: {
              questionnaire_version: body.questionnaire_version,
              session_id: body.session_id ?? null,
              responses: body.responses,
              flags: body.flags ?? null,
              routing: body.routing ?? null,
              metadata: body.metadata ?? null,
            },
            myungri: body.myungri_calculation ?? null,
            patient_label,
          })
          id = record.id
          if (record.duplicate) {
            status = 200
            await safeAudit({ event: 'submission_duplicate', submission_id: record.id, actor: 'patient' })
            bytes = sendJson(req, res, 200, { id: record.id, created_at: record.created_at, duplicate: true }, cors)
          } else {
            status = 201
            await safeAudit({ event: 'submission_created', submission_id: record.id, actor: 'patient' })
            // 진짜 새 제출일 때만 새 방문이 만들어진다(store.createSubmission
            // 참고) — 멱등 중복 경로는 여기 안 온다.
            await safeAudit({
              event: 'visit_created',
              submission_id: record.id,
              visit_id: record.visit_id,
              actor: 'patient',
            })
            bytes = sendJson(req, res, 201, { id: record.id, created_at: record.created_at }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'submissions' && parts.length === 2 && req.method === 'GET') {
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const limitParam = url.searchParams.get('limit')
          const limit = limitParam ? Number(limitParam) : undefined
          const list = await store.listSubmissions(Number.isFinite(limit) ? limit : undefined)
          bytes = sendJson(req, res, 200, list, cors)
        }
      } else if (parts[0] === 'api' && parts[1] === 'submissions' && parts.length === 3 && req.method === 'GET') {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const record = await store.getSubmission(id)
          if (!record) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            await safeAudit({ event: 'submission_viewed', submission_id: id, actor: 'doctor' })
            bytes = sendJson(req, res, 200, record, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'submissions' && parts.length === 4 && parts[3] === 'status' && req.method === 'POST') {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const record = await store.setStatus(id, body?.status)
          if (!record) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            await safeAudit({ event: 'status_changed', submission_id: id, status: record.status, actor: 'doctor' })
            bytes = sendJson(req, res, 200, record, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'submissions' && parts.length === 4 && parts[3] === 'judgment' && req.method === 'PUT') {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const record = await store.saveJudgment(id, body)
          if (!record) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            await safeAudit({ event: 'judgment_saved', submission_id: id, actor: 'doctor' })
            bytes = sendJson(req, res, 200, record, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'submissions' && parts.length === 4 && parts[3] === 'workspace' && req.method === 'PUT') {
        // Doctor Clinical Workspace clinician-entered state (round 2 Phase 2).
        // Same shape as the judgment route above -- doctor-only, id-scoped,
        // last-write-wins under the store's per-id lock.
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const record = await store.saveWorkspace(id, body)
          if (!record) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            await safeAudit({ event: 'workspace_saved', submission_id: id, actor: 'doctor' })
            bytes = sendJson(req, res, 200, record, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'visits' && parts.length === 2 && req.method === 'POST') {
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const requestedPatientId =
            typeof body?.patient_id === 'string' && body.patient_id.trim() !== '' ? body.patient_id.trim() : undefined
          if (requestedPatientId !== undefined && !(await store.visitExistsForPatient(requestedPatientId))) {
            // 실존하지 않는 patient_id를 임의로 신뢰해서 새 visit을 붙이지
            // 않는다 — 이게 재진(같은 patient_id)을 원장의 명시적 행동으로만
            // 만들도록 하는 가드다(자동 매칭도 아니고, 잘못된 문자열을
            // 조용히 받아주지도 않는다).
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown patient_id' }, cors)
          } else {
            const visit = await store.createVisit({ patient_id: requestedPatientId, submission_id: null })
            status = 201
            await safeAudit({ event: 'visit_created', visit_id: visit.id, actor: 'doctor' })
            bytes = sendJson(req, res, 201, visit, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'visits' && parts.length === 2 && req.method === 'GET') {
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const list = await store.listVisits()
          bytes = sendJson(req, res, 200, list, cors)
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'activate' &&
        req.method === 'POST'
      ) {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const workstationId = parseWorkstationId(body?.workstation_id)
          if (workstationId === null) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid workstation_id' }, cors)
          } else {
            const visit = await store.getVisit(id)
            if (!visit) {
              status = 404
              bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
            } else {
              const active = activateVisit(visit, workstationId)
              await safeAudit({
                event: 'visit_activated',
                visit_id: active.visit_id,
                submission_id: active.submission_id ?? undefined,
                actor: 'doctor',
              })
              bytes = sendJson(
                req,
                res,
                200,
                {
                  active: true,
                  workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID,
                  patient_id: active.patient_id,
                  visit_id: active.visit_id,
                  submission_id: active.submission_id,
                  active_since: active.active_since,
                },
                cors,
              )
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'visits' && parts.length === 3 && req.method === 'GET') {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const visit = await store.getVisit(id)
          if (!visit) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            bytes = sendJson(req, res, 200, visit, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'recorder-results' &&
        req.method === 'POST'
      ) {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const visit = await store.getVisit(id)
          if (!visit) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            const body = await readBody(req)
            const recordingId =
              typeof body?.recording_id === 'string' && body.recording_id.trim() !== ''
                ? body.recording_id.trim()
                : null
            if (!recordingId || !/^[A-Za-z0-9_-]{1,128}$/.test(recordingId)) {
              status = 400
              bytes = sendJson(req, res, 400, { error: 'invalid recording_id' }, cors)
            } else {
              const transcript = typeof body?.transcript === 'string' ? body.transcript : null
              const rawNote = body?.structured_note
              const structuredNote =
                rawNote && typeof rawNote === 'object' && !Array.isArray(rawNote)
                  ? {
                      chief_complaint: typeof rawNote.chief_complaint === 'string' ? rawNote.chief_complaint : null,
                      history: typeof rawNote.history === 'string' ? rawNote.history : null,
                      key_findings: typeof rawNote.key_findings === 'string' ? rawNote.key_findings : null,
                      assessment: typeof rawNote.assessment === 'string' ? rawNote.assessment : null,
                      treatment: typeof rawNote.treatment === 'string' ? rawNote.treatment : null,
                      plan: typeof rawNote.plan === 'string' ? rawNote.plan : null,
                    }
                  : null
              const source =
                body?.source && typeof body.source === 'object' && !Array.isArray(body.source)
                  ? { workstation_id: typeof body.source.workstation_id === 'string' ? body.source.workstation_id : null }
                  : null
              const result = await store.saveRecorderResult({
                visit_id: id,
                recording_id: recordingId,
                transcript,
                structured_note: structuredNote,
                source,
              })
              await store.setVisitRecorderPointer(id, recordingId)
              status = 201
              await safeAudit({ event: 'recorder_result_saved', visit_id: id, recording_id: recordingId, actor: 'recorder' })
              bytes = sendJson(req, res, 201, result, cors)
            }
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'recorder-results' &&
        req.method === 'GET'
      ) {
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const visit = await store.getVisit(id)
          if (!visit) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            const results = await store.listRecorderResults(id)
            bytes = sendJson(req, res, 200, { results }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 3 && parts[2] === 'clear' && req.method === 'POST') {
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const workstationId = parseWorkstationId(body?.workstation_id)
          if (workstationId === null) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid workstation_id' }, cors)
          } else {
            const prev = getActiveVisit(workstationId)
            clearActiveVisit(workstationId)
            await safeAudit({ event: 'visit_cleared', visit_id: prev?.visit_id ?? undefined, actor: 'doctor' })
            bytes = sendJson(req, res, 200, { ok: true, workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'current-visit' && parts.length === 2 && req.method === 'GET') {
        // ClinicAI 연결점이자, 다른 원장 workstation의 Doctor 화면이 자기
        // workstation_id의 활성 방문을 폴링하는 경로다. 다른 원장 라우트와
        // 동일한 requireDoctor()+origin allowlist를 쓴다(위 doctorRoute
        // 분기에서 이미 origin 검사를 마쳤다). audit 로그는 남기지 않는다
        // (읽기라서; audit는 상태변경만 기록한다). 응답에 patient_id/
        // visit_id/submission_id/active_since 외 어떤 필드도(성함/전화번호
        // 등) 절대 포함하지 않는다.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const workstationId = parseWorkstationId(url.searchParams.get('workstation_id'))
          if (workstationId === null) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid workstation_id' }, cors)
          } else {
            const active = getActiveVisit(workstationId)
            const body = active
              ? {
                  active: true,
                  workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID,
                  patient_id: active.patient_id,
                  visit_id: active.visit_id,
                  submission_id: active.submission_id,
                  active_since: active.active_since,
                }
              : { active: false, workstation_id: workstationId ?? DEFAULT_WORKSTATION_ID }
            bytes = sendJson(req, res, 200, body, cors)
          }
        }
      } else {
        status = 404
        bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
      }
    } catch (err) {
      status = err.statusCode ?? 500
      // 요청 본문은 절대 로그로 남기지 않는다 — id와 에러 클래스만.
      console.error(`${new Date().toISOString()} error id=${id ?? '-'} err=${err.constructor.name}`)
      bytes = sendJson(req, res, status, { error: status === 413 ? 'payload too large' : status === 400 ? 'bad request' : 'server error' }, cors)
    }

    log(req.method, url.pathname, status, id, bytes)
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'server error' }))
      }
    })
  })

  // 서버 시작 시 1회, 이후 6시간마다 보존기한 지난 제출을 정리한다.
  // unref()로 이 타이머 때문에 프로세스가 살아있지는 않게 하고, 서버가
  // close되면(테스트 등) 타이머도 같이 정리한다.
  runRetention()
  const retentionTimer = setInterval(runRetention, 6 * 60 * 60 * 1000)
  retentionTimer.unref()
  server.on('close', () => clearInterval(retentionTimer))

  return server
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
}

// 병목 6 대응: 상대경로 로그가 "실제로 어느 디스크 경로에 쓰고 있는지"
// 혼동을 일으켰다(운영자가 다른 작업 디렉터리에서 실행하면 같은
// './.data/submissions'가 다른 곳을 가리킨다). 부팅 시 절대경로로 못박고,
// 그 경로들이 실제로 쓰기 가능한지 즉시 확인해 안 되면 fatal로 죽는다 —
// 나중에 첫 요청에서야 조용히 실패하는 것보다 낫다.
async function checkDataDirsWritable(dataDir) {
  const dirs = {
    submissions_dir: path.resolve(dataDir),
    visits_dir: path.resolve(dataDir, '..', 'visits'),
    recorder_results_dir: path.resolve(dataDir, '..', 'recorder-results'),
  }
  for (const [label, dir] of Object.entries(dirs)) {
    const probe = path.join(dir, '.write-probe')
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(probe, '')
      await rm(probe)
    } catch (err) {
      throw new Error(`${label} (${dir}) not writable: ${err.message}`)
    }
  }
  return dirs
}

if (isMain()) {
  const host = process.env.SAMINDANG_HOST ?? '0.0.0.0'
  const port = Number(process.env.SAMINDANG_PORT ?? '4317')
  const dataDir = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'

  const dirs = await checkDataDirsWritable(dataDir).catch((err) => {
    console.error(`fatal: data directory self-check failed — ${err.message}`)
    process.exit(1)
  })

  const server = createApp({ dataDir })
  server.listen(port, host, () => {
    const retentionDays = Number(process.env.SAMINDANG_RETENTION_DAYS ?? '30')
    console.log(`samindang handoff server listening on http://${host}:${port}`)
    console.log(`submissions_dir: ${dirs.submissions_dir}`)
    console.log(`visits_dir: ${dirs.visits_dir}`)
    console.log(`recorder_results_dir: ${dirs.recorder_results_dir}`)
    console.log(`doctor token: ${process.env.SAMINDANG_DOCTOR_TOKEN ? 'set' : 'not set (loopback-only for doctor endpoints)'}`)
    console.log(
      `retention: ${retentionDays > 0 ? `auto-delete submissions older than ${retentionDays}d (every 6h)` : 'disabled (SAMINDANG_RETENTION_DAYS=0)'}`,
    )
  })
}
