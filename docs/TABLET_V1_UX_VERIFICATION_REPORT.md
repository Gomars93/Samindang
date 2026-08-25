# Tablet Questionnaire v1 — UX Verification Report

작성일: 2026-08-25
Branch: `ux/tablet-v1-e2e-polish`
Base: `main` @ `4ef44a6efec90902644f536e637e4a3844636d1e` (post-HIP_V1 merge, PR #15)

## Scope

이 작업은 **임상 로직 추가가 아니라 실사용 태블릿 UX/UI 완성도 검수 및 보완**이다.
CLOSED/FROZEN clinical thresholds, safety tier semantics, routing predicates,
option values, payload 의미, `src/spec/*Logic.ts`/`*Adapter.ts`, `src/doctor/`
전체는 **한 줄도 수정하지 않았다** — §11 "FROZEN zero-diff 결과"에서 `git diff`
결과로 확인.

## Target device / viewports

11인치급 Android 태블릿, portrait 우선, touch 중심, 고령 환자 사용 가능을
기준으로 다음 4개 viewport를 검증했다 (`tests/viewport-budget.spec.mjs`):

| viewport | 방향 | 용도 |
|---|---|---|
| 800×1280 | portrait | 기준 reference (기존 `tests/layout-budget.spec.mjs`) |
| 834×1194 | portrait | |
| 1200×1920 | portrait (대형) | |
| 1280×800 | landscape | |

## Tested flows (코드 검토 + 기존/신규 자동 테스트로 재현)

- StartScreen → 기본 정보 → VISIT 라우팅 → symptom/pain 분기
- 각 pain module: LBP, NECK, SHOULDER, KNEE, ELBOW, WRIST_HAND, ANKLE_FOOT,
  HIP, TMJ (질문 visibility/staff interrupt/payload는 `tests/integration.spec.mjs`
  의 기존 모듈별 섹션들이 이미 exhaustively 커버 — 이 작업에서 재검증만 하고
  중복 작성하지 않았다, §9 참고)
- MENOPAUSE_SLEEP (기존 `tests/integration.spec.mjs` K섹션)
- StaffCheck 인터럽트 → 계속하기
- 완료 화면 (success / unconfigured / error / submitting)
- restart (직원 2초 길게 누르기)
- back navigation + branch prune
- idle timeout → 경고 모달 → 자동 restart
- server unconfigured / submit 실패 / retry
- 성공적 submit
- doctor `#doctor` hash route와 환자 flow의 격리

## UI issues found & changes made

### 1. 새 질문으로 넘어갈 때 스크롤 위치가 유지됨 (§7)

`ScreenShell`의 스크롤 컨테이너(`<main>`)는 질문이 바뀌어도 unmount되지
않는다 — 이전 질문에서 아래로 스크롤해 내려간 채로 다음/이전 질문으로 넘어가면
새 질문의 첫 줄(문항 텍스트)이 아니라 이전 스크롤 위치가 그대로 유지되어,
환자가 새 질문이 시작된 줄 모르고 화면 중간부터 보게 되는 문제였다.

**변경**: `ScreenShell`에 `questionId` prop을 추가하고, `questionId`가 바뀔
때만 본문을 맨 위로 스크롤하는 별도 `useEffect`를 추가했다. 기존
`hasMore`(스크롤 힌트) 계산용 effect(`[children]` 의존)와는 의도적으로
분리했다 — `children`은 같은 질문 안에서 옵션을 고를 때마다도 매번 새
객체(JSX 엘리먼트)로 바뀌므로, 이것을 스크롤 리셋 트리거로 쓰면 긴 목록을
스크롤해 내려간 상태에서 옵션을 누를 때마다 스크롤이 맨 위로 튀는 새 회귀가
생긴다. `App.tsx`는 `current.id`를 `questionId`로 넘긴다.

파일: `src/components/ScreenShell.tsx`, `src/App.tsx`

### 2. 처리되지 않은 렌더링 예외 시 흰 화면 (§12)

`src/main.tsx`부터 `App.tsx` 전체 트리까지 React error boundary가 전혀
없었다. `phase === 'done'` payload 조립은 이미 자체 try/catch로 보호되어
있지만, 그 외 모든 렌더링 단계(질문 화면, StaffCheck, 시작 화면 등)에서
처리되지 않은 예외가 나면 React가 트리 전체를 unmount해 흰 화면만 남고,
환자는 아무 안내도 받지 못하며 직원이 새로고침해야 했다(그 사이 응답도
잃는다).

**변경**: `src/components/PatientErrorBoundary.tsx` (신규) — class 기반
error boundary. 잡은 예외의 메시지/스택은 환자 화면에 절대 노출하지 않고
(콘솔에만 `componentDidCatch`로 기록), "문제가 발생했습니다. 태블릿을
직원에게 보여주세요." + "처음 화면으로" 버튼만 보여준다. `App.tsx`를
`AppContent`(기존 로직 전체, 이름만 바뀜)와 얇은 `App`(boundary + 리셋
`key`)으로 분리했다 — "처음 화면으로"를 누르면 `resetKey`를 바꿔
`AppContent`를 통째로 새 `key`로 remount한다. 무엇이 깨졌는지와 무관하게
모든 state(useState 초기값)가 확실히 새로 시작되는, 개별 setState 핸들러에
의존하지 않는 가장 안전한 복구 방법이다.

파일: `src/components/PatientErrorBoundary.tsx` (신규), `src/App.tsx`

### 3. MultiChoice max 도달 시 disabled 옵션에 명시적 스타일 없음 (§5, §14)

`SECONDARY_01`(동반문제 최대 2개)은 `max: 2`를 실제로 사용한다 — 최대
개수에 도달하면 나머지 미선택 옵션이 HTML `disabled`가 되지만, `styles.css`에
`.option:disabled` 규칙이 전혀 없어 브라우저 기본 스타일에만 의존했다. 왜
눌리지 않는지 시각적으로 분명하지 않을 수 있었다.

**변경**: `.option:disabled { opacity: 0.45; }` + 포인터 환경에서
`cursor: not-allowed` 추가.

파일: `src/styles.css`

### 4. 포커스 상태가 명확하지 않음 (§14 accessibility)

`.textField:focus` 외에는 버튼류(`option`/`primaryBtn`/`backBtn`/`helpBtn`)에
명시적 focus 스타일이 없었다. 터치가 기본 입력이라 평소엔 안 보여도 문제
없지만, 외장 키보드/스위치 접근성 도구, 접수처 데스크의 마우스 조작에는
포커스 표시가 필요하다(§14).

**변경**: `button:focus-visible, input:focus-visible,
[role='radio']:focus-visible, [role='checkbox']:focus-visible`에
`outline: 3px solid var(--primary)` 추가. `:focus-visible`은 터치 탭에서는
뜨지 않으므로 기존 터치 UX에는 영향 없다.

파일: `src/styles.css`

### 5. StaffCheck/에러 안내에 `role="alert"` 없음 (§9, §14)

`StaffCheckScreen`의 인터럽트 안내와 `PatientCompleteScreen`의 제출 실패
안내가 스크린리더에 즉시 announce되지 않았다(단순 `<p>`).

**변경**: 두 곳 모두 `role="alert"` 추가. `PatientErrorBoundary`의 안내도
동일하게 `role="alert"`로 작성했다. clinical copy 자체는 한 글자도 바꾸지
않았다.

파일: `src/screens/StaffCheckScreen.tsx`, `src/screens/PatientCompleteScreen.tsx`

## 검토했지만 변경하지 않은 항목 (이미 양호)

- **가독성(§4)**: 32/23/19px(문항/답변/헬퍼) 폰트, 680px 컨텐츠 max-width,
  1.35 line-height, 72px 최소 터치 타깃 — 이미 고령 환자를 고려한 값. 변경
  없음.
- **터치 UX(§5)**: 모든 interactive element가 72px(옵션/버튼)/56px(도움말)
  이상, `:active` 배경색 변화 + hover 전용 affordance 없음. 이미 양호.
- **긴 선택지(§6)**: `.option`에 `white-space`/`text-overflow` 제한 없음 —
  긴 문장도 자연스럽게 줄바꿈됨. `MultiChoice`의 NONE/UNKNOWN exclusive
  동작은 각 모듈의 malformed/exclusivity 테스트에서 이미 광범위하게 검증됨
  (`tests/*-malformed.spec.mjs`). clinical option label은 손대지 않음.
- **스크롤 구조(§7)**: `.shell`은 flex column, `<footer>`(CTA)는
  `<main>`(스크롤 컨테이너)의 형제 요소이지 자식이 아니다 — 즉 질문이
  아무리 길어도 CTA가 스크롤에 밀려 화면 밖으로 나가는 구조적 문제가 원천적으로
  없다. `100dvh` 기반 높이 계산이라 Android 가상 키보드가 열려도 레이아웃이
  깨지지 않는다(신규 `tests/viewport-budget.spec.mjs`가 이 구조를 회귀
  테스트로 고정).
- **Progress UX(§8)**: 단계형 progress bar(퍼센트 아님), "정확히 N개 남음"
  같은 부정확한 안내 없음. 완료 화면도 분 단위 약속을 하지 않음(기존
  `tests/patient-flow.spec.mjs`가 이미 검증).
- **StaffCheck 우회(§9)**: `StaffCheckScreen`은 버튼이 정확히 1개("확인했어요,
  계속하기")뿐이고 back 버튼을 렌더링하지 않는다. `App.tsx`도
  `phase === 'staff_check'`에는 `onBack`을 전혀 연결하지 않는다. 같은
  질문 id에 대한 재노출은 `staffNoticeShownFor` Set으로 이미 방지된다(불변,
  미변경). 신규 `tests/patient-ux.spec.mjs`가 "버튼 1개뿐, '이전' 텍스트
  없음"을 회귀 테스트로 고정.
- **Back navigation / privacy(§10, §11)**: stale branch prune
  (`pruneStaleResponses`)은 `tests/integration.spec.mjs`의 "H. Deep
  stale-cleanup sweep" 섹션이 이미 광범위하게 검증. 완료 화면 도달 후
  브라우저 back은 `history.pushState`+`popstate` 재푸시로 막혀 있다(불변).
  submit 성공/server 미구성/restart 시 `responses`/`meta`/`devPayload` wipe는
  기존 `tests/patient-flow.spec.mjs`(devMode=false에서 환자 이름/전화번호/원본
  payload 미노출 등)가 이미 검증. Doctor view(`#doctor`)는 App의 `responses`
  state를 전혀 참조하지 않고 자체 데이터 소스(fixtures/server)만 사용 —
  구조적으로 격리됨.
- **오류 상태(§12)**: server 미구성/네트워크 실패/제출 실패/재시도는 이미
  `tests/patient-flow.spec.mjs`가 검증. payload 계산 오류는 `phase==='done'`
  effect의 기존 try/catch가 처리(완료 화면 기존 에러 경로로 낙하). 이번
  작업에서 추가한 `PatientErrorBoundary`가 그 외 모든 렌더링 단계의 마지막
  안전망이 되었다(위 §2).
- **Keyboard/numeric input(§13)**: `TextInputField`는 이미 numeric 필드에
  `inputMode="numeric"`, `autoComplete="off"`/`autoCorrect="off"`/
  `autoCapitalize="off"`/`spellCheck={false}` 적용됨. `100dvh` 기반 레이아웃 +
  CTA가 스크롤 영역 밖(형제 요소)이라 키보드로 인한 CTA 가림/레이아웃 점프
  위험이 구조적으로 낮음.
- **Accessibility(§14)**: 모든 옵션이 semantic `<button role="radio"|"checkbox">`
  + `aria-checked`, 선택 상태는 색상뿐 아니라 체크마크 글리프(✓)로도 표시됨
  (색상 단독 아님). WCAG AA 대비 계산 결과(신규 `tests/patient-ux.spec.mjs`,
  아래 표) 본문 텍스트 조합은 전부 4.5:1 이상. `.primaryBtn:disabled`는 이미
  스타일 있음(§3에서 `.option:disabled`만 보완).

  | 조합 | 대비비 |
  |---|---|
  | `--text` on `--bg` | 15.62:1 |
  | `--text-muted` on `--bg` | 5.90:1 |
  | `--text` on `--surface` | 16.33:1 |
  | `--text-muted` on `--surface` | 6.17:1 |
  | `#fff` on `--primary` (primaryBtn) | 11.37:1 |

- **Portrait-first / responsive(§3, §15)**: `--content-max: 680px`가 4개
  viewport 전부(portrait 3종 + landscape)에서 실제로 상한으로 작동함을
  `tests/viewport-budget.spec.mjs`로 확인 — landscape에서도 양옆이 과도하게
  벌어지지 않는다(오히려 중앙 정렬된 좁은 컬럼이 유지된다).
- **Visual consistency(§16)**: Start/Question/StaffCheck/Complete/Help/Idle가
  이미 동일한 클래스(`.center`, `.modal`, `.notice`, `.primaryBtn`)와 색상
  토큰을 공유. 대규모 redesign 없음, 새 UI framework 도입 없음.

## Automated UI regression (신규)

기존 인프라(브라우저 없이 CSS 상수를 직접 읽어 계산하는 결정론적 heuristic,
`tests/layout-budget.spec.mjs`가 이미 확립한 패턴)를 그대로 따랐다. 이
환경에는 Playwright/Cypress가 프로젝트 의존성으로 설치되어 있지 않고, 이번
작업 범위(레이아웃 예산/접근성/에러 복구력 검증)에는 무거운 browser
automation 의존성 추가가 비용 대비 정당화되지 않는다고 판단해 새 dependency는
추가하지 않았다 — 기존 패턴(esbuild 번들 + `renderToString` DOM 검증,
`tests/patient-flow.spec.mjs`/`tests/doctor.spec.mjs`와 동일 스타일)으로
충분히 보강했다.

- **`tests/viewport-budget.spec.mjs`** (신규, `npm run test:viewport`, 16
  assertions): 4개 target viewport에서 컨텐츠 폭이 `--content-max`를 넘지
  않음, 사용 가능 높이가 양(+)이고 충분함, portrait 2종은 기존
  "fits-or-allowlisted" 계약 재적용, CTA footer가 구조적으로 스크롤 영역의
  형제(자식 아님)임을 CSS/JSX 양쪽에서 확인.
- **`tests/patient-ux.spec.mjs`** (신규, `npm run test:patient-ux`, 30
  assertions): `PatientErrorBoundary`의 정상/캐치 상태 렌더링과 에러
  메시지/스택 비노출(소스 레벨 가드 포함), `StaffCheckScreen`의 버튼 1개
  전용/back 부재/`role="alert"`, `MultiChoice` max 도달 시 disabled 스타일,
  `SingleChoice`의 체크마크+`aria-checked`(색상 단독 아님), `:focus-visible`
  스타일 존재, WCAG AA 대비 5개 조합.

**의도적으로 새로 작성하지 않은 항목**(이미 다른 파일이 exhaustively
커버) — 회귀 없음을 재실행으로만 확인:

- HEADACHE_CRANIAL/TMJ exclusion: `tests/integration.spec.mjs` Q섹션
- HIP+LBP coexistence: `tests/integration.spec.mjs` R섹션
- ANKLE_FOOT routing: `tests/integration.spec.mjs` (ANKLE_FOOT_V1 섹션)
- malformed protected input fail-safe: 모듈별 `tests/*-malformed.spec.mjs`
  (lbp/neck/shoulder/knee/elbow/wrist-hand/ankle-foot/tmj/hip 전부)

## Test commands / results

| 명령 | 결과 |
|---|---|
| `npx tsc -b --force` | clean |
| `npm run build` | 133 modules, clean |
| `npm run test:viewport` (신규) | 16 passed, 0 failed |
| `npm run test:patient-ux` (신규) | 30 passed, 0 failed |
| `npm run test:integration` | 732 passed, 0 failed (미변경) |
| `npm run test:layout` | 7 passed, 0 failed (미변경) |
| `npm run test:doctor` | 633 passed, 0 failed (미변경) |
| `npm run test:patient` | 46 passed, 0 failed (미변경) |
| `npm run test:all` | **전체 green, exit 0** |
| `python -m pytest "tablet core/tests" -q` | 80 passed |

## FROZEN zero-diff 결과

```
git diff --stat origin/main -- \
  src/spec/lbpLogic.ts src/spec/lbpAdapter.ts \
  src/spec/neckLogic.ts src/spec/neckAdapter.ts \
  src/spec/shoulderLogic.ts src/spec/shoulderAdapter.ts \
  src/spec/kneeLogic.ts src/spec/kneeAdapter.ts \
  src/spec/elbowLogic.ts src/spec/elbowAdapter.ts \
  src/spec/wristHandLogic.ts src/spec/wristHandAdapter.ts \
  src/spec/ankleFootLogic.ts src/spec/ankleFootAdapter.ts \
  src/spec/tmjLogic.ts src/spec/tmjAdapter.ts src/spec/tmjQuestions.ts \
  src/spec/hipLogic.ts src/spec/hipAdapter.ts src/spec/hipQuestions.ts \
  src/spec/coreSpec.ts \
  src/doctor/
```

→ **빈 출력** (완전 zero-diff). 이 작업이 실제로 건드린 파일은 다음뿐이다:

- `src/App.tsx`, `src/components/ScreenShell.tsx` (스크롤 리셋 + error
  boundary 배선)
- `src/components/PatientErrorBoundary.tsx` (신규)
- `src/screens/StaffCheckScreen.tsx`, `src/screens/PatientCompleteScreen.tsx`
  (`role="alert"` 추가만)
- `src/styles.css` (`.option:disabled`, `:focus-visible` 규칙 추가만)
- `tests/viewport-budget.spec.mjs`, `tests/patient-ux.spec.mjs` (신규)
- `package.json` (`test:viewport`/`test:patient-ux` 스크립트 추가,
  `test:all`에 배선)
- `.gitignore` (신규 테스트의 esbuild 번들 산출물)

질문 문구/option label은 단 한 글자도 수정하지 않았다.

## Known limitations (물리 기기에서만 확인 가능)

- 실제 11인치 Android 태블릿에서의 체감 글자 크기/여백
- 실제 환자/고령 환자의 usability observation (실사용 관찰)
- 브랜드/미적 선호 (색상 팔레트는 계산상 WCAG AA를 만족하지만, 최종 미감
  판단은 사람의 몫)
- 실제 Android WebView/Chrome의 가상 키보드 열림/닫힘 시 레이아웃 점프
  체감 (구조상 `100dvh` + CTA가 스크롤 영역 밖이라 이론상 안전하지만,
  기기별 browser chrome quirk는 실기기 확인 필요)
- 물리 키보드 연결 시의 focus 이동 체감

## Final status

**Tablet Questionnaire v1: UX VERIFIED / PHYSICAL DEVICE CHECK REMAINING**

코드/CSS/접근성/반응형 레이아웃/에러 복구력 관점에서 human-independent로
검증·보완 가능한 항목은 모두 완료했다. 위 "Known limitations"에 나열한
항목만 실제 11인치 물리 태블릿에서의 확인이 남아 있다.
