# Core Reduction Phase 3 — Opus Anti-Anchoring 독립 구조 검토 v0.1

> 수행: Opus (독립 서브에이전트, 격리 worktree, read-only). **Fable 안을 일절 제공하지
> 않은 상태에서** 저장소 코드만으로 독립 판단 (anti-anchoring).
> baseline: `feat/doctor-clinical-workspace` @ `4a9b2df` — `DoctorView.tsx` 4,271줄
> 전체, workspace 44파일, `src/crm/`, `server/index.js` 라우트 전체 열람.
> 결론: 현재 사용자-visible concept **약 57개** (헤딩/aria/칩/배지/버튼 단위) →
> 원장 workflow가 실제로 요구하는 최소 집합 **12개**.

## 1. Workflow 단계별 필수 concept 최소 집합 (12개)

| 순간 | 원장의 질문 | 필수 concept |
|---|---|---|
| 진료 전 | 지금 누구를 봐야 하는가 | ① 대기 행 (이름+chart_no·무엇 때문에·시각·안전 여부·초/재진) |
| 열람 10초 | 누구인가 | ② 신원 (이름+chart_no, FROZEN) |
| | 무엇 때문에 왔나 | ③ 주호소 (+기간·일상 영향) |
| | 지금 막는 것이 있나 | ④ 안전 결론 한 줄 + 근거 보기 (잠금 포함) |
| | 지난번 대비 어떤가 | ⑤ 환자 보고 변화 (재진 시만) |
| | 지난번에 뭘 추적하기로 했나 | ⑥ 이전 추적 항목 (라벨+기준값 raw) |
| 확인 | 오늘 확인/해소할 것 | ⑦ 오늘 확인 목록 (진찰+모순+UNKNOWN 한 목록) |
| | 확인 결과 | ⑧ 결과 입력 (POSITIVE/NEGATIVE/UNCLEAR/아직 — 4상태 유지) |
| 기록 | 오늘 판단 | ⑨ 오늘 판단 |
| | 무엇을 했나 | ⑩ 오늘 처치 |
| 종결 | EMR에 뭘 넣나 | ⑪ 나가는 텍스트 하나 (편집+복사) |
| 다음 | 뭘·언제 보고, 환자는 뭘 하나 | ⑫ 다음 (추적 1~3 + 환자 할 일 + 언제) |

**시스템에는 있으나 진료 중 원장이 요구하지 않는 것**: 프로필 세그먼트, Episode,
delivery mode, station, task_type/reason_code, questionnaire_mode 배지, 라우팅 노트,
동반문제(legacy), JSON 뷰, 저장 스키마 문자열, 명리 정책 pending 경고 —
"누군가는 필요하지만 진료 중인 원장은 아니다."

## 2. 분류 핵심 (전체 판정 표 요지)

- **MERGE**: 제출/재진/CRM 목록 → ① 대기 행 (조건부, §4-a) · SafetyGlance 칩 →
  ④ 내부 · 부위 패널 "추가 권장 검사" → ⑦ · AdditionalConcern → ⑦ · hero
  안전이슈 metric → ④와 단일화 (현재 같은 사실이 목록행·hero·SafetyGlance·부위
  패널 **4곳**에 다른 문구로)
- **MOVE**: Micro Follow-up 발급 섹션 전체 → "다음"/종결 하단 (**현재 안전 배너보다
  위, 항상 펼쳐짐**) · 태블릿 배정/관리 → 직원·설정 · 워크스테이션/토큰 → 설정 ·
  녹취·EMR → ⑪ 종결 · JudgmentPanel → 해체 이동 (객관 소견 2종 → ⑧, 나머지 →
  명리/감사 기록) · CRM 담당/소속 → 직원 뷰
- **HIDE**: 프로필 세그먼트+혼합 탭 (시스템 모델 노출 — 단 RISK: 안전 패널 가시성
  결부, §5-1) · 전달방식 4칩(기본 1+"다른 방법") · Episode(자동화 가능한 것은
  자동) · 메시징 attempt/error 상세 · ConflictBanner JSON 원문(복사 버튼으로) ·
  "현재 진료 중" 배지 · 코스 provenance 문구 · 명리 정책 경고의 파일 경로
- **REMOVE(기본 UI)**: questionnaire_mode 배지 · "시스템 라우팅 —" 노트 ·
  동반문제 legacy 섹션(자체 주석이 "항상 비어 있다" 명시 — 레거시 레코드만 조건부)
  · 원본 JSON(진단 모드로) · JudgmentPanel의 "아직 저장되지 않음" 거짓 라벨
- **KEEP + RISK 명시**: 위험신호 배너 · "안전 계산값을 읽을 수 없습니다" 메타 경고
  (동급 강등 금지) · 시그마 연결 2단계 확인(축소 금지, 되돌릴 수 없는 연결) ·
  링크 재발급/무효화(회수 능력) · UUID 폴백 라벨(이름 아님을 숨기지 말 것) ·
  재진 이어가기 3버튼(합치면 round 10 버그 재발) · 저장 실패/충돌 표시

## 3. 시스템 모델 → 화면 개념 사례 (발췌)

1. **저장소 3개 = 화면 섹션 3개**: `DoctorView.tsx:3329` 주석 스스로 "deliberately
   a SEPARATE section" — submissions/visits/CRM task 저장 경계가 화면 경계가 됨.
2. **발급 인프라가 임상 화면 최상단 점유**: `:3437~3643`이 탭·CommonSafetyBanner보다
   먼저, 항상 펼쳐진 채 렌더. **안전 배너가 스크롤 아래.**
3. **view_profile이 안전 표면을 좌우**: 부위 패널 9종이 `PainWorkspace:290~304`
   에서만 마운트 — herbal 프로필이면 `safety_flags` 계산값(잠금 포함)이 기본 화면
   어디에도 없음. 프로필 게이트 ≠ safety_flags 게이트 (**fail-open 클래스**).
4. **CRM 모델 노출**: Episode 선택 문구, task_type 3×reason 11×status 7 = 조합
   231가지, "출처: doctor_manual_entry".
5. **결정지원 3종이 production에서 빈 구조**: exam suggestion/evidence/pattern/
   rehab 전부 `synthetic`에서만 seed — **pain 측 오늘 진찰 소견을 기록할 production
   경로가 사실상 없음** (남은 건 다른 탭의 LBP/SHOULDER radio 2개).
6. **안전 입력이 비기본 탭에**: `lbp_objective_motor_deficit` 입력은 자료 보기 탭,
   그 결과(URGENT_REVIEW)는 진료 탭.
7. 폐기 스키마 자리(동반문제) · 라우팅 내부값 노출 · JSON/직렬화 문구 노출 ·
   배포 구성(워크스테이션/토큰)이 헤더에 · 영문 내부 용어가 화면 라벨.

## 4. 통합 검토 3건 판정

### (a) 제출목록+재진+CRM → "지금 누구를 봐야 하는가" — **조건부 가능 (4조건 전부 충족 시)**
1. **신원 해소 선행 (blocker)**: 재진 행은 신원 미표시(`listRevisitQueue`가
   patient_id UUID만), CRM 미연결 행은 `환자 a1b2c3d4…`. 서버가 세 소스 모두에
   resolved identity를 붙이기 전 통합 불가. 이름/전화 매칭 병합은 절대 금지 —
   미해소 행은 "신원 확인 필요"로 별도 표시.
2. **신선도 규칙 상이**: submissions/revisits는 실패 시 stale 유지, crmTasks는
   null로 비움 — 행/섹션 수준 신선도 유지 또는 최엄격 규칙 통일.
3. **행이 여는 화면의 안전 계약 상이**: 제출→안전 표면 있음 / 재진→**안전 표면
   없음**(문진 없어 flags 부재, 의도된 설계) / CRM→클릭 없음. 행 타입 배지 유지 +
   재진 행에 "문진 없음 — 안전 계산 없음" 행 수준 표기.
4. **카디널리티**: 환자 1행 기본 + 펼치면 항목 N개.
- **부수 발견**: 제출목록은 큐가 아니라 **아카이브** — limit 없이 전체 반환,
  'completed' 전환 액션 부재('viewed'만 사용). **통합의 전제 = "종결" 개념 신설.**

### (b) 안전 통합 → **부분 가능: 레인 2개로 분리, 경계 침범 금지**
- **레인 1 "지금 막는 것"** (접힘·완료 상태 없음, 항상 최상단): 위험신호 배너 +
  계산불가 메타 경고 + 부위 패널(제약이지 목록이 아님 — 원장 입력으로 닫히지 않음).
  **부위 패널을 DoctorWorkspace 레벨로 승격 필수** (§3-3 해소 없이는 통합이 위험을
  고착).
- **레인 2 "오늘 확인할 것"** (4상태 입력, 완료 시 접힘 가능): exam suggestion +
  모순/반증 + UNKNOWN + herbal 관찰 체크리스트 + 부위 패널 권장 검사 +
  AdditionalConcern 플래그. 전부 SUGGESTED/OBSERVED, closable — 흩어진 이유는
  임상이 아니라 라운드별 추가 이력.
- 경고: 레인 2 소스 중 둘은 production에서 빈 값 — pain 측 진찰 입력 경로 신설이
  선행 과제.

### (c) "다음" 통합 → **통합이 아니라 재배치. 시간축 3개**
- **진짜 중복 1건**: `CarePlan.nextVisitCheckItem` ↔ `FollowUpTarget` — 같은 질문.
  후자로 통일, 전자 제거 (지금은 원장이 매번 어느 쪽에 쓸지 고름).
- **NextActionCard = 개념이 아니라 표시** — "다음"의 유일한 기본 표면으로 유지,
  폼들은 disclosure 아래 (현 구조 유지가 맞음).
- **불가 1**: StructuredReassessment를 "다음"에 넣지 말 것 — NOT_YET_CHECKED가
  "todo"로 읽히는 순간 기록 데이터가 작업 목록이 됨 (provenance.ts: "single most
  safety-relevant invariant"). 재검은 "오늘 확인" 소속.
- **불가 2**: MicroFollowUp 응답을 계획과 같은 영역에 넣지 말 것 — PATIENT_FACT ≠
  PLAN. "환자가 좋아졌다 했다" ≠ "내가 좋아졌다 판단했다".
- **조건부**: NextReassessmentPlan("언제")과 FollowUpTarget("무엇")은 데이터 분리
  유지, 표시만 한 카드 두 줄. 기본 간격(2주 등) 발명 금지(UNSET 규칙).
- 결론: 6개 → 사용자 "다음" 카드 1개 + 3줄 (다음에 확인할 것/환자가 할 일/언제 다시).

## 5. 단순화 금지선

- **5-1 Safety visibility**: red flag·계산불가·잠금은 접힘/완료/탭 뒤 이동 불가.
  신규 발견 위험 2건 — 부위 패널 profile 게이트(≠ safety_flags 게이트), 안전 입력
  radio가 비기본 탭.
- **5-2 UNKNOWN ≠ NO**: 3계층 4상태(PatientResponseState/ExamCheckStatus/Field
  muted) 각각 유지. hero 안전이슈 4값을 하나로 줄이면 fail-open.
  `isUnreadableReproductiveDerived` ~400줄 방어 코드의 존재 이유.
- **5-3 Provenance**: 7종 배지 축소 가능, 분류 소멸 금지. SUGGESTED→OBSERVED 자동
  승격 금지. 명리 "계산≠해석". Revisit 3구역 경계.
- **5-4 발견 가능성**: 숨김은 반드시 "내용 있으면 자동 펼침"과 짝 (현 코드의
  `open={...}` 패턴들이 모범 — 단순화 시 이 규칙 누락이 최대 위험).
- **5-5 Longitudinal**: patient_id 정확 일치 조회만. 이어가기 3버튼 분리 유지
  ("이전 진찰 소견·측정값은 이어가지 않음"). 자동 비교/델타 발명 금지
  (승인된 개선 임계 없음). 비대칭 발견: 재진 화면에서 투약 코스 접근 불가.
- **5-6 Follow-up capability**: 재발급·무효화·1회성 토큰(해시만 저장)·station_busy
  409·채널 4종·STAFF_ASSISTED provenance 문구 전부 보존.
- **5-7 Cross-patient 격리 장치 목록** (통합 시 각각의 행방을 답하지 못하면 통합
  금지): patient_id key 리마운트, session_id key, ErrorBoundary key, loadEpochRef,
  patientIdentitiesSeqRef, DoctorWorkspace render-time reset(key 방식은 실제 DOM
  이중 마운트로 실패한 기록 있음), MessagingPanel phone 리셋, Revisit 전량 리셋,
  MedicationCourse draft 초기화.
- **5-8 Identity**: 1:1, 이름+chart_no, RRN 없음, 전화≠identity, 자동병합 금지,
  **연결 불가역 — 2단계 확인 축소 금지**, 이름 매칭 행 병합 절대 금지.

## 부록 — 단순화 이전 선행 수정 7건 (우선순위)

1. 부위 SafetyPanel을 DoctorWorkspace 레벨로 승격 (profile 게이트 해소)
2. LBP/SHOULDER 객관 소견 입력을 진료 탭으로 (FROZEN 입력이 비기본 탭)
3. 재진 발급 섹션을 안전 배너 아래로
4. pain 측 진찰 소견 입력 경로 신설 (StructuredReassessment 항목 생성 불가 상태)
5. "종결" 개념 신설 (목록이 아카이브인 문제)
6. 재진 큐 행에 환자 신원 추가 (통합 blocker)
7. JudgmentPanel "아직 저장되지 않음" 라벨 오류 수정
