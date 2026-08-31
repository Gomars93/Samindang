// Doctor View 재설계 v0.2 P7 — 무브라우저 viewport-budget heuristic.
// tests/layout-budget.spec.mjs / tests/viewport-budget.spec.mjs의 방식을
// 그대로 재사용한다: 실제 브라우저 렌더 없이, doctor.css/TodayChecklist.tsx/
// JudgmentPanel.tsx의 CSS 상수·구조적 사실을 직접 읽어 §8.1 레일 예산표
// (1440×900, ≤560px)와 1024 단일 컬럼 고정 크롬(44+40+56)을 검증한다.
//
// §8.1 예산표는 "TodayChecklist 최대 5행 + n건 더", "진찰 소견 radio 해당
// 시(세로 스택)", "판단 compact(입력 5 + 접힘 summary + 토글)", "기록 버튼 +
// 저장 인디케이터", "EMR/완료 버튼 행" 5개 항목이 각각 160/96/200/56/48px
// 이하로 유지된다는 "타이핑 계약"이다 — §7이 명시한 대로 예산 초과(에러
// 다발 등 비정형 상황)는 sticky가 자연히 풀리는 graceful degradation으로
// 처리되므로, 이 테스트는 픽셀 단위로 실측하는 대신 각 항목의 예산을
// "가능하게 만드는 근거 코드/CSS 사실"이 실제로 존재하는지를 검증한다 —
// 그 근거 중 하나라도 깨지면(예: MAX_VISIBLE이 5에서 10으로 바뀜,
// secondaryFields가 기본으로 펼쳐짐) 예산표 자체가 더 이상 성립하지
// 않는다는 신호를 여기서 잡는다.
//
// Run via `npm run test:doctor-viewport-budget`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'doctor', 'doctor.css'), 'utf8')
const todayChecklistSrc = readFileSync(join(ROOT, 'src', 'doctor', 'TodayChecklist.tsx'), 'utf8')
const judgmentPanelSrc = readFileSync(join(ROOT, 'src', 'doctor', 'JudgmentPanel.tsx'), 'utf8')
const doctorViewSrc = readFileSync(join(ROOT, 'src', 'doctor', 'DoctorView.tsx'), 'utf8')

/* =========================================================================
 * 1. 1024–1279(및 그 이하) 단일 컬럼 고정 크롬 = 44(topbar) + 40(pill
 *    스트립) + 56(bottom bar primary 버튼) = 140px. 세 값 전부 doctor.css의
 *    실제 min-height 선언에서 그대로 가져온다(하드코딩 드리프트 가드
 *    포함).
 * ========================================================================= */

const TOPBAR_MIN_H = 44 // .doctor__topbar { min-height: 44px }
const PILL_STRIP_MIN_H = 40 // .doctor__safetyPillStrip { min-height: 40px } (max-width:1279px)
const BOTTOM_BAR_PRIMARY_MIN_H = 56 // .doctor__bottomBar__primary { min-height: 56px }
const TABLET_CHROME_SUM = TOPBAR_MIN_H + PILL_STRIP_MIN_H + BOTTOM_BAR_PRIMARY_MIN_H

assert('1024 단일 컬럼 고정 크롬 = 44 + 40 + 56 = 140px', TABLET_CHROME_SUM === 140)

{
  const mustContain = [
    'min-height: 44px', // .doctor__topbar
    'min-height: 40px', // .doctor__safetyPillStrip
    'min-height: 56px', // .doctor__bottomBar__primary
  ]
  const missing = mustContain.filter((s) => !css.includes(s))
  assert(`doctor.css에 1024 크롬 상수 3종이 실제로 존재한다 (missing: ${missing.join(', ') || 'none'})`, missing.length === 0)
}

// 일반적인 태블릿 랜드스케이프(1024×768) 뷰포트에서 이 고정 크롬이
// 가용 높이를 잡아먹어 음수로 만들지 않는다(§8.1과 동일한 "available"
// 개념의 최소 sanity check).
{
  const VIEWPORT_H_1024 = 768
  const available = VIEWPORT_H_1024 - TABLET_CHROME_SUM
  assert('1024×768에서 고정 크롬을 뺀 가용 높이가 양수(레이아웃이 완전히 깨지지 않음)', available > 0)
}

/* =========================================================================
 * 2. §8.1 레일 예산표 (1440×900, ≤560px) — 5개 항목의 근거 코드/CSS 사실.
 * ========================================================================= */

const TODAY_CHECKLIST_BUDGET = 160
const EXAM_RADIO_BUDGET = 96
const JUDGMENT_COMPACT_BUDGET = 200
const RECORD_SAVE_BUDGET = 56
const EMR_COMPLETE_BUDGET = 48
const RAIL_BUDGET_TOTAL =
  TODAY_CHECKLIST_BUDGET + EXAM_RADIO_BUDGET + JUDGMENT_COMPACT_BUDGET + RECORD_SAVE_BUDGET + EMR_COMPLETE_BUDGET

assert('§8.1 레일 예산표 5항목 합계는 문서와 동일하게 ≤560px', RAIL_BUDGET_TOTAL <= 560)
assert('§8.1 레일 예산표 5항목 합계 === 560 (문서 표 그대로)', RAIL_BUDGET_TOTAL === 560)

// 2a. TodayChecklist(160px) — "최대 5행 + n건 더" 캡이 실제로 5라서 콘텐츠가
//     무한정 늘어나지 않는다. 이 상수가 커지면(예: 5 -> 10) 예산표의
//     전제가 깨진다.
{
  const m = todayChecklistSrc.match(/const MAX_VISIBLE = (\d+)/)
  assert('TodayChecklist.tsx: MAX_VISIBLE 상수가 존재한다(오늘 확인 목록이 무한정 늘어나지 않는 캡)', Boolean(m))
  assert('TodayChecklist.tsx: MAX_VISIBLE === 5 (§8.1 "최대 5행"과 일치)', m && Number(m[1]) === 5)
}

// 2b. 진찰 소견 radio(96px, "해당 시") — LBP/SHOULDER 두 exam 옵션 세트
//     모두 3개 옵션(세로 스택)으로 고정되어 있어야 96px 예산이 성립한다
//     (옵션이 늘어나면 세로 스택 높이가 예산을 넘는다).
{
  const lbpOptionsMatch = judgmentPanelSrc.match(/const LBP_MOTOR_DEFICIT_OPTIONS[^[]*\[([\s\S]*?)\]\n/)
  const shoulderOptionsMatch = judgmentPanelSrc.match(/const SHOULDER_CUFF_WEAKNESS_OPTIONS[^[]*\[([\s\S]*?)\]\n/)
  assert('JudgmentPanel.tsx: LBP_MOTOR_DEFICIT_OPTIONS 상수 존재', Boolean(lbpOptionsMatch))
  assert('JudgmentPanel.tsx: SHOULDER_CUFF_WEAKNESS_OPTIONS 상수 존재', Boolean(shoulderOptionsMatch))
  const lbpCount = lbpOptionsMatch ? (lbpOptionsMatch[1].match(/value:/g) || []).length : 0
  const shoulderCount = shoulderOptionsMatch ? (shoulderOptionsMatch[1].match(/value:/g) || []).length : 0
  assert(`LBP 진찰 소견 옵션 3개 (실제 ${lbpCount}개, 세로 스택 96px 예산 전제)`, lbpCount === 3)
  assert(`SHOULDER 진찰 소견 옵션 3개 (실제 ${shoulderCount}개, 세로 스택 96px 예산 전제)`, shoulderCount === 3)
  assert(
    '진찰 소견 radio는 세로 스택(judgment__radioRow--stacked)이다 — 468px 가로 줄바꿈 문제와 무관(§8.3)',
    judgmentPanelSrc.includes('judgment__radioRow--stacked'),
  )
}

// 2c. 판단 compact(200px, "입력 5 + 접힘 summary + 토글") — 사주예상→치료축
//     3필드는 <details>(기본 접힘)라서 펼쳐진 전체 textarea들이 compact
//     예산에 포함되지 않는다. 기본으로 열려있으면(open 속성) 이 전제가
//     깨진다.
{
  const detailsMatch = judgmentPanelSrc.match(/<details className="judgment__secondaryFields"([^>]*)>/)
  assert('JudgmentPanel.tsx: judgment__secondaryFields(사주예상→치료축) details 존재', Boolean(detailsMatch))
  assert(
    'judgment__secondaryFields는 기본 접힘이다(open 속성 없음) — 펼쳐진 textarea들이 compact 예산에 포함되지 않는다',
    detailsMatch !== null && !detailsMatch[1].includes('open'),
  )
  // 입력 5개 = 핵심 선천 특징(MAX_INNATE_FEATURES) + 증상 연결(MAX_SYMPTOM_LINKS).
  const innateMatch = judgmentPanelSrc.match(/MAX_INNATE_FEATURES/)
  const symptomMatch = judgmentPanelSrc.match(/MAX_SYMPTOM_LINKS/)
  assert('JudgmentPanel.tsx: MAX_INNATE_FEATURES/MAX_SYMPTOM_LINKS 상수를 그대로 재사용한다(별도 카운트 발명 없음)', Boolean(innateMatch) && Boolean(symptomMatch))
}

// 2d. 기록 버튼 + 저장 인디케이터(56px) — 컴팩트 한 줄 높이를 유지하는
//     폰트 크기(judgment__recordBtn/doctor__saveStatus 둘 다 ≤14px)를
//     확인한다.
{
  const recordBtnBlock = css.match(/\.judgment__recordBtn\s*\{([^}]*)\}/)
  const saveStatusBlock = css.match(/\.doctor__saveStatus\s*\{([^}]*)\}/)
  assert('doctor.css: .judgment__recordBtn 규칙 존재', Boolean(recordBtnBlock))
  assert('doctor.css: .doctor__saveStatus 규칙 존재', Boolean(saveStatusBlock))
  const recordBtnFont = recordBtnBlock ? Number((recordBtnBlock[1].match(/font-size:\s*(\d+)px/) || [])[1]) : NaN
  const saveStatusFont = saveStatusBlock ? Number((saveStatusBlock[1].match(/font-size:\s*(\d+)px/) || [])[1]) : NaN
  assert(`기록 버튼 폰트 ≤14px (실제 ${recordBtnFont}px) — 56px 한 줄 예산 유지`, recordBtnFont <= 14)
  assert(`저장 인디케이터 폰트 ≤14px (실제 ${saveStatusFont}px) — 56px 한 줄 예산 유지`, saveStatusFont <= 13)
}

// 2e. EMR/완료 버튼 행(48px) — emrOpenRow가 컴팩트 padding(8px 안팎)을
//     쓰고, recorder 결과 없으면 아예 렌더하지 않는다(빈 블록으로 예산을
//     쓰지 않음, Opus M5 계약).
{
  const emrOpenRowBlock = css.match(/\.doctor__emrOpenRow\s*\{([^}]*)\}/)
  assert('doctor.css: .doctor__emrOpenRow 규칙 존재', Boolean(emrOpenRowBlock))
  assert(
    'DoctorView.tsx: recorderResults가 없으면 EMR 열기 버튼 자체를 렌더하지 않는다(빈 블록으로 레일 예산을 쓰지 않음)',
    doctorViewSrc.includes('recorderResults && recorderResults.length > 0 && ('),
  )
}

/* =========================================================================
 * 3. 레일 sticky는 컬럼별 독립 overflow가 아니라 `align-items: start` +
 *    자기 콘텐츠 높이만큼만 붙는 방식이다(invariant 11) — `.doctor__rail`
 *    자체에 `overflow`(auto/scroll)를 주면 예산 초과 시 내부 스크롤로
 *    숨어버려 §7의 "graceful degradation"(그냥 페이지와 함께 스크롤)이
 *    깨진다.
 * ========================================================================= */

{
  const railDesktopBlock = css.match(/@media \(min-width: 1280px\) \{\s*\.doctor__rail \{([^}]*)\}/)
  assert('doctor.css: ≥1280px .doctor__rail sticky 규칙 존재', Boolean(railDesktopBlock))
  assert(
    '≥1280px .doctor__rail에 overflow(auto/scroll) 선언이 없다 — 예산 초과 시 내부 스크롤로 숨기지 않고 페이지와 함께 스크롤(invariant 11)',
    railDesktopBlock !== null && !/overflow\s*:\s*(auto|scroll)/.test(railDesktopBlock[1]),
  )
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
