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

/*
 * 주석을 뗀 사본. "이 식별자가 소스에 없다"를 단언할 때는 **코드만** 봐야
 * 한다 -- 폐기 이유를 설명하는 JSDoc에 그 식별자 이름이 그대로 적혀 있으면
 * 산문 때문에 통과/실패가 뒤집힌다. 이 저장소에서 같은 사고(T-6)가 이미
 * 한 번 났다.
 */
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
const WORKSPACE_CODE = stripComments(WORKSPACE)
/*
 * 스트리퍼 자기점검은 **합성 표본**으로 한다. 실제 소스의 어떤 낱말이
 * 주석에 남아 있는지에 기대면(예: "JSDoc에 `showNext`가 적혀 있다"),
 * 나중에 그 산문만 정리해도 이 점검이 깨진다 -- 코드는 옳은데 테스트가
 * 실패하는, 신호가 아닌 잡음이 된다.
 */
{
  const SAMPLE = "{/* jsxComment */}\n/* blockComment */\nconst keepMe = 1 // lineComment\n"
  const stripped = stripComments(SAMPLE)
  check(
    'A-pre 스트리퍼는 JSX·블록·라인 주석 세 형태를 모두 뗀다',
    !stripped.includes('jsxComment') && !stripped.includes('blockComment') && !stripped.includes('lineComment'),
    `(남은 것: ${JSON.stringify(stripped)})`,
  )
  check('A-pre 스트리퍼는 코드를 지우지 않는다', stripped.includes('const keepMe = 1'))
}
check(
  'A-pre 주석 제거 후에도 점프 항목 리터럴이 남아 있다 (A-5가 공허하지 않도록)',
  WORKSPACE_CODE.includes('LANE_JUMP_ITEMS') && WORKSPACE_CODE.includes("label: '마무리'"),
)
check(
  'A-pre 실제 소스에도 주석이 있었다 (스트리퍼가 무엇도 안 뗐다면 A-5는 옛 형태와 같다)',
  WORKSPACE_CODE.length < WORKSPACE.length - 2000,
  `(원본 ${WORKSPACE.length}자 → 코드 ${WORKSPACE_CODE.length}자)`,
)

/* ------------------------------------------------------------------ *
 * §A 화면: herbal 단독은 `다음` 레인에 도달하지 않는다
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * A-0 (2026-09-26 PO 지시 안 1로 뒤집혔다)
 *
 * PR-A는 `다음` 레인 전체를 하나의 프로필 가드 뒤에 두었다 -- 개별 블록을
 * 하나씩 숨기면 새 블록이 추가될 때마다 가드를 빠뜨릴 수 있기 때문이다.
 *
 * 그런데 그 레인 안에는 화면 블록만 있는 게 아니라 `nextLaneFooter`
 * (EMR 요약·복사 · 재진 간단 문진 발급·메시징 · **진료 완료**)가 함께 들어
 * 있었고, 그래서 herbal 단독은 **그 방문 안에서 진료를 끝낼 수 없었다**
 * (PR #57 검수 1번). PO 지시로 「마무리」 단계를 herbal에도 준다.
 *
 * 그래서 계약이 "레인 전체가 한 가드 뒤"에서 **"단계 래퍼는 가드 없이,
 * 블록마다 자기 가드"**로 바뀌었다. 빠뜨리기 쉬운 형태가 된 것은 사실이라
 * 아래에서 블록 하나하나를 명시적으로 단언한다 -- 그게 원래 A-0이 막으려던
 * 것이다.
 * ------------------------------------------------------------------ */
check(
  'A-0 「마무리」 단계 래퍼에는 프로필 가드가 없다 (세 프로필 모두 2단계 구조)',
  /\{\/\*[\s\S]{0,2000}?\*\/\}\s*\n\s*<div className="doctor__visitStep" data-step="wrapup" hidden=\{visitStep !== 'wrapup'\}>\s*\n\s*<section className="doctor__visitLane doctor__visitLane--next"/.test(
    WORKSPACE,
  ) && !/\{activeProfile !== 'herbal' && \(\s*\n?\s*(\/\*|<div className="doctor__visitStep")/.test(WORKSPACE),
)

// A-1..A-5: PR-A가 herbal 단독에서 지운 블록 1개당 단언 1개. 단계 래퍼의
// 가드가 없어졌으므로 **각 블록이 자기 가드를 들고 있는지**가 유일한 방어선이다.
const nextLane = WORKSPACE.slice(
  WORKSPACE.indexOf('data-step="wrapup"'),
  WORKSPACE.indexOf('<LaneJumpNav'),
)
/*
 * "이 식별자가 마무리 단계 **밖에는** 없다"를 볼 때는 주석 뗀 사본을 쓴다.
 * `LaneJumpNav`의 JSDoc이 왜 조건이 필요한지 설명하며 `nextLaneFooter`를
 * 이름으로 언급하므로, 원본으로 보면 산문 때문에 실패한다 -- A-5를 고칠 때
 * 이미 한 번 겪은 바로 그 함정이다(T-6과 같은 부류).
 */
const afterNavCode = WORKSPACE_CODE.slice(WORKSPACE_CODE.indexOf('<LaneJumpNav'))
check(
  'A-pre 내비 이후 코드 구간을 실제로 잡았다 (아래 "밖에 없다" 단언이 공허하지 않도록)',
  afterNavCode.includes('LANE_JUMP_ITEMS') && afterNavCode.length > 500,
  `(${afterNavCode.length}자)`,
)
check(
  'A-1 HerbalWorkspaceNext(재평가 대상 칩 + 다음 방문 확인 메모 + 다음 액션 + 관리계획·다음 재평가 + 참고 자료)는 mixed에서만 렌더된다',
  /\{activeProfile === 'mixed' && \(\s*\n\s*<HerbalWorkspaceNext/.test(nextLane),
)
check(
  'A-2 HerbalWorkspaceNext 호출부가 마무리 단계 안에만 있다 (단계 밖 2차 렌더 경로 없음)',
  WORKSPACE.split('<HerbalWorkspaceNext').length - 1 === 1,
)
check(
  'A-3 CRM 복약 코스 슬롯(medicationCourseSlot)이 herbal 단독에서 여전히 빠진다 (자기 가드를 들고 있다)',
  /\{activeProfile !== 'herbal' && medicationCourseSlot\}/.test(nextLane) &&
    !/\{\s*(?:[^{}\n]*&&\s*)?medicationCourseSlot\s*\}/.test(afterNavCode),
)
check(
  'A-4 재진 발급·EMR·진료 완료 푸터(nextLaneFooter)는 **가드 없이** 마무리 단계 안에 있다 (PO 지시로 herbal에도 닿는다)',
  nextLane.includes('{nextLaneFooter}') &&
    !/activeProfile[^\n]*&& nextLaneFooter/.test(nextLane) &&
    /*
      "밖에 없다"는 **렌더 사이트** 기준이다. 내비의
      `showWrapup={… nextLaneFooter != null}`처럼 조건에서 *읽기만* 하는 것은
      2차 렌더 경로가 아니다 -- 이름만 세면 그 조건까지 위반으로 잡힌다
      (실제로 한 번 그렇게 걸렸다). JSX 렌더 표현식만 센다.
    */
    WORKSPACE_CODE.split(/\{\s*(?:[^{}\n]*&&\s*)?nextLaneFooter\s*\}/).length - 1 === 1 &&
    !/\{\s*(?:[^{}\n]*&&\s*)?nextLaneFooter\s*\}/.test(afterNavCode),
)
/*
 * A-5 (PR #58 검수 1번으로 한 번 고쳐졌다)
 *
 * 첫 판은 "마무리 버튼이 **조건 없이** 노출된다"였다 -- 틀렸다. herbal 단독
 * 마무리에 들어가는 것은 server 전용 `nextLaneFooter` 하나뿐이라, 조건을
 * 통째로 없애면 미리보기에서 헤딩만 남은 빈 화면으로 가는 죽은 버튼이 된다.
 *
 * 지금 계약: 조건은 있되 **프로필이 아니라 내용물의 유무**로 건다. 세 가지를
 * 함께 못 박는다 -- (1) 옛 프로필 기반 이름(`showNext`/`nextOnly`)은 돌아오지
 * 않았다, (2) 새 조건은 `wrapupHasContent`이고 그 정의가 푸터 유무를 본다,
 * (3) 필터는 `next-h2` 하나를 특별 취급하지 않고 `step === 'wrapup'` 전체를
 * 건다(앵커가 하나 더 생겨도 같은 규칙이 적용되도록).
 */
check(
  'A-5 마무리 점프 버튼의 조건은 프로필이 아니라 내용물의 유무다 (showNext/nextOnly는 돌아오지 않았다)',
  /\{ id: 'next-h2', label: '마무리', step: 'wrapup' \}/.test(WORKSPACE_CODE) &&
    // \b로 묶는다 -- 맨몸 /showNext/는 이 저장소에 실재하는 별개 prop
    // `showNextVisitCheckItem`(CarePlanCard)에도 걸린다. 지금은 DoctorWorkspace가
    // 그 prop을 안 쓰지만, 쓰는 순간 옳은 코드에서 헛실패한다(PR #58 3차 검수).
    !/\bshowNext\b/.test(WORKSPACE_CODE) &&
    !/\bnextOnly\b/.test(WORKSPACE_CODE),
)
check(
  'A-5b 그 조건은 `nextLaneFooter`의 유무를 본다 — 프로필만 보면 server 모드의 herbal에서 또 틀린다',
  /showWrapup=\{activeProfile !== 'herbal' \|\| nextLaneFooter != null\}/.test(WORKSPACE_CODE),
)
check(
  'A-5c 필터는 `step === \'wrapup\'` 항목 전체를 건다 (next-h2 하나를 특별 취급하지 않는다)',
  /it\.step !== 'wrapup' \|\| showWrapup/.test(WORKSPACE_CODE),
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
/*
  B-3 (2026-09-25 PO 지시로 뒤집혔다): `재평가 대상`의 편집 UI가 herbal 단독
  판단·처치 레인에 되살아났으므로, slim 텍스트에도 그 라벨이 **있어야** 한다.

  이전 판은 `followUpTargets`를 아예 넘기지 않는 fixture로 "라벨이 없다"를
  단언했는데, 그 fixture는 실제 `buildHerbalEmrTextForRecord(true)` 호출을 더
  이상 모사하지 않는다 -- 통과하지만 출하된 동작의 반대를 주장하는 단언이었다
  (PR #57 검수 지적). 실제 호출 모양(followUpTargets 포함)으로 다시 만든다.
*/
const slimAsShipped = buildHerbalWorkspaceEmrPreview({
  primaryConcern: '한약·보약 상담',
  clinicianObservations: observations,
  finalAssessment,
  // DoctorView.tsx가 slim에서도 이 키를 넘긴다(B-1a) -- carePlan/
  // nextReassessmentPlan은 여전히 안 넘긴다(B-1c).
  followUpTargets,
})
check('B-3 slim 텍스트에 "재평가 대상"이 값과 함께 나온다 (편집 UI가 되살아났다)',
  /재평가 대상: .*수면/.test(slimAsShipped))
check('B-3a 그래도 관리 계획·다음 상세 재평가는 slim에서 빠진다 (편집 UI가 없다)',
  !slimAsShipped.includes('관리 목표:') && !slimAsShipped.includes('다음 상세 재평가:'))
check('B-3b followUpTargets를 안 넘기면 라벨 자체가 없다 (함수의 optional 계약은 그대로)',
  !slim.includes('재평가 대상:'))
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
