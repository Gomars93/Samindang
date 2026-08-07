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
import { createStore } from './store.js'
import { isDoctorRequestAllowed, isOriginAllowedForDoctor } from './auth.js'

const VERSION = '0.1.0'
const MAX_BODY_BYTES = 1024 * 1024 // 1MB

function parseAllowedOrigins(raw) {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function createApp({ dataDir, doctorToken, allowedOrigins, retentionDays } = {}) {
  const store = createStore(dataDir ?? process.env.SAMINDANG_DATA_DIR ?? './.data/submissions')
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

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean) // ['api','submissions',':id',...]
    // 모든 /api/submissions 라우트가 원장용이다 — 예외는 patient POST(생성) 한 건뿐.
    const doctorRoute =
      parts[0] === 'api' && parts[1] === 'submissions' && !(parts.length === 2 && req.method === 'POST')
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
        bytes = sendJson(req, res, 200, { ok: true, version: VERSION }, cors)
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
            bytes = sendJson(req, res, 200, { id: record.id, created_at: record.created_at, duplicate: true }, cors)
          } else {
            status = 201
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
            bytes = sendJson(req, res, 200, record, cors)
          }
        }
      } else {
        status = 404
        bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
      }
    } catch (err) {
      status = err.statusCode ?? 500
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

if (isMain()) {
  const host = process.env.SAMINDANG_HOST ?? '0.0.0.0'
  const port = Number(process.env.SAMINDANG_PORT ?? '4317')
  const dataDir = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'
  const server = createApp({ dataDir })
  server.listen(port, host, () => {
    const retentionDays = Number(process.env.SAMINDANG_RETENTION_DAYS ?? '30')
    console.log(`samindang handoff server listening on http://${host}:${port}`)
    console.log(`data dir: ${dataDir}`)
    console.log(`doctor token: ${process.env.SAMINDANG_DOCTOR_TOKEN ? 'set' : 'not set (loopback-only for doctor endpoints)'}`)
    console.log(
      `retention: ${retentionDays > 0 ? `auto-delete submissions older than ${retentionDays}d (every 6h)` : 'disabled (SAMINDANG_RETENTION_DAYS=0)'}`,
    )
  })
}
