# Core Reduction Phase 10 — Closing Delta 재심사 v0.2

> 심사관: Opus (worktree, `09dab91..18ffa73` fix delta). 독립 재검증:
> `npm ci` → `test:all` **2회 연속 green** · `build` green · FROZEN zero-diff ·
> 이전 심사의 실증 2건 재실행 · 실 Chromium 레이아웃 실측(커밋 테스트가 안 다룬
> 834 portrait 포함).
>
> ## 종합 판정: **PASS — BLOCKER 0 · MAJOR 0**

## 판정 표 (전건 RESOLVED)

- **B-1**: `tierOf()` needsAttention 우선 + UI 파티션 양쪽 수정(상호배타·전수 —
  카운트/위치 불일치 불가). `COMPLETED+needsAttention` 실제 조합으로 재현 →
  active 잔류·attention 우선 정렬 확인. 데이터 경로 일치 검증.
- **M-2**: `hasUnreadableSafetyField` 제3축 편입 — URGENT 분기 불참, `계산불가`
  에만. `medication_use`·`allergy_yn` 오염 재현 → 칩 `--unavailable`.
- **M-3**: ⑤블록 1줄 버튼(예산 내) + 폼은 레인1 상단 전개. 헤드리스 8/8 —
  input clientHeight 17px·좌측 aside 161.875px 불변·834 portrait hit-test 추가
  자체 검증 통과. `tokenReentryOpen`은 리셋 블록+성공 경로 양쪽 포함.
- **m4**: `resetKey` render-time 재시드(key-remount 아님), 5개 state 전부,
  radio 누수 행위 테스트 실재.
- **문서 3건**: DECISIONS(m3/m5/m10 deviation + m1/m2 limitation — m5 주장을
  소스로 재확인, 사실 일치) · HANDOFF 갱신 · Phase 9 #1 해결 표기.
  (m10 문단 축자 중복 1건은 오케스트레이터가 즉시 삭제 — N-5 해소.)

## fix가 새로 도입한 위험 — MINOR 5 (전부 non-blocking, 후속 배치)

- **N-1**: needsAttention tier 0 상주 — URGENT 정렬 충돌 없음(안정 정렬로 제출
  URGENT가 앞), 완료 개념 유지. 단 해제 수단이 없어 무기한 누적 + 신규 문진보다
  상위 노출. → 후속: acknowledge 개념 또는 revisit 날짜 스코프.
- **N-2**: 리셋 블록의 per-record state 전수 포함을 고정하는 테스트 부재
  (새 state 추가 시 사람이 기억해야 함).
- **N-3**: auth 폼이 CommonSafetyBanner 위 삽입(~100px 밀림) + `aria-expanded`/
  autoFocus 부재 — 레인1 비접힘 원칙 충돌은 없음, 실사용 차단 아님.
- **N-4**: ObjectiveExamFindingsCard in-flight save의 stale resolve (generation
  guard 부재) — 입력 소실 경로는 없음.
- **N-5**: DECISIONS m10 중복 — 해소됨(본 커밋).

## Completion Gate 최종 확인문 (Opus 원문)

> **Opus closing 재심사 결과: BLOCKER 0 · MAJOR 0.** BLOCKER-1/MAJOR-2/MAJOR-3/
> m4와 문서 3건은 `09dab91..18ffa73` delta에서 모두 해소됐음을 독립 재현과
> `npm ci`→`test:all` 2회 green·build green·FROZEN zero-diff로 확인했다.

## 메트릭 재판정

- **기록 필드 접근 불가 0: ✅ 충족으로 복귀** (유일한 도달 불가 경로였던
  needsAttention 은닉 제거, 실증 확인).
- 그 외 충족 지표 전부 유지 (fix delta가 좌측 요약 높이 불변 실측). auth 폼
  전개 중의 일시 상태는 예산 측정 대상 외임을 명시.

## 남은 known limitations (최종 보고 인용)

m1(treatment-only lock 🔒 미반영) · m2(Queue 배지↔레인1 판정 규칙 차이 —
M-2 축은 lane1에만 반영, Queue 배지 미전파) · m3(`visit:` 문자열 키 미실재,
동등 메커니즘) · m5(진료 화면 이중 sticky — §8.1 미이행) · m6~m10 ·
N-1~N-4 · workflow 절대 높이 +17%/+30%(문서화된 trade-off) · free-text +1
(설계상 허용) · HUMAN DECISION 6건.
