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
