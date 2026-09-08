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
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createStore, StaleWriteError } from './store.js'
import { createAuditLog, AUDIT_EVENTS, AUDIT_ACTORS } from './audit.js'
import { acquireOwnerLock, OwnerLockConflictError, requirePositiveMs, releaseAnyLockNamedThisProcess } from './ownerLock.js'
import { isDoctorRequestAllowed, isOriginAllowedForDoctor } from './auth.js'
import { createCrmStore, CrmConflictError, CrmNotFoundError, CrmOwnershipError, MEDICATION_COURSE_REASON_CODES } from './crmStore.js'
import { createPatientIdentityStore, IdentityConflictError } from './patientIdentityStore.js'
import { createMessagingStore, MessagingConflictError, MessagingNotFoundError } from './messagingStore.js'
import { CARE_PLAN_TEXT_MAX_CHARS } from './followUpSessionStore.js'
import { resolveWebhookSecret, verifyWebhookSignature } from './messagingTransport.js'
import {
  activateVisit,
  clearActiveVisit,
  getActiveVisit,
  isValidWorkstationId,
  DEFAULT_WORKSTATION_ID,
} from './activeVisit.js'

const VERSION = '0.1.0'
const MAX_BODY_BYTES = 1024 * 1024 // 1MB

// 2nd independent closing-review finding (HIGH): a client-minted CRM id
// (episode_id, and anywhere else one reaches crmStore's file-per-id
// lookups verbatim) must never contain '/', '.', or other path-traversal
// characters -- crmStore.js's episodePath()/taskPath()/etc. all do a bare
// path.join(dir, `${id}.json`) with no sanitization of their own. The
// 1st-round fix only guarded the episode CREATE route; POST /api/crm/tasks
// and POST /api/crm/medication-courses also take a caller-supplied
// episode_id and pass it straight into crmStore.getEpisode() before this
// fix, letting the same traversal read arbitrary files under .data/ (and,
// on tasks, persist a task attributed to whatever patient_uuid that file
// happened to contain). One shared regex, applied at every entry point
// that accepts a client-supplied CRM id, instead of one inline literal
// that a future new route can forget to copy.
const SAFE_CRM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function parseAllowedOrigins(raw) {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// Round 4 review fix: decodeURIComponent throws a URIError on a malformed
// percent-encoded sequence (e.g. a lone "%" in the URL path segment). The
// public follow-up-session routes must fail closed on that exactly like any
// other unrecognizable token, not fall through to the generic 500 handler.
function safeDecodeToken(raw) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

// Round 17: reads the optional x-expected-updated-at CAS precondition
// header. Closing-review finding: an EMPTY header value (e.g. a client
// bug sending `''`) previously read as the string `''`, which is `!= null`
// and so was compared against the real updated_at -- guaranteed to never
// match, permanently 409ing every save from that client. Treat empty/
// whitespace-only the same as absent (no precondition), matching how a
// caller that never intended to send one would expect to behave.
function readExpectedUpdatedAt(req) {
  const raw = req.headers['x-expected-updated-at']
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

export function createApp({
  dataDir,
  doctorToken,
  allowedOrigins,
  retentionDays,
  followUpTokenTtlMinutes,
  followUpTokenRetentionHours,
  carePlanLinkTtlMinutes,
  crmClaimLeaseMinutes,
} = {}) {
  const resolvedDataDir = dataDir ?? process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'
  const resolvedFollowUpTtlMinutes =
    followUpTokenTtlMinutes !== undefined
      ? followUpTokenTtlMinutes
      : Number(process.env.SAMINDANG_FOLLOWUP_TOKEN_TTL_MINUTES ?? '30')
  const resolvedFollowUpRetentionHours =
    followUpTokenRetentionHours !== undefined
      ? followUpTokenRetentionHours
      : Number(process.env.SAMINDANG_FOLLOWUP_TOKEN_RETENTION_HOURS ?? '24')
  // 플로우 정렬 4/5: 환자 치료 계획 읽기 전용 링크의 유효기간(기본 14일).
  // 재진 follow-up 토큰(30분)과는 별도 스토어·별도 TTL -- store.js의
  // carePlanLinkTtlMinutes 주석 참고.
  const resolvedCarePlanLinkTtlMinutes =
    carePlanLinkTtlMinutes !== undefined
      ? carePlanLinkTtlMinutes
      : Number(process.env.SAMINDANG_CARE_PLAN_LINK_TTL_MINUTES ?? String(14 * 24 * 60))
  const store = createStore(resolvedDataDir, {
    followUpTokenTtlMinutes: resolvedFollowUpTtlMinutes,
    followUpTokenRetentionHours: resolvedFollowUpRetentionHours,
    carePlanLinkTtlMinutes: resolvedCarePlanLinkTtlMinutes,
  })
  const audit = createAuditLog(resolvedDataDir)
  // CRM v0.3.1 (round 6): a sibling data dir, not nested under submissions/
  // -- Episode/CrmTask are not medical-record submissions and must not be
  // swept by store.cleanupOlderThan's submission-retention logic.
  // claimLeaseMinutes is an operational lock duration (see crmStore.js),
  // not a clinical SLA -- configurable like follow-up-token TTL above.
  const resolvedCrmClaimLeaseMinutes =
    crmClaimLeaseMinutes !== undefined ? crmClaimLeaseMinutes : Number(process.env.SAMINDANG_CRM_CLAIM_LEASE_MINUTES ?? '60')
  const crmStore = createCrmStore(path.join(resolvedDataDir, '..', 'crm'), {
    claimLeaseMinutes: resolvedCrmClaimLeaseMinutes,
  })
  // Round 14: identity linkage lives in its own sibling dir, same reasoning
  // as crm/ above -- not a medical-record submission, not swept by
  // submission retention. See patientIdentityStore.js's header for the
  // scope/safety rules this store enforces.
  const patientIdentityStore = createPatientIdentityStore(path.join(resolvedDataDir, '..', 'crm-identity'))
  // Quick Revisit outbound messaging (BizM is the selected provider,
  // API-credential-free today -- see bizmAdapter.js's
  // resolveBizmProviderState / messagingTransport.js's provider
  // selection). Another sibling data dir, same reasoning as crm/ and
  // crm-identity/ above: a
  // MessageRecord is delivery-operational metadata, not a medical-record
  // submission, and must not be swept by store.js's submission retention.
  const messagingStore = createMessagingStore(path.join(resolvedDataDir, '..', 'messaging'))
  // Privacy guard: this repo's identity-linkage policy is explicit that no
  // full phone number is ever persisted anywhere (see
  // patientIdentityStore.js's header, and coreSpec.ts's ID_02 which only
  // ever collects the last 4 digits from the patient). This system has
  // never been a source of truth for a patient's real phone number -- staff
  // already know it from the clinic's own EMR (Sigma) and type it in
  // explicitly at the moment they trigger a send, the same "a human bridges
  // the gap explicitly" pattern patientIdentityStore.js already uses for
  // chart_no linking. The same reasoning applies to the message TEXT below
  // (it embeds the same one-time follow-up link this system already treats
  // as a live capability, never persisted as plaintext anywhere else) --
  // both are kept ONLY in this process-local, never-disk-written Map,
  // keyed by visit_id (not patient_id: a patient can have more than one
  // revisit in flight, and visit_id is exactly the granularity
  // messagingStore.js's own dedup_key already uses), purely so the
  // automatic retry sweep below can reuse them within this process's
  // lifetime. A restart clears the cache, and any retry due after a
  // restart fails closed (messagingStore.js's runDueRetries already marks
  // it FAILED/recipient_unresolvable) rather than guessing -- staff can
  // always fall back to the manual retry endpoint, which takes both fresh
  // again. Mirrors this codebase's existing tolerance for restart-reset,
  // process-local operational state (see failedPublicAttempts below).
  const messagingContactCache = new Map()
  // Owns the exact wording sent to the patient -- a single source of
  // truth server-side, so the client only ever supplies the raw link URL
  // (which it already builds identically for the copy-link/QR paths, see
  // DoctorView.tsx's patientFollowUpLink) rather than arbitrary free text.
  // No clinical content, no PHI -- purely operational copy.
  function buildRevisitMessageText(link) {
    return `[삼인당한의원] 재진 확인 문진 안내\n아래 링크를 눌러 몇 가지만 답해 주세요.\n${link}`
  }
  // Closing-review finding (MEDIUM): `link` is doctor-authenticated but
  // otherwise arbitrary caller-supplied text that ends up verbatim in a
  // real outbound patient SMS/Alimtalk body -- no privilege escalation
  // (only a doctor-authed request can reach this), but a compromised or
  // buggy client could put unrelated content in a real patient message.
  // The server has no fixed "correct" origin to allowlist against (this
  // SPA is deployed from more than one host -- local LAN, ghpages preview
  // -- see vite.config.ts's `base` comment), so this checks only the one
  // shape every legitimate caller (DoctorView.tsx's patientFollowUpLink)
  // actually produces: an http(s) URL carrying the `#follow-up=` fragment
  // this system's own one-time capability links always use.
  const FOLLOW_UP_LINK_RE = /^https?:\/\/.+#follow-up=.+$/
  function isValidFollowUpLink(link) {
    return typeof link === 'string' && FOLLOW_UP_LINK_RE.test(link)
  }
  // BizM batch: a manual retry only re-supplies {phone, link} (see the
  // /api/messages/:id/retry route below), never the raw token separately --
  // the token is never persisted anywhere this route could re-read it from
  // (messagingStore.js only ever keeps its SHA-256 hash), so it is parsed
  // back out of the ALREADY-VALIDATED link itself (isValidFollowUpLink's
  // own `#follow-up=` contract) purely to rebuild the `variables.
  // followup_token` value SOLAPI's own Alimtalk template substitution still
  // needs (see solapiAdapter.js's live send() -- BizM no longer consumes
  // `variables` at all as of the button1 fix, see bizmAdapter.js's header
  // on why; this route still builds it unconditionally since the active
  // provider is a runtime choice this route doesn't need to branch on).
  // Returns null if link doesn't match, though by the time this is called
  // isValidFollowUpLink has always already confirmed it does.
  function extractFollowUpTokenFromLink(link) {
    const match = typeof link === 'string' ? link.match(/#follow-up=(.+)$/) : null
    return match ? match[1] : null
  }
  function mapMessagingError(err) {
    if (err instanceof MessagingConflictError) return { status: 409, error: err.message }
    if (err instanceof MessagingNotFoundError) return { status: 404, error: 'not found' }
    if (err instanceof Error) return { status: 400, error: err.message }
    return { status: 500, error: 'server error' }
  }
  // Maps a thrown store error to an HTTP status + body. CrmConflictError
  // (stale expectedVersion) is always 409; CrmNotFoundError is always 404;
  // CrmOwnershipError (episode belongs to a different patient than the
  // caller's declared context -- Episode↔Medication association
  // integrity batch) is also 409, the same "resource is real but the
  // write conflicts with stated context" class as CrmConflictError; every
  // other thrown Error is a disallowed-transition refusal from the pure
  // engine itself (e.g. "safety_review_cannot_be_snoozed",
  // "cannot claim task in status DONE") and is reported as 400 with its
  // own message rather than falling through to a generic 500 -- these are
  // expected, well-formed refusals, not server faults.
  function mapCrmError(err) {
    if (err instanceof CrmConflictError) return { status: 409, error: 'conflict' }
    if (err instanceof CrmOwnershipError) return { status: 409, error: err.message }
    if (err instanceof CrmNotFoundError) return { status: 404, error: 'not found' }
    if (err instanceof Error) return { status: 400, error: err.message }
    return { status: 500, error: 'server error' }
  }
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
    if (configuredRetentionDays > 0) {
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
    // Round 3(revisit linkage): follow-up-session token cleanup runs on its
    // OWN, always-on schedule regardless of SAMINDANG_RETENTION_DAYS -- a
    // clinic disabling ordinary medical-record retention must never also
    // silently stop cleaning up spent one-time tokens.
    try {
      const deletedTokens = await store.cleanupFollowUpSessions()
      if (deletedTokens > 0) {
        console.log(`${new Date().toISOString()} retention: purged ${deletedTokens} follow-up-session token(s)`)
      }
    } catch (err) {
      console.error(`${new Date().toISOString()} retention: follow-up-session cleanup failed: ${err.message}`)
    }
  }

  // Quick Revisit: sweeps messages whose backoff window has elapsed and
  // re-attempts them. Runs far more often than runRetention (see the
  // shorter interval at the bottom of this file) because a patient waiting
  // on a revisit link cares about minutes, not the multi-day cadence
  // ordinary submission retention runs on. The resolveContact callback
  // reads only the process-local messagingContactCache (see its
  // declaration above) -- never any persisted store -- so a message due
  // for retry after this process restarted simply has no cached
  // phone/text and is marked FAILED/recipient_unresolvable by
  // messagingStore.js itself, never a crash here.
  async function runMessageRetries() {
    try {
      const count = await messagingStore.runDueRetries(
        async (_patientId, visitId) => messagingContactCache.get(visitId) ?? null,
        // Closing-review finding (MEDIUM): evict a visit_id's cached
        // {phone, text} once its message reaches a status that will never
        // need the cache again (anything other than QUEUED, which is the
        // only status a future automatic retry can still be scheduled
        // from) -- otherwise the cache only ever grows for the life of
        // the process.
        (visitId, status) => {
          if (status !== 'QUEUED') messagingContactCache.delete(visitId)
        },
      )
      if (count > 0) {
        console.log(`${new Date().toISOString()} messaging: swept ${count} due retry attempt(s)`)
      }
    } catch (err) {
      console.error(`${new Date().toISOString()} messaging: retry sweep failed: ${err.message}`)
    }
  }

  function corsHeaders(req, { doctorRoute }) {
    const origin = req.headers.origin
    const headers = {
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      // x-station-credential (round 8) is the clinic tablet's own device
      // header. It must be listed here or the browser's preflight blocks
      // the station's poll outright -- found by real headless-browser QA,
      // which the HTTP-level tests could not catch (node's fetch does not
      // preflight). Listing it is not itself a privilege: the station
      // routes still verify the credential against its stored hash, and
      // the doctor routes ignore this header entirely.
      // x-expected-updated-at (round 17) is the optional CAS precondition
      // header for the workspace/judgment save routes -- same reasoning as
      // x-station-credential above: unlisted, the browser's preflight
      // silently strips it before the request goes out, and the
      // conflict-detection this header exists for would just never fire
      // from a real browser client. Not itself a privilege -- the doctor
      // routes still require x-doctor-token/loopback as before.
      'access-control-allow-headers': 'content-type,x-doctor-token,x-station-credential,x-expected-updated-at,x-solapi-signature',
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

  // Same size-capped chunk-reading as readBody above, but returns the raw
  // Buffer without JSON-parsing it -- needed only by the webhook route,
  // whose signature is computed over the exact bytes received, before any
  // parsing happens (see solapiAdapter.js's verifyWebhookSignature).
  function readRawBody(req) {
    return new Promise((resolve, reject) => {
      let total = 0
      const chunks = []
      let rejected = false
      req.on('data', (chunk) => {
        if (rejected) return
        total += chunk.length
        if (total > MAX_BODY_BYTES) {
          rejected = true
          reject(Object.assign(new Error('payload too large'), { statusCode: 413 }))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (rejected) return
        resolve(Buffer.concat(chunks))
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

  // Round 3(revisit linkage): minimal in-memory rate limit on FAILED public
  // follow-up-session token attempts only (a resolvable ACTIVE token being
  // polled/submitted normally never counts against this) -- no new
  // dependency, resets on process restart, per-process only (matches this
  // server's existing "single process owns this data dir" assumption --
  // enforced since round 17 by server/ownerLock.js, see server/store.js's
  // withLock comment). A restart-reset counter is intentional here (this
  // is UX friction against casual probing, not a security boundary that
  // needs to survive restart) and unaffected by the owner lock either way.
  // The 256-bit token space already makes brute force computationally
  // infeasible; this is defense-in-depth against casual guessing/scripted
  // probing, not the primary control.
  const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000
  const FAILED_ATTEMPT_MAX = 20
  const failedPublicAttempts = new Map()
  function checkPublicRateLimit(ip) {
    const entry = failedPublicAttempts.get(ip)
    if (!entry) return true
    if (Date.now() - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) {
      failedPublicAttempts.delete(ip)
      return true
    }
    return entry.count < FAILED_ATTEMPT_MAX
  }
  function noteFailedPublicAttempt(ip) {
    const entry = failedPublicAttempts.get(ip)
    if (!entry || Date.now() - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) {
      failedPublicAttempts.set(ip, { count: 1, windowStart: Date.now() })
    } else {
      entry.count += 1
    }
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
    // Round 3 Phase C(longitudinal linkage): GET /api/patients/:id/history is
    // doctor-only exactly like every route above -- must share the same
    // Origin-allowlist defense-in-depth layer, not just requireDoctor()'s
    // IP+token check inside the handler.
    const isPatientHistoryRoute =
      parts[1] === 'patients' && parts.length === 4 && parts[3] === 'history' && req.method === 'GET'
    // Round 3(revisit linkage): POST /api/patients/:patientId/start-revisit
    // is doctor-only exactly like every route above. The public
    // /api/follow-up-session/:token routes below are deliberately NOT
    // included here -- those are the patient tablet's own narrow endpoints
    // and must stay reachable without a doctor token/Origin allowlist,
    // same posture as the existing patient POST /api/submissions.
    const isPatientRevisitRoute =
      parts[1] === 'patients' && parts.length === 4 && parts[3] === 'start-revisit' && req.method === 'POST'
    const isRevisitsQueueRoute = parts[1] === 'visits' && parts.length === 3 && parts[2] === 'revisits' && req.method === 'GET'
    // Round 8: /api/stations/* are STAFF routes (register a tablet, list
    // tablets, assign a patient to one, reset one) and carry the same
    // doctor guard as every other staff route. Deliberately NOT included
    // here: the singular /api/station/* routes below, which are the
    // TABLET's own two narrow endpoints authenticated by its device
    // credential -- same posture as the public follow-up-session routes.
    const isStationsAdminRoute = parts[1] === 'stations'
    // Round 6 (CRM v0.3.1 persistence): /api/crm/* is doctor-only like
    // every other administrative route above -- no separate public path,
    // no UI yet (deliberately, this round).
    const isCrmRoute = parts[1] === 'crm'
    // Quick Revisit messaging: GET/POST /api/visits/:id/messages is already
    // covered by isVisitsRoute above (parts[1] === 'visits', no length
    // restriction). /api/messages/:id/retry and /api/messages/:id/cancel
    // are doctor-only staff actions. /api/messages/webhook is deliberately
    // EXCLUDED -- that is the provider's own delivery-status callback and
    // must stay reachable without a doctor token/Origin allowlist, same
    // posture as the public follow-up-session/station routes (keyed by an
    // unguessable provider_message_id instead of a capability token --
    // see messagingStore.js's handleDeliveryWebhook doc comment on why an
    // unknown id is a safe no-op rather than an error).
    const isMessagesAdminRoute =
      parts[1] === 'messages' && parts.length === 4 && (parts[3] === 'retry' || parts[3] === 'cancel') && req.method === 'POST'
    const doctorRoute =
      parts[0] === 'api' &&
      (isSubmissionsRoute ||
        isVisitsRoute ||
        isCurrentVisitClear ||
        isCurrentVisitRead ||
        isPatientHistoryRoute ||
        isPatientRevisitRoute ||
        isRevisitsQueueRoute ||
        isStationsAdminRoute ||
        isCrmRoute ||
        isMessagesAdminRoute)
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
            await safeAudit({ event: AUDIT_EVENTS.SUBMISSION_DUPLICATE, submission_id: record.id, actor: AUDIT_ACTORS.PATIENT })
            bytes = sendJson(req, res, 200, { id: record.id, created_at: record.created_at, duplicate: true }, cors)
          } else {
            status = 201
            await safeAudit({ event: AUDIT_EVENTS.SUBMISSION_CREATED, submission_id: record.id, actor: AUDIT_ACTORS.PATIENT })
            // 진짜 새 제출일 때만 새 방문이 만들어진다(store.createSubmission
            // 참고) — 멱등 중복 경로는 여기 안 온다.
            await safeAudit({
              event: AUDIT_EVENTS.VISIT_CREATED,
              submission_id: record.id,
              visit_id: record.visit_id,
              actor: AUDIT_ACTORS.PATIENT,
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
            await safeAudit({ event: AUDIT_EVENTS.SUBMISSION_VIEWED, submission_id: id, actor: AUDIT_ACTORS.DOCTOR })
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
            await safeAudit({ event: AUDIT_EVENTS.STATUS_CHANGED, submission_id: id, status: record.status, actor: AUDIT_ACTORS.DOCTOR })
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
          // Round 17: optional CAS precondition -- absent, unconditional
          // last-write-wins exactly as before. See store.js's saveJudgment
          // doc comment.
          const expectedUpdatedAt = readExpectedUpdatedAt(req)
          try {
            const record = await store.saveJudgment(id, body, { expectedUpdatedAt })
            if (!record) {
              status = 404
              bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
            } else {
              await safeAudit({ event: AUDIT_EVENTS.JUDGMENT_SAVED, submission_id: id, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, 200, record, cors)
            }
          } catch (err) {
            if (!(err instanceof StaleWriteError)) throw err
            // Server-authoritative state wins after a conflict: hand back
            // the CURRENT record so the client can re-read/merge without a
            // second round trip.
            status = 409
            bytes = sendJson(req, res, 409, { error: 'conflict', current: err.current }, cors)
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
          // Round 17: optional CAS precondition, same contract as the
          // judgment route above.
          const expectedUpdatedAt = readExpectedUpdatedAt(req)
          try {
            const record = await store.saveWorkspace(id, body, { expectedUpdatedAt })
            if (!record) {
              status = 404
              bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
            } else {
              await safeAudit({ event: AUDIT_EVENTS.WORKSPACE_SAVED, submission_id: id, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, 200, record, cors)
            }
          } catch (err) {
            if (!(err instanceof StaleWriteError)) throw err
            status = 409
            bytes = sendJson(req, res, 409, { error: 'conflict', current: err.current }, cors)
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
            await safeAudit({ event: AUDIT_EVENTS.VISIT_CREATED, visit_id: visit.id, actor: AUDIT_ACTORS.DOCTOR })
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
      } else if (parts[0] === 'api' && isRevisitsQueueRoute) {
        // Round 3(revisit linkage): "Doctor Queue" list of no-submission
        // revisit visits, enriched with an operational Micro Follow-up
        // status. Deliberately a SEPARATE route from GET /api/submissions --
        // never mixed into that response shape/contract (existing tests
        // pin its exact fields). Checked before the generic GET
        // /api/visits/:id handler below (same parts.length) so "revisits"
        // is never misread as a visit id.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const list = await store.listRevisitQueue()
          bytes = sendJson(req, res, 200, list, cors)
        }
      } else if (parts[0] === 'api' && isPatientRevisitRoute) {
        // Round 3(revisit linkage): "재진 간단 문진 시작" -- the single
        // doctor/staff action that creates a NEW visit for an EXISTING
        // patient_id and issues a one-time Micro Follow-up token in one
        // step. Same "must already be a real patient_id" guard as the
        // existing POST /api/visits route above (never auto-creates a
        // patient).
        const patientId = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else if (!(await store.visitExistsForPatient(patientId))) {
          status = 400
          bytes = sendJson(req, res, 400, { error: 'unknown patient_id' }, cors)
        } else {
          // Round 8: delivery_mode is optional operational metadata; an
          // absent or unrecognized value normalizes to null in the store
          // and changes nothing about the session that gets issued.
          const revisitBody = await readBody(req).catch(() => null)
          const { visit, token, session, reused, created } = await store.startRevisit(patientId, revisitBody?.delivery_mode)
          status = 201
          // Audit registry batch: startRevisit's own dedup (a repeated
          // same-patient/same-mode start within the fresh window) replays
          // an EARLIER call's already-created visit/session rather than
          // making a new one -- auditing here unconditionally would write
          // a second visit_created/follow_up_session_issued line for one
          // real visit every time an operator double-clicks the start
          // button. `reused`/`created` are the store's own authoritative
          // signals (see store.js's startRevisit comment).
          //
          // Round 17: `reused` and `created` are independent -- a durable
          // restart-recovery reissue onto a pre-existing pending visit has
          // `created: false` (no new visit) but `reused: false` (a
          // genuinely new token WAS just minted), and must still be
          // audited as follow_up_session_issued even though visit_created
          // must not fire again for that visit.
          if (created) {
            await safeAudit({ event: AUDIT_EVENTS.VISIT_CREATED, visit_id: visit.id, actor: AUDIT_ACTORS.DOCTOR })
          }
          if (!reused) {
            await safeAudit({ event: AUDIT_EVENTS.FOLLOW_UP_SESSION_ISSUED, visit_id: visit.id, actor: AUDIT_ACTORS.DOCTOR })
          }
          bytes = sendJson(
            req,
            res,
            201,
            {
              visit,
              token,
              expires_at: session.expires_at,
              targets: session.targets,
              delivery_mode: session.delivery_mode,
            },
            cors,
          )
        }
      } else if (parts[0] === 'api' && parts[1] === 'visits' && parts.length === 4 && parts[3] === 'messages' && req.method === 'POST') {
        // Quick Revisit 발송: 이미 발급된 follow-up 링크를 BizM(카카오 알림톡,
        // SAMINDANG_FOLLOWUP_01 템플릿)으로 환자에게 전달한다. phone은 staff/doctor가 지금 막
        // Sigma 등 기존 EMR에서 직접 확인해 입력한 값 -- 이 서버는 전화번호를
        // 저장/조회하는 소스가 아니다(위 messagingContactCache 선언부 주석,
        // patientIdentityStore.js 헤더 참고). visit_id/patient_id/token/link은
        // start-revisit(위)가 방금 돌려준 값을 그대로 넘기는 것이 정상 흐름.
        const visitId = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const patientId = typeof body?.patient_id === 'string' ? body.patient_id : ''
          const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
          const followUpToken = typeof body?.follow_up_token === 'string' ? body.follow_up_token : ''
          const link = typeof body?.link === 'string' ? body.link.trim() : ''
          const primaryChannel = body?.channel === 'SMS' || body?.channel === 'LMS' ? body.channel : 'KAKAO_ALIMTALK'
          const visitRecord = await store.getVisit(visitId)
          if (!patientId || !phone || !followUpToken || !link) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'patient_id, phone, follow_up_token, link are all required' }, cors)
          } else if (!isValidFollowUpLink(link)) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'link must be a valid follow-up capability URL' }, cors)
          } else if (extractFollowUpTokenFromLink(link) !== followUpToken) {
            // 2nd independent-review finding (MEDIUM): follow_up_token and
            // link were accepted as two independent body fields -- the check
            // below only ever proved follow_up_token belongs to visitId, not
            // that link (the value BizM's button1 actually delivers, see
            // bizmAdapter.js) carries that SAME token. A stale/mismatched
            // link would pass every check that existed before this one and
            // still get embedded in button1, silently delivering a different
            // visit's live capability URL to this visit's patient. Requiring
            // exact equality here, before the visitId check, means the
            // visitId check below now transitively also proves link is
            // correct for this visit -- mirrors the retry route's own
            // extractFollowUpTokenFromLink(link)-derived check above.
            status = 400
            bytes = sendJson(req, res, 400, { error: 'link does not carry the same follow_up_token' }, cors)
          } else if (!(await store.visitExistsForPatient(patientId))) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown patient_id' }, cors)
          } else if (!visitRecord || visitRecord.patient_id !== patientId) {
            // Closing-review finding (MEDIUM): visitExistsForPatient above
            // only proves patient_id has SOME visit, not that THIS visit_id
            // belongs to it -- a mismatched pair would corrupt the audit
            // trail and the contact cache's visit_id keying below.
            status = 400
            bytes = sendJson(req, res, 400, { error: 'visit_id does not belong to patient_id' }, cors)
          } else if ((await store.resolveFollowUpSession(followUpToken))?.visit_id !== visitId) {
            // BizM-batch independent-review finding (MEDIUM): the actual
            // capability delivered to the patient is derived from
            // `follow_up_token`/`link` (BizM's button1 URL, see
            // bizmAdapter.js's header), not just this route's own
            // `isValidFollowUpLink(link)` SHAPE check -- until now this
            // route never verified `follow_up_token` is the SAME capability
            // actually issued for THIS visit_id. A caller (buggy client,
            // stale UI state, or a doctor pasting the wrong session's token)
            // could deliver visit B's live follow-up link to visit A's
            // patient while the stored MessageRecord's follow_up_token_hash
            // still (correctly) hashes the token actually sent, silently
            // mismatching what a later audit would expect for visit A.
            // store.resolveFollowUpSession is the same read-only lookup the
            // public GET /api/follow-up-session/:token route already uses
            // (never mutates/consumes the token) -- fail closed if the
            // token doesn't resolve at all, or resolves to a different
            // visit_id.
            status = 400
            bytes = sendJson(req, res, 400, { error: 'follow_up_token does not belong to this visit' }, cors)
          } else {
            const text = buildRevisitMessageText(link)
            const variables = { followup_token: followUpToken }
            try {
              // Message-integrity-batch finding (HIGH, owner-flagged): this
              // used to call messagingContactCache.set(visitId, ...) BEFORE
              // queueRevisitMessage, unconditionally -- so a dedup replay
              // whose follow_up_token/link did NOT match the already-queued
              // MessageRecord still silently overwrote the transient retry
              // cache with the new (mismatched) contact tuple, even though
              // messagingStore.js now rejects that exact case with
              // MessagingConflictError. The cache write is now deferred
              // until AFTER queueRevisitMessage has decided this request is
              // authoritative (a genuine new queue, or an idempotent
              // replay for the SAME capability) -- on a thrown
              // MessagingConflictError (caught below), the cache is left
              // completely untouched, so a subsequent automatic retry (see
              // runDueRetries) still uses whatever contact tuple was
              // cached for the ORIGINAL, still-durable record.
              const { record, deduped } = await messagingStore.queueRevisitMessage({
                visitId,
                patientId,
                phone,
                followUpToken,
                text,
                variables,
                link,
                primaryChannel,
              })
              messagingContactCache.set(visitId, { phone, text, variables, link })
              status = deduped ? 200 : 201
              if (!deduped) {
                await safeAudit({ event: AUDIT_EVENTS.MESSAGE_QUEUED, visit_id: visitId, actor: AUDIT_ACTORS.DOCTOR })
              }
              // provider_message_id/error_code are safe (never echo phone,
              // link, or provider raw response) -- see messagingStore.js's
              // own field docs. Never returns the phone number or link back
              // to the client; the caller already has both (they just typed
              // the phone in, and already built the link themselves).
              if (record.status !== 'QUEUED') messagingContactCache.delete(visitId)
              bytes = sendJson(req, res, status, record, cors)
            } catch (err) {
              const mapped = mapMessagingError(err)
              status = mapped.status
              bytes = sendJson(req, res, mapped.status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'visits' && parts.length === 4 && parts[3] === 'messages' && req.method === 'GET') {
        // Doctor-facing delivery-state list for a visit's Quick Revisit
        // sends -- never includes a phone number (messagingStore.js never
        // persists one).
        const visitId = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          bytes = sendJson(req, res, 200, { messages: await messagingStore.listMessagesForVisit(visitId) }, cors)
        }
      } else if (parts[0] === 'api' && parts[1] === 'messages' && parts.length === 4 && parts[3] === 'retry' && req.method === 'POST') {
        // Doctor-triggered manual retry of a FAILED (or still-QUEUED but not
        // yet due) message -- phone AND link must both be supplied again,
        // same reasoning as queueRevisitMessage above (neither is
        // persisted; staff re-confirms the phone from the EMR, and the
        // link is still visible in the same open DoctorView session).
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
          const link = typeof body?.link === 'string' ? body.link.trim() : ''
          if (!phone || !link) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'phone and link are both required' }, cors)
          } else if (!isValidFollowUpLink(link)) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'link must be a valid follow-up capability URL' }, cors)
          } else {
            try {
              const text = buildRevisitMessageText(link)
              const variables = { followup_token: extractFollowUpTokenFromLink(link) }
              const existing = await messagingStore.getMessage(id)
              // BizM-batch independent-review finding (MEDIUM): same
              // visit-binding check as the queue route above, applied here
              // to the re-supplied `link` on a manual retry -- a
              // re-supplied token for a DIFFERENT visit than this message
              // record's own visit_id must never be accepted (existing is
              // null here is a genuine not-found, left to retryMessage's
              // own MessagingNotFoundError below rather than duplicated).
              if (existing && (await store.resolveFollowUpSession(variables.followup_token))?.visit_id !== existing.visit_id) {
                throw new Error('follow_up_token does not belong to this message\'s visit')
              }
              // Closing-review finding (LOW): the cache write used to run
              // BEFORE retryMessage(), the same ordering the queue route
              // itself was fixed away from earlier in this batch -- an
              // automatic-retry sweep interleaving between this line and
              // retryMessage()'s own lock could send using this
              // freshly-cached tuple while retryMessage then hit a
              // terminal/max-attempts guard and never updated
              // follow_up_token_hash to match, leaving the durable record
              // pointing at a different token than what the sweep actually
              // sent. Deferring the cache write until AFTER retryMessage
              // succeeds closes the same window the queue route already
              // closes, for the same reason.
              // Message-integrity-batch finding (MEDIUM, independent
              // review): pass the re-derived token through so
              // retryMessage/attemptSend can keep the durable record's
              // follow_up_token_hash honest about whatever capability THIS
              // retry actually sends -- see messagingStore.js's attemptSend
              // for why this only matters on the manual-retry path.
              const record = await messagingStore.retryMessage(id, { phone, text, variables, link, followUpToken: variables.followup_token })
              if (existing) messagingContactCache.set(existing.visit_id, { phone, text, variables, link })
              await safeAudit({ event: AUDIT_EVENTS.MESSAGE_RETRIED, visit_id: record.visit_id, actor: AUDIT_ACTORS.DOCTOR })
              if (record.status !== 'QUEUED') messagingContactCache.delete(record.visit_id)
              bytes = sendJson(req, res, 200, record, cors)
            } catch (err) {
              const mapped = mapMessagingError(err)
              status = mapped.status
              bytes = sendJson(req, res, mapped.status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'messages' && parts.length === 4 && parts[3] === 'cancel' && req.method === 'POST') {
        // Doctor-triggered cancel of a still-QUEUED, never-attempted message
        // (e.g. the patient called back before the first automatic send).
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          try {
            const record = await messagingStore.cancelMessage(id)
            await safeAudit({ event: AUDIT_EVENTS.MESSAGE_CANCELLED, visit_id: record.visit_id, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(req, res, 200, record, cors)
          } catch (err) {
            const mapped = mapMessagingError(err)
            status = mapped.status
            bytes = sendJson(req, res, mapped.status, { error: mapped.error }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'messages' && parts.length === 3 && parts[2] === 'webhook' && req.method === 'POST') {
        // Provider delivery-status callback. Deliberately public/unguarded
        // by doctor-token+Origin (see isMessagesAdminRoute's doc comment
        // above) -- but NOT unauthenticated: an unguessable
        // provider_message_id is an identifier, not a secret (closing-
        // review finding, HIGH SECURITY -- it can leak through provider
        // dashboards/logs/UI), so every request must additionally carry a
        // valid HMAC-SHA256 signature over the raw body (see
        // solapiAdapter.js's verifyWebhookSignature/resolveWebhookSecret).
        // This fails closed even with no real SOLAPI_WEBHOOK_SECRET
        // configured (the actual state of this deployment today) --
        // resolveWebhookSecret falls back to a fixed mock secret rather
        // than skipping verification, so a request with no/wrong signature
        // is rejected in every environment, never just in "production".
        // The exact live SOLAPI webhook signature scheme itself remains
        // EXTERNAL CREDENTIAL PENDING (unverified against real docs/an
        // account) -- see solapiAdapter.js's header. Once past signature
        // verification, an unmatched provider_message_id is still always a
        // 200 no-op, never an error -- see handleDeliveryWebhook's own doc
        // comment (a stale/replayed/foreign-account callback can still be
        // validly signed and simply reference a message this deployment
        // never sent).
        const rawBody = await readRawBody(req).catch(() => null)
        const signatureHeader = req.headers['x-solapi-signature']
        const secret = resolveWebhookSecret()
        if (rawBody === null || !verifyWebhookSignature(rawBody, typeof signatureHeader === 'string' ? signatureHeader : '', secret)) {
          status = 401
          bytes = sendJson(req, res, 401, { error: 'invalid signature' }, cors)
        } else {
          let body
          try {
            body = rawBody.length === 0 ? undefined : JSON.parse(rawBody.toString('utf8'))
          } catch {
            body = null
          }
          const providerMessageId = typeof body?.provider_message_id === 'string' ? body.provider_message_id : ''
          if (!providerMessageId) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'provider_message_id is required' }, cors)
          } else {
            const result = await messagingStore.handleDeliveryWebhook({
              providerMessageId,
              delivered: body?.delivered === true,
              errorCode: typeof body?.error_code === 'string' ? body.error_code : null,
            })
            bytes = sendJson(req, res, 200, { ok: result.ok }, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'patients' &&
        parts.length === 4 &&
        parts[3] === 'history' &&
        req.method === 'GET'
      ) {
        // Round 3 Phase C(longitudinal linkage): exact patient_id match
        // only (from the URL path, already-existing explicit id -- never
        // derived from name/phone/DOB). Doctor-only, same guard as every
        // other read route here.
        const patientId = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const excludeVisitId = url.searchParams.get('excludeVisitId') ?? undefined
          const history = await store.getPatientHistory(patientId, excludeVisitId)
          bytes = sendJson(req, res, 200, history, cors)
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
                event: AUDIT_EVENTS.VISIT_ACTIVATED,
                visit_id: active.visit_id,
                submission_id: active.submission_id ?? undefined,
                actor: AUDIT_ACTORS.DOCTOR,
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
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'workspace' &&
        req.method === 'PUT'
      ) {
        // Round 3 (revisit linkage): visit-owned WorkspaceState for a
        // no-questionnaire revisit -- distinct from PUT /api/submissions/:id/workspace
        // above. Doctor-guarded, same shape/lock pattern.
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          // Round 17: optional CAS precondition, same contract as the
          // submission judgment/workspace routes above.
          const expectedUpdatedAt = readExpectedUpdatedAt(req)
          const result = await store.saveVisitWorkspace(id, body, { expectedUpdatedAt })
          if (!result.ok && result.reason === 'not_found') {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else if (!result.ok && result.reason === 'submission_backed') {
            // Single-source-of-truth guard: a submission-backed visit's
            // workspace must only ever be written through
            // PUT /api/submissions/:id/workspace -- see visitStore.js's
            // saveVisitWorkspace doc comment.
            status = 409
            bytes = sendJson(
              req,
              res,
              409,
              { error: 'submission-backed visit; use PUT /api/submissions/:id/workspace instead' },
              cors,
            )
          } else if (!result.ok && result.reason === 'conflict') {
            // Server-authoritative state wins after a conflict: hand back
            // the CURRENT record so the client can re-read/merge without a
            // second round trip.
            status = 409
            bytes = sendJson(req, res, 409, { error: 'conflict', current: result.current }, cors)
          } else {
            await safeAudit({ event: AUDIT_EVENTS.VISIT_WORKSPACE_SAVED, visit_id: id, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(req, res, 200, result.record, cors)
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
              // Audit registry batch: recording_id was previously passed here
              // but logEvent()'s destructuring silently discards any key
              // outside its fixed 6 -- dropped, not because it leaked, but
              // because writing it would have contradicted the documented
              // minimal-fields contract. actor 'recorder' is now a
              // registered AUDIT_ACTORS value (was previously invalid,
              // which meant this call always threw and was always
              // silently swallowed by safeAudit -- this event has never
              // actually been written to audit.log until this fix).
              await safeAudit({ event: AUDIT_EVENTS.RECORDER_RESULT_SAVED, visit_id: id, actor: AUDIT_ACTORS.RECORDER })
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
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'micro-follow-up' &&
        req.method === 'POST'
      ) {
        // Round 3 Phase D(micro follow-up). Doctor-guarded like every other
        // route here, including the Recorder's own POST above -- see
        // microFollowUp.ts's OPERATIONAL INTEGRATION REQUIRED note for why
        // this is not yet reachable directly from the patient tablet.
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
            const targetRatings = Array.isArray(body?.targetRatings)
              ? body.targetRatings
                  .filter((t) => t && typeof t === 'object')
                  .map((t) => ({
                    targetId: typeof t.targetId === 'string' ? t.targetId : '',
                    label: typeof t.label === 'string' ? t.label : '',
                    patientReportedValue: typeof t.patientReportedValue === 'string' ? t.patientReportedValue : '',
                  }))
              : []
            const result = await store.saveMicroFollowUpResponse({
              visit_id: id,
              patient_id: visit.patient_id,
              targetRatings,
              overallChange: typeof body?.overallChange === 'string' ? body.overallChange : '',
              newSymptomReported: Boolean(body?.newSymptomReported),
              newSymptomNote: typeof body?.newSymptomNote === 'string' ? body.newSymptomNote : '',
              adverseEffectReported: Boolean(body?.adverseEffectReported),
              adverseEffectNote: typeof body?.adverseEffectNote === 'string' ? body.adverseEffectNote : '',
              // Round 8: this is the DOCTOR/staff-guarded save path, so a
              // caller here has already proven staff authority and may
              // legitimately declare STAFF_ASSISTED (a staff member read
              // the questions aloud and typed the patient's own answers).
              // The store normalizes anything unrecognized to PATIENT_SELF,
              // and the PUBLIC patient path hardcodes PATIENT_SELF -- so
              // staff attribution can only ever originate from an
              // authenticated staff request, never from a patient device.
              inputProvenance: body?.inputProvenance,
            })
            status = 201
            await safeAudit({ event: AUDIT_EVENTS.MICRO_FOLLOW_UP_SAVED, visit_id: id, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(req, res, 201, result, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'micro-follow-up' &&
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
            const result = await store.getMicroFollowUpResponse(id)
            bytes = sendJson(req, res, 200, { response: result }, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'submissions' &&
        parts.length === 4 &&
        parts[3] === 'care-plan-link' &&
        req.method === 'POST'
      ) {
        // 플로우 정렬 4/5 (환자 치료 계획 링크): the doctor turns the
        // patient-facing care-plan text they are looking at (the preview
        // card's exact text, sent in the body) into a READ-ONLY capability
        // link the patient can open on their own phone for 14 days. The
        // text is snapshotted server-side at issuance; the raw token is
        // returned exactly once (same rule as start-revisit/reissue). No
        // clinical data other than that approved text is ever reachable
        // through the resulting public route. Issuing again for the same
        // submission invalidates the previous link (one active link per
        // submission -- the token store's own invariant).
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const carePlanText = typeof body?.care_plan_text === 'string' ? body.care_plan_text.trim() : ''
          if (!carePlanText) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'care_plan_text is required' }, cors)
          } else if (carePlanText.length > CARE_PLAN_TEXT_MAX_CHARS) {
            status = 400
            bytes = sendJson(req, res, 400, { error: `care_plan_text exceeds ${CARE_PLAN_TEXT_MAX_CHARS} characters` }, cors)
          } else {
            const result = await store.issueCarePlanLink(id, carePlanText)
            if (!result) {
              status = 404
              bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
            } else {
              status = 201
              await safeAudit({ event: AUDIT_EVENTS.CARE_PLAN_LINK_ISSUED, submission_id: id, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, 201, { token: result.token, expires_at: result.session.expires_at }, cors)
            }
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 4 &&
        parts[3] === 'follow-up-session' &&
        req.method === 'GET'
      ) {
        // Round 3(revisit linkage): doctor-side status read (expiry/state)
        // for the current Micro Follow-up token on this visit -- NEVER
        // returns the raw token (impossible; only its hash is stored). Used
        // to render "만료까지 N분" / decide whether "재발급" is needed.
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
            const session = await store.getFollowUpSessionStatus(id)
            bytes = sendJson(
              req,
              res,
              200,
              {
                session: session
                  ? { status: session.status, issued_at: session.issued_at, expires_at: session.expires_at, targets: session.targets }
                  : null,
              },
              cors,
            )
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 5 &&
        parts[3] === 'follow-up-session' &&
        parts[4] === 'reissue' &&
        req.method === 'POST'
      ) {
        // Round 3(revisit linkage): "재발급" -- fresh candidates re-derived
        // from the patient's own prior visit, brand-new token. The
        // previously active token for this visit is invalidated as part of
        // store.reissueFollowUpSession -> followUpSessions.issueToken.
        id = parts[2]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const result = await store.reissueFollowUpSession(id)
          if (!result) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            await safeAudit({ event: AUDIT_EVENTS.FOLLOW_UP_SESSION_REISSUED, visit_id: id, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(
              req,
              res,
              200,
              { token: result.token, expires_at: result.session.expires_at, targets: result.session.targets },
              cors,
            )
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'visits' &&
        parts.length === 5 &&
        parts[3] === 'follow-up-session' &&
        parts[4] === 'invalidate' &&
        req.method === 'POST'
      ) {
        // Round 3(revisit linkage): "무효화" -- the doctor decides the
        // current patient link should stop working (e.g. sent to the wrong
        // device). No new token is issued.
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
            await store.invalidateFollowUpSession(id)
            await safeAudit({ event: AUDIT_EVENTS.FOLLOW_UP_SESSION_INVALIDATED, visit_id: id, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(req, res, 200, { ok: true }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'care-plan' && parts.length === 3 && req.method === 'GET') {
        // 플로우 정렬 4/5: PUBLIC read-only care-plan page for the patient's
        // own phone -- same posture as GET /api/follow-up-session/:token
        // (no requireDoctor, no doctor Origin allowlist, format-validated
        // token, shared failed-attempt rate limit). The response carries
        // ONLY the approved patient-facing text snapshotted at issuance and
        // the expiry -- never patient_id/submission id/name/clinician notes.
        // There is deliberately NO POST counterpart: a care-plan link
        // accepts nothing from the patient (see followUpSessionStore.js's
        // CARE_PLAN refusal in consumeTokenWithAction).
        const rawToken = safeDecodeToken(parts[2])
        if (rawToken === null) {
          noteFailedPublicAttempt(remoteAddress(req))
          status = 404
          bytes = sendJson(req, res, 404, { status: 'INVALID' }, cors)
        } else if (!checkPublicRateLimit(remoteAddress(req))) {
          status = 429
          bytes = sendJson(req, res, 429, { error: 'too many attempts' }, cors)
        } else {
          const session = await store.resolveCarePlanLink(rawToken)
          if (!session || session.kind !== 'CARE_PLAN') {
            noteFailedPublicAttempt(remoteAddress(req))
            status = 404
            bytes = sendJson(req, res, 404, { status: 'INVALID' }, cors)
          } else if (session.status !== 'ACTIVE') {
            bytes = sendJson(req, res, 200, { status: session.status }, cors)
          } else if (new Date(session.expires_at).getTime() < Date.now()) {
            bytes = sendJson(req, res, 200, { status: 'EXPIRED' }, cors)
          } else {
            await store.markCarePlanLinkStarted(rawToken)
            bytes = sendJson(
              req,
              res,
              200,
              { status: 'ACTIVE', care_plan_text: session.care_plan_text ?? '', expires_at: session.expires_at },
              cors,
            )
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'follow-up-session' &&
        parts.length === 3 &&
        req.method === 'GET'
      ) {
        // Round 3(revisit linkage): PUBLIC patient-tablet endpoint -- no
        // requireDoctor, no doctor Origin allowlist (this is the patient's
        // own device, same CORS posture as POST /api/submissions above).
        // Absolutely no patient_id/name/phone/DOB/prior assessment/Myungri/
        // clinician notes in this response -- only what the token was
        // explicitly issued to show.
        //
        // Round 4 review fix: a malformed percent-encoding in the URL
        // (e.g. a lone "%" not followed by two hex digits) makes
        // decodeURIComponent throw a URIError -- treat that exactly like
        // any other unrecognizable token (INVALID) instead of letting it
        // fall through to the generic catch-all 500.
        const rawToken = safeDecodeToken(parts[2])
        if (rawToken === null) {
          noteFailedPublicAttempt(remoteAddress(req))
          status = 404
          bytes = sendJson(req, res, 404, { status: 'INVALID' }, cors)
        } else if (!checkPublicRateLimit(remoteAddress(req))) {
          status = 429
          bytes = sendJson(req, res, 429, { error: 'too many attempts' }, cors)
        } else {
          const session = await store.resolveFollowUpSession(rawToken)
          if (!session) {
            noteFailedPublicAttempt(remoteAddress(req))
            status = 404
            bytes = sendJson(req, res, 404, { status: 'INVALID' }, cors)
          } else if (session.status !== 'ACTIVE') {
            bytes = sendJson(req, res, 200, { status: session.status }, cors)
          } else if (new Date(session.expires_at).getTime() < Date.now()) {
            bytes = sendJson(req, res, 200, { status: 'EXPIRED' }, cors)
          } else {
            // Round 8: record the first time the patient/station actually
            // opened these questions. Best-effort and idempotent inside the
            // store -- it must never affect this read's own outcome.
            await store.markFollowUpSessionStarted(rawToken)
            // 플로우 정렬 5/5: detail_question_ids is ALWAYS present (empty
            // when no detail check is due) -- ids only, never question
            // text or the plan that made them due.
            bytes = sendJson(
              req,
              res,
              200,
              {
                status: 'ACTIVE',
                targets: session.targets,
                expires_at: session.expires_at,
                detail_question_ids: session.detail_check?.question_ids ?? [],
              },
              cors,
            )
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'follow-up-session' &&
        parts.length === 3 &&
        req.method === 'POST'
      ) {
        // Round 3(revisit linkage): PUBLIC patient-tablet submission. Every
        // safety rule (token validity/expiry/consumed, target-id membership,
        // label resolution from the server-side snapshot, never the
        // request body) is enforced inside store.submitFollowUpSession --
        // this handler only maps its result to a response.
        const rawToken = safeDecodeToken(parts[2])
        if (rawToken === null) {
          noteFailedPublicAttempt(remoteAddress(req))
          status = 404
          bytes = sendJson(req, res, 404, { status: 'INVALID' }, cors)
        } else if (!checkPublicRateLimit(remoteAddress(req))) {
          status = 429
          bytes = sendJson(req, res, 429, { error: 'too many attempts' }, cors)
        } else {
          const body = await readBody(req)
          const result = await store.submitFollowUpSession(rawToken, body)
          if (!result.ok) {
            noteFailedPublicAttempt(remoteAddress(req))
            status = result.reason === 'invalid' ? 404 : 410
            bytes = sendJson(req, res, status, { status: (result.reason ?? 'invalid').toUpperCase() }, cors)
          } else {
            status = 201
            await safeAudit({ event: AUDIT_EVENTS.FOLLOW_UP_SESSION_SUBMITTED, visit_id: result.visit_id, actor: AUDIT_ACTORS.PATIENT })
            bytes = sendJson(req, res, 201, { ok: true }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'stations' && parts.length === 2 && req.method === 'POST') {
        // Round 8: register a clinic tablet as a named station. STAFF route
        // (doctor-guarded like every other staff route). Returns the raw
        // device credential exactly once -- the caller renders it into a
        // one-time pairing link opened on the tablet itself. It is never
        // retrievable again (only its hash is stored).
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const registered = await store.registerStation(body?.name)
          if (!registered) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'invalid station name' }, cors)
          } else {
            status = 201
            await safeAudit({ event: AUDIT_EVENTS.STATION_REGISTERED, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(
              req,
              res,
              201,
              {
                credential: registered.credential,
                station: { station_id: registered.station.station_id, name: registered.station.name },
              },
              cors,
            )
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'stations' && parts.length === 2 && req.method === 'GET') {
        // Round 8: staff-facing station list (never includes credential hashes).
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          bytes = sendJson(req, res, 200, { stations: await store.listStations() }, cors)
        }
      } else if (parts[0] === 'api' && parts[1] === 'stations' && parts.length === 4 && parts[3] === 'assign' && req.method === 'POST') {
        // Round 8: THE reception action -- assign an explicitly-chosen
        // existing patient's new revisit session to a specific station.
        // patient_id comes from the staff UI's own selection of a known
        // record (verified below with the same visitExistsForPatient check
        // the existing start-revisit route uses); it is never matched from
        // a name/phone/DOB, and the tablet never chooses a patient itself.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const patientId = typeof body?.patient_id === 'string' ? body.patient_id : ''
          if (!patientId || !(await store.visitExistsForPatient(patientId))) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown patient_id' }, cors)
          } else {
            const result = await store.assignRevisitToStation(patientId, parts[2], body?.delivery_mode)
            if (!result.ok) {
              // Round 9: 'station_busy' is a conflict, not a malformed
              // request -- that tablet is still serving someone else and
              // must be completed or reset first (see stationStore.js).
              // Round 9/10: both uniqueness refusals are conflicts, not
              // malformed requests. 'station_busy' = that tablet is still
              // serving someone else; 'visit_assigned_elsewhere' = this
              // session is already live on another tablet. Either way staff
              // must reset the other station first (see stationStore.js).
              if (result.reason === 'station_not_found') status = 404
              else if (result.reason === 'station_busy' || result.reason === 'visit_assigned_elsewhere') status = 409
              else status = 400
              bytes = sendJson(req, res, status, { error: result.reason }, cors)
            } else {
              status = 201
              // Independent-review finding: assignRevisitToStation calls
              // startRevisit internally, which on the non-reused path
              // creates a brand-new visit AND mints a live follow-up
              // capability token -- but only station_assigned was ever
              // audited here, so a station assignment's own visit_created/
              // follow_up_session_issued never reached audit.log. Guarded
              // by the same `reused`/`created` signals the direct
              // start-revisit route already uses (see the comment there);
              // station_assigned itself is unconditional -- a station being
              // assigned is real durable state change regardless of
              // whether the underlying visit was newly created or
              // reattached.
              //
              // Round 17: split, same reasoning as the direct route -- a
              // durable restart-recovery reissue has `created: false` but
              // `reused: false`, and must still audit
              // follow_up_session_issued (a real new token was minted)
              // without re-auditing visit_created for a visit this call
              // did not create.
              await safeAudit({ event: AUDIT_EVENTS.STATION_ASSIGNED, visit_id: result.visit.id, actor: AUDIT_ACTORS.DOCTOR })
              if (result.created) {
                await safeAudit({ event: AUDIT_EVENTS.VISIT_CREATED, visit_id: result.visit.id, actor: AUDIT_ACTORS.DOCTOR })
              }
              if (!result.reused) {
                await safeAudit({ event: AUDIT_EVENTS.FOLLOW_UP_SESSION_ISSUED, visit_id: result.visit.id, actor: AUDIT_ACTORS.DOCTOR })
              }
              // No raw token in this response: the tablet fetches it itself
              // through its own credential-guarded poll. Staff never needs
              // to see or handle the capability for the CLINIC_TABLET path.
              bytes = sendJson(
                req,
                res,
                201,
                {
                  visit: result.visit,
                  station: { station_id: result.station.station_id, name: result.station.name },
                  session: {
                    expiresAt: result.session.expires_at,
                    targets: result.session.targets,
                    deliveryMode: result.session.delivery_mode,
                  },
                },
                cors,
              )
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'stations' && parts.length === 4 && parts[3] === 'reset' && req.method === 'POST') {
        // Round 8: staff manually returns a station to its waiting screen
        // (patient walked away, wrong assignment, etc). Round 9: this is
        // store.resetStation, NOT completeStationAssignment -- a reset also
        // revokes the cleared session's capability, because the tablet may
        // still be showing those questions and has stopped polling. See
        // store.js's resetStation doc comment.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const result = await store.resetStation(parts[2])
          if (!result.ok) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'station not found' }, cors)
          } else {
            await safeAudit({ event: AUDIT_EVENTS.STATION_RESET, visit_id: result.cleared?.visit_id, actor: AUDIT_ACTORS.DOCTOR })
            bytes = sendJson(req, res, 200, { ok: true }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'station' && parts.length === 3 && parts[2] === 'assignment' && req.method === 'GET') {
        // Round 8: THE TABLET's own poll. Authenticated by its device
        // credential only -- no doctor token, no Origin allowlist (the
        // tablet is a patient-facing device, exactly the posture of the
        // public follow-up-session routes). Returns only {status} or
        // {status, token}: never patient_id, name, phone, DOB, or targets.
        const credential = req.headers['x-station-credential']
        if (!checkPublicRateLimit(remoteAddress(req))) {
          status = 429
          bytes = sendJson(req, res, 429, { error: 'too many attempts' }, cors)
        } else {
          const station = await store.resolveStation(typeof credential === 'string' ? credential : '')
          if (!station) {
            noteFailedPublicAttempt(remoteAddress(req))
            status = 403
            bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
          } else {
            // Scoped to THIS station's own id, taken from the resolved
            // credential -- never from a client-supplied station id, so one
            // station can never read another's assignment.
            bytes = sendJson(req, res, 200, await store.pollStationAssignment(station.station_id), cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'station' && parts.length === 3 && parts[2] === 'complete' && req.method === 'POST') {
        // Round 8: the tablet reports that its assigned session finished,
        // so the assignment is cleared server-side and the tablet returns
        // to its waiting screen holding nothing.
        const credential = req.headers['x-station-credential']
        if (!checkPublicRateLimit(remoteAddress(req))) {
          status = 429
          bytes = sendJson(req, res, 429, { error: 'too many attempts' }, cors)
        } else {
          const station = await store.resolveStation(typeof credential === 'string' ? credential : '')
          if (!station) {
            noteFailedPublicAttempt(remoteAddress(req))
            status = 403
            bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
          } else {
            const result = await store.completeStationAssignment(station.station_id)
            await safeAudit({ event: AUDIT_EVENTS.STATION_COMPLETED, visit_id: result.cleared?.visit_id, actor: AUDIT_ACTORS.PATIENT })
            bytes = sendJson(req, res, 200, { ok: true }, cors)
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
            await safeAudit({ event: AUDIT_EVENTS.VISIT_CLEARED, visit_id: prev?.visit_id ?? undefined, actor: AUDIT_ACTORS.DOCTOR })
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
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'episodes' && parts.length === 3 && req.method === 'POST') {
        // Round 6: create (or, if episode_id already exists, idempotently
        // return) an Episode. patient_uuid must reference an existing
        // patient -- the same visitExistsForPatient check every other
        // patient-linking route already uses, so a CRM Episode can never
        // be anchored to an arbitrary/typo'd identifier.
        //
        // Episode↔Medication association integrity batch: episode_id is now
        // OPTIONAL client-minted input. Before this, every call minted a
        // fresh server-side randomUUID(), so the store's own create-if-
        // absent semantics (see crmStore.js's createEpisode) could never
        // actually trigger on an HTTP-level retry -- a lost response
        // followed by a client retry always produced a SECOND Episode,
        // since the retry's freshly-minted id could never match the first
        // attempt's. Accepting a client-supplied id (minted once per user
        // action and reused across retries, the same contract
        // MedicationCourseSection.tsx already uses for newCourseSourceId)
        // lets a genuine retry converge on the store's existing create-if-
        // absent path instead. Callers that omit it keep the old
        // server-minted behavior.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const patientUuid = typeof body?.patient_uuid === 'string' ? body.patient_uuid : ''
          const rawEpisodeId = body?.episode_id
          if (!patientUuid || !(await store.visitExistsForPatient(patientUuid))) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown patient_uuid' }, cors)
          } else if (rawEpisodeId != null && (typeof rawEpisodeId !== 'string' || !SAFE_CRM_ID_RE.test(rawEpisodeId))) {
            // Independent-review finding: episode_id now reaches
            // crmStore.episodePath() (path.join(episodesDir, `${id}.json`))
            // verbatim -- before this batch it was always a server-minted
            // randomUUID(), so a caller-controlled value here is new
            // attack surface. SAFE_CRM_ID_RE (no '/', '.', or other
            // path-traversal characters) closes both the directory-
            // traversal read/write and the unhandled-500-on-malformed-id
            // gap in one guard.
            status = 400
            bytes = sendJson(req, res, 400, { error: 'episode_id must be a non-empty string matching [A-Za-z0-9_-]{1,128}' }, cors)
          } else {
            const ownerClinician = typeof body?.owner_clinician === 'string' ? body.owner_clinician : null
            try {
              const { episode, created } = await crmStore.createEpisode({
                episode_id: typeof rawEpisodeId === 'string' && rawEpisodeId ? rawEpisodeId : randomUUID(),
                patient_uuid: patientUuid,
                owner_clinician: ownerClinician,
                now: new Date().toISOString(),
              })
              status = created ? 201 : 200
              if (created) await safeAudit({ event: AUDIT_EVENTS.CRM_EPISODE_CREATED, visit_id: undefined, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, status, episode, cors)
            } catch (err) {
              // Independent-review finding: a client-minted episode_id that
              // already belongs to a DIFFERENT patient must fail closed
              // (crmStore.createEpisode now throws CrmOwnershipError for
              // this), not silently hand back the foreign Episode.
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'episodes' && parts.length === 3 && req.method === 'GET') {
        // Medication/Herbal-course batch: episode_id is a server-minted
        // randomUUID with no separate index the client already knows --
        // a UI that only has a patient_uuid (the identity it always
        // starts from) needs this lookup before it can find or offer to
        // create that patient's own Episode(s) to attach a
        // MedicationCourse to.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const patientUuid = url.searchParams.get('patient_uuid') || ''
          if (!patientUuid) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'patient_uuid is required' }, cors)
          } else {
            const episodes = await crmStore.listEpisodesByPatient(patientUuid)
            bytes = sendJson(req, res, 200, { episodes }, cors)
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'episodes' && parts.length === 4 && req.method === 'GET') {
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const now = new Date().toISOString()
          const episode = await crmStore.getEpisode(id)
          if (!episode) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            const reviewState = await crmStore.getEpisodeReviewState(id, now)
            bytes = sendJson(req, res, 200, { ...episode, ...reviewState }, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'crm' &&
        parts[2] === 'episodes' &&
        parts.length === 5 &&
        parts[4] === 'tasks' &&
        req.method === 'GET'
      ) {
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const tasks = await crmStore.listTasksByEpisode(id, new Date().toISOString())
          bytes = sendJson(req, res, 200, { tasks }, cors)
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'crm' &&
        parts[2] === 'episodes' &&
        parts.length === 5 &&
        parts[4] === 'medication-courses' &&
        req.method === 'GET'
      ) {
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const courses = await crmStore.listMedicationCoursesByEpisode(id)
          bytes = sendJson(req, res, 200, { courses }, cors)
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'crm' &&
        parts[2] === 'episodes' &&
        parts.length === 5 &&
        (parts[4] === 'pause' || parts[4] === 'complete' || parts[4] === 'reopen') &&
        req.method === 'POST'
      ) {
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const expectedVersion = body?.expectedVersion
          if (typeof expectedVersion !== 'number') {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'expectedVersion is required' }, cors)
          } else {
            try {
              const now = new Date().toISOString()
              if (parts[4] === 'pause') {
                const episode = await crmStore.pauseEpisodeStored(id, expectedVersion, now)
                await safeAudit({ event: AUDIT_EVENTS.CRM_EPISODE_PAUSED, actor: AUDIT_ACTORS.DOCTOR })
                bytes = sendJson(req, res, 200, episode, cors)
              } else if (parts[4] === 'complete') {
                const result = await crmStore.completeEpisodeStored(id, expectedVersion, now)
                await safeAudit({ event: AUDIT_EVENTS.CRM_EPISODE_COMPLETED, actor: AUDIT_ACTORS.DOCTOR })
                bytes = sendJson(req, res, 200, result, cors)
              } else {
                const episode = await crmStore.reopenEpisodeStored(id, expectedVersion, now)
                await safeAudit({ event: AUDIT_EVENTS.CRM_EPISODE_REOPENED, actor: AUDIT_ACTORS.DOCTOR })
                bytes = sendJson(req, res, 200, episode, cors)
              }
            } catch (err) {
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'tasks' && parts.length === 3 && req.method === 'POST') {
        // Round 6: create a CrmTask. Idempotent on (patient_uuid,
        // episode_id, task_type, source_event_id, contact point) across
        // process restart -- see crmStore.js's createTaskStored. A
        // SAFETY_REVIEW task still requires safetyAuthorization in the
        // body (upstream signal or explicit human request), enforced by
        // the same pure engine check this store reuses -- the server
        // cannot infer a safety task into existence.
        // Round 7: body.patient_uuid below is NOT trusted as the task's
        // persisted identity -- createTaskStored() loads the referenced
        // Episode itself and always writes episode.patient_uuid, so a
        // stale/malicious body supplying a different patient_uuid can
        // never produce a Task whose patient disagrees with its own
        // Episode. It is still required here as basic request-shape
        // validation only.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const patientUuid = typeof body?.patient_uuid === 'string' ? body.patient_uuid : ''
          const episodeId = typeof body?.episode_id === 'string' ? body.episode_id : ''
          // 2nd independent closing-review finding (HIGH): episodeId is
          // caller-supplied and, before this fix, reached
          // crmStore.getEpisode() (a bare path.join lookup) with no
          // format check on this route -- see SAFE_CRM_ID_RE's own
          // comment for the proven traversal-read/misattributed-write
          // this closes.
          if (!patientUuid || !episodeId || !SAFE_CRM_ID_RE.test(episodeId) || !(await crmStore.getEpisode(episodeId))) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown episode_id' }, cors)
          } else {
            try {
              const { task, deduped } = await crmStore.createTaskStored({
                task_id: randomUUID(),
                patient_uuid: patientUuid,
                episode_id: episodeId,
                task_type: body?.task_type,
                reason_code: body?.reason_code,
                source_type: body?.source_type ?? null,
                source_id: body?.source_id ?? null,
                source_event_id: body?.source_event_id,
                source_timestamp: body?.source_timestamp ?? null,
                due_at: body?.due_at ?? null,
                owner_clinician: typeof body?.owner_clinician === 'string' ? body.owner_clinician : null,
                now: new Date().toISOString(),
                contactPointKey: typeof body?.contactPointKey === 'string' ? body.contactPointKey : undefined,
                do_not_contact: body?.do_not_contact === true,
                safetyAuthorization: body?.safetyAuthorization ?? undefined,
              })
              status = deduped ? 200 : 201
              if (!deduped) await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_CREATED, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, status, { task, deduped }, cors)
            } catch (err) {
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'tasks' && parts.length === 3 && req.method === 'GET') {
        // Round 11: the Today Queue read path. Doctor-authenticated
        // collection read over non-terminal CrmTasks, ordered by the pure
        // engine's own sortCrmTaskQueue() (SAFETY_REVIEW > CLINICAL_REVIEW
        // > ROUTINE, then overdue, due_at, created_at) -- this route adds
        // no ordering/priority logic of its own. Fetching the queue is a
        // read only: it never sets first_seen_at (that stays an explicit
        // /seen action) and never mutates/aggregates/auto-resolves any
        // task, Safety included. owner_clinician/coverage_queue are
        // optional query params reusing the existing
        // resolveTaskOwner/tasksForOwner semantics -- no hardcoded
        // clinician names or schedules.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const ownerClinician = url.searchParams.get('owner_clinician') || undefined
          const coverageQueue = url.searchParams.get('coverage_queue') || null
          const tasks = await crmStore.listActionableTasks(new Date().toISOString(), { ownerClinician, coverageQueue })
          bytes = sendJson(req, res, 200, { tasks }, cors)
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'tasks' && parts.length === 4 && req.method === 'GET') {
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const task = await crmStore.getTask(id, new Date().toISOString())
          if (!task) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            bytes = sendJson(req, res, 200, task, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'crm' &&
        parts[2] === 'tasks' &&
        parts.length === 5 &&
        ['resolve', 'snooze', 'cancel', 'supersede', 'claim', 'seen'].includes(parts[4]) &&
        req.method === 'POST'
      ) {
        // Round 6: every mutating task transition, all requiring
        // expectedVersion and all going through the same pure engine
        // functions the schema round already proved -- this route layer
        // adds no transition logic of its own, only auth/validation/
        // error-mapping around crmStore's calls.
        id = parts[3]
        const action = parts[4]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const expectedVersion = body?.expectedVersion
          if (typeof expectedVersion !== 'number') {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'expectedVersion is required' }, cors)
          } else {
            try {
              const now = new Date().toISOString()
              let task
              if (action === 'resolve') {
                // Round 10 fix: actorRole is NEVER read from the request
                // body. /api/crm/* is entirely doctor-authenticated (no
                // separate staff auth boundary exists yet), so the only
                // authority this route can honestly assert is CLINICIAN,
                // derived from requireDoctor()'s own successful check
                // above -- never from a client-editable JSON field. A
                // future staff-resolve path needs its own authenticated
                // boundary, not a body flag on this route. This is what
                // makes "Safety close authority = clinician only" an
                // actually-enforced server invariant rather than
                // something a caller could simply omit/relabel.
                const actorRole = 'CLINICIAN'
                task = await crmStore.resolveTaskStored(id, expectedVersion, actorRole, now)
                await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_RESOLVED, actor: AUDIT_ACTORS.DOCTOR })
              } else if (action === 'snooze') {
                const until = typeof body?.until === 'string' ? body.until : null
                if (!until) {
                  status = 400
                  bytes = sendJson(req, res, 400, { error: 'until is required' }, cors)
                } else {
                  task = await crmStore.snoozeTaskStored(id, expectedVersion, until)
                  await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_SNOOZED, actor: AUDIT_ACTORS.DOCTOR })
                }
              } else if (action === 'cancel') {
                task = await crmStore.cancelTaskStored(id, expectedVersion)
                await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_CANCELLED, actor: AUDIT_ACTORS.DOCTOR })
              } else if (action === 'supersede') {
                task = await crmStore.supersedeTaskStored(id, expectedVersion)
                await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_SUPERSEDED, actor: AUDIT_ACTORS.DOCTOR })
              } else if (action === 'claim') {
                const claimedBy = typeof body?.claimedBy === 'string' ? body.claimedBy : ''
                if (!claimedBy) {
                  status = 400
                  bytes = sendJson(req, res, 400, { error: 'claimedBy is required' }, cors)
                } else {
                  task = await crmStore.claimTaskStored(id, expectedVersion, claimedBy, now)
                  await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_CLAIMED, actor: AUDIT_ACTORS.DOCTOR })
                }
              } else {
                task = await crmStore.markTaskSeenStored(id, expectedVersion, now)
                await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_SEEN, actor: AUDIT_ACTORS.DOCTOR })
              }
              if (task) bytes = sendJson(req, res, 200, task, cors)
            } catch (err) {
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'medication-courses' && parts.length === 3 && req.method === 'POST') {
        // Medication/Herbal-course batch: creates the durable
        // MedicationCourse record only. Never infers a date/duration from
        // now -- source_timestamp plus whichever of prescribed_at /
        // dispensed_at / medication_start_at the caller explicitly
        // supplies are the only provenance this route accepts. Idempotent
        // across retries/restart via crmStore's dedup pointer keyed on
        // (episode_id, source, source_id) -- see createMedicationCourseStored.
        //
        // Episode↔Medication association integrity batch: patient_uuid is
        // OPTIONAL -- when the caller supplies it (the Doctor UI always
        // has its current patient in scope), createMedicationCourseStored
        // fail-closed rejects (409) an episode_id belonging to a
        // DIFFERENT patient, before any write. Omitting it preserves the
        // old behavior for any caller without a patient context to assert.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const episodeId = typeof body?.episode_id === 'string' ? body.episode_id : ''
          // 2nd independent closing-review finding (HIGH): see
          // SAFE_CRM_ID_RE's own comment -- this route also passed a
          // caller-supplied episodeId straight into crmStore.getEpisode()
          // with no format check, and expected_patient_uuid below is
          // opt-in (omitted by a caller, it never runs), so this was the
          // one write-capable path the traversal could still reach.
          if (!episodeId || !SAFE_CRM_ID_RE.test(episodeId) || !(await crmStore.getEpisode(episodeId))) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown episode_id' }, cors)
          } else {
            try {
              const { course, deduped } = await crmStore.createMedicationCourseStored({
                course_id: randomUUID(),
                episode_id: episodeId,
                expected_patient_uuid: typeof body?.patient_uuid === 'string' ? body.patient_uuid : undefined,
                source: body?.source,
                source_id: body?.source_id,
                source_timestamp: body?.source_timestamp,
                prescribed_at: body?.prescribed_at ?? null,
                dispensed_at: body?.dispensed_at ?? null,
                medication_start_at: body?.medication_start_at ?? null,
                planned_duration_days: typeof body?.planned_duration_days === 'number' ? body.planned_duration_days : null,
                now: new Date().toISOString(),
              })
              status = deduped ? 200 : 201
              if (!deduped) await safeAudit({ event: AUDIT_EVENTS.CRM_MEDICATION_COURSE_CREATED, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, status, { course, deduped }, cors)
            } catch (err) {
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'medication-courses' && parts.length === 4 && req.method === 'GET') {
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const course = await crmStore.getMedicationCourse(id)
          if (!course) {
            status = 404
            bytes = sendJson(req, res, 404, { error: 'not found' }, cors)
          } else {
            bytes = sendJson(req, res, 200, course, cors)
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'crm' &&
        parts[2] === 'medication-courses' &&
        parts.length === 5 &&
        parts[4] === 'check-tasks' &&
        req.method === 'POST'
      ) {
        // Medication/Herbal-course batch: creates one MEDICATION_*_CHECK
        // CrmTask against an existing course. due_at is never computed
        // here -- the caller (a doctor/staff explicit action, or a future
        // client that itself derives it only from an explicit human-
        // supplied date) must supply it. No day-7/day-15/end-minus-N
        // default of any kind lives on this route.
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const expectedVersion = body?.expectedVersion
          const reasonCode = body?.reason_code
          const dueAt = typeof body?.due_at === 'string' ? body.due_at : ''
          if (typeof expectedVersion !== 'number') {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'expectedVersion is required' }, cors)
          } else if (!MEDICATION_COURSE_REASON_CODES.has(reasonCode)) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'reason_code must be one of MEDICATION_START_CHECK/MEDICATION_MID_CHECK/MEDICATION_END_CHECK' }, cors)
          } else if (!dueAt) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'due_at is required' }, cors)
          } else {
            try {
              const { task, deduped } = await crmStore.createMedicationCourseCheckTaskStored(
                id,
                expectedVersion,
                reasonCode,
                dueAt,
                randomUUID(),
                new Date().toISOString(),
                body?.do_not_contact === true,
              )
              status = deduped ? 200 : 201
              if (!deduped) await safeAudit({ event: AUDIT_EVENTS.CRM_TASK_CREATED, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, status, { task, deduped }, cors)
            } catch (err) {
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (
        parts[0] === 'api' &&
        parts[1] === 'crm' &&
        parts[2] === 'medication-courses' &&
        parts.length === 5 &&
        parts[4] === 'shift-start' &&
        req.method === 'POST'
      ) {
        // Medication/Herbal-course batch: records an explicit, human-
        // supplied medication_start_at change and supersedes/recreates
        // only the still-open ROUTINE check tasks this course owns (DONE
        // tasks stay immutable). replacement_due_dates must be supplied by
        // the caller per surviving reason_code -- this route never invents
        // a due_at from the new start date.
        id = parts[3]
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const expectedVersion = body?.expectedVersion
          const medicationStartAt = typeof body?.medication_start_at === 'string' ? body.medication_start_at : ''
          // Closing-review finding (HIGH): coercing straight to `[]` for
          // ANY non-array value (an object, a string -- the classic
          // client bug of sending the single replacement instead of
          // wrapping it in an array) made the two validation checks below
          // pass vacuously (`[].every(...)` is true, `Set([]).size === 0
          // === [].length`), so a malformed-but-present body still
          // superseded the open task and returned 200. Only an absent or
          // explicit null value is treated as "no replacements" -- anything
          // else that isn't already an array is rejected outright.
          const rawReplacementsInput = body?.replacement_due_dates
          // Only computed as [] once we know rawReplacementsInput is either
          // nullish or already an array (the branch below rejects anything
          // else before this is ever read).
          const rawReplacements = Array.isArray(rawReplacementsInput) ? rawReplacementsInput : []
          if (typeof expectedVersion !== 'number') {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'expectedVersion is required' }, cors)
          } else if (!medicationStartAt) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'medication_start_at is required' }, cors)
          } else if (rawReplacementsInput != null && !Array.isArray(rawReplacementsInput)) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'replacement_due_dates must be an array' }, cors)
          } else if (
            // Independent-review finding (HIGH): silently filtering out a
            // malformed replacement entry used to still return 200 --
            // superseding the clinician's open check task while quietly
            // dropping their explicit reschedule. Every entry must be
            // valid, and reason codes must be unique per call, or the
            // whole request is rejected before anything is superseded.
            !rawReplacements.every(
              (r) => MEDICATION_COURSE_REASON_CODES.has(r?.reason_code) && typeof r?.due_at === 'string' && r.due_at,
            )
          ) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'replacement_due_dates entries must have a valid reason_code and due_at' }, cors)
          } else if (new Set(rawReplacements.map((r) => r.reason_code)).size !== rawReplacements.length) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'replacement_due_dates must not repeat a reason_code' }, cors)
          } else {
            const replacementTasks = rawReplacements.map((r) => ({
              task_id: randomUUID(),
              reason_code: r.reason_code,
              due_at: r.due_at,
              do_not_contact: r?.do_not_contact === true,
            }))
            try {
              const result = await crmStore.shiftMedicationCourseStartStored(id, expectedVersion, medicationStartAt, replacementTasks, new Date().toISOString())
              await safeAudit({ event: AUDIT_EVENTS.CRM_MEDICATION_COURSE_START_SHIFTED, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, 200, result, cors)
            } catch (err) {
              const mapped = mapCrmError(err)
              status = mapped.status
              bytes = sendJson(req, res, status, { error: mapped.error }, cors)
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'patient-identity' && parts.length === 3 && req.method === 'POST') {
        // Round 14: explicit clinician/staff confirmation that a Clinical
        // OS patient_uuid corresponds to a specific Sigma chart_no +
        // display name. This is the ONLY way such a link is created --
        // no automatic name/phone/RRN matching anywhere in this path,
        // same identity rule visitStore.js already enforces for patient_id
        // itself. 1:1 both directions is enforced in the store: linking
        // rejects (409) rather than silently overwriting if either side is
        // already linked.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          const body = await readBody(req)
          const patientUuid = typeof body?.patient_uuid === 'string' ? body.patient_uuid : ''
          // Independent-review finding: trim-only normalization let two
          // different casings of the SAME real chart_no ("cn-1001" vs
          // "CN-1001") hash to two different reverse pointers, silently
          // defeating the 1:1 invariant this whole layer exists to
          // guarantee. Uppercasing (in addition to trim) collapses that --
          // no assumption about Sigma's actual charset/format is made
          // beyond "case is not meaningful", which is true of every real
          // chart-number scheme in ordinary use.
          const chartNo = typeof body?.sigma_chart_no === 'string' ? body.sigma_chart_no.trim().toUpperCase() : ''
          const patientName = typeof body?.patient_name === 'string' ? body.patient_name.trim() : ''
          // Round 14: confirmed_by is an advisory audit label only (like
          // claimedBy above), never an authority claim -- this deployment
          // has one shared doctor token, not per-staff accounts, so there
          // is no stronger identity to derive it from server-side.
          const confirmedBy =
            typeof body?.confirmed_by === 'string' && body.confirmed_by.trim() ? body.confirmed_by.trim() : 'doctor'
          if (!patientUuid || !(await store.visitExistsForPatient(patientUuid))) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'unknown patient_uuid' }, cors)
          } else if (!chartNo || !patientName) {
            status = 400
            bytes = sendJson(req, res, 400, { error: 'sigma_chart_no and patient_name are required' }, cors)
          } else {
            try {
              const link = await patientIdentityStore.linkPatientIdentity({
                patientUuid,
                chartNo,
                patientName,
                confirmedBy,
                now: new Date().toISOString(),
              })
              status = 201
              await safeAudit({ event: AUDIT_EVENTS.PATIENT_IDENTITY_LINKED, actor: AUDIT_ACTORS.DOCTOR })
              bytes = sendJson(req, res, 201, link, cors)
            } catch (err) {
              if (err instanceof IdentityConflictError) {
                status = 409
                // Independent-review finding: the client had no way to show
                // *what* the conflicting link actually is, only that one
                // exists -- forcing the doctor to guess or re-query. When
                // the store attaches the existing link (already_linked
                // only; the other reasons have no single existing link to
                // show), surface it so the UI can display it directly.
                const body = { error: err.reason }
                if (err.existingLink) {
                  body.existing_sigma_chart_no = err.existingLink.sigma_chart_no
                  body.existing_patient_name = err.existingLink.patient_name
                }
                bytes = sendJson(req, res, 409, body, cors)
              } else {
                throw err
              }
            }
          }
        }
      } else if (parts[0] === 'api' && parts[1] === 'crm' && parts[2] === 'patient-identities' && parts.length === 3 && req.method === 'GET') {
        // Round 14: batch read for Today Queue enrichment -- one request
        // covers every task's patient_uuid instead of N+1 polling.
        // Unresolved entries are returned explicitly (never omitted or
        // guessed) so the caller can tell "no link yet" apart from
        // "request failed" -- see TodayQueueSection's stale-data handling.
        if (!requireDoctor(req)) {
          status = 403
          bytes = sendJson(req, res, 403, { error: 'forbidden' }, cors)
        } else {
          // Independent-review finding: unvalidated query values were
          // passed straight through to the store's file-path derivation.
          // Nothing in this deployment lets an attacker control
          // patient_uuid values reaching this route (they come from the
          // doctor's own Today Queue data), but the store's contract is
          // "valid UUID" -- enforcing the shape here, not deep inside the
          // store, keeps the validation next to the trust boundary.
          const uuidPattern = /^[0-9a-f-]{36}$/i
          const uuids = url.searchParams.getAll('patient_uuid').filter((v) => typeof v === 'string' && uuidPattern.test(v))
          const links = await patientIdentityStore.getIdentitiesByPatientUuids(uuids)
          const identities = {}
          for (const uuid of uuids) {
            const link = links[uuid]
            identities[uuid] = link
              ? { resolved: true, sigma_chart_no: link.sigma_chart_no, patient_name: link.patient_name }
              : { resolved: false, reason: 'no_mapping' }
          }
          bytes = sendJson(req, res, 200, { identities }, cors)
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

  // Quick Revisit: a much shorter cadence than submission retention above --
  // a due retry is meaningful within seconds/minutes (RETRY_DELAYS_MS is
  // 30s/2min/10min), not hours. unref()/close-cleanup mirrors retentionTimer.
  // Message-integrity-batch: interval is configurable (SAMINDANG_MESSAGE_
  // RETRY_INTERVAL_MS, default unchanged at 20s) purely so
  // tests/messaging.spec.mjs can shrink it to prove a real automatic-retry
  // sweep uses whatever contact tuple messagingContactCache still holds
  // (e.g. after a rejected dedup-mismatch never touched it) without a
  // 20-second wait per test run -- an invalid/non-positive value falls
  // back to the same safe default rather than crashing or spinning a
  // zero-delay loop (mirrors ownerLock.js's requirePositiveMs fail-closed
  // stance, but non-fatal here since this timing is not safety-critical).
  const rawRetryIntervalMs = Number(process.env.SAMINDANG_MESSAGE_RETRY_INTERVAL_MS)
  const messageRetryIntervalMs = Number.isFinite(rawRetryIntervalMs) && rawRetryIntervalMs > 0 ? rawRetryIntervalMs : 20_000
  runMessageRetries()
  const messageRetryTimer = setInterval(runMessageRetries, messageRetryIntervalMs)
  messageRetryTimer.unref()
  server.on('close', () => clearInterval(messageRetryTimer))

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
  // Independent-review finding: this list had drifted from the actual set
  // of persistence directories the server creates -- stations/, crm/, and
  // crm-identity/ (all added in later rounds) were missing, so an operator
  // whose SAMINDANG_DATA_DIR points somewhere with a writable submissions/
  // but an unwritable sibling for one of these would pass this boot
  // self-check cleanly and only discover the problem at the first CRM/
  // station/identity-link request. scripts/purge-data.mjs's own inventory
  // comment is the other place this same list is maintained -- keep both
  // in sync if a future round adds another persistence directory.
  const dirs = {
    submissions_dir: path.resolve(dataDir),
    visits_dir: path.resolve(dataDir, '..', 'visits'),
    recorder_results_dir: path.resolve(dataDir, '..', 'recorder-results'),
    micro_follow_up_dir: path.resolve(dataDir, '..', 'micro-follow-up'),
    follow_up_sessions_dir: path.resolve(dataDir, '..', 'follow-up-sessions'),
    stations_dir: path.resolve(dataDir, '..', 'stations'),
    crm_dir: path.resolve(dataDir, '..', 'crm'),
    crm_identity_dir: path.resolve(dataDir, '..', 'crm-identity'),
    messaging_dir: path.resolve(dataDir, '..', 'messaging'),
  }
  // Second-round closing-review finding (surfaced by tightening
  // tests/owner-lock.spec.mjs's multi-takeover reproduction's arrival
  // synchronization -- not one of the original 15 findings, but a real
  // bug that surfaced once several real processes actually raced this
  // exact code path): every racing process previously used the SAME fixed
  // probe filename (`.write-probe`) in the SAME shared directory. Two
  // processes starting against the same data dir at nearly the same
  // instant (an operator double-starting the server -- precisely the
  // scenario the owner lock two lines below exists to catch) could each
  // writeFile the same path, then race each other's `rm(probe)`: whichever
  // process's unlink loses the race hits ENOENT on a file the OTHER
  // process already removed, and crashes with a self-check failure that
  // never mentions the real cause (a concurrent process, not an actually
  // unwritable directory) -- before either process even reaches the owner
  // lock's much clearer "already owned by another live process" refusal.
  // Fixed the same way atomicWrite's own tmp file in ownerLock.js is: a
  // unique-per-attempt probe name, so racing processes never touch the
  // same file at all.
  for (const [label, dir] of Object.entries(dirs)) {
    const probe = path.join(dir, `.write-probe.${process.pid}.${randomUUID()}`)
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

  // Round 17: acquire the data-directory owner lock BEFORE createApp/listen
  // -- see server/ownerLock.js's header for why this only exists on the CLI
  // boot path (isMain()), never inside createApp() itself. A second process
  // pointed at the same data dir refuses to start here, loudly, instead of
  // silently racing every store's in-process-only lock.
  //
  // requirePositiveMs lives in ownerLock.js (shared with scripts/purge-
  // data.mjs) precisely so the validation both callers apply to these env
  // vars can't drift -- see that function's own comment for the concrete
  // regression that happened when purge-data.mjs had its own, weaker copy.
  const heartbeatMs = requirePositiveMs('SAMINDANG_OWNER_LOCK_HEARTBEAT_MS', 15000)
  const staleAfterMs = requirePositiveMs('SAMINDANG_OWNER_LOCK_STALE_MS', 90000)
  // Third-round closing-review finding: this fallback had drifted from
  // ownerLock.js's own DEFAULT_SETTLE_MS (350, chosen specifically to match
  // the pre-simplification two-check sequence's effective total wait --
  // see that constant's own comment) -- this call site still said 300,
  // silently shipping a 50ms-narrower detection window on the real server
  // boot path than every other caller of acquireOwnerLock gets by default.
  const settleMs = requirePositiveMs('SAMINDANG_OWNER_LOCK_SETTLE_MS', 350)
  // Declared before acquireOwnerLock so onLockLost's closure can reference
  // it -- it is only actually read once the heartbeat fires (well after
  // `server` below is assigned), never at lock-acquisition time itself.
  let server
  let ownerLock
  // Seventh-round closing-review finding (HIGH -- the exact F1 leak class
  // rounds 5-6 spent two rounds closing in scripts/purge-data.mjs, still
  // wide open here): this boot path used to register
  // process.on('SIGINT'/'SIGTERM', ...) only after server.listen() below,
  // well after acquireOwnerLock() -- and on the stale-lock TAKEOVER path,
  // acquireOwnerLock() durably writes the lock file (naming this process's
  // pid) and then sleeps out settleMs (350ms default) before it verifies
  // and returns. A signal landing anywhere before the old registration
  // point (during checkDataDirsWritable, during that settle sleep, or
  // between acquireOwnerLock returning and the old process.on(...) calls)
  // hit Node's default disposition -- no handler, no release, no
  // `shutdown()` -- leaking a lock naming this about-to-exit process's pid
  // and wedging both a real restart and scripts/purge-data.mjs's own
  // liveness refusal for up to staleAfterMs. Reproduced end-to-end: an
  // operator Ctrl-C during that window left a real server's restart
  // refusing to start, citing the dead pid, exactly like every other
  // instance of this leak class in this file's history.
  //
  // Fixed the same way scripts/purge-data.mjs already does it: register
  // the handlers here, before acquireOwnerLock is ever called, backed by
  // the same direct-disk fallback (if the current lock file names OUR OWN
  // pid AND hostname, only this process could have written it, so it is
  // safe to remove even without the handle acquireOwnerLock() would
  // otherwise have returned). `shutdown()` below now always goes through
  // this fallback-aware release, and only touches `server`/exits gracefully
  // through it if boot has reached that point yet -- otherwise it exits
  // immediately once the lock (if any) is cleared.
  //
  // Seventh-round closing-review finding: a single immediate disk read is
  // not quite enough here either -- see releaseAnyLockNamedThisProcess's
  // own comment in server/ownerLock.js for the narrow rename-in-flight
  // race its short retry loop closes (reproduced against this exact boot
  // path: 1 leak in 19 signaled attempts before the retry was added).
  // Shared with scripts/purge-data.mjs's identical need instead of
  // duplicated, so the two can't drift.
  async function releaseAnyLockWeMightHold() {
    await releaseAnyLockNamedThisProcess(dataDir, ownerLock)
  }
  let shuttingDown = false
  async function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`${signal} received, shutting down...`)
    await releaseAnyLockWeMightHold()
    if (server) {
      server.close(() => process.exit(0))
      // Belt-and-suspenders: if close() hangs on a stuck connection, still
      // exit once the lock is released rather than leaving the process
      // dangling with no forward progress.
      setTimeout(() => process.exit(0), 5000).unref()
    } else {
      // Signal landed before server.listen() -- nothing to close yet, and
      // the lock (if any) has already been handled above.
      process.exit(0)
    }
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGHUP', () => void shutdown('SIGHUP'))
  // Closing-review finding: if this process later loses the lock (e.g. it
  // stalled past staleAfterMs and a different process legitimately took
  // over while it was stalled), it must stop serving requests against a
  // data directory another process now owns -- continuing would be exactly
  // the two-live-owners state this whole module exists to prevent. Do NOT
  // call ownerLock.release() here: this process no longer owns the lock,
  // so releasing would delete the NEW owner's live lock file.
  function onLockLost() {
    if (server) server.close(() => process.exit(1))
    else process.exit(1)
  }
  // Test-only race synchronization (second-round closing-review finding):
  // tests/owner-lock.spec.mjs's multi-takeover reproduction spawns several
  // real server processes to race one seeded stale lock, but plain
  // near-simultaneous spawning does not reliably make their takeover
  // attempts collide -- OS process-spawn scheduling skew reliably let the
  // FIRST spawned process win outright before the others even reached
  // their own EEXIST-and-stale check, so every "loser" refused via the
  // plain isFresh() guard above and the settle-and-reconfirm code this
  // module exists to validate went unexercised in ~19 of 20 runs. When set
  // (only by that test), wait for the given epoch-ms instant immediately
  // before attempting to acquire the lock, so multiple processes' takeover
  // attempts genuinely land within the same settle window instead of
  // merely reflecting spawn-order luck. Never set outside that test; a
  // no-op (this whole block does not execute) unless this exact env var is
  // present, and it can only delay reaching acquireOwnerLock, never change
  // what that function does.
  //
  // Third-round closing-review finding: the first version of this hook was
  // a pure CPU busy-wait for the entire delay. On a CPU-constrained runner
  // (this repo's own CI: ubuntu-latest, 2 vCPU) with N racing processes all
  // spinning at once, they cannot all leave the barrier together --
  // whichever gets scheduled first wins and renews the lock before the
  // others get CPU time at all, so the test's assertion that at least one
  // loser reaches the settle-reconfirm code (the very thing this barrier
  // exists to force) failed on ~5 of 6 runs under a 2-vCPU simulation, even
  // though the same test passed reliably on a machine with more cores.
  // Fixed by yielding the event loop (via setTimeout) for the bulk of the
  // wait -- consuming ~0% CPU so all N processes can actually be scheduled
  // and reach the barrier close together -- and busy-spinning only for a
  // short final slice, where millisecond-scale timer imprecision would
  // otherwise blow the synchronization. Also capped: a very large or
  // malformed target cannot make this block wait indefinitely.
  const raceAt = process.env.SAMINDANG_OWNER_LOCK_TEST_RACE_AT
  if (raceAt) {
    const requested = Number(raceAt)
    const target = Number.isFinite(requested) ? Math.min(requested, Date.now() + 5000) : Date.now()
    // Third-round closing-review re-check: an initial 3ms final-spin slice
    // was still occasionally too tight under CPU contention (observed
    // ~1/6 residual flakes simulating CI's 2 vCPU via `taskset`) -- 5
    // processes' event loops all waking from their parked setTimeout
    // within the same few milliseconds is itself schedule-dependent, so a
    // too-short busy-spin slice could still let one process reach the
    // lock file meaningfully before the others resume. Widened to 15ms,
    // re-verified 10/10 clean runs under the same 2-vCPU simulation.
    const spinFromMs = 15
    while (Date.now() < target - spinFromMs) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(20, target - spinFromMs - Date.now()))))
    }
    while (Date.now() < target) {
      /* short final spin -- timer callbacks are not precise enough for the
         last few ms, but this window is short and rare (test-only). */
    }
  }

  try {
    ownerLock = await acquireOwnerLock(dataDir, { heartbeatMs, staleAfterMs, settleMs, onLost: onLockLost })
  } catch (err) {
    if (err instanceof OwnerLockConflictError) {
      console.error(`fatal: ${err.message}`)
    } else {
      console.error(`fatal: could not acquire data directory owner lock — ${err.message}`)
    }
    process.exit(1)
  }

  server = createApp({ dataDir })
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
    console.log(`owner lock: pid=${ownerLock.pid} (${ownerLock.lockPath})`)
  })
}
