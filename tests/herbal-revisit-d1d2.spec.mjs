/*
 * 한약 재진 D1·D2 (PO "D1 D2 추천안으로 진행해줘", 2026-10-05) 계약.
 *
 * 바뀐 경로 (한약 재진에서만):
 *
 *   | 값                           | 옛 자리(통증 어휘)        | 새 자리(한약 재진)         | 저장 키                         |
 *   |------------------------------|---------------------------|----------------------------|---------------------------------|
 *   | 시행/예정 처치               | 통증 처치 칩 + 기타       | 자유 입력 textarea         | finalAssessment.interventionPerformedOrPlanned |
 *   | 치료 초점                    | Task·Load·Capacity 칩     | 자유 입력 textarea         | finalAssessment.treatmentFocus  |
 *   | 운동 실제 시행·난이도        | 간단 체크 5번째 그룹      | 숨김(값 있으면 보임·래치)  | revisitQuickCheck.exerciseAdherence |
 *
 * 확인해야 하는 것은 **지우지 않은 쪽 화면**이다: 통증 재진은 칩·운동 그룹이 그대로여야 하고(§C), 입력은 같은 키에
 * 닿아야 하며(§B), 값이 있는데 숨기면 안 된다(§B-3, CLAUDE.md 표시 조건 규칙).
 *
 * `npm run test:herbal-revisit-d1d2` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { PainFinalAssessmentCard } from './.revisit-d1d2-final-bundle.cjs'
import { RevisitQuickCheckCard } from './.revisit-d1d2-quick-bundle.cjs'
import { isHerbalRevisitSource } from './.revisit-d1d2-profile-bundle.mjs'
import { HERBAL_SCENARIO_1, MIXED_SCENARIO_1, PAIN_SCENARIO_1 } from './.revisit-d1d2-fixtures-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const emptyFinal = () => ({
  finalWorkingAssessment: '',
  interventionPerformedOrPlanned: '',
  immediateRetestTarget: '',
  treatmentFocus: '',
  recordedAt: null,
})
const emptyQuick = () => ({
  targetFunctionChange: 'NOT_ASSESSED',
  overallResponse: 'NOT_ASSESSED',
  newNeuroOrRedFlag: 'NOT_ASSESSED',
  exerciseAdherence: 'NOT_ASSESSED',
  adverseEffect: 'NOT_ASSESSED',
  note: '',
  recordedAt: null,
})
const finalHtml = (value, freeText) =>
  renderToString(React.createElement(PainFinalAssessmentCard, { value, onChange: () => {}, freeTextTreatment: freeText }))
const quickHtml = (value, hide) =>
  renderToString(React.createElement(RevisitQuickCheckCard, { value, onChange: () => {}, hideExerciseGroup: hide }))

/* §A 프로필 판별 — fail-closed. 입력은 저장된 문진 payload(`{routing, responses}`) */
const src = (sc) => ({ routing: sc.payload.routing, responses: sc.payload.responses })
check('A1 한약 문진 → 한약 재진', isHerbalRevisitSource(src(HERBAL_SCENARIO_1)) === true)
check('A2 통증 문진 → 통증 재진', isHerbalRevisitSource(src(PAIN_SCENARIO_1)) === false)
check('A3 혼합 문진 → 통증 재진 화면 그대로', isHerbalRevisitSource(src(MIXED_SCENARIO_1)) === false)
check('A4 제출 없음(undefined/null) → false', !isHerbalRevisitSource(undefined) && !isHerbalRevisitSource(null))
check('A5 깨진 값(문자열·배열·숫자) → 던지지 않고 false', !isHerbalRevisitSource('x') && !isHerbalRevisitSource([]) && !isHerbalRevisitSource(7))
check('A6 갱년기 → false(자기 패널이 있다)', isHerbalRevisitSource({ ...src(HERBAL_SCENARIO_1), responses: { primary_concern: { key: 'midlife' } } }) === false)
check('A7 routing 없음/깨짐 → false(한약으로 단정하지 않는다)', !isHerbalRevisitSource({ routing: null }) && !isHerbalRevisitSource({ routing: 'x' }) && !isHerbalRevisitSource({ routing: { primary_module: null } }) && !isHerbalRevisitSource({}))
check('A8 fixture routing이 deriveViewProfile과 같은 판정(한약=pain 없음)', HERBAL_SCENARIO_1.payload.routing.primary_module !== 'Pain' && PAIN_SCENARIO_1.payload.routing.primary_module === 'Pain')

/* §B 한약 재진 */
{
  const html = finalHtml({ ...emptyFinal(), treatmentFocus: '보익기혈', interventionPerformedOrPlanned: '탕약 2주' }, true)
  check('B1 처치·치료 초점이 textarea로 나온다', (html.match(/<textarea/g) || []).length >= 2 && html.includes('시행/예정 처치') && html.includes('치료 초점'))
  check('B2 통증 칩 어휘가 안 나온다(Task·Load·Capacity 칩)', !html.includes('workspace__chip') && !/aria-pressed/.test(html))
  check('B3 저장된 값이 칸에 그대로 보인다(입력→출력 끊김 없음)', html.includes('보익기혈') && html.includes('탕약 2주'))
  // 입력 방향: 같은 키로 쓴다
  const seen = []
  let tree
  act(() => {
    tree = TestRenderer.create(React.createElement(PainFinalAssessmentCard, { value: emptyFinal(), onChange: (n) => seen.push(n), freeTextTreatment: true }))
  })
  const areas = tree.root.findAllByType('textarea')
  const focus = areas.find((a) => a.props.placeholder === '원장이 직접 입력' && a.parent.findAllByType('span').some((s) => s.children.join('') === '치료 초점'))
  act(() => focus.props.onChange({ target: { value: '소화 회복 우선' } }))
  check('B4 치료 초점 편집이 treatmentFocus 키에 쓰인다', seen.length === 1 && seen[0].treatmentFocus === '소화 회복 우선' && seen[0].recordedAt !== null)
  const act2 = areas.find((a) => a.props.placeholder.includes('자동 처방 생성 없음'))
  act(() => act2.props.onChange({ target: { value: '탕약 3주' } }))
  check('B5 처치 편집이 interventionPerformedOrPlanned 키에 쓰인다', seen[1].interventionPerformedOrPlanned === '탕약 3주')
  // 값이 비어도(편집 중 전부 지움) 칸이 남는다
  check('B6 값이 빈 문자열이어도 두 칸이 그대로 있다(표시 조건 3항)', (finalHtml(emptyFinal(), true).match(/<textarea/g) || []).length >= 2)
  // D2
  check('B7 한약 재진: 운동 그룹 숨김', !quickHtml(emptyQuick(), true).includes('운동 실제 시행'))
  check('B8 한약 재진: 나머지 4그룹은 그대로', ['목표 기능 변화', '전체 증상 반응', '새 신경증상·위험신호', '치료 후 이상반응'].every((t) => quickHtml(emptyQuick(), true).includes(t)))
  check('B9 이미 값이 있으면 숨기지 않는다', quickHtml({ ...emptyQuick(), exerciseAdherence: 'PARTIAL' }, true).includes('운동 실제 시행'))
  // 래치: 값 있어 보였다가 지워도 안 사라진다
  let qt
  act(() => { qt = TestRenderer.create(React.createElement(RevisitQuickCheckCard, { value: { ...emptyQuick(), exerciseAdherence: 'PARTIAL' }, onChange: () => {}, hideExerciseGroup: true })) })
  act(() => { qt.update(React.createElement(RevisitQuickCheckCard, { value: emptyQuick(), onChange: () => {}, hideExerciseGroup: true })) })
  check('B10 한 번 보인 운동 그룹은 값을 지워도 안 사라진다(래치)', JSON.stringify(qt.toJSON()).includes('운동 실제 시행'))
}

/* §C 통증 재진 무변경 */
{
  const html = finalHtml(emptyFinal(), false)
  const html2 = renderToString(React.createElement(PainFinalAssessmentCard, { value: emptyFinal(), onChange: () => {} }))
  check('C1 기본값(prop 없음)과 false가 같은 출력', html === html2)
  check('C2 통증 재진: 처치·치료 초점 칩이 그대로', html.includes('workspace__') && html.includes('치료 초점') && /aria-pressed/.test(html))
  check('C3 통증 재진: 운동 그룹 그대로', quickHtml(emptyQuick(), false).includes('운동 실제 시행'))
  check('C4 prop 없음 = 운동 그룹 그대로', renderToString(React.createElement(RevisitQuickCheckCard, { value: emptyQuick(), onChange: () => {} })).includes('운동 실제 시행'))
}

/* §D 소스 텍스트 단언 — 옮긴/숨긴 경로 1개당 1개 */
{
  const rw = strip(read('src/doctor/workspace/RevisitWorkspace.tsx'))
  const fa = strip(read('src/doctor/workspace/FinalAssessmentCard.tsx'))
  const qc = strip(read('src/doctor/workspace/RevisitQuickCheckCard.tsx'))
  check('D1 시행/예정 처치: 한약 재진은 같은 키로 textarea', /key:\s*'interventionPerformedOrPlanned'/.test(fa) && /freeTextTreatment \? \(/.test(fa))
  check('D2 치료 초점: 한약 재진은 같은 키로 textarea', /key:\s*'treatmentFocus'/.test(fa))
  check('D3 운동 그룹: 래치(useOpenOnceContent)로 숨김', /useOpenOnceContent\(!hideExerciseGroup \|\| value\.exerciseAdherence !== 'NOT_ASSESSED'\)/.test(qc))
  check('D4 RevisitWorkspace가 두 prop을 같은 신호로 넘긴다', /hideExerciseGroup=\{isHerbalRevisit\}/.test(rw) && /freeTextTreatment=\{isHerbalRevisit\}/.test(rw))
  check('D5 신호는 부위 팩 없음 + 최근 제출 한약일 때만', /revisitPack === null && isHerbalRevisitSource\(/.test(rw))
  check('D6 DoctorWorkspace(초진)는 이 prop을 쓰지 않는다', !/freeTextTreatment|hideExerciseGroup/.test(strip(read('src/doctor/workspace/DoctorWorkspace.tsx'))))
}

console.log(`herbal-revisit-d1d2: ${passed} assertions passed`)
