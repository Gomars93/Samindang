// 회고 파일럿 스크립트(scripts/lbp-stage-distribution.mjs) 회귀 테스트.
//
// 왜 스크립트에까지 테스트를 붙이는가: 이 스크립트의 출력 숫자 하나로
// "규칙을 그대로 갈 것인가 다시 만들 것인가"가 결정된다. 조용히 잘못 세면
// 원장이 잘못된 임상 결정을 내린다. 집계·필터·경고 임계값을 전부 고정한다.
//
// 합성 기록만 쓴다 — 실제 환자 데이터는 이 저장소에 존재하지 않는다.
//
// Run via `npm run test:lbp-stage-pilot`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = path.join(ROOT, 'scripts', 'lbp-stage-distribution.mjs')
const SCRIPT_SOURCE = readFileSync(SCRIPT, 'utf8')

function record(id, { impact, duration, loc = 'low_back_pelvis', interval, fear, work } = {}) {
  const lbp = {}
  if (interval) lbp.recurrence_interval = interval
  if (fear) lbp.fear_avoidance = fear
  if (work) lbp.work_impact = work
  return {
    id,
    submission: {
      responses: {
        pain: { primary_location: loc },
        visit_goal: { chief_impact: impact, chief_duration: duration },
        safety_flags: { lbp },
      },
    },
  }
}

function run(records, extraFiles = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lbp-pilot-'))
  try {
    records.forEach((r, i) => writeFileSync(path.join(dir, `r${i}.json`), JSON.stringify(r)))
    for (const [name, body] of Object.entries(extraFiles)) writeFileSync(path.join(dir, name), body)
    return execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, SAMINDANG_DATA_DIR: dir },
      encoding: 'utf8',
      cwd: ROOT,
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** "0단계 · 보호/안정  2건  25.0%" 같은 줄에서 건수를 뽑는다. */
function countFor(out, label) {
  const m = out.match(new RegExp(`${label}\\s+(\\d+)건`))
  if (!m) throw new Error(`FAIL: 출력에 '${label}' 줄이 없다\n---\n${out}`)
  return Number(m[1])
}

// ---------------------------------------------------------------------------
// 1. 손으로 검산한 10건 — 집계 전 항목이 정확히 일치해야 한다
// ---------------------------------------------------------------------------

const TEN = [
  record('a', { impact: 'severe', duration: 'within_1w' }), // 1 - 1 = 0
  record('b', { impact: 'severe', duration: '1_3m' }), // 1
  record('c', { impact: 'moderate', duration: 'within_1w' }), // 2 - 1 = 1
  record('d', { impact: 'moderate', duration: '1_3m' }), // 2
  record('e', { impact: 'mild', duration: '1_3m' }), // 3
  record('f', { impact: 'minimal', duration: 'over_1y', fear: 'YES' }), // 3 → 상한 2
  record('g', { impact: 'mild', duration: '1_3m', interval: 'within_3m' }), // 3 - 1 = 2
  record('h', { impact: undefined, duration: '1_3m' }), // 판단 불가
  record('i', { impact: 'severe', duration: 'within_1w', loc: 'neck' }), // 요통 아님 → 제외
  record('j', { impact: 'moderate', duration: 'within_1w', interval: 'within_3m' }), // 2 - 2 = 0
]

{
  const out = run(TEN)
  assert('전체 제출 10건', /전체 제출\s+:\s*10건/.test(out))
  assert('요통 주호소 9건 (목통증 1건 제외)', /요통 주호소\s+:\s*9건/.test(out))
  assert('판정 8건 / 판단 불가 1건', /단계 판정됨\s+:\s*8건 \(판단 불가 1건\)/.test(out))

  assert('0단계 2건', countFor(out, '0단계 · 보호/안정') === 2)
  assert('1단계 2건', countFor(out, '1단계 · 증상 조절') === 2)
  assert('2단계 3건', countFor(out, '2단계 · 움직임 조절') === 3)
  assert('3단계 1건', countFor(out, '3단계 · 기능 최적화') === 1)

  assert('급성 격하 3회', countFor(out, '발병 1주 이내 격하') === 3)
  assert('재발 격하 2회', countFor(out, '3개월 내 재발 격하') === 2)
  assert('공포회피 상한 1회', countFor(out, '공포회피 상한') === 1)

  assert('판단 불가 11.1% 경고가 뜬다 (기준 10%)', out.includes('판단 불가가 11.1%'))
  assert('표본 부족 경고가 뜬다 (8건 < 20건)', out.includes('판정 건수가 8건으로 적습니다'))
  assert('환자 식별자를 출력하지 않는다', !/\ba\b.*\bb\b/.test(out) && !out.includes('"id"'))
}

// ---------------------------------------------------------------------------
// 2. 경고 임계값 — 각각이 실제로 발동하는지 (공허하지 않은지)
// ---------------------------------------------------------------------------

{
  // 0단계 > 30%: severe+급성 15건 + mild 5건 = 0단계 75%
  const recs = [
    ...Array.from({ length: 15 }, (_, i) => record(`z${i}`, { impact: 'severe', duration: 'within_1w' })),
    ...Array.from({ length: 5 }, (_, i) => record(`y${i}`, { impact: 'mild', duration: '1_3m' })),
  ]
  const out = run(recs)
  assert('0단계 과다 경고 발동 (75% > 30%)', out.includes('0단계가 75.0%입니다'))
  assert('동시에 편중 경고도 발동 (75%는 80% 미만이라 미발동)', !out.includes('(기준 80%)'))
}
{
  // 한 단계 > 80%: moderate 25건 전부 2단계 = 100%
  const recs = Array.from({ length: 25 }, (_, i) => record(`m${i}`, { impact: 'moderate', duration: '1_3m' }))
  const out = run(recs)
  assert('단계 편중 경고 발동 (100% > 80%)', out.includes('100.0%가 몰렸습니다'))
  assert('표본 25건이면 표본 부족 경고 없음', !out.includes('판정 건수가'))
}
{
  // 재발 필드가 하나도 없을 때의 안내 (LBP_07B 도입 전 기록)
  const recs = Array.from({ length: 25 }, (_, i) => record(`n${i}`, { impact: 'mild', duration: '1_3m' }))
  const out = run(recs)
  assert('재발 간격 필드 부재 안내가 뜬다', out.includes('재발 간격(LBP_07B) 답변이 있는 기록이 0건'))
  assert(
    '그 안내가 "규칙이 안 걸린 것이 아니다"라고 명시한다',
    out.includes('입력이 없는 것입니다'),
  )
}
{
  // 재발 필드가 있으면 그 안내는 사라진다
  const recs = Array.from({ length: 25 }, (_, i) =>
    record(`p${i}`, { impact: 'mild', duration: '1_3m', interval: i === 0 ? 'over_1y' : undefined }),
  )
  const out = run(recs)
  assert('재발 필드가 1건이라도 있으면 부재 안내가 사라진다', !out.includes('LBP_07B) 답변이 있는 기록이 0건'))
}
{
  // 경고가 하나도 없는 정상 분포
  const recs = [
    ...Array.from({ length: 10 }, (_, i) => record(`q${i}`, { impact: 'moderate', duration: '1_3m', interval: 'over_1y' })),
    ...Array.from({ length: 10 }, (_, i) => record(`r${i}`, { impact: 'mild', duration: '1_3m' })),
    ...Array.from({ length: 8 }, (_, i) => record(`s${i}`, { impact: 'severe', duration: '1_3m' })),
  ]
  const out = run(recs)
  assert('편중 없는 분포에서는 통과 메시지가 뜬다', out.includes('편중·미응답 경고 없음'))
}

// ---------------------------------------------------------------------------
// 3. 손상 입력 내성 — 파일럿이 중간에 죽으면 아무 답도 못 얻는다
// ---------------------------------------------------------------------------

{
  const out = run(
    [record('ok', { impact: 'mild', duration: '1_3m' })],
    {
      'broken.json': '{ not json at all',
      'empty.json': '',
      'null.json': 'null',
      'noSubmission.json': JSON.stringify({ id: 'x' }),
      'arraySubmission.json': JSON.stringify({ submission: [] }),
      'stringResponses.json': JSON.stringify({ submission: { responses: 'x' } }),
      'notes.txt': 'ignored — .json이 아니다',
    },
  )
  assert('손상 파일이 섞여도 스크립트가 끝까지 돈다', out.includes('요통 운동 단계'))
  assert('JSON 파싱 실패 2건만 읽을 수 없는 파일로 센다 (구조 불량은 조용히 건너뜀)', /읽을 수 없는 파일 2건 제외/.test(out))
  assert('정상 1건은 그대로 판정된다', countFor(out, '3단계 · 기능 최적화') === 1)
}

// ---------------------------------------------------------------------------
// 4. 데이터가 없을 때 — 원장이 다음에 뭘 할지 알 수 있어야 한다
// ---------------------------------------------------------------------------

{
  const out = run([record('neck', { impact: 'severe', duration: 'within_1w', loc: 'neck' })])
  assert('요통 0건이면 그 사실을 말한다', out.includes('요통 제출 기록이 0건입니다'))
  assert('요통 0건이면 다음 행동을 제시한다', out.includes('실환자 파일럿으로 바로 가야 합니다'))
}

{
  let out = ''
  try {
    execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, SAMINDANG_DATA_DIR: path.join(tmpdir(), 'definitely-not-here-xyz') },
      encoding: 'utf8',
      cwd: ROOT,
    })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  assert('폴더가 없으면 exit code가 0이 아니다', out.length > 0)
  assert('폴더가 없으면 로컬에서 돌리라고 안내한다', out.includes('원장님 로컬 PC에서 실행'))
  assert('SAMINDANG_DATA_DIR 사용법을 알려준다', out.includes('SAMINDANG_DATA_DIR='))
}

// ---------------------------------------------------------------------------
// 5. 개인정보 — 스크립트가 애초에 그 필드들을 읽지 않는다
// ---------------------------------------------------------------------------

const PII_FIELDS = ['patient_name', 'phone_last4', 'birth', 'patient_label', 'myungri', 'note']
for (const f of PII_FIELDS) {
  assert(`개인정보: 스크립트가 '${f}'를 읽지 않는다`, !SCRIPT_SOURCE.includes(f))
}
assert(
  '개인정보: 기록 전체를 그대로 출력하는 코드가 없다',
  !/console\.log\([^)]*record\b/.test(SCRIPT_SOURCE) && !/JSON\.stringify\(record/.test(SCRIPT_SOURCE),
)

console.log(`\n${passCount} assertions passed.`)
