# Current Handoff

## Objective
삼인당 태블릿 문진 UX 반복 개선. PR #19/#20/#21이 모두 `main`에 merge된
상태에서, 실제 11" Android landscape 실기기 screenshot QA로 발견된 v2.2
의도사항 미반영 문제를 바로잡는 **Tablet v2.2.1 real-device correction**이
이번 세션의 작업이다. `docs/TABLET_V2_2_PAIN_FAST_TRACK_AND_HERBAL_ADDON.md`
§15("v2.2.1 addendum")에 전체 root-cause 조사/수정 내역이 문서화되어 있다.

## Current State
- `main` tip: `784a9bd4b6858711ec6d2e2297aea68555a189b3` (PR #21 merge
  커밋 — Tablet UX v2.2: Pain Fast Track + Herbal Add-on). 안정 상태.
- 이번 세션은 `main`에서 새 브랜치 `ux/tablet-v2-2-1-real-device-correction`을
  만들어 작업했다. **아직 PR을 생성하지 않았다** (이 커밋 직후 생성 예정).
  **merge 금지** — 사용자 명시 지시.
- 실기기에서 확인된 4가지 문제와 처리 결과:
  1. **landscape rail이 실기기에서 발동 안 함** — root cause: viewport
     meta는 정상이었고, breakpoint 기준값(`min-width:1000px`)이 실제 11"
     Android landscape CSS viewport 폭(DPR에 따라 800~1280px대)보다 높았다.
     `min-width:760px`로 낮추고, backBtn/stepLabel이 rail로 이동했는데도
     `.shell__topRow`가 옛 min-height(56px)를 그대로 예약하던 버그도 같이
     고쳤다(§15.1-15.2 참고). 1280×800 기준 available height
     456px→608px(+152px) 실측 개선.
  2. **Body Map front/back 구분 약함** — stroke-width 0.6/--text-muted →
     2.2/--text로 강화, front에 입 추가(눈만으론 약함), back에 둔부/등
     contour 추가.
  3. **선택 부위 label이 스크롤 시 사라짐** — figures 아래 sticky compact
     chip 추가(scroll hint pill과 절대 안 겹치도록 bottom:84px 고정).
  4. **Pain Fast Track에서 전신정보 질문 노출 재현 시도** — 실제
     `responses={}`부터 시작하는 screen-by-screen walk(성별×옵션선택전략
     여러 조합, Additional=sleep 케이스 포함, `tests/integration.spec.mjs`
     §W1-W3, 12개 assertion group)로 재현을 시도했으나 **현재 `main`
     baseline에서는 재현되지 않았다** — §10의 7가지 가설 전부 소스 레벨로
     확인, 실제 코드 결함 없음. 중복 showIf 땜질 없이, 이 클래스의 회귀를
     영구히 막는 exhaustive regression test만 추가했다(자세한 내용은
     `docs/TABLET_V2_2_...md` §15.3).
- 추가로 LBP_10 문구를 자연스럽게 수정(순수 copy change, id/variable/
  options/showIf/threshold 전부 동일)했고, `HERBAL_ADDON_FIELD`가 매 새
  세션마다 명시적으로 초기화되도록 `App.tsx`의 `emptyResponses()`를
  self-documenting하게 강화했다(기능적으로는 기존에도 안전했음을 확인).
- **CLOSED/FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`는 이번 작업에서도 단
  한 줄도 건드리지 않았다** — `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`가 비어있음을 확인.
- 전체 테스트: `npm run test:all` 전부 green (`test:integration` 1010/1010,
  이전(PR #21 기준 974) 대비 +36 assertion), `tablet core` pytest 80/80
  green.

## Completed
- (PR #19/#20/#21, 이전 세션에서 완료·merge됨 — 여기서는 요약만) Primary/
  Additional/Reference 3단 구조, 방문목적 라우팅, 픽토그램, 스크롤 안내,
  Body Map DOM 버그 수정, Primary-before-Additional 순서 fix,
  questionnaire_mode(pain_fast/expanded/herbal_addon), Herbal Add-on,
  landscape rail 레이아웃 1차 도입.
- (이번 세션, v2.2.1) landscape breakpoint 실기기 기준 수정(1000px→760px)
  + 세로 chrome 실질 압축, Body Map front/back cue 강화 + sticky selected
  chip + zone highlight 개선, pain_fast systemic spillover 실제 walk 기반
  재현 시도(재현 안 됨, 원인 7가지 전부 소스 확인) + exhaustive regression
  suite 추가, LBP_10 wording fix, HERBAL_ADDON_FIELD stale-reset 명시화,
  `docs/TABLET_V2_2_...md` §15 addendum 작성, 전체 회귀 테스트
  (test:integration 1010/1010) + FROZEN zero-diff 확인.

## In Progress
- (없음 — 구현/테스트/문서 전부 완료. 다음 액션은 커밋/push/PR 생성.)

## Remaining
- PR 생성 후 CI green 확인.
- **PR은 "DO NOT MERGE" 상태로 유지** — 사용자가 직접 검토/승인 후 merge
  여부를 결정한다.
- 실기기 landscape 재QA 권장(이번 breakpoint/chrome 수정이 실제 디바이스에서
  의도대로 보이는지) — 이 세션의 도구로는 소스/CSS 정적 검사까지만 가능.
- pain_fast systemic spillover가 **다시** 실기기에서 재현되면: (a) 정확히
  어떤 build/배포(캐시 여부, 커밋 SHA)를 테스트했는지 우선 확인, (b) 그래도
  재현되면 이 세션이 놓친 실제 코드 경로가 있다는 뜻이므로 `tests/
  integration.spec.mjs` §W1-W3에 그 정확한 조작 순서를 추가해 먼저 실패하는
  테스트로 재현한 뒤 수정한다(§10 root-cause 우선 원칙 유지).

## Blockers
- 없음.

## Relevant Files
- `docs/TABLET_V2_2_PAIN_FAST_TRACK_AND_HERBAL_ADDON.md` §15 — 이번
  real-device correction 작업 전체 root-cause/수정 내역.
- `src/styles.css` — wide-landscape breakpoint(760px)/chrome 압축/Body Map
  cue·chip·highlight.
- `src/components/BodyMap.tsx` — front/back cue 강화, selectedChip 추가.
- `src/spec/coreSpec.ts` — LBP_10 wording.
- `src/App.tsx` — `emptyResponses()`의 `HERBAL_ADDON_FIELD` 명시적 초기화.
- `tests/integration.spec.mjs` §W1-W5, `tests/viewport-budget.spec.mjs` §5/§7,
  `tests/body-map.spec.mjs` — 신규 회귀 테스트.

## Tests / Verification
- `ux/tablet-v2-2-1-real-device-correction` 브랜치 기준 (이 세션이 직접
  실행): `npx tsc -b --force`(0 에러), `npm run build`/`npm run
  build:preview`(둘 다 성공), `npm run test:all`(전체 green,
  `test:integration` 1010/1010), `cd "tablet core" && python3 -m pytest
  tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff 확인).

## Current Branch
`ux/tablet-v2-2-1-real-device-correction` (PR 생성 예정 — 아직 없음).

## Last Commit
이 문서를 고치는 커밋 자체가 새 tip을 만들기 때문에 SHA를 하드코딩하지
않는다 — 실제 head는 `git rev-parse origin/ux/tablet-v2-2-1-real-device-correction`
또는 GitHub PR 페이지에서 직접 확인한다. `main` tip은 위 Current State의
`784a9bd`.

## Known Risks
- 이번 landscape/Body Map 수정은 이 저장소의 기존 테스트 방법론(헤드리스
  브라우저 없음, 소스/CSS 정적 검사 기반)으로만 검증됐다 — 실기기 재QA가
  merge 전 권장된다.
- pain_fast systemic spillover는 이번 세션 기준 재현되지 않았지만, 실기기
  보고와 코드 상태가 어긋난 이유(오래된 배포/캐시 vs 실제 미발견 버그)가
  100% 확정되지는 않았다 — 위 Remaining 항목 참고.
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든 작업에서
  실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.

## Next Recommended Action
1. `git push -u origin ux/tablet-v2-2-1-real-device-correction`.
2. PR 생성 (제목: `fix(ux): correct real-device pain fast track and tablet
   landscape layout`), Ready for Review로만 두고 merge하지 않는다.
3. CI(`build-and-test`) green 확인.
4. 최종 보고 형식(사용자가 지정한 필드: Root cause — landscape/body map/
   systemic spillover, Pain walk regression, Wide landscape real-device
   breakpoint, Body Map, LBP_10 wording, HERBAL_ADDON stale reset, FROZEN
   zero-diff, Tests, HUMAN DECISION REQUIRED, 마지막 줄 DO NOT MERGE)로
   사용자에게 보고.
5. 실제 merge는 사용자(Product Owner)가 검토 후 결정한다.
