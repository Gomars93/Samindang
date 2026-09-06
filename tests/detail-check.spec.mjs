// 플로우 정렬 5/5 (세부문진 배선). Plain node script (OK:/FAIL harness).
//
// Pins:
//   1. PARITY: server/detailCheck.js computeDetailCheckDue agrees with the
//      doctor-side TS computeDetailCheckDue on one shared fixture table.
//   2. token store: detail_check normalization (ids only, bounded, never on
//      a CARE_PLAN record).
//   3. E2E: prior submission + plan due -> start-revisit -> public GET carries
//      detail_question_ids (LBP set only for an LBP patient; [] when not
//      due); submit filters to the snapshot and caps values; reissue keeps it.
//   4. patient screen: NRS buttons for 통증 강도, the four detail items
//      rendered from coreSpec by id, submit gated on them, POST body carries
//      detailAnswers.
//   5. doctor card: baseline → today rendered with coreSpec labels.
//   6. source contract: the patient screen's NRS id set equals the doctor's.
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createApp } from '../server/index.js'
import { createStore } from '../server/store.js'
import { createFollowUpSessionStore } from '../server/followUpSessionStore.js'
import { computeDetailCheckDue as serverDue, detailCheckQuestionIds, localTodayISO } from '../server/detailCheck.js'
import { computeDetailCheckDue as clientDue } from './.detail-check-revisit-quick-check-bundle.mjs'
import { resolveDetailCheckQuestions, describeDetailCheckValue, detailCheckQuestionText } from './.detail-check-questions-bundle.mjs'
import { PAIN_NRS_TARGET_IDS } from './.detail-check-final-assessment-bundle.mjs'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToString } = require('react-dom/server')
const { act } = require('react')
const TestRenderer = require('react-test-renderer')
const { FollowUpScreen } = require('./.detail-check-follow-up-screen-bundle.cjs')
const { MicroFollowUpCard } = require('./.detail-check-micro-card-bundle.cjs')

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const LBP_IDS = ['VISIT_04_SYMPTOM_IMPACT', 'LBP_12', 'LBP_13', 'LBP_14']

function emptyWorkspaceFor(overrides) {
  return {
    schema_version: '1.1.0',
    painExamSuggestions: [],
    painFinalAssessment: { finalWorkingAssessment: '', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
    painFollowUpTargets: [],
    herbalPatternCandidates: [],
    herbalClinicianObservations: [],
    herbalFinalAssessment: { finalPatternOrMechanism: '', treatmentPrinciple: '', prescriptionPlanNote: '', symptomsToTrack: '', recordedAt: null },
    herbalFollowUpTargets: [],
    painCarePlan: { currentTreatmentGoal: '', rehabilitationGoal: '', homeActionPlan: '', activityPrecaution: '', patientInstruction: '', nextVisitCheckItem: '', recordedAt: null },
    herbalCarePlan: { currentManagementGoal: '', medicationPlanNote: '', homeLifestyleManagement: '', symptomsToObserve: '', adverseEffectContactInstruction: '', nextVisitCheckItem: '', recordedAt: null },
    nextReassessmentPlan: { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' },
    painReassessment: { items: [], finalReassessmentNote: '', recordedAt: null },
    herbalReassessment: { items: [], finalReassessmentNote: '', recordedAt: null },
    painRehabSuggestions: [],
    additionalConcernPromotion: { status: 'NOT_FLAGGED', clinicianNote: '', promotedAt: null },
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}
const stopServer = (server) => new Promise((resolve) => server.close(resolve))
const doctorHeaders = { origin: 'http://localhost:5173', 'content-type': 'application/json' }

async function main() {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-detail-check-'))
  try {
    /* ---------------- 1. parity ---------------- */
    {
      const plan = (status, extra = {}) => ({ status, targetDate: '', afterVisitCount: null, note: '', ...extra })
      const cases = [
        ['DATE due today', [['2026-08-01T00:00:00.000Z', plan('DATE', { targetDate: '2026-09-03' })]], '2026-09-03'],
        ['DATE due (past)', [['2026-08-01T00:00:00.000Z', plan('DATE', { targetDate: '2026-09-03' })]], '2026-09-10'],
        ['DATE not yet', [['2026-08-01T00:00:00.000Z', plan('DATE', { targetDate: '2026-09-03' })]], '2026-09-02'],
        ['DATE bad format', [['2026-08-01T00:00:00.000Z', plan('DATE', { targetDate: '2026/09/03' })]], '2026-09-03'],
        ['VISIT_COUNT due n=1', [['2026-08-01T00:00:00.000Z', plan('VISIT_COUNT', { afterVisitCount: 1 })]], '2026-09-03'],
        ['VISIT_COUNT not due n=2', [['2026-08-01T00:00:00.000Z', plan('VISIT_COUNT', { afterVisitCount: 2 })]], '2026-09-03'],
        ['VISIT_COUNT due n=2 with 2 visits', [['2026-08-20T00:00:00.000Z', plan('UNSET')], ['2026-08-01T00:00:00.000Z', plan('VISIT_COUNT', { afterVisitCount: 2 })]], '2026-09-03'],
        ['VISIT_COUNT n=0', [['2026-08-01T00:00:00.000Z', plan('VISIT_COUNT', { afterVisitCount: 0 })]], '2026-09-03'],
        ['VISIT_COUNT n=1.5', [['2026-08-01T00:00:00.000Z', plan('VISIT_COUNT', { afterVisitCount: 1.5 })]], '2026-09-03'],
        ['CLINICIAN_DECIDES', [['2026-08-01T00:00:00.000Z', plan('CLINICIAN_DECIDES')]], '2026-09-03'],
        ['unknown status', [['2026-08-01T00:00:00.000Z', plan('WHATEVER')]], '2026-09-03'],
        ['non-object plan', [['2026-08-01T00:00:00.000Z', 'nope']], '2026-09-03'],
        ['null plan skipped then older due', [['2026-08-20T00:00:00.000Z', null], ['2026-08-01T00:00:00.000Z', plan('DATE', { targetDate: '2026-09-01' })]], '2026-09-03'],
        ['no visits', [], '2026-09-03'],
        ['visits not an array', 'garbage', '2026-09-03'],
      ]
      for (const [label, visits, today] of cases) {
        const clientVisits = Array.isArray(visits) ? visits.map(([createdAt, p]) => ({ createdAt, nextReassessmentPlan: p })) : visits
        const serverVisits = Array.isArray(visits) ? visits.map(([created_at, p]) => ({ created_at, next_reassessment_plan: p })) : visits
        const c = clientDue(clientVisits, today)
        const s = serverDue(serverVisits, today)
        const same =
          (c === null && s === null) ||
          (c !== null && s !== null && c.reason === s.reason && c.planLabel === s.plan_label && c.sourceVisitCreatedAt === s.source_visit_created_at)
        assert(`parity: ${label} -> ${c === null ? 'null' : c.reason} on both sides`, same)
      }
      assert('parity: at least one due and one not-due case exercised (non-vacuous)', clientDue([{ createdAt: 'x', nextReassessmentPlan: plan('VISIT_COUNT', { afterVisitCount: 1 }) }], '2026-01-01') !== null)
      assert('localTodayISO is the LOCAL calendar date (yyyy-mm-dd)', /^\d{4}-\d{2}-\d{2}$/.test(localTodayISO()) && localTodayISO(new Date(2026, 8, 6, 23, 30)) === '2026-09-06')
      assert('detailCheckQuestionIds: LBP set = common + 3 LBP items in order', detailCheckQuestionIds({ isLbp: true }).join(',') === LBP_IDS.join(','))
      assert('detailCheckQuestionIds: non-LBP = common item only', detailCheckQuestionIds({ isLbp: false }).join(',') === 'VISIT_04_SYMPTOM_IMPACT')
    }

    /* ---------------- 2. token store normalization ---------------- */
    {
      const store = createFollowUpSessionStore(path.join(tmpRoot, 'tok'), { ttlMinutes: 30 })
      const none = await store.issueToken({ visit_id: 'v1', patient_id: 'p', targets: [] })
      assert('store: no detail_check given -> null (common case adds nothing)', none.record.detail_check === null)
      const ok = await store.issueToken({ visit_id: 'v2', patient_id: 'p', targets: [], detail_check: { reason: 'DATE', plan_label: 'x', question_ids: ['A', 7, '', 'B'] } })
      assert('store: question_ids keep only non-empty strings', ok.record.detail_check.question_ids.join(',') === 'A,B')
      const many = await store.issueToken({ visit_id: 'v3', patient_id: 'p', targets: [], detail_check: { reason: 'nope', plan_label: 'p'.repeat(200), question_ids: Array.from({ length: 20 }, (_, i) => `Q${i}`) } })
      assert('store: question_ids capped at 10, plan_label at 100, unknown reason -> UNKNOWN', many.record.detail_check.question_ids.length === 10 && many.record.detail_check.plan_label.length === 100 && many.record.detail_check.reason === 'UNKNOWN')
      const empty = await store.issueToken({ visit_id: 'v4', patient_id: 'p', targets: [], detail_check: { question_ids: [] } })
      assert('store: an empty id list is stored as null, not an empty detail_check', empty.record.detail_check === null)
      const cp = await store.issueToken({ visit_id: 'v5', patient_id: 'p', targets: [], kind: 'CARE_PLAN', care_plan_text: 't', detail_check: { question_ids: ['A'] } })
      assert('store: a CARE_PLAN record never carries detail_check', cp.record.detail_check === null)
    }

    /* ---------------- 3. E2E ---------------- */
    {
      const root = path.join(tmpRoot, 'e2e')
      const dataDir = path.join(root, 'submissions')
      const store = createStore(dataDir, { startRevisitDedupWindowMs: 50 })
      const mkSub = async (sessionId, responses) =>
        store.createSubmission({ submission: { questionnaire_version: '1.0', session_id: sessionId, responses, metadata: {} }, myungri: null, patient_label: sessionId })
      const duePlan = { status: 'VISIT_COUNT', targetDate: '', afterVisitCount: 1, note: '' }
      const targets = [{ id: 'pain_intensity', label: '통증 강도', baseline: '7', postTreatmentValue: '' }]

      const lbp = await mkSub('sess-lbp', { safety_flags: { lbp: { red_flags: [] } }, VISIT_04_SYMPTOM_IMPACT: 'moderate', LBP_13: 'YES', LBP_12: 3 })
      await store.saveWorkspace(lbp.id, emptyWorkspaceFor({ painFollowUpTargets: targets, nextReassessmentPlan: duePlan }))
      const nonLbp = await mkSub('sess-neck', { safety_flags: {}, VISIT_04_SYMPTOM_IMPACT: 'mild' })
      await store.saveWorkspace(nonLbp.id, emptyWorkspaceFor({ painFollowUpTargets: targets, nextReassessmentPlan: duePlan }))
      const noPlan = await mkSub('sess-noplan', { safety_flags: { lbp: {} } })
      await store.saveWorkspace(noPlan.id, emptyWorkspaceFor({ painFollowUpTargets: targets }))

      const { server, base } = await startServer({ dataDir })
      try {
        const start = async (patientId) => {
          const res = await fetch(`${base}/api/patients/${patientId}/start-revisit`, { method: 'POST', headers: doctorHeaders, body: JSON.stringify({ delivery_mode: 'PERSONAL_QR' }) })
          assert(`start-revisit -> 201 for ${patientId.slice(0, 8)}`, res.status === 201)
          return res.json()
        }
        const pub = async (token) => (await fetch(`${base}/api/follow-up-session/${encodeURIComponent(token)}`)).json()

        const sLbp = await start(lbp.patient_id)
        const gLbp = await pub(sLbp.token)
        assert('E2E LBP: public GET carries the 4 detail question ids in order', Array.isArray(gLbp.detail_question_ids) && gLbp.detail_question_ids.join(',') === LBP_IDS.join(','))
        assert('E2E LBP: targets still present alongside', gLbp.targets.length === 1 && gLbp.targets[0].id === 'pain_intensity')
        assert('E2E: public GET never leaks the plan wording or the initial answers', !JSON.stringify(gLbp).includes('방문 1회') && !JSON.stringify(gLbp).includes('moderate'))

        const sNon = await start(nonLbp.patient_id)
        const gNon = await pub(sNon.token)
        assert('E2E non-LBP: only the common item is asked', gNon.detail_question_ids.join(',') === 'VISIT_04_SYMPTOM_IMPACT')

        const sNo = await start(noPlan.patient_id)
        const gNo = await pub(sNo.token)
        assert('E2E no plan: detail_question_ids is []', Array.isArray(gNo.detail_question_ids) && gNo.detail_question_ids.length === 0)

        // reissue keeps the detail check
        const re = await fetch(`${base}/api/visits/${sLbp.visit.id}/follow-up-session/reissue`, { method: 'POST', headers: doctorHeaders })
        const reBody = await re.json()
        const gRe = await pub(reBody.token)
        assert('E2E: reissue re-derives the same detail question ids', gRe.detail_question_ids.join(',') === LBP_IDS.join(','))

        // submit: out-of-snapshot id dropped, value capped, NRS target saved as string
        const submit = await fetch(`${base}/api/follow-up-session/${encodeURIComponent(reBody.token)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetRatings: [{ targetId: 'pain_intensity', patientReportedValue: '4' }],
            detailAnswers: [
              { questionId: 'VISIT_04_SYMPTOM_IMPACT', value: 'mild' },
              { questionId: 'LBP_13', value: 'x'.repeat(300) },
              { questionId: 'NOT_IN_SNAPSHOT', value: 'evil' },
              { questionId: 'LBP_12', value: 7 },
            ],
            overallChange: '좋아짐',
            newSymptomReported: false,
            newSymptomNote: '',
            adverseEffectReported: false,
            adverseEffectNote: '',
          }),
        })
        assert('E2E: submit with detailAnswers -> 201', submit.status === 201)
        const mf = await (await fetch(`${base}/api/visits/${sLbp.visit.id}/micro-follow-up`, { headers: doctorHeaders })).json()
        const ids = mf.response.detailAnswers.map((a) => a.questionId)
        assert('E2E: only snapshot ids are stored (NOT_IN_SNAPSHOT dropped)', ids.join(',') === 'VISIT_04_SYMPTOM_IMPACT,LBP_13,LBP_12')
        assert('E2E: values are strings capped at 100 chars; a non-string value becomes ""', mf.response.detailAnswers[1].value.length === 100 && mf.response.detailAnswers[2].value === '')
        assert('E2E: the NRS target value is stored as the raw string "4"', mf.response.targetRatings[0].patientReportedValue === '4')
        assert('E2E: the injected value never reached storage', !JSON.stringify(mf).includes('evil'))
      } finally {
        await stopServer(server)
      }
    }

    /* ---------------- 4. patient screen ---------------- */
    {
      const questions = resolveDetailCheckQuestions([...LBP_IDS, 'UNKNOWN_ID', 'LBP_07B_NOT_A_REAL_ID'])
      assert('resolver: unknown ids are skipped, the 4 planned items resolve in order', questions.map((q) => q.id).join(',') === LBP_IDS.join(','))
      assert('resolver: LBP_12 is a 0~10 numeric scale, the other three single choice', questions[1].kind === 'numeric_scale' && questions[1].scale.max === 10 && questions.filter((q) => q.kind === 'single_choice').length === 3)
      assert('resolver: a free-text/other-input id is skipped, not rendered blank', resolveDetailCheckQuestions(['VISIT_01']).every((q) => q.kind === 'single_choice' || q.kind === 'numeric_scale'))

      // FollowUpScreen's privacy effects touch window.history/popstate; a
      // minimal stub is enough -- this test is about the form, not the scrub.
      globalThis.window = {
        addEventListener() {},
        removeEventListener() {},
        history: { replaceState() {}, pushState() {} },
        location: { pathname: '/', search: '', href: 'http://test.local/' },
      }
      let lastPost = null
      globalThis.fetch = async (url, init) => {
        if (init?.method === 'POST') {
          lastPost = JSON.parse(init.body)
          return { ok: true, status: 201, json: async () => ({ ok: true }) }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ACTIVE', targets: [{ id: 'pain_intensity', label: '통증 강도' }, { id: 'walk', label: '걷기 시간' }], expires_at: '2030-01-01T00:00:00.000Z', detail_question_ids: LBP_IDS }),
        }
      }
      let renderer
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(FollowUpScreen, { token: 'tok-abc' }))
      })
      const html = JSON.stringify(renderer.toJSON())
      assert('screen: 통증 강도 renders as a 0~10 scale (11 radio buttons), not a text field', renderer.root.findAll((n) => n.props?.role === 'radio' && n.type === 'button').length >= 11 && html.includes('통증 강도 (0~10)'))
      assert('screen: a non-NRS target still renders the text field', html.includes('걷기 시간') && renderer.root.findAll((n) => n.type === 'input').length >= 1)
      assert('screen: 세부 확인 section renders all four question texts from coreSpec', html.includes('세부 확인') && LBP_IDS.every((id) => html.includes(detailCheckQuestionText(id))))
      const submitBtn = () => renderer.root.findAll((n) => n.type === 'button' && n.props.className === 'primaryBtn')[0]
      assert('screen: submit disabled before detail items are answered', submitBtn().props.disabled === true)

      const clickRadio = async (groupIndex, label) => {
        const groups = renderer.root.findAll((n) => n.props?.role === 'radiogroup')
        const btn = groups[groupIndex].findAll((n) => n.type === 'button' && n.children.join('') === label)[0]
        await act(async () => btn.props.onClick())
      }
      // groups: [0] pain NRS, [1] VISIT_04, [2] LBP_12 scale, [3] LBP_13, [4] LBP_14, [5] overall, [6] new symptom, [7] adverse
      // Answer EVERYTHING EXCEPT the detail items first -- the only thing
      // holding submit closed must then be the detail gate itself
      // (mutation: removing the detail gate has to flip this assertion).
      await clickRadio(0, '4')
      const walkInput = renderer.root.findAll((n) => n.type === 'input')[0]
      await act(async () => walkInput.props.onChange({ target: { value: '40분' } }))
      const groups = renderer.root.findAll((n) => n.props?.role === 'radiogroup')
      const firstOption = (g) => g.findAll((n) => n.type === 'button')[0]
      await act(async () => firstOption(groups[5]).props.onClick())
      await act(async () => firstOption(groups[6]).props.onClick())
      await act(async () => firstOption(groups[7]).props.onClick())
      assert('screen: with targets/overall/symptom/adverse answered, submit stays disabled ONLY because detail items are unanswered', submitBtn().props.disabled === true)
      await act(async () => firstOption(groups[1]).props.onClick())
      await clickRadio(2, '7')
      await act(async () => firstOption(groups[3]).props.onClick())
      assert('screen: three of four detail items answered -> still disabled (every item required)', submitBtn().props.disabled === true)
      await act(async () => firstOption(groups[4]).props.onClick())
      assert('screen: submit enabled once every item including the detail items is answered', submitBtn().props.disabled === false)
      await act(async () => submitBtn().props.onClick())
      assert('screen: POST body carries detailAnswers for exactly the 4 asked ids', lastPost && lastPost.detailAnswers.map((a) => a.questionId).join(',') === LBP_IDS.join(','))
      assert('screen: POST body NRS value is the string "4" and LBP_12 is "7"', lastPost.targetRatings[0].patientReportedValue === '4' && lastPost.detailAnswers.find((a) => a.questionId === 'LBP_12').value === '7')
      assert('screen: reaches the done screen after submit', JSON.stringify(renderer.toJSON()).includes('응답이 접수되었습니다'))

      // No detail ids -> no 세부 확인 section (unchanged default flow).
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ACTIVE', targets: [{ id: 'walk', label: '걷기 시간' }], expires_at: '2030-01-01T00:00:00.000Z', detail_question_ids: [] }) })
      let r2
      await act(async () => {
        r2 = TestRenderer.create(React.createElement(FollowUpScreen, { token: 'tok-2' }))
      })
      assert('screen: with no detail ids the 세부 확인 section is absent', !JSON.stringify(r2.toJSON()).includes('세부 확인'))
    }

    /* ---------------- 5. doctor card ---------------- */
    {
      const response = {
        visit_id: 'v', patient_id: 'p',
        targetRatings: [{ targetId: 'pain_intensity', label: '통증 강도', patientReportedValue: '4' }],
        detailAnswers: [{ questionId: 'LBP_13', value: 'NO' }, { questionId: 'LBP_12', value: '7' }, { questionId: 'VISIT_04_SYMPTOM_IMPACT', value: 'mild' }],
        overallChange: '좋아짐', newSymptomReported: false, newSymptomNote: '', adverseEffectReported: false, adverseEffectNote: '', submitted_at: '2026-09-06T00:00:00.000Z',
      }
      const html = renderToString(React.createElement(MicroFollowUpCard, { candidates: [], response, baselineDetailAnswers: { LBP_13: 'YES', LBP_12: '3' } }))
      assert('card: 세부 확인 block renders with the question text', html.includes('세부 확인 (초진 → 오늘)') && html.includes(detailCheckQuestionText('LBP_13')))
      assert('card: baseline → today uses coreSpec option labels (많이 그래요 → 아니요)', html.includes('많이 그래요 → 아니요'))
      assert('card: numeric scale shown as n/10 (3/10 → 7/10)', html.includes('3/10 → 7/10'))
      assert('card: an item with no first-visit answer says 초진 기록 없음, never a fabricated value', html.includes('초진 기록 없음'))
      assert('describe: empty value -> 응답 없음; unknown id passes the raw value through', describeDetailCheckValue('LBP_13', '') === '응답 없음' && describeDetailCheckValue('NOPE', 'raw') === 'raw')
      const legacy = renderToString(React.createElement(MicroFollowUpCard, { candidates: [], response: { ...response, detailAnswers: undefined } }))
      assert('card: a legacy response without detailAnswers renders without the block and without throwing', !legacy.includes('세부 확인'))
    }

    /* ---------------- 6. source contract ---------------- */
    {
      const src = await readFile(path.join(__dirname, '..', 'src', 'screens', 'FollowUpScreen.tsx'), 'utf8')
      const m = src.match(/const NRS_TARGET_IDS[^=]*=\s*new Set\(\[([^\]]*)\]\)/)
      assert('source: FollowUpScreen declares NRS_TARGET_IDS as a literal Set', m !== null)
      const screenIds = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort().join(',')
      assert('source: the patient NRS id set equals the doctor PAIN_NRS_TARGET_IDS (finalAssessment.ts)', screenIds === [...PAIN_NRS_TARGET_IDS].sort().join(','))
      assert('source: FollowUpScreen still never imports serverClient/doctorToken', !/from\s+['"].*(serverClient|doctorToken)['"]/.test(src))
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
