# Core Reduction Phase 6 — Opus Architecture Gate 심사 v0.1

> 심사관: Opus (독립 서브에이전트, worktree, 문서 5종 + 코드 스팟 체크)
> 대상: Phase 5 Synthesis v1.0 (`86c5653`) + Phase 4 UI Concept v0.1
> **판정: FAIL — BLOCKER 4 · MAJOR 7 · MINOR 3. 구현 진입 금지.**
> 반영: Phase 5 v1.1 (동일 파일, changelog 참조) + Phase 4 §8 addendum → delta 재심사.

## BLOCKER

- **B-1 Queue 배지가 UNKNOWN을 CLEAR로 표기** — Phase 4 목업이 재진/CRM 행에
  `🟢 CLEAR` + "문진 없음—안전 계산 없음"을 병기 (두 줄이 서로 부정).
  `listRevisitQueue()`는 safety_flags 자체가 없음. 또한 `needs_attention`(신규
  증상·이상반응 환자 보고, 현행 "추가 확인 필요" 표시)의 행방이 설계에 없음.
  → 배지 4값 `{URGENT, 확인필요, CLEAR, 안전 계산 없음}` + needs_attention 행 수준
  필수 마커.
- **B-2 nextVisitCheckItem UI 창구 제거 — 파급 4곳 미분석, "정보 손실 0" 거짓** —
  (a) `getPatientHistory` 투영에 carePlan 부재 → Reference 열람 불가 (b)
  `applyTreatmentPlanCarryForward()`가 오늘 timestamp로 이 필드에 **쓰고** EMR·환자
  전달문으로 나감 (c) blank 판정 3함수 (d) NextActionCard "다음에 확인할 것" 줄의
  데이터 소스 그 자체. → 정리 불가 시 HUMAN DECISION 승격+범위 제외.
- **B-3 프로필 세그먼트 제거 시 herbal 입력 도달 불가** — pain 파생 환자는
  herbalNode 미마운트, 유일 경로가 수동 override인데 그걸 제거. 렌더 안 하면 "기록
  필드 접근 불가 0" 위반, 항상 렌더하면 "free-text 증가 0" 위반. → 3택 명문화.
- **B-4 V3 좌측 고정 열 세로 예산 미검증** — NECK 권장 검사 15개+, 부위 2개 동시,
  URGENT 접힘 금지 조합이 1024×768 좌측 1/4 열에 물리적으로 안 들어감. 좌측 열을
  스크롤시키면 V3 채택 근거("재확인 비용 0")가 붕괴. → 좌측=고정 높이 요약 /
  전문=우측 최상단 비접힘으로 재규정 + 최악 케이스 치수 산정 + 지표 추가.

## MAJOR

- **M-5** 레인1 요약이 per-region 계산불가(패널별 발화 조건이 공통 배너와 다름)를
  흡수하는 규칙 부재 → 상태 집합 `{URGENT, 확인필요, 계산불가, CLEAR, 해당없음}`,
  계산불가 1개라도 있으면 CLEAR 금지+부위명 병기.
- **M-6** 금지선 5-4(숨김=자동 펼침 짝)가 Phase 5에 0회 등장 → 절대 규칙 명문화 +
  HIDE/RM-UI 각 행에 `open={…}` 조건식. 발급 disclosure는 활성 세션/미소비 토큰 시
  자동 펼침.
- **M-7** 발급이 현행 0클릭(상시 섹션)→disclosure로 +1~2 — "클릭 증가 0" 지표와
  충돌. Phase 4에 행동별 클릭 내역 표 자체가 없음 → 표 신설 + 발급 상시 노출 복원
  또는 증가 명시 인정.
- **M-8** Queue 신선도 "유지 또는 통일"은 결정이 아님 — CRM은 실패 시 비움,
  submissions는 stale 유지 (양립 불가) → 한 가지 확정 + 실패 시 명시적 안내 행.
- **M-9** Phase 3 §5-7 격리 장치 9종의 행방이 게이트 시점 미답변 (P2로 이연 =
  게이트 조건을 게이트 뒤로 밀어냄). 통합 셸 리셋 키 미정의, ErrorBoundary key가
  visit 미포함 → 9종 × (그대로/이동/대체) 표 + 리셋 키 `submission:<id> |
  visit:<visit_id>` 명문화.
- **M-10** 진료 중 토큰 401 복구 경로 부재 (현행도 "저장 실패"로만 표시) → 저장
  실패 kind==='auth' 구분 + 좌측 열에서 토큰 재입력, P0/P1에 추가.
- **M-11** Opus 필수 concept ⑥(이전 추적 항목: 라벨+기준값 raw)이 참고로 강등 —
  충돌인데 미선언 → 레인2 최상단 고정 1줄 배치 또는 충돌 해소 3으로 명시 선언.

## MINOR

- **M-12** 재진 화면 투약 코스 접근 신설 = "기능 추가 없음" 전제의 예외인데 미분류
  → HUMAN DECISION + patient_id key 리마운트 규약 준수.
- **M-13** row 14 Reason 공란, row 81(학습 케이스) 배치 모호.
- **M-14** workstation 미설정 배너 조건에 "미설정+current-visit 존재" 추가.

## 체크리스트 판정 요약
1 safety 은닉 FAIL(B-4/M-5) · 2 UNKNOWN FAIL(B-1) · 3 provenance 조건부 PASS ·
4 발견 불가 FAIL(M-6/B-2) · 5 longitudinal 조건부 FAIL(M-11) · 6 follow-up PASS ·
7 cross-patient FAIL(M-9) · 8 identity PASS · 9 운영 접근 FAIL(M-10) ·
10 클릭 FAIL(M-7) · 11 cognition FAIL(B-3)

## 검증 완료 (문제없음 10건)
충돌 해소 2건의 Phase 3 일치 · P0 7건 1:1 일치('completed' 계약 실증 포함) ·
P0-4 범위 제한의 적절성 · 레인1 배너 지위 · profile fail-open 진단 정확성 ·
시그마 2단계 유지 · capability 보존(채널/재발급/무효화/토큰/409/전화 비저장) ·
carry-forward 4대 규칙 반영 · DELETE 0/FROZEN 0/스키마 무변경 일관성 ·
Queue 4조건 대응(②미결·③배지 오류 제외).

## 재심사 조건
B1~4 문서 본문 해소 + M6/7/9 문서 수정 필수 + M8/10/11 확정 또는 승격 →
Phase 6 delta 재신청. M12~14는 재심사 시 함께.
