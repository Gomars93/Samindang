# LBP Production v1 — Minimal Architecture v0.1 (Fable)

**작성일:** 2026-09-02
**작성 역할:** Fable (제품 아키텍처 / 과설계 검수 / 통합 / 다음 단계 sequencing — 2026-09-02 PO 결정으로 ChatGPT 역할 승계)
**기준 SSOT:** `main` head `01dac63`, PR #28 head `b099417` (research branch, DRAFT, 미merge)
**상위 결정:** PR #28 코멘트 `#5508066166` (PO, 2026-09-02) — "Patient facts → Primary/Secondary Rehab Strategy 매핑 엔진을 만들지 않는다", `DECISIONS.md` 동일 날짜 항목
**상태:** Fable 설계안. 이 문서 자체는 임상 의미를 새로 만들지 않는다. 임상 의미가 개입되는 지점은 §6에 "Opus 확인 항목"으로 명시했다.

---

## 0. 한 줄 결론

> **지금 main에는 LBP 흐름의 "앞(안전)"과 "뒤(기록·추적·EMR)"는 이미 있고, "가운데(목표기능 → 최소 확인 → 운동 2~3개)"만 비어 있다. PR #28의 research stack에서 그 가운데를 채우는 데 실제로 필요한 것은 데이터 3개 파일(운동 카탈로그·Core-20 metadata·Eligibility 규칙)과 v0.1 엔진의 검사 항목 문구뿐이다. 나머지 8개 실험 모듈(v0.2/v0.3/B+/v0.4/가설 엔진/가설 presentation/전략 selector)은 v1에 넣지 않는다.**

실제 진료에서 달라지는 것:
- 요통 환자를 열면 "안전 확인" 아래에 **목표 기능 1개 고르기 → 오늘 확인할 것 1~3개 → 지금 가능한 운동 2~3개 → 원장이 1~2개 채택** 이 한 화면에서 이어진다.
- 단순 요통은 추가 확인이 "목표 동작 재현 + 허리 움직임 반응" 2개로 끝난다. 다리 증상·보행 악화가 있을 때만 1~2개가 더 붙는다.
- 다음 방문에는 같은 목표 기능으로 반응을 본다. 통증점수만으로 회복을 판단하지 않는다.

---

## 1. Current End-to-End Map (2026-09-02, 실제 코드 기준)

목표 흐름의 각 단계를 `main`(production)과 PR #28(research)로 나눠 분류했다.
READY = 그대로 재사용 / PARTIAL = 구조는 있으나 연결·축소 필요 / MISSING = 없으면 흐름이 끊김 / OVERDESIGNED = v1에 불필요.

| # | 단계 | main (production) | PR #28 (research) | 판정 |
|---|---|---|---|---|
| 1 | Tablet / existing facts | `LBP_01~14` 문진 + `computeLbpFlags` (FROZEN). 다리증상 유무·신경증상·CES·red flag·외상·재발·**보행 시 악화(LBP_08)**·앉으면 완화(LBP_09)·염증성 선별·회복기대(0~10)·**움직임 회피(LBP_13)**·생활지장(LBP_14) | 변경 없음 (read-only 원칙 준수) | **READY** — tablet 변경 없음 |
| 2 | Safety | `lbp_safety_status`(CLEAR/REVIEW_REQUIRED/URGENT_REVIEW) + `treatment_safety_status` (FROZEN), `LbpSafetyPanel`, 레인1 `lane1Summary`, 원장 입력 `객관적 하지 근력저하`(`ObjectiveExamFindingsCard`, FROZEN safety에 되먹임) | 엔진이 이 값을 입력으로만 소비 | **READY** — 그대로 |
| 3 | Target Function | 없음. `FollowUpTarget`(최대 3, 옵션 3개: 통증 강도/움직임·기능/증상 재현, 기준값·치료직후값 free text)과 `PainCarePlan.rehabilitationGoal`(free text)만 있음 | `LbpExerciseTargetFunction` enum 11개(카탈로그 metadata의 target-function link) | **MISSING** — 구조화된 목표기능 anchor 없음 |
| 4 | 최소 Doctor-side checks | `PhysicalExamSuggestion` shape·카드·목록·영속화·EMR 반영·재검 승격 전부 동작. **단, 생성 규칙은 의도적으로 부재**(`examSuggestion.ts` 헤더: "clinician-approved 매핑 전까지 생성 함수 금지"). 실제 환자에서는 항상 빈 목록 | v0.1 엔진: 검사 7종(문구·how/why 도움말 포함) + cue 규칙. v0.2 Decision Key/freshness, v0.3 sufficiency, B+ priority, v0.4 projection | **PARTIAL** (main 구조) + **OVERDESIGNED** (v0.2~v0.4/B+) — v0.1의 *검사 항목 내용*만 추출 |
| 5 | Working Hypothesis | `PainFinalAssessment.finalWorkingAssessment` free text | 가설 엔진(5 패턴, support level) + presentation 압축 layer | **OVERDESIGNED** for v1 — 별도 클릭 단계로 만들지 않는다(PO 문서 §25). free text 유지 |
| 6 | Exercise Eligibility | 없음 | `lbpExerciseEligibility.v01`(Core-20 규칙, 4 상태). **Opus closing 증거 없음**(코멘트 `#5504757154`는 구현자 보고) | **PARTIAL** — 재사용 가능하나 production 의존 전 bounded Opus 검증 필요 |
| 7 | Exercise Recommendation 2~3 | 없음 (`RehabSuggestion` shape·카드·채택 UI는 있음, 생성 규칙 부재) | 카탈로그 57 + Core-20 metadata + Strategy Selector v0.1(upstream Primary/Secondary 필요) | **MISSING**(추천 모듈) + Selector는 **BYPASS**(PO 결정) |
| 8 | Clinician selects 1~2 | `RehabSuggestionCard`(채택/보류/배제 + Care Plan 채택 버튼). 단 `onAdoptToCarePlan` 핸들러가 `PainWorkspace`에서 미연결 | — | **READY**(카드) / **PARTIAL**(채택 연결 1줄) |
| 9 | Reassessment | `FollowUpTarget` 기준값·치료직후값, `NextReassessmentPlan`, `StructuredReassessment`(재검 항목), `RevisitWorkspace` carry-forward, 이전 방문 raw 이력, micro follow-up | 엔진의 `followUp.{trajectory,exposure,newOrWorseningNeuroSymptom}` enum 입력 | **PARTIAL** — 구조화된 반응(호전/변화없음/악화, 노출 충분/부족, 새 신경증상) 입력이 없어 "악화·새 신경증상 → safety refresh"가 자동으로 못 걸림 |
| 10 | EMR reuse | `emrPreview.buildPainWorkspaceEmrPreview` (재평가 대상·집에서 할 일·재검 소견 line 포함) | — | **READY** — 목표기능=FollowUpTarget, 채택 운동=homeActionPlan이면 추가 변경 거의 없음 |
| 11 | CRM reuse | `src/crm` episode/task 모델 + `applyNextReassessmentPlanToEpisode` 존재. **서버(`server/`)에서 호출되지 않음** | — | **PARTIAL** — write-through 미연결. v1 필수 아님 |

주변 PR 상태:
- **PR #25**(`claude/fix-lbp-safety-panel-gate`): "추가 상세상담 LBP 환자의 안전 패널 누락" 수정인데, `main`의 `DoctorView.tsx` `LbpSafetyPanel`은 이미 `safety_flags.lbp` 기준으로 게이트한다(6차 독립리뷰 HIGH-1 반영). 브랜치는 main보다 60k줄 뒤처짐. **main이 이미 해결 → 닫기 권고(PO 판단).**
- **PR #27**(디자인 토큰/CSS), **PR #23**(태블릿 UX): LBP v1과 무관.
- **PR #28**: research branch. 통째로 merge하지 않는다(PO 결정). 아래 §3에서 필요한 파일만 production 브랜치로 복사한다.

문서 snapshot 정정: 인수인계 문서의 PR #28 head `c26e01c`는 이후 docs 커밋 1개(`b099417`, HANDOFF/DECISIONS에 PO 결정 기록)로 갱신됐다. 코드 차이 없음.

---

## 2. Minimal Production v1 Architecture

### 2.1 원장 화면에서의 흐름 (clinician-facing)

```text
레인1 안전 확인            : (기존) FROZEN safety + 객관적 하지 근력저하 입력
레인2 확인  ── LBP 블록 ── : ① 목표 기능 고르기 (chip 1~2개)
                            ② 허리 움직임 반응 (chip 1개: 굴곡 호전 / 신전 호전 / 방향 없음 / 다리로 퍼짐 / 불명확)
                            ③ 오늘 확인할 것 1~3개 (문진 사실로 자동 제안 + "확인 추가"로 원장이 고관절/천장관절/SLR 등 직접 추가)
                            ④ 지금 가능한 운동 2~3개 (목표 기능 + 현재 확인된 반응에 직접 연결, 시작조건·용량·중단기준 표시)
                               → 원장 채택 1~2개 → Care Plan "집에서 할 일"로 채택
판단·처치                 : (기존) 최종 판단 free text
다음                       : (기존) 재평가 대상(=목표 기능이 그대로 들어감) · 다음 재평가 · EMR 미리보기
재진                       : (기존) 목표 기능 기준값 비교 + (Batch 3) 반응 구조화 3개 chip → 악화/새 신경증상이면 safety refresh
```

Working Hypothesis, Rehab Strategy(4개 taxonomy), Decision Key, tranche, sufficiency 는 **화면에 나오지 않는다**. Strategy는 운동 추천의 "이유" 한 줄과 감사 로그에만 쓴다.

### 2.2 모듈 구성 (engineering)

| 모듈 | 위치 | 출처 | 역할 |
|---|---|---|---|
| Target Function 옵션 | `src/doctor/workspace/lbpTargetFunction.ts` (신규, 작음) | 신규 (taxonomy만) | LBP 목표기능 chip id/라벨 표. `FollowUpTarget`의 옵션으로 주입 → 기존 추적·이력·EMR·micro follow-up 플러밍을 **그대로** 탄다. 별도 필드/화면 없음 |
| 허리 움직임 반응 | `WorkspaceState.lbpDirectionalResponse` (필드 1개 추가) | 신규 (기록 필드) | 원장이 관찰한 방향성 반응 기록. 운동 방향 결정에만 쓰임. 기본값 `NOT_ASSESSED`(= 정상 아님) |
| LBP 확인 항목 생성기 | `src/doctor/workspace/lbpExamSuggestions.ts` (신규) | PR #28 v0.1 엔진의 검사 문구·how/why + §14 선택적 검사 규칙 | `DoctorPayload` → `PhysicalExamSuggestion[]`. 규칙 표 1개(`LBP_EXAM_TRIGGER_RULES`), 원장 추가용 고정 목록 1개. 점수·우선순위 계산 없음 |
| 운동 데이터 | `lbpExerciseLibrary.v01`, `lbpExerciseCoreMetadata.v01`, `lbpExerciseEligibility.v01` (PR #28에서 복사) | PR #28 | 카탈로그(ID 안정성)·Core-20 시작조건/용량/중단기준·Eligibility 4상태. 로직 수정 없이 가져온다 |
| Eligibility 입력 adapter | `src/doctor/workspace/lbpEligibilityContext.ts` (신규, 작음) | 신규 (연결) | FROZEN safety + 객관적 근력저하 입력 + 방향 반응 + 원장이 확인한 capability chip → `LbpExerciseEligibilityContext`. UNKNOWN은 UNKNOWN으로 그대로 전달 |
| 운동 추천 | `src/doctor/workspace/lbpExerciseRecommendation.ts` (신규) | 신규 (selector 대체, 훨씬 단순) | Core-20 ∩ 목표기능 일치 ∩ eligible(START_AS_WRITTEN/START_WITH_REGRESSION) → `RehabSuggestion[]`. 방향 반응·신경긴장 반응이 직접 뒷받침하는 항목을 앞에, 나머지는 metadata 선언 순서. **숫자 점수 없음, 3개 표시 + "더 보기"** (동점을 코드 순서로 잘라내지 않음) |
| 원장 선택 | 기존 `RehabSuggestionCard` + `PainCarePlan.homeActionPlan` | main | 채택 → Care Plan 텍스트에 운동명+시작용량 append (기존 "adopt, never automatic" 패턴) |
| 재평가 반응 | `VisitWorkspaceState`/`WorkspaceState`에 반응 3-tuple 추가 (Batch 3) | PR #28 엔진 followUp enum | 호전/변화없음/악화/불확실 · 노출 충분/부족/모름 · 새/악화 신경증상 예/아니오/모름. 숫자 threshold 없음 |

### 2.3 데이터 흐름의 불변조건 (v1에서 지킬 것)
- FROZEN `src/spec/*Logic.ts`, `*Adapter.ts` zero-diff. tablet zero-diff.
- 미입력/`NOT_ASSESSED`/`UNKNOWN`은 어떤 단계에서도 정상·적격으로 바뀌지 않는다. Eligibility는 UNKNOWN capability를 DEFER/REGRESSION으로 돌려주고, 원장이 chip으로 확인했을 때만 YES가 된다.
- 자동 생성물(확인 항목·운동 후보)은 `provenance: 'SUGGESTED'`로만 렌더되고 EMR에는 원장이 결과를 기록/채택한 것만 들어간다(기존 `emrPreview` 규칙 그대로).
- 파생 결과(운동 후보)는 저장하지 않고 매 렌더에서 재계산한다. 저장하는 것은 원장의 결정(채택/보류/배제, 확인 결과, 방향 반응, capability 확인)뿐이다.
- 확인 항목 자동 제안은 `lbp_safety_status === 'CLEAR'`일 때만 생성한다(엔진 v0.1과 동일). REVIEW/URGENT면 안전 확인이 먼저이고, 원장은 "확인 추가"로 언제든 직접 추가할 수 있다.

---

## 3. Remove / Defer List

| 대상 | 처분 | 이유 |
|---|---|---|
| `lbpActionAdaptiveEngine.experimental.ts` (v0.1) | **내용만 추출, 모듈은 미포팅** | 검사 7종의 제목·이유·how/why 문구와 cue 규칙은 §2.2 생성기로 옮긴다. 정규화 context/Provenance bookkeeping은 불필요 |
| v0.2 Decision Key / freshness | **REMOVE (research 보존)** | v1은 환자당 자동 제안이 최대 3개(목표 동작 재현 + 사실 기반 ≤2)라 tranche/dedup 문제가 생기지 않는다. 방문 freshness는 v1이 방문별 `WorkspaceState`를 따로 저장하므로 구조적으로 해결됨 |
| v0.3 Decision Sufficiency | **REMOVE** | "충분하면 더 안 묻는다"는 생성기가 규칙 표 밖에서 아무것도 만들지 않는 것으로 달성됨 |
| B+ priority policy + comparison | **REMOVE** | 경쟁하는 후보가 3개를 넘는 경우가 v1 규칙 표에서는 발생하지 않음 |
| v0.4 Care Core projection | **REMOVE** | v0.1~v0.3을 감싸는 층. 감쌀 대상이 없어짐 |
| Working Hypothesis 엔진 + presentation | **DEFER** | PO: 별도 클릭 단계 아님. 설명은 확인 항목의 "왜 확인?"과 운동의 "이유" 한 줄로 충분. 최종 판단은 free text 유지 |
| Rehab Strategy Selector v0.1 | **BYPASS** | upstream Primary/Secondary가 없고 만들지 않는다(PO). 도메인→전략 정적 표(15줄)만 추천 모듈의 이유 라벨용으로 재사용 |
| Rehab Strategy taxonomy | **내부 라벨로만 유지** | PO CLOSED |
| 카탈로그 57 | **데이터로 포팅, UI 노출 없음** | Core-20 ID의 정본. 57개 직접 랭킹 금지 |
| `lbp-action-engine-experimental.yml` | **미포팅** | production 테스트는 `test:all`에 합류 |
| PR #28 wholesale merge | **하지 않음** | PO 결정 |
| PR #25 | **닫기 권고 (PO)** | main이 이미 동일 결함을 해결 |
| tablet 문진 변경 | **없음** | LBP_13(움직임 회피)이 이미 있으나 v1은 이를 자동 매핑에 쓰지 않는다(단계적 노출은 원장 escape hatch) |
| CRM write-through, 고정 6줄 EMR 포맷(C/C·O/S·S·O·A·P) | **DEFER (Batch 4, PO 요청 시)** | v1 흐름을 끊지 않음. 기존 EMR 미리보기가 이미 재평가 대상·집에서 할 일 line을 낸다 |
| irritability 구조화 입력 | **DEFER** | v1에 소비자가 없음. 방향 반응 chip으로 대체 |

---

## 4. Exact Gaps (이게 없으면 end-to-end가 끊긴다)

| # | Gap | 현재 상태 | 채우는 Batch |
|---|---|---|---|
| G1 | 구조화된 Target Function | 없음 (free text만) | 1 |
| G2 | LBP 확인 항목 자동 생성 | shape만, 생성기 없음 | 1 |
| G3 | 허리 움직임 방향 반응 기록 필드 | 없음 | 1 |
| G4 | 확인 항목 ⓘ how/why (tap+hover) | 없음 (`PhysicalExamSuggestion`에 help 없음) | 1 |
| G5 | 원장이 확인 항목을 직접 추가하는 affordance (고관절/천장관절/SLR·슬럼프/보행/신경 기본검사) | 없음 | 1 |
| G6 | 운동 데이터 3파일이 main에 없음 | PR #28에만 있음 | 2 |
| G7 | Eligibility 임상 검증(Opus) 부재 | closing 증거 없음 | 2 (선행) |
| G8 | Eligibility 입력 adapter + capability 확인 chip | 없음 | 2 |
| G9 | 운동 추천 모듈 (TF 일치 · eligible · 3개 + 더보기) | 없음 | 2 |
| G10 | 채택 → Care Plan 연결 | 핸들러 미연결 | 2 |
| G11 | 재진 반응 구조화(호전/변화없음/악화 · 노출 · 새 신경증상) | free text만 | 3 |
| G12 | 악화/새 신경증상 → safety refresh 표시 | 없음 | 3 |
| G13 | 재진 화면 방향 반응 재기록 + Eligibility 재평가(원위부 악화 반영) | 없음 | 3 |
| G14 | CRM `reassess_due` 서버 write-through | 함수만 있고 미호출 | 4 (defer) |

---

## 5. Implementation Batches (최대 4개, cohesive)

### Batch 1 — Target Function + LBP 최소 확인 블록 (새 임상 의미 없음 → 즉시 진행)
- G1~G5.
- 임상 의미 신설 없음: 목표기능 chip은 taxonomy, 방향 반응은 기록, 자동 제안 규칙은 (a) 목표기능 재현(anchor 자체), (b) FROZEN `leg_symptom_present === 'YES'` → SLR/슬럼프, (c) 태블릿 `LBP_08 === 'YES'`(보행 시 악화) → 보행 가능시간·거리 — 둘 다 인수인계 문서 §14의 "leg symptom → SLR/Slump", "walking/standing leg pattern → walking tolerance"를 CLOSED 계산값/원문 답변에 그대로 연결한 것.
- 루프: Sonnet 구현 → focused tests + build → Opus delta review(§6 확인 항목 포함) → Sonnet concrete fix → Opus closing.
- 상세 브리프: §7.

### Batch 2 — Exercise Eligibility + 운동 2~3개 추천 + 원장 채택
- G6~G10.
- 순서: (1) PR #28에서 3파일 + 테스트 4개 + 문서 2개 복사 → (2) **Opus bounded validation of Eligibility 규칙**(production 의존 전 1회; 인수인계 문서 §18) → (3) adapter + 추천 모듈 + 카드 연결 + capability chip → (4) Opus delta/closing.
- 여기서 `CLINICAL DECISION REQUIRED`가 나올 수 있는 지점: 객관적 근력저하 "없음" 기록을 `neuroStatus: STABLE`로 볼지(권고: 예, 단 다리증상 없는 환자도 이 1클릭은 필요), 카탈로그 `FLEXION/EXTENSION` target-function을 방향 반응과 어떻게 대응시킬지.

### Batch 3 — 재평가 루프 (재진)
- G11~G13. 숫자 threshold 없음. 반응 3-tuple은 chip, 결과는 (a) 악화/새 신경증상 → 레인1 safety refresh 배너 + 운동 추천 STOP_REVIEW, (b) 노출 충분 + 변화 없음 → "현재 계획 재검토" 한 줄, (c) 그 외 → 유지/진행/후퇴는 원장 선택.

### Batch 4 (선택, PO 요청 시) — CRM `reassess_due` write-through + 고정 6줄 EMR
- G14. v1 필수 아님.

---

## 6. Opus 확인 항목 (Batch 1 delta review에서 답해야 할 것)

임상 의미가 조금이라도 걸리는 지점만 모았다. Fable은 아래에 대해 "기본값"을 제안하되 결정하지 않는다.

1. **SLR/슬럼프 자동 제안 트리거를 FROZEN `leg_symptom_present === 'YES'`로 두는 것**이 §14 "leg symptom → SLR/Slump"의 올바른 연결인가? (v0.1 엔진은 더 좁은 `radicularCue`를 썼으나 그 파생 규칙은 정의된 적 없음.) 기본값: YES 트리거, UNKNOWN은 트리거하지 않음.
2. **보행 가능시간·거리 제안을 `LBP_08 === 'YES'`로 두는 것.** 기본값: 그대로.
3. **하지 신경학적 기본검사(감각·반사)를 별도 제안 항목으로 만들지 않고** 기존 "객관적 하지 근력저하" 카드를 v1 신경 baseline으로 두는 것(원장 추가 목록에는 남김). 중복 클릭 방지 목적.
4. **`lbp_safety_status !== 'CLEAR'`이면 자동 제안을 전부 생략**(엔진 v0.1과 동일)하고 원장 추가만 허용하는 것.
5. 방향 반응 chip 6개 값(굴곡 호전/신전 호전/뚜렷한 방향 없음/다리로 퍼짐/불명확/미시행)의 라벨·의미가 CLOSED 의미(원위부 악화 = 중단·재검토 신호)와 어긋나지 않는지.

---

## 7. Batch 1 Implementation Brief (Sonnet용)

### 7.1 범위
`main`(브랜치 `claude/clinical-os-lbp-architecture-xym6po`) 위에서 아래만 구현한다. 다른 파일 수정 금지. FROZEN/tablet zero-diff.

### 7.2 신규 파일
1. `src/doctor/workspace/lbpTargetFunction.ts`
   - `LBP_TARGET_FUNCTION_OPTIONS: FollowUpTarget[]` — id/라벨:
     `lbp_tf_walking` 걷기 · `lbp_tf_sitting` 앉기 · `lbp_tf_standing` 서기 · `lbp_tf_sit_to_stand` 앉았다 일어서기 · `lbp_tf_dressing` 옷 입기·양말 신기 · `lbp_tf_lifting` 물건 들기 · `lbp_tf_sleep` 수면·침상 동작 · `lbp_tf_work` 업무·집안일 복귀 · `lbp_tf_custom` 기타 목표 동작(기준값 칸에 동작을 적도록 placeholder 안내).
   - `isLbpTargetFunctionId(id)`, `selectedLbpTargetFunctions(targets)` helper.
   - `followUpTarget(id, label)` 재사용. 새 타입 없음.
2. `src/doctor/workspace/lbpExamSuggestions.ts`
   - `generateLbpExamSuggestions(payload: DoctorPayload): PhysicalExamSuggestion[]`
     - `payload.responses.safety_flags.lbp == null` → `[]`.
     - `flags.lbp_safety_status !== 'CLEAR'` → `[]` (isFlagsUsable 아님/손상 → `[]`).
     - 항상: `lbp_exam_target_function_reproduction` "목표 동작 재현" (CONTEXTUAL). reasonFacts: `{text:'목표 기능을 정한 뒤 실제 동작에서 평소 증상·제한이 재현되는지 확인', provenance:'DERIVED'}`.
     - `flags.leg_symptom_present === 'YES'` → `lbp_exam_neurodynamic` "하지직거상 또는 슬럼프검사" (CONTEXTUAL). reasonFacts: `{text:'하지 통증·저림/신경증상 보고(환자 응답)', provenance:'PATIENT_FACT'}`.
     - `modules.lbp.claudication_walking === 'YES'` → `lbp_exam_walking_tolerance` "실제 보행 가능시간·거리 확인" (CONTEXTUAL). reasonFacts: `{text:'서 있거나 걸을수록 엉덩이·다리 증상 악화(환자 응답)', provenance:'PATIENT_FACT'}`.
     - `priority`는 전부 `'CONTEXTUAL'` (v1에서 "반드시 확인"을 만들지 않는다 — 모든 제안은 치료 blocker가 아님).
     - `source: 'SUGGESTED'`, `result: emptyExamResult()`.
   - `LBP_CLINICIAN_ADDABLE_EXAMS: PhysicalExamSuggestion[]` (원장이 직접 추가): `lbp_exam_hip_screen` 고관절 빠른 선별 · `lbp_exam_sij_screen` 천장관절 기여 확인 · `lbp_exam_neurodynamic` · `lbp_exam_walking_tolerance` · `lbp_exam_neuro_baseline` 하지 신경학적 기본검사(감각·반사). reasonFacts: `{text:'원장 직접 추가', provenance:'OBSERVED'}`.
   - `LBP_EXAM_HELP: Record<id, {howKo, whyKo}>` — PR #28 v0.1 엔진의 `help.howKo/whyKo` 문구를 그대로 옮긴다(파일 `src/doctor/workspace/lbpActionAdaptiveEngine.experimental.ts` on `origin/claude/feat-lbp-action-adaptive-engine-prototype`). 목표 동작 재현 = `buildTargetFunctionCheck`, SLR/슬럼프 = `buildNeurodynamicCheck`, 보행 = `buildWalkingToleranceCheck`, 고관절 = `buildHipCheck`, 천장관절 = `buildSijCheck`, 신경 기본검사 = `buildObjectiveNeuroCheck`.
   - `mergeLbpExamSuggestions(existing, payload)`: 기존 저장 목록에 없는 자동 제안 id를 뒤에 추가하고, 모든 항목에 `help`를 id 기준으로 다시 붙인다(help는 저장하지 않음). 기존 항목의 result는 절대 바꾸지 않는다. 멱등.
   - `LBP_DIRECTIONAL_RESPONSE_OPTIONS` + 타입 `LbpDirectionalResponse = 'NOT_ASSESSED' | 'FLEXION_FAVORABLE' | 'EXTENSION_FAVORABLE' | 'NO_CLEAR_DIRECTION' | 'DISTAL_WORSENING' | 'UNCLEAR'`, 라벨: 미시행(기본) / 숙이면(굴곡) 호전 / 젖히면(신전) 호전 / 뚜렷한 방향 없음 / 다리 쪽으로 퍼짐(원위부 악화) / 불명확. `isValidLbpDirectionalResponse(v)` 가드. help(how/why)는 v0.1 `buildLumbarMovementCheck` 문구.

### 7.3 기존 파일 최소 수정
- `examSuggestion.ts`: `PhysicalExamSuggestion.help?: { howKo: string; whyKo: string }` (optional). 저장 시 sanitize 템플릿에는 넣지 않는다(정적 데이터, 로드 시 재부착).
- `ExamSuggestionCard.tsx`: `item.help`가 있으면 제목 옆 `ⓘ` 버튼(`aria-expanded`, tap으로 토글, `title`로 hover도 동작). 펼치면 "어떻게: …" / "왜: …" 두 줄.
- `persistence.ts`: `WorkspaceState.lbpDirectionalResponse: string` 추가(기본 `'NOT_ASSESSED'`), deserialize에서 유효하지 않으면 `'NOT_ASSESSED'`. `WORKSPACE_STATE_SCHEMA_VERSION`은 올리지 않는다(additive).
- `DoctorWorkspace.tsx`: `seedWorkspaceState(initial, synthetic, payload)` — `synthetic`이 있으면 기존 그대로; 없으면 `painExamSuggestions = mergeLbpExamSuggestions(initial?.painExamSuggestions ?? [], payload)`. `PainWorkspaceLane2`에 `lbpDirectionalResponse`/`onChangeLbpDirectionalResponse`/`onAddLbpExam` 전달. `PainWorkspaceNext`에 목표기능 옵션 전달.
- `PainWorkspace.tsx`:
  - Lane2 "오늘 확인할 것" 섹션: LBP(`safety_flags.lbp != null`)이면 섹션을 항상 렌더. 순서: 방향 반응 chip 행(제목 "허리 움직임 반응", ⓘ) → 확인 항목 목록 → "확인 추가" (`<details>` 안 버튼 목록, 이미 있는 id는 숨김).
  - Next: `FollowUpTargetPicker`의 `options`를 LBP면 `[...LBP_TARGET_FUNCTION_OPTIONS, ...PAIN_FOLLOW_UP_OPTIONS]`로. 목표기능 chip 그룹 위에 소제목 "목표 기능(다음 방문에 같은 동작으로 비교)"을 표시할 수 있도록 `FollowUpTargetPicker`에 optional `groups?: {label, ids}[]` prop 또는 동등한 최소 변경. `MAX_FOLLOW_UP_TARGETS`(3) 불변.
- `emrPreview.ts`: `buildPainWorkspaceEmrPreview` 입력에 optional `lbpDirectionalResponse`; `NOT_ASSESSED`가 아닐 때만 "허리 움직임 반응: <라벨>" line. 기본값을 정상으로 찍지 않는다.
- `workspace.css`: chip 행·ⓘ 패널 최소 스타일(기존 `workspace__followUpChip`/`workspace__statusBtn` 재사용 우선).
- `package.json`: `test:lbp-exam-suggestions` 추가 + `test:all`에 합류.

### 7.4 테스트 (통과 전 종료 금지)
- 신규 `tests/lbp-exam-suggestions.spec.mjs` (esbuild 번들: `lbpExamSuggestions.ts`, `lbpTargetFunction.ts`, `src/doctor/fixtures.ts`):
  - 비-LBP payload → `[]`; LBP CLEAR 단순 축성(다리증상 NO, LBP_08 NO) → 목표 동작 재현 1개만; 다리증상 YES → +SLR/슬럼프; LBP_08 YES → +보행; 다리증상 UNKNOWN → SLR/슬럼프 없음; safety REVIEW_REQUIRED/URGENT → `[]`; 손상 flags → `[]`.
  - `merge`: 저장된 result 보존, 중복 없음, help 재부착, 멱등.
  - 모든 자동/추가 항목에 help.howKo/whyKo 비어있지 않음, `source==='SUGGESTED'`, `result.status==='NOT_YET_CHECKED'`.
  - `isValidLbpDirectionalResponse` 가드.
- `tests/workspace-round3.spec.mjs`: `lbpDirectionalResponse` round-trip, 손상 값 → `NOT_ASSESSED`, 레거시 레코드(필드 없음) → `NOT_ASSESSED`.
- `tests/doctor-workspace.spec.mjs`: 실제 LBP fixture(synthetic 없이)에서 방향 반응 chip·목표 동작 재현 카드·ⓘ·확인 추가·목표 기능 chip 렌더; 비-LBP 통증 fixture는 기존과 동일(회귀 없음); 기존 synthetic 시나리오 테스트 전부 유지.
- EMR: 방향 반응 line이 기본값에서는 없음, 설정 시 라벨로 출력(기존 emrPreview 테스트 파일에 추가).
- `npm run build`, `npm run test:all` PASS. `git diff --stat origin/main -- src/spec index.html src/App.tsx` 가 비어 있음.

### 7.5 금지
- 새 문진, 점수/가중치, 진단명, 검사 우선순위 계산, Working Hypothesis, 운동 추천(Batch 2), CRM/EMR 서버 변경, FROZEN 수정, 기존 무관 코드 리팩터.

---

## 8. 2026-09-02 Corrective Handoff 대조 (v0.2 delta — Fable)

**기준 문서:** `FABLE_COMPLETE_CORRECTIVE_HANDOFF_PAIN_LBP_2026-09-02.md` (PO 제공, 이전 인수인계 3종을 대체).
**대조 시각의 GitHub 실측:** main `01dac63`(문서 §37-1과 일치), PR #28 head `b099417` DRAFT(§37-2 일치), open PR #23/#25/#27 그대로(§41), `tmp-noop` 브랜치 존재(§40 — 삭제하지 않음). **이 브랜치 `claude/clinical-os-lbp-architecture-xym6po`는 문서가 모르는 상태다**: main 대비 8커밋(설계 v0.1 → Batch 1 구현·Opus delta FAIL→fix→closing → Eligibility Opus bounded validation → PO CD-1/CD-2 결정 기록). 문서 규칙("repo와 다르면 최신 PO 결정·actual evidence 우선")에 따라 브랜치 상태가 문서보다 앞선다.

### 8.1 문서가 v0.1 설계를 바꾸는 지점 (수정 확정)

| # | Corrective handoff | v0.1의 판단 | v0.2 수정 |
|---|---|---|---|
| C1 | §0-2/§0-5/§36: **Working Hypothesis + 이유**가 LBP v1 완결 조건의 명시 단계. §14: 확정진단 아님, Primary/Higher/Consider/Lower/Must-exclude 표현, 첫 화면 압축 | 엔진·presentation DEFER, free text만 | **최소 형태로 복귀.** 자동 엔진은 그대로 DEFER하되, 원장이 5개 관리지향 패턴(허리 움직임 관련 / 신경근 관여 / 보행·기립 하지 패턴 / 고관절 기여 / 천장관절 기여)에서 support 수준을 **직접 선택**하는 chip + 기존 free text. 자동 계산 없음 → 새 임상 의미 없음. → **Batch 2.5** |
| C2 | §0-2 step 8 / §15: **치료방향 결정**은 의사 결정, 시스템은 대신하지 않음 | 단계로 명시 안 함 | `PainFinalAssessment.treatmentFocus`/`interventionPerformedOrPlanned` free text가 그 단계. **READY** — 코드 변경 없음, 화면 순서만 §8.3 |
| C3 | §0-2 step 6 / §8-5: structured 결과는 정상/이상/불명확/**제한/미시행**/미평가를 절대 합치지 않음 | production `ExamCheckStatus` 4값(POSITIVE/NEGATIVE/UNCLEAR/NOT_YET_CHECKED) 그대로 사용 | **G15 신설**: `LIMITED`, `NOT_PERFORMED` 2값 추가(additive, 전 부위 공유 enum). EMR 규칙 "미확인은 음성으로 찍지 않음" 유지 + 제한/미시행은 사실로 기록. 다부위 공유 타입이라 Fable 통합 항목 → **Batch 2.5** |
| C4 | §0-3: 재진 30~60초 Quick Check **5문항**(목표기능 호전 / 전체 증상반응 / 새·악화 신경증상·위험신호 / 운동 실제 시행·난이도 / 치료 후 이상반응) → 유지·진행 / 부분조정 / 재검토 / safety refresh | Batch 3 = 반응 3-tuple | **Batch 3 범위를 5문항 chip으로 확정.** 숫자 threshold 없음(§16-4) |
| C5 | §17: EMR 고정 6키(C/C·O/S·S·O·A·P), §36 EMR/CRM 닫혀야 다음 부위 | Batch 4 선택 | **Batch 4 필수**(EMR 고정 포맷 + CRM 최소 reuse). 순서는 여전히 마지막 |
| C6 | §8-1 흐름: 확인 → 임상가설 → 치료·운동 결정 → 재평가 | 운동 블록을 레인2(확인)에 배치 | **운동 블록은 판단·처치 레인, 최종 판단 카드 다음**에 배치 (Batch 2 마무리 시 반영) |
| C7 | §2-3 stop point 6: 환자 안전 의미가 실제로 달라지는 변경 | — | 이후 모든 batch 브리프에 stop point로 명시 |
| C8 | §27-1: `NOT_RELEVANT_TODAY`는 eligibility가 아니라 relevance 개념, DEFER에 억지 매핑 금지 | Batch 2 브리프 RF-11(c) | staged Batch 2 vignette 하네스는 이를 observation-only 라벨로 유지(매핑 없음) — 확인됨 |
| C9 | §1-7: ChatGPT가 직접 코딩한 전례를 일반화하지 않음 | — | Fable은 구현하지 않는다. 이번 세션에서도 구현은 전부 Sonnet, 임상 검수는 Opus |

변경 없음(문서와 v0.1이 이미 일치): Target Function anchor(§11), Selective exam 원칙(§12), 병렬 기여자(§13), 태블릿 read-only(§10), FROZEN(§9), Rehab strategy 내부 분류만(§0-4/§28~31), 추천 금지 목록(§32-1), CRM 경계(§18), 다른 부위 이동 금지(§0-5/§36).

### 8.2 갱신된 Batch 순서 (한 번에 하나)

1. **Batch 2 (진행 중, 마무리 필요)** — Eligibility + 추천 + 채택. 코드가 작업 트리에 staged(미커밋·최종 검증 미완료) 상태. 마무리 항목 3개: (a) 운동 블록을 판단·처치 레인으로 이동(C6), (b) `LBP_NEURAL_01`의 "직접 뒷받침"을 무조건이 아니라 `lbp_exam_neurodynamic` 결과 POSITIVE일 때만, (c) 목표 기능 미선택 시 빈 화면 대신 안내 1줄. 그 뒤 검증 gate → 커밋 → Opus delta → fix → closing.
2. **Batch 2.5** — Working Hypothesis 최소 형태(C1) + structured 결과 6상태(C3). 새 임상 의미 없음(원장 선택·기록 필드). Opus delta 필수(공유 enum 변경).
3. **Batch 3** — 재진 Quick Check 5문항 + safety refresh + 운동 실제 시행/난이도 기록(C4).
4. **Batch 4 (필수)** — EMR 고정 6키 포맷 + CRM `reassess_due` 최소 write-through(C5).

### 8.3 Exact Gaps 추가

| # | Gap | Batch |
|---|---|---|
| G15 | `ExamCheckStatus`에 LIMITED / NOT_PERFORMED 부재(§8-5 위반) | 2.5 |
| G16 | Working Hypothesis 최소 구조(원장 선택 chip, 자동 계산 없음) | 2.5 |
| G17 | 운동 블록 배치가 canonical route 순서와 불일치(레인2) | 2 마무리 |
| G18 | 재진 Quick Check 5문항 중 "운동 실제 시행·난이도", "치료 후 이상반응" 기록 필드 부재 | 3 |
