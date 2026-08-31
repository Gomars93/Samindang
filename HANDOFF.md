# Current Handoff

## Objective
Doctor View 전면 재설계(`docs/DOCTOR_VIEW_REDESIGN_v0.2.md` — 이 브랜치에
이번 세션에서 반입 완료, `main`에는 아직 없음)의 구현. 이번 세션은
**Opus 검수 지적사항(A1~A8) 전부 반영 + P5~P7 완성**을 수행했다. P1~P4는
이전 세션에서 이미 커밋되어 있었다.

Product Owner 지시(2026-08-31, 오케스트레이터 경유): "이미 받은 지시(Part A
A1~A8 + Part B P5~P7)까지만 안전하게 마무리하라. 그 외 새로운 UI polish·
구조 변경·추가 개선은 일절 시작하지 마라." — 이 지시에 따라 스코프를
정확히 A1~A8 + P5~P7로 고정했고, PR은 **생성하지 않았다**(아래 참고).

## Current State
- `main` tip: `b845a87`(PR #22 merge). 안정 상태, 이번 세션에서 건드리지
  않음.
- 작업 브랜치: `claude/feat-doctor-view-redesign` (origin에 push 완료).
- P1~P4(이전 세션): `ef6bf05`/`43a8a65`/`974dd04`/`9f75d56`.
- 이번 세션 커밋 6개(전부 push 완료, 시간순):
  1. `e565d5d` — **A2[BLOCKING]**: `DoctorView`를 `React.lazy`+`Suspense`로
     code-split, Pretendard를 static 3-weight에서 variable+동적 subset으로
     교체. 환자 엔트리 청크(`index-*.js`+`index-*.css`)가 2.34MB→약 396KB로
     축소, doctor 전용 청크(`DoctorView-*.js/css`)로 완전 분리됨(빌드
     산출물로 실측 확인).
  2. `14f09ea` — **A1[BLOCKING]/A3/A4/A5/A6/A8**: 서버 목록
     `deriveListOverview`에 treatment-축 2필드 + response_consistency/
     sleep_disorder 3갈래 반영. `deriveSafetyOverview`에 `'UNKNOWN'`
     fail-closed 상태 추가(안전 문진 미응답을 CLEAR로 오판하지 않음).
     `ClinicianJudgment.derived_safety_overview`(시스템 파생값) 신설 +
     서버 `combineListOverview`(단조 상향만). B3 게이트 회귀
     fixture/테스트 포팅. overview 테스트 커버리지(6모듈 URGENT +
     bumpToReview 2건 + sleep_disorder 2건 + 서버 9모듈 필드명 루프).
     URGENT/REVIEW 아이콘 분리(⛔/⚠) 등 A8 minor 일괄.
  3. `d2b98be` — **A7(a)**: 스펙 문서(v0.1/v0.2/Opus UX Review) 반입.
  4. `1c63f5c` — **A7(b)**: DECISIONS.md에 안전 상태 selector 계약 기록.
  5. `e8a5cb3` — **P5**: 명리 compact+3열 감사 뷰 통합("▸ 상세 감사 뷰"
     펼치기, 방어 문구 보존), 전신·한약 참고를 Level 4 "참고" 그룹으로
     이동.
  6. `4d5823e` — **P6+P7**: 1024–1279(및 그 이하) sticky 안전 pill
     스트립 + bottom sheet 판단 입력(48px 터치 타겟) + 스켈레톤(스피너
     금지) + 서버 오류 amber 스트립("다시 시도"+"예시 데이터로 보기") +
     `tests/doctor-viewport-budget.spec.mjs` 신설.
- **FROZEN(`src/spec/*Logic.ts`, `*Adapter.ts`) 이번 세션 커밋 6개 전부
  zero-diff** (`git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'` 매 커밋 전 확인, 비어있음).
- `npx tsc -b --force` / `npm run build` / `npm run test:all` 전부 green —
  매 커밋 전 확인. 테스트 총량 829(P4 종료 시점) → **1040**
  (`tests/doctor.spec.mjs`) + `tests/doctor-viewport-budget.spec.mjs` 신설
  23건 + `tests/server.spec.mjs` 179→195 + `tests/preview-build.spec.mjs`
  27→32.
- **PR을 만들지 않았다** — Product Owner 지시로 이번 세션 스코프에서
  명시적으로 제외됨("PR 생성 금지"). 다음 세션(또는 사용자)이 PR을
  만들 때는 아래 "Remaining" 참고.

## Completed (이번 세션 — A1~A8 + P5~P7 전부)
- **A1[BLOCKING]** `server/store.js`: SAFETY_MODULE_STATUS_FIELDS에
  treatment_safety_status(LBP)/neck_treatment_safety_status(NECK) 추가 +
  response_consistency_review/sleep_disorder_review/
  sleep_disorder_priority_review 3갈래 REVIEW 반영. 클라이언트 selector
  REVIEW 4갈래 ↔ 서버 필드 대응표를 주석으로 고정.
- **A2[BLOCKING]** Pretendard 2.34MB 유입: `React.lazy`+`Suspense` +
  variable font 동적 subset. `tests/preview-build.spec.mjs`에 환자
  엔트리 Pretendard/@font-face/woff2 부재 회귀 가드 신설.
- **A3[MAJOR]** 안전 문진 미응답 fail-open: `SafetyOverview`에
  `'UNKNOWN'` 추가, 헤더에 중립 회색 "안전정보 없음" pill.
- **A4[MAJOR]** 원장 진찰 입력 목록 미반영: `derived_safety_overview`
  신설 + 서버 `combineListOverview`(단조 상향만, 하향 금지).
- **A5[MAJOR]** B3 게이트 회귀 테스트: `claude/fix-lbp-safety-panel-gate`
  fixture/테스트를 포팅(구조적으로는 P2에서 이미 해소됐음을 고정).
- **A6[MAJOR]** overview 테스트 커버리지: 6모듈 URGENT + bumpToReview +
  sleep_disorder + 서버 9모듈 필드명 루프.
- **A7[MAJOR]** 스펙 문서 반입 + DECISIONS.md 기록.
- **A8[MINOR 일괄]** 아이콘 분리(⛔/⚠), 목록 배지 아이콘, 완료 그룹 배지
  유지, 구 텍스트 제거, cursor 정리, CLEAR ▸ 단서, standalone wrapper
  주석.
- **P5** 참고 접기: 명리 compact+감사 뷰 통합, 전신·한약 참고 이동.
- **P6** 반응형: sticky pill 스트립, bottom sheet, 48px 터치 타겟.
- **P7** 상태·마감: 스켈레톤, 서버 오류 amber+복구 액션, viewport-budget
  테스트.

## In Progress
- 없음 — A1~A8 + P5~P7 전부 완료.

## Remaining / Next Recommended Action
1. **최종 Opus 재검수** — 이번 세션 반영분(특히 A1~A8) 전체를 다시
   검수받는다. 이번 세션 자체는 Opus 지적사항을 스스로 판단해 반영한
   것이므로, 별도 독립 검수가 한 번 더 필요하다.
2. **PR 생성** — Opus 재검수 통과 후, 이 브랜치로 `main` 대상 PR을
   생성하고 ChatGPT 독립 리뷰에 올린다. 이번 세션은 Product Owner
   지시로 PR을 만들지 않았다.
3. 사용자 승인 대기 열린 결정 2건은 여전히 미결(이번 세션에서도
   구현하지 않음, 임의 구현 금지 유지):
   ① v0.2 §11.8 `in_consultation` 자동 전이 여부
   ② §13-8 차트번호 필드 신설 시점(Sigma 연동)
4. Known deviation(아래 "Deviations" 참고)은 PR 설명에 명시적으로
   포함해 리뷰어가 판단할 수 있게 할 것.

## Deviations (스펙과 다른 판단, 보고 대상)
- **폰트 preload 생략**: A2에서 static 3-weight 대신 variable+동적
  subset(92개 유니코드 range 조각)을 채택했다 — 개별 `<link rel=preload>`
  를 92개 나열하는 것은 비실용적이라 생략했다. `font-display: swap`으로
  로드 실패/지연이 레이아웃을 깨지 않는 것으로 대체 완화.
- **1024 sticky pill 스트립 top 오프셋 근사치**: `.doctor__topbar`가
  실제로는 가변 높이(내용에 따라 줄바꿈)인데, pill 스트립의 sticky
  `top` 값은 1024–1279 구간 44px / <1024 구간 76px 두 가지 고정값으로
  근사했다(정확한 동적 계측은 ResizeObserver 등 JS 측정이 필요해 이번
  스코프에서는 보류) — 매우 좁은 화면에서 topbar가 예상보다 더 길게
  줄바꿈되면 pill 스트립과 살짝 겹칠 수 있다. 실제 브라우저 확인 필요.
- **P6 EMR/진료 완료 버튼 sheet 내 중복 배치 안 함**: "진료 완료"는
  이미 상단바(sticky)에 상시 노출되어 있어 bottom sheet 안에 별도로
  중복 배치하지 않았다 — 접근성은 이미 확보된 상태로 판단.
- **doctor-viewport-budget.spec.mjs는 픽셀 실측이 아니라 "예산을
  가능하게 만드는 전제" 검증**: §7이 예산 초과를 graceful degradation
  (sticky가 자연히 풀림)으로 명시적으로 허용하므로, 실제 브라우저
  렌더 없이 관련 상수(MAX_VISIBLE=5, 진찰 소견 옵션 3개, secondaryFields
  기본 접힘 등)가 유지되는지만 확인한다. 실제 브라우저 측정은 하지
  않았다.

## Blockers
- 없음.

## Relevant Files (이번 세션 변경/신규)
- `server/store.js` — `deriveListOverview`(A1 필드 확장) +
  `combineListOverview`(A4, 단조 상향).
- `src/App.tsx` — `DoctorView` lazy import(A2).
- `src/doctor/doctor.css` — Pretendard variable(A2), UNKNOWN pill(A3),
  아이콘/배지 CSS(A8), 명리 감사 뷰 fold(P5), sticky pill 스트립·bottom
  sheet·48px 터치 타겟(P6), 스켈레톤·amber 배너(P7).
- `src/doctor/safetyOverview.ts` — `'UNKNOWN'` 상태(A3).
- `src/doctor/judgment.ts` — `derived_safety_overview` 필드(A4).
- `src/doctor/DoctorView.tsx` — onSave adapter(A4), 아이콘 통일(A8),
  명리/전신한약 재배치(P5), pill 스트립·bottom sheet·판단 입력
  버튼(P6), `ListSkeleton`/`DetailSkeleton`/amber 배너(P7).
- `src/doctor/SafetyModuleRowView.tsx` — `STATUS_ICON` export, ▸
  단서(A8).
- `src/doctor/fixtures.ts` — B3 회귀 fixture(A5) + 6모듈 URGENT
  fixture + bumpToReview NECK fixture + UNKNOWN fixture(A6/A3).
- `src/doctor/{Hip,Tmj,AnkleFoot}SafetyPanel.tsx` — standalone wrapper
  주석(A8).
- `tests/doctor.spec.mjs`, `tests/server.spec.mjs`,
  `tests/preview-build.spec.mjs` — A/P5/P6/P7 전체 신규 어서션.
- `tests/doctor-viewport-budget.spec.mjs` — 신규(P7).
- `docs/DOCTOR_VIEW_REDESIGN_v0.2.md`,
  `docs/DOCTOR_VIEW_REDESIGN_Opus_UX_Review_v0.1.md`,
  `docs/DOCTOR_VIEW_REDESIGN_v0.1.md` — 반입(A7).
- `DECISIONS.md` — 안전 상태 selector/서버 목록 계약 항목 추가(A7).

## Tests / Verification
- 이번 세션 커밋 6개 각각에서: `npx tsc -b --force`(0 에러),
  `npm run build`(성공), `npm run test:all`(전체 green),
  `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
  (empty).
- 최종 상태: `tests/doctor.spec.mjs` 1040 / `tests/server.spec.mjs` 195 /
  `tests/preview-build.spec.mjs` 32 / `tests/doctor-viewport-budget.spec.mjs`
  23(신규) — 그 외 전 모듈(lbp/neck/shoulder/knee/elbow/wrist-hand/
  ankle-foot/tmj/hip 등) 전부 기존 그대로 green.
- 환자 엔트리 CSS/JS에 Pretendard @font-face/woff2 참조 0건을 실제
  `npm run build` 산출물로 검증(`tests/preview-build.spec.mjs`).

## Current Branch
`claude/feat-doctor-view-redesign` (origin에 push됨, PR 없음 — Product
Owner 지시).

## Last Commit
`4d5823e` — "feat(doctor): P6 반응형(bottom sheet) + P7 상태·마감 + viewport budget test"

## Known Risks
- 위 "Deviations" 참고(pill 스트립 top 오프셋 근사치, 폰트 preload
  생략).
- `tests/doctor-viewport-budget.spec.mjs`는 실제 브라우저 렌더가
  아니라 소스/CSS 상수 기반 heuristic이다 — 실제 뷰포트에서 레일이
  진짜로 560px 안에 들어가는지는 이 세션에서 브라우저로 측정하지
  않았다.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.
