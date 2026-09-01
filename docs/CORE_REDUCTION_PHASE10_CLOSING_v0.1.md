# Core Reduction Phase 10 — Opus Implementation Closing Review v0.1

> 심사관: Opus (worktree, `5c1247a..aadf0a6` delta 45파일 전량 + 독립 재검증:
> npm ci→test:all 4,772 green·build green·Chromium 3뷰포트 재실측·직접 실증 2건).
> **판정: FAIL — BLOCKER 1 · MAJOR 2 · MINOR 11.** 세 건 모두 수정 범위 좁음 —
> 해소 시 조건부 PASS. 후속: fix 커밋 + delta 재심사 (v0.2).

## BLOCKER-1 — needs_attention이 항상 "완료" 아코디언에 은닉 (delta 회귀)

`server/store.js`: micro follow-up `response` 존재 = `needs_attention` 성립 조건
= status COMPLETED 조건. `todayQueue.ts` `tierOf()`가 `completed`를 URGENT보다
먼저 반환 → needsAttention 행은 **존재 가능한 모든 경우** `<details>` 접힘 +
"오늘 (N)" 카운트 제외. baseline은 flat 리스트로 항상 표시했음 — 통합 Queue가
가시성을 제거. 기존 테스트는 성립 불가능한 조합(기본 status+needsAttention)만
검증. **수정**: needsAttention 행을 tier 0(또는 URGENT 동급)으로 승격해 active
유지 + `COMPLETED+needsAttention` 조합 테스트 + DOM 위치(completed details 밖)
테스트.

## MAJOR-2 — 레인1 union이 공통 `hasUnreadableSafetyField` 축 누락 (fail-open 실증)

`commonSafetyBannerActive`는 `flagsUsable`/`requires_staff_check`만 보고,
전문(SafetyGlance)이 "안전정보 일부를 읽을 수 없습니다"를 렌더하는
`hasUnreadableSafetyField`(medication/allergy/reproductive 손상)는 union에 미편입
— `medication_use` 오염 실증: 전문은 경고, 좌측 칩은 🟢 CLEAR. **수정**: 함수
export → `lane1Summary`에 별도 축으로 편입(URGENT 아닌 `계산불가`로) + 유닛/통합
테스트 2건.

## MAJOR-3 — auth 인라인 복구 폼 20px 클리핑 (실사용 불가)

⑤저장 블록(`max-height:20px; overflow:hidden`)에 `DoctorTokenSetup` 배너
전체(≥100px)를 삽입 — 입력창·저장 버튼이 잘려 보이지도 눌리지도 않음. Phase 7
§3.2는 "1줄 인라인 액션"으로 규정. **수정**: 1줄 액션(`인증 만료 — 토큰 다시
입력`) + 클릭 시 예산 밖에서 폼 전개 + 헤드리스 hit-test 검증.

## MINOR 11건 요지

m1 🔒가 treatment-only lock 미반영 · m2 Queue 배지↔레인1 판정 규칙 차이 ·
m3 `visit:` 리셋 키 미실재(동등 결과, 미문서) · **m4 ObjectiveExamFindingsCard
local state가 격리 표·리셋 키 밖(안전 입력의 잠재 누수)** · m5 `.doctor__header`
sticky 중복(§8.1 미이행) · m6 #16 전수 스캔 축소 · m7 스테일 테스트명 ·
m8 judgment 하위 details 배지 없음 · m9 학습 케이스 위치 · m10 fixture 키 문언
차이 · m11 HANDOFF 2커밋 뒤짐.
처리: **m4는 fix 런에 포함(소규모·안전 관련)**, m3/m5/m10은 DECISIONS deviation
공개, m11 HANDOFF 갱신, 나머지는 known-limitation 기록.

## 심사 11항목: 적합 6 (capability/provenance/persistence/동시성/클릭·태블릿/
아키텍처[조건부]) · 부적합 3 (safety visibility·hidden data·error state — 위
3건에 기인) · 조건부 1 (격리 — m3/m4) · 메트릭 부분 충족.

## 메트릭 최종표 발췌 (fix 후 재판정 예정)

| 지표 | 판정 |
|---|---|
| major section 4 / 진입 조합 0 / 발급 0클릭 / 침묵 소실 0 / h-overflow 0 / 1.5x 예산(1.41/1.42/1.43) / 터치 타겟 | ✅ |
| 기록 필드 접근 불가 0 | ❌ → BLOCKER-1 해소로 복구 예정 |
| free-text +1 (`다음 방문 확인 메모` — B-2 철회의 결과) | ⚠️ 설계상 허용 |
| workflow 절대 높이 desktop +17%/portrait +30% (레인 헤딩 4 + §2.5 필드) | ❌ 문서화된 trade-off — 최종 보고에 명시 |
| visible concept 재계수 | 최종 보고에서 수행 |
