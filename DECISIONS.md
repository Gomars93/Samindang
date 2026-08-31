# Decisions Log

architecture, data model, API contract, 호환성 등 향후 개발자가 반드시 알아야
할 판단만 기록한다. 사소한 구현 선택은 기록하지 않는다.

## 2026-08-25 — GitHub 저장소 기본 브랜치를 main으로 정정

### Context
저장소(`Gomars93/Samindang`)의 GitHub 기본 브랜치(default branch)가 `main`이
아니라 오래된 브랜치 `claude/im-not-ai-skill-install-a4ryil`로 설정되어 있었다.
이 브랜치는 `main`보다 51 커밋 뒤처져 있었다. 이 상태에서는 새로 저장소를
열거나 PR을 만들 때 낡은 브랜치가 기준이 되어, 이번에 도입하는 "main =
Single Source of Truth" 협업 원칙과 정면으로 충돌한다.

### Decision
GitHub 저장소 설정(Settings → General → Default branch)에서 기본 브랜치를
`main`으로 변경했다. (Claude는 저장소 설정 변경 권한이 없어 사용자가 직접
GitHub UI에서 수행함.)

### Reason
이후 모든 협업 규칙(`CLAUDE.md`)이 "PR은 기본적으로 main을 대상으로 한다"는
전제를 깔고 있으므로, GitHub 자체의 기본 브랜치도 반드시 일치해야 실수를
방지할 수 있다.

### Alternatives Considered
- 그대로 두고 PR 생성 시마다 대상 브랜치를 수동으로 `main`으로 지정 — 매번
  실수 가능성이 남아 기각.

### Consequences
- (+) 신규 clone/PR/browse 시 항상 `main`이 기준이 됨.
- (+) ChatGPT 등 외부 리뷰어가 저장소를 열었을 때도 올바른 브랜치를 보게 됨.
- (−) 기존에 이 낡은 default branch를 참조하고 있던 로컬 스크립트/북마크가
  있다면 갱신 필요 (현재까지 발견된 것은 없음).

## 2026-08-25 — Opus/Sonnet/ChatGPT 멀티에이전트 협업 체계 도입

### Context
지금까지 이 저장소는 로컬 `.claude/queue/` 자동실행 시스템만으로 개발되어
왔고, "누가 무엇을 설계/구현/검수하는가"에 대한 명시적 역할 구분이나, GitHub를
통한 독립 2차 검수(ChatGPT) 체계가 없었다.

### Decision
`CLAUDE.md`에 사용자(Product Owner) / Opus(설계·검수) / Sonnet(구현) /
Fable(고난도 escalation) / ChatGPT(독립 2차 리뷰) 역할 구분과, main 보호 +
PR 기반 Git workflow를 프로젝트 운영 규칙으로 명문화했다. 기존 `.claude/queue/`
자동실행 시스템은 폐기하지 않고, 이 상위 협업 원칙 아래에서 계속 사용한다
(`CLAUDE.md`의 "기존 로컬 자동화 시스템" 절 참고).

### Reason
저장소가 커지고 임상 안전성이 걸린 로직(LBP/NECK)이 늘어나면서, Claude 내부
검수만으로는 부족하고 독립적인 2차 검수(ChatGPT)와 명확한 escalation 경로가
필요하다고 판단.

### Alternatives Considered
- 기존 `.claude/queue/` 시스템을 이번 체계로 완전히 대체 — 이미 검증되어 잘
  동작 중인 무인 실행 메커니즘을 폐기할 이유가 없어 기각. 대신 두 체계가
  공존하도록 역할을 분리했다 (큐 = 실행 메커니즘, 이 문서 = 협업/검수 원칙).

### Consequences
- (+) 역할과 검수 기준이 문서로 명확해져 여러 에이전트가 같은 프로젝트를
  다뤄도 일관성 유지 가능.
- (+) ChatGPT가 GitHub 상태만 보고도 독립적으로 검수 가능한 구조 확보.
- (−) 협업 규칙과 기존 큐 시스템의 checkpoint-commit 동작이 실전에서 충돌하지
  않는지 아직 검증되지 않았다 (`HANDOFF.md` Known Risks 참고).

## 2026-08-25 — GitHub 저장소를 Public으로 유지

### Context
ChatGPT를 독립 검수자로 연결하는 과정에서(PR #1 검수 중) 저장소
`Gomars93/Samindang`이 GitHub API 기준 `private:false`(Public)임이 확인되었다.
환자 문진 데이터를 다루는 시스템의 소스 저장소가 공개 상태인 것이 의도된
것인지 확인이 필요했다.

### Decision
저장소를 Public 상태로 유지한다.

### Reason
`.gitignore`가 `.env`, `.env.*`, `.data/`(환자 제출 데이터가 저장되는
디렉터리), 운영 audit 로그를 이미 제외하고 있고, 이 세션에서 저장소 전체를
스캔한 결과 추적된 파일 안에 시크릿이나 실제 환자 데이터가 커밋된 적이
없음을 확인했다. 소스코드/임상 로직/기획 문서 자체는 비공개로 유지해야 할
이유가 없다고 판단했다.

### Alternatives Considered
- Private로 전환 — GitHub 무료 플랜에서도 private 저장소에 Actions/branch
  protection을 그대로 쓸 수 있어 기술적으로는 가능하지만, 지금 당장 전환해야
  할 구체적인 이유(실제 유출 사고, 외부 공개 우려 등)가 없어 기각. 필요해지면
  언제든 전환 가능.

### Consequences
- (+) 저장소 관리에 추가 제약이 없다 (예: private 저장소의 협업자 수 제한 등).
- (−) 실제 환자 샘플 데이터, 로그, 스크린샷, fixture 등을 실수로 커밋하면
  즉시 공개된다 — `.gitignore` 규칙을 유지하고, PR 리뷰 시(특히 `.github/pull_request_template.md`의
  "Patient-data/PHI impact?" 항목) 이 부분을 매번 확인해야 한다.
- 향후 실제 환자 데이터, 진짜 API 키, 클리닉 네트워크 정보 등 민감한 자료가
  이 저장소에 필요해지는 시점이 오면, 이 결정을 재검토한다.

## 2026-08-26 — Questionnaire Depth Mode 도입 + Herbal Add-on을 same-session-only로 제한

### Context
Tablet UX v2.2 작업 중, 통증 치료(`pain_care`) 목적 환자에게 한약/체질
systemic block(`HERB_APPETITE` 등, `CONSTITUTION_BASIC_QUESTIONS`/
`HERBAL_REFERENCE_QUESTIONS`)이 `showIf` 없이 무조건 노출되던 버그를 발견
(실기기 스크린샷에서 확인). 이를 고치려면 "이 환자에게 지금 systemic block을
보여줄지"를 결정하는 새로운 개념이 필요했고, 동시에 "진료 중 한약으로
전환된 환자는 처음부터 다시 묻지 않는다"는 Herbal Add-on 요구사항도 함께
설계해야 했다.

### Decision
1. `src/spec/coreSpec.ts`에 `questionnaireMode(r): 'pain_fast' | 'expanded'
   | 'herbal_addon'`을 도입한다. `pain_fast`는 모든 비-한약 intent의 기본값,
   `expanded`는 `VISIT_00_INTENT === 'herbal'`(purpose 무관), `herbal_addon`은
   새 non-question 내부 플래그(`HERBAL_ADDON_FIELD`)로만 켜진다.
2. Herbal Add-on은 **환자가 아직 제출하지 않은, 같은 브라우저 세션 안에서만**
   동작하게 제한한다 — 제출이 확정되는 순간(`submitState` success/
   unconfigured) 발동하는 기존 프라이버시 wipe 이전에만 트리거 가능
   (`phase === 'question'`일 때만 `StaffHerbalAddonHold` 컨트롤 렌더).
   제출 후 원장이 DoctorView에서 검토하고 나서 결정하는 cross-device 재개는
   이번에 구현하지 않는다.

### Reason
1은 "어떤 questionnaire block을 언제 보여줄지"라는 순수 workflow/routing
문제이지 임상 판단이 아니므로, `showIf` 확장만으로 FROZEN
`*Logic.ts`/`*Adapter.ts`를 전혀 건드리지 않고 해결 가능했다(실제로
`git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`가
비어 있음을 확인).

2는 저장소 구조를 직접 조사한 결과(`App.tsx`의 `responses`는 React 메모리에만
존재하고 제출 확정 즉시 wipe됨, 로컬 handoff 서버는 write-once이고 tablet이
특정 환자의 진행 중 응답을 다시 읽어올 GET/토큰 메커니즘이 전혀 없음)를 근거로
내린 판단이다. 사용자가 명시적으로 금지한 "insecure query parameter, PHI
포함 URL, guessable token"을 만들지 않고 안전하게 "이어서 묻기"를 구현할 수
있는 유일한 지점이 "아직 wipe되지 않은, 같은 세션" 뿐이었다.

### Alternatives Considered
- 완료 화면(`PatientCompleteScreen`)에 addon 버튼을 두는 방안 — 기각.
  `phase === 'done'`이 되는 즉시 자동 제출 effect가 실행되고, 제출이
  확정되는 순간 responses가 wipe되므로 완료 화면에 도달한 시점에는 이미
  대부분의 경우 메모리에 응답이 남아있지 않다(네트워크 타이밍에 좌우되는
  레이스 컨디션이라 신뢰할 수 없음).
- 서버에 새 "continuation token" 엔드포인트를 만들어 cross-device resume을
  지원 — 기각(이번 스코프 아님). 새 보안 경계를 만드는 결정이라 사용자
  승인 없이 진행할 수 없다고 판단해 OPERATIONAL INTEGRATION REQUIRED로
  문서화만 하고 구현하지 않았다(`docs/TABLET_V2_2_PAIN_FAST_TRACK_AND_HERBAL_ADDON.md`
  §6 참고).

### Consequences
- (+) 기존 privacy wipe/제출 로직을 한 줄도 바꾸지 않고 Herbal Add-on을
  구현할 수 있었다 — 회귀 위험이 최소화됨.
- (+) `questionnaireMode`는 순수 함수이고 FROZEN 파일과 완전히 분리되어
  있어, 향후 clinical logic 변경과 독립적으로 이 routing 로직을 계속
  다듬을 수 있다.
- (−) 원장이 이미 제출된 문진을 DoctorView에서 검토한 **뒤에** 한약
  추가문진을 시작하고 싶다면(진짜로 "진료 중" 결정하는 흔한 임상 워크플로일
  수 있음) 이번 구현으로는 지원되지 않는다 — 필요해지면 별도 세션/토큰
  인프라 설계와 그에 따른 보안 검토가 먼저 필요하다.

## 2026-08-31 — Doctor View 재설계: 안전 상태 단일 selector + 서버 목록
## overview 계약 확정 (Opus 검수 A1/A3/A4 반영)

### Context
`docs/DOCTOR_VIEW_REDESIGN_v0.2.md`(Fable 설계, Opus 독립 검수 반영판,
이번 커밋으로 이 브랜치에 처음 반입)의 §11.1 `deriveSafetyOverview` 단일
selector와 §8.2 서버 목록 overview 필드를 구현(P1~P4)한 뒤, Opus가 구현
결과를 다시 검수해 세 가지 결함을 지적했다:

1. [BLOCKING] `server/store.js`의 `deriveListOverview`가 모듈별
   disease-status 문자열(`lbp_safety_status` 등)만 읽고, 클라이언트
   selector가 REVIEW로 반영하는 나머지 4갈래(LBP/NECK의 treatment-축
   lock, 응답 모순, 수면장애 선별 2종)를 전혀 읽지 않아 서버 목록과
   클라이언트 상세 화면의 안전 배지가 서로 어긋날 수 있었다.
2. [MAJOR] 안전 문진(SAFETY_01 등)에 실제 응답이 전혀 없는 payload(레코드
   손상/부분 제출)를 `deriveSafetyOverview`가 무조건 `CLEAR`(`안전
   확인됨`)로 표시했다 — "확인한 적 없음"과 "확인해서 안전함"을 구분하지
   못하는 fail-open이었다.
3. [MAJOR] 원장이 진찰 후 입력하는 객관적 소견(LBP 하지 근력저하 등)이
   `URGENT_REVIEW`를 만들어도 이 사실이 목록 화면 배지에는 전혀 반영되지
   않았다 — 원장이 이미 위험을 확인한 방문이 목록에서는 평범한 행으로
   보일 수 있었다.

### Decision
1. `server/store.js`의 `SAFETY_MODULE_STATUS_FIELDS`에
   `treatment_safety_status`(LBP)/`neck_treatment_safety_status`(NECK)를
   추가하고, `safety_flags.response_consistency_review` /
   `sleep_disorder_review` / `sleep_disorder_priority_review` boolean
   3종을 REVIEW 갈래로 명시적으로 반영한다. 클라이언트
   `deriveSafetyOverview`(src/doctor/safetyOverview.ts)의 REVIEW 4갈래와
   서버가 읽는 필드의 대응표를 `server/store.js` 주석에 고정한다 — 이후
   어느 한쪽만 갈래를 추가하는 드리프트를 코드 리뷰에서 바로 발견할 수
   있게 한다.
2. `SafetyOverview` 타입에 `'UNKNOWN'`을 추가한다.
   `red_flag_general !== null || rows.length > 0`(일반 안전 문항에
   응답했거나 부위별 안전 모듈이 하나라도 계산됨)일 때만 `CLEAR`를
   반환하고, 그 외에는 `UNKNOWN`을 반환해 fail-closed 표시(중립 회색
   pill "안전정보 없음")로 바꾼다.
3. `ClinicianJudgment`(src/doctor/judgment.ts)에 **원장 입력이 아니라
   시스템 파생값**인 `derived_safety_overview` 필드를 추가한다 — 저장
   직전 `deriveSafetyOverview(payload, clinicianInputs)`로 다시 계산해
   채운다. `server/store.js` 목록 생성 시
   `deriveListOverview(submission)`과 `judgment.derived_safety_overview`
   중 **더 심각한 쪽**을 채택하되(URGENT>REVIEW>CLEAR>UNKNOWN/null),
   **단조 상향만 허용**한다 — judgment 값이 덜 심각해도 문진 자체의
   overview를 하향시키지 않는다(문진 fail-closed 계산이 항상 하한선).

### Reason
안전 상태 표시는 이 프로젝트에서 단일 selector로 정의된 계약(§11.1
invariant)이므로, 그 계약을 읽는 위치(클라이언트 상세 vs 서버 목록)가
서로 다른 결과를 낼 수 있다는 것 자체가 임상 안전 결함이다. UNKNOWN
도입은 "빈 값/미확인"과 "확인된 음성 소견"을 구분하는 이 프로젝트의
기존 원칙(Field의 "빈 값은 줄을 만들지 않는다", "안 물어봄 ≠
none/unknown 응답")을 안전 상태 selector 레벨에도 동일하게 적용한
것이다. judgment 단조 상향 규칙은 원장이 이미 확인한 위험이 목록에서
안 보이는 사고를 막으면서도, 목록 화면이 "문진 자체의 안전 판정"이라는
원래 성격을 잃지 않게 하는 최소 변경이다.

### Alternatives Considered
- 서버가 `deriveSafetyOverview`를 그대로 import해 재사용 — 기각. 서버
  프로세스는 문진이 이미 계산해서 저장한 값만 읽는 것이 기존 계약
  (`server/store.js` 파일 헤더 주석)이고, `deriveSafetyOverview`는
  렌더 계층에서 `compute*Flags`를 다시 호출하는 selector라 서버에서
  호출하려면 FROZEN 임상 로직을 서버로 옮기거나 복제해야 했다. "같은
  공식을 각자 계층에서 적절한 입력으로 적용"하는 의도된 중복을
  유지하고, 대신 대응표 주석으로 드리프트를 막는 쪽을 택했다.
- judgment가 목록 overview를 자유롭게 덮어쓰게 허용 — 기각. 원장이
  실수로 또는 성급하게 낮은 심각도를 입력했을 때 실제로는 위험한 문진
  결과가 목록에서 사라지는 것은 안전 사고이므로, 단조 상향만 허용한다.

### Consequences
- (+) 목록 화면과 상세 화면의 안전 배지가 어떤 저장된 레코드에 대해서도
  서로 어긋나지 않는다(같은 4+9갈래 계약).
- (+) 손상되었거나 부분 제출된 레코드가 "안전 확인됨"으로 잘못 표시되는
  일이 없다.
- (+) 원장 진찰 소견이 목록 배지에 반영되므로, 목록만 보고도 이미
  확인된 위험을 놓치지 않는다.
- (−) `SAFETY_MODULE_STATUS_FIELDS`/REVIEW 4갈래 대응표는 앞으로
  `safetyOverview.ts`의 selector 로직이 바뀔 때마다 `server/store.js`
  주석도 함께 갱신해야 한다(자동 동기화 장치 없음, 코드 리뷰 책임).
- 관련 문서: `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` §11.1/§11.2/§8.2,
  `docs/DOCTOR_VIEW_REDESIGN_Opus_UX_Review_v0.1.md`.
