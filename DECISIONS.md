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
