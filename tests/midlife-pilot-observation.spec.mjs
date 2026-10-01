// 갱년기 파일럿 관찰 집계 스크립트(scripts/midlife-pilot-observation.mjs) 회귀 테스트.
//
// 이 출력의 숫자로 PO가 "문항을 줄일지", "4주 목표 동선을 고칠지", "재진 링크 발급을 점검할지"를
// 정한다. 조용히 잘못 세면 잘못된 결정이 된다. 집계·필터·시간 계산·임계값·손상 입력 내성·
// 개인정보 미출력을 고정한다. 합성 기록만 쓴다 — 실제 환자 데이터는 이 저장소에 없다.
//
// Run via `npm run test:midlife-pilot-observation`.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dwellByQuestion, quantile, THRESHOLDS, SAFETY_STATUSES, REFERRAL_STATUSES, MIDLIFE_GOAL_ID_PREFIX } from '../scripts/midlife-pilot-observation.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = path.join(ROOT, 'scripts', 'midlife-pilot-observation.mjs')
const SOURCE = readFileSync(SCRIPT, 'utf8')

// 개인정보 미출력 확인용 표식 — 합성 기록의 이름·전화·자유서술·메모에 심는다.
const PHI = '홍길순테스트'
const PHONE = '010-9999-0000'
const FREE = '자유서술비밀문장'
const NOTE = '원장메모비밀문장'

const DAY = 86_400_000
const NOW = Date.now()
const iso = (ms) => new Date(ms).toISOString()

/**
 * 서버가 실제로 저장하는 모양(store.js record + persistence.ts WorkspaceState)의 합성 기록.
 * @param {object} o
 * @param {boolean} [o.midlife]
 * @param {number} [o.totalSec]  문진 시작 → 제출(초). null = 시작 시각 없음
 * @param {number} [o.daysAgo]
 * @param {Record<string, number>} [o.dwell]  문항 id → 머문 초(순서대로 응답)
 * @param {string|null} [o.safety]  safety_flags.midlife.status, null = 객체 없음(옛 기록)
 * @param {boolean} [o.halted]
 * @param {object|null} [o.workspace]
 */
function record(id, { midlife = true, totalSec = 200, daysAgo = 1, dwell, safety = 'CLEAR', halted = false, workspace = null } = {}) {
  const created = NOW - daysAgo * DAY
  const start = totalSec == null ? null : created - totalSec * 1000
  const answers = {}
  if (start != null) {
    let t = start
    const plan = dwell ?? { ID_01: 10, MID_01: 20, MID_04: 30, MID_08: 10 }
    for (const [qid, sec] of Object.entries(plan)) {
      t += sec * 1000
      answers[qid] = { answered_at: iso(t), source_screen: qid, changed_after_back: false }
    }
  }
  const metadata = { session_started_at: start == null ? null : iso(start), answers }
  if (halted) metadata.questionnaire_halted = { at_question: 'MID_08', reason: 'midlife_self_harm_sop' }
  return {
    record_schema_version: 1,
    id,
    created_at: iso(created),
    status: 'new',
    patient_label: `${PHI} (${PHONE})`,
    patient_id: `p-${id}`,
    visit_id: `v-${id}`,
    submission: {
      responses: {
        patient: { name: PHI, phone: PHONE },
        primary_concern: midlife ? { key: 'midlife', router_target: 'Midlife' } : { key: 'pain', router_target: 'Pain' },
        free_text: FREE,
        safety_flags: safety === null ? {} : { midlife: { status: safety } },
      },
      metadata,
    },
    workspace,
  }
}

function ws({ lifeStage = '', hypothesis = '', goals = 0, referrals = [], reviews = [] } = {}) {
  const targets = [{ id: 'herbal:sleep', label: '수면', baseline: null, postTreatmentValue: null }]
  for (let i = 0; i < goals; i++) targets.push({ id: `${MIDLIFE_GOAL_ID_PREFIX}g${i}`, label: '목표', baseline: null, postTreatmentValue: null })
  return {
    schema_version: '1.1.0',
    herbalFollowUpTargets: targets,
    midlifeCare: {
      lifeStage,
      hypothesis,
      refutationTrigger: '',
      expectedCourse: '',
      nextReviewWeek: null,
      referrals: referrals.map((status, i) => ({ id: `r${i}`, label: '검사', urgency: 'non_urgent', status, note: NOTE, updatedAt: null })),
      reviews,
    },
  }
}

function run(files, followUps = null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'midlife-pilot-'))
  const sub = path.join(dir, 'submissions')
  mkdirSync(sub)
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(sub, name), typeof body === 'string' ? body : JSON.stringify(body))
  if (followUps) {
    mkdirSync(path.join(dir, 'micro-follow-up'))
    for (const [name, body] of Object.entries(followUps)) writeFileSync(path.join(dir, 'micro-follow-up', name), JSON.stringify(body))
  }
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, SAMINDANG_DATA_DIR: sub }, encoding: 'utf8' })
  rmSync(dir, { recursive: true, force: true })
  return { out: r.stdout + r.stderr, code: r.status }
}

// ---------------------------------------------------------------------------
// 1. 순수 함수
// ---------------------------------------------------------------------------
assert('quantile: 중앙값(가장 가까운 순위)', quantile([1, 2, 3, 4], 0.5) === 2 && quantile([5], 0.75) === 5 && quantile([], 0.5) === null)
{
  const meta = {
    session_started_at: iso(0),
    answers: { B: { answered_at: iso(30_000) }, A: { answered_at: iso(10_000) }, C: { answered_at: 'not-a-date' } },
  }
  const d = dwellByQuestion(meta)
  assert('dwellByQuestion: 응답 시각 순서로 앞 응답과의 차(첫 문항은 문진 시작부터)', d.get('A') === 10_000 && d.get('B') === 20_000 && !d.has('C'))
}

// 상수 = TS 원본 값(한쪽만 바뀌면 조용히 잘못 센다)
{
  const careTs = readFileSync(path.join(ROOT, 'src/doctor/workspace/midlifeCare.ts'), 'utf8')
  const logicTs = readFileSync(path.join(ROOT, 'src/spec/midlifeLogic.ts'), 'utf8')
  assert('REFERRAL_STATUSES = midlifeCare.ts MIDLIFE_REFERRAL_STATUSES', careTs.includes(`MIDLIFE_REFERRAL_STATUSES = [${REFERRAL_STATUSES.map((s) => `'${s}'`).join(', ')}] as const`))
  assert("MIDLIFE_GOAL_ID_PREFIX = midlifeCare.ts", careTs.includes(`MIDLIFE_GOAL_ID_PREFIX = '${MIDLIFE_GOAL_ID_PREFIX}'`))
  assert('SAFETY_STATUSES = midlifeLogic.ts MidlifeSafetyStatus', logicTs.includes(`MidlifeSafetyStatus = ${SAFETY_STATUSES.map((s) => `'${s}'`).join(' | ')}`))
  const coreTs = readFileSync(path.join(ROOT, 'src/spec/coreSpec.ts'), 'utf8')
  assert("SOP 중단 reason 'midlife_self_harm_sop' = coreSpec.ts QUESTIONNAIRE_HALT_REASON", coreTs.includes("'midlife_self_harm_sop'") && SOURCE.includes("'midlife_self_harm_sop'"))
}

// ---------------------------------------------------------------------------
// 2. 전체 집계 — 갱년기 4건 + 통증 1건 + 깨진 파일 1건
// ---------------------------------------------------------------------------
{
  const files = {
    'a.json': record('a', {
      totalSec: 150,
      daysAgo: 20,
      safety: 'CLEAR',
      dwell: { ID_01: 10, MID_01: 20, MID_04: 60, MID_08: 10 },
      workspace: ws({ lifeStage: 'early_transition', hypothesis: '가설 있음', goals: 2, referrals: ['result_reviewed'], reviews: [{ week: 2, reviewedOn: '2026-10-01', courseVsExpected: 'as_expected', note: NOTE }] }),
    }),
    'b.json': record('b', {
      totalSec: 280,
      daysAgo: 20,
      safety: 'PRIORITY_EVALUATION',
      dwell: { ID_01: 10, MID_01: 40, MID_04: 80, MID_08: 20 },
      workspace: ws({ goals: 0, referrals: ['ordered', 'pending'] }),
    }),
    'c.json': record('c', { totalSec: 400, daysAgo: 2, safety: 'URGENT_REVIEW', halted: true, dwell: { ID_01: 10, MID_01: 30, MID_04: 70, MID_08: 50 } }),
    'd.json': record('d', { totalSec: 3600, daysAgo: 1, safety: null }), // 대기·자리 비움
    'e.json': record('e', { midlife: false, totalSec: 100 }),
    'broken.json': '{ not json',
  }
  const followUps = {
    'f1.json': { visit_id: 'v-a', detailAnswers: [{ questionId: 'MID_05', value: 4 }] },
    'f2.json': { visit_id: 'v-b', detailAnswers: [{ questionId: 'PAIN_03', value: 4 }] }, // 갱년기 PRO 아님
    'f3.json': { visit_id: 'v-e', detailAnswers: [{ questionId: 'MID_05', value: 4 }] }, // 갱년기 아닌 방문
  }
  const { out, code } = run(files, followUps)

  assert('종료 코드 0', code === 0)
  assert('전체 제출 5건(깨진 파일 1건 제외 표기)', out.includes('전체 제출   : 5건 (읽을 수 없는 파일 1건 제외)'))
  assert('갱년기 제출 4건(통증 제출 제외)', out.includes('갱년기 제출 : 4건'))
  assert('① 시간 집계 3건, 30분 이상 1건 제외', out.includes('시간 집계 대상 3건') && out.includes('대기·자리 비움 1건 제외'))
  assert('① 전체 중앙값 = 280초(4분 40초)', out.includes('중앙값 4분 40초'))
  assert('① 3분 이내 1건, 5분 이내 2건', /3분 이내\s+1건\s+33\.3%/.test(out) && /5분 이내\s+2건\s+66\.7%/.test(out))
  assert('① 가장 오래 머문 화면 1위 = MID_04(중앙값 70초)', /가장 오래 머문[^\n]*\n\s+MID_04\s+70초\s+\(3건\)/.test(out))
  assert('① 갱년기 모듈 시간은 MID_* 만 합산(ID_01 제외) — 중앙값 140초', out.includes('갱년기 모듈(MID_*) 중앙값 2분 20초'))
  assert('② 안전 분포: URGENT 1, 우선 외부평가 1, 해당 없음 1, 판정 없음 1', /URGENT\s+1건/.test(out) && /우선 외부평가\s+1건/.test(out) && /해당 없음\s+1건/.test(out) && /판정 없음\(옛 기록\)\s+1건/.test(out))
  assert('② MID_08 SOP 중단 1건', /SOP로 문진 중단\s+1건/.test(out))
  assert('③ 원장 화면 저장 2건(분모)', /원장 화면 저장됨\s+2건\s+50\.0%/.test(out))
  assert('③ 생애단계 1/2, 가설 1/2, 4주 목표 1/2, review 1/2', /생애단계 선택\s+1건\s+50\.0%/.test(out) && /가설 기록\s+1건\s+50\.0%/.test(out) && /4주 목표 설정\s+1건\s+50\.0%/.test(out) && /주차 review 기록\s+1건\s+50\.0%/.test(out))
  assert('③ 외부 평가 3건 중 미해결 2건(결과 확인함만 해결)', out.includes('외부 평가 3건, 미해결 2건'))
  assert('④ 재진 PRO: 갱년기 방문 + MID_05~07 답만 센다(통증 문항·다른 방문 제외)', out.includes('응답 1건 · 응답한 갱년기 방문 1건'))
  assert('④ 14일 경과 방문 2건 중 응답 1건(최근 방문은 분모에서 빠짐)', /14일 경과 방문 2건 중 응답 1건\s+50\.0%/.test(out))

  assert('판정: 10건 미만 경고', out.includes('갱년기 기록이 4건입니다 (기준 10건)'))
  assert('판정: 원장 저장 50% < 80% 경고', out.includes('원장 화면 저장이 50.0%입니다'))
  assert('판정: 4주 목표 50% < 70% 경고', out.includes('4주 목표 설정이 50.0%입니다'))
  assert('판정: 재진 PRO 50%는 기준(50%) 이상이라 경고 없음', !out.includes('재진 PRO 응답이'))
  assert('판정: 미해결 외부 평가 경고', out.includes('결과를 확인하지 않은 외부 평가가 2건'))
  assert('판정: 중앙값 4분 40초는 5분 이내라 시간 경고 없음', !out.includes('소요시간 중앙값이'))

  assert('개인정보: 이름·전화·자유서술·메모가 출력에 없다', ![PHI, PHONE, FREE, NOTE, '가설 있음'].some((s) => out.includes(s)))
}

// ---------------------------------------------------------------------------
// 3. 시간 경고 · 0건 · 폴더 없음
// ---------------------------------------------------------------------------
{
  const slow = {}
  for (let i = 0; i < 3; i++) slow[`s${i}.json`] = record(`s${i}`, { totalSec: 420 })
  const { out } = run(slow)
  assert('판정: 중앙값 7분 > 5분이면 시간 경고', out.includes('태블릿 전체 소요시간 중앙값이 7분 00초입니다'))
  assert('재진 응답 폴더가 없으면 안내만(오류 아님)', out.includes('재진 링크 응답 폴더가 없습니다'))
}
{
  const { out } = run({ 'e.json': record('e', { midlife: false }) })
  assert('갱년기 0건이면 그렇게 말하고 끝낸다', out.includes('갱년기 제출 기록이 0건입니다'))
}
{
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, SAMINDANG_DATA_DIR: path.join(tmpdir(), 'no-such-midlife-dir-xyz') }, encoding: 'utf8' })
  assert('폴더가 없으면 종료 코드 1 + 원장 PC에서 실행하라는 안내', r.status === 1 && r.stderr.includes('원장님 로컬 PC에서 실행'))
}

// ---------------------------------------------------------------------------
// 4. 개인정보 — 소스가 이름·연락처·자유서술 필드를 읽지 않는다
// ---------------------------------------------------------------------------
for (const field of ['patient_label', 'responses.patient', '.name', '.phone', 'free_text', 'FREE_01', '.note', 'birth']) {
  assert(`소스가 '${field}'를 참조하지 않는다`, !SOURCE.includes(field))
}
assert('가설은 비어 있는지만 본다(출력하지 않음)', /care\.hypothesis\.trim\(\) !== ''/.test(SOURCE) && (SOURCE.match(/care\.hypothesis/g) || []).length === 2)
assert('임계값은 제안값으로 문서화되어 있다', SOURCE.includes('**제안값**') && THRESHOLDS.TOTAL_MEDIAN_MAX_MIN === 5 && THRESHOLDS.MIN_N === 10)

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
