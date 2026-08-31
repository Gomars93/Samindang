# Clinical OS Core Reduction — Fable 독립 아키텍처 v0.1 (Phase 2)

> 작성: Fable (오케스트레이터·제품 구조). 상태: **독립 초안 — Opus anti-anchoring
> critique(Phase 3)·UI Skill audit(Phase 1) 결과와 아직 대조하지 않음** (anti-anchoring
> 원칙에 따라 의도적으로 병렬·독립 작성). Phase 5 synthesis에서 통합한다.
> baseline: `feat/doctor-clinical-workspace` (22차 리뷰 tip `4a9b2df`).
> 원칙: 기능 추가 없음 · backend capability/persistence/provenance/identity 전부 보존 ·
> **원장이 이해해야 하는 개념 수 최소화**. Data model ≠ UI model.

## 0. 최종 mental model (한 줄)

> **"누굴 볼지 → 위험한지 → 뭐라 판단하고 뭘 할지 → 언제 어떻게 다시 볼지"**
> (시스템 표기: 대기 → 확인 → 판단·처치 → 다음)

원장이 배워야 하는 화면 개념은 이 네 단어 + "참고" + "설정"뿐이어야 한다.

## 1. 7문 7답 (Phase 2 필수 질문)

**Q1. 원장은 환자를 보기 전에 무엇이 필요한가?**
"지금 누구를 봐야 하는가" 하나. 오늘의 순서 있는 목록 — 각 행은 (이름·chart_no ·
왜 지금인지 한 단어 · 안전 배지 · 시간). 제출목록/재진/CRM Today가 **별개 개념으로
보일 이유가 원장에게는 없다** — 셋 다 "볼 사람"이다. 내부 store 3개는 그대로 두고
UI에서만 하나의 큐로 합성한다.

**Q2. 환자를 열고 10초 안에 무엇을 알아야 하는가?**
① 누구인가(이름·chart_no·성별/나이) ② 왜 왔나(주호소·기간) ③ **지금 안전한가**
(확인 영역의 종합 상태 한 줄) ④ 재진이면: 지난번 대비 무엇이 달라졌나 ⑤ 오늘 내가
할 일이 무엇인가(확인할 것 n건 / 기록할 것). 이 다섯을 넘는 정보는 10초 화면에
있을 자격이 없다.

**Q3. 무엇을 반드시 확인해야 하는가?**
위험신호(URGENT) · 확인 필요(REVIEW: fail-closed 잠금, 치료 안전, 응답 모순,
미확인 unknown) · 권장 검사. 현재 이것이 CommonSafetyBanner + 부위 SafetyPanel
9종 + ExamSuggestion 카드/리스트 + 모순 항목 + unknown 표시로 **5개 시각 개념**에
흩어져 있다. 원장 관점에서는 전부 하나의 질문("내가 지금 확인해야 할 게 있나?")
이므로 **"확인" 단일 영역**으로 통합한다. 정상(CLEAR)이면 한 줄, 이상이 있을 때만
그 항목이 펼쳐진다. 단: UNKNOWN(안전 문진 미응답)은 정상 한 줄로 접지 않고
"안전정보 없음"으로 명시 표기한다 — UNKNOWN ≠ NO.

**Q4. 무엇을 기록해야 하는가?**
판단(assessment) · 처치(treatment/care) · 재검 결과(reassessment 입력, 재진 시) ·
진찰 소견(observation — 입력이지 참고가 아님). 현재 FinalAssessmentCard,
ClinicianObservationChecklist, JudgmentPanel, 재검 promotion이 분산되어 있으나
원장 행동은 "기록한다" 하나다 → **"판단·처치" 단일 영역**.

**Q5. 진료를 끝내기 위해 무엇이 필요한가?**
기록이 저장되었다는 확신(자동저장 상태 1개) + "다음" 결정 + (선택) EMR 복사 →
완료 처리. 그 이상(프로필 분류, loop status, task 상태기계)은 종결에 불필요.

**Q6. 다음 방문을 이어가기 위해 무엇만 남으면 되는가?**
세 질문의 답: **무엇을 추적할까?**(targets) · **환자가 무엇을 할까?**(plan) ·
**언제/어떻게 다시 볼까?**(재검 시기·micro follow-up 여부). 백엔드의
FollowUpTarget/CarePlan/NextReassessmentPlan/StructuredReassessment/MicroFollowUp/
NextAction은 이 세 답의 **저장 형식**이지 사용자 개념이 아니다 → **"다음" 단일
영역**, 스키마는 무변경.

**Q7. 무엇은 기본 화면에서 없어도 되는가?**
원시 문진 전체 · 이전 방문 원문 · 명리 상세 · provenance/audit 세부 · EMR/환자용
미리보기 · view_profile 분류 메커니즘("자동 분류: …" 배너) · CRM task의 내부
상태기계(claim/dedup/version/reason_code) · episode status(LOST/care_gap 수치) ·
station/token/fixture. 전부 보존하되 Reference/Settings로 이동.

## 2. Surface 구조 (4 + 2)

### Surface A — Queue ("오늘")
- 단일 목록으로 합성: 신규 제출(submission) + 재진 예정(reassess_due/재진 문진) +
  CRM Today(연락/확인 task). 행 포맷 통일: `안전배지 이름·chart_no — 이유 · 시간`.
  이유는 사용자 언어 3종만: `새 문진` / `재검 예정` / `연락·확인`.
- 정렬: URGENT → 오늘 예정 → 신규 → 나머지. 완료는 접힘 그룹.
- CRM task의 OPEN/CLAIMED/IN_PROGRESS/SNOOZED… 상태기계는 **표시하지 않고** 행동
  버튼으로만: `보기` `완료` `나중에`. (전이는 기존 taskEngine 규칙 그대로 호출.)
- backend 3 store 병합 없음 — UI 합성 view만.

### Surface B — Clinical (기본 진료 화면, major 영역 4개)
1. **환자** — 이름·chart_no·성별/나이 · 주호소·기간 · 핵심 증상/기능 · (재진 시)
   이전 대비 변화 한 줄. 안전 종합 pill 포함.
2. **확인** — Q3의 통합 영역. 구성 요소(내부): 공통 위험신호 / 부위별 안전 상태 /
   치료 안전·잠금 / 응답 모순 / 미확인 / 권장 검사 목록. CLEAR = 한 줄. URGENT =
   접기 불가.
3. **판단·처치** — Q4의 통합 영역. 판단 / 처치 / (재진 시) 재검 결과 입력 / 진찰
   소견. secondary(사주 예상→수정판단 4-textarea, rehab suggestion, pattern
   candidate 상세)는 progressive disclosure.
4. **다음** — Q6의 세 질문 UI. 저장은 기존 workspace 스키마 필드에 그대로 매핑.
- **view_profile(pain/herbal/mixed) 개념을 기본 UI에서 제거**: mixed는 탭 대신
  "판단·처치" 내부에서 통증/한약 입력 그룹이 자연 배치된다. 자동 분류
  배너·segmented control·수동 override 개념은 ⋯(참고/도구) 뒤로. 분류 로직
  자체는 유지(초기 배치 결정에만 사용).
- 저장: 기존 CAS autosave + ConflictBanner 유지 (검증된 안전 장치 — 무변경).

### Surface C — Reference (1클릭, 기본 화면 밖)
원시 문진 전체 · 이전 방문 원문(PriorVisitHistory) · 약물/병력 상세 · 여성/생식 ·
명리(방어 문구 포함) · provenance/audit · patient care plan preview · EMR preview ·
원본 JSON.

### Surface D — Settings / Operations (진료 flow에서 분리)
station 등록/리셋 · workstation · doctor token · fixture/scenario/preview 컨트롤 ·
device pairing · 환경설정.

## 3. UI 개념 수 목표

- 현재(추정, Phase 1 전수조사로 확정): 사용자-visible 개념 25~30개.
- 목표: Queue 1 + Clinical 4 + Reference 1 + Settings 1 = **원장이 배우는 개념 7개
  이하** (개별 항목은 영역 안의 '내용'이지 별도 개념이 아니게).

## 4. 단순화 금지선 (안전 invariant)

1. safety는 절대 접힘/이동 대상 아님 — Clinical 최상단 고정, URGENT 접기 불가.
2. UNKNOWN ≠ NO: 미응답·미확인은 "없음"과 시각적으로 항상 구분.
3. provenance 혼합 금지: 환자 보고 / 시스템 계산 / 원장 입력 구분 시각 언어 유지.
4. 기록된 필드 접근 불가 = 0: Reference로 이동한 모든 데이터는 1클릭 접근.
5. FROZEN(`src/spec/*Logic.ts`, `*Adapter.ts`)·threshold·red flag 의미·identity
   (UUID, chart_no 1:1, 이름+chart_no 표시, RRN 없음, 전화≠identity, 자동병합
   없음)·persistence 의미·Care Gap/LOST 기준 무변경.
6. CAS/conflict/stale 처리 semantics 무변경 (표시 위치만 재배치 가능).
7. follow-up capability 손실 0 — "다음"의 세 질문이 기존 스키마 전 필드를 커버해야
   하며, 커버 불가 필드 발견 시 HUMAN DECISION REQUIRED로 표기.

## 5. Phase 5 synthesis에서 확정할 것

- Phase 1 전수조사와 대조해 본 문서 §2가 누락한 concept 배치.
- Opus(Phase 3)가 "합치면 안 된다"고 판정한 항목의 반영.
- Current | Proposed | Action | Reason 전체 표.
