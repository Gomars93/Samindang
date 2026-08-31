# Core Reduction Phase 5 — Fable Synthesis (Final Architecture) v1.0

> 확정: Fable. 입력: ① Fable 독립 아키텍처(Phase 2) ② Opus anti-anchoring
> critique(Phase 3) ③ UI Skill concept 탐색(Phase 4, V3 추천) ④ 저장소 제약
> (FROZEN/identity/persistence/cross-patient 격리 장치 목록).
> 상태: **Phase 6 Opus Architecture Gate 심사 대상.** BLOCKER/MAJOR 0이어야 구현 진입.

## 1. 최종 mental model (한 줄, 확정)

> **"누굴 볼지 → 막는 게 있는지 → 오늘 확인·판단·처치 → 언제 어떻게 다시 볼지 — 나머지는 참고와 설정."**

시스템 표기: **오늘(Queue) → 확인(레인1 막는 것 / 레인2 오늘 확인할 것) →
판단·처치 → 다음 → 종결** + 참고(Reference) + 설정(Settings).
원장이 배우는 화면 개념: **7개** (오늘 / 환자 / 확인 / 판단·처치 / 다음 / 참고 / 설정).

## 2. 확정 사항 (세 입력의 수렴과 충돌 해소)

- **레이아웃: Phase 4의 V3 채택** — 고정 좌측 컨텍스트 열(신원·주호소·변화[환자
  보고 스타일]·레인1 안전·저장 상태, 스크롤 무관 상시 가시) + 우측 단일 작업 열
  (레인2→판단·처치→다음/종결). 1024×768 landscape 최적, 834 portrait은 좌측 열이
  상단 스티키로 전환(접힘 불가 유지).
- **충돌 해소 1 (Fable vs Opus)**: StructuredReassessment(오늘 재검)는 Fable 초안의
  "판단·처치"가 아니라 **Opus 판정대로 "확인" 레인2 소속** — 4상태(POSITIVE/
  NEGATIVE/UNCLEAR/NOT_YET_CHECKED) 입력 계열이고, "다음"에 두면 NOT_YET_CHECKED가
  todo로 오독된다. LBP/SHOULDER 객관 소견 radio도 레인2로.
- **충돌 해소 2**: Fable 초안의 "확인 통합"은 Opus의 **레인 2분할**로 정밀화 —
  레인1(막는 것: 위험신호·계산불가 메타경고·부위 안전·잠금 — 접힘/완료/탭 금지)과
  레인2(오늘 확인할 것: 4상태로 닫히는 항목)는 같은 영역 안에서도 경계를 넘지 않는다.
- **Queue 통합은 Opus 4조건 충족을 전제로 채택**: ① 서버가 3소스 모두에 resolved
  identity 부여(미해소는 "신원 확인 필요" 별도 행 — 이름/전화 매칭 병합 절대 금지)
  ② 소스별 신선도 규칙 유지 또는 최엄격 통일 ③ 행 유형 배지 + 재진 행 "문진 없음—
  안전 계산 없음" 고정 부기 ④ 환자 1행 + 펼침 N항목.
- **"다음"은 통합이 아니라 재배치**: NextActionCard가 유일한 기본 표면(3줄: 다음에
  확인할 것/환자가 할 일/언제 다시), CarePlan·NextReassessmentPlan 폼은 그 아래
  disclosure. MicroFollowUp 응답은 환자 보고 구역(헤더/좌측 열)으로. `CarePlan.
  nextVisitCheckItem`은 **UI 입력 창구 제거**(FollowUpTarget으로 통일) — 스키마
  필드는 보존, 기존 저장값은 Reference에서 열람 가능(정보 손실 0).
- **발급·메시징(Micro Follow-up 발급, station 배정, 문자)**: "다음" 하단 disclosure
  로 이동 — 안전 배너 위 점유 해소. 채널 4종·재발급·무효화·1회성 토큰·station_busy
  규칙 전부 보존(기본 1채널 + "다른 방법" 펼침).
- **숨김/이동 확정**: 프로필 세그먼트·혼합 탭·자동분류 배너(기본 UI 제거, 분류
  로직은 초기 배치에만 사용) · questionnaire_mode 배지·라우팅 노트·동반문제
  legacy(데이터 있을 때만)·JSON(진단 모드)·Episode 선택(단일 에피소드 시 자동,
  복수일 때만 노출)·CRM enum 라벨(임상어로)·워크스테이션/토큰/fixture→설정.
- **JudgmentPanel 해체 이동**: 객관 소견 2 radio→레인2 · 선천특징/증상연결/사주
  예상→치료축/디브리핑/설명개요→참고(명리·감사 기록 영역, 필드 전부 보존) ·
  "아직 저장되지 않음" 거짓 라벨 수정. ClinicianJudgment 스키마·저장 경로 무변경.
- **provenance**: 7종 분류 유지, 상시 텍스트 배지→아이콘+범례로 축약.
  SUGGESTED→OBSERVED 자동 승격 금지, "계산≠해석", Revisit 3구역 경계 유지.

## 3. Current | Proposed | Action | Reason (Phase 1의 90개 전수 매핑)

범례 — Action: KEEP(유지) / MERGE(통합) / MOVE(이동) / HIDE(disclosure 뒤) /
RM-UI(기본 UI 제거·capability 보존) / FIX(선행 결함 수정). **DELETE 0.**

| # (Phase 1) | Current | Proposed | Action | Reason |
|---|---|---|---|---|
| 1 제출목록 | 독립 섹션 | 오늘 Queue 행(초진) | MERGE | 저장소 경계≠사용자 개념 (Opus §3-1) |
| 2 재진 목록 | 독립 섹션 | Queue 행(재진)+"문진 없음" 부기 | MERGE | 조건 ③ 충족 시 — 안전 계약 차이를 행에 명시 |
| 3 CRM Today | 독립 read-only 섹션 | Queue 행(연락·확인), 환자 1행+펼침 | MERGE | 조건 ④; enum 미노출, 행동 버튼만 |
| 4 워크스테이션 설정 | 목록 화면 상시 | 설정. 미설정 시에만 배너 | MOVE | 1회성 운영 설정 |
| 5 doctor token | 헤더 | 설정/오류 시 | MOVE | 배포 구성 |
| 6~8 데이터소스/fixture/시나리오 | select 3개 | 설정·프리뷰 모드 내 유지 | RM-UI | 이미 preview 게이트 — 임상 빌드 비노출 확인 유지 |
| 9 진료 중 배지 | 헤더 배지 | 내부 상태 | HIDE | current-visit 내부 개념 |
| 10 EMR 토스트 | 유지 | 유지 | KEEP | 유효한 흐름 알림 |
| 11 전달 방식 4칩 | 상시 4택 | 기본 1 + "다른 방법" | HIDE | 채널 capability 보존(제거 금지 — Opus RISK) |
| 12 태블릿 배정 | 임상 화면 내 | "다음" 발급 disclosure 내 | MOVE | 운영 단계를 임상 상단에서 제거 |
| 13 링크 발급/복사/재발급/무효화 | 버튼 4 상시 | 발급 disclosure 내, 4기능 보존 | KEEP+HIDE | 재발급·무효화 = 회수 능력 (RISK) |
| 14 QR | 유지 | 유지(조건부) | KEEP | |
| 15 태블릿 관리 | details | 설정 | MOVE | 페어링 1회성·초기화 보안 계약 보존 |
| 16 메시징 | 임상 화면 내 | 발급 disclosure 내, 전화 비저장 유지 | MOVE | attempt/error 상세는 실패 시만(HIDE) |
| 17 탭 3종(진료/자료/명리) | 3중 nav 축 1 | 진료=기본, 자료·명리→참고 | MERGE | 3중 네비 해소 (그룹 E) |
| 18 문진모드 배지 | muted 상시 | 기본 UI 제거 | RM-UI | 내부 라우팅값 |
| 19 원본 JSON | details | 참고>진단 모드 | RM-UI | 1클릭 접근 유지 |
| 20 녹취·EMR | 자료 탭 | 종결 영역(다음 하단) | MOVE | ⑪ 나가는 텍스트 |
| 21~30 원본 응답 10섹션 | flat h2 나열 | 참고 내 "문진 원본" 아코디언 그룹 | MOVE+MERGE | 원본 보존, 계층만 신설. #25 동반문제는 데이터 있을 때만(RM-UI). #29 여성 안전 파생 박스는 계산값 있는 쪽 보존 |
| 31~33 명리 3종 | 독립 탭 | 참고>명리, 방어 문구·정책 경고 보존(파일 경로만 제거) | MOVE | 격리 원칙 유지 |
| 34 위험신호 배너 | 유지 | 레인1 최상단 | KEEP | 금지선 5-1 |
| 35 계산불가 배너 | 유지 | 레인1, 메타 경고 지위 유지 | KEEP | 동급 강등 금지 |
| 36 SafetyGlance | 별도 칩 그룹 | 레인1 "안전 결론 한 줄+펼침" 내부 | MERGE | 같은 사실 4곳 중복 해소 |
| 37~38 프로필 세그먼트/수동보기 | 상시 | 기본 UI 제거(분류는 내부 배치용) | RM-UI | 시스템 모델 노출; **선행 FIX #1과 결합 필수** |
| 39 저장 상태 | 유지 | 좌측 열 고정 | KEEP | 실패/충돌 표시는 RISK — 제거 금지 |
| 40 ConflictBanner | JSON 원문 | 기능 유지, 원문→"초안 복사" 버튼 | KEEP+HIDE | CAS 계약 무변경 |
| 41~49 부위 안전 패널 9종 | 카드 9종, pain 프로필에서만 | 레인1 단일 프레임 내 부위 리스트, **DoctorWorkspace 레벨** | MERGE+FIX | 표현 통합(로직·게이트 무변경) + 선행 FIX #1(profile 게이트 해소) |
| 50/62 히어로 2종 | 프로필별 카드 | 좌측 열(신원·주호소·변화)로 승격 | MERGE | Q2 10초 |
| 51/72 MicroFollowUp 응답 | 3곳 마운트 | 좌측 열 "지난 대비"(환자 보고 스타일) 단일 | MERGE | PATIENT_FACT 분리 유지 |
| 52 검사 제안 | 카드 | 레인2 항목 | MERGE | closable 4상태 계열 |
| 53 지지/반증 | 카드(prod 빈값) | 레인2 항목(구조 보존) | MERGE | production 공백은 선행 FIX #4와 별개로 구조만 이동 |
| 54 추가 문제 | 카드 | 레인2 항목 | MERGE | |
| 55 재활 제안 | 카드(prod 빈값) | 판단·처치 disclosure(구조 보존) | HIDE | 채택-보류-반려 계약 유지 |
| 56/65 최종 판단 2종 | 프로필별 카드 | **판단·처치 단일 창구** (pain/herbal 필드 자연 배치) | MERGE | 그룹 A 해소, 스키마 무변경 |
| 57/66 FollowUpTarget | 카드 | 다음 1줄("다음에 확인할 것") | MERGE | |
| 58/67 오늘 재검 | 카드 | **레인2** | MOVE | Opus 불가1 — "다음" 금지 |
| 59/68 NextAction | read-back 카드 | "다음"의 기본 표면 | KEEP | 이미 옳은 패턴 |
| 60/69 CarePlan+NextReassessmentPlan | 6필드+계획 카드 | 다음 disclosure. nextVisitCheckItem UI 창구 제거(스키마 보존) | MERGE | 진짜 중복 1건 해소; UNSET 기본·간격 발명 금지 |
| 61/70 참고자료 drawer | 프로필별 drawer | 참고 surface로 통합 | MOVE | 여성 안전은 파생 박스 있는 쪽 유지 |
| 63 관찰 체크리스트 | herbal 전용 | 레인2(공통) | MERGE | 유일한 production 진찰 입력 — 승격 |
| 64 병기 후보 | 카드(prod 빈값) | 판단·처치 disclosure | HIDE | 구조 보존 |
| 71~76 Revisit 화면 | 별도 문법 전체 | 동일 V3 셸 재사용, 3구역 provenance·carry-forward 3버튼·별도 persistence 유지, "문진 없음—안전 계산 없음" 좌측 열 표기 | MERGE(셸)+KEEP(계약) | 두 번째 문법 제거하되 round 10 버그 방지 장치 그대로 |
| 75 Loop Status | 재진 전용 | 좌측 열 진행 점 4개로 전 화면 일관화 | MERGE | 비대칭 해소 |
| 77~84 JudgmentPanel | 자료 탭 | 해체: radio 2→레인2, 나머지→참고(명리·감사), 라벨 오류 수정 | MOVE+FIX | 선행 FIX #2/#7; 스키마·저장 무변경 |
| 85~88 투약 코스/Episode | Episode 노출 | 코스 카드 유지(임상어 라벨), Episode는 복수일 때만 선택 노출, **재진 화면에서도 접근**(비대칭 해소) | KEEP+HIDE | CRM enum 231조합 미노출 |
| 89 시그마 연결 | 4단계 | 유지 — 2단계 확인 축소 금지 | KEEP | 불가역 연결 (RISK) |
| 90 Provenance 배지 | 텍스트 7종 상시 | 아이콘+범례(참고에 범례), 분류 보존 | HIDE | 금지선 5-3 |

## 4. 선행 결함 수정 (구현 P0 — 단순화 이전, Opus 부록 채택)

1. 부위 SafetyPanel → DoctorWorkspace 레벨 승격 (profile 게이트 fail-open 해소)
2. LBP/SHOULDER 객관 소견 입력 → 기본 화면(레인2)
3. 발급 섹션 → 안전 배너 아래
4. pain 측 진찰 소견 입력 경로 신설 — **범위 주의**: 새 임상 규칙 발명 금지.
   herbal 관찰 체크리스트와 동일한 "원장 자유 기록(OBSERVED)" 패턴의 pain 버전만.
   검사 제안 자동 생성 로직은 범위 밖 → **HUMAN DECISION REQUIRED** (아래 §7)
5. "종결" 액션 신설 — 기존 'completed' 상태 계약 재사용, 목록=큐화
6. 재진 큐 행 신원 표시 — 서버가 resolved identity 동봉 (patient_id 정확 일치만)
7. JudgmentPanel 저장 라벨 오류 수정

## 5. Core Reduction Metrics 목표 (Before → After)

| 지표 | Before | After 목표 |
|---|---|---|
| Visible concept | 90 (Phase 1) | 원장 학습 개념 7 / 세부 항목은 계층 내 무손실 |
| 기본 major section | 미정의 (탭3×프로필3) | 4 (+ Queue/참고/설정) |
| 진입 조합 | 최대 9 | 0 |
| 상시 카드 (CLEAR 진입) | 8~14 | 4~5 |
| 1 사이클 클릭 | (미측정) | ≤7, 각 핵심 행동 증가 0 |
| 기본 free-text 수 | 현행 | 증가 0 |
| viewport | — | 1440/1024/834 horizontal overflow 0, core ≤1.5 vp |
| 기록 필드 접근 불가 | — | 0 |
| FROZEN diff | — | 0 |

## 6. 구현 단계 (Phase 8 Sonnet 대상 — Phase 6 gate PASS 후에만)

P0 선행 결함 7건 → P1 Queue 통합(서버 identity 동봉 포함) → P2 V3 셸+레인1/2 →
P3 판단·처치+다음 재배치 → P4 참고/설정 이동 → P5 반응형(1024/834) →
P6 상태·메트릭 테스트. 각 단계: tsc/build/test:all green + FROZEN zero-diff +
cross-patient 격리 장치(Phase 3 §5-7 목록) 각각의 행방 명시.

## 7. HUMAN DECISION REQUIRED

1. **P0-4의 범위**: pain 측 진찰 기록을 "자유 기록(OBSERVED) 입력"까지만 신설하는
   안(추천 — 기능 추가 아님, herbal과 대칭) vs 검사 제안 자동 생성 규칙 신설(임상
   규칙 발명 — 이번 미션 범위 밖, 별도 임상 검토 필요).
2. `in_consultation` 자동 전이 (기존 미결 유지 — 이번에도 구현 안 함).
3. 병렬 redesign 브랜치(`claude/feat-doctor-view-redesign`)의 처리 — 본 미션은
   visual reference로만 사용 중. merge/폐기 여부는 PO 결정.
4. CRM reason_code의 임상어 라벨 매핑 확정 (라벨 문구 자체는 임상 의미 전달 —
   구현 전 PO 확인 권장).
