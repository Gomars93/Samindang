# Current Handoff

## Objective
**Doctor View 전면 재설계 — 디자인/UX 스펙 단계 (코드 구현 없음).**
사용자가 제시한 redesign 의뢰서(10초 가독성, 4-level hierarchy, 상용 의료 SaaS
품질)에 따라, 의뢰서의 모델 협업 흐름 **Fable 설계 → Opus 독립 critique → Fable
최종 revision**을 실제 모델 호출로 수행했다 (Fable = 이 세션 본체, Opus =
`Agent(model: "opus")` 서브에이전트 — CLAUDE.md "역할 선언 ≠ 실행" 원칙 준수).
부수 작업으로 impeccable UI 디자인 스킬을 저장소에 설치했다.

## Current State
- 브랜치: `claude/frontend-design-skill-install-5z0rmw` (origin에 푸시됨).
- 이번 세션 산출물 (전부 docs/, 코드 무변경):
  1. `docs/DOCTOR_VIEW_REDESIGN_v0.1.md` — Fable 설계 초안 (자체평가 8.9,
     기록 보존용).
  2. `docs/DOCTOR_VIEW_REDESIGN_Opus_UX_Review_v0.1.md` — Opus 독립 검수 전문.
     판정 REQUEST CHANGES(독립 점수 6.30), 치명 결함 5건(B1~B5) + 24개 수정 요구.
  3. `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` — **최종 추천안.** Opus 항목 1~24 전부
     반영, 자체 재평가 9.05. **사용자(Product Owner) 승인 대기.**
  4. `.claude/agents/impeccable-*`, `.claude/skills/impeccable/`,
     `.claude/settings.json` — impeccable 스킬 설치 (선행 커밋).
- **Opus 검수가 발견한 현재 코드의 실제 임상 안전 결함 (재설계와 독립):**
  LBP 안전 패널 fail-open 게이트 — 주호소 비-통증 + "추가 상세상담=통증(허리)"
  환자는 `safety_flags.lbp`가 계산됨에도 `DoctorView.tsx:542`
  (`primary_module_detail !== 'LBP'` 게이트)와 `:2644`(`showLbpExam`) 때문에
  안전 패널·진찰 소견 입력이 렌더되지 않는다. NECK/SHOULDER F1 수정과 동일 유형.
  v0.2 §0이 `claude/fix-lbp-safety-panel-gate` 단독 선행 PR을 권고.
- FROZEN(`src/spec/*Logic.ts`, `*Adapter.ts`) 및 모든 소스 코드: 이번 세션에서
  **한 줄도 변경하지 않았다** (docs/와 .claude/만 변경).

## Completed (이번 세션)
- impeccable 스킬 설치 (로컬 안내 + 저장소 커밋).
- 현재 Doctor View 전수 분석 (DoctorView.tsx 2667줄, JudgmentPanel, doctor.css,
  sectionOrder, 테스트).
- 설계 초안 v0.1 → Opus 독립 critique(별도 컨텍스트 서브에이전트, 코드 대조 검수)
  → 최종 v0.2 revision. 핵심 설계: `deriveSafetyOverview` 단일 안전 selector,
  행 게이트 `safety_flags.* !== null` 단일화, 3-status 시각 인코딩 신규 구현 명시,
  저장 상태 머신, EMR 자동 덮어쓰기 금지, 1024 태블릿 단일 컬럼 + bottom sheet,
  목록 화면 스펙, `진료 완료` 액션, 테스트 재작성 계획표(P0~P7).

## In Progress
- 없음 (설계 단계 완료 — 다음은 사용자 승인).

## Remaining / Next Recommended Action
1. **사용자: `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` 검토·승인** (열린 결정 2건 포함:
   `in_consultation` 자동 전이 여부 §11.8, 차트번호 필드 시점 §13-8).
2. **선행 버그 수정 PR** `claude/fix-lbp-safety-panel-gate` — 재설계 승인과
   무관하게 먼저 처리 권고 (v0.2 §0).
3. 승인 후 구현은 v0.2 §14의 P0~P7 단계별 PR로 진행 (각 단계 테스트 재작성
   원칙: 삭제가 아니라 새 DOM 기준 재작성).
4. 이 브랜치의 PR 생성 여부는 사용자 결정 (docs-only이므로 스킬 설치 + 설계
   문서를 하나의 PR로 묶어 ChatGPT 리뷰에 올릴 수 있음).

## Blockers
- 없음.

## Relevant Files
- `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` — 최종안 (이것만 읽어도 됨).
- `docs/DOCTOR_VIEW_REDESIGN_Opus_UX_Review_v0.1.md` — 검수 근거(코드 인용 포함).
- `src/doctor/DoctorView.tsx:542, 2644` — LBP fail-open 게이트 위치.

## Known Risks
- v0.2는 스펙이며 아직 어떤 코드도 바꾸지 않았다 — LBP 게이트 결함은 **현재
  main에도 살아 있다.**
- 이전 세션 스레드: `ux/tablet-v2-2-1-real-device-correction` 브랜치가 origin에
  존재하며, 그 세션의 HANDOFF 기준 "PR 생성 + 실기기 재QA + 사용자 merge 결정"이
  미결이었다. 이번 세션은 그 브랜치를 건드리지 않았다 — 상태는 GitHub에서 직접
  확인 필요 (이전 HANDOFF 내용은 git history의 이 파일 이전 버전 참고).
- 환자 개인정보 실제 값 기록 금지 원칙은 이번 설계 문서에서도 준수됨.

## Current Branch
`claude/frontend-design-skill-install-5z0rmw`

## Tests / Verification
- 이번 세션은 docs/.claude만 변경 — 코드 테스트 대상 없음. `git status`로
  소스 무변경 확인.
