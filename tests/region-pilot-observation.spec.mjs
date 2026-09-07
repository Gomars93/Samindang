// 파일럿 관찰 집계 스크립트(scripts/region-pilot-observation.mjs) 회귀 테스트.
//
// 왜 스크립트에까지 테스트를 붙이는가: 이 출력의 숫자로 원장이 v1.1에서 "굴곡 호전형 운동을
// 추가할지", "방향성 운동을 지울지", "신경 검사 안내문을 고칠지"를 결정한다. 조용히 잘못 세면
// 잘못된 임상 결정이 된다. 집계·필터·임계값·손상 입력 내성·개인정보 미열람을 전부 고정한다.
//
// 합성 기록만 쓴다 — 실제 환자 데이터는 이 저장소에 존재하지 않는다.
//
// Run via `npm run test:region-pilot-observation`.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
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
const SCRIPT = path.join(ROOT, 'scripts', 'region-pilot-observation.mjs')
const SOURCE = readFileSync(SCRIPT, 'utf8')

// ---------------------------------------------------------------------------
// 합성 기록 빌더 — 서버가 실제로 저장하는 모양(store.js record + persistence.ts WorkspaceState)
// ---------------------------------------------------------------------------

function exam(id, status) {
  return { id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } }
}

function rehab(id, status) {
  return { id, title: id, goal: '', rationale: '', sourceFacts: [], contraindicationFacts: [], source: 'SUGGESTED', status, clinicianFinalInstruction: '' }
}

/**
 * @param {object} o
 * @param {'neck'|'lbp'} [o.region]
 * @param {string|null} [o.directional]  null = regionClinical 항목 자체가 없음(옛 기록)
 * @param {Record<string,string>} [o.exams]  examId → status
 * @param {Record<string,string>} [o.rehab]  exerciseId → status
 * @param {boolean} [o.workspace]  false = 원장 화면을 연 적 없음
 */
function record(id, { region = 'neck', directional = 'NOT_ASSESSED', exams = {}, rehab: rehabMap = {}, workspace = true, impact, duration } = {}) {
  const loc = region === 'lbp' ? 'low_back_pelvis' : region
  const ws = workspace
    ? {
        schema_version: '1.1.0',
        painExamSuggestions: Object.entries(exams).map(([eid, st]) => exam(eid, st)),
        painRehabSuggestions: Object.entries(rehabMap).map(([xid, st]) => rehab(xid, st)),
        lbpDirectionalResponse: region === 'lbp' && directional ? directional : 'NOT_ASSESSED',
        regionClinical: region !== 'lbp' && directional !== null ? { [region]: { directionalResponse: directional, workingHypothesis: { supports: {}, recordedAt: null }, confirmedStage: null } } : {},
        updated_at: null,
      }
    : null
  return {
    id,
    visit_id: `visit-${id}`,
    submission: {
      responses: {
        pain: { primary_location: loc },
        visit_goal: { chief_impact: impact, chief_duration: duration },
        safety_flags: { [region]: {} },
      },
    },
    workspace: ws,
  }
}

function followUp(visitId, detailAnswers) {
  return { visit_id: visitId, patient_id: 'p', targetRatings: [], overallChange: '', detailAnswers }
}

function run(records, { followUps = [], extraFiles = {}, args = ['neck'], noFollowUpDir = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'region-pilot-obs-'))
  const dir = path.join(root, 'submissions')
  mkdirSync(dir)
  try {
    records.forEach((r, i) => writeFileSync(path.join(dir, `r${i}.json`), JSON.stringify(r)))
    for (const [name, body] of Object.entries(extraFiles)) writeFileSync(path.join(dir, name), body)
    if (!noFollowUpDir) {
      const fu = path.join(root, 'micro-follow-up')
      mkdirSync(fu)
      followUps.forEach((f, i) => writeFileSync(path.join(fu, `f${i}.json`), JSON.stringify(f)))
    }
    const res = spawnSync(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, SAMINDANG_DATA_DIR: dir },
      encoding: 'utf8',
      cwd: ROOT,
    })
    return { out: res.stdout, err: res.stderr, status: res.status }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** "굴곡 호전      3건  33.3%" 같은 줄에서 건수를 뽑는다. */
function countFor(out, label) {
  const m = out.match(new RegExp(`${label}\\s+(\\d+)건`))
  if (!m) throw new Error(`FAIL: 출력에 '${label}' 줄이 없다\n---\n${out}`)
  return Number(m[1])
}

/** 운동 id 표 행: "NECK_DIR_01   3     1     1     1     0  방향성 조건부(신전 호전)" */
function adoptionRow(out, exerciseId) {
  const m = out.match(new RegExp(`^\\s*${exerciseId}\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)(.*)$`, 'm'))
  if (!m) throw new Error(`FAIL: 출력에 '${exerciseId}' 행이 없다\n---\n${out}`)
  return { shown: +m[1], accepted: +m[2], held: +m[3], rejected: +m[4], pending: +m[5], remark: m[6].trim() }
}

const C5 = 'neck_exam_neuro_c5_t1'
const UMN = 'neck_exam_umn'
const BOTH_NEG = { [C5]: 'NEGATIVE', [UMN]: 'NEGATIVE' }

// ---------------------------------------------------------------------------
// 1. 손으로 검산한 12건 — 집계 전 항목이 정확히 일치해야 한다
// ---------------------------------------------------------------------------

const TWELVE = [
  record('n1', { directional: 'EXTENSION_FAVORABLE', exams: BOTH_NEG, rehab: { NECK_DIR_01: 'ACCEPTED', NECK_MOB_01: 'ACCEPTED' }, impact: 'moderate', duration: '1_3m' }),
  record('n2', { directional: 'EXTENSION_FAVORABLE', exams: BOTH_NEG, rehab: { NECK_DIR_01: 'REJECTED' } }),
  record('n3', { directional: 'EXTENSION_FAVORABLE', exams: { [C5]: 'NEGATIVE' }, rehab: { NECK_DIR_01: 'HELD' } }), // UMN 미기록
  record('n4', { directional: 'FLEXION_FAVORABLE' }), // 신경 검사 0
  record('n5', { directional: 'FLEXION_FAVORABLE', exams: BOTH_NEG, rehab: { NECK_MOB_01: 'SUGGESTED' } }),
  record('n6', { directional: 'FLEXION_FAVORABLE', exams: { [C5]: 'NEGATIVE', [UMN]: 'POSITIVE' } }), // 차단
  record('n7', { directional: 'NO_CLEAR_DIRECTION', exams: BOTH_NEG }),
  record('n8', { directional: 'NOT_ASSESSED' }),
  record('n9', { directional: null, rehab: { NECK_MOB_01: 'BOGUS' } }), // 옛 기록: regionClinical 없음, 손상 상태값
  record('n10', { workspace: false }), // 원장 화면 연 적 없음
  record('l1', { region: 'lbp', directional: 'EXTENSION_FAVORABLE', exams: BOTH_NEG }), // 요통 → 제외
  record('n11', { workspace: false }),
]
const FOLLOW_UPS = [
  followUp('visit-n1', [{ questionId: 'VISIT_04_SYMPTOM_IMPACT', value: 'mild' }, { questionId: 'NECK_12', value: 'worse' }]), // 답변 있음
  followUp('visit-n2', [{ questionId: 'NECK_12', value: '' }]), // 빈 답
  followUp('visit-n3', [{ questionId: 'VISIT_04_SYMPTOM_IMPACT', value: 'mild' }]), // 부위 문항 없음
  followUp('visit-l1', [{ questionId: 'NECK_12', value: 'same' }]), // 요통 방문 → 제외
  followUp('visit-zzz', [{ questionId: 'NECK_12', value: 'same' }]), // 어느 제출에도 없는 방문 → 제외
]

{
  const { out, status } = run(TWELVE, { followUps: FOLLOW_UPS, extraFiles: { 'bad.json': '{not json' } })
  assert('정상 종료(exit 0)', status === 0)
  assert('전체 제출 12건 + 읽을 수 없는 파일 1건 제외', /전체 제출\s+:\s*12건 \(읽을 수 없는 파일 1건 제외\)/.test(out))
  assert('목 주호소 11건 (요통 1건 제외)', /목 주호소\s+:\s*11건/.test(out))
  assert('원장 화면 저장됨 9건 (미저장 2건 제외)', /원장 화면 저장됨\s*:\s*9건/.test(out))

  assert('② 미시행 2건 (NOT_ASSESSED 1 + regionClinical 없음 1)', countFor(out, '미시행') === 2)
  assert('② 굴곡 호전 3건', countFor(out, '굴곡 호전') === 3)
  assert('② 신전 호전 3건', countFor(out, '신전 호전') === 3)
  assert('② 뚜렷한 방향 없음 1건', countFor(out, '뚜렷한 방향 없음') === 1)
  assert('② 원위부 악화 0건', countFor(out, '원위부 악화') === 0)

  assert('③ 대상 검사 = 팩 neuroExamIds 두 개', out.includes(`대상 검사: ${C5}, ${UMN}`))
  assert('③ 전부 기록됨 5건', countFor(out, '전부 기록됨') === 5)
  assert('③ 하나도 기록 안 됨 3건', countFor(out, '하나도 기록 안 됨') === 3)
  assert('③ POSITIVE 있음 1건', countFor(out, 'POSITIVE 있음') === 1)

  const dir = adoptionRow(out, 'NECK_DIR_01')
  assert('⑦ NECK_DIR_01 후보 3 / 채택 1 / 보류 1 / 배제 1 / 미결 0', dir.shown === 3 && dir.accepted === 1 && dir.held === 1 && dir.rejected === 1 && dir.pending === 0)
  assert('⑦ NECK_DIR_01 비고 = 방향성 조건부(신전 호전)', dir.remark === '방향성 조건부(신전 호전)')
  const mob = adoptionRow(out, 'NECK_MOB_01')
  assert('⑦ NECK_MOB_01 후보 3 / 채택 1 / 미결 2 (손상 상태값은 미결로)', mob.shown === 3 && mob.accepted === 1 && mob.pending === 2)
  assert('⑦ NECK_MOB_01 비고 없음', mob.remark === '')
  assert('⑦ 후보로 뜬 적 없는 운동도 0행으로 표에 있다', adoptionRow(out, 'NECK_EXPO_01').shown === 0)
  assert('⑦ 운동 1개 이상 채택된 기록 1건', /운동 1개 이상 채택된 기록: 1건/.test(out))

  assert('⑤ 대상 문항 NECK_12 (서버 표)', out.includes('대상 문항: NECK_12'))
  assert('⑤ 목 방문의 재질문 응답 3건 (요통·미상 방문 제외)', /목 방문의 재질문 응답\s+3건/.test(out))
  assert('⑤ 부위 문항 답변 있음 1건 (빈 답·문항 없음 제외)', /부위 문항 답변 있음\s+1건/.test(out))

  assert('판정: 표본 부족 (9건 < 10건)', out.includes('저장된 목 기록이 9건입니다 (기준 10건)'))
  assert('판정: 굴곡 호전 42.9%인데 굴곡 호전형 후보 없음', out.includes('굴곡 호전이 42.9%') && out.includes('굴곡 호전형 후보가 없습니다'))
  assert('판정: 신경 검사 전부 기록 55.6% < 70%', out.includes('신경 검사 전부 기록 비율이 55.6%'))
  assert('판정: DIR_01 후보 3건은 5건 미만이라 채택률 경고 없음', !out.includes('NECK_DIR_01: 후보'))
  assert('판정: 재질문 응답 9.1% < 50%', out.includes('재질문 부위 문항 응답이 목 제출 대비 9.1%'))
  assert('판정: 화면 저장 81.8%는 80% 이상이라 경고 없음', !out.includes('원장 화면 저장이'))

  assert('④ 단계 분포 블록이 이어서 나온다 (기존 회고 파일럿 본체 재사용)', out.includes('목 운동 단계 — 회고 파일럿 분포'))
  assert('수동 항목 안내가 로그 문서를 가리킨다', out.includes('docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md'))
  assert('환자·방문 식별자를 출력하지 않는다', !out.includes('visit-n1') && !out.includes('"id"') && !/\bn1\b/.test(out))
}

// ---------------------------------------------------------------------------
// 2. 경고 임계값 — 각각이 실제로 발동하는지 (공허하지 않은지) + 깨끗한 경우
// ---------------------------------------------------------------------------

{
  // DIR_01 채택률: 후보 12건 전부 배제 → 0% < 20%
  const recs = Array.from({ length: 12 }, (_, i) => record(`d${i}`, { directional: 'EXTENSION_FAVORABLE', exams: BOTH_NEG, rehab: { NECK_DIR_01: 'REJECTED' } }))
  const { out } = run(recs, { noFollowUpDir: true })
  assert('DIR_01 채택률 경고 발동 (12건 중 0건)', out.includes('NECK_DIR_01: 후보 12건 중 채택 0건 (0.0%, 기준 20%)'))
  assert('12건이면 표본 부족 경고 없음', !out.includes('저장된 목 기록이'))
  assert('신전 100%면 굴곡 경고 없음', !out.includes('굴곡 호전형 후보가 없습니다'))
  assert('전부 기록이면 신경 경고 없음', !out.includes('신경 검사 전부 기록 비율이'))
  assert('재질문 폴더가 없으면 안내만 하고 경고하지 않는다', out.includes('재질문 응답 폴더가 없습니다') && !out.includes('재질문 부위 문항 응답이'))
}
{
  // 화면 저장 < 80%: 10건 중 5건 미저장
  const recs = [
    ...Array.from({ length: 5 }, (_, i) => record(`w${i}`, { directional: 'EXTENSION_FAVORABLE', exams: BOTH_NEG })),
    ...Array.from({ length: 5 }, (_, i) => record(`x${i}`, { workspace: false })),
  ]
  const { out } = run(recs)
  assert('화면 저장 50% 경고 발동', out.includes('원장 화면 저장이 50.0%입니다 (기준 80%)'))
}
{
  // 깨끗한 경우: 12건 저장, 신전, 신경 전부, DIR_01 채택, 재질문 6건 답변(50%)
  const recs = Array.from({ length: 12 }, (_, i) => record(`c${i}`, { directional: 'EXTENSION_FAVORABLE', exams: BOTH_NEG, rehab: { NECK_DIR_01: 'ACCEPTED' } }))
  const fus = Array.from({ length: 6 }, (_, i) => followUp(`visit-c${i}`, [{ questionId: 'NECK_12', value: 'better' }]))
  const { out } = run(recs, { followUps: fus })
  assert('경고 없음이 뜬다', out.includes('✅ 경고 없음.'))
  assert('재질문 50.0%는 기준 50% 이상', /부위 문항 답변 있음\s+6건\s+50\.0%/.test(out))
}
{
  // 목 기록 0건
  const { out, status } = run([record('l1', { region: 'lbp' })])
  assert('목 기록 0건이면 안내하고 종료', status === 0 && out.includes('목 제출 기록이 0건입니다'))
}

// ---------------------------------------------------------------------------
// 3. 부위 일반화 — 같은 본체가 요통으로 돈다 (옛 필드 lbpDirectionalResponse를 읽는다)
// ---------------------------------------------------------------------------

{
  const recs = [
    record('l1', { region: 'lbp', directional: 'EXTENSION_FAVORABLE' }),
    record('l2', { region: 'lbp', directional: 'FLEXION_FAVORABLE' }),
    record('n1', { directional: 'EXTENSION_FAVORABLE' }), // 목 → 제외
  ]
  const { out, status } = run(recs, { args: ['lbp'] })
  assert('요통으로 돈다', status === 0 && out.includes('요통 운동 파일럿 — 관찰 항목 자동 집계'))
  assert('요통 주호소 2건 (목 제외)', /요통 주호소\s+:\s*2건/.test(out))
  assert('요통은 옛 필드에서 방향성 반응을 읽는다: 신전 1 / 굴곡 1', countFor(out, '신전 호전') === 1 && countFor(out, '굴곡 호전') === 1)
  assert('요통 재질문 문항은 서버 표(LBP_12~14)', out.includes('대상 문항: LBP_12, LBP_13, LBP_14'))
}
assert('본체에 부위 id가 하드코딩되지 않는다 (neck_exam_/NECK_12/NECK_DIR/\'neck\')', !/neck_exam_|NECK_12|NECK_DIR|'neck'/.test(SOURCE))
assert('본체는 기록의 부위를 화면과 같은 규칙(drivingRegion)으로 정한다', /drivingRegion\(responses\) !== region/.test(SOURCE) && !/low_back_pelvis/.test(SOURCE))
assert('재질문 id는 서버 표에서 읽는다', /DETAIL_CHECK_REGION_QUESTION_IDS\[region\]/.test(SOURCE))
assert('신경 검사 id는 팩에서 읽는다', /pack\.neuroExamIds/.test(SOURCE))

// ---------------------------------------------------------------------------
// 4. 오류 경로 — 데이터 폴더 없음 / 모르는 부위
// ---------------------------------------------------------------------------

{
  const res = spawnSync(process.execPath, [SCRIPT, 'neck'], {
    env: { ...process.env, SAMINDANG_DATA_DIR: path.join(tmpdir(), 'region-pilot-obs-does-not-exist-' + Date.now()) },
    encoding: 'utf8',
    cwd: ROOT,
  })
  assert('데이터 폴더가 없으면 exit 1', res.status === 1)
  assert('로컬 PC에서 돌리라고 안내한다', res.stderr.includes('원장님 로컬 PC에서 실행'))
  assert('SAMINDANG_DATA_DIR 사용법을 알려준다', res.stderr.includes('SAMINDANG_DATA_DIR='))
}
{
  const { err, status } = run([], { args: ['elbows'] })
  assert('모르는 부위면 exit 1 + 가능한 값 안내', status === 1 && err.includes("알 수 없는 부위 'elbows'") && err.includes('neck'))
}

// ---------------------------------------------------------------------------
// 5. 개인정보 — 스크립트가 애초에 그 필드들을 읽지 않는다
// ---------------------------------------------------------------------------

const PII_FIELDS = ['patient_name', 'phone_last4', 'birth', 'patient_label', 'myungri', 'note', 'clinicianFinalInstruction', 'newSymptomNote', 'adverseEffectNote', 'patient_id']
for (const f of PII_FIELDS) {
  assert(`개인정보: 스크립트가 '${f}'를 읽지 않는다`, !SOURCE.includes(f))
}
assert(
  '개인정보: 기록·응답 전체를 그대로 출력하는 코드가 없다',
  !/console\.log\([^)]*\b(record|resp|workspace)\b/.test(SOURCE) && !/JSON\.stringify\((record|resp|workspace)/.test(SOURCE),
)
assert('개인정보: 재질문 답변 value는 비었는지만 보고 출력하지 않는다', !/console\.log\([^)]*\bvalue\b/.test(SOURCE))

console.log(`\n${passCount} assertions passed`)
