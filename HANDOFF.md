# Current Handoff

## Objective
Doctor View 전면 재설계(`docs/DOCTOR_VIEW_REDESIGN_v0.2.md`, 별도 브랜치
`claude/frontend-design-skill-install-5z0rmw`에만 존재 — 아직 `main`에
merge되지 않음)의 구현 단계. 이번 세션은 **P3(우측 레일·저장 상태
머신) + P4(문진 핵심)** 두 단계를 구현했다. 오케스트레이터가 이 브랜치에
이어서 P5~P7을 계속 진행할 예정이다.

## Current State
- `main` tip: `b845a87`(PR #22 merge — Tablet v2.2.1 real-device
  correction). 안정 상태.
- 작업 브랜치: `claude/feat-doctor-view-redesign` (origin/main에서 분기,
  push 완료).
- 커밋 4개 (P1/P2는 이전 세션, P3/P4는 이번 세션):
  1. `ef6bf05` — P1 골격.
  2. `43a8a65` — P2 안전 통합.
  3. `974dd04` — **P3 레일 재설계**:
     - `TodayChecklist.tsx`(신규) — "오늘 확인" 목록. 권장 검사
       (`computeSafetyModuleRows`의 `examCodes` 통합) + 미확인 항목
       (수술력/추가 전달사항/기타 확인 — `SafetySection.tsx`에서 분리한
       `otherDetailChecklistFlags`로 계산 통일). 서버 모드에서만 체크박스
       활성화, `sessionStorage['doctor_checklist_' + (visit_id ?? 제출
       id)]`에 지속. fixtures는 읽기 전용(체크박스 disabled, 카운터
       미표시). 최대 5행 + "n건 더" 펼치기, 항목 0개면 블록 미렌더.
       **체크 상태는 안전 계산 경로(`computeSafetyModuleRows`/
       `deriveSafetyOverview`)를 절대 읽지도 쓰지도 않는다**(invariant
       5 — 회귀 가드 테스트로 소스 레벨 확인함).
     - `JudgmentPanel.tsx` 재구성 — "진찰 소견"(LBP motor deficit /
       Shoulder cuff weakness 라디오)을 "원장 판단 기록"과 분리된 독립
       `<section>`으로 이동(같은 컴포넌트 안, 두 섹션을 담은 Fragment
       반환 — `judgment` state는 여전히 하나만 공유하므로 저장 경로는
       기존 그대로, invariant 7 충족). 저장 상태 머신(§11.7): `onSave`
       시그니처를 `(j) => Promise<{ok; error?}>`로 변경,
       `handleRecord`가 await하고 idle→saving(버튼 비활성+스피너)→
       saved(서버 200 시각)/error(다시 시도, amber)를 반영. "기록된 판단
       (JSON, 아직 저장되지 않음)" 거짓 문구 제거. fixtures 모드는
       상주 배지 "미리보기 — 저장되지 않음"(previewMode prop). Ctrl/
       Cmd+Enter=기록은 판단 폼 section의 `onKeyDown`에만 바인딩(전역
       바인딩 없음).
     - `EmrSheet.tsx`(신규) — 레일 상주 "진료 녹취·요약" 블록 제거, "EMR
       요약 열기" 버튼 + 상태 dot만 레일에 남기고 transcript/textarea/
       복사/재생성을 overlay 시트(데스크톱 560px 우측 슬라이드, 태블릿
       하단 60%)로 이동. **자동 덮어쓰기 금지**: `emrEdited`가 true면
       새 recording_id 도착 시 `pendingEmrText`로 보류하고 amber
       스트립("내 편집 유지"/"새 요약으로 교체")을 보여준다. recorder
       결과 없으면 버튼 자체 미렌더.
     - `DoctorView.tsx` 상단바에 "진료 완료" 버튼(서버 모드+상세 열림
       시) — 기존 `setSubmissionStatus(id, 'completed')` 계약 재사용,
       성공 시 목록 복귀. `in_consultation` 자동 전이는 **구현하지
       않음**(§11.8, PO 승인 대기 항목 그대로 둠).
     - `doctor.css`에 레일 sticky(`≥1280px`, `.doctor__layout`의
       `align-items:start`와 결합해 컬럼별 overflow 없이 graceful
       degradation) + 저장 상태/체크리스트/EMR 시트/진료완료 버튼 CSS
       신규(이전에는 `.judgment__radioRow` 등에 CSS가 전혀 없었음).
  4. `9f75d56` — **P4 문진 핵심**:
     - "상세 증상" 섹션을 "문진 핵심"으로 승격, `primaryModuleFields`
       결과를 양성/구체 응답(`doctorField__value--strong`, 15px/700)
       우선 → none/unknown muted 후순위로 정렬(신규
       `fieldSignificance`/`sortFieldsBySignificance`/`ModuleFieldGroup`).
       "안 물어봄=미렌더" 규칙은 그대로(Field 자신이 계속 필터링).
     - 정렬된 그룹 아래 "원시 응답 전체 보기" 펼치기에 원본 순서 그대로
       전체 필드를 다시 렌더(의도된 중복 — 10초 요약 카드와 같은
       패턴). "추가 상세상담" 블록도 같은 `ModuleFieldGroup` 재사용.
     - 약물·병력·임신 파생 블록의 provenance 태그(§9.6)는 이미 있던
       것을 그대로 유지, 이번 커밋에서 손대지 않음.
- **FROZEN(`src/spec/*Logic.ts`, `*Adapter.ts`) 커밋 4개 전부 zero-diff**
  (`git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
  비어있음, 커밋마다 확인함).
- `npx tsc -b --force` / `npm run build` / `npm run test:all` 전부 green
  (P3/P4 커밋 각각에서 확인 — P3 커밋은 P4 변경분을 완전히 뺀 상태로
  독립적으로 green을 확인한 뒤 커밋했다).
- **PR을 아직 만들지 않았다** — 전체 P0~P7이 끝나거나 사용자가 중간
  리뷰를 요청하는 시점에 PR을 만드는 것이 자연스럽다(P1/P2 세션과
  동일 판단 유지).

## Completed (이번 세션)
- P3: 오늘 확인 목록 + 진찰 소견 독립 블록 + 저장 상태 머신(onSave 계약
  변경 + 거짓 문구 제거) + EMR 시트(자동 덮어쓰기 금지) + 진료 완료
  버튼 + 레일 sticky.
- P4: 문진 핵심 유의미 응답 우선 정렬 + 원시 응답 전체 펼치기.
- 테스트: `tests/doctor.spec.mjs`에 P3 신규 어서션 다수(저장 상태
  머신 계약, previewMode 배지 전체 fixture 순회, 진찰 소견 독립
  section 검증, 오늘 확인 목록 렌더/미렌더, EMR 시트 자동 덮어쓰기
  금지 계약, 진료완료·EMR 버튼 fixtures 모드 미렌더) + P4 신규
  어서션(문진 핵심 렌더, Body-strong 클래스, 추가 상세상담 펼치기,
  중복 감사 새 DOM 기준 재정의, 안 물어봄=미렌더 회귀 가드).

## In Progress
- 없음 — P3/P4는 완료. 다음은 P5(오케스트레이터가 이어감).

## Remaining / Next Recommended Action
1. **P5**: 참고 접기 — 명리 통합(방어 문구 보존) + 전신한약 + (EMR
   시트는 이미 P3에서 구현 완료 — v0.2 §14 표의 P5 행 중 "EMR 시트
   (덮어쓰기 금지)" 항목은 선반영됐다는 점을 P5 작업 시작 전에 스펙과
   대조해 중복 작업하지 않도록 확인할 것). §14 재작성 대상 테스트:
   13c(muted 칩) 등가, 명리 문구 어서션.
2. P6~P7은 `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` §14 표 그대로 순서대로
   진행(단, 위 P5 EMR 시트 항목처럼 앞 단계에서 먼저 구현된 항목이
   있는지 매 단계 시작 전에 현재 코드/커밋 로그로 재확인할 것).
3. 전체 단계가 끝나면(또는 사용자가 중간 리뷰를 원하면) 이 브랜치로
   `main` 대상 PR을 생성하고 ChatGPT 독립 리뷰에 올린다.
4. 사용자 승인 대기 열린 결정 2건(v0.2 §11.8 `in_consultation` 자동 전이
   여부 — 이번 세션에서도 구현하지 않음, §13-8 차트번호 필드 신설
   시점)은 아직 미결 — P5~P7 구현 중 해당 지점에 도달하면 임의로
   구현하지 말고 다시 확인할 것.

## Blockers
- 없음.

## Relevant Files
- `src/doctor/TodayChecklist.tsx`, `src/doctor/EmrSheet.tsx` — 이번
  세션 신규 컴포넌트.
- `src/doctor/JudgmentPanel.tsx` — 저장 상태 머신(`SaveStatus`/
  `SaveResult` export), 진찰 소견 독립 section, previewMode.
- `src/doctor/DoctorView.tsx` — 레일 조립 순서(오늘 확인 → 진찰 소견 →
  오늘 판단 → EMR 열기 버튼), EMR 시트 상태(`emrEdited`/
  `pendingEmrText`) 소유, 진료 완료 핸들러, `ModuleFieldGroup`/
  `fieldSignificance`(P4).
- `src/doctor/SafetySection.tsx` — `otherDetailChecklistFlags`
  export(체크리스트와 안전정보 한눈에가 같은 계산을 공유).
- `src/doctor/safetyModules.ts`, `src/doctor/safetyOverview.ts` — 안전
  계산/selector 단일 출처, P3/P4에서 변경 없음(계속 재사용만 함).
- `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` — 구현 권위 문서(다른 브랜치에만
  존재 — `main`에 아직 없음, P5 작업 전에 그 브랜치 또는 PR에서 다시
  참고할 것).

## Tests / Verification
- P3/P4 각 커밋에서: `npx tsc -b --force`(0 에러), `npm run build`(성공),
  `npm run test:all`(전체 green),
  `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
  (empty).

## Current Branch
`claude/feat-doctor-view-redesign` (origin에 push됨, PR 없음).

## Last Commit
`9f75d56` — "feat(doctor): P4 문진 핵심 — 유의미 응답 우선 정렬 + 원시 응답 전체 펼치기"

## Known Risks
- 레일 sticky(`≥1280px`)는 CSS `position: sticky` + `align-items: start`
  조합에 의존한다 — 실제 브라우저에서 오늘 확인 목록이 "n건 더"로 완전히
  펼쳐진 극단적 케이스(권장 검사가 아주 많은 다중 안전모듈 fixture)의
  실측 높이는 이 세션에서 브라우저로 직접 측정하지 않았다(보고서의
  "레일 예산 실측"은 CSS 값 기반 추정치). P7에서 계획된 "무브라우저
  heuristic" viewport-budget 테스트가 이 부분을 자동 검증할 예정.
- `docs/DOCTOR_VIEW_REDESIGN_v0.2.md` 자체는 아직 `main`에 없다(다른
  브랜치에만 존재) — PR 생성 시 리뷰어가 구현 근거 문서를 찾지 못할 수
  있으므로, PR 생성 단계에서 그 문서를 함께 가져오거나 링크를 명시할 것.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.
