/*
 * 한약 닥터뷰 화면 축소(PR-A, PO 승인 2026-09-21) 계약.
 *
 * PO 지시: "다음 섹션은 폐기하자. 오히려 못 써먹을 것 같아 / 정말정말
 * 액기스만 남기고 다 빼버리자." herbal 단독 프로필의 `다음` 레인 전체를
 * 렌더하지 않는다. pain·mixed는 건드리지 않는다.
 *
 * 이 파일이 존재하는 이유는 CLAUDE.md의 "경로를 지우거나 교체할 때"
 * 규칙 4항 -- **지운 경로 1개당 소스 텍스트 단언 1개**이다. Batch 4 D-1은
 * 정확히 이 클래스의 사고였다: EMR 복사 경로를 한 곳으로 모으면서 한약
 * 진료가 빈 값을 복사하고도 "복사됨"을 띄웠다. 그래서 여기서는 화면에서
 * 뗀 것(§A)뿐 아니라, **뗀 입력이 EMR 출력 라벨로 남아 있지 않은지**(§B)를
 * 함께 고정하고, 동시에 **떼지 않은 쪽(mixed)이 그대로인지**(§C)를 고정한다.
 * CLAUDE.md가 네 번의 사고 끝에 적어둔 대로 -- "확인해야 하는 것은 지우지
 * 않은 쪽 화면이다."
 *
 * `npm run test:herbal-workspace-slim` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHerbalWorkspaceEmrPreview } from './.herbal-slim-emrpreview-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const WORKSPACE = read('src/doctor/workspace/DoctorWorkspace.tsx')
const VIEW = read('src/doctor/DoctorView.tsx')
const HERBAL = read('src/doctor/workspace/HerbalWorkspace.tsx')

/* ------------------------------------------------------------------ *
 * §A 화면: herbal 단독은 `다음` 레인에 도달하지 않는다
 * ------------------------------------------------------------------ */

// A-0: 레인 전체가 하나의 프로필 가드 뒤에 있다 -- 개별 블록을 하나씩
// 숨기는 방식이었다면 새 블록이 추가될 때마다 가드를 빠뜨릴 수 있다.
// 2026-09-24 「마무리」 화면 분리: 이 레인은 `.doctor__visitStep[data-step=
// "wrapup"]` 래퍼 한 겹 안으로 들어갔다(주석 포함). 가드 자체는 그대로
// 바깥에 있어야 한다 -- 래퍼가 가드보다 바깥으로 나가면 herbal 단독에서
// 빈 마무리 화면과 그 단계 전환 버튼이 되살아난다.
check(
  'A-0 `다음` 레인 <section>이 activeProfile !== "herbal" 가드 뒤에 있다 (마무리 단계 래퍼까지 통째로)',
  /\{activeProfile !== 'herbal' && \([\s\S]{0,900}?<div className="doctor__visitStep" data-step="wrapup" hidden=\{visitStep !== 'wrapup'\}>\s*\n\s*<section className="doctor__visitLane doctor__visitLane--next"/.test(
    WORKSPACE,
  ),
)

// A-1..A-5: 지운 경로 1개당 단언 1개. 각 블록은 HerbalWorkspaceNext 안에
// 있고, HerbalWorkspaceNext는 이제 mixed에서만 렌더된다.
const nextLane = WORKSPACE.slice(
  WORKSPACE.indexOf("{activeProfile !== 'herbal' && ("),
  WORKSPACE.indexOf('<LaneJumpNav'),
)
check(
  'A-1 HerbalWorkspaceNext(재평가 대상 칩 + 다음 방문 확인 메모 + 다음 액션 + 관리계획·다음 재평가 + 참고 자료)는 mixed에서만 렌더된다',
  /\{activeProfile === 'mixed' && \(\s*\n\s*<HerbalWorkspaceNext/.test(nextLane),
)
check(
  'A-2 HerbalWorkspaceNext 호출부가 `다음` 레인 가드 안에만 있다 (레인 밖 2차 렌더 경로 없음)',
  WORKSPACE.split('<HerbalWorkspaceNext').length - 1 === 1,
)
check(
  'A-3 CRM 복약 코스 슬롯(medicationCourseSlot)이 `다음` 레인 가드 안에 있다',
  nextLane.includes('{medicationCourseSlot}') && !WORKSPACE.slice(WORKSPACE.indexOf('<LaneJumpNav')).includes('medicationCourseSlot'),
)
check(
  'A-4 재진 간단문진 푸터(nextLaneFooter)가 `다음` 레인 가드 안에 있다',
  nextLane.includes('{nextLaneFooter}') && !WORKSPACE.slice(WORKSPACE.indexOf('<LaneJumpNav')).includes('nextLaneFooter'),
)
check(
  'A-5 LaneJumpNav의 `다음` 버튼이 showNext로 분기하고, herbal에서 꺼진다 (아무 데도 가지 않는 죽은 버튼 방지)',
  /\{ id: 'next-h2', label: '마무리', step: 'wrapup', nextOnly: true \}/.test(WORKSPACE) &&
    /showNext=\{activeProfile !== 'herbal'\}/.test(WORKSPACE) &&
    /!it\.nextOnly \|\| showNext/.test(WORKSPACE),
)

/* ------------------------------------------------------------------ *
 * §B 출력: 화면에서 뗀 입력은 EMR 라벨로도 남지 않는다 (D-1 재발 방지)
 * ------------------------------------------------------------------ */

check(
  'B-0 herbal 단독 EMR 조립이 slim=true로 호출된다',
  /if \(viewProfile === 'herbal'\) return buildHerbalEmrTextForRecord\(true\)/.test(VIEW),
)
check(
  'B-1 mixed EMR 조립은 slim=false -- 편집 UI가 살아 있으므로 키를 계속 넘긴다',
  /buildHerbalEmrTextForRecord\(false\)/.test(VIEW),
)

/* ------------------------------------------------------------------ *
 * B-1a/B-1b (PO 지시 2026-09-25): `재평가 대상` 편집 UI가 herbal 단독에
 * 되살아났다(판단·처치 레인의 HerbalFollowUpTargetsCard). 화면과 출력은
 * 항상 같이 움직여야 한다 -- 화면만 되살리고 EMR 키를 안 넘기면 원장이
 * 고른 값이 기록에 안 간다(D-1의 거울상이고, 이쪽이 더 나쁘다).
 *
 * `carePlan`/`nextReassessmentPlan`은 편집 UI가 여전히 없으므로 slim에서
 * 계속 뺀다 -- 넘기면 그게 바로 원래의 D-1이다.
 * ------------------------------------------------------------------ */
{
  const fnStart = VIEW.indexOf('function buildHerbalEmrTextForRecord(slim: boolean)')
  const fn = VIEW.slice(fnStart, VIEW.indexOf('\n  }', fnStart))
  check('B-1a slim 경로도 `재평가 대상`을 넘긴다 (편집 UI가 되살아났다)', fnStart > 0 && /^\s*followUpTargets: workspaceState\.herbalFollowUpTargets,/m.test(fn))
  const slimBranch = fn.slice(fn.indexOf('...(slim'))
  check('B-1b slim 분기에는 followUpTargets가 더 이상 없다 (조건부가 아니라 항상 넘긴다)', !slimBranch.includes('followUpTargets'))
  check('B-1c carePlan/nextReassessmentPlan은 여전히 slim에서 빠진다 (편집 UI가 없다)',
    /carePlan: workspaceState\.herbalCarePlan/.test(slimBranch) &&
      /nextReassessmentPlan: workspaceState\.nextReassessmentPlan/.test(slimBranch))
}

const observations = [
  { id: 'obs_tongue', category: 'tongue', title: '설진', checked: true, value: '치흔', recordedAt: '2026-09-21T00:00:00.000Z' },
]
const finalAssessment = {
  finalPatternOrMechanism: '비기허',
  treatmentPrinciple: '건비익기',
  prescriptionPlanNote: '탕약 2주',
  symptomsToTrack: '피로',
  recordedAt: '2026-09-21T00:00:00.000Z',
}
const carePlan = {
  currentManagementGoal: '관리목표X',
  medicationPlanNote: '처방메모X',
  homeLifestyleManagement: '생활관리X',
  symptomsToObserve: '관찰X',
  adverseEffectContactInstruction: '이상반응X',
  nextVisitCheckItem: '다음확인X',
  recordedAt: '2026-09-21T00:00:00.000Z',
}
const followUpTargets = [{ id: 'ft1', label: '수면', baseline: '4', postTreatmentValue: '', recordedAt: null }]
const nextReassessmentPlan = { status: 'VISIT_COUNT', visitCount: 4, date: '', note: '', recordedAt: null }

const slim = buildHerbalWorkspaceEmrPreview({
  primaryConcern: '한약·보약 상담',
  clinicianObservations: observations,
  finalAssessment,
})
const full = buildHerbalWorkspaceEmrPreview({
  primaryConcern: '한약·보약 상담',
  clinicianObservations: observations,
  finalAssessment,
  followUpTargets,
  carePlan,
  nextReassessmentPlan,
})

// 지운 경로 1개당 출력 단언 1개.
for (const label of ['관리 목표', '처방/한약 계획', '집·생활 관리', '이상반응 안내', '다음 방문 확인']) {
  check(
    `B-2 slim 텍스트에 관리 계획 라벨 "${label}"이 빈 채로 남지 않는다`,
    !slim.includes(`${label}:`),
  )
}
check('B-3 slim 텍스트에 "재평가 대상" 라벨이 빈 채로 남지 않는다', !slim.includes('재평가 대상:'))
check('B-4 slim 텍스트에 "다음 상세 재평가" 라벨이 빈 채로 남지 않는다', !slim.includes('다음 상세 재평가:'))

// 남긴 경로는 그대로 나와야 한다 -- 편집 UI가 레인2/판단·처치에 살아 있다.
check('B-5 slim 텍스트에 상담 목적이 남는다', slim.includes('상담 목적: 한약·보약 상담'))
check('B-6 slim 텍스트에 설진/맥진/복진 소견이 남는다 (편집 UI는 레인2)', /설진\/맥진\/복진 소견: .+치흔/.test(slim))
check('B-7 slim 텍스트에 최종 변증·병기/치법/처방 메모/추적할 증상이 남는다 (편집 UI는 판단·처치)',
  slim.includes('최종 변증·병기: 비기허') &&
    slim.includes('치법: 건비익기') &&
    slim.includes('처방/계획 메모: 탕약 2주') &&
    slim.includes('추적할 증상: 피로'),
)

/* ------------------------------------------------------------------ *
 * §C 지우지 않은 쪽: mixed는 하나도 잃지 않는다
 * ------------------------------------------------------------------ */

for (const label of ['관리 목표', '처방/한약 계획', '집·생활 관리', '이상반응 안내', '다음 방문 확인', '재평가 대상', '다음 상세 재평가']) {
  check(`C-1 mixed(full) 텍스트는 "${label}"을 그대로 유지한다`, full.includes(`${label}:`))
}
check('C-2 mixed(full) 텍스트의 재평가 대상 값이 실제로 조립된다', full.includes('재평가 대상: 수면 — 기준 4'))
check(
  'C-3 HerbalWorkspaceNext 컴포넌트 자체는 삭제되지 않았다 (mixed가 계속 쓴다)',
  HERBAL.includes('export function HerbalWorkspaceNext('),
)
check(
  'C-4 PainWorkspaceNext는 pain·mixed 조건 그대로다 (통증 경로 무변경)',
  /\{\(activeProfile === 'pain' \|\| activeProfile === 'mixed'\) && \(\s*\n\s*<PainWorkspaceNext/.test(WORKSPACE),
)
check(
  'C-5 판단·처치 레인의 HerbalFinalAssessmentCard는 herbal에서 그대로 렌더된다 (판단 4칸은 남긴다)',
  /\{\(activeProfile === 'herbal' \|\| activeProfile === 'mixed'\) && \(\s*\n\s*<HerbalFinalAssessmentCard/.test(WORKSPACE),
)
check(
  'C-6 레인2(오늘 한눈에 / 오늘 확인할 것 / 오늘 재검)는 herbal에서 그대로다',
  HERBAL.includes('export function HerbalWorkspaceLane2(') &&
    HERBAL.includes('오늘 확인할 것') &&
    HERBAL.includes('<ClinicianObservationChecklist'),
)

console.log(`\n한약 화면 축소 계약 ${passed}개 단언 통과`)
