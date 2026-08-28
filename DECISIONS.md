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
