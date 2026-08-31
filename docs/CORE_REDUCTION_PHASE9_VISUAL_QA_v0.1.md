# Core Reduction Phase 9 — UI Skill Visual QA (실제 렌더링) v0.1

> 수행: Sonnet + impeccable polish/audit 렌즈. 대상: `986e8f6`.
> 방법: **mockup이 아닌 실제 Chromium 렌더링** (playwright-core +
> /opt/pw-browsers/chromium). doctor preview 빌드 + 실 로컬 서버 seed
> (RevisitWorkspace/Queue 검증). QA 후 임시 설치·데이터 전부 원복 —
> 저장소 코드 변경 0, working tree clean 유지.

## 결과: 3 뷰포트 × 7 시나리오 = 21 조합 전부 PASS · 수정 커밋 없음

시나리오: Queue(제출+미해소 재진) / 진료 CLEAR / 진료 URGENT 최악(배너+2부위
비접힘) / herbal 파생(fail-open 감시) / RevisitWorkspace(실 서버) / 참고 8그룹 /
설정. 콘솔 에러 0건.

## 실측 수치

| 항목 | 실측 | 기준 |
|---|---|---|
| horizontal overflow | 0 (21조합 + 참고 펼침 상태) | 0 |
| 좌측 요약 높이 (URGENT 최악) | 1440/1024: **146px**, 834: **43px** | ≤200 / ≤96 |
| 좌측 요약 자체 스크롤 | 없음 | 0 |
| Queue 행→진료 / 판단 포커스 / 4상태 탭 / 다른 유형 토글 | 각 **1클릭** | 증가 0 |
| 발급 기본 채널 | 기록 연 직후 추가 클릭 **0** | 0 유지 |
| 터치 타겟 (`.doctor__visitShell`) | 1024: 44px×9종, 834: 48px×9종 정확 | 44/48 |
| 1024 판단 3필드 폭 (검수 포인트, 실측만) | 각 215px (1440: 293 / 834: 766) | — |

## 보고-only 발견 4건

1. **[스펙 미이행 → 후속 수정 대상]** Queue/레인1 배지 글리프가 원-원-원(🔴🟡🟢)
   으로 **색-단독 구분** — Phase 7 §6.1/6.2는 확인 필요=▲(형태 구분) 명시.
   P1부터 존재, Phase 9 규칙("regression만 수정")상 보고만 → 후속 fix 커밋으로
   처리 (오케스트레이터 지시).
2. Today Queue의 시그마 연결 버튼 834에서 36px — §8.2 규칙 범위(`.doctor__
   visitShell` 한정) 밖이므로 위반 아님, 실측 기록만.
3. RevisitWorkspace는 V3 셸 미적용(1열) — 명시된 범위 제외, 의도된 상태.
4. §2.10-#4(반대편 유형 자동 펼침) 육안 재현 불가 — pain-derived + herbal 실값
   fixture 부재로 인한 QA 커버리지 공백 (유닛 테스트는 커버 중). 후속 fixture
   추가 권장.

## 스크린샷
scratchpad `shots/`에 대표 10장 (URGENT 3뷰포트, CLEAR, herbal 2, revisit 2,
reference 2, queue 2, 4상태 글리프). 세션 종료 시 소멸되는 임시 산출물 —
필요 시 QA 스크립트(`qa.mjs`, `seed-and-serve.mjs`)로 재생성 가능.
