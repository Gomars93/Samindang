// 플로우 정렬 4/5 (환자 치료 계획 읽기 전용 링크) -- server + store + patient
// screen + doctor card. Plain node script: assert() prints "OK: <name>" and
// throws on failure (same harness as tests/follow-up-session.spec.mjs).
//
// What this pins:
//   1. store: a CARE_PLAN token record carries kind + capped care_plan_text,
//      a default record is FOLLOW_UP with care_plan_text null, and a
//      CARE_PLAN token can NEVER be consumed.
//   2. routes: POST /api/submissions/:id/care-plan-link (doctor-only) and
//      GET /api/care-plan/:token (public, read-only) -- status codes, the
//      exact public response keys (no identifiers), reissue invalidates the
//      previous link, and a care-plan token is INVALID on the follow-up
//      public route (separate stores, no cross-use).
//   3. purge: care-plan-links/ is included in store.purgeAll().
//   4. patient screen (SSR): ACTIVE renders the text and nothing else;
//      non-ACTIVE renders the unavailable message; never a submit control.
//   5. doctor card: the "환자 링크 만들기" action exists only when a handler
//      is supplied (fixtures mode has none) and, once issued, the message
//      text carries the link.
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createApp } from '../server/index.js'
import { createStore } from '../server/store.js'
import { createFollowUpSessionStore, CARE_PLAN_TEXT_MAX_CHARS } from '../server/followUpSessionStore.js'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToString } = require('react-dom/server')
const { act } = require('react')
const TestRenderer = require('react-test-renderer')
const { CarePlanScreen } = require('./.care-plan-screen-bundle.cjs')
const { PatientCarePlanPreviewCard } = require('./.care-plan-preview-card-bundle.cjs')
const { buildCarePlanMessageText } = await import('./.care-plan-message-bundle.mjs')

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function validPayload(overrides = {}) {
  return {
    questionnaire_version: '1.0',
    session_id: 'sess-care-plan',
    responses: { patient: { patient_name: '테스트', phone_last4: '0000' } },
    flags: { requires_staff_check: false },
    routing: { primary_module: 'Pain' },
    myungri_calculation: { status: 'resolved' },
    metadata: { session_started_at: null, answers: {} },
    ...overrides,
  }
}

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}` }
}
function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

const PLAN_TEXT = '[치료 계획]\n- 집에서: 걷기 10분 하루 2회\n- 주의: 무거운 물건 들기 피하기'

async function main() {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-care-plan-'))
  try {
    /* ---------------- 1. store-level record shape ---------------- */
    {
      const dir = path.join(tmpRoot, 'store-shape')
      const store = createFollowUpSessionStore(dir, { ttlMinutes: 30 })
      const plain = await store.issueToken({ visit_id: 'v1', patient_id: 'p1', targets: [], delivery_mode: null })
      assert('store: a record issued without kind is FOLLOW_UP', plain.record.kind === 'FOLLOW_UP')
      assert('store: a FOLLOW_UP record has care_plan_text null (never a stray string)', plain.record.care_plan_text === null)
      const plainWithText = await store.issueToken({ visit_id: 'v1b', patient_id: 'p1', targets: [], care_plan_text: 'x' })
      assert('store: care_plan_text is dropped when kind is not CARE_PLAN', plainWithText.record.care_plan_text === null)

      const cp = await store.issueToken({ visit_id: 's1', patient_id: 'p1', targets: [], kind: 'CARE_PLAN', care_plan_text: PLAN_TEXT })
      assert('store: kind CARE_PLAN is persisted', cp.record.kind === 'CARE_PLAN')
      assert('store: care_plan_text is persisted verbatim', cp.record.care_plan_text === PLAN_TEXT)
      const resolved = await store.resolveToken(cp.token)
      assert('store: resolveToken returns kind + care_plan_text', resolved.kind === 'CARE_PLAN' && resolved.care_plan_text === PLAN_TEXT)

      const consumed = await store.consumeToken(cp.token)
      assert('store: a CARE_PLAN token can never be consumed (reason invalid)', consumed.ok === false && consumed.reason === 'invalid')
      const after = await store.resolveToken(cp.token)
      assert('store: the refused consume left the CARE_PLAN token ACTIVE', after.status === 'ACTIVE')

      const long = await store.issueToken({ visit_id: 's2', patient_id: 'p1', targets: [], kind: 'CARE_PLAN', care_plan_text: 'a'.repeat(CARE_PLAN_TEXT_MAX_CHARS + 50) })
      assert('store: care_plan_text is capped at CARE_PLAN_TEXT_MAX_CHARS', long.record.care_plan_text.length === CARE_PLAN_TEXT_MAX_CHARS)
      const nonString = await store.issueToken({ visit_id: 's3', patient_id: 'p1', targets: [], kind: 'CARE_PLAN', care_plan_text: { nope: true } })
      assert('store: a non-string care_plan_text becomes empty string, never an object at rest', nonString.record.care_plan_text === '')
      const unknownKind = await store.issueToken({ visit_id: 's4', patient_id: 'p1', targets: [], kind: 'WHATEVER' })
      assert('store: an unknown kind normalizes to FOLLOW_UP (fail closed on trust, not availability)', unknownKind.record.kind === 'FOLLOW_UP')
    }

    /* ---------------- 2. routes ---------------- */
    {
      const dataDir = path.join(tmpRoot, 'routes', 'submissions')
      const { server, base } = await startServer({ dataDir, carePlanLinkTtlMinutes: 60 })
      try {
        const created = await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload()),
        })
        const { id } = await created.json()
        assert('setup: submission created', created.status === 201 && typeof id === 'string')

        const empty = await fetch(`${base}/api/submissions/${id}/care-plan-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ care_plan_text: '   ' }),
        })
        assert('POST care-plan-link with blank text -> 400', empty.status === 400)
        const tooLong = await fetch(`${base}/api/submissions/${id}/care-plan-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ care_plan_text: 'a'.repeat(CARE_PLAN_TEXT_MAX_CHARS + 1) }),
        })
        assert('POST care-plan-link over the cap -> 400 (rejected, not silently truncated)', tooLong.status === 400)
        const missing = await fetch(`${base}/api/submissions/does-not-exist/care-plan-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ care_plan_text: PLAN_TEXT }),
        })
        assert('POST care-plan-link for an unknown submission -> 404', missing.status === 404)

        const issued = await fetch(`${base}/api/submissions/${id}/care-plan-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ care_plan_text: PLAN_TEXT }),
        })
        const issuedBody = await issued.json()
        assert('POST care-plan-link -> 201', issued.status === 201)
        assert('POST care-plan-link returns exactly {token, expires_at}', Object.keys(issuedBody).sort().join(',') === 'expires_at,token')
        assert('POST care-plan-link token is base64url-shaped', /^[A-Za-z0-9_-]{32,128}$/.test(issuedBody.token))
        const ttlMs = new Date(issuedBody.expires_at).getTime() - Date.now()
        assert('POST care-plan-link expiry honors the care-plan TTL (≈60 min here), not the 30-min follow-up TTL', ttlMs > 50 * 60 * 1000 && ttlMs <= 60 * 60 * 1000)

        // Doctor-guard: a non-loopback Origin without the allowlist is
        // refused the same way as every other doctor route.
        const foreign = await fetch(`${base}/api/submissions/${id}/care-plan-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
          body: JSON.stringify({ care_plan_text: PLAN_TEXT }),
        })
        assert('POST care-plan-link from a non-allowlisted Origin -> 403 (doctor route)', foreign.status === 403)

        const pub = await fetch(`${base}/api/care-plan/${encodeURIComponent(issuedBody.token)}`)
        const pubBody = await pub.json()
        assert('GET /api/care-plan/:token -> 200 ACTIVE', pub.status === 200 && pubBody.status === 'ACTIVE')
        assert('GET care-plan returns exactly {status, care_plan_text, expires_at} -- no patient/submission identifiers', Object.keys(pubBody).sort().join(',') === 'care_plan_text,expires_at,status')
        assert('GET care-plan returns the snapshotted text verbatim', pubBody.care_plan_text === PLAN_TEXT)
        const pubAgain = await fetch(`${base}/api/care-plan/${encodeURIComponent(issuedBody.token)}`)
        assert('GET care-plan is re-openable (read-only, never consumed by reading)', (await pubAgain.json()).status === 'ACTIVE')

        const garbage = await fetch(`${base}/api/care-plan/not-a-token`)
        assert('GET care-plan with a malformed token -> 404 INVALID', garbage.status === 404 && (await garbage.json()).status === 'INVALID')
        const crossRoute = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(issuedBody.token)}`)
        assert('a care-plan token is INVALID on the follow-up public route (separate stores, no cross-use)', crossRoute.status === 404)
        const crossPost = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(issuedBody.token)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetRatings: [], overallChange: '좋아짐' }),
        })
        assert('a care-plan token cannot submit anything on the follow-up public POST', crossPost.status === 404)
        const noPublicPost = await fetch(`${base}/api/care-plan/${encodeURIComponent(issuedBody.token)}`, { method: 'POST' })
        assert('there is no public POST /api/care-plan/:token (read-only by construction)', noPublicPost.status === 404 || noPublicPost.status === 405)

        // Reissue: the earlier link stops working.
        const reissued = await fetch(`${base}/api/submissions/${id}/care-plan-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ care_plan_text: PLAN_TEXT + '\n(수정)' }),
        })
        const reissuedBody = await reissued.json()
        assert('reissue -> 201 with a different token', reissued.status === 201 && reissuedBody.token !== issuedBody.token)
        const oldPub = await fetch(`${base}/api/care-plan/${encodeURIComponent(issuedBody.token)}`)
        assert('the previous care-plan link is INVALIDATED after reissue (one active link per submission)', (await oldPub.json()).status === 'INVALIDATED')
        const newPub = await fetch(`${base}/api/care-plan/${encodeURIComponent(reissuedBody.token)}`)
        assert('the new care-plan link carries the updated text', (await newPub.json()).care_plan_text === PLAN_TEXT + '\n(수정)')

        // Audit: the issuance event is registered and written.
        const auditRaw = await readFile(path.join(tmpRoot, 'routes', 'audit.log'), 'utf8')
        assert('audit: care_plan_link_issued is written for each issuance', auditRaw.split('\n').filter((l) => l.includes('care_plan_link_issued')).length === 2)
        assert('audit: the care plan text never appears in the audit log', !auditRaw.includes('걷기 10분'))

        // Expired: a store with a negative TTL.
        const expStore = createStore(dataDir, { carePlanLinkTtlMinutes: -1 })
        const exp = await expStore.issueCarePlanLink(id, PLAN_TEXT)
        const expPub = await fetch(`${base}/api/care-plan/${encodeURIComponent(exp.token)}`)
        const expRaw = await expPub.text()
        assert('GET care-plan on an expired link -> 200 EXPIRED (never the text)', JSON.parse(expRaw).status === 'EXPIRED' && !expRaw.includes('걷기'))
      } finally {
        await stopServer(server)
      }
    }

    /* ---------------- 3. purgeAll covers care-plan-links/ ---------------- */
    {
      const root = path.join(tmpRoot, 'purge')
      const dataDir = path.join(root, 'submissions')
      const store = createStore(dataDir)
      const sub = await store.createSubmission({ submission: validPayload(), myungri: null, patient_label: null })
      assert('purge setup: createSubmission returns a record with a string id', typeof sub?.id === 'string')
      const link = await store.issueCarePlanLink(sub.id, PLAN_TEXT)
      assert('purge setup: link issued', typeof link?.token === 'string')
      const before = await readdir(path.join(root, 'care-plan-links', 'tokens'))
      assert('purge setup: care-plan-links/tokens has 1 file', before.length === 1)
      await store.purgeAll()
      let after = []
      try {
        after = await readdir(path.join(root, 'care-plan-links', 'tokens'))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      assert('purgeAll removes care-plan-links/ too ("전체 삭제" stays true)', after.length === 0)
    }

    /* ---------------- 4. patient screen (SSR) ---------------- */
    {
      const active = renderToString(
        React.createElement(CarePlanScreen, { token: 'tok', initialView: { status: 'ACTIVE', carePlanText: PLAN_TEXT, expiresAt: '2030-01-01T00:00:00.000Z' } }),
      )
      assert('screen: ACTIVE renders the care-plan text', active.includes('걷기 10분 하루 2회'))
      assert('screen: ACTIVE has no submit/answer controls (read-only page)', !/<button|<input|<textarea/.test(active))
      assert('screen: ACTIVE has a heading naming it as the care plan', active.includes('치료 계획'))
      for (const status of ['EXPIRED', 'INVALIDATED', 'INVALID']) {
        const html = renderToString(React.createElement(CarePlanScreen, { token: 'tok', initialView: { status } }))
        assert(`screen: ${status} renders an unavailable message and never the text`, html.includes('직원에게 문의') && !html.includes('걷기'))
      }
      const src = await readFile(path.join(__dirname, '..', 'src', 'screens', 'CarePlanScreen.tsx'), 'utf8')
      assert('screen source: never imports serverClient.ts or doctorToken.ts (a doctor token can structurally never reach this page)', !/from\s+['"].*(serverClient|doctorToken)['"]/.test(src) && !src.includes('x-doctor-token'))
      assert('screen source: imports followUpClient (the patient-side client) -- sanity, not vacuous', /from\s+['"]\.\.\/lib\/followUpClient['"]/.test(src))
      assert('screen source: does not scrub the URL (link must stay re-openable for the TTL, unlike the one-time follow-up)', !/history\.(replaceState|pushState)\(/.test(src))
      const appSrc = await readFile(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8')
      assert('App.tsx routes #care-plan=<token> to CarePlanScreen', /#care-plan=\(\.\+\)/.test(appSrc) && appSrc.includes('<CarePlanScreen'))
    }

    /* ---------------- 5. doctor card ---------------- */
    {
      const noHandler = renderToString(React.createElement(PatientCarePlanPreviewCard, { title: '환자 전달용 치료 계획', text: PLAN_TEXT }))
      assert('card: without onIssueLink there is no 링크 button (fixtures mode unchanged)', !noHandler.includes('환자 링크 만들기'))
      const withHandler = renderToString(
        React.createElement(PatientCarePlanPreviewCard, { title: '환자 전달용 치료 계획', text: PLAN_TEXT, onIssueLink: async () => ({ ok: true, link: 'https://x/#care-plan=t', expiresAt: '2030-01-01T00:00:00.000Z' }) }),
      )
      assert('card: with onIssueLink the 환자 링크 만들기 button renders', withHandler.includes('환자 링크 만들기'))
      const emptyText = renderToString(
        React.createElement(PatientCarePlanPreviewCard, { title: '환자 전달용 치료 계획', text: '   ', onIssueLink: async () => ({ ok: true, link: 'x', expiresAt: 'y' }) }),
      )
      assert('card: an empty care plan disables the 링크 button (never issue a blank page)', /환자 링크 만들기[^<]*<\/button>/.test(emptyText) && /disabled=""[^>]*>환자 링크 만들기|<button[^>]*disabled[^>]*>[^<]*환자 링크 만들기/.test(emptyText))

      let received = null
      let renderer
      await act(async () => {
        renderer = TestRenderer.create(
          React.createElement(PatientCarePlanPreviewCard, {
            title: '환자 전달용 치료 계획',
            text: PLAN_TEXT,
            onIssueLink: async (text) => {
              received = text
              return { ok: true, link: 'https://clinic.example/app/#care-plan=abc', expiresAt: '2030-01-01T00:00:00.000Z' }
            },
          }),
        )
      })
      const btn = renderer.root.findAll((n) => n.type === 'button' && n.children.join('') === '환자 링크 만들기')[0]
      await act(async () => {
        await btn.props.onClick()
      })
      assert('card: clicking sends the exact preview text to the handler', received === PLAN_TEXT)
      const issuedHtml = JSON.stringify(renderer.toJSON())
      assert('card: after issuance the message text (with the link) is shown', issuedHtml.includes('#care-plan=abc'))
      assert('card: the message text is the shared buildCarePlanMessageText output', issuedHtml.includes(JSON.stringify(buildCarePlanMessageText('https://clinic.example/app/#care-plan=abc')).slice(1, -1)))
      assert('card: a 문자 내용 복사 action appears after issuance', issuedHtml.includes('문자 내용 복사'))

      const msg = buildCarePlanMessageText('https://clinic.example/app/#care-plan=abc')
      assert('message: names the clinic and the purpose', msg.includes('[삼인당한의원]') && msg.includes('치료 계획'))
      assert('message: ends with the link on its own line', msg.trimEnd().endsWith('\nhttps://clinic.example/app/#care-plan=abc'))
      assert('message: carries no clinical content (the plan lives behind the link, never in the SMS body)', !msg.includes('걷기'))
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
  console.log(`\n${passCount} assertions passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
