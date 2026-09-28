// Midlife v0.2 — 완료 검증 테스트 세트 (docs/MIDLIFE_UI_IA_v0.2.md §8).
//
// 명세 v0.1 Acceptance Criteria 1–7을 1:1로, 그리고 PO(2026-09-27)가 정한
// 안전 2단계·미해결·재검토 규칙을 진리표로 검증한다. 원칙:
//   - 부재를 단언할 때는 같은 렌더 경로로 **존재하는 대조군**을 함께 둔다
//     (HANDOFF 최신 75 "부재를 단언할 때의 규칙").
//   - 태블릿 이동은 App.tsx의 nextQuestion(순방향 walk)을 그대로 재현한다.
//
// npm run test:midlife

import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import {
  ALL_QUESTIONS,
  STAFF_CHECK_TRIGGERS,
  MODULE_QUESTION_IDS,
  buildResponsePayload,
  buildRoutingPayload,
  computeFlags,
  doctorViewProfile,
  pruneStaleResponses,
  shouldAutoAdvancePast,
  visibleQuestions,
} from './.midlife-corespec-bundle.mjs'
import { computeMidlifeSafety } from './.midlife-logic-bundle.mjs'
import { toMidlifeState, toMidlifeStateFromDoctorPayload } from './.midlife-adapter-bundle.mjs'
import * as care from './.midlife-care-bundle.mjs'
import { deserializeWorkspaceState, emptyWorkspaceState } from './.midlife-persistence-bundle.mjs'
import { DOCTOR_FIXTURES } from './.midlife-doctor-fixtures-bundle.mjs'
import { DoctorWorkspace } from './.midlife-doctor-workspace-bundle.cjs'
import { QuestionBody } from './.midlife-question-screen-bundle.cjs'

let passed = 0
let failed = 0
function assert(name, cond) {
  if (cond) {
    passed += 1
    console.log(`OK: ${name}`)
  } else {
    failed += 1
    console.log(`FAIL: ${name}`)
  }
}

const emptyResponses = () => Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))
const set = (r, patch) => pruneStaleResponses({ ...r, ...patch }).responses
const qById = new Map(ALL_QUESTIONS.map((q) => [q.id, q]))
const MID_IDS = ALL_QUESTIONS.filter((q) => q.id.startsWith('MID_')).map((q) => q.id)
const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/** App.tsx nextQuestion()과 같은 알고리즘(현재 위치의 배열상 다음, auto-advance 건너뜀). */
function nextQuestion(from, r) {
  const list = visibleQuestions(r)
  const fromIdx = list.findIndex((q) => q.id === from)
  let idx = fromIdx >= 0 ? fromIdx + 1 : 0
  while (idx < list.length && shouldAutoAdvancePast(list[idx], r)) idx += 1
  return list[idx]
}

/** 새 흐름(VISIT_00_INTENT)으로 들어온 갱년기 환자를 끝까지 걷는다. answers에 없는 문항은 결정적 기본값. */
function walk(answers, { sex = 'female' } = {}) {
  let r = set(emptyResponses(), { ID_01: '테스트', ID_02: '1234', ID_03: sex })
  const order = []
  const staffChecks = []
  let cur = nextQuestion('ID_03', r)
  for (let guard = 0; cur && guard < 300; guard++) {
    const q = cur
    let v = answers[q.id]
    if (v === undefined) {
      const opts = q.optionsIf ? q.optionsIf(r) : q.options
      if (q.input === 'multi_choice') v = [(opts.find((o) => o.value === 'none') ?? opts[0]).value]
      else if (q.input === 'single_choice') v = opts[0].value
      else if (q.input === 'numeric_scale') v = 5
      else if (q.input === 'numeric') v = '1'.repeat(q.maxLength || 1)
      else v = 'x'
    }
    r = set(r, { [q.id]: v })
    order.push(q.id)
    const trig = STAFF_CHECK_TRIGGERS[q.id]
    if (trig && trig(r)) staffChecks.push(q.id)
    cur = nextQuestion(q.id, r)
  }
  return { r, order, staffChecks }
}

const MIDLIFE_ENTRY = { VISIT_00_INTENT: 'women', VISIT_02_WOMEN: 'midlife', SAFETY_01: ['none'] }

/* =========================================================================
 * AC1 — 태블릿에서 5단계 navigation이 가능하다
 * ========================================================================= */
{
  const { r, order } = walk({ ...MIDLIFE_ENTRY })
  const midOrder = order.filter((id) => id.startsWith('MID_'))
  const sections = midOrder.map((id) => qById.get(id).section.index)
  assert('AC1: 갱년기 환자는 MID_ 문항을 실제로 지나간다', midOrder.length >= 13)
  assert('AC1: 5개 소단계(1~5)가 모두 나타난다', [1, 2, 3, 4, 5].every((i) => sections.includes(i)))
  assert(
    'AC1: 소단계 순서가 1→2→3→4→5로만 진행한다(되돌아가지 않음)',
    sections.every((s, i) => i === 0 || s >= sections[i - 1]),
  )
  assert(
    'AC1: 모든 MID_ 문항에 소단계 표시 메타데이터(1~5/5)가 있다',
    MID_IDS.every((id) => {
      const s = qById.get(id).section
      return s && s.total === 5 && s.index >= 1 && s.index <= 5 && s.group === '갱년기 문진'
    }),
  )
  assert('AC1: 걷기가 끝까지 종료된다(마지막 화면까지 도달)', order[order.length - 1] === 'FREE_01' || order.includes('FREE_01'))
  assert(
    'AC1: 갱년기 모듈 전체가 공통 안전문항(SAFETY_01) 뒤, 병력정보 앞에 온다',
    order.indexOf('SAFETY_01') < order.indexOf('MID_01') && order.indexOf('MID_15') < order.indexOf('WOMEN_SAFETY_01'),
  )
  assert('AC1: 기존 여성건강 모듈(WOMEN_01~03)은 열리지 않는다', !order.some((id) => /^WOMEN_0\d$/.test(id)))
  assert('AC1: 모듈 라우팅이 Midlife 하나로 기록된다', JSON.stringify(buildRoutingPayload(r).modules_activated) === '["Midlife"]')
  assert("AC1: 참고 증상 화면에 '여성 건강'이 다시 나오지 않는다(중복 모듈 방지)", !qById
    .get('REFERENCE_SYMPTOMS_01')
    .optionsIf(r)
    .some((o) => o.value === 'women'))
  assert('AC1: 원장 화면 프로필은 herbal(통증 모듈 없음)', doctorViewProfile(r) === 'herbal')

  // 화면 수 -- 초진 3~5분 목표의 근거 자료(단언은 상한만).
  console.log(`   (info) 갱년기 초진 태블릿 화면 수: 전체 ${order.length}, 그중 갱년기 모듈 ${midOrder.length}`)
  assert('AC1: 갱년기 모듈 화면은 15개 이하(한 화면 한 질문)', midOrder.length <= 15)

  // 소단계 표시가 실제로 렌더된다
  const html = renderToString(React.createElement(QuestionBody, { question: qById.get('MID_08'), value: null, responses: r, onChange: () => {} }))
  assert('AC1: 질문 화면에 "갱년기 문진 · 3/5 안전 확인"이 렌더된다', html.includes('갱년기 문진 · 3/5 안전 확인'))
  const htmlCtl = renderToString(React.createElement(QuestionBody, { question: qById.get('SAFETY_01'), value: null, responses: r, onChange: () => {} }))
  assert('AC1 대조군: 소단계 메타데이터가 없는 기존 문항에는 표시가 없다', !htmlCtl.includes('question__section') && htmlCtl.includes('class="question"'))

  // 뒤로 가서 답을 바꾸면 더 이상 해당 없는 화면의 답이 지워진다
  let r2 = set(emptyResponses(), { ID_03: 'female', ...MIDLIFE_ENTRY, MID_01: 'very_irregular', MID_02: '1_3m' })
  assert('AC1: 불규칙 월경이면 마지막 월경(MID_02)을 묻는다', visibleQuestions(r2).some((q) => q.id === 'MID_02'))
  r2 = set(r2, { MID_01: 'amenorrhea_12m_plus' })
  assert('AC1: 12개월 이상 무월경으로 바꾸면 MID_02 답이 정리된다(null)', r2.MID_02 === null)
  const r3 = set(emptyResponses(), { ID_03: 'female', ...MIDLIFE_ENTRY, MID_01: 'not_assessable' })
  assert('AC1: 수술·약물로 판단 불가면 MID_02를 묻지 않는다', !visibleQuestions(r3).some((q) => q.id === 'MID_02'))

  // 최소 터치영역 72px: 1열(list)은 --btn-min-h, 2열은 104px. 좁은 compact3는 쓰지 않는다.
  const css = src('src/styles.css')
  assert('AC1: --btn-min-h가 72px', /--btn-min-h:\s*72px/.test(css))
  assert('AC1: grid2 카드 최소 높이 104px(≥72px)', /\.optionList--grid2 \.option \{[^}]*min-height:\s*104px/.test(css))
  assert(
    'AC1: MID_ 문항은 compact3/body_map 레이아웃을 쓰지 않는다(72px 미만 방지)',
    MID_IDS.every((id) => !['compact3', 'body_map'].includes(qById.get(id).layout)),
  )
  assert('AC1: 안전 화면(MID_08/09)은 1열(list) 레이아웃', !qById.get('MID_08').layout && !qById.get('MID_09').layout)
  // 0~10 척도: 6열 격자(0~5 / 6~10), 모든 칸 같은 폭 -- PO 2026-09-28("점수별로 칸 크기가 같아야")
  const scaleList = (css.match(/\n\.optionList--scale \{([^}]*)\}/) ?? [])[1] ?? ''
  const scaleOpt = (css.match(/\n\.option--scale \{([^}]*)\}/) ?? [])[1] ?? ''
  assert('SCALE: 척도는 6열 균등 격자(첫 줄 0~5, 둘째 줄 6~10)', /display:\s*grid/.test(scaleList) && /repeat\(6,\s*minmax\(0,\s*1fr\)\)/.test(scaleList))
  assert('SCALE: 칸이 늘어나지 않는다(flex 늘림 없음) + 최소 높이 72px', !/flex:\s*1 1 auto/.test(scaleOpt) && /min-height:\s*var\(--btn-min-h\)/.test(scaleOpt))
  // 문구 간결성: 갱년기 문항 질문은 한 줄 분량(띄어쓰기 포함 30자 이하), 선택지는 28자 이하
  const longQ = MID_IDS.filter((id) => qById.get(id).question.length > 30)
  const longO = MID_IDS.flatMap((id) => (qById.get(id).options ?? []).filter((o) => o.label.length > 28).map((o) => `${id}:${o.label}`))
  assert(`WORDING: 질문 30자 이하 (초과: ${longQ.join(', ') || '없음'})`, longQ.length === 0)
  assert(`WORDING: 선택지 28자 이하 (초과: ${longO.join(', ') || '없음'})`, longO.length === 0)

  // 남성은 진입 불가
  const male = set(emptyResponses(), { ID_03: 'male' })
  assert(
    'AC1: 남성에게는 여성 건강 진입(VISIT_00_INTENT=women)이 보이지 않는다 → 갱년기 모듈 불가',
    !qById.get('VISIT_00_INTENT').optionsIf(male).some((o) => o.value === 'women'),
  )
}

/* =========================================================================
 * 안전 2단계 — PO 2026-09-27 진리표 (midlifeLogic)
 * ========================================================================= */
const base = {
  generalRed: false,
  cycleChange: 'very_irregular',
  urgentItems: ['none'],
  priorityItems: ['none'],
  pregnancy: 'no',
  malformed: false,
}
const S = (patch) => computeMidlifeSafety({ ...base, ...patch })
{
  assert('SAFE: 전부 해당 없음 → CLEAR', S({}).status === 'CLEAR')
  assert('SAFE: 공통 안전문항 양성 → URGENT(general_red)', S({ generalRed: true }).urgentReasons.includes('general_red') && S({ generalRed: true }).status === 'URGENT_REVIEW')
  assert('SAFE: 대량출혈+어지러움 → URGENT', S({ urgentItems: ['heavy_bleeding_faint'] }).status === 'URGENT_REVIEW')
  assert('SAFE: 구체적 자살·자해 → URGENT', S({ urgentItems: ['self_harm_plan'] }).urgentReasons.includes('self_harm_plan'))
  assert('SAFE: 임신 가능성 + 출혈 → URGENT', S({ pregnancy: 'yes', priorityItems: ['abnormal_bleeding'] }).urgentReasons.includes('pregnancy_with_bleeding'))
  assert('SAFE: 임신 가능성 없음 + 출혈 → PRIORITY(URGENT 아님)', S({ priorityItems: ['abnormal_bleeding'] }).status === 'PRIORITY_EVALUATION')
  assert('SAFE: 임신 가능성 + 출혈 없음 → CLEAR(임신만으로 올리지 않음)', S({ pregnancy: 'yes' }).status === 'CLEAR')
  const unk = S({ pregnancy: 'unknown', priorityItems: ['postcoital_bleeding'] })
  assert('SAFE: 임신 여부 모름 + 출혈 → PRIORITY + 근거 표시(URGENT로 올리지 않음)', unk.status === 'PRIORITY_EVALUATION' && unk.priorityReasons.includes('pregnancy_unknown_with_bleeding'))
  for (const v of ['postmenopausal_bleeding', 'abnormal_bleeding', 'postcoital_bleeding', 'bloating_pelvic', 'weight_loss_fever', 'palpitation_persistent']) {
    const s = S({ priorityItems: [v] })
    assert(`SAFE: ${v} 단독 → PRIORITY, 근거에 ${v}`, s.status === 'PRIORITY_EVALUATION' && s.priorityReasons.includes(v) && s.urgentReasons.length === 0)
  }
  const pmb = S({ cycleChange: 'amenorrhea_12m_plus', priorityItems: ['abnormal_bleeding'] })
  assert('SAFE: 12개월 무월경 + 출혈(어느 선택지든) → 폐경 후 출혈 근거', pmb.priorityReasons[0] === 'postmenopausal_bleeding')
  assert('SAFE: abnormal_bleeding_flag는 출혈 3항목에서만 켜진다', S({ priorityItems: ['postcoital_bleeding'] }).abnormalBleeding && !S({ priorityItems: ['bloating_pelvic'] }).abnormalBleeding)
  assert('SAFE: 안전 화면 미응답 → INCOMPLETE(CLEAR 아님)', S({ priorityItems: null }).status === 'INCOMPLETE' && S({ urgentItems: null }).status === 'INCOMPLETE')
  assert('SAFE: 미응답이어도 URGENT 근거가 있으면 URGENT가 이긴다', S({ priorityItems: null, urgentItems: ['self_harm_plan'] }).status === 'URGENT_REVIEW')
  assert('SAFE: 출혈 + 임신 가능성 미응답 → INCOMPLETE(임신 조합을 배제 못 함)', S({ priorityItems: ['abnormal_bleeding'], pregnancy: null }).status === 'INCOMPLETE')
  assert('SAFE: 형식 오류 → INCOMPLETE', S({ malformed: true }).status === 'INCOMPLETE')
  assert('SAFE: 두 단계가 섞이지 않는다(URGENT 근거에 PRIORITY 값이 들어가지 않음)', S({ generalRed: true, priorityItems: ['bloating_pelvic'] }).urgentReasons.join() === 'general_red')

  // 어댑터: 손상 데이터는 malformed
  const bad = toMidlifeStateFromDoctorPayload({
    safety_flags: { red_flag_general: ['none'] },
    modules: { midlife: { cycle_change: 'regular', urgent_screen: 'heavy_bleeding_faint', priority_screen: ['none'] } },
    reproductive_status: { reproductive_status: ['none'] },
  })
  assert('SAFE: 배열이어야 할 안전 응답이 문자열이면 malformed → INCOMPLETE', bad.malformed && computeMidlifeSafety(bad).status === 'INCOMPLETE')
  const unknownVal = toMidlifeStateFromDoctorPayload({
    safety_flags: { red_flag_general: ['none'] },
    modules: { midlife: { cycle_change: 'regular', urgent_screen: ['none'], priority_screen: ['something_new'] } },
    reproductive_status: { reproductive_status: ['none'] },
  })
  assert('SAFE: 모르는 안전 값은 조용히 버리지 않고 malformed', unknownVal.malformed)
  const noModule = toMidlifeStateFromDoctorPayload({ safety_flags: { red_flag_general: ['none'] }, modules: {}, reproductive_status: {} })
  assert('SAFE: 갱년기 모듈 자체가 없으면 INCOMPLETE', computeMidlifeSafety(noModule).status === 'INCOMPLETE')
}

/* =========================================================================
 * 태블릿 즉시 인터럽트(StaffCheckScreen) — URGENT만, PRIORITY는 아님
 * ========================================================================= */
{
  const heavy = walk({ ...MIDLIFE_ENTRY, MID_08: ['heavy_bleeding_faint'] })
  assert('STAFF: MID_08 대량출혈 → MID_08 제출 직후 직원 확인', heavy.staffChecks.includes('MID_08'))
  const harm = walk({ ...MIDLIFE_ENTRY, MID_08: ['self_harm_plan'] })
  assert('STAFF: MID_08 자살·자해 → MID_08 제출 직후 직원 확인', harm.staffChecks.includes('MID_08'))
  const preg = walk({ ...MIDLIFE_ENTRY, MID_01: 'very_irregular', MID_09: ['abnormal_bleeding'], WOMEN_SAFETY_01: ['pregnancy_possible'] })
  assert('STAFF: 임신 가능성 + 출혈 → WOMEN_SAFETY_01 제출 직후 직원 확인', preg.staffChecks.includes('WOMEN_SAFETY_01'))
  const prio = walk({ ...MIDLIFE_ENTRY, MID_01: 'amenorrhea_12m_plus', MID_09: ['postmenopausal_bleeding'], WOMEN_SAFETY_01: ['menopause'] })
  assert('STAFF: PRIORITY(폐경 후 출혈)만이면 인터럽트 없음', prio.staffChecks.length === 0)
  assert('STAFF 대조군: 같은 걷기에서 PRIORITY 판정은 실제로 계산된다', buildResponsePayload(prio.r).safety_flags.midlife.status === 'PRIORITY_EVALUATION')
  const red = walk({ ...MIDLIFE_ENTRY, SAFETY_01: ['chest_breathing'] })
  assert('STAFF: SAFETY_01 양성은 SAFETY_01에서 한 번만(MID_08에서 다시 띄우지 않음)', red.staffChecks.join() === 'SAFETY_01')
  const women = walk({ VISIT_00_INTENT: 'women', VISIT_02_WOMEN: 'women', SAFETY_01: ['none'], WOMEN_SAFETY_01: ['pregnancy_possible'] })
  assert('STAFF: 갱년기가 아닌 여성건강 경로에서는 WOMEN_SAFETY_01 트리거가 꺼져 있다', !women.staffChecks.includes('WOMEN_SAFETY_01'))
  // 게이트 자체를 겨눈다: 정리(prune)되지 않은 옛 MID_09 값이 남은 비갱년기 응답에서도 켜지면 안 된다.
  const stale = { ...emptyResponses(), ID_03: 'female', VISIT_01: 'women', VISIT_02_WOMEN: 'women', SAFETY_01: ['none'], MID_08: ['none'], MID_09: ['abnormal_bleeding'], WOMEN_SAFETY_01: ['pregnancy_possible'] }
  assert('STAFF: WOMEN_SAFETY_01 트리거는 갱년기 기록에서만(잔여 MID_ 값이 있어도 비갱년기는 false)', STAFF_CHECK_TRIGGERS.WOMEN_SAFETY_01(stale) === false)
  assert('STAFF 대조군: 같은 응답을 갱년기로 바꾸면 true', STAFF_CHECK_TRIGGERS.WOMEN_SAFETY_01({ ...stale, VISIT_02_WOMEN: 'midlife' }) === true)
  assert('STAFF: MID_08 트리거도 갱년기 기록에서만', STAFF_CHECK_TRIGGERS.MID_08({ ...stale, MID_08: ['self_harm_plan'] }) === false && STAFF_CHECK_TRIGGERS.MID_08({ ...stale, VISIT_02_WOMEN: 'midlife', MID_08: ['self_harm_plan'] }) === true)
  assert('STAFF: PRIORITY 화면(MID_09)은 트리거로 등록되지 않는다', !('MID_09' in STAFF_CHECK_TRIGGERS))
  assert('STAFF: 기존 공통 flags 계약(requires_staff_check)은 바뀌지 않는다', computeFlags(heavy.r).requires_staff_check === false)
  assert('STAFF: 폐경 후 출혈 선택지는 12개월 무월경 응답자에게만 보인다', qById.get('MID_09').optionsIf({ ...emptyResponses(), MID_01: 'regular' }).every((o) => o.value !== 'postmenopausal_bleeding') && qById.get('MID_09').optionsIf({ ...emptyResponses(), MID_01: 'amenorrhea_12m_plus' }).some((o) => o.value === 'postmenopausal_bleeding'))
}

/* =========================================================================
 * 태블릿 최소 데이터 — 명세 v0.1 필드명이 payload에 그대로 있다
 * ========================================================================= */
{
  const { r } = walk({ ...MIDLIFE_ENTRY, MID_01: 'very_irregular', MID_09: ['abnormal_bleeding'], WOMEN_SAFETY_01: ['none'] })
  const p = buildResponsePayload(r)
  const m = p.modules.midlife
  const FIELDS = [
    'cycle_change', 'last_menstrual_period', 'hormone_or_contraception_use', 'top_symptoms',
    'recent_provider_use', 'existing_test_results', 'coordination_burden', 'patient_priority_1',
    'patient_priority_2', 'next_action_confidence_0_10', 'primary_symptom_0_10',
    'sleep_satisfaction_0_10', 'function_interference_0_10',
  ]
  assert(`DATA: modules.midlife에 명세 필드가 모두 있고 값이 채워져 있다`, FIELDS.every((f) => m[f] !== undefined && m[f] !== null))
  assert('DATA: safety_flags.midlife(=safety_flags)가 계산되어 있다', p.safety_flags.midlife && p.safety_flags.midlife.status === 'PRIORITY_EVALUATION')
  assert('DATA: abnormal_bleeding_flag = safety_flags.midlife.abnormalBleeding', p.safety_flags.midlife.abnormalBleeding === true)
  assert('DATA: pregnancy_possibility는 기존 WOMEN_SAFETY_01(reproductive_status)로 한 번만 묻는다', Array.isArray(p.reproductive_status.reproductive_status) && !ALL_QUESTIONS.some((q) => q.id.startsWith('MID_') && /임신/.test(q.question)))
  assert('DATA: life_stage는 태블릿에서 묻지 않는다(원장 판단 칸)', !ALL_QUESTIONS.some((q) => q.variable === 'life_stage'))
  const painR = walk({ VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep', SAFETY_01: ['none'] }).r
  assert('DATA 대조군: 갱년기가 아닌 기록은 safety_flags.midlife === null', buildResponsePayload(painR).safety_flags.midlife === null)
}

/* =========================================================================
 * AC2/AC3 — Doctor View: safety 최상단 + 7칸 한 화면
 * ========================================================================= */
const MID_PRIORITY = DOCTOR_FIXTURES.find((f) => f.name === '갱년기 문진 — 우선 외부평가')
const MID_CLEAR = DOCTOR_FIXTURES.find((f) => f.name === '갱년기 문진 — 안전 해당 없음')
const clone = (x) => JSON.parse(JSON.stringify(x))
const withUrgent = (() => {
  const p = clone(MID_PRIORITY.payload)
  p.responses.modules.midlife.urgent_screen = ['heavy_bleeding_faint']
  return p
})()
const renderWs = (payload, extra = {}) => renderToString(React.createElement(DoctorWorkspace, { payload, ...extra }))
{
  assert('FIX: 갱년기 fixture 2개가 DOCTOR_FIXTURES에 있다', !!MID_PRIORITY && !!MID_CLEAR)

  const html = renderWs(withUrgent)
  const iSafety = html.indexOf('data-midlife-safety="URGENT_REVIEW"')
  const iLane2 = html.indexOf('id="lane2-h2"')
  const iPanel = html.indexOf('data-midlife-panel')
  assert('AC2: URGENT 갱년기 안전 패널이 렌더된다', iSafety > -1)
  assert('AC2: 안전 패널이 레인2(확인)와 7칸 패널보다 위(레인1 안전 확인)에 있다', iSafety > -1 && iSafety < iLane2 && iSafety < iPanel)
  assert(
    'AC2: 갱년기 안전 칸이 레인1 부위 목록(regionInputs)의 맨 앞 항목이다',
    /const regionInputs: Lane1RegionInput\[\] = \[[\s\S]*?\*\/\s*\{ key: 'midlife'/.test(src('src/doctor/workspace/DoctorWorkspace.tsx')),
  )
  assert('AC2: 좌측 요약 칩도 URGENT(같은 판정을 읽음)', html.includes('doctor__lane1Chip--urgent'))
  assert('AC2: URGENT는 접히지 않는다(details 안이 아님)', !/<details[^>]*doctor__lane1Collapse[\s\S]*data-midlife-safety/.test(html))
  assert('AC2: URGENT 근거 문구가 보인다', html.includes('대량 출혈 + 어지러움/실신 경향'))

  const htmlP = renderWs(MID_PRIORITY.payload)
  assert('AC2: 우선 외부평가 → review_required 클래스 + 좌측 "확인 필요"', htmlP.includes('doctor__lbpSafety--review_required') && htmlP.includes('data-midlife-safety="PRIORITY_EVALUATION"') && htmlP.includes('doctor__lane1Chip--review'))
  assert('AC2: 폐경 후 출혈 근거가 보인다', htmlP.includes('폐경 후 출혈'))
  // 한 화면 안의 두 안전 표시가 서로 모순되지 않는다(레인1 경고 ↔ 한약·전신 "안전이슈")
  const heroIssue = (h) => (h.match(/<span>안전이슈<\/span><strong[^>]*>([^<]*)<\/strong>/) ?? [])[1]
  assert('AC2: 우선 외부평가 기록의 "안전이슈" 줄이 "없음"이 아니라 갱년기 판정을 보인다', heroIssue(htmlP) === '갱년기 우선 외부평가')
  assert('AC2: URGENT 기록의 "안전이슈" 줄도 같은 판정', heroIssue(html) === '갱년기 URGENT')
  const htmlC = renderWs(MID_CLEAR.payload)
  assert('AC2 대조군: 안전 해당 없음 기록은 "안전이슈 없음"(같은 줄이 실제로 읽힌다)', heroIssue(htmlC) === '없음')
  assert('AC2: 안전 해당 없음 → clear 클래스', htmlC.includes('data-midlife-safety="CLEAR"') && htmlC.includes('doctor__lbpSafety--clear'))

  // AC3 — 7칸
  for (const [label, h] of [['URGENT', html], ['PRIORITY', htmlP], ['CLEAR', htmlC]]) {
    const cells = ['1', '2', '3', '4', '5', '6', '7'].filter((c) => h.includes(`data-midlife-cell="${c}"`))
    assert(`AC3(${label}): 7개 핵심 칸(1~7)이 모두 한 패널에 렌더된다`, cells.length === 7)
  }
  const panelHtml = html.slice(iPanel)
  assert('AC3: 7칸이 모두 같은 section(갱년기 진료 요약) 안에 있다', ['1', '2', '3', '4', '5', '6', '7'].every((c) => panelHtml.indexOf(`data-midlife-cell="${c}"`) < panelHtml.indexOf('</section>')))
  assert('AC3: ③안전 칸이 스냅샷 맨 앞(1·2칸보다 먼저)', panelHtml.indexOf('data-midlife-cell="3"') < panelHtml.indexOf('data-midlife-cell="1"'))
  assert('AC3: 환자 응답이 환자가 본 라벨로 보인다(주요 증상)', htmlP.includes('열감·땀, 수면 불편'))
  assert('AC3: Baseline PRO 초진값이 태블릿 값 그대로(7/10)', htmlP.includes('data-midlife-baseline="primarySymptom">7/10'))
  assert('AC3: 없는 답은 "—"로(지어내지 않음) -- 무월경이면 마지막 월경 칸 —', /마지막 월경<\/dt><dd>—<\/dd>/.test(htmlP))
  assert('AC3: 7칸 패널은 기존 토큰만 쓴다(새 색상 변수 없음)', !/--midlife-/.test(src('src/doctor/workspace/workspace.css')))
  {
    // Figma `01 · Pain Doctor View`(frame 1:2)를 옮긴 --pain-* 토큰으로 카드·라벨·행을 그린다(명세: 같은 시각 언어 재사용).
    const css = src('src/doctor/workspace/workspace.css')
    const block = css.slice(css.indexOf('Midlife v0.2: 갱년기 진료 요약 7칸'))
    const rule = (sel) => (block.match(new RegExp(`\\n${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`)) ?? [])[1] ?? ''
    assert('FIGMA: 카드 테두리·모서리·바탕은 --pain-border/--pain-radius/--pain-surface', /var\(--pain-border\)/.test(rule('.midlife__cell')) && /var\(--pain-radius\)/.test(rule('.midlife__cell')) && /var\(--pain-surface\)/.test(rule('.midlife__cell')))
    assert('FIGMA: 섹션 라벨은 13px(--pain-fs-eyebrow) semibold, 의미 색 good', /--pain-fs-eyebrow/.test(rule('.midlife__cellTitle')) && /600/.test(rule('.midlife__cellTitle')) && /--pain-good/.test(rule('.midlife__cellTitle')))
    assert('FIGMA: 사실 행은 라벨 좌 / 값 우(행 문법 하나)', /\.midlife__facts dd \{[^}]*text-align:\s*right/.test(block))
    assert('FIGMA: 옛 전역 토큰(--border/--surface)을 7칸 블록에서 쓰지 않는다', !/var\(--border\)|var\(--surface\)/.test(block))
  }
}

/* =========================================================================
 * AC4 — unresolved referral 상태를 기록할 수 있다
 * ========================================================================= */
{
  assert('AC4: 상태는 recommended/ordered/pending/completed/result_reviewed 5단계', care.MIDLIFE_REFERRAL_STATUSES.join() === 'recommended,ordered,pending,completed,result_reviewed')
  const ref = (urgency, status) => ({ ...care.newMidlifeReferral(`${urgency}-${status}`), urgency, status })
  const u = care.midlifeUnresolvedSummary
  assert('AC4: 긴급 미해결 1개 → 즉시 상단 경고', u([ref('urgent', 'pending')]).topWarning === true)
  assert('AC4: 긴급이라도 결과 확인함이면 경고 없음', u([ref('urgent', 'result_reviewed')]).topWarning === false)
  assert('AC4: "검사 완료(결과 미확인)"는 아직 미해결', u([ref('urgent', 'completed')]).topWarning === true)
  assert('AC4: 비긴급 미해결 1개 → 정리 필요 아님', u([ref('non_urgent', 'ordered')]).needsCleanup === false)
  assert('AC4: 비긴급 미해결 2개 → 정리 필요', u([ref('non_urgent', 'ordered'), ref('non_urgent', 'pending')]).needsCleanup === true)
  const three = u([ref('non_urgent', 'ordered'), ref('non_urgent', 'pending'), ref('non_urgent', 'recommended')])
  assert('AC4: 비긴급 3개도 긴급 경고로 올리지 않는다(개수만으로 위험도 상승 없음)', three.needsCleanup && !three.topWarning)

  // 정화: 모르는 상태값은 "해결"로 읽지 않는다
  const s = care.sanitizeMidlifeCareRecord({ referrals: [{ id: 'a', label: 'x', urgency: 'urgent', status: 'done???' }, 'junk'] })
  assert('AC4: 모르는 상태값 → recommended(미해결)로', s.referrals[0].status === 'recommended' && care.isReferralUnresolved(s.referrals[0]))
  assert('AC4: 손상 원소도 던지지 않고 빈 항목으로', s.referrals.length === 2 && s.referrals[1].label === '')

  // 화면에서 추가·상태 변경 → onChange로 기록된다
  let tr
  act(() => {
    tr = TestRenderer.create(React.createElement(DoctorWorkspace, { payload: MID_PRIORITY.payload }))
  })
  const findButton = (text) => tr.root.findAll((n) => n.type === 'button' && [].concat(n.props.children).join('') === text)[0]
  act(() => findButton('+ 외부평가 추가').props.onClick())
  let rows = tr.root.findAll((n) => n.props && n.props['data-midlife-referral'] !== undefined)
  assert('AC4(UI): "+ 외부평가 추가"로 한 줄이 생긴다(기본 상태 권고함)', rows.length === 1 && rows[0].props['data-midlife-referral'] === 'recommended')
  const statusSelect = () => tr.root.findAll((n) => n.type === 'select' && n.props['aria-label'] === '진행 상태')[0]
  act(() => statusSelect().props.onChange({ target: { value: 'pending' } }))
  rows = tr.root.findAll((n) => n.props && n.props['data-midlife-referral'] !== undefined)
  assert('AC4(UI): 진행 상태를 "결과 대기"로 바꿀 수 있다', rows[0].props['data-midlife-referral'] === 'pending')
  const urgencySelect = tr.root.findAll((n) => n.type === 'select' && n.props['aria-label'] === '긴급도')[0]
  act(() => urgencySelect.props.onChange({ target: { value: 'urgent' } }))
  const alerts = tr.root.findAll((n) => n.props && n.props['data-midlife-alert'] === 'urgent-unresolved')
  assert('AC4(UI): 긴급 + 결과 대기 → 상단 경고가 뜬다', alerts.length === 1)
  act(() => statusSelect().props.onChange({ target: { value: 'result_reviewed' } }))
  assert('AC4(UI): 결과 확인함으로 바꾸면 경고가 사라진다', tr.root.findAll((n) => n.props && n.props['data-midlife-alert'] === 'urgent-unresolved').length === 0)
  act(() => tr.unmount())
}

/* =========================================================================
 * AC5 — 2/4/8/12주 review 저장 최소 구조 + 재검토 규칙
 * ========================================================================= */
{
  assert('AC5: review 주차는 2/4/8/12', care.MIDLIFE_REVIEW_WEEKS.join() === '2,4,8,12')
  const rv = (week, course, extra = {}) => ({ ...care.emptyMidlifeReview(week), courseVsExpected: course, ...extra })
  const full = {
    ...care.emptyMidlifeCareRecord(),
    lifeStage: 'late_transition',
    hypothesis: 'h',
    refutationTrigger: 't',
    expectedCourse: '2–4주 내 새벽 각성 감소',
    nextReviewWeek: 4,
    referrals: [{ ...care.newMidlifeReferral('r1'), label: '부인과 초음파', urgency: 'urgent', status: 'ordered' }],
    reviews: [2, 4, 8, 12].map((w) => rv(w, 'as_expected', { reviewedOn: '2026-10-01', pro: { primarySymptom: 5, sleepSatisfaction: 6, functionInterference: 4, nextActionConfidence: 7 } })),
  }
  const ws = { ...emptyWorkspaceState(), midlifeCare: full }
  const back = deserializeWorkspaceState(JSON.parse(JSON.stringify(ws)))
  assert('AC5: 7칸 + 외부평가 + 4개 주차 review가 저장 왕복 후 그대로', JSON.stringify(back.midlifeCare) === JSON.stringify(full))
  assert('AC5: 옛 기록(필드 없음)은 빈 기록으로 읽힌다(던지지 않음)', JSON.stringify(deserializeWorkspaceState({ schema_version: '1.1.0' }).midlifeCare) === JSON.stringify(care.emptyMidlifeCareRecord()))
  const norm = care.sanitizeMidlifeCareRecord({ reviews: [rv(8, null), rv(3, null), rv(2, 'deviates'), rv(2, 'as_expected'), { week: '4' }] })
  assert('AC5: 잘못된 주차(3, "4")는 버리고, 같은 주차는 마지막 값, 주차 오름차순', norm.reviews.map((r) => `${r.week}:${r.courseVsExpected}`).join() === '2:as_expected,8:null')
  assert('AC5: PRO는 0~10 정수만(11, 5.5, "5"는 null)', care.sanitizeScore(11) === null && care.sanitizeScore(5.5) === null && care.sanitizeScore('5') === null && care.sanitizeScore(0) === 0)

  const reopen = care.midlifeHypothesisReopen
  assert('AC5: 연속 2회 "예상과 다름" → reopen', reopen([rv(2, 'deviates'), rv(4, 'deviates')]))
  assert('AC5: 1회만 다름 → reopen 아님', !reopen([rv(2, 'as_expected'), rv(4, 'deviates')]))
  assert('AC5: 다름-예상대로-다름(연속 아님) → reopen 아님', !reopen([rv(2, 'deviates'), rv(4, 'as_expected'), rv(8, 'deviates')]))
  assert('AC5: 판정 비운 주차는 건너뛰고 연속을 본다(4주 미기록)', reopen([rv(2, 'deviates'), rv(4, null), rv(8, 'deviates')]))
  assert('AC5: "판단 어려움"은 연속을 끊는다', !reopen([rv(2, 'deviates'), rv(4, 'unclear'), rv(8, 'deviates')]))
  assert('AC5: 입력 순서가 뒤섞여도 주차 순서로 판단', reopen([rv(12, 'deviates'), rv(2, 'as_expected'), rv(8, 'deviates')]))

  // 화면: 8·12주 "예상과 다름" 기록 → reopen 경고, 그리고 자동저장으로 서버에 midlifeCare가 실린다
  const saves = []
  const onSaveWorkspace = async (state) => {
    saves.push(state)
    return { ok: true, updatedAt: `t${saves.length}` }
  }
  let tr
  act(() => {
    tr = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: MID_PRIORITY.payload,
        submissionId: 'sub-midlife-1',
        initialWorkspaceState: emptyWorkspaceState(),
        initialRecordUpdatedAt: 't0',
        onSaveWorkspace,
      }),
    )
  })
  const weekTab = (w) => tr.root.findAll((n) => n.type === 'button' && [].concat(n.props.children).join('') === `${w}주 기록`)[0]
  const courseSel = (w) => tr.root.findAll((n) => n.type === 'select' && n.props['aria-label'] === `${w}주 경과`)[0]
  assert('AC5(UI): 입력 칸은 한 번에 한 주차만(기본 2주, 8주 입력칸은 아직 없음)', !!courseSel(2) && !courseSel(8))
  act(() => weekTab(8).props.onClick())
  act(() => courseSel(8).props.onChange({ target: { value: 'deviates' } }))
  act(() => weekTab(12).props.onClick())
  act(() => courseSel(12).props.onChange({ target: { value: 'deviates' } }))
  act(() => weekTab(2).props.onClick())
  const proSel = tr.root.findAll((n) => n.type === 'select' && n.props['aria-label'] === '2주 수면 만족')[0]
  act(() => proSel.props.onChange({ target: { value: '4' } }))
  assert('AC5(UI): 연속 2회 이탈 → 스냅샷에 가설 재검토 경고', tr.root.findAll((n) => n.props && n.props['data-midlife-alert'] === 'reopen').length === 1)
  await new Promise((res) => setTimeout(res, 1300))
  await act(async () => {})
  const last = saves[saves.length - 1]
  assert('AC5(UI): 자동저장 payload에 midlifeCare.reviews가 실린다', !!last && last.midlifeCare.reviews.map((r) => `${r.week}:${r.courseVsExpected}`).join() === '2:null,8:deviates,12:deviates')
  assert('AC5(UI): 2주 PRO(수면 만족=4)가 저장된다', !!last && last.midlifeCare.reviews[0].pro.sleepSatisfaction === 4)
  act(() => tr.unmount())
}

/* =========================================================================
 * AC6 — 기존 Pain workflow를 깨지 않는다
 * ========================================================================= */
{
  const nonMid = DOCTOR_FIXTURES.filter((f) => !f.name.startsWith('갱년기'))
  const painLike = nonMid.filter((f) => f.payload.routing.primary_module === 'Pain')
  assert('AC6: 통증 fixture가 대조에 쓸 만큼 있다', painLike.length >= 3)
  let leaks = []
  for (const f of nonMid) {
    const h = renderWs(f.payload)
    if (h.includes('data-midlife-panel') || h.includes('data-midlife-safety')) leaks.push(f.name)
  }
  assert(`AC6: 갱년기가 아닌 fixture ${nonMid.length}개 어디에도 갱년기 패널이 없다 (누출: ${leaks.join(', ') || '없음'})`, leaks.length === 0)
  assert('AC6 대조군: 같은 렌더 경로로 갱년기 fixture에는 패널이 있다', renderWs(MID_CLEAR.payload).includes('data-midlife-panel'))
  const ws = src('src/doctor/workspace/DoctorWorkspace.tsx')
  assert('AC6: 7칸 패널 렌더는 isMidlifeRecord(payload) 게이트 뒤에만 있다', /\{isMidlifeRecord\(payload\) && \(\s*<MidlifeCarePanel/.test(ws))
  assert('AC6: 안전 패널은 갱년기 기록이 아니면 null(해당 없음)을 돌려준다', /if \(!isMidlifeRecord\(payload\)\) return null/.test(src('src/doctor/MidlifeSafetyPanel.tsx')))
  assert('AC6: 공통 computeFlags 키 집합은 바뀌지 않았다(부위 패널 일관성 검사 보호)', JSON.stringify(Object.keys(computeFlags(emptyResponses())).sort()) === JSON.stringify(['bowel_needs_review', 'general_red', 'gi_needs_review', 'requires_staff_check', 'response_consistency_review', 'sleep_disorder_priority_review', 'sleep_disorder_review']))
  assert('AC6: 통증 모듈 문항 목록에 MID_가 섞이지 않았다', !MODULE_QUESTION_IDS.pain.some((id) => id.startsWith('MID_')))
  // CLAUDE.md 경로 규칙: 기존 여성건강 안의 '갱년기 증상' 경로는 지우지 않았다(교체 아님)
  assert('AC6: 기존 WOMEN_01의 menopause_symptoms 선택지가 그대로 있다(옛 경로 유지)', qById.get('WOMEN_01').options.some((o) => o.value === 'menopause_symptoms'))
  assert('AC6: 기존 VISIT_02_WOMEN 값(women/pregnancy/postpartum)이 그대로 있다', ['women', 'pregnancy', 'postpartum'].every((v) => qById.get('VISIT_02_WOMEN').options.some((o) => o.value === v)))
}

/* =========================================================================
 * AC7 — 실제 5–10명 사용 후 필드를 쉽게 수정할 수 있다(과도한 하드코딩 없음)
 * ========================================================================= */
{
  const qSrc = src('src/spec/midlifeQuestions.ts')
  const allSrc = ['src/spec/coreSpec.ts', 'src/doctor/workspace/MidlifeCarePanel.tsx', 'src/doctor/MidlifeSafetyPanel.tsx', 'src/doctor/workspace/midlifeCare.ts']
  assert('AC7: MID_ 문항 정의는 midlifeQuestions.ts 한 곳에만 있다', MID_IDS.every((id) => qSrc.includes(`id: '${id}'`)) && allSrc.every((p) => !/id: 'MID_/.test(src(p))))
  const panel = src('src/doctor/workspace/MidlifeCarePanel.tsx')
  const optionLabels = ALL_QUESTIONS.filter((q) => q.id.startsWith('MID_')).flatMap((q) => (q.options ?? []).map((o) => o.label)).filter((l) => l.length >= 4)
  const hard = optionLabels.filter((l) => panel.includes(l))
  assert(`AC7: 원장 패널은 환자 선택지 라벨을 복사하지 않고 스펙에서 읽는다(복사된 라벨: ${hard.join(', ') || '없음'})`, hard.length === 0)
  assert('AC7: 주차·상태·생애단계 목록은 상수 배열 하나에서 나온다', /export const MIDLIFE_REVIEW_WEEKS = \[2, 4, 8, 12\] as const/.test(src('src/doctor/workspace/midlifeCare.ts')) && !/\[2, 4, 8, 12\]/.test(panel))
  assert('AC7: 비긴급 정리 임계값은 이름 있는 상수 하나', /MIDLIFE_NON_URGENT_CLEANUP_THRESHOLD = 2/.test(src('src/doctor/workspace/midlifeCare.ts')))
  assert('AC7: 안전 근거 라벨은 midlifeLogic의 표 하나에서 나온다(패널에 문구 복사 없음)', !panel.includes('폐경 후 출혈') && !src('src/doctor/MidlifeSafetyPanel.tsx').includes("'폐경 후 출혈'"))
  assert('AC7: 원장 저장은 추가형 필드 하나(midlifeCare) -- 스키마 버전 그대로', /WORKSPACE_STATE_SCHEMA_VERSION = '1\.1\.0'/.test(src('src/doctor/workspace/persistence.ts')))
}

/* =========================================================================
 * 범위 밖 금지 항목 — 자동진단·AI 추천·scoring engine 없음
 * ========================================================================= */
{
  const files = ['src/spec/midlifeLogic.ts', 'src/spec/midlifeAdapter.ts', 'src/doctor/workspace/midlifeCare.ts', 'src/doctor/workspace/MidlifeCarePanel.tsx', 'src/doctor/MidlifeSafetyPanel.tsx']
  const code = files.map((p) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n')
  assert('SCOPE: 네트워크/LLM 호출 없음(fetch/openai/anthropic)', !/fetch\(|openai|anthropic/i.test(code))
  assert('SCOPE: 점수 합산 엔진 없음(score 누적/가중치 없음)', !/weight\s*[*:]|totalScore|scoreSum/.test(code))
  assert('SCOPE: 원장 칸(가설·반증·예상경과)은 자동으로 채우지 않는다 -- 빈 기록에서 시작', JSON.stringify(care.emptyMidlifeCareRecord()) === JSON.stringify({ lifeStage: '', hypothesis: '', refutationTrigger: '', expectedCourse: '', nextReviewWeek: null, referrals: [], reviews: [] }))
}

console.log(`\nSUMMARY: ${passed} assertions passed, ${failed} failed (total ${passed + failed})`)
if (failed > 0) process.exit(1)
