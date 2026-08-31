# Current Handoff

## Objective
Doctor View 전면 재설계(`docs/DOCTOR_VIEW_REDESIGN_v0.2.md`, 별도 브랜치
`claude/frontend-design-skill-install-5z0rmw`에만 존재 — 아직 `main`에
merge되지 않음)의 구현 단계. 이번 세션은 **P1(골격) + P2(안전 통합)**
두 단계를 구현했다. 오케스트레이터가 이 브랜치에 이어서 P3~P7을 계속
진행할 예정이다.

## Current State
- `main` tip: `b845a87`(PR #22 merge — Tablet v2.2.1 real-device
  correction). 안정 상태.
- 작업 브랜치: `claude/feat-doctor-view-redesign` (origin/main에서 분기,
  push 완료).
- 커밋 2개:
  1. `ef6bf05` — P1 골격: `.doctor` 스코프 `--doctor-*` 토큰, 2컬럼 grid
     (`.doctor__layout`, ≥1440 7/5, 1280~1439 6/6, <1280 단일 컬럼),
     상단바(`.doctor__topbar`, ⚙ 도구 메뉴로 데이터소스/fixture 픽커/토큰
     clear/원본 데이터 이동 통합) + 환자 헤더 밴드(`PatientHeader`,
     이름·끝4자리·성별/나이(계산)+주호소+기간·빈도), npm `pretendard`
     self-host(400/600/700 woff2, `@font-face`), 토스트 top:56px, 항상-빈
     legacy 섹션 3종(동반문제/추가 상세상담/참고 증상) 데이터 있을 때만
     렌더. 기존 JudgmentPanel+EMR 녹취 섹션을 우측 레일로 이동(레일
     컴팩트 재설계는 P3 — 아직 §8.1 예산 미충족이라 sticky 미적용, 의도적
     단순화).
  2. `43a8a65` — P2 안전 통합: `src/doctor/safetyModules.ts`
     (`computeSafetyModuleRows`, 9개 모듈 계산 단일화) +
     `src/doctor/safetyOverview.ts`(`deriveSafetyOverview`, §11.1 단일
     selector) + `SafetyModuleRowView.tsx`/`SafetySection.tsx`(통합 안전
     리스트, 3-status 시각 인코딩 신규 구현, 계산 플래그 true만 렌더).
     LBP fail-open 게이트 결함(Opus B3) 수정 — 행 게이트를
     `safety_flags.<module> !== null`로 단일화, `showLbpExam`도 동일
     기준. B1(모듈 URGENT가 목록/헤더에 반영 안 되던 문제) 수정. 서버
     `store.js`에 `deriveListOverview` 추가(저장된 `safety_flags.*`
     상태 문자열 + `requires_staff_check`만 읽음, 새 임상 계산 없음;
     shape 없는 레코드는 `overview: null` 보류) + 목록 정렬(URGENT→신규→
     최신순, 완료 접힘).
- **FROZEN(`src/spec/*Logic.ts`, `*Adapter.ts`) 두 커밋 모두 zero-diff**
  (`git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
  비어있음, 커밋마다 확인함).
- `npx tsc -b --force` / `npm run build` / `npm run test:all` 전부 green
  (커밋마다 확인).
- **PR을 아직 만들지 않았다** — 오케스트레이터가 이 브랜치에서 P3~P7을
  이어갈 예정이라, 이번 세션 지시(`완료 기준`)에도 PR 생성이 포함되어
  있지 않았다. 전체 P0~P7이 끝나거나 사용자가 중간 리뷰를 요청하는
  시점에 PR을 만드는 것이 자연스럽다.

## Completed (이번 세션)
- P1: 2컬럼 grid 골격, 상단바/환자 헤더 신설, Pretendard self-host,
  legacy 빈 섹션 3종 조건부 렌더.
- P2: 안전 selector/통합 리스트 신설, LBP/B1 결함 수정, 3-status 인코딩,
  서버 목록 overview 필드 + 정렬.
- 테스트: `tests/doctor.spec.mjs`(9개 모듈 패널 → 통합 리스트 마크업
  전환, `deriveSafetyOverview` node 테스트 신설, §8.4 방식 안전-우선-순서
  테스트 신설), `tests/server.spec.mjs`(overview 파생 5건 신설),
  `tests/ankle-foot-doctor-integration.spec.mjs`(wiring 어서션 재작성).

## In Progress
- 없음 — P1/P2는 완료. 다음은 P3(오케스트레이터가 이어감).

## Remaining / Next Recommended Action
1. **P3**: 레일 압축 재설계(오늘 확인 목록 + 진찰 소견 + 판단 compact 폼)
   + 저장 상태 머신(`onSave` 계약을 `Promise<ServerResult>`로 변경,
   `JudgmentPanel.tsx:273`의 "아직 저장되지 않음" 고정 문구 교체) + 진료
   완료 버튼. §8.1 레일 예산(≤560px)은 이 단계에서 성립시킨다.
2. P4~P7은 `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` §14 표 그대로 순서대로
   진행.
3. 전체 단계가 끝나면(또는 사용자가 중간 리뷰를 원하면) 이 브랜치로
   `main` 대상 PR을 생성하고 ChatGPT 독립 리뷰에 올린다.
4. 사용자 승인 대기 열린 결정 2건(v0.2 §11.8 `in_consultation` 자동 전이
   여부, §13-8 차트번호 필드 신설 시점)은 아직 미결 — P3~P7 구현 중 해당
   지점에 도달하면 임의로 구현하지 말고 다시 확인할 것.

## Blockers
- 없음.

## Relevant Files
- `src/doctor/safetyModules.ts`, `src/doctor/safetyOverview.ts` — 안전
  계산/selector 단일 출처(P3 이후 계속 재사용할 것 — 새 계산 경로를
  만들지 말 것).
- `src/doctor/SafetyModuleRowView.tsx`, `src/doctor/SafetySection.tsx` —
  통합 안전 리스트 렌더.
- `src/doctor/DoctorView.tsx` — `.doctor__topbar`/`PatientHeader`/
  `.doctor__layout`/`.doctor__rail` 골격. `showLbpExam` 게이트 위치.
- `src/doctor/doctor.css` — `--doctor-*` 토큰, `@font-face`, 3-status
  CSS(`doctor__safetyRow--*`).
- `server/store.js` — `deriveListOverview`(목록 배지 유일 출처).
- `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` — 구현 권위 문서(다른 브랜치에만
  존재 — `main`에 아직 없음, P3 작업 전에 그 브랜치 또는 PR에서 다시
  참고할 것).

## Tests / Verification
- 두 커밋 각각에서: `npx tsc -b --force`(0 에러), `npm run build`(성공,
  Pretendard woff2 3종 정상 번들 확인), `npm run test:all`(전체 green),
  `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
  (empty).

## Current Branch
`claude/feat-doctor-view-redesign` (origin에 push됨, PR 없음).

## Last Commit
`43a8a65` — "feat(doctor): P2 safety integration — deriveSafetyOverview + unified list"

## Known Risks
- 우측 레일이 P1/P2 기준으로는 §8.1 예산(≤560px)을 넘는다(P1 커밋
  메시지에 명시) — sticky를 아직 켜지 않았으므로 뷰포트보다 긴 sticky
  회귀(이 저장소의 기존 병목)는 재발하지 않지만, 시각적으로는 P3의
  컴팩트 재설계 전까지 우측 컬럼이 예산 밖으로 길다.
- 서버 목록 `overview` 필드는 safety_flags shape이 없는 레코드에서
  `null`을 반환한다 — 프런트에서 `null`을 CLEAR처럼 취급하지 않도록
  주의(현재 DoctorView 목록 렌더는 `'URGENT'`/`'REVIEW'`일 때만 배지를
  그리고 `null`/`'CLEAR'`는 배지 없음 — 두 경우가 시각적으로 구분되지
  않는다는 뜻이므로, P3 이후 배지 UI를 다듬을 때 이 구분을 명시적으로
  드러낼지 검토할 것).
- `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` 자체는 아직 `main`에 없다(다른
  브랜치에만 존재) — PR 생성 시 리뷰어가 구현 근거 문서를 찾지 못할 수
  있으므로, PR 생성 단계에서 그 문서를 함께 가져오거나 링크를 명시할 것.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.
