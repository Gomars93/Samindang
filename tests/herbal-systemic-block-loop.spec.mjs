/*
 * 회귀 방지: 한약/체질 전신 정보 블록(CONST_·HERB_ 8문항)이 병력정보·
 * 출생정보·마무리 단계에서 반복 재등장하지 않는지 검증한다.
 *
 * 배경(2026-09-21 실기기 재현). 원장이 테스트 환자로 한약(체질·보약) 문진을
 * 진행하던 중, 전신 정보 8문항(기력/잠/소화/대변/식욕/한열/갈증/땀)이
 * "병력정보로 넘어간 뒤에도 계속 뒤에서 다시 등장"하는 것을 발견했다.
 * 원인은 `reorderForDetailPhases`의 삽입점(insertAt) 계산이 매 호출마다
 * postList의 "현재 미응답 최전선"을 다시 찾는 방식이었던 것 -- 8문항을 이미
 * 다 답한 뒤에도, 병력정보·출생정보를 한 문항씩 답할 때마다 그 최전선이
 * 전진하면서 이미 끝난 8문항 블록 전체가 그 최전선을 "쫓아가며" 매번
 * 재삽입됐다.
 *
 * 이 버그를 기존 test:integration의 광범위한 통합 스위트(autoAnswerWalk /
 * autoAnswerWalkOrdered)가 전혀 잡지 못했던 이유가 이 파일이 존재하는
 * 이유다: 그 두 헬퍼는 매 스텝마다 "아직 답 안 한 보이는 문항을 통째로
 * 스캔"해서 고르므로(`visible.find(q => r[q.id] == null)`), 배열 순서가
 * 뒤에서 흔들려도 이미 답한 문항을 다시 "찾아내지" 않는다 -- 이 버그
 * 클래스에 원천적으로 눈이 먼 구조다. 반면 실제 태블릿 앱(src/App.tsx의
 * nextQuestion)은 "현재 문항의 배열상 다음 자리"만 보고 그 자리에 이미
 * 답변이 있는지는 보지 않는다(App.tsx 자체 주석 참고) -- 그래서 이 파일은
 * 그 실제 알고리즘을 그대로 재현해서 걷는다. 두 워크 방식이 다르면
 * 회귀를 놓칠 수 있다는 걸 보여준 사례라 기록해 둔다.
 *
 * `npm run test:herbal-loop` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import {
  ALL_QUESTIONS,
  visibleQuestions,
  pruneStaleResponses,
  questionnaireMode,
  SYSTEMIC_BLOCK_QUESTION_IDS,
  HERBAL_ADDON_FIELD,
} from './.spec-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}

function emptyResponses() {
  return Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))
}

function set(r, patch) {
  return pruneStaleResponses({ ...r, ...patch }).responses
}

function deterministicValue(q, r) {
  const opts = q.optionsIf ? q.optionsIf(r) : q.options
  if (q.input === 'multi_choice') return [opts[0].value]
  if (q.input === 'single_choice') return opts[0].value
  if (q.input === 'short_text') return 'x'
  if (q.input === 'numeric') return '1'.repeat(q.maxLength || 1)
  if (q.input === 'numeric_scale') return '5'
  throw new Error(`deterministicValue: unknown input type ${q.input} for ${q.id}`)
}

/**
 * src/App.tsx의 nextQuestion(from, r)을 그대로 재현한다 -- "응답 여부"가
 * 아니라 "현재 문항의 배열상 다음 자리"만 본다. shouldAutoAdvancePast는
 * LBP 전용 스킵이라 이 herbal 경로에는 영향이 없어 생략한다(실제로도
 * 아래 걷는 경로 어디에도 LBP_02/03/10이 없음).
 */
function nextQuestionPositional(from, r) {
  const list = visibleQuestions(r)
  const fromIdx = list.findIndex((q) => q.id === from)
  const idx = fromIdx >= 0 ? fromIdx + 1 : 0
  return list[idx]
}

const WALK_CAP = 300

/** App.tsx의 실제 forward-only 위치기반 워크를 재현한다. */
function positionalWalk(seedAnswers) {
  let r = set(emptyResponses(), seedAnswers)
  let current = visibleQuestions(r)[0]
  const visitOrder = []
  let steps = 0
  for (; steps < WALK_CAP; steps++) {
    if (!current) return { responses: r, visitOrder, terminated: true, steps }
    visitOrder.push(current.id)
    if (r[current.id] === undefined || r[current.id] === null) {
      r = set(r, { [current.id]: deterministicValue(current, r) })
    }
    current = nextQuestionPositional(current.id, r)
  }
  return { responses: r, visitOrder, terminated: false, steps }
}

function countVisits(visitOrder) {
  const counts = new Map()
  for (const id of visitOrder) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

// ------------------------------------------------------------------
// 시나리오 1(핵심 회귀): 처음부터 한약 목적(expanded) -- 실기기에서
// 보고된 정확한 경로. 전신 정보 8문항은 정확히 한 번씩만 방문해야 한다.
// ------------------------------------------------------------------
{
  const { visitOrder, terminated, steps } = positionalWalk({
    ID_03: 'female',
    VISIT_00_INTENT: 'herbal',
    VISIT_00B_HERBAL_PURPOSE: 'tonic',
  })
  check('시나리오1(체질·보약): 워크가 종료된다(무한 루프 아님)', terminated, `(${steps}스텝)`)

  const counts = countVisits(visitOrder)
  for (const id of SYSTEMIC_BLOCK_QUESTION_IDS) {
    check(
      `시나리오1 CRITICAL: ${id}가 정확히 1회만 방문된다(실기기 버그 = 병력정보 각 문항 뒤에서 재등장)`,
      counts.get(id) === 1,
      `(실제 ${counts.get(id) ?? 0}회)`,
    )
  }
  // 병력정보/출생정보/마무리도 각 1회씩만 -- 8문항 블록이 재등장하며 이
  // 문항들 자체를 건너뛰거나 중복 방문시키지 않았는지 함께 확인한다.
  for (const id of ['MED_USE', 'HISTORY_01', 'ALLERGY_01', 'SURGERY_01', 'BIRTH_01', 'BIRTH_02', 'BIRTH_03', 'FREE_01']) {
    check(`시나리오1: ${id}도 정확히 1회만 방문된다`, counts.get(id) === 1, `(실제 ${counts.get(id) ?? 0}회)`)
  }
  check('시나리오1: 전체 방문 횟수가 보이는 문항 수와 같다(중복 0)', visitOrder.length === new Set(visitOrder).size)
}

// 증상치료 목적(symptom, 25화면 경로)도 동일하게 확인 -- 모듈 문항이 섞여도
// 같은 버그가 재현될 수 있었다.
{
  const { visitOrder, terminated } = positionalWalk({
    ID_03: 'female',
    VISIT_00_INTENT: 'herbal',
    VISIT_00B_HERBAL_PURPOSE: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'digestion',
  })
  check('시나리오1b(증상치료): 워크가 종료된다', terminated)
  const counts = countVisits(visitOrder)
  for (const id of SYSTEMIC_BLOCK_QUESTION_IDS) {
    check(`시나리오1b: ${id}가 정확히 1회만 방문된다`, counts.get(id) === 1, `(실제 ${counts.get(id) ?? 0}회)`)
  }
}

// ------------------------------------------------------------------
// 시나리오 2: herbal_addon(진료 중 나중에 활성화) -- 이 경로의 forward-
// reachability 요구사항(V-AddonFull/V-AddonPartial, integration.spec.mjs)은
// 계속 지켜져야 한다. 단, 이 고침은 "활성화 이전에 이미 답한 postList
// 문항들"이 한 번 더 재표시되는 새로운(그러나 유한하고 값이 보존되는)
// 대가를 도입한다 -- 무한 재등장이 아니라 활성화 시점 이전 항목 수만큼의
// 유한한 재확인이라는 걸 여기서 명시적으로 고정한다.
// ------------------------------------------------------------------
{
  const phase1 = positionalWalk({
    ID_03: 'female',
    VISIT_00_INTENT: 'pain_care',
    PAIN_01: 'low_back_pelvis',
  })
  check('시나리오2 사전조건: pain_fast 단독으로도 정상 종료된다', phase1.terminated)
  check(
    '시나리오2 사전조건: 전신 블록은 pain_fast 완주 중 전혀 답해지지 않는다',
    SYSTEMIC_BLOCK_QUESTION_IDS.every((id) => phase1.responses[id] === null),
  )

  const withAddon = set(phase1.responses, { [HERBAL_ADDON_FIELD]: 'yes' })
  check('시나리오2: herbal_addon 모드로 전환된다', questionnaireMode(withAddon) === 'herbal_addon')
  check(
    '시나리오2 CRITICAL: 활성화 직후 전신 블록 8문항 전부가 보인다(forward-reachability, V-AddonFull과 동일 불변식)',
    SYSTEMIC_BLOCK_QUESTION_IDS.every((id) => visibleQuestions(withAddon).some((q) => q.id === id)),
  )

  // 활성화 시점부터 이어서 위치기반으로 계속 걷는다(phase1이 멈춘 마지막
  // 문항의 "다음"부터).
  let r = withAddon
  let current = nextQuestionPositional(phase1.visitOrder[phase1.visitOrder.length - 1], r)
  const visitOrder2 = []
  let steps2 = 0
  for (; steps2 < WALK_CAP; steps2++) {
    if (!current) break
    visitOrder2.push(current.id)
    if (r[current.id] === undefined || r[current.id] === null) {
      r = set(r, { [current.id]: deterministicValue(current, r) })
    }
    current = nextQuestionPositional(current.id, r)
  }
  check('시나리오2: 활성화 후 워크가 종료된다(무한 루프 아님)', steps2 < WALK_CAP, `(${steps2}스텝)`)
  check(
    '시나리오2: 활성화 후 전신 블록 8문항이 모두 답해진다',
    SYSTEMIC_BLOCK_QUESTION_IDS.every((id) => r[id] !== null && r[id] !== undefined),
  )

  const counts2 = countVisits(visitOrder2)
  const maxRevisit = Math.max(0, ...[...counts2.values()])
  check(
    '시나리오2: 어떤 문항도 2회를 초과해 재등장하지 않는다(1회=정상, 2회=활성화 이전 항목의 알려진 1회성 재확인, 3회 이상이면 다시 무한 재등장 버그)',
    maxRevisit <= 2,
    `(최대 ${maxRevisit}회)`,
  )
  const revisited = [...counts2.entries()].filter(([, n]) => n === 2).map(([id]) => id)
  check(
    '시나리오2: 2회 방문된 문항은 전부 활성화 이전에 이미 답했던 postList 항목뿐이다(전신 블록 자체는 포함되지 않음)',
    revisited.every((id) => !SYSTEMIC_BLOCK_QUESTION_IDS.includes(id)),
    `(2회 방문: ${revisited.join(', ') || '없음'})`,
  )
}

console.log(`\nSUMMARY: ${passed} assertions passed, 0 failed (total ${passed})`)
