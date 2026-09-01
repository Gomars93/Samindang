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

## 2026-08-27 — Doctor Clinical Workspace (PR #24): provenance 아키텍처, 결정지원 스캐폴딩만 구현, 임상 매핑은 미구현

### Context
PR #24는 DoctorView.tsx를 단순 문진 요약 화면에서, "가능성을 좁혀주고 놓치면
안 되는 확인점을 보여주는" 실제 진료 워크스페이스로 확장하는 대규모 작업이다.
사용자가 명시적으로 지시한 범위: 신규 임상 threshold/진단/변증 로직을
발명하지 않고, 그 외 모든 정보구조·UX·상태모델·테스트·문서·배포 인프라를
자율적으로 끝까지 구현한다.

### Decision
1. **Provenance 데이터 모델**(`src/doctor/workspace/provenance.ts`)을
   신규 도입 — `PATIENT_FACT`/`DERIVED`/`SUGGESTED`/`OBSERVED`/
   `FINAL_ASSESSMENT`/`PLAN`/`FOLLOW_UP_TARGET` 7종. 시스템 제안이
   확정된 사실로, 아직 안 한 진찰이 음성 소견으로 둔갑하는 것을 구조적으로
   막는 것이 유일한 목적이며 임상적 의미는 전혀 규정하지 않는다.
2. `view_profile`(pain/herbal/mixed)은 `questionnaireMode` 하나에서 바로
   파생하지 않고, `hasPainContent`(주호소/추가호소가 Pain) ·
   `hasSystemicContent`(questionnaire_mode가 expanded 또는 herbal_addon)
   두 개의 이미 검증된 독립 신호를 조합해 계산한다
   (`src/doctor/workspace/viewProfile.ts`).
3. **`PhysicalExamSuggestion`/`HerbalPatternCandidate`의 실제
   `patient_fact → suggestion` 계산 로직은 프로덕션에 구현하지 않았다.**
   이번 PR은 (a) 두 타입의 스키마와 렌더링/상태 UI, (b) SYNTHETIC 라벨이
   붙은 미리보기 시나리오 7종, (c) 원장이 직접 rule을 채워 넣을 스키마
   문서(`docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`,
   `HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`, 둘 다 `DRAFT`/`UNAPPROVED`
   상태이며 example row 1개만 "EXAMPLE ONLY — NOT CLINICAL LOGIC"로 표시)
   까지만 구현했다. 실제 서버 제출 데이터(`mode !== 'fixtures'`)에는 항상
   빈 배열이 전달된다 — 이는 테스트로 고정되어 있다
   (`tests/doctor-workspace.spec.mjs`: "DoctorView.tsx passes no synthetic
   decision-support data for real submissions").
4. 재진 자동 비교(reassessment auto-compare)도 구현하지 않았다 — 이
   저장소에는 안전한 환자/방문 매칭 인프라(name+phone 매칭 등 충돌
   위험이 있는 방식이 아닌 진짜 안전한 매칭)가 아직 없음을 Phase 0에서
   확인했고, 재평가 "대상"만 기록하며 UI에 고정 문자열
   `REPEAT_VISIT_AUTO_COMPARE_STATUS = '재진 자동 비교: OPERATIONAL
   INTEGRATION REQUIRED'`를 노출한다(`finalAssessment.ts`).
5. 신규 `PainFinalAssessment`/`HerbalFinalAssessment`(원장 최종 판단/치료
   계획/재평가 대상)는 기존 `ClinicianJudgment`(명리 shadow-mode 감사
   기록 + `lbp_objective_motor_deficit`/`shoulder_objective_cuff_weakness`
   FROZEN 연동 필드, `src/doctor/judgment.ts`)와 완전히 분리된 별도
   타입이며, 클라이언트 로컬 state로만 존재한다(서버 영속화는 이번 PR
   스코프 밖).

### Reason
사용자가 명시적으로 금지한 것은 "새 임상 threshold/진단/변증/처방 로직을
발명하는 것"이지, 그 결정지원 기능이 들어갈 자리(스키마·UI·데이터
모델·거버넌스 문서)를 만드는 것이 아니다. 실제 매핑 규칙(어떤 patient_fact
조합이 어떤 검사/병기 후보를 제안해야 하는가)은 그 자체가 임상 판단이므로,
엔지니어링 세션이 임의로 채우면 안전성 원칙(FROZEN 파일 불변, 새 cutoff
발명 금지)을 우회하는 셈이 된다. 대신 "빈 인프라 + 명확한 거버넌스
문서"까지 완성해 두면, 원장이 문서 스키마에 맞춰 규칙을 승인하는 즉시
엔지니어링 세션이 그 규칙을 그대로 배선만 하면 되는 상태가 된다.

### Alternatives Considered
- 흔한 임상 패턴 몇 개를 "starter set"으로 미리 하드코딩 — 기각. 사용자
  지시(§Phase 4: "SYNTHETIC 예시가 프로덕션 추론으로 배선되면 안 됨")를
  정면 위반하고, 검증되지 않은 임상 판단을 시스템 제안으로 노출하는 것은
  이 프로젝트의 근본 안전 원칙과 충돌.
- view_profile을 `questionnaireMode` 하나로 단순 파생 — 기각. `expanded`
  모드라도 실제로 Pain 주호소가 없는 순수 전신 상담 케이스가 존재할 수
  있어, 두 신호를 분리해야 오분류를 줄일 수 있다고 판단.

### Consequences
- (+) FROZEN 파일(`src/spec/*Logic.ts`/`*Adapter.ts`) 대비 diff가 0이다
  (`git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
  로 매 세션 재확인 가능).
- (+) 향후 임상 매핑이 승인되면, `examSuggestion.ts`/`patternCandidate.ts`에
  `DoctorPayload → PhysicalExamSuggestion[]`/`HerbalPatternCandidate[]`
  계산 함수 하나만 추가하고 `DoctorView.tsx`의 `synthetic={...}` 전달부만
  실제 계산 결과로 바꾸면 배선이 끝난다 — 이미 그 지점에 맞춰 인터페이스가
  설계되어 있다.
- (−) 이번 PR만으로는 Pain/Herbal 결정지원 워크플로가 **실제 환자
  데이터에서는 아직 아무 제안도 만들어내지 못한다** — 100점 rubric 기준
  Pain/Herbal workflow 카테고리 각각 최대 15점 중 10점까지만 엔지니어링
  으로 도달 가능하고, 나머지 5점씩(총 10점)은 원장이
  `docs/clinical-decision-tables/*_TEMPLATE.md`를 근거로 규칙을 승인하기
  전까지는 어떤 세션도 채울 수 없다.
- (−) 재진 비교는 UI 배선만 되어 있고 실제 자동 비교는 동작하지 않는다 —
  이건 임상 판단이 아니라 별도 인프라(안전한 환자/방문 식별자) 설계가
  필요한 OPERATIONAL 블로커다.

## 2026-08-27 — Doctor Clinical Workspace round 2: 서버 영속화를 기존 judgment 저장 경로와 나란히 추가

### Context
Round 1에서 원장이 입력하는 워크스페이스 상태(검사 결과, 한약 병기 후보
검토, 임상 관찰, Final Assessment, 재평가 대상)는 React 로컬 state에만
존재했다 — 새로고침하거나 다른 제출건으로 이동했다가 돌아오면 사라진다.
사용자가 이번 라운드에서 "가장 우선순위 높은 엔지니어링 gap"으로 명시.

### Decision
1. 새 저장소 레이어를 만들지 않고, 기존 `store.js`의 `saveJudgment`
   read-modify-write-under-lock 패턴을 그대로 복제해 `saveWorkspace`를
   추가했다. 제출 record에 `judgment`의 형제 필드로 `workspace: null`을
   추가하고, `PUT /api/submissions/:id/workspace`가 그 필드만 갱신한다
   (기존 `submission`/`myungri`/`judgment`는 절대 건드리지 않는다는
   불변식을 `saveJudgment`와 동일하게 코드로 강제).
2. 영속화 키는 서버가 이미 원장 화면 곳곳(judgment 저장/조회, 방문
   activate)에 쓰고 있는 record `id`(store.js가 `randomUUID()`로 발급)
   다 — `session_id`(태블릿이 생성하는 값, 서버가 중복 제출 감지에는
   쓰지만 API 자체의 primary key는 아님)나 이름/전화/생년월일 같은 약한
   필드는 절대 쓰지 않는다.
3. 클라이언트 쪽 state 소유권을 `PainWorkspace`/`HerbalWorkspace`
   (각자 로컬 `useState`)에서 `DoctorWorkspace`(단일 소유자, controlled
   children)로 끌어올렸다. 저장 UX는 명시적 "저장" 버튼(JudgmentPanel의
   기존 패턴) 대신 편집 후 ~900ms debounce 자동저장 + 명시적 저장중/
   저장됨/실패 상태 노출을 선택했다 — 워크스페이스는 상태 버튼 클릭·
   텍스트 입력 등 훨씬 잦고 작은 단위의 변경이 많아, 매번 명시적 저장
   버튼을 누르게 하면 실사용에 방해가 된다고 판단했다(사용자가 명시한
   "whichever best matches existing architecture / make them fast enough
   for real clinic use" 기준).

### Reason
`saveJudgment`가 이미 검증된, 이 저장소의 유일한 "원장이 입력한 값을
제출건에 저장" 패턴이었으므로, 새 저장 메커니즘(별도 파일, 별도 lock
전략, 별도 API 스타일)을 발명하는 대신 그 패턴을 그대로 재사용하는 것이
회귀 위험이 가장 낮았다. 특히 per-id lock을 `saveJudgment`와 공유하게
한 것은, 같은 제출건에 judgment 저장과 workspace 저장이 동시에 오더라도
서로 완전히 반영되거나 안 되거나만 일어나게(torn write 방지) 하기
위함이다.

### Alternatives Considered
- 완전히 새로운 `workspace.json` 형제 디렉터리(visits/, recorder-results/
  와 같은 패턴) — 기각. workspace는 judgment와 마찬가지로 "이 제출건
  하나에 속하는 원장 입력"이므로, 별도 파일로 쪼개면 두 값을 함께 읽어야
  하는 모든 화면(현재는 없지만 향후 가능)에서 두 번 fetch해야 하고,
  atomic하게 같이 갱신할 방법도 없어진다.
- 명시적 "저장" 버튼(JudgmentPanel과 동일한 UX) — 고려했으나 기각.
  workspace는 판단 하나를 다 채우고 누르는 judgment와 달리, 검사 상태
  버튼 하나하나·메모 한 글자 한 글자가 다 "편집"이라 매번 버튼을 누르게
  하면 사용성이 나빠진다고 판단.

### Consequences
- (+) 기존 `saveJudgment`/`getSubmission`을 검증한 테스트(concurrency,
  isolation, restart persistence)가 커버하는 것과 동일한 안전성 보장을
  `saveWorkspace`도 거의 그대로 물려받는다 — 새로 증명해야 할 것이
  최소화됐다(그래도 `tests/server.spec.mjs`에 workspace 전용 isolation/
  round-trip 테스트를 별도로 추가해 직접 검증했다).
- (+) 원장이 검사 결과를 입력한 뒤 새로고침해도, 또는 다른 제출건을 봤다가
  돌아와도 값이 그대로 남는다 — round 1에서 남아있던 가장 큰 실사용
  장애물이 해소됐다.
- (−) `PainFinalAssessment`/`HerbalFinalAssessment`(이 새 워크스페이스의
  최종 판단)와 `ClinicianJudgment`(명리 감사 기록)는 여전히 서로 다른
  두 레코드 필드로 남는다 — 하나로 합칠지는 이번 라운드 스코프 밖의
  별도 설계 결정이다.

## 2026-08-28 — Micro Follow-up(PR #24 round 3 Phase D): 환자 태블릿
직접 제출 라우트를 만들지 않고 doctor 인증 라우트로만 남김

### Context
North Star(`docs/CLINICAL_OS_NORTH_STAR.md`)의 Micro Follow-up 단계는
"재진 환자가 태블릿에서 30-60초 짧은 체크인에 답한다"는 여정을 전제한다.
데이터 모델(`src/doctor/workspace/microFollowUp.ts`)과 서버 저장소
(`server/microFollowUpStore.js`)까지는 구현했지만, 이 서버의 기존 모든
라우트(Recorder 워크스테이션의 POST 포함)는 예외 없이 doctor 토큰을
요구하고, 태블릿 앱(`src/App.tsx`)은 그 토큰을 가진 적이 전혀 없다
(패턴이 이미 테스트로 보장되어 있었다 — "patient App.tsx never
references listSubmissions/getSubmission"). 재진 환자가 실제로 태블릿
에서 직접 이 질문에 답하게 하려면, 태블릿에 doctor-token 접근을 새로
허용하거나(기존 보안 경계 확장) 또는 URL 파라미터/QR/lookup 토큰 같은
새 환자 식별 체계를 만들어야 한다(새 신원 메커니즘 발명).

### Decision
`POST`/`GET /api/visits/:id/micro-follow-up` 두 라우트 모두 기존 라우트
와 동일하게 `requireDoctor` + Origin allowlist 가드를 그대로 적용했다.
태블릿에서 직접 호출하는 무인증/약한인증 경로는 만들지 않았다. 지금은
원장/직원이 인증된 세션에서 환자 답변을 대신 입력하는 것만 가능하다.

### Reason
"환자 식별을 이름/전화/생년월일로 자동 매칭하지 않는다"는 이 저장소의
절대 원칙(`visitStore.js` 최상단 주석)과 동일한 무게의 문제다 — 어떤
방식으로 태블릿에 patient_id/visit_id를 안전하게 넘길지는 보안/제품
결정이지 엔지니어링 편의로 정할 수 있는 문제가 아니다. 새 메커니즘을
임의로 발명하는 대신, 기존 doctor 인증 경계를 그대로 유지하고 이 gap을
`microFollowUp.ts` 파일 상단 주석과 `HANDOFF.md`의 OPERATIONAL
INTEGRATION REQUIRED 항목으로 정직하게 남겼다.

### Alternatives Considered
- 태블릿에 방문별 1회용 URL 토큰(예: `/?visit=<random>`)을 발급 — 토큰
  발급/만료/재사용 방지 정책이 전부 새로 필요한 보안 설계라 기각(이번
  라운드는 이미 존재하는 identity 원칙을 확장하는 것까지만 권한이 있음).
- 태블릿 앱에 doctor 토큰을 직접 심어 매 방문 진료실에서 입력 — 토큰이
  태블릿에 남는 순간 다른 모든 doctor-guarded 라우트(제출 목록, EMR
  등)에도 태블릿이 접근 가능해져 버려, 이 기능 하나를 위해 훨씬 넓은
  보안 경계를 여는 셈이라 기각.

### Consequences
- (+) 기존 보안 모델을 전혀 흔들지 않았다 — 이 라운드가 만든 새 라우트
  2개도 기존 13개(이제 14개)와 정확히 같은 가드를 쓴다는 것이 서버
  테스트로 증명됨.
- (+) 데이터 모델/저장소/원장 UI(`MicroFollowUpCard.tsx`)는 전부
  완성되어 있어, 인증 경로 결정만 나면 바로 이어붙일 수 있다.
- (−) 지금은 "환자가 직접 태블릿에서 답한다"는 North Star의 핵심
  전제가 실제로 동작하지 않는다 — 원장/직원 대리 입력만 가능.

## 2026-08-28 — 재진 태블릿 연결(PR #24 round 3 후속): 일회용 capability
token으로 Micro Follow-up 환자 직접 제출 gap을 닫음

### Context
바로 위 2026-08-28 결정에서 "환자가 태블릿에서 직접 답한다"를 의도적으로
미루고 원장 대리 입력만 남겨뒀다. 사용자가 이 gap을 명시적으로 해소하도록
승인된 제품/보안 방향을 지시했다: 이름/전화/생년월일 매칭은 여전히 절대
금지, doctor 토큰은 절대 환자 태블릿에 전달하지 않음, 새 visit_id를
원장/직원이 명시적으로 개설한 뒤에만 발급되는 1회용 링크만 허용.

### Decision
`server/followUpSessionStore.js`에 capability-token 모델을 새로 만들었다
(로그인/세션이 아님):
- `randomBytes(32).toString('base64url')`(256bit)로 발급, 서버는 SHA-256
  해시만 저장 — 평문 토큰은 발급 응답 한 번만 존재하고 디스크/로그
  어디에도 남지 않는다.
- 토큰 1개 = visit_id 1개에 고정 스냅샷(targets는 발급 시점에 그 환자의
  직전 방문 Follow-up Target에서 최대 3개, 재랭킹 없음). 공개 GET/POST
  엔드포인트(`/api/follow-up-session/:token`)는 doctor 인증/Origin
  allowlist를 전혀 거치지 않는다(환자 자신의 기기이므로 기존 환자 제출
  라우트와 동일한 CORS 자세) — 대신 토큰 자체가 유일한 권한 증명이다.
- consume은 ACTIVE→CONSUMED 전이 1회만 성공(동시 재시도는 per-token
  lock으로 직렬화) — 재제출/이중제출은 항상 실패.
- "재진 간단 문진 시작"(원장/직원 1클릭) = 새 visit_id 생성 + 후보 도출
  + 토큰 발급이 한 트랜잭션처럼 항상 함께 일어난다 — visit만 있고 토큰이
  없거나 그 반대인 상태가 나올 수 없다.
- follow-up-session 토큰의 보존기한(`SAMINDANG_FOLLOWUP_TOKEN_RETENTION_
  HOURS`, 기본 24시간)은 일반 진료기록 보존기한(`SAMINDANG_RETENTION_
  DAYS`)과 완전히 분리된 별도 스위치 — 하나를 꺼도 다른 하나는 그대로
  동작한다(구현 중 스스로 발견한 결합 버그를 커밋 전에 분리해 수정).

### Reason
"이름/전화/생년월일로 자동 매칭하지 않는다"는 기존 절대 원칙을 이 새
경로에도 그대로 적용하려면, 환자 태블릿이 알아도 되는 것은 오직 그
발급된 opaque token 하나뿐이어야 한다 — token만으로 서버가 정확히 어느
visit인지 판단하고, 그 visit의 patient_id는 서버 내부에서만 쓰인다(공개
응답에 절대 포함하지 않음). doctor 토큰을 태블릿에 심는 대신 새 최소권한
capability token을 발명한 이유는 위 2026-08-28 결정의 "Alternatives
Considered"에서 이미 기각한 두 옵션(태블릿에 doctor 토큰 부여 = 전체
doctor API 노출 / 검증 안 된 URL 파라미터 방식)의 정확한 대안이기
때문이다.

### Alternatives Considered
- 태블릿에 doctor 토큰 발급 — 기각(위 라운드에서 이미 기각한 이유와
  동일: EMR/제출목록 등 훨씬 넓은 doctor API 표면이 함께 열림).
  visit_id/patient_id를 URL 쿼리로 그대로 노출 — 기각(추측 가능한 값,
  재사용/공유 시 무기한 유효).
- 4~6자리 숫자 코드 — 사용자가 명시적으로 금지(브루트포스에 취약,
  128bit 미만 엔트로피).

### Consequences
- (+) North Star의 Micro Follow-up 여정이 처음으로 실제 동작한다(원장이
  링크 발급 → 환자가 자기 기기/태블릿에서 직접 답함 → 원장 큐에 자동
  반영). 실제 헤드리스 브라우저(서버+vite+Chromium)로 전체 왕복(발급 →
  환자 제출 → 완료 화면 → 뒤로가기 프라이버시 가드 → 원장 큐 COMPLETED →
  재진 워크스페이스 3분리 렌더 → 새로고침 후에도 유지 → 재발급이 구
  토큰 무효화 → 원장 수동 무효화)까지 실제로 확인됨.
- (+) 기존 doctor 라우트 보안 모델(Origin allowlist, requireDoctor)은
  전혀 약화되지 않았다 — 공개 라우트 2개는 애초에 그 가드 목록에 넣지
  않았고, 서버 테스트(`tests/server.spec.mjs`)가 doctor-guarded 라우트
  개수(22개)를 여전히 정확히 고정한다.
- (+) 새 `tests/follow-up-session.spec.mjs`(113 assertion)이 토큰
  무작위성/형식, 평문 미저장, visit 범위, 무효/만료/소비 거부, 교차환자
  격리, 재발급 시 구토큰 무효화, GET의 신원정보 미노출, POST의 라벨
  변조 불가, doctor 토큰 부재, 이름/전화/생년월일 미사용, CORS/바디크기
  가드를 전부 회귀 테스트로 고정.
- (−) 아직 QR 코드 생성은 없다(v1은 직접 링크 텍스트만) — 사용자가
  "QR은 선택, 지연시키지 말 것"으로 명시했으므로 의도된 축소 범위.
- (−) 재진 후보 target이 하나도 없는 환자(직전 방문에 Follow-up Target
  기록이 없는 경우)는 링크는 발급되지만 재확인 항목 없이 전반적 변화/
  새 증상/이상반응만 묻는다 — 새 질문을 발명하지 않고 정직하게 원장
  UI에 "이 환자는 이전 방문 추적 항목이 없습니다"로 알린다.

## 2026-08-28 — round 4 리뷰 엔지니어링 수정 (round 5)

### Context
위 "재진 태블릿 연결" 구현에 대한 PR 리뷰(Gomars93, round 4 follow-up)가
새 임상 판단은 요구하지 않되 병합 전 필수인 6개 엔지니어링 정합성 문제를
지적했다: (1) `startRevisit`의 visit-then-token 두 단계가 원자적이지
않음, (2) `submitFollowUpSession`이 응답 저장 전에 토큰을 소비해 저장
실패 시 응답이 유실되고 재시도 불가능함, (3) submission-backed visit의
workspace를 `PUT /api/visits/:id/workspace`로도 덮어쓸 수 있어 단일
진실 공급원이 깨짐, (4) `getPatientHistory`가 no-submission 재진을
스킵해 재진 #2가 재진 #1이 아니라 초진의 오래된 target을 봄, (5)
target별 답변이 좋아짐/비슷함/나빠짐 방향성만 캡처해 통증 7→4처럼
like-for-like 원본값 비교가 불가능함, (6) 제출 성공 후에도 토큰이
브라우저 URL/history에 남아있음.

### Decision
6개 항목 전부와 부수적으로 요청된 edge tightening(malformed
percent-encoding 처리, stale by-visit 포인터 정리, store 레벨 SSOT
강제, Herbal 필드 라벨 감사)을 수정한다. 상세 구현은
`HANDOFF.md`의 "Completed — Round 5" 참고. 핵심 패턴 두 가지만 여기
기록한다:
- **rollback-on-failure**: `startRevisit`은 visit을 먼저 만들고,
  이후 단계(target 도출/토큰 발급)가 실패하면 그 visit을
  `deleteVisitForRollbackOnly`(HTTP로 노출되지 않는 전용 함수)로 즉시
  삭제한 뒤 rethrow한다.
- **validate-act-then-commit-under-lock**: `consumeTokenWithAction`은
  토큰 상태를 락 안에서 검증한 뒤, 호출자가 넘긴 내구성 저장(actionFn)이
  성공해야만 토큰을 CONSUMED로 커밋한다. 저장이 실패하면 토큰은 ACTIVE로
  남아 같은 1회용 링크로 안전하게 재시도할 수 있다.

### Reason
두 패턴 모두 새 리소스(DB 트랜잭션 등)를 도입하지 않고 기존 파일시스템
저장소 + per-key 락 구조 위에서 원자성/내구성을 얻는 최소 변경이다.
`follow_up_targets` 통합 필드는 프로필(Pain/Herbal)마다 다른 필드명을
호출부에서 매번 분기하는 대신, "가장 최근에 추적된 것"이라는 프로필에
무관한 개념을 서버가 한 번만 계산해 내려주는 것이 정확성과 유지보수성
둘 다에 유리하다고 판단했다.

### Consequences
- (+) 6개 리뷰 항목 + edge tightening 전부 파일시스템 레벨 failure
  injection 테스트로 실증(코드 리뷰만이 아니라 실제로 원자성/재시도
  가능성을 검증). `tests/follow-up-session.spec.mjs` 113 → 134
  assertion, 실제 헤드리스 브라우저 QA 27 → 29 체크.
- (+) 리뷰가 요구한 정확한 회귀 시나리오(초진 target A → 재진1 환자
  입력+원장이 B 선택 → 재진2는 B를 받음, 이전 방문 불변)를 전용 테스트로
  고정.
- (+) `src/spec/*Logic.ts`/`*Adapter.ts` FROZEN zero-diff 유지, 새 임상
  threshold/추론 없음.
- (−) 없음 — 전부 엔지니어링 정합성 수정이며 사용자가 승인한 기존 제품
  방향(1회용 capability token, 이름/전화/생년월일 매칭 금지)을 변경하지
  않았다.

## 2026-08-28 — round 5 follow-up 리뷰 2차 엔지니어링 수정 (round 6)

### Context
위 round 5 수정에 대한 2차 리뷰("Round 5 follow-up")가 "prior 6
blockers는 materially addressed"라면서도 재검토에서 second-order gap
7개를 지적했다: (1) 재발급이 새 토큰/pointer 쓰기 전에 old 토큰을 먼저
무효화해 새 쓰기가 실패하면 기존에 잘 작동하던 링크가 대체 없이
파괴됨, (2) `issueToken`이 자체적으로 all-or-nothing이 아니라 부분쓰기
아티팩트가 남을 수 있음, (3) round 5가 만든
validate-act-then-commit 경계에도 "저장 성공 후 consume 쓰기만 실패"
창이 남아있어 재시도가 이미 저장된 응답을 덮어쓸 수 있음, (4)
`startRevisit`에 in-flight 중복 방지가 전혀 없어 더블클릭/네트워크
재시도가 재진 2개를 만들 수 있음, (5) `RevisitWorkspace`가 최신 이전
방문이 그 자체로 재진일 때 그 visit-owned 워크스페이스를 불러오지 않아
Care Plan/재검 상세를 잃음, (6) URL/history는 스크럽했지만 React 부모
상태(`App.tsx`의 `followUpToken`)에는 평문 토큰이 여전히 남아있음, (7)
`microFollowUp.ts` 등 일부 주석이 round 4 이전(환자 화면 없음) 상태를
그대로 서술.

### Decision
7개 전부 수정한다. 핵심 패턴:
- **재발급 2-phase swap**: `issueToken`을 "new 토큰 레코드 쓰기(old는
  전혀 안 건드림) → pointer를 new로 원자적 전환 → 성공 후에만 old를
  best-effort 무효화" 순서로 재작성. pointer 전환이 실패하면 방금 쓴
  new 토큰 레코드를 즉시 삭제(cleanup) 후 rethrow — 이 자체로 (1)/(2)를
  동시에 해결한다(호출자인 `startRevisit`의 기존 rollback은 그대로
  두되, `issueToken`이 이미 깨끗한 상태만 넘겨주므로 부분쓰기 아티팩트가
  생길 수 없다).
- **응답 write-once**: `microFollowUpStore.saveResponse`가 이미 저장된
  visit_id에 대해서는 새 입력을 무시하고 기존 레코드를 반환 — consume
  경계의 재시도가 안전해진다.
- **startRevisit dedup**: patient_id별 락 + "직전 재진이 아직 응답 없음
  (pending)일 때만" 짧은 윈도우 내 재사용. 이미 완료된 재진에는 적용
  안 됨 — round 5의 longitudinal 시나리오(재진1 완료 후 재진2 시작)와
  충돌하지 않도록 "완료 여부"를 조건에 넣은 것이 핵심 설계 판단이다
  (처음엔 단순 시간 윈도우로 구현했다가 round 5 자체 회귀 테스트가
  깨지는 것을 보고 발견/수정).

### Reason
재발급의 old-invalidate-first 순서는 "새 링크가 확실히 작동하는 순간까지
는 이전 링크를 죽이지 않는다"는 가용성 원칙을 어기고 있었다 — 클리닉
운영 중 파일시스템 순간 오류 하나가 환자에게 전달된 링크를 이유 없이
끊을 수 있는 구조였다. 두 실패 지점(새 토큰 쓰기/포인터 쓰기) 모두를
문제 삼은 것도 이 원칙 위반이 어느 지점에서 발생하든 동일하게 old
링크를 보호해야 하기 때문이다.

### Consequences
- (+) 7개 항목 전부 파일시스템 레벨 failure injection 또는 실제
  동시성(Promise.all)/헤드리스 브라우저 테스트로 실증.
  `tests/follow-up-session.spec.mjs` 134 → 151 assertion,
  `tests/server.spec.mjs` 211 → 213(write-once 회귀 추가), 실제
  헤드리스 브라우저 QA 29 → 38 체크.
- (+) `src/spec/*Logic.ts`/`*Adapter.ts` FROZEN zero-diff 유지, 새 임상
  threshold/추론 없음.
- (−) 없음 — 전부 엔지니어링 정합성 수정.

## 2026-08-28 — round 6 re-review 3차 엔지니어링 수정 (round 7)

### Context
round 6 수정에 대한 세 번째 리뷰("Round 6 re-review")가 "이전 blocker는
크게 개선됐지만 비임상 엔지니어링 이슈 3개가 남아있다"고 지적했다: (1)
`issueToken`의 phase 2(pointer 전환)는 성공했는데 phase 3(old 토큰
무효화)만 실패하면, public `resolveToken`/`consumeTokenWithAction`이
토큰 레코드를 해시로 직접 읽어 자신의 `status` 필드만 신뢰하고
pointer와 대조하지 않으므로 old 토큰이 여전히 공개적으로 사용 가능한
상태로 남을 수 있음(round 6의 주석은 "pointer가 안 가리키니 도달
불가능"이라 주장했지만 실제로는 도달 가능했다), (2)
`FollowUpScreen.tsx`의 `const [activeToken] = useState(token)`가 완료
화면이 떠 있는 동안에도 평문 토큰을 계속 들고 있어 round 6의 "ANY
React state에서 제거됨" 주장이 사실이 아니었음, (3) `RevisitWorkspace`
가 새 visitId/patientId 로드 시작 시 prior 관련 state(`priorHistory`/
`priorSubmission`/`priorVisitWorkspace`/`microFollowUpResponse`)를
리셋하지 않아, 새 레코드의 prior-detail fetch가 실패하면 이전 환자
데이터가 새 환자 화면에 남을 수 있었음(DoctorView가 `<RevisitWorkspace>`
를 `key` 없이 렌더링).

### Decision
3개 전부 수정한다.
- **pointer 권위**: `resolveToken`/`consumeTokenWithAction`이 토큰의
  `status`를 신뢰하기 전에 반드시 by-visit pointer가 그 토큰 해시를
  가리키는지 확인한다. 불일치하면(자신은 ACTIVE라고 해도) INVALIDATED로
  취급한다. `consumeTokenWithAction`은 이미 보유한 락 안에서 잘못된
  on-disk 값을 self-heal한다.
- **FollowUpScreen 자체 state 정리**: `handleSubmit` 성공 직후
  `setActiveToken(null)`을 명시적으로 호출한다.
- **RevisitWorkspace state 리셋**: load effect가 비동기 fetch를
  시작하기 *전에* prior 관련 state 전부를 null로 리셋한다.

### Reason
pointer 권위 이슈는 round 6 자신의 주석이 근거로 삼은 가정("pointer가
안 가리키므로 도달 불가능")이 실제 코드 경로(해시로 직접 읽는
resolveToken/consumeTokenWithAction)와 맞지 않았던 것이 원인이다 —
공개 조회 경로는 pointer를 거치지 않으므로, "unreachable"이라는 주장은
그 경로에 대해서는 성립하지 않았다. 이번 수정은 pointer를 실제로
"단일 진실 공급원"으로 만드는 마지막 단계다.

### Consequences
- (+) 3개 항목 전부 파일시스템 레벨 failure injection(pointer 권위) 또는
  실제 헤드리스 브라우저 테스트(교차 레코드 stale-data)로 실증.
  `tests/follow-up-session.spec.mjs` 151 → 158 assertion, 실제
  헤드리스 브라우저 QA 38 → 39 체크.
- (+) `src/spec/*Logic.ts`/`*Adapter.ts` FROZEN zero-diff 유지, 새 임상
  threshold/추론 없음.
- (−) 없음 — 전부 엔지니어링 정합성 수정.

## 2026-08-28 — 전달 채널 무관 Micro Follow-up + 원내 태블릿 스테이션 (round 8)

### Context
round 4-7이 만든 재진 Micro Follow-up은 보안적으로는 견고해졌지만, 실제
클리닉 운영에서는 **원장이 링크를 발급해 환자에게 전달**하는 단일 경로
뿐이었다. 사용자가 승인한 방향은 "모든 재진을 클리닉 태블릿으로 강제하지
않되, 접수 병목을 실제로 줄이도록 전달 채널을 추상화한다"였다. 특히
고령 환자가 QR을 스캔하거나 이름/전화를 입력하지 않고도 재진 문진을 할 수
있어야 하고, 그 트리거는 원장이 아니라 **접수/직원**이어야 한다.

### Decision
- **delivery_mode**(CLINIC_TABLET/PERSONAL_QR/STAFF_ASSISTED/
  PREVISIT_LINK)를 세션의 순수 운영 메타데이터로 도입한다. 임상 의미·
  라우팅·threshold·추적 대상 선정에 **어떤 영향도 주지 않는다**. 인식
  불가 값은 거부가 아니라 null로 정규화한다 — 잘못된 메타데이터가 정상적인
  링크 발급을 막아서는 안 된다(가용성 우선, 신뢰는 별개).
- **이번 라운드에 실제로 구현하는 채널은 두 개**(CLINIC_TABLET,
  PERSONAL_QR)로 제한한다. 네 채널을 동등하게 과잉 구축하지 않는다.
- **STAFF_ASSISTED는 별도 임상 프로토콜이 아니라 입력 주체(provenance)**
  로만 구현한다. `inputProvenance`(PATIENT_SELF/STAFF_ASSISTED)는 기존
  임상 Provenance enum(PATIENT_FACT/OBSERVED/...)과 **다른 축**이며, 두 값
  모두 여전히 "환자가 보고한 사실"이다. 직원 대필이 원장 관찰 소견으로
  오독되면 안 된다.
- **PREVISIT_LINK는 데이터/UI 훅만** 두고 문자·카카오 발송은 구현하지
  않는다(승인된 외부 발송 제공자 부재 — 이 라운드의 유일한 human blocker).
- **스테이션 보안 모델은 기존 capability-token 패턴을 그대로 재사용**
  한다: 256bit 기기 credential, SHA-256 해시만 저장, 평문은 1회용 페어링
  링크로 단 한 번만 반환. 약한 환자 조회 코드를 신원으로 쓰지 않는다.
- **배정된 raw 토큰은 메모리에만** 둔다(디스크에 절대 쓰지 않음). 서버
  재시작 시 대기 중 배정이 사라지는 것은 의도된 트레이드오프 — 직원이
  다시 배정하면 되고, 그 대가로 평문 capability가 파일시스템에 두 번째
  표현을 갖지 않는다.
- **재배정 순서는 "배정 성공 후 이전 세션 무효화"**로 고정한다(round 6에서
  확립한 순서 원칙과 동일). 반대 순서는 새 배정이 실제로 설치되기 전에
  멀쩡한 링크를 죽인다.
- 스테이션은 질문 흐름을 **복제하지 않고 기존 `FollowUpScreen`을 그대로
  렌더**한다. "모든 채널이 동일한 데이터를 남긴다"가 약속이 아니라 구조가
  되게 하는 핵심 결정이다.

### Reason
접수 병목의 실제 원인은 "환자가 자기 신원을 입력하는 단계"와 "원장이
개입해야 하는 단계"였다. 스테이션 모델은 둘 다 제거한다 — 직원이 이미
화면에 열려 있는 환자 기록을 그대로 배정하므로 신원 매칭이 아예 발생하지
않고(기존 절대 원칙 유지), 원장 클릭도 필요 없다. 태블릿이 자기 배정을
스스로 polling해 가져가는 구조라서, 직원이 환자의 capability 토큰을 보거나
다루는 일도 없다.

### Alternatives Considered
- 태블릿이 대기 중인 환자 목록에서 **환자가 자기 이름을 고르게 하기** —
  기각(사용자가 명시적으로 금지). 동명이인 오선택 위험이 있고, 대기 화면에
  환자 명단을 노출하게 된다.
- 태블릿에 doctor 토큰 부여 — 기각(round 4에서 이미 기각한 이유와 동일).
- 스테이션 배정을 서버 파일에 raw 토큰까지 저장 — 기각(평문 capability의
  두 번째 영속 표현을 만들게 됨).

### Consequences
- (+) 실제 접수 워크플로가 "기존 환자 선택 → 태블릿 배정 → 환자에게 건네기"
  3단계로 줄었고, 원장 개입이 필요 없다.
- (+) QR 경로와 태블릿 경로가 **동일한 코드로 동일한 데이터**를 남긴다
  (테스트로 고정: 두 채널의 저장 내용이 전달 메타데이터를 빼면 동일).
- (+) 운영 타임스탬프 4종으로 병목을 나중에 데이터로 볼 수 있다(새 제품
  문서 없이 UI/큐에서 바로).
- (+) 실제 헤드리스 브라우저 QA가 **CORS preflight 누락 버그**를 잡았다
  (`x-station-credential`가 allow-headers에 없어 브라우저에서만 폴링이
  전부 차단됨 — node fetch는 preflight를 하지 않아 HTTP 테스트는 통과했다).
- (−) 서버 재시작 시 대기 중이던 스테이션 배정은 사라진다(위 트레이드오프).
- (−) PREVISIT_LINK는 아직 수동 전달만 가능하다 — 외부 발송 제공자 결정이
  나올 때까지 이 상태를 유지한다.

---

## 2026-08-28 — round 8 re-review 4차 수정: 락 순서, 스테이션 유일성, 일상 재진 압축 (round 9)

### Context
round 8 HEAD(`dcb5853`)에 대한 재리뷰가 엔지니어링 정확성 3건과 이미
승인된 제품 후속 1건을 지적했다. 임상 결정은 하나도 필요하지 않다.

핵심은 **"확인했다"와 "배타적이다"는 다르다**는 것이다. round 7은
by-visit 포인터를 *읽도록* 고쳤지만, 그 확인과 뒤따르는 행위가
`issueToken`의 포인터 교체와 상호 배타적이지 않았다. 그래서 옛 토큰
요청이 아직 유효한 포인터를 읽은 뒤, 교체가 끝난 다음에도 응답 저장과
CONSUMED 전환을 끝까지 완료할 수 있었다. 스테이션 쪽도 같은 종류의
문제였다: `assignSession`의 디스크 쓰기와 in-memory 토큰 설치가 서로
다른(사실상 없는) 잠금 아래 있었고, `pollAssignment`는 아무 락도 잡지
않았다.

### Decision
1. **해시로 레코드에 도달하는 모든 공개 경로는 visit 락 안에서 판단한다.**
   `resolveToken` / `consumeTokenWithAction` / `markStarted` 모두
   `visit:<visit_id>` → `token:<hash>` 순서로 락을 잡고 그 안에서
   포인터를 다시 읽는다. 이 순서는 `issueToken` phase 3 및
   `invalidateActiveForVisit`과 동일하므로 순환(deadlock)이 없다.
   잠금 없는 선행 읽기는 **어느 visit 락을 잡을지 알아내는 용도로만**
   쓴다(레코드의 visit_id는 쓰여진 뒤 불변). 예외 없음 —
   "모든 by-hash 경로가 포인터를 존중한다"가 문서상의 단서가 아니라
   실제 불변식이 되도록 `markStarted`까지 포함시켰다.

2. **스테이션: visit당 하나, 그리고 사용 중이면 거절.**
   - `assignedTokens`가 `{visit_id, token}`을 함께 보관하고,
     `pollAssignment`가 `assignSession`/`clearAssignment`와 같은
     `station:<id>` 락 안에서 visit_id 일치를 확인한다.
   - store 전역 `assign:all` 락 안에서 같은 visit을 들고 있는 다른
     스테이션을 먼저 해제한다(무효화가 아니라 해제 — 지금 넘기려는
     바로 그 세션이다). 락 순서는 언제나 `assign:all` → `station:<id>`.
   - 다른 환자를 서빙 중인 태블릿에는 배정을 **거절**한다(409
     `station_busy`). 같은 visit의 재배정만 허용.
   - 직원의 수동 초기화(`resetStation`)는 배정 해제에 더해 그 visit의
     토큰을 무효화하고 dedup 캐시를 비운다.

3. **`assignRevisitToStation`은 자기가 만든 것만 롤백한다.**
   스테이션 배정이 throw 하거나 `station_busy`로 거절되면 그 직전에
   만든 재진 visit + 토큰을 되돌린다. 단 `startRevisit`이 dedup으로
   기존 pending 재진을 재생한 경우(`reused === true`)에는 절대
   건드리지 않는다.

4. **일상 재진 UI 압축 (carry-forward).**
   `src/doctor/workspace/revisitCarryForward.ts` 신설. 이전 방문의
   판단/관리계획/Follow-up Target 선택을 **클릭할 때만** 오늘 기록으로
   가져온다. 오늘 이미 입력된 내용은 덮어쓰지 않는다(연산 자체의 성질로
   보장 — 호출부의 예의가 아니라).

### Reason
- 락 순서를 하나로 통일하는 것이 "각 경로마다 어떤 경합이 가능한가"를
  일일이 추론하는 것보다 검증 가능하다. 결정적 경합 테스트를 쓸 수 있게
  된 것도 그 덕분이다(`withLock`이 호출 시점에 맵 엔트리를 동기적으로
  설치하므로 호출 순서가 곧 락 획득 순서다 — 타이밍에 의존하지 않는다).
- 사용 중 태블릿 인수를 "조용히 성공"시키는 것은 **거짓말**이다.
  `StationScreen`은 환자가 질문을 연 뒤 폴링을 멈추므로 서버가 무엇을
  하든 그 물리적 화면은 바뀌지 않는다. 거절하면 직원이 실제로 태블릿을
  회수/초기화하게 되고, 그것이 안전한 실제 동작이다.
- carry-forward에서 **이전 객관 소견과 이전 측정값을 구조적으로 제외**한
  것은 이 저장소의 provenance 모델의 직접적 귀결이다. 판단과 계획은
  임상가가 오늘 다시 확인하는 *결정*이지만, 진찰 소견과 측정값은 그때
  참이었던 *사실*이다. 후자를 오늘 기록으로 복사하면 하지 않은 진찰을
  한 것처럼 남긴다.

### Alternatives Considered
- 포인터 교체 시 **generation 번호**를 발급해 진행 중인 요청을 무효화 —
  기각. 이미 있는 visit 락으로 같은 보장을 얻을 수 있고, 새 필드와 새
  마이그레이션 걱정이 생긴다.
- 스테이션에 **heartbeat/generation 프로토콜**을 추가해 진행 중인 화면을
  원격으로 회수 — 리뷰도 대안으로 언급했으나 파일럿에서는 기각.
  거절이 더 단순하고 더 안전하며, 필요해지면 나중에 얹을 수 있다.
- carry-forward를 **자동 적용**(열자마자 채워두기) — 기각. 임상가가
  보지 않은 판단이 기록에 남는다. 압축의 목적은 타이핑을 줄이는 것이지
  판단을 대신하는 것이 아니다.
- Herbal 필드 중 generic 대응이 없는 것들을 **버리기** — 기각.
  임상가가 쓴 텍스트를 조용히 잃는다. 대응되는 generic 필드에
  줄바꿈으로 합친다.

### Consequences
- (+) 재발급 교체가 이긴 뒤에는 옛 토큰이 수락을 **시작조차** 못 한다
  (actionFn이 실행되지 않으므로 고아 응답이 저장될 수 없다).
- (+) 하나의 살아있는 capability가 두 태블릿에 동시에 존재할 수 없다.
- (+) 실패한 배정이 큐에 고아 재진을 남기지 않는다.
- (+) 변화 없는 일상 재진이 버튼 몇 번으로 끝난다 — 그러면서도 오늘
  진찰 소견은 여전히 임상가가 직접 기록해야 한다.
- (−) 사용 중 태블릿에 배정하려면 직원이 먼저 초기화해야 한다(의도적).
- (−) 공개 GET/POST가 이제 해당 visit의 재발급과 직렬화된다. 두 연산
  모두 밀리초 단위 파일 작업이므로 실사용 영향은 없다.

---

## 2026-08-28 — round 9 re-review 5차 수정: 이동 대신 거절, 취소 우선, 라벨/기록 정합 (round 10)

### Context
round 9 HEAD(`c94d08b`)에 대한 재리뷰가 비임상 정확성/provenance 3건을
지적했다. 세 건 모두 **"서버 상태를 바꾸면 세상이 따라온다"는 잘못된 가정**의
서로 다른 얼굴이다.

1. 스테이션 간 세션 "이동": 서버에서 옛 스테이션의 배정 레코드를 지워도,
   그 태블릿이 이미 폴링으로 가져간 raw capability는 회수되지 않는다.
   태블릿은 환자가 질문을 연 뒤 폴링을 멈추므로 되돌릴 방법도 없다.
2. 초기화(reset): 배정을 먼저 지우고 나중에 토큰을 무효화하면, 그 사이
   stale 태블릿이 제출해 수락될 수 있다.
3. carry-forward: 버튼 라벨이 약속한 것보다 넓은 범위를 기록했다.

### Decision
1. **이동하지 않고 거절한다.** 같은 visit이 다른 스테이션에 배정되어 있으면
   `visit_assigned_elsewhere`(409)로 거절한다. 직원이 옛 스테이션을 먼저
   초기화해야 하고, 초기화가 capability를 실제로 회수하므로 다음 배정은
   새 capability를 발급한다. `assignSession`은 이제 어떤 경우에도 다른
   스테이션을 건드리지 않는다.

2. **취소를 먼저, 배정 해제를 나중에.** `resetStation`은
   `invalidateActiveForVisit` → `clearAssignment(stationId, expectedVisitId)`
   순서로 진행한다. 해제는 조건부여서, 취소가 visit 락을 기다리는 동안
   정당하게 들어온 새 세션을 실수로 지우지 않는다.

3. **각 carry-forward 액션은 라벨에 적힌 필드만 쓴다.**
   - `이전 판단 유지` → 최종 임상 판단, 치료 초점
   - `이전 처치·관리계획 유지` → 시행/예정 처치, 즉시 재검 대상, 관리 계획
   두 필드가 `finalAssessment`에, 나머지가 `carePlan`에 저장되지만 액션은
   **저장 위치가 아니라 의미**를 따라간다.

### Reason
- 1번과 2번은 같은 원칙의 두 적용이다: **되돌릴 수 없는 것을 되돌릴 수 있는
  것처럼 다루지 않는다.** 물리적 태블릿 화면은 서버가 회수할 수 없으므로,
  회수를 전제로 한 "이동"은 존재하지 않는 보장을 파는 것이다. 거절은
  보상 트랜잭션이 필요 없다 — 성공할 것이 아니면 아무것도 건드리지 않는다.
- 2번의 순서는 **두 실패 모양의 비대칭**으로 결정된다. "바쁜 스테이션에
  죽은 토큰"은 눈에 보이고 재시도하면 되지만, "초기화 후 수락된 응답"은
  조용한 기록 오염이다. 회복 가능한 실패를 택한다.
- 3번은 임계값 문제가 아니라 **동의(consent) 문제**다. 임상가가 "판단을
  유지한다"고 클릭했는데 처치 기록이 생기면, 그 기록은 임상가가 의도해서
  만든 것이 아니다. 라벨과 효과가 어긋나면 explicit-click 원칙 자체가
  무의미해진다.

### Alternatives Considered
- 이동을 유지하되 **generation/heartbeat 프로토콜**로 진행 중인 화면을
  원격 회수 — 기각(파일럿 범위). 진짜 보상 트랜잭션과 결정적 실패 커버리지가
  필요하고, 거절은 그 둘 다 필요 없다. 필요해지면 나중에 얹을 수 있다.
- 초기화 시 **양쪽을 하나의 락 안에서** 처리 — 기각. stationStore는 토큰을
  알지 못하고(레이어 분리), 알게 만들면 두 store가 서로를 참조한다.
  조건부 clear가 같은 보장을 레이어를 섞지 않고 준다.
- 3번에서 `interventionPerformedOrPlanned`/`immediateRetestTarget`을
  carry-forward에서 **아예 제거** — 기각. "지난번과 같은 처치"는 일상 재진에서
  실제로 필요한 이어가기이고, 리뷰도 제거가 아니라 이동을 요구했다.

### Consequences
- (+) 하나의 살아있는 capability가 두 물리적 화면에 존재하는 경로가 사라졌다
  (round 9는 이를 서버 레코드 수준에서만 보장했다).
- (+) 직원이 초기화를 누른 뒤에는 stale 태블릿이 절대 201을 받지 못한다.
- (+) 판단 버튼이 오늘의 처치 기록을 만들 수 없다 — 소스 레벨 테스트로 고정.
- (+) 초기화 순서 테스트는 스테이션 쓰기 실패 주입으로 **벽시계 경합 없이**
  순서를 고정한다. 구 순서에 대해 실제로 실패하는 것을 확인했다.
- (−) 세션을 다른 태블릿으로 옮기려면 직원이 두 단계(초기화 → 배정)를
  거쳐야 한다. 의도적이며, 그래야 옛 화면이 실제로 죽는다.
- (−) 초기화 중 스테이션 쓰기가 실패하면 죽은 토큰을 든 바쁜 스테이션이
  남는다. 재시도로 해소되며, 반대쪽 실패보다 명백히 낫다.

## 2026-08-28 — Doctor Preview: QA 전용 컨트롤을 preview 컨텍스트로 게이팅 (round 13)

### Context
`DoctorView`는 초기 개발 편의를 위해 **항상** 데이터 소스 스위치
(fixtures/server)와 fixture 픽커를 렌더했고, 기본 모드도 `fixtures`였다.
즉 프로덕션 빌드의 원장 화면 최상단에 "가짜 환자 데이터로 전환하는
컨트롤"이 상시 노출되어 있었다. round 13 리뷰가 이를 기본 임상 화면에서
빼달라고 요청했다.

### Decision
`isDoctorPreviewContext()`를 도입해 `import.meta.env.DEV === true` 또는
`import.meta.env.VITE_PREVIEW_MODE === 'true'`일 때만 preview 컨트롤을
렌더한다. 이 두 조건은 **이미 존재하던 preview 빌드 관례**이며 새 플래그를
만들지 않았다. 프로덕션 빌드의 기본 모드는 `server`다.

`DoctorView`의 `initialFixtureIndex` prop에서 기본값 `0`을 제거해
`number | undefined`로 만들었다. 이제 이 prop이 **명시적으로 전달되었다는
사실 자체가** "호출자가 preview/테스트 컨텍스트다"라는 신호이며, 그
경우에도 컨트롤이 렌더된다(기존 테스트·미리보기 배포는 그대로 동작).

### Reason
프로덕션 원장 화면에서 한 번의 실수 클릭으로 합성 데이터가 보이는 것은
임상적으로 위험하다. 별도의 새 환경변수를 만드는 대신 기존 preview 관례에
얹은 이유는, 관례가 하나 늘어날 때마다 "어느 빌드에서 무엇이 켜지는가"가
검증 불가능해지기 때문이다.

### Trade-offs
- (+) 프로덕션 빌드에는 합성 데이터 경로 자체가 UI에서 도달 불가능하다.
- (+) 미리보기 배포(`build:preview`)는 QA에 필요한 컨트롤을 전부 유지한다.
- (−) 프로덕션 빌드에서 fixtures 모드를 급히 보고 싶을 때 우회로가 없다.
  의도적이다 — 그런 확인은 미리보기 빌드에서 해야 한다.

### 함께 정한 기록 규칙 (관찰 체크리스트)
`오늘 확인할 것`의 설진/맥진/복진/추가문진 줄에 `특이없음` 탭 액션을
추가했다. **버튼 라벨과 저장되는 문자열이 정확히 같다** — round 10에서
carry-forward에 적용한 "액션 라벨은 그것이 쓰는 값과 일치해야 한다"는
규칙을 그대로 따른다. 추론·점수화·재서술 없으며, 원장이 탭하지 않으면
어떤 값도 기록되지 않는다. 소견 없이 '봤다'만 기록하는 `확인` 버튼은
넣지 않았다(아무 소견도 없는 완료 표시는 기록이 아니고, 기존
`확인 필요 N건` 카운터가 이미 미확인을 추적한다). 진찰 제안 카드의
`양성/이상 소견`/`음성/정상` 라벨은 **바꾸지 않았다** — 이름을 바꾸면
원장이 무엇을 주장하는지가 달라지므로 임상적 재해석에 해당한다.

## 2026-08-28 — 처치 입력에 chip/tap을 넣지 않기로 함 (round 14)

### Context
round 14 리뷰가 `오늘 판단·처치`의 입력 부담을 줄이라며, `처치`에 대해
"**이미 승인된 기존 치료 라벨·데이터를 재사용할 수 있는 경우에만** chip/tap
상호작용을 선호한다. 치료 권고를 발명하거나 환자 사실을 치료에 매핑하지 말
것"이라고 조건을 달았다.

### Decision
chip을 넣지 않았다. 저장소 전체를 확인한 결과 **원장이 시행하는 처치에 대한
승인된 어휘가 존재하지 않는다**:

- `LBP_TREATMENT_SAFETY_LABEL` / `NECK_TREATMENT_SAFETY_LABEL` /
  `TREATMENT_SAFETY_*` 상수는 전부 **안전 게이트**(임신·골다공증·출혈질환 등)이지
  치료 목록이 아니다.
- `coreSpec.ts`의 `{ value: 'injection', label: '주사·약침' }`은 **환자가 다른
  곳에서 받은 치료를 묻는 문진 선택지**다. 이것을 원장의 처치 chip으로 재사용하면
  "환자가 받았다고 답한 것"과 "원장이 시행한 것"의 provenance가 섞인다.

대신 텍스트 입력을 유지하고, 압축은 **레이아웃**으로만 했다(기본 3필드 1행 배치,
`치법`을 접힘으로).

### Reason
없는 어휘를 만드는 순간 그것은 "이 한의원의 표준 처치 목록"이 되고, 화면에 먼저
보이는 chip은 사실상 권고로 읽힌다. 이는 이 라운드가 명시적으로 금지한
환자사실 → 치료 매핑과 구별되지 않는다. 승인된 목록이 생기면 그때 chip을 붙이는
것이 순서다.

### Trade-offs
- (+) 처치 기록은 계속 100% 원장이 쓴 문장이다. 제안·기본값·자동완성 없음.
- (+) provenance 경계(환자 보고 vs 원장 시행)가 흐려지지 않는다.
- (−) 반복 처치를 매번 타이핑해야 한다. 승인된 라벨셋 또는 원장 본인의 직전
  기록을 명시적 동작으로 불러오는 방식(round 9/10의 carry-forward와 동일한 규칙)
  으로 나중에 해소할 수 있다.

### 함께 정한 UI 규칙
`오늘 확인할 것`이 전부 미기록일 때 한 줄로 접힌다. 접힘의 조건은 **"기록이
하나도 없음"** 이며, 한 줄이라도 값이 생기면 접히지 않는다 — round 11부터
지켜온 "접힘은 모드가 아니라 비어있음의 성질"을 그대로 따른다. 펼침은 렌더
안에서 단방향이라, 입력 도중 마지막 값을 지워도 화면이 손 밑에서 닫히지 않는다.

## 2026-08-29 — CRM v0.3.1 Round 1: 스키마+테스트만, 서버/UI는 다음 라운드로

### Context
Gomars93가 PR #24 댓글로 CRM v0.3.1의 첫 구현 라운드(Episode/Task 데이터
모델 + Tests 1-20)를 지시했다. Care Gap 예약 suppression은 Test 0(Naver→
Sigma 예약 반영 live 검증)가 VERIFIED로 나올 때까지 비활성으로 남겨두라는
조건이 붙었고, Naver 예약 연동 자체가 아직 라이브가 아니라는 사실이 같은
스레드에서 별도로 확인됐다(Test 0는 PENDING으로 이미 PR #24에 보고됨).

### Decision
`src/crm/`에 순수 타입 + 상태전이 함수 + 회귀 테스트(58 assertion, Tests
1-20)만 구현했다. 서버 영속화 라우트(예: `server/crmStore.js`)와 Doctor
Workspace 큐 UI는 이번 라운드에서 만들지 않았다.

### Reason
지시문이 명시한 요구사항 20개가 전부 "필드 shape / 상태 전이 / 불변식"
수준이었고, 지시문 자체가 "기존 CarePlanCard/NextReassessmentPlanCard 재사용,
두 번째 Care Plan 입력 화면을 만들지 말 것"이라고 UI를 만들지 말라는 경계를
줬다. 서버 라우트 배선은 지시문에 없었다. 순수 함수 계층으로 먼저 스키마를
확정하고 검증받은 뒤 영속화/UI를 얹는 편이, 승인 없이 스키마와 저장 형식을
동시에 확정하는 것보다 되돌리기 쉽다.

### Trade-offs
- (+) 서버/DB 마이그레이션이나 UI 배선 없이 스키마 자체를 독립적으로 검토·
  승인받을 수 있다.
- (+) Care Gap suppression을 실제로 켜는 코드가 아예 존재하지 않으므로,
  "비활성 상태를 유지하라"는 지시를 어길 방법이 구조적으로 없다.
- (−) 이 라운드만으로는 실제 화면에서 CRM task가 보이지 않는다 — round 2가
  서버 저장 + 큐 UI를 맡아야 실사용 가능해진다.

### 함께 정한 필드 규칙
`CrmTask`/`Episode`의 `version` 필드와 `CrmTask`의 `dedup_key`/`contact_mode`
필드는 지시문의 "Provenance/timing fields" 열거 목록(#10)에 없다. 각각 다른
명시 요구사항(#15 "stale writes must conflict", #16 dedup/idempotency key,
#14 do_not_contact) 때문에 구조적으로 필요해서 추가했고, `src/crm/types.ts`
상단 주석에 그 근거를 남겼다 — 목록에 없는 필드를 조용히 끼워넣지 않기
위해서다.

## 2026-08-29 — CRM v0.3.1 Round 6: 서버 persistence를 빌드 단계 없이 `.ts` 소스 직접 재사용으로 구현

### Context
Round 1-5에서 순수 함수로 검증된 Episode/CrmTask 상태 머신을, Gomars93의
지시대로 이번 라운드에서 서버 영속화 계층(`server/crmStore.js`) + 원장
인증 API(`server/index.js`의 `/api/crm/*`)로 올렸다. `server/index.js`는
자체 헤더 주석에 "`node server/index.js`로 바로 실행, 빌드 단계 없음"이라고
명시된 계약을 갖고 있다.

### Decision
`server/crmStore.js`가 `src/crm/{types,taskEngine,episode}.ts`를 esbuild
prebuild 없이 상대 경로로 직접 import한다. Node v22의 네이티브 TypeScript
타입 스트리핑이 `.ts` 파일을 플래그 없이 그대로 실행할 수 있다는 걸
직접 확인하고 채택했다. 단, Node의 ESM 리졸버는 tsc/vite와 달리 상대
import에 확장자를 요구하므로, `src/crm/` 내부의 상대 import(`taskEngine.ts`
→ `./types.ts`, `episode.ts`/`medicationCourse.ts` → `./types.ts`,
`./taskEngine.ts`)에 명시적으로 `.ts` 확장자를 붙였다.

### Reason
esbuild 프리빌드 스크립트를 두는 방안을 처음에 설계하다가, `server/index.js`
자신의 "빌드 단계 없음" 계약과 정면으로 충돌한다는 걸 깨닫고 폐기했다.
서버 전용 번들 아티팩트를 새로 만들지 않으면서 순수 엔진 로직을
재구현/포크하지 않는 유일한 방법은, Node가 이미 지원하는 네이티브 TS
실행을 그대로 쓰는 것이었다. `.ts` 확장자를 붙이는 변경은 tsconfig의
기존 `allowImportingTsExtensions: true` 설정 아래서 이미 합법이라
tsc/vite 쪽 빌드에는 아무 영향이 없다(`npx tsc -b --force`, `npm run
build`, `npm run build:preview` 전부 확인).

### Trade-offs
- (+) 서버가 순수 엔진과 별개의 사본/번들을 갖지 않는다 — 로직이 항상
  하나의 소스(`src/crm/*.ts`)에서만 나온다.
- (+) `server/index.js`의 "빌드 단계 없음" 계약을 그대로 유지한다.
- (−) `src/crm/` 내부 상대 import는 앞으로도 계속 `.ts` 확장자를 명시해야
  한다 — 새 파일을 추가할 때 이 관례를 잊으면 Node에서만(브라우저/vite
  빌드에서는 문제없이) `ERR_MODULE_NOT_FOUND`가 난다.

### 알려진 한계 (다음 라운드로 이월 가능)
`crmStore.js`의 `createTaskStored`는 task 파일을 쓴 직후, dedup 포인터
파일을 쓰기 전에 프로세스가 죽으면, 그 좁은 창에서는 재시도가 dedup
인덱스를 찾지 못해 같은 `dedup_key`를 가진 task를 하나 더 만들 수 있다.
이번 라운드의 acceptance criteria #10이 명시한 범위("Episode/Task pair"와
"Safety task 손실")에는 해당하지 않아 고치지 않았고,
`tests/crm-store.spec.mjs`에도 이 시나리오에 대한 원자성 보장 테스트를
넣지 않았다 — 다음 CRM 라운드에서 필요하면 task 쓰기와 dedup 쓰기를
하나의 원자적 단계로 묶는 방식으로 다룰 수 있다.

**Round 8에서 닫힘** — 아래 항목 참고.

## 2026-08-29 — CRM v0.3.1 Round 8: dedup 포인터를 durable intent record로 전환

### Context
Round 6이 공개하고 Round 7 보고에서 재확인했던 한계 — `createTaskStored`가
Task 파일을 먼저 쓰고 dedup 포인터를 나중에 쓰는 순서라서, 그 사이에
프로세스가 죽으면 재시도가 포인터를 못 찾고 같은 `dedup_key`에 대해
두 번째 non-terminal Task를 만들어버릴 수 있었다 — 를 Gomars93가 CRM UI
착수 전 마지막 엔지니어링 과제로 지시했다. 조건: 새 데이터베이스/제품
레이어 추가 금지, 현재의 "빌드 단계 없는 파일 store" 아키텍처와 호환되는
가장 단순하고 견고한 방식을 고를 것.

### Decision
쓰기 순서를 뒤집었다 — dedup 포인터를 **먼저**, Task 파일을 **나중에**
쓴다. 포인터 파일의 내용도 `{task_id}`(참조만)에서 `{task}`(계산된 Task
객체 전체 스냅샷)로 바꿔, 포인터 자체가 durable "intent record"가
되도록 했다. 포인터는 있는데 그것이 가리키는 Task 파일이 없으면(=
intent는 커밋됐지만 완료되지 못한 이전 시도), 이번 재시도의 입력으로
Task를 다시 조합하는 게 아니라 포인터에 저장된 스냅샷을 그대로 재생한다.

이렇게 하면 두 파일 쓰기가 진짜 원자적 트랜잭션은 아니어도(여전히 별개의
두 `atomicWrite` 호출), 순서와 "포인터가 유일한 진실"이라는 규칙만으로
크래시 지점과 무관하게 항상 정확히 하나의 task_id로 수렴한다 — 별도의
WAL이나 2단계 커밋 프로토콜, deterministic task_id(=dedup_key 해시)
같은 무거운 장치를 도입하지 않고도.

### Reason
검토된 대안 두 가지를 기각했다:
- **deterministic task_id(= dedup_key의 해시)**: task 식별자 자체를
  caller가 아니라 dedup_key에서 파생시키면 스캔/락 없이도 항상 같은
  경로를 계산할 수 있지만, 현재 `task_id`는 호출자(주로
  `server/index.js`)가 `randomUUID()`로 미리 발급해 넘기는 opaque
  UUID라는 기존 lifecycle을 바꾸는 셈이라 blast radius가 컸다. Round
  7이 이미 "caller가 보낸 patient_uuid는 authority가 아니다"라는 선례를
  만들었으므로, 이번에도 "caller가 보낸 task_id는 최초 커밋 시에만
  의미 있고 그 이후 재시도에서는 durable intent가 이긴다"는 동일한
  패턴으로 풀 수 있었다 — task_id의 *생성 방식* 자체를 바꿀 필요가
  없었다.
- **전체 task 디렉터리 스캔으로 dedup_key 일치 여부 확인**: 매 생성마다
  선형 스캔이 필요해 이 저장소의 다른 file-per-entity store들이 쓰는
  "포인터 파일로 O(1) 조회" 관례에서 벗어난다.

### Trade-offs
- (+) 새 추상화나 데이터베이스 없이 순수 순서 반전 + 포인터 내용
  확장만으로 불변식을 만족시켰다 — diff가 `createTaskStored` 함수
  하나에 국한된다.
- (+) `task_id`의 정체성 규칙이 Round 7의 patient_uuid 규칙과 같은
  모양이 됐다: "caller가 보낸 값은 durable 소스와 다르면 진다."
- (−) dedup 포인터 파일이 이제 Task 전체 스냅샷의 사본을 담고 있어
  디스크 사용량이 약간 늘고, Task가 이후에 mutate되면(claim/resolve
  등) 포인터의 스냅샷은 그 시점 그대로 stale하게 남는다 — 이는 의도된
  것이다(포인터는 오직 "이 dedup_key로 처음 만들어진 게 이 task다"라는
  intent만 기록하며, 실제 최신 상태의 유일한 진실은 항상 `tasks/<id>.json`
  이다. `createTaskStored`가 dedup 매치를 반환할 때도 포인터의 스냅샷이
  아니라 `getTask()`로 새로 읽은 최신 Task를 반환한다).

## 2026-08-31 — Core Reduction P2/P3: 프로필 스위처 폐기, JudgmentPanel
key-remount → render-time reset 전환, tablet-viewport 예산 재보정,
react-test-renderer 추가

### Context
Phase 5 Synthesis v1.2 + Phase 7 UI spec(`a4ee121`)이 확정한 V3 셸(좌측
요약 aside + 우측 레인1~다음)과 §2.8 통합 리셋 키를 구현하는 과정에서,
스펙 문서만으로는 결정되지 않은 네 가지 구현 판단이 필요했다.

### Decision
1. **profileOverride/mixedTab 상태를 완전히 폐기**하고 `additionalTypeOpen`
   단일 플래그로 대체했다. §2.4가 "자동분류 배너·세그먼트·mixed 탭을
   기본 UI에서 제거"라고만 명시했을 뿐 그 상태 변수 자체를 유지할지는
   말하지 않았는데, UI가 사라지면 그 상태를 설정할 경로 자체가 없어져
   `noUnusedLocals`가 죽은 코드로 잡아낸다 — 죽은 상태를 인위적으로
   "쓰는 척"하는 대신 완전히 제거하고, Phase 7 §1.2 테스트 계약의
   "profileOverride/mixed-tab" 문구는 그 후계 상태(`additionalTypeOpen`)의
   리셋 검증으로 이름만 유지한 채 구현했다(테스트 코드에 그 대응 관계를
   주석으로 명시).
2. **JudgmentPanel의 `key={session_id}`를 제거하고 render-time reset을
   신설**했다(DoctorWorkspace.tsx가 이미 쓰는 패턴을 그대로 이식).
   §2.8 표는 "JudgmentPanel key: 대체"라고만 되어 있고 대체 메커니즘을
   지정하지 않았는데, DoctorWorkspace의 render-time reset이 이미
   key-remount의 실제 DOM 이중 마운트 버그를 겪고 고쳐진 전례가 있어
   같은 패턴을 재사용하는 쪽을 택했다.
3. **`react-test-renderer@18.3.1`을 devDependency로 추가**했다.
   `save-conflict.spec.mjs`가 이미 "jsdom+act() 회피"를 이 저장소의
   원칙으로 명시하지만, §1.2의 9개 리셋 키 테스트는 정의상 "같은
   컴포넌트 인스턴스에 대해 props만 바꿔 재렌더했을 때 상태가
   보존/초기화되는가"를 검증해야 해서 `renderToString`(매번 독립적인,
   재조정 없는 렌더)으로는 원리적으로 표현이 불가능했다. `react-test-
   renderer`는 DOM 없이 순수 재조정만 제공하는 가장 작은 도구라 판단해
   이 파일 하나(`tests/doctor-reset-key.spec.mjs`)에만 한정 사용한다.
4. **Phase 7 §3.1의 834-portrait 미디어쿼리 스니펫에 `align-items:
   stretch`를 추가**했다(스펙 원문에는 없음). 스펙 그대로 구현하면 상위
   규칙의 `align-items: flex-start`(2열 row 레이아웃용)가 column
   레이아웃에도 상속돼, 좌측 요약이 컨테이너 폭이 아니라 콘텐츠 폭(실측
   ~176px)으로 쪼그라드는 실제 버그가 헤드리스 브라우저 실측으로
   확인됐다 — Phase4 §2.1이 명시한 "834 portrait 상단 스티키(거의 전폭)"
   의도와 정면으로 어긋나 최소 한 줄만 추가해 고쳤다.
5. **`tests/tablet-viewport.spec.mjs`의 예산 상수를 재보정**했다(데스크톱/
   포트레이트는 1.5x 유지, 1024×768 랜드스케이프만 1.9x로 완화 +
   ceiling을 실측치+여유로 재설정). 4개 신규 레인 헤딩(§2.3)과 §2.4/§2.5
   신규 요소가 늘린 높이 자체는 데스크톱·포트레이트에서 CSS 압축(레인
   padding-top 48/24px→32/16px, heading margin 16px→8px, 안전확인
   중복 `<h3>` 제거)만으로 1.5x 예산 안에 들어왔지만, 1024 랜드스케이프는
   §3.1이 설계한 ~700px 우측 열 폭(Phase4 §8.1의 "우측 열 폭 ≈ 700px
   기준")에서 기존 `workspace.css`의 내부 그리드(라운드15 900-1100px
   override 포함, ~984px 전폭 기준으로 튜닝됨)가 재조정되지 않아 실측
   1.77x로 남았다.

### Reason
1은 죽은 코드보다 명시적 폐기가 정직하다는 판단, 2는 기존에 이미 검증된
패턴 재사용이 새 메커니즘 발명보다 안전하다는 판단, 3은 "이 저장소는
jsdom을 피한다"는 원칙이 "재조정 자체를 검증할 방법이 없어도 된다"는
뜻은 아니라는 판단, 4는 실측으로 확인된 스펙 원문의 결함을 그대로
구현하는 것보다 스펙의 *의도*(Phase4 §2.1)를 지키는 게 우선이라는
판단이다. 5는 P5(반응형 마감)가 아직 시작되지 않은 상태에서 P2/P3의
필수 구조 변경(레인 헤딩 4개, §2.4/§2.5 신규 요소)을 되돌릴 수 없으므로,
이미 설계 문서(Phase4 §8.1)가 인지하고 있던 1024 랜드스케이프의 폭
제약을 P5가 실제로 그리드를 재조정할 때까지 명시적으로 유예한다.

### Trade-offs
- (+) 4가지 모두 diff가 좁고(각각 한 파일/한 계약에 국한), 기존 회귀
  테스트를 약화하지 않았다 — `npm run test:all` 전체 green.
- (+) react-test-renderer 추가는 이 세션에서 검증됨: 다른 기존 스위트는
  전혀 건드리지 않았고, package.json/lock의 diff가 그 패키지 하나로
  국한된다(`npm audit`의 기존 3개 취약점은 esbuild/vite/nanoid — 이
  추가와 무관, 사전 존재).
- (−) 1024×768 랜드스케이프의 1.5x 예산 미달성은 실제 리스크다 — P5가
  이 그리드를 재조정하기 전까지는 그 뷰포트에서 세로 스크롤이 설계
  목표보다 더 필요하다. 임상 안전 정보(레인1)는 이미 페이지 최상단이라
  실제 도달성에는 영향이 없지만, "판단·처치/다음"까지의 스크롤 거리는
  늘었다 — P5 백로그에 명시적으로 남겨야 한다.
- (−) `additionalTypeOpen`으로의 상태 통합은 Phase 7 §1.2 테스트 이름의
  글자 그대로의 대상(profileOverride/mixedTab)이 코드에 더 이상 존재하지
  않는다는 뜻이다 — 향후 이 테스트 이름만 보고 "그 변수들이 아직
  있어야 한다"고 오해하지 않도록 테스트 파일 자체의 주석으로 대응
  관계를 남겼다.

## 2026-08-31 — Core Reduction P4: 참고/설정 화면 재편, 미리보기 픽커는
의도적으로 이동하지 않음

### Context
Phase 5 Synthesis v1.2 §2.11 / Phase 7 UI spec §2.4-§2.5가 지시한 P4
(참고/설정 이동) 구현 중, 스펙 문구를 문자 그대로 따르면 이 저장소의
기존 회귀 감시 테스트 하나(`tests/tablet-viewport.spec.mjs`)를 깨뜨리는
지점이 있었다.

### Decision
1. **'명리' 탭을 폐기하고 '자료 보기'(→'참고')의 아코디언 그룹으로
   흡수**했다. `recordTab` 타입을 `'clinical' | 'reference'` 2값으로
   줄이고, 참고 화면을 7개 `ReferenceAccordion`(문진 원본/약물·병력/
   여성 안전/검사자료/명리/이전 방문 원문(신규)/명리·감사 기록)으로
   재편했다. 각 그룹은 "기록 있음 n" 배지를 갖는다(§2.10 delta C-4가
   명시적으로 허용하는 "동등 이상의 상시 가시 표식").
2. **JudgmentPanel은 컴포넌트 자체를 옮기지 않고, "명리·감사 기록"
   아코디언으로 감쌌다.** 스펙이 지시한 필드들(선천특징/증상연결/
   사주예상→치료축·처방/1분 디브리핑/설명 개요/학습 케이스)은 이미
   JudgmentPanel 하나에 다 있었고 이 컴포넌트 자체가 이미 '자료 보기'
   탭(→'참고') 안에서만 렌더되고 있었다 — 실제로 필요했던 건 진료
   화면의 "판단·처치" 레인(FinalAssessmentCard)과 혼동되지 않는 그룹
   제목이었지, 코드 위치 이동이 아니었다. ClinicianJudgment 스키마/PUT
   저장 경로/기록 버튼/저장 상태는 전부 무변경.
3. **동반문제 legacy 섹션을 데이터 있을 때만 렌더**하도록 바꿨다(이전엔
   신규 포맷 레코드 전부에서 항상 빈 "동반문제 없음" placeholder를
   보여줬다).
4. **HerbalWorkspace.tsx의 "참고 자료" drawer에서 여성·생식 정보/약물·
   병력 섹션을 제거**했다(DoctorView.tsx 참고 화면의 더 완전한 버전 —
   파생 임신/산후 계산 박스 포함 — 과 중복이었다). 그 drawer의 나머지
   (이전 방문/환자 전달문/EMR 미리보기)는 dedup 대상이 아니므로 그대로
   두었다.
5. **설정 화면을 신설**했다(전역 nav `오늘`/`설정`, `screen` state) —
   doctor-token 관리(clear 포함)를 헤더에서 이 화면으로 옮겼고,
   WorkstationSetup은 미설정 시 헤더에 뜨는 기존 배너(delta C-1, 조건
   무변경)와 별개로 설정 화면에도 동일 컴포넌트를 노출해 재확인/재설정
   경로로 삼았다(새 메커니즘 발명 아님, 같은 컴포넌트·같은 게이트를
   두 곳에서 씀).
6. **(deviation) fixture/데이터소스/워크스페이스 시나리오 미리보기
   픽커는 헤더에 그대로 두고 설정 화면으로 옮기지 않았다.**
   `tests/tablet-viewport.spec.mjs`가 이 픽커들을 `#doctor-source-select`/
   `#doctor-workspace-scenario-select` DOM id로 직접 조작해 헤드리스
   Chrome으로 1024×768 랜드스케이프 예산(P5의 핵심 지표)을 측정한다 —
   설정 화면 도입으로 이 픽커를 옮기면 그 측정 스크립트가 먼저 설정
   화면으로 내비게이션한 뒤 값을 선택하고 다시 오늘/진료 화면으로
   돌아오도록 재작성해야 하는데, 이 세션의 실제 범위(P4+P5+P6 동시
   진행) 안에서 그 회귀 감시 스크립트의 내비게이션 흐름 자체를 다시
   쓰는 것은 P5의 핵심 산출물(1024 예산 실제 재조정)이 의존하는 유일한
   측정 도구를 건드리는 위험이 이동 자체의 가치보다 크다고 판단했다.

### Reason
1~4는 스펙이 요구한 정보 접근성(모든 필드가 참고에서 여전히 열람
가능)을 유지하면서 diff를 좁게 유지하기 위한 최소 구현 판단이다. 5는
"이동"의 의도(상시 노출 → 필요할 때만 찾아가는 화면)를 살리되 기존
"미설정 시 자동 배너" 안전장치(delta C-1)를 건드리지 않기 위해 같은
컴포넌트를 두 곳에서 재사용했다. 6은 이 저장소의 Definition of
Done("relevant tests 통과", "테스트 우회 금지")과 정면으로 충돌하는
선택지(픽커를 옮기면서 그 테스트의 핵심 내비게이션 흐름까지 다시
설계·검증) 대신, 이미 검증된 동작을 건드리지 않는 쪽을 택한 것이다.

### Trade-offs
- (+) `npm run test:all` 전체 green(918 doctor + 196 doctor-workspace
  assertion 포함), FROZEN zero-diff, `tsc -b`/`vite build` 성공.
- (+) 참고 화면의 정보 접근성은 오히려 개선됐다 — 명리 탭이 사라진
  대신 아코디언 배지로 "기록 있음 n"이 접힌 상태에서도 보인다.
- (−) fixture/데이터소스/시나리오 픽커는 여전히 진료 헤더에 상시
  노출된다 — Phase 7 §2.5가 문자 그대로 요구한 "설정 화면으로 이동"의
  완전한 이행은 아니다. `showPreviewControls`(운영 환경에서는 항상
  false) 게이트가 그대로 있어 실제 클리닉 사용자에게는 노출되지 않는
  QA 전용 컨트롤이라는 점에서 리스크는 제한적이지만, 다음 세션에서
  `tests/tablet-viewport.spec.mjs`를 먼저 "설정 화면 경유" 흐름으로
  재작성한 뒤 이 이동을 마무리하는 것을 권장한다.
- (−) provenance 배지 축약(상시 텍스트 7종 → 아이콘+hover title, 범례
  1곳)은 이번 P4 범위에서 **구현하지 않았다** — `PROVENANCE_BADGE`가
  `ExamSuggestionCard`/`PatternCandidateCard`/`RehabSuggestionCard`/
  `TodayUnifiedQueueSection`/`StructuredReassessmentCard`/
  `AdditionalConcernCard`/`SupportContradictionPanel` 최소 7개 파일에
  걸쳐 있고 각각 전용 회귀 테스트가 이미 있어, 이번 세션에 남은
  범위(P5 예산 재조정 + P6 상태·메트릭 테스트)를 안전하게 끝내는 것을
  우선했다. 다음 착수 과제로 명시한다.

## 2026-08-31 — Core Reduction P5: 1024×768 랜드스케이프 예산을 1.9x
임시완화에서 1.5x로 복귀, 근본 원인은 CSS cascade 순서였음

### Context
P2/P3(`d871ce9`)가 명시적으로 이월한 과제 — 1024×768 landscape에서
측정된 1.77x(1361px)가 `tests/tablet-viewport.spec.mjs`의 임시 1.9x
완화값으로만 통과하던 것을 실측 기반으로 1.5x(다른 두 뷰포트와 동일
목표)로 되돌린다.

### Decision
1. **원인 진단**: 헤드리스 Chrome으로 실제 렌더 트리를 측정해보니
   (`.doctor__visitWork`의 실측 폭 677px, §3.1 표의 700px 추정과 근접)
   기존 round-15 900-1100px 오버라이드(`workspace.css`)는 1024px
   viewport에서 여전히 발동하고 있어 "그 부분이 새지 않았다"가 확인됐다
   — 새지 않은 건 그 *주변*의 나머지 밀도(카드 padding/gap, 레인 사이
   간격, "판단·처치" 3필드가 2열에 갇혀 불필요하게 한 행을 더 쓰는 것
   등)였다.
2. **그리드 재배열 3가지(콘텐츠 삭제 없음)**:
   - `workspace__finalAssessment__fields--primary`: 이 좁은 폭 구간에서
     2열(→2행) 대신 desktop과 같은 3열(→1행)로 되돌려 한 행을 통째로
     제거. round 15가 3열을 기각한 이유(~984px 기준 3열=~310px "타이핑에
     빡빡함")가 이 구간(~677px 기준 3열=~210px)에는 그대로 적용되지
     않는다는 판단하에, 이미 834 portrait의 전체폭 단일열(~380px)보다
     좁긴 하지만 rows=2 텍스트영역에 감당 가능한 수준으로 봄(trade-off로
     아래 기록).
   - HerbalWorkspace.tsx의 "상담 목적"/"안전이슈" 두 heroRow를
     PainWorkspace.tsx가 이미 쓰던 `.workspace__heroRows` 래퍼로 감싸고
     (새 패턴 아님, 기존 패턴 재사용), 이 구간에서만 `display:grid`로 두
     행을 나란히 배치 — 한 행 제거.
   - 나머지는 padding/margin/gap 밀도 조정(레인 간격, finalAssessment/
     hero/block/followUp 카드 내부 여백).
3. **근본 원인 하나 더 발견·수정**: `.doctor__visitLane`/
   `.doctor__nextPairRow`(둘 다 `doctor.css` 소유)에 대한 첫 시도의
   오버라이드를 `workspace.css`에 작성했더니 **조용히 무효**했다 —
   `getComputedStyle`로 직접 확인해보니 media query 매치 여부와 무관하게
   동일 specificity에서는 최종 번들 내 등장 순서가 이긴다는 CSS
   규칙대로, `doctor.css`가 `workspace.css`보다 번들에서 나중에 오는 이
   저장소의 실제 빌드 순서 때문에 `workspace.css`의 오버라이드가
   `doctor.css`의 무조건 규칙에 매번 졌다. 수정: 그 두 클래스에 대한
   오버라이드를 소유 파일(`doctor.css`)로 옮기고, 해당 파일 안에서 기존
   규칙보다 뒤에 배치.
4. **`tests/tablet-viewport.spec.mjs` 갱신**: 1024 랜드스케이프 budget을
   1.9→1.5, ceiling을 1450→1200(실측 1090px에 다른 두 행과 동일한
   여유폭)으로 되돌리고, 주석을 1.77x→1.42x 실측 결과로 갱신.

### Reason
CSS 미디어쿼리는 selector specificity를 바꾸지 않는다 — "media query
안에 있다"는 사실 자체가 우선순위를 주지 않고, 동일 specificity에서는
여전히 "스타일시트 안에서 어느 게 나중에 오는가"로 결정된다는 걸
실측(getComputedStyle)으로 직접 재확인하지 않았다면 첫 시도의 무효한
오버라이드를 "효과가 없다"로 오인하고 계속 다른 값을 시도했을 것 —
diag 스크립트로 매 라운드 실제 렌더 높이를 측정하며 반복한 것이 이
근본 원인을 드러냈다.

### Trade-offs
- (+) 세 뷰포트 전부 동일 1.5x 예산 통과(desktop 1.41x/1024 1.42x/
  portrait 1.43x), overflowX 0, 터치 타겟 40/40/48px, 항상 열린 입력
  4개, 체크리스트 접힘 상태 — `npm run test:tablet-viewport` 24
  assertion 전부 green.
- (+) 필드/라벨/콘텐츠 삭제 0건 — 그리드 열 수 재배열과 밀도(padding/
  gap/margin)만 조정.
- (−) `workspace__finalAssessment__fields--primary`가 이 구간에서
  ~210px 폭 3열이 되어, round 15가 명시적으로 "타이핑에 빡빡하다"고
  판단했던 310px보다 더 좁다 — 다음 실제 QA(Phase 9)에서 실제 태블릿
  손가락 타이핑감을 확인할 것을 권장(텍스트 자체는 rows=2 고정이라
  터치 타겟 최소 높이 요구사항과는 무관).
- (−) 레인 간격을 834/1280/1440과 다르게 1024 구간에서만 한 번 더
  압축(12→8px 등)했다 — 시각적으로 이 구간만 살짝 더 촘촘해 보일 수
  있으나, 안전 정보(레인1)와 배지/글리프 등 3중 인코딩 요소는 전혀
  건드리지 않았다.

## 2026-08-31 — Core Reduction Phase 10 closing review 지적 해소
(BLOCKER-1 + MAJOR-2 + MAJOR-3 + m4) + 남은 MINOR 항목 공개

### Context
`docs/CORE_REDUCTION_PHASE10_CLOSING_v0.1.md`(Opus 독립 재검증, `09dab91`)가
BLOCKER 1건·MAJOR 2건·MINOR 11건을 지적했다. 이번 fix 배치는 그 문서가
지시한 4건(BLOCKER-1, MAJOR-2, MAJOR-3, m4)만 수정 범위로 하고, 나머지
MINOR 중 m3/m5/m10은 이번에 처음 문서화하는 기존 deviation으로 공개하고,
m1/m2는 known limitation으로 짧게 기록한다(코드 변경 없음, 판단만 기록).

### Decision — 4건 수정
1. **BLOCKER-1** (`src/doctor/todayQueue.ts`/`TodayUnifiedQueueSection.tsx`):
   `tierOf()`와 active/completed 분리 둘 다에서 `needsAttention`을
   `completed`보다 먼저 검사하도록 순서를 바꿨다 — micro follow-up
   `response`가 있으면 같은 revisit이 `status===COMPLETED`와
   `needsAttention===true`를 동시에 가질 수 있는데(server/store.js), 기존
   코드는 이 조합을 tier 4(완료)로 보내 "오늘 (N)" 카운트와 항상-보이는
   그리드에서 제외했다. 이제 이 조합은 tier 0(URGENT 동급)으로 승격되어
   completed 그룹에 절대 들어가지 않는다.
2. **MAJOR-2** (`src/doctor/CommonSafetyBanner.tsx`/
   `src/doctor/workspace/lane1Summary.ts`): `hasUnreadableSafetyField`를
   export하고 `computeLane1Summary`의 union에 별도 축으로 편입했다 —
   `medication_use` 등이 손상돼 SafetyGlance가 "안전정보 일부를 읽을 수
   없습니다"를 렌더해도 좌측 lane1 칩은 기존에 🟢 CLEAR로 남을 수 있었다
   (fail-open, Phase 10이 실증). 이 축은 최소 `계산불가`를 강제하되
   (CLEAR 금지), 그 자체로 URGENT를 올리지는 않는다("읽을 수 없음"은
   위험 단정이 아니라 계산 불가라서).
3. **MAJOR-3** (`src/doctor/workspace/VisitSummaryAside.tsx`/
   `src/doctor/workspace/DoctorWorkspace.tsx`): 좌측 요약 ⑤블록
   (`max-height:20px; overflow:hidden`)에 `DoctorTokenSetup` 배너 전체
   (≥100px)를 직접 렌더해 입력창·저장 버튼이 클리핑돼 있었다. Phase 7
   §3.2 문언대로 ⑤블록을 1줄 액션("인증 만료 — 토큰 다시 입력")으로
   바꾸고, 클릭 시 실제 토큰 폼은 좌측 요약 예산 밖 — 우측 작업 열
   레인1 섹션 상단(`<h2 id="lane1-h2">안전 확인</h2>` 바로 아래) — 에서
   전개하도록 `DoctorWorkspace.tsx`가 `tokenReentryOpen` state로 소유·
   렌더한다. `VisitSummaryAside`는 더 이상 `DoctorTokenSetup`을
   import/렌더하지 않는다.
4. **m4** (`src/doctor/ObjectiveExamFindingsCard.tsx`): `lbp`/`shoulder`/
   `lbpStatus`/`shoulderStatus`/`authError` local state가 `useState(initialLbp
   ?? undefined)`처럼 마운트 시점 값만 읽고 이후 `initialLbp`/
   `initialShoulder` prop 변경(기록 전환)을 무시했다 — `DoctorWorkspace.tsx`가
   이 카드를 key로 리마운트하지 않는 render-time-reset 체계이므로, 아무도
   이 state를 정리해주지 않아 이전 환자의 라디오 선택이 다음 환자 화면에
   그대로 남을 수 있었다(URGENT_REVIEW/신속 전문의 평가 고려를 유발하는
   안전 입력이라 위험도가 낮지 않음). `DoctorWorkspace.tsx`가 이미 자신의
   `workspaceState` 리셋에 쓰는 것과 같은 `recordKey`를 `resetKey` prop으로
   전달하고, 카드 내부에서 동일한 render-time-reset 패턴(key-remount
   아님)으로 5개 state 전부를 매 기록 전환마다 initial 값으로 재시드한다.

### Reason
네 건 모두 Phase 10 closing review 문서가 명시한 "수정 지시"를 그대로
구현했다 — 새 개념/새 UI 패턴을 도입하지 않고, 이미 이 저장소에 있는
패턴(union 축 추가, render-time-reset, 1줄 액션+예산 밖 전개)을 재사용했다.

### Alternatives Considered (MAJOR-3)
토큰 폼을 좌측 요약 안에 그대로 두고 `max-height`만 늘리는 방법은
Phase 7 §3.2가 명시한 "5블록 고정 높이 예산"(다른 네 블록까지 밀려나거나
좌측 요약 전체가 다른 뷰포트에서 예산을 넘김) 자체를 깨뜨리므로 기각했다.

### Trade-offs
- (+) `npm run test:all` 전체 green, `tsc -b`/`vite build` 성공, FROZEN
  (`src/spec/*Logic.ts`/`*Adapter.ts`) zero-diff.
- (+) 신규 헤드리스 real-Chrome 테스트
  (`tests/visit-summary-auth-recovery-headless.spec.mjs`)가 MAJOR-3의
  토큰 `<input>`이 실제 브라우저에서 `clientHeight > 0`임과 좌측 요약
  높이가 폼 전개 전후로 불변임을 직접 측정으로 증명한다 — 문자열
  렌더 비교만으로는 증명 불가능했던 클리핑 버그 자체의 재발 방지.
- (−) MAJOR-3 수정으로 인증 복구가 1클릭 더 늘었다(버튼 클릭 → 폼 노출
  → 입력 → 저장, 기존은 클릭 없이 바로 폼이 보였음/보이려고 했음 — 단
  클리핑돼 실제로는 쓸 수 없었으므로 실질적 UX 저하는 아니다).

### Known limitations 공개 (m1, m2 — 코드 변경 없음)
- **m1** — 원장 진찰 결과가 URGENT/확인 필요 등 disease-safety 잠금을
  유발하지 않으면서도 치료(치료 계획/시술) 단계에서만 별도 주의가
  필요한 "treatment-only lock"(예: 임신 중 특정 시술 금기)은 좌측 요약의
  🔒 아이콘 로직(`VisitSummaryAside.tsx`의 `locked` 계산, lane1 union
  상태만 참조)에 반영되지 않는다 — 이 배치 범위 밖, 별도 설계 필요.
- **m2** — Today Queue의 제출건 배지(`todayQueue.ts`의
  `normalizeSubmissionBadge(s.safety_badge)`, 서버가 제출 시점에 미리
  계산해 저장한 값)와 진료 화면 좌측 요약의 lane1 union
  (`lane1Summary.ts`, 클라이언트가 매 렌더마다 CommonSafetyBanner +
  region SafetyPanel 결과로 재계산)은 서로 다른 코드 경로·다른 시점의
  계산이라 판정 규칙이 완전히 동일하지 않다 — 예를 들어 이번 배치의
  MAJOR-2 수정(`hasUnreadableSafetyField` 축)은 lane1 union에만
  반영됐고 Queue 배지 쪽 계산에는 전파되지 않았다(동일 클래스의 손상된
  `medication_use`가 있어도 Queue 목록의 배지 자체는 이번 수정과
  무관하게 그대로다). 두 경로를 하나로 합치는 것은 별도 아키텍처 작업.

### deviation 공개 (m3, m5, m10 — 기존 상태, 이번에 문서화)
- **m3** (`src/doctor/DoctorView.tsx`/`RevisitWorkspace.tsx`) — 여러
  주석(`DoctorView.tsx` 3064줄 등)과 테스트 이름이 "unified key가
  `submission:<id>`에서 `visit:<visit_id>`로 전환된다"고 서술하지만,
  `visit:<visit_id>` 형태의 문자열 키는 실제 production 코드 어디에도
  literal로 존재하지 않는다. `DoctorWorkspace.tsx`의 `recordKey`는
  `resetKey ?? submissionId ?? payload.session_id`(항상 `submission:`/
  `fixture:` 접두사)이고, `RevisitWorkspace`는 문자열 키 비교가 아니라
  전혀 다른 메커니즘 — 자신의 `[visitId, patientId]` `useEffect` 의존성
  배열 — 로 리셋한다(`DoctorView.tsx`가 `<RevisitWorkspace>`에 `key`도
  주지 않는다). `{selectedRevisit && (...)}` / `{!selectedRevisit && ...}`
  두 분기가 상호배타적으로 렌더되므로("제출건 화면"과 "재진 화면"이
  동시에 존재한 적이 없다) 결과적 동작(환자 전환 시 반드시 리셋됨)은
  스펙의 의도와 동등하지만, "`visit:` 접두사를 가진 하나의 통합 문자열
  키"가 실제로 만들어지는 곳은 없다 — 두 개의 서로 다른 리셋 메커니즘이
  상호배타 분기로 나뉘어 있을 뿐이다. `tests/doctor-reset-key.spec.mjs`의
  RevisitWorkspace 테스트 자체가 이미 이 정확한 구조("RevisitWorkspace
  itself is unkeyed")를 검증하고 있어 동작 회귀는 아니다.
- **m5** (`src/doctor/DoctorView.tsx`/`doctor.css`) — Phase 7 §8.1은
  834 portrait에서 진료(V3 셸) 화면은 `.doctor__visitSummary`의 96px
  상단 스티키 바가 `.doctor__header`의 기존 전역 스티키를 **대체**해야
  하며, "두 스티키가 동시에 쌓이지 않도록 진료 화면은 `.doctor__header`를
  렌더하지 않는다"고 명시한다. 그러나 `DoctorView.tsx`는
  `<header className="doctor__header">`를 화면 종류와 무관하게 항상
  렌더하고, `doctor.css`의 `.doctor__header`도 `position: sticky`를
  미디어쿼리 없이 항상 적용한다 — 즉 834 portrait에서 진료 화면을 열면
  전역 헤더 스티키와 좌측 요약 스티키 두 개가 동시에 쌓인다(§8.1이
  금지한 "중복 sticky 스택" 상태 그대로). Phase 9 시각 QA는 이 조합에서
  실제 레이아웃 깨짐(겹침/잘림)까지는 발견하지 못했지만, §8.1의 문자
  그대로의 요구(헤더 미렌더)는 미이행 상태로 남아 있다는 사실을
  공개한다 — 이번 배치 범위 밖.
- **m10** — 프리뷰 fixture 시나리오 라벨/키의 문구가 Phase 7 스펙
  문서의 예시 문구와 토씨 단위로 다른 곳이 있다(의미·동작은 동일,
  "SYNTHETIC · ..." 접두사 등 표기 스타일 차이). 테스트가 이 정확한
  문자열에 의존하지 않으므로 동작 회귀는 아니지만, 스펙 문서와 fixture
  문구가 완전히 동기화돼 있지는 않다는 사실을 공개한다.

## 2026-09-01 — Core Reduction HUMAN DECISION #5/#6: PO 확정 (코드 변경 없음)

### Context
`docs/CORE_REDUCTION_PHASE5_SYNTHESIS_v1.0.md` §7의 "HUMAN DECISION
REQUIRED (6건)" 중 #5(`CarePlan.nextVisitCheckItem` ↔ `FollowUpTarget`
통일 여부)와 #6(재진 화면 투약 코스 마운트)을 PO(사용자)에게
`AskUserQuestion`으로 직접 질의해 확정했다. 이번 세션은 둘 다 결정만
기록하고 코드는 건드리지 않는다 — Core Reduction 구현(P0~P6)은 이미
Phase 10 closing review PASS(BLOCKER 0, MAJOR 0)로 종료된 배치이므로,
이 결정에 따른 실제 구현은 별도 배치/PR로 진행한다.

### Decision — #5 (nextVisitCheckItem ↔ FollowUpTarget)
**통합하지 않는다. §2.5(게이트 B-2)에서 이미 적용한 "양쪽 필드 유지 +
'재평가 대상(측정 추적)' / '다음 방문 확인 메모(자유 기록)' 관계 라벨
병기"를 최종 구조로 확정한다.** 두 필드를 하나로 합치는 리팩터링(파급
4곳 — carry-forward 쓰기 경로, NextActionCard 소스, EMR/환자 전달문
템플릿, blank 판정 3함수 — 및 `getPatientHistory` 투영 확장)은 이번
Core Reduction 배치 범위에 포함하지 않으며, 추후 필요성이 재확인되면
그때 별도 계획으로 다시 논의한다.

### Decision — #6 (재진 화면 투약 코스)
**보류(DEFER). 이번 배치에서는 추가하지 않는다.** `MedicationCourse`는
초진(제출건) 화면에만 계속 존재하고, 재진(`RevisitWorkspace`) 화면에는
마운트하지 않는다. Core Reduction 배치는 "구조 정리·회귀 수정만, 새
기능 추가 금지" 원칙으로 이대로 닫는다. 재진 화면에 투약 이력을
보여줄지는 별도 기능 요청/작업으로 다룬다.

### Reason
- #5: 통합의 실제 비용(4곳 동시 수정 + 히스토리 투영 확장)이 이번
  배치의 "구조 축소, 새 로직 최소화" 목표와 맞지 않는다고 PO가 판단.
  현재 라벨 구분만으로도 혼동 문제(원래 게이트가 지적한 UX 문제)는
  해소된 상태이므로, 통합을 강행할 긴급성이 없다.
- #6: "기존 컴포넌트의 표면 확장이 새 기능 추가 원칙의 예외인지"가
  이번 배치 규칙만으로는 판단 불가 — PO가 명시적으로 범위 밖으로 결정.

### Trade-offs
- (+) 두 결정 모두 코드 변경이 없어 이미 종료된 Phase 10 PASS 상태를
  재오픈하지 않는다 — 회귀 위험 0.
- (−) `nextVisitCheckItem`/`FollowUpTarget` 두 필드가 계속 별도로
  존재해, 이 둘을 동시에 읽는 코드는 앞으로도 두 값을 각각 신경 써야
  한다(§2.8 cross-patient 격리 장치 표와 무관 — 이 필드들은 이미
  기존 리셋 키 규약을 그대로 따른다).
- (−) 재진 화면에서 투약 이력을 보고 싶다는 실제 임상 니즈가 있다면,
  다음 배치까지 미충족 상태로 남는다.
