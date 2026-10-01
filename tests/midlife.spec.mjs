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
  STAFF_CHECK_NOTES,
  QUESTIONNAIRE_HALT_TRIGGERS,
  QUESTIONNAIRE_HALT_REASON,
  MODULE_QUESTION_IDS,
  buildResponsePayload,
  buildRoutingPayload,
  computeFlags,
  doctorViewProfile,
  pruneStaleResponses,
  shouldAutoAdvancePast,
  visibleQuestions,
} from './.midlife-corespec-bundle.mjs'
import { computeMidlifeSafety, MIDLIFE_SELF_HARM_PROTOCOL } from './.midlife-logic-bundle.mjs'
import { toMidlifeState, toMidlifeStateFromDoctorPayload } from './.midlife-adapter-bundle.mjs'
import * as care from './.midlife-care-bundle.mjs'
import { deserializeWorkspaceState, emptyWorkspaceState } from './.midlife-persistence-bundle.mjs'
import { DOCTOR_FIXTURES } from './.midlife-doctor-fixtures-bundle.mjs'
import { DoctorWorkspace } from './.midlife-doctor-workspace-bundle.cjs'
import { MidlifeCarePanel } from './.midlife-care-panel-bundle.cjs'
import { QuestionBody } from './.midlife-question-screen-bundle.cjs'
import { StaffCheckScreen } from './.midlife-staff-check-bundle.cjs'
import { PatientCompleteScreen, HALTED_TITLE, HALTED_HELPER, HALTED_STAFF_NOTE } from './.midlife-complete-screen-bundle.cjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createStore } from '../server/store.js'
import { DETAIL_CHECK_MIDLIFE_QUESTION_IDS, isMidlifeSubmissionResponses } from '../server/detailCheck.js'
import { readMidlifeProReports } from './.midlife-longitudinal-bundle.mjs'
import { baselineDetailAnswersFromResponses } from './.midlife-detail-baseline-bundle.mjs'

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
    order.indexOf('SAFETY_01') < order.indexOf('MID_01') && order.indexOf('MID_14') < order.indexOf('WOMEN_SAFETY_01'),
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
  // 전체 설문 간결화(PO 2026-09-28) -- 반복 보조문구가 되살아나지 않고, 줄이면서도 안전 문항의 임상 한정어는 남아 있다.
  const allText = ALL_QUESTIONS.flatMap((q) => [q.question, q.helper ?? '', ...(q.options ?? []).map((o) => o.label)]).join('\n')
  assert('WORDING(전체): 옛 보조문구 "해당되는 것을 모두 선택해주세요"가 남아 있지 않다', !allText.includes('해당되는 것을 모두 선택해주세요'))
  const q = (id) => qById.get(id)
  assert('WORDING(안전): 외상 문항 5개에 기간 "3개월"이 남아 있다', ['NECK_01', 'SH01', 'KNEE_01', 'ELBOW_01', 'WH_01'].every((id) => q(id).question.includes('3개월')))
  assert('WORDING(안전): 외상 기전 예시는 보조문구로 옮겨졌을 뿐 사라지지 않았다', q('KNEE_01').helper.includes('비틀림') && q('ELBOW_01').helper.includes('꺾이') && q('WH_01').helper.includes('손을 짚') && q('SH01').helper.includes('당겨짐'))
  assert('WORDING(안전): 목 외상 "서서 넘어짐 포함"이 남아 있다', q('NECK_01').helper.includes('서 있다가 넘어진'))
  assert('WORDING(안전): 능동 동작 한정어 "스스로"가 남아 있다', q('KNEE_04').question.includes('스스로') && q('ELBOW_05').question.includes('스스로') && q('WH_06A').question.includes('스스로'))
  assert('WORDING(안전): 감염 문항의 "또는(OR)" 관계가 남아 있다', /붉거나 뜨겁게/.test(q('KNEE_07').question) && /이 있거나/.test(q('KNEE_07').question))

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
    'recent_provider_use', 'existing_test_results', 'patient_priority_1',
    'patient_priority_2', 'primary_symptom_0_10',
    'sleep_satisfaction_0_10', 'function_interference_0_10',
  ]
  assert(`DATA: modules.midlife에 명세 필드가 모두 있고 값이 채워져 있다`, FIELDS.every((f) => m[f] !== undefined && m[f] !== null))
  // PO 2026-09-28: coordination_burden(MID_12) 삭제 -- 지운 경로마다 소스 단언 1개(CLAUDE.md 경로 규칙).
  assert('REMOVED: MID_12 문항이 태블릿 정의에 없다', !ALL_QUESTIONS.some((q) => q.id === 'MID_12' || q.variable === 'coordination_burden'))
  assert('REMOVED: payload modules.midlife에 coordination_burden 키가 없다', !('coordination_burden' in m) && !/coordination_burden: r\[/.test(src('src/spec/coreSpec.ts')))
  assert('REMOVED: 원장 7칸 ②칸에 "진료 조율 부담" 행이 없다', !/진료 조율 부담|MID_12/.test(src('src/doctor/workspace/MidlifeCarePanel.tsx')))
  // PO 2026-09-28: next_action_confidence(MID_15) 삭제 -- 진료 전 태블릿·진료 후 구두 모두 어색. 지운 경로 4개 × 단언 1개.
  assert('REMOVED: MID_15 문항이 태블릿 정의에 없다', !ALL_QUESTIONS.some((q) => q.id === 'MID_15' || q.variable === 'next_action_confidence_0_10'))
  assert('REMOVED: payload modules.midlife에 next_action_confidence_0_10 키가 없다', !('next_action_confidence_0_10' in m) && !/next_action_confidence_0_10: r\[/.test(src('src/spec/coreSpec.ts')))
  assert('REMOVED: 원장 7칸 ⑦ PRO 표에 "행동 확신" 행(초진 칸·주차 입력칸)이 없다', !/행동 확신|nextActionConfidence|next_action_confidence/.test(src('src/doctor/workspace/MidlifeCarePanel.tsx')))
  assert('REMOVED: 저장 모델에 nextActionConfidence가 없고, 옛 저장본의 review.pro(그 키 포함)는 정화 때 통째로 버려진다', !/nextActionConfidence:/.test(src('src/doctor/workspace/midlifeCare.ts')) && !('pro' in care.sanitizeMidlifeCareRecord({ reviews: [{ week: 2, pro: { primarySymptom: 3, nextActionConfidence: 7 } }] }).reviews[0]))
  assert('REMOVED: 갱년기 모듈 마지막 화면은 MID_14(목표 2)다', MID_IDS[MID_IDS.length - 1] === 'MID_14')
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
const withSelfHarmPayload = () => {
  const p = clone(MID_PRIORITY.payload)
  p.responses.modules.midlife.urgent_screen = ['self_harm_plan']
  return p
}

/* =========================================================================
 * 자살·자해 응대 최소판 (PO 2026-09-28 "최소판으로 확정")
 * 원장 화면: 3줄 절차. 태블릿 직원 확인 화면: 이유를 드러내지 않는 직원 한 줄.
 * ========================================================================= */
{
  const withSelfHarm = clone(MID_PRIORITY.payload)
  withSelfHarm.responses.modules.midlife.urgent_screen = ['self_harm_plan']
  const h = renderWs(withSelfHarm)
  // PO 확정 SOP(A9 v0.1, 2026-09-28)가 채팅의 "3줄 최소판"을 대체 -- 4줄.
  const P = MIDLIFE_SELF_HARM_PROTOCOL
  assert('PROTOCOL(SOP): 절차는 4줄', P.length === 4)
  assert('PROTOCOL(SOP) 1: 혼자 두지 않기 + 원장 즉시 + 직원 단독 해제 금지', /혼자 두지 않/.test(P[0]) && /원장 즉시/.test(P[0]) && /단독으로 해제하지 않/.test(P[0]))
  assert('PROTOCOL(SOP) 2: 직접 묻기 -- 생각·계획·수단 접근·최근 시도·음주/약물·보호자', ['생각', '계획', '수단 접근', '최근 시도', '음주/약물', '보호자'].every((k) => P[1].includes(k)))
  assert('PROTOCOL(SOP) 3: 임박 위험 → 112·119 / 그 외 → 109·정신건강복지센터·정신건강의학과', ['112', '119', '109', '정신건강복지센터', '정신건강의학과'].every((k) => P[2].includes(k)))
  assert('PROTOCOL(SOP) 4: 기록 + 외부연계 완료 여부를 ⑥ 미해결로 추적', /기록/.test(P[3]) && /인계/.test(P[3]) && /⑥ 미해결/.test(P[3]))
  assert('PROTOCOL: 자해 URGENT 기록이면 원장 화면 갱년기 안전 칸에 SOP 4줄이 모두 보인다', /data-midlife-protocol="self_harm"/.test(h) && MIDLIFE_SELF_HARM_PROTOCOL.every((l) => h.includes(l)))
  const iSafety = h.indexOf('data-midlife-safety="URGENT_REVIEW"')
  const iProto = h.indexOf('data-midlife-protocol')
  assert('PROTOCOL: 절차는 URGENT 안전 칸 안(레인2 7칸보다 앞)에 있다', iSafety > -1 && iProto > iSafety && iProto < h.indexOf('id="lane2-h2"'))
  assert('PROTOCOL 대조군: 대량출혈 URGENT만이면 자해 절차가 없다', !/data-midlife-protocol/.test(renderWs(withUrgent)))
  assert('PROTOCOL 대조군: 안전 해당 없음 기록에도 없다', !/data-midlife-protocol/.test(renderWs(MID_CLEAR.payload)))

  const note = STAFF_CHECK_NOTES.MID_08
  assert('STAFF NOTE: MID_08 직원 확인 화면에 직원용 한 줄이 있다(곁에 머물기 + 원장 호출)', typeof note === 'string' && /곁에 머물/.test(note) && /원장/.test(note))
  assert('STAFF NOTE: 환자가 먼저 읽는 화면이라 이유(자살·자해·출혈)와 번호를 드러내지 않는다', !/자살|자해|출혈|119|109/.test(note))
  assert('STAFF NOTE: 다른 트리거 화면에는 직원 한 줄이 없다(기존 화면 그대로)', Object.keys(STAFF_CHECK_NOTES).join() === 'MID_08')
  const withNote = renderToString(React.createElement(StaffCheckScreen, { onContinue() {}, staffNote: note }))
  const noNote = renderToString(React.createElement(StaffCheckScreen, { onContinue() {} }))
  assert('STAFF NOTE: 직원 확인 화면이 전달받은 한 줄을 그린다', withNote.includes('data-staff-note') && withNote.includes(note))
  assert('STAFF NOTE 대조군: 한 줄이 없으면 기존 화면과 같다(환자 안내 문구 유지)', !noNote.includes('data-staff-note') && noNote.includes('태블릿을 직원에게 보여주세요'))
  assert('STAFF NOTE: App이 현재 화면 id로 한 줄을 넘긴다', /staffNote=\{current \? STAFF_CHECK_NOTES\[current\.id\] : undefined\}/.test(src('src/App.tsx')))
}
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

  // AC3 — Figma 40:49 8카드(스냅샷 + 좌 3 + 우 4) — PO 재검수 2026-09-29 "Figma 구조 기준"
  const CARDS = ['snapshot', 'life-stage', 'top-symptoms', 'baseline-pro', 'hypothesis', 'refutation', 'referral', 'care-plan']
  for (const [label, h] of [['URGENT', html], ['PRIORITY', htmlP], ['CLEAR', htmlC]]) {
    const found = CARDS.filter((c) => h.includes(`data-midlife-card="${c}"`))
    assert(`AC3(${label}): Figma 8카드가 모두 한 패널에 렌더된다`, found.length === 8)
  }
  const panelHtml = html.slice(iPanel)
  const pos = (c) => panelHtml.indexOf(`data-midlife-card="${c}"`)
  assert('AC3: 8카드가 모두 같은 section(갱년기 진료 요약) 안에 있다', CARDS.every((c) => pos(c) > -1 && pos(c) < panelHtml.indexOf('</section>')))
  assert('AC3: Figma 순서 — 스냅샷 → 좌(LIFE STAGE·TOP SYMPTOMS·BASELINE PRO) → 우(HYPOTHESIS·REFUTATION·REFERRAL·CARE PLAN)', CARDS.every((c, i) => i === 0 || pos(CARDS[i - 1]) < pos(c)))
  assert('AC3: 안전 칩이 스냅샷 안에 있다(카드들보다 먼저)', panelHtml.indexOf('data-midlife-safety-chip') > pos('snapshot') && panelHtml.indexOf('data-midlife-safety-chip') < pos('life-stage'))
  assert('AC3: 안전 칩 문구 = 판정(CLEAR "긴급 Red flag 없음" / URGENT / 우선 외부평가)', htmlC.includes('data-midlife-safety-chip="CLEAR">긴급 Red flag 없음') && html.includes('data-midlife-safety-chip="URGENT_REVIEW">URGENT') && htmlP.includes('data-midlife-safety-chip="PRIORITY_EVALUATION">우선 외부평가'))
  assert('AC3: Figma 섹션 라벨·부제가 그대로', ['LIFE STAGE', '지금 어느 전환 단계인가?', 'TOP SYMPTOMS', '환자가 가장 바꾸고 싶은 것', 'BASELINE PRO', 'DIAGNOSTIC HYPOTHESIS', 'REFUTATION TRIGGER', '이 설명을 다시 열어야 하는 조건', 'REFERRAL / UNRESOLVED', 'CARE PLAN / NEXT REVIEW', '이번 4주 무엇을 맡고 언제 다시 볼까?'].every((t) => htmlP.includes(t)))
  assert('AC3: 환자 응답이 환자가 본 라벨로 보인다(주요 증상)', htmlP.includes('열감·땀, 수면 불편'))
  assert('AC3: Baseline PRO 초진값이 태블릿 값 그대로(7/10)', htmlP.includes('data-midlife-baseline="primarySymptom">7/10'))
  assert('AC3: 없는 답은 "—"로(지어내지 않음) -- 무월경이면 마지막 월경 칸 —', /마지막 월경<\/dt><dd>—<\/dd>/.test(htmlP))
  assert('AC3: Figma BASELINE PRO의 "다음 행동 이해" 행은 그리지 않는다(MID_15 삭제 유지, PO 2026-09-29)', !htmlP.includes('다음 행동 이해'))
  assert('AC3: 새 색상 변수를 만들지 않는다', !/--midlife-/.test(src('src/doctor/workspace/workspace.css')))
  {
    // Figma `02 · Midlife Care v0.1` / Doctor View · Midlife · 1440 (40:49) get_design_context 실측값.
    const css = src('src/doctor/workspace/workspace.css')
    const block = css.slice(css.indexOf('Midlife: 갱년기 진료 요약 (MidlifeCarePanel.tsx)'))
    const rule = (sel) => (block.match(new RegExp(`\\n${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`)) ?? [])[1] ?? ''
    const cell = rule('.midlife__cell')
    assert('FIGMA(40:49): 카드 = --border 1px · 14px 모서리 · --surface · 22px 안쪽 · 12px 간격', /1px solid var\(--border\)/.test(cell) && /border-radius: 14px/.test(cell) && /var\(--surface\)/.test(cell) && /padding: 22px/.test(cell) && /gap: 12px/.test(cell))
    assert('FIGMA(40:49): 섹션 라벨 13px semibold --primary, 반증만 --danger, 부제 13px --text-muted', /13px/.test(rule('.midlife__cellTitle')) && /600/.test(rule('.midlife__cellTitle')) && /var\(--primary\)/.test(rule('.midlife__cellTitle')) && /var\(--danger\)/.test(rule('.midlife__cellTitle--warn')) && /var\(--text-muted\)/.test(rule('.midlife__cellSub')))
    assert('FIGMA(40:49): 행 30px, 라벨 좌 / 값 우(semibold)', /min-height: 30px/.test(block) && /\.midlife__facts dd \{[^}]*text-align:\s*right/.test(block) && /\.midlife__facts dd \{[^}]*font-weight: 600/.test(block))
    assert('FIGMA(40:49): 스냅샷 16px 모서리 · 24/28px 안쪽 · 26px 제목 · --primary-soft 안전 칩', /border-radius: 16px/.test(rule('.midlife__snapshot')) && /padding: 24px 28px/.test(rule('.midlife__snapshot')) && /font-size: 26px/.test(rule('.midlife__headline')) && /var\(--primary-soft\)/.test(rule('.midlife__tone--clear')))
    assert('FIGMA(40:49): 열 사이 20px, 카드 사이 16px', /gap: 20px/.test(rule('.midlife__grid')) && /gap: 16px/.test(rule('.midlife__col')))
    assert('FIGMA(40:49): 옛 임시 기준(--pain-*)을 갱년기 블록에서 더 쓰지 않는다', !/var\(--pain-/.test(block.slice(0, block.indexOf('.midlife__field--inline select'))))
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
    reviews: [2, 4, 8, 12].map((w) => rv(w, 'as_expected', { reviewedOn: '2026-10-01', note: `w${w}` })),
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
  assert('REMOVED(UI): review 입력칸에 PRO 선택칸이 없다 — 원장은 경과 판정·기록일만(PO BLOCKER 1)', tr.root.findAll((n) => n.type === 'select' && /주 (주증상|주 증상|수면|일상)/.test(String(n.props['aria-label'] ?? ''))).length === 0)
  assert('AC5(UI): 연속 2회 이탈 → 스냅샷에 가설 재검토 경고', tr.root.findAll((n) => n.props && n.props['data-midlife-alert'] === 'reopen').length === 1)
  await new Promise((res) => setTimeout(res, 1300))
  await act(async () => {})
  const last = saves[saves.length - 1]
  assert('AC5(UI): 자동저장 payload에 midlifeCare.reviews가 실린다', !!last && last.midlifeCare.reviews.map((r) => `${r.week}:${r.courseVsExpected}`).join() === '8:deviates,12:deviates')
  assert('REMOVED(UI): 자동저장된 review에 pro 필드가 없다', !!last && last.midlifeCare.reviews.every((r) => !('pro' in r)))
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

/* =========================================================================
 * SOP 문진 중단 — PO 확정 A9 SOP v0.1 코드 QA 기준 5개 (PR #59 코멘트 2026-09-28)
 *  ① 양성 시 일반 문진 flow를 계속 진행하지 않음
 *  ② 직원 확인/원장 호출 상태가 명확함
 *  ③ URGENT 상태는 원장 확인 전 자동 해제되지 않음
 *  ④ 환자 화면이 판정 문구를 노출하지 않고 "직원이 바로 도와드린다"로 안내
 *  ⑤ 원장 화면에는 양성 이유가 사라지지 않음
 * ========================================================================= */
{
  // App.tsx goNext와 같은 순서: 중단 트리거 → (아니면) 직원 확인 → 다음 문항.
  function walkWithHalt(answers) {
    let r = set(emptyResponses(), { ID_01: '테스트', ID_02: '1234', ID_03: 'female' })
    const order = []
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
      const halt = QUESTIONNAIRE_HALT_TRIGGERS[q.id]
      if (halt && halt(r)) return { r, order, haltedAt: q.id }
      cur = nextQuestion(q.id, r)
    }
    return { r, order, haltedAt: null }
  }

  const selfHarm = walkWithHalt({ ...MIDLIFE_ENTRY, MID_08: ['self_harm_plan'] })
  assert('SOP①: 자해 양성이면 MID_08에서 문진이 멈춘다', selfHarm.haltedAt === 'MID_08' && selfHarm.order[selfHarm.order.length - 1] === 'MID_08')
  assert('SOP①: 멈춘 뒤 문항(MID_09·WOMEN_SAFETY_01·FREE_01)은 보지 않는다', !['MID_09', 'WOMEN_SAFETY_01', 'FREE_01'].some((id) => selfHarm.order.includes(id)))
  assert('SOP① 대조군: 자해+대량출혈 동시 선택도 멈춘다', walkWithHalt({ ...MIDLIFE_ENTRY, MID_08: ['heavy_bleeding_faint', 'self_harm_plan'] }).haltedAt === 'MID_08')
  const bleed = walkWithHalt({ ...MIDLIFE_ENTRY, MID_08: ['heavy_bleeding_faint'] })
  assert('SOP① 대조군: 대량출혈만이면 멈추지 않고 기존 직원 확인 흐름(끝까지 진행)', bleed.haltedAt === null && bleed.order.includes('FREE_01') && STAFF_CHECK_TRIGGERS.MID_08(set(emptyResponses(), { ...MIDLIFE_ENTRY, ID_03: 'female', MID_08: ['heavy_bleeding_faint'] })))
  assert('SOP① 대조군: 해당 없음이면 멈추지 않는다', walkWithHalt({ ...MIDLIFE_ENTRY }).haltedAt === null)
  assert('SOP①: 중단 트리거는 MID_08 하나뿐(다른 문진 흐름 불변)', Object.keys(QUESTIONNAIRE_HALT_TRIGGERS).join() === 'MID_08' && QUESTIONNAIRE_HALT_REASON.MID_08 === 'midlife_self_harm_sop')
  const app = src('src/App.tsx')
  const iHalt = app.indexOf('QUESTIONNAIRE_HALT_TRIGGERS[current.id]')
  const iStaff = app.indexOf('STAFF_CHECK_TRIGGERS[current.id]')
  assert('SOP①: App.goNext는 중단 트리거를 직원 확인보다 먼저 보고, 걸리면 done으로 간다(다음 문항 없음)', iHalt > -1 && iHalt < iStaff && /if \(halt && halt\(responses\)\) \{\s*setHaltedAt\(current\.id\)\s*setVisited\(\(v\) => \[\.\.\.v, current\.id\]\)\s*setPhase\('done'\)\s*return/.test(app))
  assert('SOP②: 중단 제출 metadata에 중단 문항·사유 코드가 남는다(정상 제출엔 없음)', /questionnaire_halted: \{ at_question: haltedAt, reason: QUESTIONNAIRE_HALT_REASON\[haltedAt\]/.test(app) && /\.\.\.\(haltedAt\s*\?/.test(app))
  assert('SOP②: 직원 초기화 시 중단 상태도 풀린다(다음 환자에게 남지 않음)', /setHaltedAt\(null\)/.test(app.slice(app.indexOf('const restart'))))

  // ③ 부분 응답만으로도 URGENT — 뒤 문항 미응답(INCOMPLETE)이 URGENT를 덮지 않는다.
  const p = buildResponsePayload(selfHarm.r)
  assert('SOP③: 중단 시점 payload의 갱년기 판정은 URGENT_REVIEW(자해 근거)', p.safety_flags.midlife.status === 'URGENT_REVIEW' && p.safety_flags.midlife.urgentReasons.includes('self_harm_plan'))
  const root = await mkdtemp(path.join(tmpdir(), 'samindang-midlife-sop-'))
  try {
    const store = createStore(path.join(root, 'submissions'))
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'midlife-sop-halt',
        responses: p,
        flags: computeFlags(selfHarm.r),
        routing: buildRoutingPayload(selfHarm.r),
        metadata: { session_started_at: null, answers: {}, questionnaire_halted: { at_question: 'MID_08', reason: 'midlife_self_harm_sop' } },
      },
      myungri: null,
      patient_label: 'midlife-sop-halt',
    })
    const row = (await store.listSubmissions()).find((x) => x.patient_label === 'midlife-sop-halt')
    assert('SOP③: 서버에 저장된 중단 제출은 오늘 대기열 배지 URGENT', row?.safety_badge === 'URGENT')
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  // ④ 환자 화면
  const halted = renderToString(React.createElement(PatientCompleteScreen, { submitState: 'success', payload: null, devMode: false, onStaffReset() {}, halted: true }))
  const normal = renderToString(React.createElement(PatientCompleteScreen, { submitState: 'success', payload: null, devMode: false, onStaffReset() {} }))
  assert('SOP④: 중단 화면은 "직원이 바로 도와드릴게요" + 기다림 안내 + 직원 한 줄', halted.includes(HALTED_TITLE) && halted.includes(HALTED_HELPER) && halted.includes(HALTED_STAFF_NOTE) && /직원이 바로 도와드/.test(HALTED_TITLE))
  assert('SOP④: 환자 화면에 판정·이유·번호 문구가 없다', !/자살|자해|URGENT|위험|응급|119|112|109/.test(HALTED_TITLE + HALTED_HELPER + HALTED_STAFF_NOTE))
  assert('SOP④: 중단 화면은 "접수 완료" 흐름·진행 단계를 보이지 않는다(문진이 끝난 것처럼 말하지 않음)', !halted.includes('문진이 접수되었습니다') && !halted.includes('statusFlow'))
  const buttons = (halted.match(/<button/g) || []).length
  assert('SOP④: 중단 화면에 환자가 누를 계속·뒤로 버튼이 없다(직원용 2초 초기화 하나뿐)', buttons === 1 && /staffResetHold/.test(halted))
  assert('SOP④ 대조군: 정상 완료 화면은 그대로', normal.includes('문진이 접수되었습니다') && normal.includes('statusFlow') && !normal.includes(HALTED_TITLE))
  const haltedErr = renderToString(React.createElement(PatientCompleteScreen, { submitState: 'error', errorReason: 'x', onRetry() {}, payload: null, devMode: false, onStaffReset() {}, halted: true }))
  assert('SOP④: 중단 제출이 전송 실패하면 "다시 시도"가 보인다(기록이 원장에게 가야 함)', haltedErr.includes('다시 시도'))
  assert('SOP④: App이 중단 여부를 완료 화면에 넘긴다', /halted=\{haltedAt !== null\}/.test(app))

  // ⑤ 원장 화면
  const hp = clone(MID_PRIORITY.payload)
  hp.responses = p
  hp.flags = computeFlags(selfHarm.r)
  hp.routing = buildRoutingPayload(selfHarm.r)
  hp.metadata = { ...hp.metadata, questionnaire_halted: { at_question: 'MID_08', reason: 'midlife_self_harm_sop' } }
  const dh = renderWs(hp)
  assert('SOP⑤: 원장 화면 갱년기 안전 칸 = URGENT + 자해 근거 + SOP 4줄', /data-midlife-safety="URGENT_REVIEW"/.test(dh) && dh.includes('구체적인 자살·자해 생각 또는 계획') && MIDLIFE_SELF_HARM_PROTOCOL.every((l) => dh.includes(l)))
  assert('SOP⑤: "문진이 MID_08에서 중단됨 — 이후 문항 응답 없음"이 보인다', /data-midlife-halted="MID_08"/.test(dh) && dh.includes('이후 문항(병력·복약·임신 여부 등)은 응답이 없습니다'))
  assert('SOP⑤ 대조군: 중단되지 않은 자해 기록에는 중단 표시가 없다', !/data-midlife-halted/.test(renderWs(withSelfHarmPayload())))
  const broken = clone(hp)
  broken.metadata.questionnaire_halted = { at_question: 42 }
  const db = renderWs(broken)
  assert('SOP⑤: 손상된 중단 metadata여도 URGENT·자해 근거·SOP는 남는다(응답에서 재계산)', !/data-midlife-halted/.test(db) && /data-midlife-safety="URGENT_REVIEW"/.test(db) && /data-midlife-protocol="self_harm"/.test(db))
}

/* =========================================================================
 * PO 재검수 BLOCKER 1 — 재진 PRO는 환자가 직접, 원장은 다시 타이핑하지 않는다
 * (PR #59 리뷰 2026-09-28 → 추천안 승인 2026-09-29: 갱년기 재진 링크마다 MID_05·06·07)
 * ========================================================================= */
{
  assert('B1: 서버 재질문 표 = MID_05·06·07(같은 초진 문항 id)', DETAIL_CHECK_MIDLIFE_QUESTION_IDS.join() === 'MID_05,MID_06,MID_07')
  assert('B1: 세 문항 모두 0~10 척도라 재진 화면이 그대로 그린다(resolveDetailCheckQuestions: numeric_scale)', DETAIL_CHECK_MIDLIFE_QUESTION_IDS.every((id) => qById.get(id)?.input === 'numeric_scale' && qById.get(id).scale?.max === 10))
  assert('B1: 서버 갱년기 판정 = 원장 화면 isMidlifeRecord와 같은 키(primary_concern.key)', isMidlifeSubmissionResponses(MID_CLEAR.payload.responses) && !isMidlifeSubmissionResponses(DOCTOR_FIXTURES.find((f) => f.payload.routing.primary_module === 'Pain').payload.responses) && !isMidlifeSubmissionResponses(null))
  const base = baselineDetailAnswersFromResponses(MID_PRIORITY.payload.responses)
  assert('B1: 재진 카드의 "초진 → 오늘" 초진값이 태블릿 값에서 나온다(MID_05·06·07)', base.MID_05 === String(MID_PRIORITY.payload.responses.modules.midlife.primary_symptom_0_10) && base.MID_06 !== undefined && base.MID_07 !== undefined)

  const root = await mkdtemp(path.join(tmpdir(), 'samindang-midlife-b1-'))
  try {
    const store = createStore(path.join(root, 'data'), { followUpTokenTtlMinutes: 30, followUpTokenRetentionHours: 24, startRevisitDedupWindowMs: 1 })
    // 갱년기 환자: 초진 제출 + 원장이 4주 목표 2개(FollowUpTarget)를 저장
    const subM = await store.createSubmission({
      submission: { questionnaire_version: '1.0', session_id: 'mid-b1', responses: MID_CLEAR.payload.responses, flags: MID_CLEAR.payload.flags, routing: MID_CLEAR.payload.routing, metadata: {} },
      myungri: null,
      patient_label: 'mid-b1',
    })
    let targets = []
    for (const g of care.midlifeGoalOptions().filter((o) => ['midlife_goal:sleep', 'midlife_goal:hot_flash_sweat'].includes(o.id))) targets = care.toggleMidlifeGoal(targets, g)
    await store.saveWorkspace(subM.id, { ...emptyWorkspaceState(), herbalFollowUpTargets: targets })

    const started = await store.startRevisit(subM.patient_id)
    const dc = started.session.detail_check
    assert('B1: 갱년기 재진 링크는 원장 재평가 계획이 없어도 MID_05·06·07을 싣는다', !!dc && dc.reason === 'MIDLIFE_REVIEW' && dc.question_ids.join() === 'MID_05,MID_06,MID_07')
    assert('B1: 통증 공통 재질문(PAIN_03·VISIT_04)은 갱년기 환자에게 섞이지 않는다', !dc.question_ids.some((id) => id.startsWith('PAIN_') || id.startsWith('VISIT_')))
    assert('B2: 4주 목표 2개가 다음 재진 링크의 확인 항목(Micro Follow-up 후보)으로 그대로 이어진다', started.session.targets.map((t) => t.id).join() === 'midlife_goal:hot_flash_sweat,midlife_goal:sleep')

    const submitted = await store.submitFollowUpSession(started.token, {
      targetRatings: [{ targetId: 'midlife_goal:sleep', label: 'x', patientReportedValue: '조금 나아짐' }],
      detailAnswers: [
        { questionId: 'MID_05', value: '4' },
        { questionId: 'MID_06', value: '6' },
        { questionId: 'MID_07', value: '3' },
        { questionId: 'PAIN_03', value: '9' },
      ],
      overallChange: '',
      newSymptomReported: false,
      newSymptomNote: '',
      adverseEffectReported: false,
      adverseEffectNote: '',
    })
    assert('B1: 환자 답은 기존 MicroFollowUpResponse.detailAnswers에 저장(새 저장소 없음), 링크에 없던 문항(PAIN_03)은 버려진다', submitted.ok === true && submitted.response.detailAnswers.map((a) => a.questionId).join() === 'MID_05,MID_06,MID_07')

    const hist = await store.getPatientHistory(subM.patient_id, subM.visit_id)
    const rep = hist.midlife_pro_reports
    assert('B1: 원장 워크스페이스를 아직 저장하지 않은 재진도 PRO 보고에 나온다', Array.isArray(rep) && rep.length === 1 && rep[0].visit_id === started.visit.id)
    assert('B1: 보고 값 = 환자가 누른 값(4·6·3), 원장 입력 없음', rep[0].primary_symptom_0_10 === 4 && rep[0].sleep_satisfaction_0_10 === 6 && rep[0].function_interference_0_10 === 3)
    assert('B1 회귀: 미저장 재진은 visits에 들어가지 않는다(Micro Follow-up 후보 carry-forward 불변)', hist.visits.every((v) => v.visit_id !== started.visit.id))
    const again = await store.deriveMicroFollowUpCandidates(subM.patient_id, undefined)
    assert('B1 회귀: 그래서 다음 링크 후보도 여전히 초진의 4주 목표', again.map((c) => c.id).join() === 'midlife_goal:hot_flash_sweat,midlife_goal:sleep')

    // 대조군: 통증 환자는 계획이 없으면 재질문 없음(기존 동작 그대로)
    const painFixture = DOCTOR_FIXTURES.find((f) => f.payload.routing.primary_module === 'Pain')
    const subP = await store.createSubmission({
      submission: { questionnaire_version: '1.0', session_id: 'pain-b1', responses: painFixture.payload.responses, flags: painFixture.payload.flags, routing: painFixture.payload.routing, metadata: {} },
      myungri: null,
      patient_label: 'pain-b1',
    })
    await store.saveWorkspace(subP.id, emptyWorkspaceState())
    const startedP = await store.startRevisit(subP.patient_id)
    assert('B1 대조군: 통증 환자(재평가 계획 없음)는 기존대로 재질문 없음', startedP.session.detail_check == null)
    const histP = await store.getPatientHistory(subP.patient_id, subP.visit_id)
    assert('B1 대조군: 통증 환자 이력의 갱년기 PRO 보고는 빈 목록', Array.isArray(histP.midlife_pro_reports) && histP.midlife_pro_reports.length === 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  // 화면 쪽 파서 -- 검증 없는 저장값에서 온 응답
  const parsed = readMidlifeProReports([
    { visit_id: 'v1', created_at: '2026-10-12T01:00:00Z', primary_symptom_0_10: 4, sleep_satisfaction_0_10: 6, function_interference_0_10: 3 },
    { visit_id: 'v2', created_at: '2026-10-26T01:00:00Z', primary_symptom_0_10: '5', sleep_satisfaction_0_10: 11, function_interference_0_10: 2.5 },
    null,
    { visit_id: 3 },
  ])
  assert('B1: 파서 — 0~10 정수만, 문자열·범위 밖·소수는 null, 깨진 원소는 버림(던지지 않음)', parsed.length === 2 && parsed[1].primarySymptom === null && parsed[1].sleepSatisfaction === null && parsed[1].functionInterference === null && parsed[0].sleepSatisfaction === 6)
  assert('B1: 파서 — 배열이 아니면 빈 목록(옛 서버)', readMidlifeProReports(undefined).length === 0 && readMidlifeProReports({}).length === 0)

  // 7칸 BASELINE PRO: 초진 + 재진 보고(실제 날짜·+N주), 원장 입력칸 없음
  const started = '2026-10-01T00:00:00Z'
  const pay = clone(MID_PRIORITY.payload)
  pay.metadata = { ...pay.metadata, session_started_at: started }
  const reports = [
    { visitId: 'r2', createdAt: '2026-10-29T02:00:00Z', primarySymptom: 3, sleepSatisfaction: 7, functionInterference: 2 },
    { visitId: 'r1', createdAt: '2026-10-15T02:00:00Z', primarySymptom: 5, sleepSatisfaction: 5, functionInterference: 4 },
    { visitId: 'old', createdAt: '2026-01-01T00:00:00Z', primarySymptom: 9, sleepSatisfaction: 1, functionInterference: 9 },
  ]
  const hp = renderToString(React.createElement(MidlifeCarePanel, { payload: pay, value: care.emptyMidlifeCareRecord(), onChange() {}, proReports: reports }))
  const cardPro = hp.slice(hp.indexOf('data-midlife-card="baseline-pro"'), hp.indexOf('data-midlife-card="hypothesis"'))
  assert('B1(UI): 재진 보고가 날짜순 열로(10/15 → 10/29), +N주 표기', cardPro.indexOf('data-midlife-report="r1"') > -1 && cardPro.indexOf('data-midlife-report="r1"') < cardPro.indexOf('data-midlife-report="r2"') && cardPro.includes('+2주') && cardPro.includes('+4주'))
  assert('B1(UI): 초진 이전 보고(다른 에피소드)는 섞지 않는다', !cardPro.includes('data-midlife-report="old"') && !cardPro.includes('9/10'))
  assert('B1(UI): 값은 환자 보고 그대로(5/10 → 3/10)', /주증상<\/th><td[^>]*>[^<]*<\/td><td>5\/10<\/td><td>3\/10<\/td>/.test(cardPro))
  assert('B1(UI): BASELINE PRO 카드에 입력칸(select·input)이 하나도 없다 — 원장 재입력 경로 없음', !/<(select|input|textarea)/.test(cardPro))
  const hEmpty = renderToString(React.createElement(MidlifeCarePanel, { payload: MID_PRIORITY.payload, value: care.emptyMidlifeCareRecord(), onChange() {} }))
  assert('B1(UI): 재진 보고가 없으면 "재진 링크에서 환자가 다시 답하면…" 안내(빈 칸을 지어내지 않음)', hEmpty.includes('data-midlife-pro-empty'))
  const ws = src('src/doctor/workspace/DoctorWorkspace.tsx')
  assert('B1: DoctorWorkspace가 이력의 midlifeProReports를 패널에 넘긴다', /proReports=\{priorVisits\?\.midlifeProReports\}/.test(ws))
  // CLAUDE.md 경로 규칙 — 지운 경로 3개 × 소스 단언
  assert('REMOVED(B1): 저장 모델 MidlifeReview에 pro 필드가 없다', !/\bpro: /.test(src('src/doctor/workspace/midlifeCare.ts')) && !/MidlifePro\b/.test(src('src/doctor/workspace/midlifeCare.ts')))
  assert('REMOVED(B1): 패널에 review PRO 선택칸(`${activeWeek}주 ${row.title}`)이 없다', !/주 \$\{row\.title\}/.test(src('src/doctor/workspace/MidlifeCarePanel.tsx')) && !/active\.pro/.test(src('src/doctor/workspace/MidlifeCarePanel.tsx')))
  assert('REMOVED(B1): PRO 표가 review.pro를 읽지 않는다(환자 보고만)', !/reviewFor\(w\)\.pro/.test(src('src/doctor/workspace/MidlifeCarePanel.tsx')))
}

/* =========================================================================
 * PO 재검수 BLOCKER 2 — 4주 care goal = 기존 FollowUpTarget(최대 2)
 * ========================================================================= */
{
  const opts = care.midlifeGoalOptions()
  const ids = opts.map((o) => o.id)
  assert('B2: 선택지 = MID_13 환자 목표 목록 그대로(라벨 복사 없이 스펙에서)', opts.length === qById.get('MID_13').options.length && qById.get('MID_13').options.every((o) => ids.includes(`midlife_goal:${o.value}`) && opts.find((x) => x.id === `midlife_goal:${o.value}`).label === o.label))
  assert('B2: 목표는 FollowUpTarget 모양(id·label·baseline·postTreatmentValue)', JSON.stringify(Object.keys(opts[0]).sort()) === JSON.stringify(['baseline', 'id', 'label', 'postTreatmentValue']))
  let t = []
  t = care.toggleMidlifeGoal(t, opts[0])
  t = care.toggleMidlifeGoal(t, opts[1])
  const third = care.toggleMidlifeGoal(t, opts[2])
  assert('B2: 갱년기 목표는 최대 2개 — 세 번째는 무시(다른 목표를 밀어내지 않음)', third === t && t.length === 2)
  assert('B2: 다시 누르면 해제', care.toggleMidlifeGoal(t, opts[0]).map((x) => x.id).join() === opts[1].id)
  const herbal = [{ id: 'sleep', label: '수면 불편', baseline: '', postTreatmentValue: '' }, { id: 'digestion', label: '속 불편', baseline: '', postTreatmentValue: '' }]
  const withOne = care.toggleMidlifeGoal(herbal, opts[0])
  assert('B2: 한약 재평가 대상과 같은 배열 — 전체 상한 3은 기존 규칙 그대로', withOne.length === 3 && care.toggleMidlifeGoal(withOne, opts[1]) === withOne)
  assert('B2: 한약 대상은 갱년기 목표로 세지 않는다', care.selectedMidlifeGoals(withOne).length === 1)
  assert('B2: 전용 careGoals 필드를 만들지 않았다', !/careGoals/.test(src('src/doctor/workspace/midlifeCare.ts')) && !/careGoals/.test(src('src/doctor/workspace/persistence.ts')))

  // UI: 칩을 누르면 herbalFollowUpTargets에 저장되고, CARE PLAN 카드에 Figma 줄이 보인다
  const saves = []
  let tr
  act(() => {
    tr = TestRenderer.create(
      React.createElement(DoctorWorkspace, {
        payload: MID_CLEAR.payload,
        submissionId: 'sub-midlife-b2',
        initialWorkspaceState: emptyWorkspaceState(),
        initialRecordUpdatedAt: 't0',
        onSaveWorkspace: async (state) => {
          saves.push(state)
          return { ok: true, updatedAt: `t${saves.length}` }
        },
      }),
    )
  })
  const goalBtn = (label) => tr.root.findAll((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined && [].concat(n.props.children).join('') === label && n.parent?.props?.['data-midlife-goals'] !== undefined)[0]
  act(() => goalBtn('수면 불편').props.onClick())
  act(() => goalBtn('열감·땀').props.onClick())
  assert('B2(UI): 2개를 고르면 나머지 목표 칩은 비활성', goalBtn('두통').props.disabled === true && goalBtn('수면 불편').props['aria-pressed'] === true)
  await new Promise((res) => setTimeout(res, 1300))
  await act(async () => {})
  const last = saves[saves.length - 1]
  assert('B2(UI): 자동저장 payload의 herbalFollowUpTargets에 4주 목표 2개가 실린다', !!last && last.herbalFollowUpTargets.map((x) => x.id).join() === 'midlife_goal:sleep,midlife_goal:hot_flash_sweat')
  act(() => tr.unmount())
  const hp = renderWs(MID_CLEAR.payload)
  const plan = hp.slice(hp.indexOf('data-midlife-card="care-plan"'))
  assert('B2(UI): CARE PLAN 카드에 Figma 줄(4주 목표 · 2주 확인 악화·안전·순응 · 4주 재평가 PRO + 외부결과)', plan.includes('4주 목표') && plan.includes('악화 · 안전 · 순응') && plan.includes('PRO + 외부결과'))
}

console.log(`\nSUMMARY: ${passed} assertions passed, ${failed} failed (total ${passed + failed})`)
if (failed > 0) process.exit(1)
