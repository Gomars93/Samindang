# Core Reduction Phase 5 — Fable Synthesis (Final Architecture) v1.1

> 확정: Fable. 입력: Phase 2/3/4 + 저장소 제약 + **Phase 6 Gate 심사(FAIL, B1~4·
> M5~11·m12~14 — `CORE_REDUCTION_PHASE6_GATE_v0.1.md`) 전면 반영.**
> 상태: **Phase 6 delta 재심사 대상.**
>
> **v1.0 → v1.1 changelog (게이트 반영):**
> B-1 Queue 배지 4값+needs_attention 마커 · B-2 nextVisitCheckItem 제거 철회→
> HUMAN DECISION #5 · B-3 herbal 접근 정책 확정(파생 렌더+명시 추가 액션) ·
> B-4 레인1 "요약 좌측/전문 우측 비접힘" 재규정+세로 지표 · M-5 레인1 상태 5값 ·
> M-6 자동 펼침 절대 규칙+행별 조건식 · M-7 발급 상시 노출 복원+클릭 내역 표
> (Phase 4 §8) · M-8 신선도 최엄격 통일 확정 · M-9 격리 장치 9종 행방 표 ·
> M-10 P0-8 신설(auth 저장 실패 복구) · M-11 충돌 해소 3 신설(concept ⑥ 복원) ·
> m12 HUMAN DECISION #6 · m13 row 14/81 확정 · m14 배너 조건 보강.

## 1. 최종 mental model (한 줄, 확정 — 불변)

> **"누굴 볼지 → 막는 게 있는지 → 오늘 확인·판단·처치 → 언제 어떻게 다시 볼지 — 나머지는 참고와 설정."**

원장이 배우는 화면 개념 **7개**: 오늘 / 환자 / 확인 / 판단·처치 / 다음 / 참고 / 설정.

## 2. 확정 사항

### 2.1 레이아웃 — V3 채택 (게이트 B-4 반영 재규정)
- **좌측 고정 열 = 고정 높이 요약만** (자체 스크롤 금지): 신원(이름·chart_no·성별/
  나이) · 주호소·기간 · "지난 대비"(환자 보고 스타일) · **레인1 안전 결론 요약**
  (상태 칩 + 잠금 여부 🔒 + 관련 부위 N개 명단 + `근거 보기` 앵커) · 저장 상태.
  1024×768에서 ~200px, 834 portrait 상단 스티키 ~96px(2줄 압축) — 어떤 케이스에도
  고정 높이 초과 금지.
- **레인1 전문(위험신호 배너 원문·계산불가 메타 경고·부위별 칩·잠금 문구·권장 검사
  목록)은 우측 작업 열 최상단, 접힘 컨트롤 없이** 렌더 — "요약은 좌측(상시 시야),
  전문은 우측 최상단(비접힘)". URGENT/부위 다발/검사 15개+ 케이스는 우측 열의
  자연 흐름으로 수용(우측 열은 페이지 스크롤). 최악 케이스 치수: Phase 4 §8.
- 우측 작업 열 순서: **레인1 전문 → 레인2 → 판단·처치 → 다음/종결.**
- 지표 추가(§5): 좌측 열 자체 스크롤 0 · 레인1 요약 vertical overflow 0.

### 2.2 레인1 요약 상태 (게이트 M-5)
상태 집합 5값: `URGENT / 확인 필요 / 계산불가 / CLEAR / 해당없음(안전 문진 없음)`.
**per-region 계산불가(패널별 발화 조건 포함)가 1건이라도 있으면 CLEAR 표기 금지**,
요약에 `계산불가 — [부위명]` 병기. 공통 배너 조건과 패널별 조건의 합집합이 요약의
입력이다 (fail-open 방지).

### 2.3 Queue (게이트 B-1·M-8 반영)
- **행 배지 4값**: `🔴 URGENT / 🟡 확인 필요 / 🟢 CLEAR / ▦ 안전 계산 없음`(회색·
  무채색·사선 — CLEAR와 명확히 다른 시각 언어). 재진·CRM 행은 항상 4번째 값 —
  **안전 계산이 없는 행에 안전 결론을 단언하지 않는다.**
- **`needs_attention`(신규 증상·이상반응 환자 보고) = 행 수준 필수 마커** `⚠ 추가
  확인 필요` — PATIENT_FACT이지만 안전 관련이므로 접힘·생략 불가.
- **신선도 규칙 확정(최엄격 통일)**: 소스별 폴링 실패 시 해당 소스의 행을 stale로
  유지하지 않고 제거하되, 그 자리에 **명시적 안내 행** `"[새 문진/재검/연락·확인]
  목록을 불러오지 못했습니다 — 다시 시도"`를 남긴다. 침묵 소실·stale 위장 모두 금지.
- 4조건(resolved identity 선행 / 신선도 / 행 유형 배지+재진 부기 / 환자 1행+펼침 N)
  은 v1.0 그대로.

### 2.4 판단·처치의 pain/herbal 정책 (게이트 B-3 확정 — 3택 중 ①)
- **파생 프로필 기준으로 해당 필드 세트만 렌더**한다 (pain 파생 → pain 판단·처치;
  herbal 파생 → herbal; mixed → 양쪽 자연 배치).
- 판단·처치 하단에 **명시 액션 `+ 다른 유형 입력 추가 (한약·전신 ⇄ 통증)`** 를
  상시 배치 — 수동 override의 개념적 후계자. 1클릭으로 반대편 필드 세트가 열리고,
  **내용이 이미 저장되어 있으면 자동으로 열린 상태로 렌더** (`open={herbal쪽 내용
  존재}` — 접근 불가 0). 자동분류 배너·세그먼트·혼합 탭은 여전히 기본 UI에서 제거.
- free-text 증가 0 유지: 반대편 세트는 요청 전까지 미렌더.
- 리셋: 기존 render-time reset(`recordKey` 비교)이 `profileOverride` 대신 이 "추가
  입력 열림" 상태를 동일하게 초기화한다 — 격리 표(§2.8) 참조.
- Phase 1 #38(수동 보기 원복)의 후계 경로 = 이 액션의 토글.

### 2.5 "다음" / nextVisitCheckItem (게이트 B-2 — 제거 철회)
- **v1.0의 "nextVisitCheckItem UI 창구 제거"를 철회한다.** 파급 4곳(carry-forward
  쓰기 경로·NextActionCard 소스·EMR/환자 전달문 템플릿·blank 판정 3함수)이 이 필드
  에 걸려 있고 `getPatientHistory` 투영에도 없어 "정보 손실 0" 주장이 성립하지 않음
  이 게이트에서 실증됐다.
- **이번 범위: 두 입력을 "다음" disclosure 안에 나란히 배치 + 관계 라벨 명시**
  ("재평가 대상(측정 추적)" vs "다음 방문 확인 메모(자유 기록)") — 데이터·흐름
  무변경, 혼동만 라벨로 완화.
- 통일(제거) 여부는 **HUMAN DECISION #5**로 승격 (파급 4곳 정리 계획 포함해 별도
  결정).
- 나머지 "다음" 구조(NextActionCard 유일 기본 표면 + 3줄, 폼 disclosure, UNSET
  기본·간격 발명 금지)는 v1.0 그대로.

### 2.6 충돌 해소 3건 (게이트 M-11 추가)
1. StructuredReassessment → "확인" 레인2 (Opus §4-c, v1.0과 동일).
2. 확인 = 레인 2분할, 경계 침범 금지 (Opus §4-b, v1.0과 동일).
3. **(신설) Opus 필수 concept ⑥ "이전 추적 항목(라벨+기준값 raw)" 복원**: 참고
   drawer 강등이 아니라 **레인2 최상단 고정 1줄** `지난번 추적: <라벨> — 기준값
   <raw>` (이전 기록 존재 시; 오늘 재검 입력의 문맥 제공). 원장 기록(FOLLOW_UP_
   TARGET 스타일)로 표시 — 좌측 열의 환자 보고("지난 대비")와 시각 구분.

### 2.7 발급·메시징 (게이트 M-7 — disclosure 철회)
- **발급(기본 채널)은 "다음" 영역 안에서 상시 노출** — P0-3(안전 배너 아래)만
  충족하면 상시 노출은 금지선 위반이 아니다. 기본 채널 도달 0클릭 유지.
- "다른 방법"(비기본 채널 3종)·재발급·무효화는 details로 접되, **활성 세션 또는
  미소비 토큰 존재 시 자동 펼침** (`open={activeSession || unconsumedToken}`) —
  중복 발급·회수 누락 방지. WAITING/EXPIRED 상태는 발급 블록에 상시 표기.
- 행동별 클릭 내역 표: Phase 4 §8 (현행 대비 기본 경로 증가 0 검증).

### 2.8 Cross-patient 격리 장치 9종의 행방 (게이트 M-9 — 확정 표)

통합 셸 리셋 키: **`submission:<id> | visit:<visit_id>`** (record kind + server id
합성 문자열; fixtures는 `fixture:<session_id>`).

| 장치 (Phase 3 §5-7) | 행방 |
|---|---|
| `key={patient_id}` (MedicationCourse) | **그대로** (재진 마운트 시에도 동일 규약) |
| `key={session_id}` (JudgmentPanel) | **대체** — 해체 후 각 이동처가 통합 리셋 키 사용 |
| ErrorBoundary `key` | **대체** — 통합 리셋 키로 교체 (visit 포함, 게이트 지적 해소) |
| `loadEpochRef` (MedicationCourse) | 그대로 |
| `patientIdentitiesSeqRef` | 그대로 |
| DoctorWorkspace render-time reset | **유지·확장** — 비교 키를 통합 리셋 키로, 초기화 목록에 §2.4 "추가 입력 열림" 상태 포함 (key-remount 방식 금지 — DOM 이중 마운트 전례) |
| MessagingPanel phone 리셋 | 그대로 (visitId → 통합 키) |
| RevisitWorkspace 전량 리셋 | **통합** — 동일 셸에서 통합 리셋 키 하나의 경로로 수렴 (submission↔visit 전환 = 키 변경 = 전량 리셋) |
| MedicationCourse draft 초기화 | 그대로 |

### 2.9 진료 중 인증 복구 (게이트 M-10 — P0-8 신설)
autosave/저장 실패의 `kind === 'auth'`를 구분하여, 좌측 열 저장 상태가
`인증 만료 — [토큰 다시 입력]` 인라인 액션을 띄운다 (설정 이동 불필요, 진료 흐름
내 복구). 일반 실패는 현행 "저장 실패 — 다시 시도" 유지.

### 2.10 자동 펼침 절대 규칙 (게이트 M-6)
> **모든 HIDE/disclosure 항목은 `open={내용 있음}` 조건과 짝을 이룬다. 예외 없음.**

| 항목 | open 조건식 |
|---|---|
| 발급 "다른 방법"/재발급·무효화 | `activeSession \|\| unconsumedToken` |
| 판단·처치 반대편 필드 세트 (§2.4) | `해당 세트에 저장값 존재` |
| 관리 계획·다음 재평가 disclosure | `!isCarePlanEmpty(...) \|\| plan.status !== 'UNSET'` (현행 계승) |
| 오늘 재검 목록 | `items.length > 0` (현행 계승) |
| MicroFollowUp 상세 | `needsAttention` (현행 계승) |
| 투약 코스 | `courses.length > 0` (현행 계승) |
| 재활 제안/병기 후보 disclosure | `항목 존재` |
| 참고 내 각 아코디언 | 저장값 존재 시 해당 그룹 배지 표시 (`기록 있음 n`) |
| 메시징 attempt/error 상세 | `실패 상태` |
| ConflictBanner 초안 | 배너 자체 비접힘, 초안은 "복사" 버튼 |

### 2.11 v1.0에서 불변인 확정 (게이트 검증 통과 항목)
숨김/이동 목록(프로필 배너·questionnaire_mode·라우팅 노트·동반문제 legacy·JSON·
Episode 조건 노출·CRM enum 임상어·워크스테이션/토큰/fixture→설정) ·
JudgmentPanel 해체 이동 + 라벨 오류 수정 · provenance 아이콘+범례 · 발급 capability
전량 보존 · Revisit 계약(3구역·carry-forward 3버튼·별도 persistence) 보존.

## 3. Current | Proposed | Action | Reason — v1.0 표 기준 변경분만

(v1.0 §3 표는 유지하되 아래 행을 교체/보강한다. 나머지 행 불변.)

| # | 변경 내용 |
|---|---|
| 2·3 (재진/CRM 행) | 배지 `▦ 안전 계산 없음` 고정 + **needs_attention `⚠ 추가 확인 필요` 마커 신설(접힘 불가)** — B-1 |
| 4 (워크스테이션) | 배너 조건 "미설정 **또는 (미설정+current-visit 존재)**" — m14 |
| 5 (토큰) | Reason에 §2.9 진료 중 auth 복구 경로 병기 — M-10 |
| 9 (진료 중 배지) | HIDE 유지하되 m14 배너 조건과 연동 |
| 11/13/16 (발급·메시징) | disclosure → **"다음" 내 상시 노출(기본 채널)** + 세부만 details(자동 펼침 조건) — M-7/M-6 |
| 14 (QR) | Reason: PERSONAL_QR 선택 시 필수 표면, 조건부 렌더 유지 — m13 |
| 36 (SafetyGlance) | 레인1 요약 상태 5값 규칙(§2.2)으로 병합 — M-5 |
| 37~38 (프로필) | RM-UI 유지 + **후계 경로 = §2.4 "+ 다른 유형 입력 추가" 액션** — B-3 |
| 41~49 (부위 패널) | "레인1 단일 프레임" = **우측 열 최상단 비접힘 전문** + 좌측 요약 (§2.1) — B-4 |
| 56/65 (최종 판단) | 단일 창구 + §2.4 파생 렌더 정책 — B-3 |
| 57/66 + 60/69 | **nextVisitCheckItem 제거 철회** — 나란히 배치+관계 라벨, HUMAN DECISION #5 — B-2 |
| 58/67 (오늘 재검) | 레인2 + **최상단 "지난번 추적" 고정 1줄** (§2.6-3) — M-11 |
| 81 (학습 케이스) | **판단·처치 disclosure 내 배치** (ClinicianJudgment 소속 유지) — m13 |
| 85~88 (투약) | 재진 접근은 **HUMAN DECISION #6** (승인 시 patient_id key 규약 동일 적용) — m12 |

## 4. 선행 결함 수정 (구현 P0 — 8건으로 확대)

v1.0의 1~7 + **P0-8: 저장 실패 auth 구분 + 진료 중 토큰 재입력 경로** (M-10).

## 5. Core Reduction Metrics (게이트 반영 보강)

v1.0 표 + 추가:
| 지표 | 목표 |
|---|---|
| 좌측 고정 열 자체 스크롤 | 0 (전 케이스) |
| 레인1 요약 vertical overflow | 0 (전문은 우측 열 소속이므로 예산 제약 없음, 비접힘만 보장) |
| 발급 기본 채널 도달 클릭 | 증가 0 (상시 노출 유지) — 비기본 채널 +1은 명시 인정 |
| Queue 소스 폴링 실패 시 침묵 소실 | 0 (안내 행 필수) |

## 6. 구현 단계 (불변 + 보강)

P0(8건) → P1 Queue(배지 4값·needs_attention·신선도 안내 행·identity 동봉) →
P2 V3 셸(§2.1 좌/우 분배 + §2.8 통합 리셋 키) + 레인1/2 → P3 판단·처치(§2.4)+
다음(§2.5·§2.7) → P4 참고/설정 → P5 반응형 → P6 상태·메트릭 테스트.
각 단계 완료 조건에 **§2.10 자동 펼침 조건식 구현 여부**와 **§2.8 표의 해당 장치
검증** 포함.

## 7. HUMAN DECISION REQUIRED (6건)

1. P0-4 범위: pain 진찰 자유 기록(OBSERVED)까지만 (추천) vs 검사 제안 자동 생성
   규칙 신설(임상 규칙 발명 — 범위 밖).
2. `in_consultation` 자동 전이 (기존 미결).
3. 병렬 redesign 브랜치 처분 (visual reference로만 사용 중).
4. CRM reason_code 임상어 라벨 문구 확정.
5. **(신설, B-2)** `CarePlan.nextVisitCheckItem` ↔ `FollowUpTarget` 통일 여부 —
   파급 4곳(carry-forward 쓰기/NextActionCard 소스/EMR·환자 전달문 템플릿/blank
   판정 3함수) + `getPatientHistory` 투영 확장을 포함한 별도 계획 필요. 이번 범위
   에서는 양쪽 유지+라벨 명시.
6. **(신설, m12)** 재진 화면 투약 코스 마운트 — 기존 컴포넌트의 표면 확장이
   "기능 추가 없음" 원칙의 예외인지 PO 판단.
