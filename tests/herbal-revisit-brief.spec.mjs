/*
 * 한약 재진 Figma 브리프 계약 — 2026-10-05. 문서만 바뀐 변경이라 "브리프가 코드와 어긋나지 않았는가"만 고정한다.
 * 구현 전 단계의 브리프가 실제 화면의 칸을 빠뜨리면 승인된 프레임이 구현 때 조용히 칸을 지우게 된다(CLAUDE.md 네 번의 사고).
 * `npm run test:herbal-revisit-brief` (test:all에 포함).
 */
import { readFileSync } from 'node:fs'

let passed = 0
const check = (name, cond) => {
  if (!cond) { console.error('FAIL', name); process.exit(1) }
  passed++
}
const brief = readFileSync('docs/HERBAL_REVISIT_DOCTOR_VIEW_FIGMA_BRIEF_v0.1.md', 'utf8')
const src = readFileSync('src/doctor/workspace/RevisitWorkspace.tsx', 'utf8')
const quick = readFileSync('src/doctor/workspace/revisitQuickCheck.ts', 'utf8')

// 1. RevisitWorkspace가 렌더하는 사용자 보이는 칸이 모두 브리프 표에 한 번 이상 나온다
const mustAppear = [
  '오늘 환자 입력', '이전 방문 참고', '이전 판단 유지', '이전 처치·관리계획 유지', '기존 Follow-up Target 유지',
  '치료 계획 (Care Plan)', '오늘 재검(Structured Reassessment)', '다음 재평가 계획 변경',
  'ClinicalLoopStatusBar', 'detailCheckDue', '이전 가설 이어받기',
]
for (const k of mustAppear) {
  const inSrc = k === 'ClinicalLoopStatusBar' || k === 'detailCheckDue' ? src.includes(k) : src.includes(k)
  check(`소스에 존재: ${k}`, inSrc)
  check(`브리프에 언급: ${k}`, brief.includes(k))
}

// 2. 간단 체크 5그룹 제목이 코드와 브리프에서 일치(운동 그룹은 숨김 제안으로 명시)
for (const t of ['목표 기능 변화', '전체 증상 반응', '새 신경증상·위험신호', '운동 실제 시행·난이도', '치료 후 이상반응']) {
  check(`코드 그룹 제목: ${t}`, quick.includes(t))
  check(`브리프 그룹 제목: ${t}`, brief.includes(t))
}

// 3. 통증 어휘 불일치(핵심 발견)가 문서에 남아 있다
check('통증 카드 재사용 사실 기록', src.includes('PainFinalAssessmentCard') && brief.includes('PainFinalAssessmentCard'))
check('열린 결정 D1~D4', ['D1', 'D2', 'D3', 'D4'].every((d) => brief.includes(`**${d} ·`)))
check('Figma 노드 46:2 기록', brief.includes('46:2'))
check('통증 재진 무변경 규칙', brief.includes('통증 재진 무변경'))

console.log(`herbal-revisit-brief: ${passed} assertions passed`)
