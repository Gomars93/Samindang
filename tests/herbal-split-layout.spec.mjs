/*
 * 한약 단독 두 칼럼 배치 계약 (Figma `03 · Herbal Doctor View v0.1`, 프레임 44:3 — PO 승인 2026-10-03).
 *
 * 이 파일은 CLAUDE.md의 "경로를 지우거나 교체할 때" 규칙을 코드로 고정한다.
 * 옮긴 경로 (한약 단독·비갱년기 기록에서만):
 *
 *   | 값                                   | 옛 자리              | 새 자리                              |
 *   |--------------------------------------|----------------------|--------------------------------------|
 *   | 상담 목적(primaryConcernLabel)       | 확인 레인 hero 행    | 맨 위 스냅샷(HerbalSnapshot) 제목    |
 *   | 안전이슈(herbalSafetyIssue)          | 확인 레인 hero 행    | 스냅샷 칩                            |
 *   | 핵심 병기 후보 + 최종 판단에 가져오기 | 확인 레인            | 판단·처치 레인(DecisionExtras)       |
 *   | 오늘 재검(Structured Reassessment)   | 확인 레인            | 판단·처치 레인(DecisionExtras)       |
 *
 * 확인해야 하는 것은 **지우지 않은 쪽 화면**이다(CLAUDE.md 네 번의 사고): mixed·pain·갱년기 기록은
 * 옛 구성 그대로여야 하고(§C), 입력 방향(후보 가져오기 → 최종 변증·병기, 저장 키)과 출력 방향(스냅샷
 * 값이 hero와 같은 계산)이 끊기지 않아야 한다(§B).
 *
 * `npm run test:herbal-split-layout` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { DoctorWorkspace } from './.herbal-split-workspace-bundle.cjs'
import { HerbalWorkspaceDecisionExtras, herbalSafetyIssue, herbalSystemicFields } from './.herbal-split-herbal-bundle.cjs'
import { HERBAL_SCENARIO_1, MIXED_SCENARIO_1, PAIN_SCENARIO_1 } from './.herbal-split-fixtures-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const render = (scenario) =>
  renderToString(React.createElement(DoctorWorkspace, { payload: scenario.payload, synthetic: scenario.synthetic }))

/** `lane2-h2` ~ `judgment-h2` 사이(확인 레인)와 그 뒤(판단·처치 레인)를 나눈다. */
const lanes = (html) => {
  const l2 = html.indexOf('id="lane2-h2"')
  const j = html.indexOf('id="judgment-h2"')
  return { lane1: html.slice(0, l2), lane2: html.slice(l2, j), judgment: html.slice(j), l2, j }
}

/* ------------------------------------------------------------------ *
 * §A 한약 단독(비갱년기): 새 구성
 * ------------------------------------------------------------------ */
{
  const html = render(HERBAL_SCENARIO_1)
  const { lane1, lane2, judgment } = lanes(html)

  check('A-1 한약 단독은 두 칼럼 래퍼(.herbalSplit, data-herbal-layout="split")를 가진다', html.includes('class="herbalSplit" data-herbal-layout="split"'))
  check('A-2 스냅샷(A)이 안전 확인 레인(S)보다 먼저 그려진다', html.indexOf('herbalSnapshot') > 0 && html.indexOf('herbalSnapshot') < html.indexOf('id="lane1-h2"'))
  check('A-3 스냅샷 제목이 상담 목적 값이고 부제에 "상담 목적 · 전신 문진 응답 n항목"이 있다', /painSnapshot__title">[^<]+<\/h2><p class="painSnapshot__subtitle">상담 목적 · 전신 문진 응답 \d+항목/.test(html))
  check('A-4 스냅샷의 응답 항목 수가 herbalSystemicFields 개수와 같다(두 곳이 따로 세지 않는다)', html.includes(`전신 문진 응답 ${herbalSystemicFields(HERBAL_SCENARIO_1.payload).length}항목`))
  check('A-5 안전이슈 칩은 "<span>안전이슈</span><strong>값</strong>" 형태로 정확히 한 번 나온다(hero 행은 옮겨졌다)', (html.match(/<span>안전이슈<\/span><strong[^>]*>[^<]+<\/strong>/g) || []).length === 1)
  check('A-6 REMOVED(hero 행): 상담 목적·안전이슈 행 컨테이너(.workspace__heroRows)가 한약 단독 화면에 없다', !html.includes('workspace__heroRows'))
  check('A-7 확인 레인(왼쪽)에는 SYSTEMIC·EXAM이 있고 판단 카드류는 없다', lane2.includes('>SYSTEMIC<') && lane2.includes('>EXAM<') && !lane2.includes('>FINAL<') && !lane2.includes('>FOLLOW-UP<'))
  check('A-8 EXAM 섹션은 옛 이름 "오늘 확인할 것"을 접근성 이름(aria-label)으로 남긴다', lane2.includes('aria-label="오늘 확인할 것"'))
  check('A-9 판단·처치 레인(오른쪽)에 FINAL → FOLLOW-UP → 오늘 재검이 이 순서로 있다', judgment.indexOf('>FINAL<') > 0 && judgment.indexOf('>FINAL<') < judgment.indexOf('>FOLLOW-UP<') && judgment.indexOf('>FOLLOW-UP<') < judgment.indexOf('오늘 재검(Structured Reassessment)'))
  check('A-10 REMOVED(확인 레인): 핵심 병기 후보가 확인 레인에 없고 판단·처치 레인에 있다', !lane2.includes('핵심 병기 후보') && judgment.includes('핵심 병기 후보') && judgment.includes('>PATTERN<'))
  check('A-11 REMOVED(확인 레인): 오늘 재검이 확인 레인에 없고 판단·처치 레인에 있다', !lane2.includes('오늘 재검(Structured Reassessment)') && judgment.includes('오늘 재검(Structured Reassessment)'))
  check('A-12 판단 입력 4칸 라벨이 그대로 남아 있다(최종 변증·병기 / 처방/계획 메모 / 추적할 증상 / 치법)', ['최종 변증·병기', '처방/계획 메모', '추적할 증상', '치법'].every((t) => judgment.includes(t)))
  check('A-13 재평가 대상은 옛 이름을 접근성 이름으로 남긴다', judgment.includes('aria-label="재평가 대상 (측정 추적)"'))
  check('A-14 한약 상담 중단 사유 카드는 안전 확인 레인(S)에 그대로 있다', lane1.includes('한약 상담 중단 사유'))
  check('A-15 단계 래퍼에는 속성이 늘지 않았다(hidden만으로 단계를 가른다)', /<div class="doctor__visitStep" data-step="consult"( hidden="")?>/.test(html))
}

/* ------------------------------------------------------------------ *
 * §B 입력·출력 방향
 * ------------------------------------------------------------------ */
{
  // 입력 방향: 판단 레인으로 옮긴 "최종 판단에 가져오기"가 같은 키(finalPatternOrMechanism)에 쓴다.
  const base = {
    id: 'cand-1',
    displayName: '(예시) 비위허약',
    supportingFacts: [],
    contradictingFacts: [],
    unknownChecks: [],
    source: 'SUGGESTED',
    status: 'ACCEPTED',
    clinicianNote: '',
  }
  const fa = { finalPatternOrMechanism: '기존 변증', treatmentPrinciple: '', prescriptionPlanNote: '', symptomsToTrack: '', recordedAt: null }
  let got = null
  let tr
  act(() => {
    tr = TestRenderer.create(
      React.createElement(HerbalWorkspaceDecisionExtras, {
        patternCandidates: [base],
        onChangePatternCandidate: () => {},
        finalAssessment: fa,
        onChangeFinalAssessment: (next) => {
          got = next
        },
        reassessment: { items: [] },
        onChangeReassessment: () => {},
      }),
    )
  })
  const adopt = tr.root.findAll((n) => n.type === 'button' && JSON.stringify(n.props.children || '').includes('최종 판단에 가져오기'))
  check('B-1 판단 레인의 후보 카드에 "최종 판단에 가져오기" 버튼이 있다', adopt.length === 1)
  act(() => adopt[0].props.onClick())
  check('B-2 누르면 같은 키(finalPatternOrMechanism)에 기존 값을 지우지 않고 후보명을 한 줄 덧붙인다', got && got.finalPatternOrMechanism === '기존 변증\n(예시) 비위허약')
  check('B-3 다른 칸(치법·처방 메모·추적할 증상)은 건드리지 않고 recordedAt만 갱신한다', got && got.treatmentPrinciple === '' && got.prescriptionPlanNote === '' && got.symptomsToTrack === '' && typeof got.recordedAt === 'string')

  // 출력 방향: 스냅샷 칩이 hero와 같은 계산(herbalSafetyIssue)을 쓴다 -- 네 단계가 서로 다른 말을 한다.
  const mk = (flagsPatch, answered) => {
    const p = JSON.parse(JSON.stringify(HERBAL_SCENARIO_1.payload))
    p.flags = { ...p.flags, ...flagsPatch }
    p.responses.safety_flags.red_flag_general = answered
    return p
  }
  const clear = herbalSafetyIssue(mk({ general_red: false }, ['none']))
  check('B-4 답했고 위험 없음 → "없음" / clear / danger 아님', clear.text === '없음' && clear.level === 'clear' && clear.danger === false)
  const unknown = herbalSafetyIssue(mk({ general_red: false }, []))
  check('B-5 아직 안 물음 → "미확인" / unknown (녹색 체크로 안전하다고 말하지 않는다)', unknown.text === '미확인' && unknown.level === 'unknown' && unknown.danger === false)
  const red = herbalSafetyIssue(mk({ general_red: true, requires_staff_check: true }, ['chest_breathing']))
  check('B-6 공통 위험신호 → "공통 위험신호" / urgent / danger', red.text.includes('공통 위험신호') && red.level === 'urgent' && red.danger === true)
  const broken = herbalSafetyIssue({ ...HERBAL_SCENARIO_1.payload, flags: {} })
  check('B-7 flags를 읽을 수 없으면 "확인 필요 — 계산값 읽기 불가" / review (fail-open 금지)', broken.text === '확인 필요 — 계산값 읽기 불가' && broken.level === 'review' && broken.danger === true)
}

/* ------------------------------------------------------------------ *
 * §C 지우지 않은 쪽: mixed·pain은 옛 구성 그대로
 * ------------------------------------------------------------------ */
{
  const mixed = render(MIXED_SCENARIO_1)
  const m = lanes(mixed)
  check('C-1 mixed에는 두 칼럼 래퍼도 스냅샷도 없다', !mixed.includes('herbalSplit') && !mixed.includes('herbalSnapshot'))
  check('C-2 mixed의 확인 레인에 상담 목적·안전이슈 행이 그대로 있다', m.lane2.includes('workspace__heroRows') && m.lane2.includes('<span>상담 목적</span>') && m.lane2.includes('<span>안전이슈</span>'))
  check('C-3 mixed의 확인 레인에 핵심 병기 후보·오늘 재검이 그대로 있다', m.lane2.includes('핵심 병기 후보') && m.lane2.includes('오늘 재검(Structured Reassessment)'))
  check('C-4 mixed의 hero 제목은 옛 문구("한약·전신")다', m.lane2.includes('<h3>한약·전신</h3>'))
  const pain = render(PAIN_SCENARIO_1)
  check('C-5 pain에는 두 칼럼 래퍼가 없다', !pain.includes('herbalSplit') && !pain.includes('herbalSnapshot'))
}

/* ------------------------------------------------------------------ *
 * §D 소스: 갱년기 기록 제외, 한 곳에서만 계산, CSS 계약
 * ------------------------------------------------------------------ */
{
  const dw = read('src/doctor/workspace/DoctorWorkspace.tsx')
  const hw = read('src/doctor/workspace/HerbalWorkspace.tsx')
  const css = read('src/doctor/workspace/workspace.css')
  // 규칙만 본다 -- 주석에 선택자 이름이 적혀 있다고 통과/실패가 뒤집히면 안 된다(tests/herbal-workspace-slim.spec.mjs와 같은 이유).
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')
  check("D-1 두 칼럼 배치는 갱년기 기록을 제외한다 (activeProfile === 'herbal' && !isMidlifeRecord(payload))", /const herbalSplit = activeProfile === 'herbal' && !isMidlifeRecord\(payload\)/.test(dw))
  check('D-2 확인 레인의 세 블록은 split일 때 그리지 않는다 (hero 행·병기 후보·오늘 재검)', /\{!split && \(\s*<div className="workspace__heroRows">/.test(hw) && /\{!split && patternCandidates\.length > 0 && \(/.test(hw) && /\{!split && \(\s*<details className="workspace__optional"/.test(hw))
  check('D-3 DecisionExtras는 herbalSplit일 때만, 같은 상태 키 세 개를 읽고 쓴다', /\{herbalSplit && \(\s*<HerbalWorkspaceDecisionExtras[\s\S]*?herbalPatternCandidates[\s\S]*?herbalFinalAssessment[\s\S]*?herbalReassessment[\s\S]*?\/>/.test(dw))
  check('D-4 "최종 판단에 가져오기" 계산은 한 함수(adoptCandidateToFinal)를 두 자리가 함께 쓴다', (hw.match(/adoptCandidateToFinal\(/g) || []).length >= 3)
  check('D-5 안전이슈 계산은 herbalSafetyIssue 한 곳이고 hero 행과 스냅샷이 둘 다 그것을 읽는다', (hw.match(/herbalSafetyIssue\(payload\)/g) || []).length === 2 && !/safetyIssueCategories\(flags\)/.test(hw.slice(hw.indexOf('export function HerbalWorkspaceLane2'))))
  check('D-6 두 칼럼은 1280px 이상에서만 둘이고, 그 아래는 한 칼럼 + 촘촘한 카드다', /@media \(min-width: 1280px\) \{\s*\.herbalSplit \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(css) && /@media \(max-width: 1279px\) \{\s*\.herbalSplit \{\s*gap: 10px;/.test(css))
  check('D-7 확인·판단·처치 레인 제목(h2)은 눈에서만 숨기고 점프 도착점으로 남긴다(display:none 아님)', /\.herbalSplit > \.doctor__visitLane--lane2 > h2,\s*\.herbalSplit > \.doctor__visitLane--judgment > h2 \{[^}]*clip: rect\(0 0 0 0\)/.test(css) && !/\.herbalSplit[^{]*h2[^{]*\{[^}]*display:\s*none/.test(cssCode))
  check('D-8 EXAM 칩 블록은 절반 폭 칼럼에서 제 줄(전폭)로 내려간다(펼침 비용 +946px 회귀 방지)', /\.herbalSplit \.workspace__observationRow > \.workspace__obsChipBlock[^{]*\{\s*grid-column: 1 \/ -1;/.test(css))
  check('D-9 단계 래퍼(.doctor__visitStep)에는 규칙을 얹지 않았다', !/\.doctor__visitStep[^{]*\{/.test(cssCode))
}

console.log(`\nSUMMARY: ${passed} assertions passed, 0 failed (total ${passed})`)
