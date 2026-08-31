# Doctor View 재설계 v0.1 — Opus 독립 UX 검수 (REQUEST CHANGES)

> 검수자: Opus (독립 critique, 별도 컨텍스트 서브에이전트)
> 대상: `docs/DOCTOR_VIEW_REDESIGN_v0.1.md` (Fable 설계 초안)
> 판정: **REQUEST CHANGES** — 독립 점수 평균 **6.30** (초안 자체평가 8.9)
> 반영: `docs/DOCTOR_VIEW_REDESIGN_v0.2.md`에서 항목 1~24 전부 반영

검수 기준: 초안 전문, `src/doctor/DoctorView.tsx`(2667줄 전체), `JudgmentPanel.tsx`,
`doctor.css`(733줄 전체), `sectionOrder.ts`, `src/styles.css`, `src/spec/coreSpec.ts`
(라우팅/플래그/STAFF_CHECK 구간), `src/lib/serverClient.ts`, `server/store.js`,
`tests/doctor.spec.mjs`.

**결론: 현재 상태로는 승인 불가.** 초안의 방향(2컬럼 cockpit, 안전 통합, 행동 상주)은
옳지만, **초안은 현재 코드의 가장 심각한 임상 안전 결함 3개를 발견하지 못했고**, 그
결함들은 재설계로 자동 해소되지 않으며 오히려 새 IA에서 은폐될 수 있다. 태블릿 §8.2는
실제 폭/높이 계산이 한 번도 수행되지 않았고, 비주얼 시스템 §9.3의 전제(폰트)가 타깃
머신에서 성립하지 않는다.

---

## 1. 치명 결함 (BLOCKING)

### B1. URGENT의 단일 출처가 정의되지 않았다 — 초안의 헤더 pill이 거짓말을 하게 된다

**코드 사실:**
- `coreSpec.ts:3909` — `requires_staff_check: generalRed || giNeedsReview || bowelNeedsReview`.
  **모듈별 URGENT_REVIEW는 여기 포함되지 않는다.**
- `DoctorView.tsx:2200` — 붉은 배너는 오직 `flags.requires_staff_check`로만 뜬다.
- `server/store.js:142` — 목록의 `requires_staff_check`도 동일한 값. 즉 목록의
  `⚠ 안전 확인 필요`(`DoctorView.tsx:2183`)도 모듈 URGENT를 반영하지 않는다.
- 모듈 URGENT(예: `KNEE_07` 패혈성 관절염, `WH_02` 개방창/신경혈관, `ELBOW_11` 심장
  연관통)는 **태블릿 문진 중 StaffCheckScreen 인터스티셜**로만 처리되고
  (`coreSpec.ts:3919~4010`), 원장 화면에는 해당 모듈 패널의 칩 텍스트
  `긴급 확인 필요` **문자열 하나로만** 존재한다.

초안 §8은 "(조건부) URGENT 전폭 배너"라고만 쓰고 그 조건의 데이터 출처를 명시하지
않았고, §4는 헤더 pill을 `긴급 확인 / 확인 필요 n건 / 안전 확인됨` 3상태로 두면서
계산식을 정의하지 않았다.

**진료 중 실패 시나리오:** 무릎 통증 환자가 태블릿에서 `KNEE_07`에 양성 → 접수
데스크에서 StaffCheck 인터스티셜이 떴지만 직원이 "확인했습니다"를 누르고 지나감(현
설계상 non-terminating). 원장이 목록을 연다 → 그 환자 행은 `⚠` 없이 평범한 행. 새
헤더 pill이 `requires_staff_check` 기반으로 구현되면 → `안전 확인됨`(민트). 원장은
3초 만에 "안전"으로 읽고 침을 놓는다. **현재 UI는 최소한 무릎 패널의 "긴급 확인 필요"
텍스트가 세로 스크롤 상 존재하지만, 초안의 통합 리스트는 그 행을 접어두고 pill만
노출하므로 은폐가 더 확실해진다.**

**요구:** pill/배너/목록 배지의 계산식을 `requires_staff_check ||
any(module_safety_status === 'URGENT_REVIEW')`로 스펙에 못 박고, 이 union을 만드는
**단일 selector 함수**(예: `deriveSafetyOverview(payload)`)를 렌더 계층에 신설한다고
명시할 것. 그리고 그 selector에 대한 node 테스트(각 모듈 URGENT fixture → overview
=== 'URGENT')를 P2 완료 조건으로 넣을 것.

### B2. 안전 패널 10종에는 CSS가 단 한 줄도 없다 — 초안이 "반복되는 칩 패턴"이라 부른 것은 실제로는 무포맷 텍스트 덩어리다

**코드 사실:** `doctor.css` 733줄 전체에 `.doctor__lbpSafety`,
`.doctor__lbpSafety--urgent_review`, `--review_required`, `--clear`,
`.doctor__lbpExam` 규칙이 **존재하지 않는다** (CSS 파일은 `doctor.css`와 `styles.css`
둘뿐, grep 0건).

즉 10개 패널 전부가 스타일 없는 `<div>`이고, `--urgent_review` modifier는 **아무 시각
효과가 없다**. `안전`, `확인 필요`, `긴급 확인 필요` 세 상태가 화면에서 완전히 동일하게
보인다. 유일한 차이는 칩 안의 한글 3~7글자.

초안 §1은 이 패널들의 문제를 "동일 칩 패턴으로 스택"(반복성)으로 진단했다. **오진이다.**
진짜 문제는 반복이 아니라 **위험 상태가 시각적으로 인코딩되어 있지 않다는 것**이고,
이건 §11.3의 "상태 pill: — 현행 3-status 그대로 매핑"이라는 표현과 정면으로 충돌한다.
**"현행 그대로 매핑"할 현행이 없다.** 이 문장 때문에 구현자는 P2를 "기존 칩을 옮기는
작업"으로 오해하게 된다.

**진료 중 실패 시나리오:** neck_shoulder 환자. NECK=CLEAR,
SHOULDER=URGENT_REVIEW(SH02 변형/신경혈관). 현재 화면에서 두 패널은 픽셀 단위로 동일한
모양이고, 원장은 두 제목만 인지하고 스크롤을 넘긴다. 초안대로 통합해도 §11.3이 "현행
매핑"이라 적혀 있으면 같은 결과.

**요구:** §11.3에 "3-status의 시각 인코딩은 **신규 구현**이며 현행에 존재하지 않는다"고
명시하고, 상태별 토큰(배경/보더/아이콘/텍스트 색)을 §9.4 표에 실제 값으로 확정할 것.
추가로 "URGENT 행은 접기 불가(항상 확장, 접기 컨트롤 자체를 렌더하지 않음)"를 §11.3에
규칙으로 넣을 것.

### B3. LBP 안전 패널 게이트에 fail-open 결함이 살아 있다 — 초안은 이를 발견하지 못했고, 오히려 동결했다

**코드 사실 (3단 대조):**

| 위치 | 조건 |
|---|---|
| `coreSpec.ts:976` | `IS_PRIMARY_LBP = IS_PRIMARY_PAIN(r) && PAIN_01 === 'low_back_pelvis'` |
| `coreSpec.ts:966, 440` | `IS_PRIMARY_PAIN = primaryConcernKey === 'pain' \|\| hasDetailedConcern(r,'pain')` |
| `coreSpec.ts:4227` | `primary_module_detail: isPrimaryPain ? painRegionalDetailLabel(r) : null` — **additional 쪽이면 null** |
| `coreSpec.ts:~4560` | `safety_flags.lbp: IS_PRIMARY_LBP(r) ? computeLbpFlags(...) : null` |
| `DoctorView.tsx:542` | `if (payload.routing.primary_module_detail !== 'LBP') return null` |
| `DoctorView.tsx:2644` | `showLbpExam={routing.primary_module_detail === 'LBP'}` |

→ **주호소가 수면/피로/스트레스이고 "추가 상세상담 = 통증(허리)"을 고른 환자**는
`safety_flags.lbp`가 완전히 계산되지만(LBP_01~14를 실제로 답했으므로),
`primary_module_detail`은 `null`이라 **LbpSafetyPanel이 렌더되지 않고 JudgmentPanel의
객관적 하지 근력저하 입력도 노출되지 않는다.**

이것은 NECK/SHOULDER에서 F1 invariant로 이미 한 번 고친 것과 **정확히 같은 종류의
결함**이다. HIP/KNEE/ELBOW/WRIST_HAND/ANKLE_FOOT/TMJ/SHOULDER/NECK은 전부
`safety_flags.X !== null`을 쓴다. **LBP 하나만 예외.**

**진료 중 실패 시나리오:** 40대 환자, 주호소 "피로", 추가 상세상담 "통증 — 허리",
LBP_05 야간통+체중감소 양성 → `lbp_safety_status = REVIEW_REQUIRED`,
`diseaseSafetyLocked = true`. 원장 화면: "추가 상세상담" 섹션에 LBP 원시 응답 14줄은
보이지만, **안전 상태·잠금 문구·권장 검사는 어디에도 없다.**

초안 §13 invariant 1은 "게이트 조건 변경 금지"라고 적어 **현재의 잘못된 게이트를
명시적으로 동결**하고 있다. FROZEN인 것은 `*Logic.ts`/`*Adapter.ts`이고,
`DoctorView.tsx`의 렌더 게이트는 초안 자신이 허용한 렌더 계층이다.

**요구:** 통합 안전 리스트의 행 생성 규칙을 **`safety_flags.* !== null`인 모듈
전부**로 단일화. `primary_module_detail`은 정렬 우선순위에만 쓰고 가시성 게이트로는
절대 쓰지 않는다를 invariant로. `showLbpExam`도 `safety_flags.lbp !== null`로.

### B4. "오늘 확인" 체크리스트가 로컬 UI 상태인 채로 안전 표시를 바꾸면 안 된다

**문제 1 — 안전 pill 오염.** 헤더 pill이 `확인 필요 n건`이고 n이 체크리스트 미체크
수라면, 원장이 아무 임상 행위 없이 체크박스만 눌러도 pill이 `안전 확인됨`으로 바뀐다.
`unknown` 응답은 이 코드베이스에서 **fail-closed 계산의 입력**이다(각 `compute*Flags`가
UNKNOWN을 REVIEW로 올림). 즉 로직은 여전히 REVIEW_REQUIRED인데 화면은 초록.

**문제 2 — 휘발.** 로컬 상태이므로 "← 목록"으로 나갔다 오면 전부 초기화된다. 원장은
하루에 같은 환자 차트를 2~3회 드나든다(`selectedId` 변경 → 재조회 → 재마운트,
`JudgmentPanel`은 `key={session_id}`로 강제 리셋). 안전 관련 항목을 체크했다가
되돌아오면 미체크로 부활 → 원장은 두 번 묻거나 이미 확인했다고 착각한다.

**진료 중 실패 시나리오:** 항응고제 복용 + 목 통증 환자. `neckManipulationLocked =
true`. 원장이 레일 체크리스트에서 항목을 체크 → 헤더 pill이 초록으로 전환 → 다음
방에서 추나 시행. 로직상 잠금은 해제된 적이 없다.

**요구:** (a) 헤더 pill과 안전 상태는 **오직 `compute*Flags` 결과만으로** 계산 —
invariant로 추가. (b) 체크 카운터는 무채색 중립 표시 + "진행 메모(비-임상 기록)" 명시.
(c) 방문 스코프 지속성(`sessionStorage[visit_id]`) 명시 또는 체크박스 폐지 중 택일.

### B5. 판단 저장에 실패 경로가 없고, 성공했을 때 화면은 "저장되지 않음"이라고 표시한다

**코드 사실:**
- `JudgmentPanel.tsx:127~139` — `handleRecord()`는 `onSave?.(finalized)`를 **await하지도,
  결과를 보지도 않는다.**
- `DoctorView.tsx:2646~2656` — 저장 **실패 시 아무 것도 하지 않는다** (에러 상태·토스트·
  로그 없음).
- `JudgmentPanel.tsx:273` — 성공/실패와 무관하게 `기록된 판단 (JSON, 아직 저장되지
  않음)`이 `open` 상태로 렌더된다. 실제로 저장된 경우에도.

**진료 중 실패 시나리오:** LAN이 순간 끊긴 상태에서 "기록" 클릭 → 화면은 판단 JSON을
펼쳐 성공처럼 보임 → 원장은 다음 환자로 이동 → 판단 소실. 8초 타임아웃
(`serverClient.ts:24`) 동안 스피너 없음.

**요구:** 저장 상태 머신 명세(`idle → saving → saved(ts) → error(reason, retry)`),
`onSave` 계약 변경을 명시적 산출물로 승격, 거짓 문구 수정을 완료 조건에 포함.
클라이언트 `recorded_at`과 서버 ack 구분.

---

## 2. 중대 friction (MAJOR)

### M1. tablet usability 8.5 → 실제 4~5. §8.2는 산수를 한 번도 하지 않았다

1024 가용 폭 960px → 6col 블록 468px. 진찰 소견 radio 3지선다 필요 폭 ≈471px →
**확정 줄바꿈**. `judgment__grid`(minmax 280px)는 468px에서 **1열 강제**. 세로:
768 − 크롬 180(top 44 + header 80 + bottom bar 56) = 588px, 브라우저 UI 있으면
~503px. 레일 콘텐츠 실측 추정 **≈1090px → 레일만 2.2 화면.** 하단 action bar 탭은
착지 후에도 계속 스크롤 필요. 크롬이 세로의 23.4%. 환자 앱은 72px 터치 타겟인데
원장만 44px인 근거 부재.

### M2. click/tap 8.5 → 실제 6~6.5. 최빈 상태(REVIEW_REQUIRED)에서 클릭 0→1 증가

fail-closed 특성상 UNKNOWN 하나만 있어도 REVIEW_REQUIRED. REVIEW에서 원장이 알아야
할 "왜 REVIEW인가/잠금 여부"를 초안은 접힘 뒤에 둔다. 현재 UI는 접힘 없이 보여준다.
LBP+HIP, NECK+SHOULDER, ELBOW+WRIST_HAND 동시 렌더 케이스에서는 행 2개 × 1클릭.

### M3. 안전 패널의 `예/아니요` 불리언 칩 31개 — "빈 값은 줄을 만들지 않는다"가 여기엔 적용 안 됨

DoctorView 13 + Hip 6 + AnkleFoot 6 + TMJ 6 = 31개. HIP 환자 한 명이 칩 7개를 보는데
5~6개가 `아니요`. `false`에는 "물어봤고 음성"과 "fail-closed 결과 false"가 섞여 있다 —
이 구분 규칙이 초안에 없다.

### M4. HIP/ANKLE_FOOT/TMJ에는 "추가 권장 검사"가 없다 — 레일 체크리스트가 빈껍데기

`suggested*ExamCodes`는 LBP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND에만 존재. 고관절/발목/
턱 환자는 레일 1급 블록이 미확인 항목 몇 개만 남는다. 하단 bar의 `오늘 확인 (n)` 버튼도
빈 블록을 가리킨다.

### M5. EMR 블록: 존재 조건이 대부분의 방문에서 거짓, 편집 내용이 소리 없이 파괴됨

존재 조건: server 모드 AND visit_id AND recorder 결과 존재 — 녹취 없는 방문(초진
대부분, fixtures 전부)에서 블록 자체가 없다. 초안 wireframe은 상시 블록으로 그림.
그리고 "편집 중이어도 새 recording_id가 오면 항상 덮어쓴다"(주석 명시, 폴링 5초) —
초안은 이 블록을 상시 가시 영역으로 올려 **작업물 소실 확률을 높인다.**

### M6. 10초 가독성 9 → 7. 헤더가 약속한 정보의 절반이 데이터 모델에 없다

차트번호: **저장소 전체에 존재하지 않음** (식별 필드는 성함/휴대폰 끝4/성별뿐). 직전
방문 대비 변화: 이력 데이터 모델 없음 — 초안 스스로 §6에서 이 이유로 Option B를
탈락시켰으면서 같은 데이터를 헤더 슬롯에 넣었다. **NRS 척도 자체가 이 문진에 없다**
(통증 강도는 VISIT_04 일상 영향뿐) — 존재하지 않는 임상 척도를 wireframe 예시로 쓴 것.
헤더가 실제로 새로 주는 정보는 사실상 환자 이름 하나.

### M7. §9.3 타이포 스케일의 전제(Pretendard)가 성립하지 않는다

`@font-face` 없음, CDN 링크 없음, 폰트 파일 없음 — `styles.css:71` font-family 선언
1건뿐. 실제 렌더는 Malgun Gothic(400/700 2종) 가능성이 높고, 그 경우 7단계 스케일이
실질 3단계로 붕괴하며 "회색 대신 무게" 원칙의 수단이 소멸한다. `--text-muted`도
현행 대비 5.7:1 → 초안 4.6:1로 하락.

### M8. §9.4 색 토큰이 환자 앱과 같은 전역 이름을 재정의한다

`:root` 토큰은 환자 태블릿 앱과 공유 — 초안 값 그대로 `:root`에 넣으면 실기기 QA를 막
끝낸 환자 화면의 색이 바뀐다. 스코프/네이밍 규칙 부재.

---

## 3. 초안이 놓친 것 (MISSING)

| # | 내용 | 코드 근거 |
|---|---|---|
| N1 | **서버 제출목록 화면 전체** (상태 배지·시간·안전 배지·EMR 준비·dot·로딩/빈 상태) — 하루 수십 명의 1차 화면이 스펙에 없음 | `DoctorView.tsx:2159~2194` |
| N2 | **`in_consultation`/`completed` 상태 전이 UI 부재** — 라벨·계약은 있으나 세팅하는 UI가 없음(코드가 세팅하는 건 `viewed` 하나) | `serverClient.ts:73`, `store.js:10` |
| N3 | **추가 상세상담(FULL 2차 모듈)의 IA 슬롯 부재** — 안전 관련 원시 응답이 들어올 수 있는 영역(B3 연계) | `DoctorView.tsx:2312~2333` |
| N4 | **응답 모순 감지(`response_consistency_review`)의 자리 없음** — 의뢰서 목표 ③ "모순 즉시 인지"의 유일한 탐지기 | `coreSpec.ts:3897~3900` |
| N5 | **비-부위 안전정보 6종**(수면장애 선별/응답 확인/수술·입원력/추가 전달사항/기타 확인/위험신호 포인터) — "한 줄 = 한 부위" 구조에 들어갈 곳 없음 | `DoctorView.tsx:341~455` |
| N6 | **워크스테이션 플로우**(설정 폼 위치, activate 계약, 진료 중 배지) | `DoctorView.tsx:1943~1950, 2133` |
| N7 | **토큰 플로우 모순** — auth 오류는 목록 화면에서 발생하는데 초안은 "레일 영역에 표시"(레일이 없는 시점) | `DoctorView.tsx:2135~2143` |
| N8 | **fixtures 모드의 레일 정의 부재** — 저장 개념 없는 모드에서 저장 인디케이터가 1급 UI | `DoctorView.tsx:2646` |
| N9 | **토스트 위치 충돌** — 새 상단바 우측과 동일 좌표 | `doctor.css:396~408` |
| N10 | **`sectionOrder.ts`는 렌더를 구동하지 않는 문서용 상수** — 2컬럼에서 DOM 순서 ≠ 시각 순서 | `DoctorView.tsx:7,49` |
| N11 | **명리 compact의 "해석 규칙 미확정 · 원장 판단 영역" 방어 문구** — 초안 축약안에서 소실 위험 | `DoctorView.tsx:261~265` |
| N12 | **원장 화면 레이아웃 검증 수단 부재** — "1 viewport" 주장의 테스트 없음(환자 앱엔 무브라우저 heuristic 선례 있음) | `tests/layout-budget.spec.mjs` |
| N13 | **기존 테스트 충돌 목록 부재** — 13a/13c/13f/13i, 동반문제 정규식(169행), SSR 배지, P2 모듈 패널 문자열 전체가 확정적으로 깨짐. "삭제가 아니라 재작성" 원칙 필요 | `tests/doctor.spec.mjs` |

---

## 4. "예쁘지만 불편" 필터

- **P1. sticky 레일** — 이 저장소는 sticky-vs-overflow 함정에 이미 한 번 빠졌다
  (`styles.css:49~66` 병목 10 주석). 독립 컬럼 스크롤은 그 스택을 다시 건드리고,
  `html.doctor-mode` 규칙은 환자 앱과 같은 파일이다. 그리고 **뷰포트보다 긴 sticky
  요소는 sticky하지 않다** — 레일 콘텐츠 1000px+ vs 가용 660px. "스크롤 0" 주장 불성립.
  → 레일을 뷰포트 안에 들어가게 먼저 설계하고 EMR을 레일 밖(모달/시트)으로.
- **P2. 무경계 섹션** — 5~10초 스캔 화면에서 경계 단서가 여백 하나로 축소(폰트 웨이트
  붕괴와 결합 시). 최소 1개 경계 단서 허용 필요.
- **P3. "색은 마지막" 원칙** — 이 화면의 최우선 목표는 위험 인지. 임상 상태는
  색+형태+텍스트 3중 인코딩이 1차 채널이어야 한다.
- **P4. 전역 Ctrl+Enter=기록** — EMR textarea에서 줄바꿈하려다 판단 확정 저장 위험.
- **P5. fixtures 전환을 ⚙ 메뉴로 숨김** — 서버 장애 시 유일한 복구 동선을 2클릭 뒤로
  숨기면 안 됨. 오류 스트립 안 인라인 액션 필요.

---

## 5. 태블릿 1024×768 검증 (요약)

폭 468px/컬럼(6/6), radio 확정 줄바꿈, 판단 폼 1열 강제, 세로 예산 588px(브라우저 UI
시 ~503px), 레일 ≈1090px = 2.2 화면, 크롬 23.4%. **하단 action bar 실효성 낮음** —
목적지가 길고 스크롤 컨텍스트가 분리되어 "즉시성" 불성립. 권고: 1024–1279 단일 컬럼 +
상단 안전 pill 스트립 + 하단 단일 primary 버튼(판단 bottom sheet). 터치 타겟 48px +
간격 8px 이상(환자 앱 72px과의 차이 근거 명시).

---

## 6. 차원별 점수 재평가 (독립)

| 기준 | 초안 자체 | Opus 독립 | 핵심 근거 |
|---|---|---|---|
| 10초 가독성 | 9 | 7.0 | 헤더 신규 정보가 사실상 이름 하나(M6) |
| information hierarchy | 9 | 7.0 | IA에 구멍 3개(N3/N4/N5) |
| 임상 안전성 | 9 | 5.0 | B1/B3/B4 + B2 사실오인 |
| scan speed | 9 | 7.5 | 분리·우선 정렬은 실질 개선, M7/P2로 단서 약화 |
| 입력 부담 | 9 | 6.5 | 태블릿 레일 불성립(M1), 저장 채널 부재(B5) |
| click/tap 수 | 8.5 | 6.5 | 최빈 상태에서 0→1 증가(M2) |
| tablet usability | 8.5 | 4.5 | 산수 미수행, 레일 2.2화면(M1/§5) |
| visual polish | 9 | 6.5 | 폰트 붕괴(M7), 토큰 스코프(M8), 대비 하락 |
| professional SaaS quality | 9 | 7.0 | 목록 화면·상태 전이 부재(N1/N2) |
| 실제 진료 사용성 | 9 | 5.5 | 워크플로 절반이 스펙 밖(N1/N2), EMR 파괴(M5) |
| **평균** | **8.9** | **6.30** | |

**총평:** 초안은 *설계 방향* 문서로는 우수하고 *구현 명세*로는 미완성. 8.9는 "아이디어가
좋은가", 6.30은 "이 문서로 구현했을 때 원장이 안전하게 쓸 수 있는가"의 점수다.

---

## 7. REQUEST CHANGES (우선순위 순)

🔴 **반드시 (구현 착수 전제)**
1. `deriveSafetyOverview(payload)` 단일 selector 신설·계산식 확정 + node 테스트 (B1)
2. 행 게이트 `safety_flags.* !== null` 단일화, invariant 1 교체, `showLbpExam` 수정 (B3)
3. 3-status 시각 인코딩 = 신규 구현 명시 + 상태별 토큰 확정 (B2)
4. 접힘 정책: URGENT 항상 확장(접기 불가) / REVIEW 기본 확장 / CLEAR 접힘. 잠금 문구
   상시 노출 (M2/B2)
5. 체크리스트-안전표시 완전 분리 invariant + 지속성 택일 (B4)
6. 저장 상태 머신 + `onSave` 계약 변경 승격 + 거짓 문구 수정 (B5)
7. EMR 자동 덮어쓰기 금지 + "결과 없음" 상태 도식 (M5)

🟠 **강력 권고 (승인 전제)**
8. §8.2 폐기·재작성 — 1024–1279 단일 컬럼 + bottom sheet 기본안, 터치 48px (M1)
9. 레일 sticky/독립 스크롤 폐기, EMR 레일 밖 이동 검토, `html.doctor-mode` 무변경 (P1)
10. IA 슬롯 4개 추가: 추가 상세상담 / 응답 모순 / 비-부위 안전정보 6종 / 명리 방어 문구
    (N3/N4/N5/N11)
11. §9.3/9.4 재작성 — 폰트 전략 확정, `.doctor` 스코프 + `--doctor-*`, muted 대비 복원
    (M7/M8)
12. 테스트 갱신 계획표 — "삭제가 아니라 재작성", 13a/13i 등가 테스트 필수 (N13)
13. sectionOrder 실효성 — 렌더 구동 리팩터 또는 HTML 문자열 인덱스 테스트 택일 (N10)

🟡 **반영 권고**
14. 목록 화면 스펙 신설 (N1) · 15. `진료 완료` 액션 (N2) · 16. 워크스테이션/토큰 배치
확정, auth 오류는 목록 화면 상단 (N6/N7) · 17. fixtures 레일 정의 + 오류 스트립 인라인
전환 (N8/P5) · 18. 토스트 재배치 (N9) · 19. 불리언 true만 렌더 + fail-closed 주석 상주
(M3) · 20. 권장 검사 없는 모듈 빈 상태 규칙 (M4) · 21. Ctrl+Enter 폼 포커스 한정 (P4) ·
22. 색 원칙 문장 수정 + 경계 단서 허용 (P3/P2) · 23. 차트번호·NRS 제거, 직전 방문
플레이스홀더 금지 (M6) · 24. 원장 화면 viewport budget 테스트 신설 (N12)

### 재검수 조건

항목 1~13이 반영된 v0.2 재제출 시 재검수. 특히 **항목 2(LBP 게이트)는 재설계와 무관하게
현재 코드에 존재하는 fail-open 결함**이므로, 재설계 PR과 별개로
`claude/fix-lbp-safety-panel-gate` 단독 PR로 먼저 처리할 것을 Product Owner에게 권고한다.
