# Core Reduction Phase 1 — Baseline UX/Structure Audit v0.1

> 수행: Sonnet (Phase 1 담당, 격리 worktree, read-only)
> baseline: `feat/doctor-clinical-workspace` @ `4a9b2df`
> 렌즈: impeccable UI Skill 공식 방법론 (critique.md / distill.md / operate.md 원문 참조)
> 결론 요약: **사용자-visible concept 총 90개** (부위 안전패널 9개 개별 계산 기준; 템플릿
> 묶음 시 82개). distill.md의 Working Memory Rule(8+ = overloaded)을 압도적 초과.
> DELETE 후보 0개 — 순수 dead code 없음, 전부 실제 임상 로직/기능 담당.

## 1. Concept 전수 목록 (90개)

### A. 대기(Queue)/세션 진입 (#1~10)
| # | Concept | 위치 | 행동 |
|---|---|---|---|
| 1 | 제출목록 (N) | DoctorView.tsx L3279 | 행 클릭→기록 열기 |
| 2 | 재진 목록 (N) | DoctorView.tsx L3336 | 행 클릭→RevisitWorkspace |
| 3 | 오늘 할 일 CRM (N) | TodayQueueSection.tsx | 읽기 전용(+식별 연결) |
| 4 | 워크스테이션 설정 필요 | WorkstationSetup.tsx | 프리셋/직접 입력 |
| 5 | 원장 인증(doctor token) | DoctorTokenSetup.tsx | 입력/저장/지우기 |
| 6 | 데이터 소스 선택 | DoctorView.tsx L3190 | select (프리뷰 전용) |
| 7 | 미리보기 예시 데이터 | L3208 | select (프리뷰 전용) |
| 8 | Workspace 시나리오 | L3224 | select (프리뷰 전용) |
| 9 | 현재 진료 중 배지 | L3249 | 읽기 |
| 10 | EMR 준비 토스트 | L3172 | 읽기 |

### A-2. 재진 간단 문진(Micro Follow-up) 발급 (#11~16, submission 열람 중 노출)
| # | Concept | 행동 |
|---|---|---|
| 11 | 전달 방식 선택 (원내 태블릿/QR/직원 대필/내원 전 링크) | 클릭 |
| 12 | 태블릿 배정 (station 선택) | select+버튼 |
| 13 | 링크 발급/복사/재발급/무효화 | 버튼 4종 |
| 14 | QR 코드 (FollowUpQrCode) | 읽기 |
| 15 | 원내 태블릿 관리 (등록/초기화/페어링) | 입력+버튼 (details 접힘) |
| 16 | 문자/알림톡 발송 (MessagingPanel) | 입력+버튼 |

### B. 기록 화면 구조 (#17~20)
| # | Concept | 행동 |
|---|---|---|
| 17 | 탭: 진료/자료 보기/명리 (L3671) | 탭 전환 |
| 18 | 문진 모드 배지 | 읽기 (muted) |
| 19 | 원본 응답 JSON (L4259) | 펼치기 |
| 20 | 진료 녹취·요약 (L4164) | 편집/복사/재생성 |

### C. "자료 보기" 탭 원본 응답 (#21~30)
21 환자 기본 · 22 주호소(+시스템 라우팅 표시) · 23 추가 상세상담 · 24 참고 증상 ·
25 동반문제(legacy, 신규 제출 항상 빈값) · 26 상세 증상—[module] · 27 전신·한약 참고 ·
28 약물·병력·알레르기·수술 · 29 여성 안전정보(원본+파생) · 30 검사자료/하고 싶은 말

### D. 명리 탭 (#31~33)
31 명리 핵심(MyungriCompactCard) · 32 명리 검토 3열 · 33 계산주의(정책 대기)

### E. Common Safety + workspace shell (#34~40)
| # | Concept | 행동 |
|---|---|---|
| 34 | 안전 확인 필요 긴급 배너 (requires_staff_check) | 읽기 |
| 35 | "안전 계산값을 읽을 수 없습니다" fallback 배너 | 읽기 |
| 36 | 안전정보 한눈에 (SafetyGlance 칩) | 읽기 |
| 37 | 진료 화면 프로필 세그먼트 (통증/한약·전신/혼합 + 자동분류 표기) | 클릭 |
| 38 | 수동 보기 배너 (+원복 버튼) | 클릭 |
| 39 | 저장 상태 (저장 중/됨/실패/충돌) | 읽기 |
| 40 | 저장 충돌 배너 (ConflictBanner, 초안 보존+재로드) | 클릭 |

### F. 부위별 안전 패널 9종 (#41~49) — 동일 템플릿 반복
41 LBP · 42 NECK · 43 SHOULDER · 44 KNEE · 45 ELBOW · 46 WRIST/HAND · 47 HIP ·
48 ANKLE/FOOT · 49 TMJ — 각자 "안전 확인 — [부위]" 제목 + 칩 세트 + 권장 검사
소목록. `safety_flags.<region> != null` 게이트라 보통 1개, additional 경로에서 2개+
동시 노출 가능.

### G. Pain Workspace (#50~61)
| # | Concept | 행동 |
|---|---|---|
| 50 | 통증 히어로 "오늘 한눈에" | 읽기 |
| 51 | 간단 재확인(Micro Follow-up 응답) | 읽기 (조건부) |
| 52 | 오늘 확인할 것 — 검사 제안 (상태버튼+좌우+메모) | 클릭+입력 |
| 53 | 지지/반증/확인필요 (SupportContradiction, production 빈값) | 읽기 |
| 54 | 추가 문제(Additional Concern) + "오늘 상세평가 필요" 플래그 | 클릭+메모 |
| 55 | 재활/운동 제안 (채택-보류-반려, production 빈값) | 클릭+입력 |
| 56 | 원장 최종 판단 (Pain) — 판단/처치/즉시 재검 | 입력 |
| 57 | 재평가 대상 (Follow-up Target, 최대 3 + 기준값) | 클릭+입력 |
| 58 | 오늘 재검 (Structured Reassessment) | 클릭+입력 (접힘) |
| 59 | 다음 액션 (read-back 요약) | 읽기 |
| 60 | 관리 계획·다음 재평가 (6필드 + NextReassessmentPlan) | 입력 (접힘) |
| 61 | 참고 자료 drawer (이전 방문/환자용 계획/EMR 미리보기) | 읽기+복사 (접힘) |

### H. Herbal Workspace (#62~70)
62 한약 히어로 · 63 임상관찰 체크리스트(설진/맥진/복진, 특이없음 1탭) ·
64 핵심 병기 후보(production 빈값) · 65 최종 변증·병기 원장 판단 ·
66~68 재평가/재검/다음액션(컴포넌트 공유) · 69 관리계획(Herbal 라벨 6필드) ·
70 참고자료 drawer(여성·생식+약물병력 포함)

### I. Revisit Workspace — 독립 병렬 플로우 (#71~76)
71 재진 히어로(무문진 배지) · 72 오늘 환자 입력(MicroFollowUpCard) ·
73 이전 방문 참고 recap · 74 "이전 내용 이어가기" carry-forward 3버튼 ·
75 **Clinical Loop Status bar (재진 전용 — Pain/Herbal엔 없음)** ·
76 visit-owned 별도 persistence (VisitWorkspaceState ≠ WorkspaceState)

### J. JudgmentPanel — "자료 보기" 탭에 위치 (#77~84)
77 원장 판단 기록(선천 특징/증상 연결) · 78 LBP 객관적 근력저하 radio ·
79 SHOULDER 객관적 소견 radio · 80 사주 예상→치료축·처방 4-textarea(접힘) ·
81 학습 케이스 체크 · 82 기록된 판단 JSON · 83 1분 디브리핑(접힘) ·
84 설명 개요(접힘) — **명시적 "기록" 버튼 저장 (다른 카드는 autosave와 상이)**

### K. 투약/CRM/식별 (#85~89)
85 투약/한약 코스(에피소드+코스 카드) · 86 확인 작업 예약(reason 칩+날짜) ·
87 복용 시작일 변경 · 88 에피소드 선택(ACTIVE/PAUSED/COMPLETED/LOST 라벨 노출) ·
89 시그마 연결(PatientIdentityLinkAction, 4단계)

### L. 횡단 (#90)
90 Provenance 배지 7종 (PATIENT_FACT/DERIVED/SUGGESTED/OBSERVED/FINAL_ASSESSMENT/
PLAN/FOLLOW_UP_TARGET) — 거의 모든 카드에 노출

## 2. 핵심 질문 3개 답변

**Q1 개념 과다?** 예 — 90개. 진입 조합: 탭 3 × 프로필 3 × 부위 패널 최대 9.
Cognitive Load Checklist 8항목 중 최소 5개 실패 (단일 초점/청킹/계층 등).

**Q2 같은 목적 분산?** 예 — 그룹 A~E (§5).

**Q3 시스템 모델 노출?** 예 — Provenance enum, EpisodeStatus, safety_flags null
게이트가 IA를 결정, derived.source 내부 경로 문구, 프로필 파생 로직 표기 등 (§4).

## 3. 분류 소계

- **KEEP ~55** (조건부·이미 접힘 포함)
- **MERGE ~14**: #2 재진목록→제출목록(단, 코드 주석의 "deliberately separate" 의도
  재확인 필요) · #3 CRM(탭/필터로) · #36 SafetyGlance→상위 안전 섹션 · #41~49 부위
  패널 표현 계층 통합(로직은 KEEP) · **그룹 A**(FinalAssessment 2종+JudgmentPanel) ·
  **그룹 B**(FollowUpTarget/NextReassessmentPlan/StructuredReassessment 관계 명확화) ·
  #75 Loop Status 일관화
- **MOVE ~6**: #4 워크스테이션·#5 토큰→Settings · #77~ JudgmentPanel→진료 탭 ·
  #78/79 객관적 소견 radio→해당 부위 안전 패널 인접
- **HIDE ~4**: #19 JSON(이미 접힘) · #82 · #90 Provenance 배지(상시 텍스트→범례+
  필요시 노출; 완전 제거는 안전상 금지)
- **REMOVE FROM DEFAULT UI ~3**: #6/#7/#8 프리뷰 컨트롤 → Settings/개발자 모드
- **DELETE 0**

## 4. 시스템 모델 노출 사례

| 내부 개념 | 노출 경로 |
|---|---|
| `Provenance` enum 7종 | 카드마다 PROVENANCE_BADGE 칩 |
| `EpisodeStatus` ACTIVE/PAUSED/COMPLETED/LOST | 에피소드 선택 리스트 라벨 |
| `safety_flags.<region> != null` | 부위 패널 렌더 여부 자체 — 노출 이유 설명 없음 |
| `flags` 유효성 검사 | "안전 계산값을 읽을 수 없습니다" 방어 로직 4곳+ 중복 |
| `reproductive_status.derived.source` | "출처: WOMEN_SAFETY_01…" 내부 경로 문구 |
| view_profile 파생 로직 | "자동 분류: …" 표기 |
| VisitWorkspaceState vs WorkspaceState | 재진에 설진/맥진 체크리스트 부재로 체감 |
| CRM `version`/`dedup_key` | "다른 곳에서 이미 변경" 에러로 간접 누출 |

## 5. 같은 목적 분산 그룹

- **그룹 A — "원장의 최종 판단" (가장 심각)**: PainFinalAssessmentCard(진료 탭,
  autosave) + HerbalFinalAssessmentCard(진료 탭, autosave) + JudgmentPanel(자료 보기
  탭, 수동 "기록" 버튼, 별도 ClinicianJudgment 스키마) — 이름·위치·저장 트리거·스키마
  전부 상이. "판단을 어디에 적나" 3택 문제.
- **그룹 B — 재평가/추적**: FollowUpTargetPicker("재평가 대상") /
  NextReassessmentPlanCard("다음 상세 재평가") / StructuredReassessmentCard("오늘
  재검") — 유사 이름, 다른 시점·데이터. 코드 주석 스스로 혼동 가능성 반복 경고.
- **그룹 C — 안전 3계층**: CommonSafetyBanner / 부위 패널 9종 / 카드 내 개별 안전
  메모 — "안전 확인" 제목 반복, 우선순위 시각 구분 부재.
- **그룹 D — 통상 vs 재진 이중 문법**: DoctorWorkspace(WorkspaceState) vs
  RevisitWorkspace(VisitWorkspaceState) — 컴포넌트 재사용에도 별도 state
  machine·persistence·carry-forward 개념. 두 번째 진료 화면 문법.
- **그룹 E — 3중 네비게이션**: 외부 탭(진료/자료/명리) → 프로필 세그먼트 →
  (혼합 시) 내부 탭 — 현재 위치 추적에 작업기억 소모.
