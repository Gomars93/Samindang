/*
 * 한약 재진 두 칼럼 배치 계약 (Figma `46:2`, PO "다음 추천안으로 진행" 2026-10-05).
 *
 * 옮긴 경로 (한약 재진에서만 — 값·키·순서는 그대로, 배치만):
 *
 *   | 블록                                  | 옛 자리(한 칼럼)   | 새 자리(≥1280px)      |
 *   |---------------------------------------|--------------------|-----------------------|
 *   | 오늘 환자 입력(MicroFollowUpCard)     | 위에서 2번째       | 왼쪽 칼럼             |
 *   | 이전 방문 참고(읽기 전용)             | 3번째              | 왼쪽 칼럼             |
 *   | 오늘 원장 입력(이어가기 3버튼)        | 4번째              | 오른쪽 칼럼 맨 위     |
 *   | 임상 루프 상태 바·간단 체크·최종 판단 | 그 아래            | 오른쪽 칼럼           |
 *   | 재평가 대상·접힌 3줄·세부 재검 안내   | 그 아래            | 오른쪽 칼럼           |
 *   | 저장 상태 줄                          | 맨 아래            | 칼럼 아래 전폭(그대로)|
 *
 * 확인해야 하는 것은 **지우지 않은 쪽 화면**이다: 통증 재진은 래퍼가 없어 DOM이 이전과 같아야 한다(§A).
 * 이 환경에는 서버가 없어 RevisitWorkspace 전체 렌더는 못 한다 -- 래퍼는 SSR로, 배치는 소스 순서 단언으로 고정한다.
 *
 * `npm run test:herbal-revisit-split` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { RevisitSplitShell, RevisitSplitColumn } from './.revisit-split-bundle.cjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const h = React.createElement

/* §A 래퍼 */
const kids = (a) => [h(RevisitSplitColumn, { key: 'l', active: a, side: 'left' }, h('p', null, 'L')), h(RevisitSplitColumn, { key: 'r', active: a, side: 'right' }, h('p', null, 'R'))]
const off = renderToString(h(RevisitSplitShell, { active: false }, ...kids(false)))
const on = renderToString(h(RevisitSplitShell, { active: true }, ...kids(true)))
check('A1 통증 재진(inactive): 래퍼 없음 — DOM이 자식만', off === '<p>L</p><p>R</p>')
check('A2 한약 재진(active): 래퍼와 두 칼럼', on.includes('class="revisitSplit"') && on.includes('revisitSplit__col--left') && on.includes('revisitSplit__col--right'))
check('A3 왼쪽이 먼저(소스 순서 = 한 칼럼일 때의 순서)', on.indexOf('>L<') < on.indexOf('>R<'))
check('A4 shell만 active이고 column이 inactive여도 자식은 사라지지 않는다', renderToString(h(RevisitSplitShell, { active: true }, ...kids(false))).includes('>L<'))

/* §B 소스: 어느 블록이 어느 칼럼에 있는가 + 아무것도 빠지지 않았는가 */
const raw = read('src/doctor/workspace/RevisitWorkspace.tsx')
const rw = strip(raw)
const body = rw.slice(rw.indexOf('<RevisitSplitShell active={isHerbalRevisit}>'))
const leftOpen = body.indexOf('side="left"')
const rightOpen = body.indexOf('side="right"')
const shellEnd = body.indexOf('</RevisitSplitShell>')
const left = body.slice(leftOpen, rightOpen)
const right = body.slice(rightOpen, shellEnd)
const after = body.slice(shellEnd)
check('B1 왼쪽: 오늘 환자 입력 + MicroFollowUpCard', left.includes('오늘 환자 입력') && left.includes('<MicroFollowUpCard'))
check('B2 왼쪽: 이전 방문 참고(읽기 전용)', left.includes('이전 방문 참고') && left.includes('읽기 전용'))
check('B3 왼쪽에는 입력 카드가 없다', !/RevisitQuickCheckCard|PainFinalAssessmentCard|FollowUpTargetPicker|<details/.test(left))
check('B4 오른쪽: 이어가기 3버튼 + 루프 상태 바 + 간단 체크 + 최종 판단 + 재평가 대상',
  ['이전 판단 유지', '이전 처치·관리계획 유지', '기존 Follow-up Target 유지', '<ClinicalLoopStatusBar', '<RevisitQuickCheckCard', '<PainFinalAssessmentCard', '<FollowUpTargetPicker'].every((k) => right.includes(k)))
check('B5 오른쪽: 접힌 3줄(치료 계획·오늘 재검·다음 재평가 계획) + 세부 재검 안내', ['치료 계획 (Care Plan)', '오늘 재검(Structured Reassessment)', '다음 재평가 계획 변경', 'detailCheckDue'].every((k) => right.includes(k)))
check('B6 오른쪽: 요통 가설 카드/이어받기도 같은 자리(통증 전용 게이트 그대로)', right.includes('이전 가설 이어받기') && right.includes('<WorkingHypothesisCard'))
check('B7 저장 상태 줄은 칼럼 밖(전폭)', after.includes('workspace__saveStatus') && !right.includes('workspace__saveStatus'))
check('B8 히어로·충돌 배너는 칼럼 위(전폭)', rw.indexOf('workspace__hero') < rw.indexOf('<RevisitSplitShell') && rw.indexOf('<ConflictBanner') < rw.indexOf('<RevisitSplitShell'))
const once = (s, k) => s.split(k).length - 1
check('B9 각 입력 카드는 정확히 한 번(복제·누락 없음)', ['<MicroFollowUpCard', '<RevisitQuickCheckCard', '<PainFinalAssessmentCard', '<FollowUpTargetPicker', '<StructuredReassessmentCard', '<NextReassessmentPlanCard', '<PainCarePlanCard'].every((k) => once(rw, k) === 1))
check('B10 두 래퍼 모두 같은 isHerbalRevisit 신호', once(rw, 'active={isHerbalRevisit}') === 3)
check('B11 래퍼 컴포넌트는 모듈 최상위(렌더 안 정의 → 재마운트 방지)', /^export function RevisitSplitShell/m.test(raw) && /^export function RevisitSplitColumn/m.test(raw))

/* §C CSS */
const css = strip(read('src/doctor/workspace/workspace.css'))
check('C1 ≥1280px에서 두 칼럼', /@media \(min-width: 1280px\)\s*\{\s*\.revisitSplit\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/.test(css))
check('C2 기본(<1280px)은 한 칼럼', /\.revisitSplit\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/.test(css))
check('C3 카드 반경 14·여백 22(Figma 값)', /\.revisitSplit \.workspace__block\s*\{[^}]*border-radius:\s*14px;[^}]*padding:\s*22px/.test(css))
check('C4 통증 재진 규칙을 건드리지 않는다(.workspace__revisit 기본 규칙 그대로)', /\.workspace__revisit\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*gap:\s*16px;\s*\}/.test(css))

const dcss = strip(read('src/doctor/doctor.css'))
check('C5 재진 두 칼럼도 진료 화면과 같은 넓은 폭·여백(별도 블록, 기존 규칙 불변)', /\.doctor:has\(\.revisitSplit\)\s*\{[^}]*max-width:\s*none;[^}]*padding:\s*28px 24px 96px/.test(dcss) && /\.doctor:has\(\.doctor__visitShell\)\s*\{/.test(dcss))

console.log(`herbal-revisit-split: ${passed} assertions passed`)
