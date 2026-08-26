# Current Handoff

## Objective
삼인당 태블릿 문진 UX 반복 개선. PR #19(Routing/UX v2: Primary/Additional/
Reference 3단 구조 + 방문목적 라우팅)와 PR #20(Tablet UX v2.1: 픽토그램,
스크롤 안내, Body Map DOM 버그 수정, Primary-before-Additional 순서 fix)이
모두 `main`에 merge된 상태에서 시작한 **Tablet UX v2.2**(Pain Fast Track +
Herbal Add-on + Body Map 시각 개선 + landscape 레이아웃)가 이번 세션의
작업이다. `docs/TABLET_V2_2_PAIN_FAST_TRACK_AND_HERBAL_ADDON.md`에 전체
설계/audit이 문서화되어 있다.

## Current State
- `main` tip: `f5f68c4d163de822b2b91983c7670c9a3d3bf71c` (PR #20 merge
  커밋). 안정 상태 — build/test 전부 통과.
- 이번 세션은 `main`에서 새 브랜치 `ux/tablet-v2-2-pain-fast-track`을 만들어
  작업했다. **아직 PR을 생성하지 않았다** (이 커밋 직후 생성 예정, 아래
  Next Recommended Action 참고). **merge 금지** — 사용자 명시 지시.
- 핵심 구현: `questionnaire_mode`(`pain_fast`/`expanded`/`herbal_addon`)를
  `src/spec/coreSpec.ts`에 새로 도입. 통증 치료 목적(`pain_care` 등 비-한약
  intent) 환자에게 자동으로 이어지던 한약/체질 systemic block(`HERB_*`,
  `CONST_*` — showIf가 아예 없었던 버그)을 숨기고, 한약 intent 환자는 purpose
  선택과 무관하게 항상 expanded로 확장하며, 진료 중 "한약 추가문진 시작"
  (`StaffHerbalAddonHold`, 2초 hold, 같은 세션/제출 전에만 가능)으로 이미
  완료한 pain_fast 응답을 재질문 없이 이어갈 수 있게 했다.
- Body Map 앞/뒤 실루엣에 최소 시각 cue 추가 + 선택 부위 한글 label 추가.
  Landscape wide-tablet(1000px+ landscape)에서 뒤로가기/단계표시/"입력이
  어려워요"를 좌우 rail로 옮기는 CSS-only(duplicate-markup + 조건부
  display:none) 레이아웃 추가. 스크롤 힌트가 마지막 옵션을 가리던 버그
  수정(`.shell__main` bottom padding 96px로 확대).
- **CLOSED/FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`는 이번 작업에서 단
  한 줄도 건드리지 않았다** — `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`가 비어있음을 확인.
- 전체 테스트: `npm run test:all` 전부 green (integration 974/974, 이전
  대비 +59 assertion — Cases A-E + back-navigation + herbal-addon
  reachability 회귀 포함), `tablet core` pytest 80/80 green.

## Completed
- (PR #19/#20, 이전 세션에서 완료·merge됨 — 여기서는 요약만) Primary/
  Additional/Reference 3단 구조, 방문목적 라우팅, 픽토그램, 스크롤 안내,
  Body Map DOM 버그 수정, Primary-before-Additional 화면 순서 fix.
- (이번 세션, Tablet UX v2.2, 미merge) `questionnaire_mode` 설계/구현,
  Herbal Add-on(같은 세션 전용, staff-only hold 컨트롤), Body Map 시각
  개선, landscape rail 레이아웃, 스크롤 힌트 overlap 수정, DoctorView mode
  배지, 전체 회귀 테스트(§V, 974/974) + viewport/body-map/preview-build
  확장 테스트, `docs/TABLET_V2_2_...md` 작성, FROZEN zero-diff 확인.

## In Progress
- (없음 — 구현/테스트/문서 전부 완료. 다음 액션은 커밋/push/PR 생성, 아래
  Next Recommended Action 참고.)

## Remaining
- PR 생성 후 CI green 확인.
- **PR은 "DO NOT MERGE" 상태로 유지** — 사용자가 직접 검토/승인 후 merge
  여부를 결정한다. Claude 세션은 이 PR을 merge하지 않는다.
- (별도 스코프, 이번 작업 대상 아님) cross-device Herbal Add-on resume —
  `docs/TABLET_V2_2_...md` §6/§14에 OPERATIONAL INTEGRATION REQUIRED로
  명시. 필요 시 별도 보안모델 결정 + DECISIONS.md 항목이 먼저 필요하다.

## Blockers
- 없음 (이 클라우드 세션은 GitHub MCP 도구로 직접 push/PR 생성 가능).

## Relevant Files
- `CLAUDE.md` — 협업 규칙 전체.
- `docs/TABLET_V2_1_DEVICE_QA_AND_ROUTING_REPORT.md` — PR #20 배경/설계.
- `docs/TABLET_V2_2_PAIN_FAST_TRACK_AND_HERBAL_ADDON.md` — 이번 작업 전체
  설계/질문 audit/security boundary/tests/limitations.
- `src/spec/coreSpec.ts` — `questionnaireMode`/`HERBAL_ADDON_FIELD`/
  `SYSTEMIC_BLOCK_QUESTION_IDS`/`reorderForDetailPhases` 확장.
- `src/screens/StaffHerbalAddonHold.tsx` — 신규, 한약 추가문진 시작 컨트롤.
- `src/components/BodyMap.tsx`, `src/components/ScreenShell.tsx`,
  `src/styles.css` — 시각/레이아웃 변경.
- `src/doctor/DoctorView.tsx`, `src/doctor/doctor.css` — mode 배지.
- `tests/integration.spec.mjs` §V, `tests/body-map.spec.mjs`,
  `tests/viewport-budget.spec.mjs`, `tests/preview-build.spec.mjs` — 신규
  회귀 테스트.
- `tablet core/` — 문진 임상 로직 원본(Python/YAML) + 자체 테스트, 이번
  세션에서 미변경.

## Tests / Verification
- `ux/tablet-v2-2-pain-fast-track` 브랜치 기준 (이 세션이 직접 실행):
  `npx tsc -b --force`(0 에러), `npm run build`/`npm run build:preview`
  (둘 다 성공), `npm run test:all`(전체 green, `test:integration`
  974/974 — 새 §V 섹션 포함), `cd "tablet core" && python3 -m pytest
  tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff 확인).

## Current Branch
`ux/tablet-v2-2-pain-fast-track` (PR 생성 예정 — 아직 없음).

## Last Commit
이 문서를 고치는 커밋 자체가 새 tip을 만들기 때문에 SHA를 하드코딩하지
않는다 — 실제 head는 `git rev-parse origin/ux/tablet-v2-2-pain-fast-track`
또는 GitHub PR 페이지에서 직접 확인한다. `main` tip은 위 Current State의
`f5f68c4`.

## Known Risks
- 이번 세션이 도입한 landscape wide-tablet rail 레이아웃은 이 저장소의
  기존 테스트 방법론(헤드리스 브라우저 없음, 소스/CSS 정적 검사 기반)으로만
  검증됐다 — 실기기 landscape 스크린샷 QA가 merge 전 권장된다
  (`docs/TABLET_V2_2_...md` §14 Known limitations 참고, v2.1때와 동일한
  이미 문서화된 한계).
- Herbal Add-on은 제출/프라이버시 wipe **이전**(같은 세션, phase==='question'
  동안)에만 동작한다 — 제출 후 원장이 DoctorView에서 검토하고 나서 결정하는
  cross-device 시나리오는 지원하지 않는다(의도적, 새 세션/토큰 인프라 없이는
  안전하게 만들 수 없음 — `docs/TABLET_V2_2_...md` §6 참고).
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든 작업에서
  실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.

## Next Recommended Action
1. `git push -u origin ux/tablet-v2-2-pain-fast-track`.
2. PR 생성 (제목: `feat(ux): add pain fast track and herbal add-on
   questionnaire`), 본문은 `docs/TABLET_V2_2_...md` 요약 + 필요 시 PR
   템플릿 채움, **Ready for Review로만 두고 merge하지 않는다**.
3. CI(`build-and-test`) green 확인.
4. 최종 보고 형식(사용자가 지정한 필드: PR/HEAD/CI/Preview
   build/Body Map front-back/Selected-region feedback/arm_hand
   subrouting/Landscape rail layout/Pain fast track/Minimum history
   audit/Expanded questionnaire/Herbal add-on/Cross-device resume/
   Stale-answer pruning/FROZEN zero-diff/Tests/HUMAN DECISION
   REQUIRED, 마지막 줄 DO NOT MERGE)로 사용자에게 보고.
5. 실제 merge는 사용자(Product Owner)가 검토 후 결정한다.
