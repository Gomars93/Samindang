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

---

## 9. Batch 3 브리프 — 재진 간단 체크(Quick Check) + 세부 체크 주기 표시 (Fable 최소 설계, 2026-09-03)

**전제(PO 결정, DECISIONS 2026-09-03):** Batch 3을 2.5b/2.5c보다 먼저 한다. 초진에서 원장이 판단할 것을 최적화하는 층은 충분히 쌓였고, 이제 "재진은 30~60초 체크, 일정 주기마다 세부 체크"라는 재진 쪽 절반을 닫는다. 숫자 threshold 없음. 세부 재검은 자동으로 열지 않고 원장이 선택.

### 9.1 현재 재진 화면 실측 (변경 전)

- `RevisitWorkspace.tsx`(문진 없는 재진 전용, `submission_id === null`): 오늘 환자 입력(`MicroFollowUpCard`, 환자 태블릿 30~60초 응답) → 이전 방문 참고(읽기 전용) → 오늘 원장 입력(이어받기 버튼 → `ClinicalLoopStatusBar` → 최종 판단 → 관리 계획 → 재평가 대상 → 접힌 `오늘 재검` → 접힌 `다음 재평가 계획 변경`).
- `VisitWorkspaceState`(`visitWorkspace.ts`, schema `1.0.0`): finalAssessment / carePlan / followUpTargets / nextReassessmentPlan / reassessment. **원장이 "오늘 상태를 체크로 남기는" 필드가 없다** — 환자 응답(`MicroFollowUpResponse`)은 있으나 원장의 30~60초 판단은 free text(최종 판단)뿐. G18(운동 실제 시행·난이도, 치료 후 이상반응 기록 부재)이 여기서 비롯된다.
- `NextReassessmentPlan`(status UNSET/DATE/VISIT_COUNT/CLINICIAN_DECIDES)은 저장·표시만 될 뿐, "지금 그 시점에 도달했는가"를 알려주는 곳이 없다. 게다가 재진 화면은 **직전 방문 1건**의 plan만 읽으므로, 초진에서 세운 plan을 재진 1에서 안 바꾸면(UNSET) 재진 2에서는 plan 자체가 사라진다.
- 이전 방문 참고에는 이전에 **채택한 운동**이 표시되지 않는다(초진 `painRehabSuggestions` ACCEPTED 항목). 운동 시행 여부를 물으려면 원장이 기억에 의존해야 한다.

### 9.2 범위 (이번 batch에서 하는 것)

**(a) 데이터: `revisitQuickCheck` (additive, `VISIT_WORKSPACE_SCHEMA_VERSION` 불변)**

새 파일 `src/doctor/workspace/revisitQuickCheck.ts` (순수 로직, React 없음):

| 항목(5) | 필드 | 값 (기본 `NOT_ASSESSED`) | 한국어 chip |
|---|---|---|---|
| 목표 기능 변화 | `targetFunctionChange` | NOT_ASSESSED / BETTER / SAME / WORSE | 좋아짐 / 비슷함 / 나빠짐 |
| 전체 증상 반응 | `overallResponse` | NOT_ASSESSED / BETTER / SAME / WORSE | 좋아짐 / 비슷함 / 나빠짐 |
| 새 신경증상·위험신호 | `newNeuroOrRedFlag` | NOT_ASSESSED / NO / YES | 없음 / 있음 |
| 운동 실제 시행·난이도 | `exerciseAdherence` | NOT_ASSESSED / NOT_PRESCRIBED / NOT_DONE / PARTIAL / DONE_AS_PLANNED / DONE_TOO_HARD / DONE_TOO_EASY | 처방 없음 / 안 함 / 일부만 / 계획대로 / 했지만 너무 어려움 / 했지만 너무 쉬움 |
| 치료 후 이상반응 | `adverseEffect` | NOT_ASSESSED / NO / YES | 없음 / 있음 |

추가 필드: `note: string`(선택, 짧은 메모 1칸 — 이상반응/신경증상 내용 등; 이 외 free text 없음), `recordedAt: string | null`(5항목 중 하나라도 NOT_ASSESSED가 아니게 된 시점, 기존 카드 관례).

`VisitWorkspaceState`에 `revisitQuickCheck: RevisitQuickCheck` 추가. `deserializeVisitWorkspaceState`: `sanitizeShape` + 각 enum 값을 `isValid*` 가드로 검증, 손상/미지 값 → `NOT_ASSESSED`, 레거시 레코드(필드 없음) → `emptyRevisitQuickCheck()`. `visitWorkspaceStateEquals`는 JSON 비교라 자동 반영.

**(b) 파생 안내 1~3줄: `deriveRevisitQuickCheckGuidance(value) → { lines: string[]; safetyRefreshSuggested: boolean }`**

점수·가중치·threshold 없음. chip 상태에서 문장으로의 **직접 대응**만:

1. `newNeuroOrRedFlag === 'YES'` → `safetyRefreshSuggested = true` + "새 신경증상·위험신호: 안전 확인부터. 재초진 문진(태블릿) 또는 신경학적 기본검사를 고려하세요." (자동으로 아무것도 열거나 보내지 않음)
2. `adverseEffect === 'YES'` → "치료 후 이상반응 기록됨: 처치 계획 재검토."
3. `targetFunctionChange === 'WORSE'` 또는 `overallResponse === 'WORSE'` → "악화: 계획 재검토."
4. `exerciseAdherence === 'DONE_AS_PLANNED'` 이고 `targetFunctionChange === 'SAME'` 이고 `overallResponse === 'SAME'` → "계획대로 시행했는데 변화 없음: 운동·처치 계획 재검토 고려."
5. `exerciseAdherence === 'DONE_TOO_HARD'` → "운동이 어려움: 쉬운 단계 또는 다른 운동 고려." / `'DONE_TOO_EASY'` → "운동이 쉬움: 진행 단계 고려(원장 판단)." (progression 엔진 없음, 문장만)
6. `exerciseAdherence === 'NOT_DONE'` 또는 `'PARTIAL'` → "운동 시행 부족: 장애 요인 확인." 
7. **위 1~6 중 아무것도 해당 없고, 5항목이 전부 NOT_ASSESSED가 아니며**, `newNeuroOrRedFlag === 'NO'` 이고 `adverseEffect === 'NO'` 일 때만 → "유지·진행 가능(원장 판단)."
8. 그 외(일부 미평가) → 빈 lines. **NOT_ASSESSED는 절대 '없음'으로 취급하지 않는다** — 신경증상 미평가면 "유지·진행" 문장은 나오지 않는다.

이 문장들은 원장 판단을 대신하지 않는 참고 문구다(카드 hint에 명시). Opus는 각 문장이 chip 의미를 넘어서는 임상 판단을 만들지 않는지 검수한다.

**(c) "세부 체크 주기 도달" 표시: `computeDetailCheckDue(priorVisits, todayISO) → DetailCheckDue | null`**

입력은 `PatientHistoryResult.visits`(최신순, 오늘 방문 제외)와 오늘 날짜(테스트용 주입). 규칙:

- 최신순으로 훑어 **처음 만나는 `status !== 'UNSET'` plan**을 유효 plan으로 본다(직전 방문이 UNSET이면 그 이전을 본다 — 9.1의 "plan 소실" 결함 수정). 유효 plan이 있는 방문의 인덱스를 `k`라 한다(k=0이 직전 방문).
- `DATE`: `targetDate`가 `yyyy-mm-dd` 형식이고 `todayISO >= targetDate`(문자열 비교, 시간대 문제 없음) → due. 형식이 아니면 null(추측 금지).
- `VISIT_COUNT`: `afterVisitCount`가 양의 정수이고 `k + 1 >= afterVisitCount` → due (plan을 세운 방문 이후 오늘까지의 방문 수가 k+1). 아니면 null.
- `CLINICIAN_DECIDES` / `UNSET` / 유효 plan 없음 / 방문 없음 / 손상 → null.
- 반환: `{ reason: 'DATE' | 'VISIT_COUNT', planLabel: string, sourceVisitCreatedAt: string }` — 표시용 사실만. 숫자 threshold를 시스템이 만들지 않는다(값은 전부 원장이 세운 plan).

표시: 오늘 원장 입력 섹션의 `오늘 재검` `<details>` **바로 위**에 1줄 — "이전에 계획한 세부 재검 시점입니다(날짜 지정 2026-09-01 / 방문 3회 후) — 아래 '오늘 재검'을 펼쳐 진행할지 원장이 정합니다." `<details open>` 식은 **변경하지 않는다**(due여도 자동으로 열지 않음). `role="status"`.

**(d) UI: `RevisitQuickCheckCard.tsx`** (`NextReassessmentPlanCard` 관례: `value`/`onChange` props, `workspace__followUpChip` + `aria-pressed`, 같은 chip 재클릭 → NOT_ASSESSED로 해제). 제목 "재진 간단 체크(30~60초)", hint "원장이 보고 듣고 확인한 것만 표시합니다. 환자 태블릿 응답(위)은 자동으로 옮겨오지 않습니다." 5행 chip + 메모 1칸 + 안내 문장(`deriveRevisitQuickCheckGuidance`). 1번 안전 문장은 `workspace__revisit__safetyNotice`(신규 최소 CSS) 로 시각 구분, `role="alert"` 는 쓰지 않는다(재렌더마다 스크린리더 반복 방지) — `role="status"`.

`RevisitWorkspace.tsx` 배치: 오늘 원장 입력 → 이어받기 행 → `ClinicalLoopStatusBar` → **`RevisitQuickCheckCard`** → 최종 판단 → 관리 계획 → 재평가 대상 → (c) 표시 줄 → 오늘 재검 details → 다음 재평가 계획 details. `loopStatus`에 `{ key: 'quickCheck', label: '재진 간단 체크', done: revisitQuickCheck.recordedAt !== null }` 를 **맨 앞**에 추가.

**(e) 이전 방문 참고 보강 (읽기 전용, 2줄)**

- 직전 방문이 재진이면 `summarizeRevisitQuickCheckKo(prior.revisitQuickCheck)` → "이전 간단 체크: 목표 기능 좋아짐 · 운동 계획대로 · 이상반응 없음"(NOT_ASSESSED 항목은 생략, 전부 NOT_ASSESSED면 줄 자체 생략). 함수는 `revisitQuickCheck.ts`에 두고 단위 테스트.
- 직전 방문이 초진(submission)이면 `painRehabSuggestions` 중 `status === 'ACCEPTED'`의 제목을 "이전에 채택한 운동: A, B" 로 표시(없으면 생략). `priorVisitRecapLines` 안에서 처리, `deserializeWorkspaceState`를 이미 거친 값만 읽는다.

**(f) 테스트 (통과 전 종료 금지)**

- 신규 `tests/revisit-quick-check.spec.mjs` + `package.json` `test:revisit-quick-check`(esbuild: `revisitQuickCheck.ts` esm 번들 + `RevisitQuickCheckCard.tsx` cjs 번들, `test:all`에 합류):
  - 기본값 전부 NOT_ASSESSED, `recordedAt` null; `isValid*` 가드가 미지 문자열 거부.
  - guidance 규칙 1~8 각각 1건 이상 + **변이 저항 3건**: (i) 신경 NOT_ASSESSED + 나머지 전부 양호 → "유지·진행" 없음, safety false; (ii) 신경 YES 단독 → safety true(다른 항목 미평가여도); (iii) 5항목 전부 양호·NO → "유지·진행" 1줄만.
  - `computeDetailCheckDue`: DATE 당일 due / 전날 아님 / 잘못된 날짜 null; VISIT_COUNT k+1≥n due, k+1<n 아님, 0·음수·비정수 null; 직전 UNSET + 그 이전 DATE → 그 이전 plan 사용; CLINICIAN_DECIDES null; visits 비배열·원소 null·plan 손상 → null(throw 금지).
  - `summarizeRevisitQuickCheckKo`: 전부 NOT_ASSESSED → null; 일부 → 해당 항목만.
  - 카드 렌더(`react-dom/server`): 5 그룹 제목·chip 라벨, 기본 상태에서 `aria-pressed="true"` 0개, 값 설정 시 해당 chip만 true, 안전 문장은 신경 YES일 때만 존재(indexOf/slice로 비-vacuous 확인).
- `tests/workspace-round3.spec.mjs`: `VisitWorkspaceState` round-trip에 `revisitQuickCheck` 포함; 레거시(필드 없음) → empty; 손상 enum → NOT_ASSESSED; `visitWorkspaceStateEquals`가 quick check 변경을 감지; carry-forward 결과에 quick check가 **없음**(구조적: `carryForwardSourceFromVisitWorkspace` 반환 키에 없고, 적용 후 오늘 workspace의 quick check가 empty 그대로).
- `tests/doctor-workspace.spec.mjs`(기존 RevisitWorkspace 소스 검사 관례): 카드가 `ClinicalLoopStatusBar` 다음·`PainFinalAssessmentCard` 이전에 마운트; loop 항목 `quickCheck` 존재; `오늘 재검` details의 `open=` 식이 due 변수를 참조하지 않음; due 표시 줄이 details 앞에 있음.
- `npx tsc -b`, `npm run build`, `npm run test:all` PASS. `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` 비어 있음.

### 9.3 금지 / 손대지 않는 것

- `revisitCarryForward.ts`, `microFollowUp.ts`, `DoctorWorkspace.tsx`, `PainWorkspace.tsx`, `persistence.ts`(초진 workspace), `server/`, FROZEN, 태블릿. 서버 변경 불필요: 직전 재진의 `VisitWorkspaceState`는 이미 클라이언트에서 `getVisit`으로 읽는다.
- 환자 태블릿 응답(`MicroFollowUpResponse`)을 quick check로 자동 복사하지 않는다(출처 분리 원칙).
- 점수/threshold/자동 escalation/자동 재초진 전환/EMR·CRM 변경(Batch 4)/Working Hypothesis(2.5c)/ExamCheckStatus 확장(2.5b).
- Stop point: 위 (b)의 문장 중 하나라도 "안전 의미"를 바꾸는 것으로 판단되면 구현을 멈추고 `CLINICAL DECISION REQUIRED`로 보고한다.

---

## 10. Batch 3.1 브리프 — 재진 화면 잔손질 2건 (PO 승인 2026-09-03, Fable 최소 설계)

**전제:** Batch 3 CLOSED 상태(HEAD `565d600`)에서 PO가 "복잡하게 만들지 않는다"를 조건으로 두 건을 승인. 자동으로 여는 것 없음, 새 규칙·threshold 없음, 새 필드 없음.

### 10.1 (A) "재검토" 계열 안내에 세부 재검 꼬리말 1줄

- `revisitQuickCheck.ts` `deriveRevisitQuickCheckGuidance`: 규칙 2(이상반응) / 3(악화) / 4(계획대로 시행+변화 없음) 중 **하나라도** 발화하면, 기존 문장들 뒤에 **한 번만** 별도 줄을 추가한다:
  `export const REVISIT_QUICK_CHECK_DETAIL_CHECK_HINT = "필요하면 아래 '오늘 재검'을 펼쳐 이전 검사 결과와 비교하세요."`
- 규칙 1(신경증상, 이미 더 강한 문장), 5/6(운동 조정 계열), 7(유지·진행)에는 붙이지 않는다 — 알림 피로 방지.
- 순서: 기존 규칙 1~6 문장 → 꼬리말(해당 시) → (규칙 7은 lines가 비었을 때만이므로 영향 없음). `safetyRefreshSuggested` 불변.
- 카드/`RevisitWorkspace.tsx` 변경 없음(문장은 이미 `lines`로 렌더됨). `<details open=...>` 식 불변.

### 10.2 (B) 재진 3회차 이후에도 "이전에 채택한 운동" 표시

현재 `acceptedRehabTitles`는 직전 방문이 초진(submission-backed)일 때만 계산된다(`priorVisitRecapLines`). 직전이 재진이면 빈 배열 → 초진에서 채택한 운동이 화면에서 사라진다.

- `longitudinal.ts`에 순수 함수 추가: `findLatestSubmissionBackedPriorVisit(visits: unknown): { visitId: string; submissionId: string; createdAt: unknown } | null` — 최신순 배열에서 처음 만나는 `submissionId`가 비어있지 않은 문자열인 원소. 비배열/원소 null/필드 손상 → null, throw 금지.
- `RevisitWorkspace.tsx`:
  - 새 state `rehabSourceSubmission: { submission: SubmissionRecord; createdAt: unknown } | null` (load 시작 시 null로 리셋 — 기존 리셋 블록과 같은 위치).
  - load 안에서 `const rehabSource = findLatestSubmissionBackedPriorVisit(historyResult.data.visits)`. `rehabSource`가 있고 그 `visitId`가 `latest.visitId`와 같으면 **이미 받은 `priorSubmission` 결과를 재사용**(추가 fetch 없음); 다르면 `getSubmission(rehabSource.submissionId)` 1회 추가 fetch(실패 시 조용히 null — 다른 recap에 영향 없음, `cancelled` 가드 준수).
  - `acceptedRehabTitles`는 `priorVisitRecapLines`/`priorVisitRecapLinesFromVisitWorkspace` 반환에서 **제거**하고, 새 로컬 순수 함수 `acceptedRehabTitlesFromSubmission(sub: SubmissionRecord | null): string[]`(내부에서 `deserializeWorkspaceState`를 거친 `painRehabSuggestions` 중 `status === 'ACCEPTED'`의 `title`)로 `rehabSourceSubmission?.submission`에서 계산한다.
  - 표시 문구: `<strong>이전에 채택한 운동({readablePriorVisitDateLabel(createdAt)} 초진)</strong> A, B`. 직전 방문이 초진이면 결과적으로 기존과 동일한 내용 + 날짜만 추가.
  - `priorSubmission`(직전 방문 recap·carry-forward 원천)의 의미는 **그대로**: 직전 방문이 재진이면 여전히 null. carry-forward는 손대지 않는다.

### 10.3 테스트

- `tests/revisit-quick-check.spec.mjs`: (A) 규칙 3 단독 → 꼬리말 1줄 존재; 규칙 2+3+4 동시 → 꼬리말 **정확히 1회**; 규칙 1 단독 / 5 단독 / 6 단독 / 규칙 7 케이스 → 꼬리말 없음; 꼬리말이 항상 마지막 줄. 기존 변이 저항 3건 유지. (B) `findLatestSubmissionBackedPriorVisit`: `[revisit, revisit, initial]` → initial; `[initial, …]` → index 0; 전부 revisit → null; 비배열/`[null]`/`submissionId` 비문자열·빈문자열 → 건너뜀/null, throw 없음. (`longitudinal.ts`를 test 스크립트 esbuild 번들에 추가.)
- `tests/doctor-workspace.spec.mjs`(소스 검사 관례): `rehabSourceSubmission`이 load 리셋 블록에 포함; latest와 같을 때 재fetch 없이 재사용하는 분기 존재; `priorVisitRecapLines` 반환에 `acceptedRehabTitles` 없음; 표시 문구에 `readablePriorVisitDateLabel` 사용; `<details open=` 식 불변.
- `npx tsc -b`, `npm run build`, `test:revisit-quick-check`, `test:workspace-round3`, `test:doctor-workspace`, `test:doctor-reset-key`, `test:all` PASS. FROZEN/서버 zero-diff.

### 10.4 금지
- 자동 열기, 새 필드, threshold, 카드 UI 변경, `revisitCarryForward.ts`/`microFollowUp.ts`/`persistence.ts`/`DoctorWorkspace.tsx`/`PainWorkspace.tsx`/`server/`/FROZEN 변경. 규칙 1·5·6·7 문장 자구 변경 금지.
## 11. Batch 2.5c 브리프 — Working Hypothesis 최소 형태 (PO 승인 2026-09-03, Fable 설계)

**PO 결정 3건**: (1) 5개 패턴 chip + 기존 자유 텍스트 유지, (2) 환자 안내문에도 쉬운 말로 노출, (3) Batch 2.5b Opus 검수 선행.

### 11.1 발견한 제약 — 환자 출력 경계 (설계에 반영)

`patientCarePlanPreview.ts` 파일 헤더가 명시적 계약을 갖고 있다: 환자용 출력에는
**원장이 직접 쓴 Care Plan 필드만** 들어가며, 미확인 제안(PhysicalExamSuggestion /
HerbalPatternCandidate / RehabSuggestion)은 **절대 들어가지 않는다**. 가설 chip을
환자 출력에 직접 흘리면 이 계약이 깨진다 — 가설은 정의상 미확정이다.

**해결(신규 개념 없음)**: Batch 2의 운동 채택 흐름을 그대로 재사용한다.
chip 선택 → 시스템이 쉬운 말 초안 1문장 **제안** → 원장이 "안내문에 넣기"를
누르면 기존 `PainCarePlan.patientInstruction`(이미 "환자에게 전달할 안내문")에
텍스트로 삽입 → 기존 경로로 환자 안내문에 나간다. `patientCarePlanPreview.ts`는
**한 줄도 바꾸지 않는다**. 원장이 삽입 후 문장을 수정할 수 있다.

즉 환자에게 가는 것은 언제나 원장이 확인·삽입한 문장이지, 시스템이 자동으로
내보낸 가설이 아니다. PO 결정(환자 노출)을 충족하면서 기존 안전 경계를 지킨다.

### 11.2 데이터 (additive, LBP 전용)

`src/doctor/workspace/lbpWorkingHypothesis.ts` (신규, 순수 로직):

- 5 패턴 고정 id/라벨: `LUMBAR_MOVEMENT`(허리 움직임 관련) / `NEURAL`(신경근 관여) /
  `WALK_STAND_LEG`(보행·기립 하지 패턴) / `HIP`(고관절 기여) / `SIJ`(천장관절 기여).
- support 4값: `UNJUDGED`(미판단, 기본) / `HIGHER`(가능성 높음) / `CONSIDER`(고려) /
  `LOWER`(가능성 낮음). **점수·계산 없음.** 원장이 직접 찍는다.
- `LbpWorkingHypothesis = { supports: Record<PatternId, Support>; note: string; recordedAt: string | null }`
  (`note`는 기존 자유 텍스트와 별개가 아니라 **만들지 않는다** — 기존
  `finalAssessment.finalWorkingAssessment`가 그 역할. 필드는 supports + recordedAt만.)
- 가드 `isValidLbpHypothesisSupport`, 손상/미지 값 → `UNJUDGED`.
- `WorkspaceState`(초진)와 `VisitWorkspaceState`(재진) 양쪽에 `lbpWorkingHypothesis`
  추가. 둘 다 additive, schema version 불변, 레거시 → empty.

### 11.3 파생 문구 (계산 아님, 직접 대응)

- `summarizeLbpWorkingHypothesisKo(v)` → EMR/재진 recap용 한 줄:
  "임상 가설: 신경근 관여 가능성 높음 · 허리 움직임 관련 고려" (UNJUDGED 항목 생략,
  전부 UNJUDGED면 `null` → 줄 자체 없음).
- `patientSentenceDraftKo(v)` → 환자 안내문 초안 1문장. **HIGHER인 패턴이 정확히
  1개일 때만** 문장을 만든다(여러 개면 원장이 직접 쓰는 게 맞다 → `null`).
  문장은 확정 진단으로 읽히지 않도록 고정 표현: 
  "오늘은 <쉬운 말 표현>과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라
  경과를 보며 다시 판단합니다."
  쉬운 말 표현 5종(고정): 허리 움직임 / 다리로 가는 신경 / 오래 걷거나 서 있을 때
  나타나는 다리 / 고관절 / 골반 뒤쪽 관절.

### 11.4 UI

- `LbpWorkingHypothesisCard.tsx`: 5행 × 3 chip(`workspace__followUpChip` + `aria-pressed`,
  재클릭 → UNJUDGED). `UNJUDGED`는 저장값의 기본값일 뿐 렌더되는 chip이 아니다
  (Batch 2.6 E-2, `DECISIONS.md` 2026-09-04 "원장 화면 실측 감사 (Opus) 및
  Batch 2.6 착수 / 2.5d 보류"에서 승인 — `RevisitQuickCheckCard`의 `NOT_ASSESSED`와
  동일 관례). 카드 제목 "임상 가설(확정 진단 아님)". hint 1줄:
  "원장이 직접 선택합니다. 시스템이 계산하지 않습니다."
- 배치: **판단·처치 레인, 최종 판단 카드 바로 앞**(canonical route: 확인 → 임상가설
  → 치료·운동 결정). 운동 블록은 지금대로 최종 판단 다음.
- 환자 문장: `patientSentenceDraftKo`가 문장을 만들 때만 카드 아래 회색 상자로
  초안 + "안내문에 넣기" 버튼 1개. 누르면 `patientInstruction` 끝에 줄바꿈 후 추가
  (이미 같은 문장이 있으면 중복 삽입 안 함). 자동 삽입 없음.
- 재진: 같은 카드 재사용. 그 위에 이전 방문 가설 1줄 읽기 전용 표시 +
  기존 이어받기 행 관례로 "이전 가설 이어받기" 버튼(오늘 값이 전부 UNJUDGED일 때만
  활성). 자동 적용 없음.

### 11.5 EMR

`emrPreview.ts` `buildPainWorkspaceEmrPreview`: `Assessment` 줄 **앞**에 optional
"임상 가설" 줄 추가(`summarizeLbpWorkingHypothesisKo`가 null이면 줄 없음).
기존 `Assessment`(자유 텍스트)는 그대로.

### 11.6 테스트 (통과 전 종료 금지)

- 신규 `tests/lbp-working-hypothesis.spec.mjs` + `test:lbp-working-hypothesis`(test:all 합류):
  기본 전부 UNJUDGED·recordedAt null; 가드가 미지 문자열 거부; 
  `summarize…`: 전부 UNJUDGED → null, 일부만 → 해당 패턴만, UNJUDGED는 "미판단"으로도
  출력하지 않음; `patientSentenceDraft…`: HIGHER 0개 → null, 2개 이상 → null,
  정확히 1개 → 고정 문장 + "확정 진단이 아니라" 문구 **반드시 포함**(이 문구가 빠지면
  실패하는 단언); 5개 패턴 각각의 쉬운 말 표현이 라틴 문자 없이 정확.
- 카드 렌더: 5그룹·4chip, 기본 `aria-pressed="true"` 0개, 재클릭 해제,
  "안내문에 넣기" 버튼은 초안이 있을 때만 존재(indexOf/slice 비-vacuous).
- 삽입 동작: 빈 `patientInstruction`에 삽입 / 기존 텍스트 뒤 줄바꿈 삽입 /
  중복 삽입 안 함 / 삽입 후 원장이 수정해도 다시 덮어쓰지 않음.
- persistence: 초진·재진 양쪽 round-trip, 레거시 → empty, 손상 → UNJUDGED,
  carry-forward가 가설을 **자동으로** 옮기지 않음(구조적).
- `patientCarePlanPreview.ts` **zero-diff** 단언(소스 검사) — 환자 출력 경계 회귀 방지.
- `npx tsc -b`, `npm run build`, `npm run test:all` PASS. FROZEN/server/tablet zero-diff.

### 11.7 금지
- 자동 계산·점수·threshold, 확정 진단명, 가설→운동추천 연결, 자동 환자 노출,
  `patientCarePlanPreview.ts` 수정, FROZEN/서버/태블릿 변경, 새 문진.
- Stop point: 환자 문장 자구가 확정 진단으로 읽힐 소지가 있으면 구현 중단하고
  `CLINICAL DECISION REQUIRED` 보고.

---

## 12. Batch 2.5d 브리프 — 가설 추정 근거 표시 (PO 요청 2026-09-04, Fable 설계)

**PO 요청 원문**: "이학적 검사와 세부문진으로 추정된다 정도는 가능한 거 아냐?"
**Fable 판단**: 가능하다. 이전의 "가설 엔진 = 과설계" 판정은 과했다. 근거는 §12.1.

### 12.1 왜 이것이 새로운 임상 추론이 아닌가 (핵심 근거)

Batch 1의 검사 제안 규칙을 다시 읽으면, **각 검사는 애초에 특정 패턴을 가리기 위해 제안된 것**이다. 즉 "어느 검사가 어느 질문에 답하는가"는 이미 결정되어 저장소에 있다:

| Batch 1이 제안하는 검사 | 그 검사가 답하는 질문 = 5패턴 중 하나 |
|---|---|
| `lbp_exam_neurodynamic` 하지직거상/슬럼프 (다리 증상 YES일 때 제안) | 신경근 관여 |
| `lbp_exam_walking_tolerance` 보행 가능시간·거리 (LBP_08 YES일 때 제안) | 보행·기립 하지 패턴 |
| `lbp_exam_hip_screen` 고관절 빠른 선별 | 고관절 기여 |
| `lbp_exam_sij_screen` 천장관절 기여 확인 | 천장관절 기여 |
| `lbp_exam_target_function_reproduction` 목표 동작 재현 + 허리 움직임 반응 | 허리 움직임 관련 |

**따라서 2.5d가 하는 일은 "질문 옆에 그 답을 갖다 놓는 것"뿐이다.** 새 연결을 창작하지 않는다. 이 대응표에 없는 규칙은 만들지 않는다.

### 12.2 데이터 — **저장하는 것이 없다**

새 필드 없음. `WorkspaceState`/`VisitWorkspaceState` 변경 없음. 스키마 버전 변경 없음. 근거는 화면을 그릴 때 계산해서 보여줄 뿐이고, **기록되는 것은 여전히 원장이 찍은 지지 수준 하나뿐**이다.

신규 순수 모듈 `src/doctor/workspace/lbpHypothesisEvidence.ts`:

```
deriveLbpHypothesisEvidence({ payload, flags, examSuggestions, directionalResponse })
  -> Record<PatternId, { supporting: string[]; opposing: string[] }>
```

### 12.3 근거 판정 규칙 (전부 기존 값의 직접 대응)

**검사 결과에서** — 6상태 중 두 개만 근거가 된다:
- `POSITIVE`(양성/이상 소견) → **뒷받침**
- `NEGATIVE`(음성/정상) → **반대**
- `UNCLEAR` / `LIMITED` / `NOT_PERFORMED` / `NOT_YET_CHECKED` → **어느 쪽도 아님, 표시하지 않음**

미확인을 음성으로 취급하지 않는다는 프로젝트 원칙 그대로다. `LIMITED`/`NOT_PERFORMED`를 여기 표시하지 않는 것은 정보를 숨기는 게 아니다 — 바로 위 확인 항목 목록이 이미 모든 상태를 그대로 보여주고 있고, 이 카드는 검사 기록부가 아니라 판단 보조이기 때문이다.

**문진·계산값에서** (출처를 `(문진)`으로 명시):
- FROZEN `flags.leg_symptom_present === 'YES'` → 신경근 관여 **뒷받침**: `다리 증상 있음(문진)`
- `responses.modules.lbp.claudication_walking === 'YES'` → 보행·기립 하지 패턴 **뒷받침**: `걸을수록 다리 증상 악화(문진)`
- `UNKNOWN`/무응답은 어느 쪽도 아님

**허리 움직임 반응에서**:
- `FLEXION_FAVORABLE` / `EXTENSION_FAVORABLE` → 허리 움직임 관련 **뒷받침** (기존 라벨 그대로)
- `DISTAL_WORSENING` → 신경근 관여 **뒷받침**
- `NO_CLEAR_DIRECTION` → 허리 움직임 관련 **반대**
- `NOT_ASSESSED` / `UNCLEAR` → 어느 쪽도 아님

**표시 문자열은 전부 기존 상수를 재사용한다** — 검사 제목(`lbpExamSuggestions.ts`), 상태 라벨(`EXAM_CHECK_STATUS_LABEL`), 방향 반응 라벨(`LBP_DIRECTIONAL_RESPONSE_OPTIONS`). 새 임상 용어를 만들지 않는다.

**안전 우선**: `flags.lbp_safety_status !== 'CLEAR'`이면 근거를 **아무것도 표시하지 않는다**(Batch 1의 검사 제안이 같은 조건에서 `[]`를 반환하는 것과 동일한 규칙). 안전 확인이 먼저다.

### 12.4 UI — 기존 카드 안에 두 줄 추가

`LbpWorkingHypothesisCard`의 각 패턴 행에서, chip 줄 **위**에:

```
신경근 관여
  뒷받침  하지직거상 또는 슬럼프검사: 양성/이상 소견 · 다리 증상 있음(문진)
  반대    하지 신경학적 기본검사(감각·반사): 음성/정상
  [가능성 높음] [고려] [가능성 낮음] [미판단]
```

- 근거가 없는 패턴은 두 줄 다 생략 — 빈 줄이 생기지 않는다.
- **지지 수준은 절대 자동으로 정해지지 않는다.** 근거는 표시일 뿐이고, chip은 원장이 누르기 전까지 `미판단`이다.
- 배지·점수·순위·정렬 없음. 패턴 순서는 지금의 고정 순서 그대로.
- 카드 hint에 한 줄 추가: `근거는 원장님이 기록한 검사 결과와 문진 답변을 그대로 옮긴 것입니다. 시스템이 가능성을 판단하지 않습니다.`

### 12.5 테스트 (통과 전 종료 금지)

신규 `tests/lbp-hypothesis-evidence.spec.mjs` + `test:lbp-hypothesis-evidence`(`test:all` 합류):

- 6상태 각각에 대해 `POSITIVE`만 뒷받침, `NEGATIVE`만 반대, 나머지 4개는 **어느 목록에도 없음**(6개 전부 개별 단언 — `LIMITED`/`NOT_PERFORMED`가 조용히 근거가 되면 실패).
- `leg_symptom_present`가 `UNKNOWN`/`NO`일 때 신경근 관여에 문진 근거 없음.
- `claudication_walking` 무응답/`UNKNOWN`일 때 보행 패턴에 근거 없음.
- 방향 반응 6값 각각의 매핑, `NOT_ASSESSED`/`UNCLEAR`는 양쪽 다 없음.
- `lbp_safety_status`가 `REVIEW_REQUIRED`/`URGENT_REVIEW`이면 **전 패턴 근거 0개**.
- 손상 입력(flags 비객체, examSuggestions 비배열, 원소 null, status 미지 문자열)에서 throw 없이 빈 근거.
- **표시 문자열이 기존 상수와 일치**: 근거 문자열에 등장하는 검사 제목·상태 라벨이 `lbpExamSuggestions.ts`/`provenance.ts`의 상수와 정확히 같음(새 용어 창작 방지).
- 카드 렌더: 근거 있는 패턴에만 두 줄이 나타나고, **근거가 있어도 `aria-pressed="true"`인 chip은 0개**(자동 선택 방지 — 이 단언이 이 batch의 핵심 보호장치).
- 뮤테이션 저항 필수 5종: (a) `LIMITED`를 뒷받침에 포함, (b) `NOT_YET_CHECKED`를 반대에 포함, (c) 안전 게이트 제거, (d) 근거가 있을 때 chip을 자동 선택, (e) 대응표에 없는 새 연결 추가.
- `npx tsc -b`, `npm run build`, `npm run test:all` PASS. FROZEN·서버·태블릿·`patientCarePlanPreview.ts` zero-diff.

### 12.6 금지
- 새 저장 필드, 스키마 변경, 점수·가중치·threshold·순위·정렬, 지지 수준 자동 설정, §12.1 대응표에 없는 연결 창작, 진단명, 가설→운동추천 연결, 환자 안내문 자동 변경, FROZEN·서버·태블릿 변경.
- **Stop point**: §12.3의 어떤 규칙이든 기존 값의 직접 대응을 넘어 새 임상 판단을 만든다고 판단되면 구현을 멈추고 `CLINICAL DECISION REQUIRED`로 보고한다.

### 12.7 PO 결정 대기 1건
**검사 전, 문진 근거만으로도 표시할지.** Fable 권고: **표시한다** — 근거에 `(문진)`이 명시되어 검사를 안 했다는 사실이 드러나고, 원장이 어느 방향으로 검사를 집중할지 판단하는 데 도움이 된다. 반대 논거: 검사 전에 화면이 먼저 방향을 제시하는 것이 원장 판단에 닻을 내릴 수 있다.

---

## 13. Batch 2.7-A 브리프 — 준비조건 확인을 운동 카드 안으로 (Fable 설계)

> **⚠️ 상태: 설계 확정 · 구현 보류 (PO 결정 2026-09-04).**
> 같은 화면을 세 번째 재설계 중이며 **실제 환자로 검증한 적이 한 번도 없다.**
> Batch 4(EMR) 완료 → 실제 환자 2~3명 파일럿 → 그 결과로 이 설계를 그대로 쓸지
> 고칠지 결정한다. **파일럿 전에 구현하지 말 것.**
>
> 착수 시 반영해야 할 것: Opus 설계 검수 개정 12건
> (`docs/LBP_V1_BATCH2_7A_OPUS_DESIGN_REVIEW_v0.1.md` G절) 및 PO 결정 CD-2.7A-1
> (잠긴 카드에는 이름 + 한 줄 설명만, 용량은 채택 후에만).
> **개정 1(잠긴 카드에 채택/보류/기각 버튼 금지)은 안전 blocker다** — 이를 빠뜨리면
> eligibility 엔진을 우회해 Care Plan에 운동이 들어간다.

**대체 관계**: 이 설계는 `DECISIONS.md` 2026-09-04의 **CD-2.7-4(자세 chip 4개로 축소)를 대체한다.** 사유는 §13.1.

### 13.1 CD-2.7-4를 그대로 구현할 수 없는 이유 (실측)

준비조건 15개 중 자세는 4개(누움/엎드림/네발기기/지지하고 서기)뿐이다. 자세 4개만 남기면
나머지 11개 조건이 영원히 `UNKNOWN`으로 남아 **20개 운동 중 12개가 영영 열리지 않는다.**
직접 계산한 결과:

> **[2026-09-04 정정 — Opus 설계 검수 B절] 아래 최초 수치(열림 8 / 막힘 12)는 틀렸다.**
> Fable이 "hard requirement만 자세 4개로 덮이면 열린다"로 계산했는데, 이는 **CD-1 수정
> 이전(2026-09-02) 엔진의 의미론**이다. 현재 엔진은 `lbpExerciseEligibility.ts:368`에서
> **미확인 regressible도 hard와 동일하게 DEFER**시킨다(PO가 기각한 옵션 A를 되살리지 않기
> 위해 Opus가 요구한 바로 그 수정). 즉 Fable은 자기가 대체하려는 결정의 피해를, CD-1이 닫아
> 놓은 구멍을 다시 연 상태로 계산했다.
>
> **Opus 전수 실행 결과(자세 16조합 × 방향반응 5값): 열림 4 / 막힘 16.**
> - 열리는 4개: `LBP_LUMBAR_02`, `LBP_LUMBAR_03`, `LBP_DIR_02`, `LBP_TRUNK_END_01`
> - Fable이 열린다고 잘못 분류한 4개와 실제 막히는 조건: `HIP_MOB_01`(regressible
>   `BALANCE_WITH_SUPPORT`), `HIP_STR_03`(동일), `FUNC_05`(regressible
>   `HIP_HINGE_CONTROL`), `EXPOSURE_03`(regressible `SITTING_TOLERATED` — 앉기는 자세
>   4개에 없다)
> - **화면 기준으로는 3개**: `LUMBAR_02`의 `targetFunctions`가 목표기능 선택기에 매핑되지
>   않아(기존 delta review defect 8) 애초에 나타나지 않는다.
> - 교차검증: 2.5a 도달성 프로브 재실행 결과가 2.5a 기록과 일치(하네스 정확성 확인).
>
> 결론(CD-2.7-4를 그대로 구현할 수 없다)은 **바뀌지 않으며 근거는 오히려 강해진다.**

(최초 기재, 오류 — 이력 보존용)
- ~~**열리는 8개**: LUMBAR_02, LUMBAR_03, DIR_02, HIP_MOB_01, TRUNK_END_01, HIP_STR_03, FUNC_05, EXPOSURE_03~~
- ~~**영영 못 여는 12개**: ACT_01·ACT_02, DIR_03, DIR_04, DEEP_TRUNK_01, DEEP_TRUNK_03, TRUNK_03, FUNC_01, LOAD_02, NEURAL_01, EXPOSURE_01, REG_01~~

요통에서 가장 기본인 **걷기**가 막힌다(`SAFE_WALKING`/`CAN_SELF_PACE`는 자세가 아니다).

**태블릿 문진으로 옮기는 안도 기각한다**(PO 제안, Fable 분석):
15개 중 자가보고가 성립하는 것은 `CAN_SELF_PACE`, `SAFE_WALKING` 2개뿐이다. 나머지 13개는
(a) 해보지 않은 자세라 환자 본인도 모르거나(자세 견딤 5종), (b) 동작의 질 관찰이라 자가보고
불가능하거나(힙힌지·몸통조절·부하준비·균형), (c) 오늘 진찰 결과에 의존한다(신경 활주 =
SLR/슬럼프 결과, 굽힘/신전 노출 = 원장이 이미 기록하는 "허리 움직임 반응"과 동일 정보).
게다가 **태블릿은 접수 시 1회**이고 준비조건은 오늘 컨디션·치료 후 상태에 따라 달라지므로
시점이 근본적으로 어긋난다. 2문항을 위해 FROZEN 태블릿을 여는 것은 이득 대비 비용이 크다.

### 13.2 실제 문제 (PO 불만의 정확한 소재)

지금은 모든 capability가 `UNKNOWN`이므로 **초진 화면을 열면 추천 카드가 하나도 없고**,
대신 `확인하면 시작 가능` 섹션이 5줄 안내문 + 후보별 조건 3버튼 행으로 먼저 뜬다.
원장은 **추상 명제를 먼저 인증해야 카드를 볼 수 있다.** PO가 승인한 것은
"운동 자동 추천 → 원장이 선택"인데 실제로는 "원장이 조건 인증 → 그제서야 추천"이다.

즉 문제는 **조건의 개수가 아니라 조건이 카드보다 앞에 있다는 것**이다.

### 13.3 설계 — 칩을 없애지 않고 위치만 옮긴다

**판정 로직·데이터 모델·저장 형식은 한 글자도 바꾸지 않는다.**
`lbpExerciseEligibility.ts`, `lbpExerciseRecommendation.ts`, `lbpEligibilityContext.ts`,
`persistence.ts`, `onSetLbpCapabilityStatus` 전부 zero-diff. 바뀌는 것은 `PainWorkspace.tsx`의
렌더 구조뿐이다.

**(a) 후보 목록을 하나로 합친다.** 지금은 READY 후보만 카드로 그리고 awaiting 후보는
별도 섹션에 조건 행으로만 그린다. 앞으로는 **하나의 순위 목록**에 둘 다 카드로 그린다.
순위는 기존 2-버킷 순서 그대로(READY 먼저, 그 다음 awaiting) — 초진처럼 아무것도 확인되지
않은 상태에서는 READY가 비어 있으므로 awaiting 카드가 자연히 상위 3개를 채운다.
`VISIBLE_REHAB_CANDIDATE_COUNT = 3` + `더보기` 관례 **불변**.

**(b) 조건 확인 버튼을 그 카드 안으로.** awaiting 카드는 자기 카드의
`unconfirmedCapabilities`만 인라인으로 표시한다:

```
엎드려 반복 허리 젖히기
  엎드릴 수 있나요?   [확인함] [지금은 안 됨]
  [채택](비활성) [보류] [기각]
```

- 조건이 남아 있는 동안 **그 카드의 `채택`만 비활성**(다른 카드는 영향 없음). 기존
  awaiting 후보가 채택 불가였던 것과 동일한 보호이며, 잠금 사유 문구는 기존 것을 재사용한다.
- `hard`와 `regressible`을 **시각적으로 구분한다**(백로그였던 구조적 분리를 여기서 해소):
  hard는 `꼭 필요` 표시, regressible은 `지금은 안 됨을 고르면 쉬운 단계로 시작` 한 줄.
  현재 `unconfirmedCapabilities`가 둘을 합쳐 담고 있으므로
  (`lbpExerciseRecommendation.ts:232`), 카드는 `missingHardRequirements` /
  `regressionRequirements`를 각각 받아 구분해 그린다 — **엔진의 판정은 그대로 두고
  표시만 나눈다.**

**(c) 5줄 안내문단 → 1줄.** 안전 의미가 있는 문장 하나만 남긴다:
`"미확인"은 "아니오"가 아닙니다 — 확인해야 시작할 수 있습니다.`

**(d) 되돌리기 목록은 접는다.** `확인함/지금은 안 됨으로 표시한 준비 조건` 카드는
운동 섹션 맨 아래 `<details>` 안으로(제목 `표시한 준비 조건 되돌리기`). **삭제 금지** —
Batch 2.5a Opus 검수가 요구한 undo 경로다.

### 13.4 유지되는 불변식 (테스트로 고정)

- **도달성**: 20개 운동 전부 여전히 도달 가능. 2.5a의 도달성 프로브
  (all-NO → `START_WITH_REGRESSION` 정확히 `{LUMBAR_03, HIP_MOB_01, HIP_STR_03, EXPOSURE_03}`,
  all-UNKNOWN → 0) 를 그대로 재실행해 **변화 없음**을 확인한다.
- **자동 선택 금지**: 조건이 인라인으로 보인다고 해서 어떤 값도 자동으로 찍히지 않는다.
  렌더 직후 `aria-pressed="true"`인 조건 버튼 0개.
- **잠금 유지**: `treatmentSafetyLocked`일 때 모든 카드의 채택이 비활성(기존 동작).
- **미확인 ≠ 음성**: `UNKNOWN`이 어디서도 `NO`로 취급되지 않는다.
- 판정 엔진 4파일 zero-diff, `persistence.ts` zero-diff, FROZEN/서버/태블릿 zero-diff.

### 13.5 테스트 (통과 전 종료 금지)

`tests/doctor-workspace.spec.mjs` + `tests/lbp-exercise-recommendation.spec.mjs`:
- 아무것도 확인 안 된 초진 렌더 → **운동 카드가 1개 이상 보인다**(현재는 0개). 상위 3개 + 더보기.
- awaiting 카드 안에 그 카드의 조건 버튼이 있고, **다른 카드의 조건은 없다**(카드 간 누수 금지).
- 조건 미해결 카드의 `채택`만 비활성이고, 같은 화면의 READY 카드 `채택`은 활성.
- hard/regressible 표시가 구분되고, regressible에만 "쉬운 단계" 문구가 붙는다.
- `확인하면 시작 가능`이라는 **별도 섹션 제목이 더 이상 존재하지 않는다**.
- 되돌리기 목록이 `<details>` 안에 있고 내용은 보존된다.
- 도달성 프로브 재실행 결과가 2.5a와 동일.
- 뮤테이션 필수 5종: (1) 조건 버튼이 카드 밖으로 다시 나감, (2) 조건 미해결인데 채택 활성,
  (3) 조건이 다른 카드에도 표시됨, (4) 렌더 시 조건이 자동으로 YES로 찍힘,
  (5) 되돌리기 목록 삭제.
- `npx tsc -b`, `npm run build`, `npm run test:all` PASS.

### 13.6 금지
- 판정 로직·데이터 모델·저장 형식 변경, 조건 개수 축소, 자동 확인, 태블릿 문항 추가,
  `VISIBLE_REHAB_CANDIDATE_COUNT` 변경, 되돌리기 경로 삭제, FROZEN/서버 변경.
- **Stop point**: 어떤 조건이든 화면에서 사라져 영영 확인할 수 없게 되면 즉시 중단하고
  `CLINICAL DECISION REQUIRED`로 보고한다.

---

## 14. Batch 4 브리프 — EMR 고정 6키 + CRM 최소 연동 + 확정된 화면 정리 3건 (PO 승인 2026-09-04, Fable 설계)

**범위 묶음 근거**: CD-2.7-1(처치 어휘)과 CD-2.7-2(EMR 복사 통일)가 EMR 포맷과 **같은 파일**(`emrPreview.ts`, `FinalAssessmentCard.tsx`, `DoctorView.tsx` 종결 섹션)을 건드린다. 따로 하면 같은 코드를 두 번 고친다. CD-2.7-3(치료 직후 값)은 파일은 다르지만 이미 결정이 끝나 추측이 없다. 준비조건(§13)은 **포함하지 않는다** — 파일럿 대기.

### 14.1 EMR 고정 6키

**키와 순서**(저장소 전 부위 문서가 이미 쓰는 표준 — `docs/HIP_V1_Evidence_Matrix_v0.1_HANDOFF.md:522`, `ELBOW_V1_Tablet_Question_Set_v0.1.1.md:598` 등):

| 키 | 라벨 | 출처 |
|---|---|---|
| `C/C` | 주호소 | `primaryConcern` |
| `O/S` | 발병 및 경과 | 태블릿 발병 시점/기간 + (재진) 경과 요약 |
| `S` | 주관적 소견 | 환자 자가보고(태블릿 응답, micro follow-up) |
| `O` | 객관적 소견 | **원장이 확인한 것만** — 검사 결과, 허리 움직임 반응, 오늘 재검 소견, 객관적 근력저하 |
| `A` | 평가 | 임상 가설 + 최종 임상 판단 + 치료 초점 |
| `P` | 계획 | 시행·예정 처치 + Care Plan + 재평가 대상 + 다음 상세 재평가 |

**절대 규칙 (전 부위 문서가 공통으로 명시)**: `O`에는 **환자 자가보고가 어떤 형태로도 들어가지 않는다.** 태블릿 응답에서 파생된 값은 `S`로만 간다. 이 경계가 이 batch의 유일한 임상 안전 항목이다.

**형식**: 키가 비어도 **6줄은 항상 출력**한다(`C/C: `처럼 빈 값). 고정 포맷의 목적이 "붙여넣으면 항상 같은 구조"이기 때문이다. 단 **빈 값을 '없음'/'정상'으로 쓰지 않는다**(기존 원칙).

**기존 동작 보존**: `NOT_YET_CHECKED` 항목은 여전히 출력하지 않고, `LIMITED`/`NOT_PERFORMED`는 기록된 사실로 출력한다(Batch 2.5b). `임상 가설`은 미판단 패턴을 생략한다(2.5c).

**범위 밖**: `buildHerbalWorkspaceEmrPreview`는 **손대지 않는다**(변증·병기·치법은 6키와 다른 체계). 한약 EMR 포맷은 별도 안건.

### 14.2 CD-2.7-1 — 처치 어휘 chip

`PainFinalAssessment.interventionPerformedOrPlanned`(자유입력 1칸) → **chip 8개 복수선택 + 기타 1칸**.
승인 목록: 침 / 약침 / 부항 / 추나 / 물리치료 / 한약 / 테이핑 / 운동처방만.
- **저장 형식 불변**: 기존 `string` 필드를 유지하고 선택을 사람이 읽는 문자열로 합성한다(예: `침, 약침, 추나`). 스키마·영속 필드 변경 없음.
- 기존에 자유입력으로 저장된 값이 있으면 **그대로 보존**하고 `기타` 칸에 표시한다(값 손실 금지).
- `FinalAssessmentCard.tsx`의 "승인된 처치 어휘가 없어 chip으로 못 만들었다" 주석의 차단 사유가 해소되므로 주석도 갱신한다.

### 14.3 CD-2.7-2 — EMR 복사를 `종결` 섹션 하나로

`참고 자료` 접힘 안의 `EmrPreviewCard`는 **보기 전용**으로 남기고 복사 버튼을 제거한다. 복사는 `종결` 섹션 한 곳에서만 한다. **두 곳이 서로 다른 내용을 내지 않도록**, 종결 섹션의 EMR 텍스트도 14.1의 6키 포맷을 쓴다(현재는 `emrSummary.ts`의 별도 경로).

### 14.4 CD-2.7-3 — `치료 직후 값` 기본 숨김

`FollowUpTargetPicker`에서 target당 `치료 직후 값` 입력을 기본 숨김으로 하고 `직후 값 기록` 토글로 노출한다. **이미 값이 있으면 자동으로 펼쳐 보인다**(기록이 숨겨지면 안 된다 — Batch 2.6 D-2와 같은 원칙, mount latch가 아니라 파생값으로 구현할 것). 기본 화면 자유입력 최대 −3칸.

### 14.5 CRM 최소 연동

`applyNextReassessmentPlanToEpisode`(`src/crm/episode.ts:66`)는 **구현·테스트가 이미 다 되어 있는데 호출처가 0개인 dead code**다(`isExamChecked`와 같은 상태). Batch 4는 이것을 **연결만** 한다:
- 원장이 `다음 상세 재평가`를 저장하면 해당 episode의 `reassess_due`가 갱신된다.
- `CLINICIAN_DECIDES`/`UNSET`은 `false`(자동 task 없음), 날짜·방문횟수는 `true`. **이 판정 로직은 손대지 않는다.**
- 새 CRM 개념·새 task 타입·자동 발송 **없음**. 서버 스키마 변경 없음이 가능한지 먼저 확인하고, 불가능하면 중단하고 보고한다.

### 14.6 테스트 (통과 전 종료 금지)

- **6키 골격**: 모든 값이 비어도 6줄이 정확한 순서로 나온다. 키 이름·순서가 하드코딩 리터럴로 고정된다(문구 변경 시 테스트 실패).
- **O 경계(임상 안전, 최우선)**: 태블릿 응답에서 파생된 어떤 문자열도 `O` 줄에 나타나지 않는다. 뮤테이션 필수: 환자 자가보고 값을 `O`에 넣으면 실패해야 한다.
- `NOT_YET_CHECKED` 미출력 / `LIMITED`·`NOT_PERFORMED` 출력 / 미판단 가설 생략이 6키 전환 후에도 유지된다(기존 단언 재사용).
- **처치 chip**: 8개 렌더, 복수선택, 저장 문자열 합성, **레거시 자유입력 값 보존**(뮤테이션: 보존 로직 제거 시 실패).
- **EMR 복사 단일화**: `참고 자료` 안에 복사 버튼이 0개, `종결` 섹션에 1개. 두 경로의 텍스트가 동일함을 단언.
- **치료 직후 값**: 기본 숨김, 값이 있으면 표시, 값을 지워도 편집 중 언마운트되지 않음(2.6 N-2 재발 방지).
- **CRM**: `다음 상세 재평가` 저장 → `reassess_due` 갱신. `CLINICIAN_DECIDES`/`UNSET`은 `false`.
- `npx tsc -b`, `npm run build`, `npm run test:all` PASS. FROZEN/태블릿 zero-diff.

### 14.7 금지
- 한약 EMR 포맷 변경, 새 CRM 개념·자동 발송, `applyNextReassessmentPlanToEpisode` 판정 로직 변경, 준비조건 화면(§13) 변경, 태블릿 변경, 새 자유입력 칸 추가.
- **Stop point**: 환자 자가보고가 `O`에 들어가야만 6키가 채워지는 상황이 생기면 즉시 중단하고 `CLINICAL DECISION REQUIRED`로 보고한다. `O`는 비워 두는 것이 정답이다.

---

## 15. Batch 4.1 브리프 — 사주 검증 입력 블록 제거 + 출생 시간대 간략 표시 (PO 지시 2026-09-04, Fable 설계)

### 15.0 이 배치가 존재하는 이유

Batch 4 closing review의 미해결 결함 **C-1**은 "D-1을 고치는 수정이 D-2를 한약
프로필에 재현했다"였다 — pain EMR에는 JudgmentPanel의 원장 타이핑 3필드를
복구했는데(defect #2), herbal EMR에는 복구하지 않아 한약 레코드에서는 여전히
"쓸 수 있는데 어디에도 안 나가는" 필드가 남았다.

PO 판단(2026-09-04): **이 4필드는 더 이상 필요 없다.** 원장은 사주를 해석하지
않는다(대표님이 별도로 본다). 원장 화면에 필요한 것은 **태어난 시간대(자축인묘…)
하나뿐**이며, 간략하게만 보이면 된다.

따라서 C-1은 "herbal에도 배선한다"가 아니라 **경로 자체를 제거해서** 닫는다.
그리고 그 제거는 CLAUDE.md의 "경로를 지우거나 교체하기 전에 필드 × 화면 표를
적는다" 규칙을 그대로 적용해서 진행한다 — 이 규칙이 만들어진 원인이 바로
D-1/D-2/C-1 이므로, 여기서 규칙을 안 지키면 다섯 번째 사고가 난다.

### 15.1 범위 — 독립적으로 승인·구현 가능한 두 파트

| 파트 | 내용 | 애매함 | 상태 |
|---|---|---|---|
| **4.1-A** | JudgmentPanel의 사주 검증 4필드 입력 블록 + 그 하류 EMR 배선 제거 | 없음 | 바로 진행 |
| **4.1-B** | 원장 화면 `명리` 아코디언 제거 + 출생 시간대 한 줄 간략 표시 | 15.6의 열린 판단 3건 | 15.6 확인 후 진행 |

4.1-A만 머지해도 C-1은 닫힌다. 4.1-B는 화면 정리이며 안전 속성과 무관하다.

### 15.2 (출력 방향) 제거 경로 R1 — JudgmentPanel 사주 검증 4필드

제거 대상: `src/doctor/JudgmentPanel.tsx:414-437`
(`<details>` "사주 예상 → 수정 판단 → 치료축·처방 방향 (펼쳐서 입력)" 전체)
및 그 read-back `:552-562` (설명 개요의 "치료 우선순위·한약 방향" 항목).

옛 경로가 나르던 필드가 **각 화면에서 지금 어디에 도달하는가 / 제거 후 어디로
가는가**:

| 필드 | 화면 | 지금 도달하는 곳 | 제거 후 대체 경로 |
|---|---|---|---|
| `saju_only_prediction` | 초진(pain) | 서버 저장 + 아코디언 배지 카운트만 (EMR 어디에도 안 감) | **의도적 폐기** — 사주 해석은 원장 업무가 아님(PO 2026-09-04) |
| | 재진(pain) | 동일 | 동일 |
| | 한약(herbal) | 동일 | 동일 |
| | mixed | 동일 | 동일 |
| | fixture 미리보기 | 화면에만 (저장 없음) | 동일 |
| `revised_after_exam` | 초진(pain) | `A \| 평가` → `원장 평가:` (emrPreview.ts:253-256) | **FinalAssessmentCard `finalWorkingAssessment`** → 같은 `A` 키의 `최종 임상 판단:` |
| | 재진(pain) | 동일 | 동일 |
| | 한약(herbal) | **아무 데도 안 감 (= C-1 그 자체)** | **HerbalFinalAssessment `finalPatternOrMechanism`** → `최종 변증·병기:` |
| | mixed | pain 절반에만 감 | pain 절반 + herbal 절반 각각의 위 필드 |
| | fixture 미리보기 | 미리보기 텍스트에 동일하게 반영 | 동일 |
| `final_treatment_axis` | 초진(pain) | `A` → `치료/처방 방향:` + 설명 개요 read-back | **FinalAssessmentCard `treatmentFocus`** → `A`의 `치료 초점:` |
| | 재진(pain) | 동일 | 동일 |
| | 한약(herbal) | 설명 개요 read-back만 (EMR 안 감) | **HerbalFinalAssessment `treatmentPrinciple`** → `치법:` |
| | mixed | pain EMR + read-back | 위 둘 다 |
| | fixture 미리보기 | 동일 | 동일 |
| `prescription_direction` | 초진(pain) | `P \| 계획` → `진료 계획:` + 설명 개요 read-back | **FinalAssessmentCard `interventionPerformedOrPlanned`** → `P`의 `시행/예정 처치:`, 및 CarePlanCard 5필드 → `P` |
| | 재진(pain) | 동일 | 동일 |
| | 한약(herbal) | 설명 개요 read-back만 | **HerbalFinalAssessment `prescriptionPlanNote`** → `처방/계획 메모:` |
| | mixed | pain EMR + read-back | 위 둘 다 |
| | fixture 미리보기 | 동일 | 동일 |

**핵심**: EMR에 도달하던 3필드는 전부 **같은 EMR 키에 도달하는 동일 레인의
대체 입력칸이 이미 존재한다.** 새로 만들 칸이 없다. `saju_only_prediction`만
대체 없이 폐기되며, 그 근거는 PO 판단이다.

### 15.3 (입력 방향) 제거 후 "쓰이는데 안 읽히는" 필드가 남지 않는가

제거 후 이 4필드에 값을 쓰는 UI는 **하나도 없다.** 타입(`ClinicianJudgment`)과
`emptyJudgment()` 기본값은 **그대로 둔다** — 이유:

- `server/**`는 FROZEN이고 `tests/server.spec.mjs`의 판단 fixture 8곳이 이
  키들을 그대로 담고 있다. 타입에서 빼면 서버 저장 payload 모양이 바뀐다.
- 이미 저장된 레코드에 값이 있으면 그대로 round-trip되어 **파괴되지 않는다**
  (읽히지만 화면에 안 보일 뿐 — `원본 JSON` 아코디언에는 계속 보인다).

대신 `judgment.ts`의 해당 4줄에 "4.1-A 이후 어떤 UI도 이 필드를 쓰지 않는다 —
deprecated, 새 코드에서 읽지 말 것" 주석을 단다.

이에 따라 함께 죽는 하류 배선 — **전부 같은 커밋에서 제거**:

1. `emrPreview.ts` `buildPainWorkspaceEmrPreview` 입력 3키
   (`clinicianJudgmentAssessment` / `clinicianJudgmentTreatment` /
   `clinicianJudgmentPlan`) 및 그 3개 push 지점(`원장 평가:` / `치료/처방 방향:` /
   `진료 계획:`) — defect #2 복구분의 되돌림.
2. `DoctorView.tsx:3185-3189`의 그 3키 전달.
3. `DoctorView.tsx` `judgmentRecordedFieldCount`의 4줄 카운트.
4. `JudgmentPanel.tsx` 설명 개요의 "치료 우선순위·한약 방향" `<li>`.

> **`src/doctor/emrSummary.ts`**: `Assessment/치료·처방/계획` 3줄이 이 4필드에서만
> 채워지는데, 이 모듈은 이미 **프로덕션 호출자가 0개**다(§14.3에서 종결이
> 호출을 끊었고, 남은 건 `tests/emrSummary.spec.mjs`의 자기 자신 단위 테스트뿐).
> 4.1-A 이후에는 *호출자도 없고 데이터 소스도 없는* 이중 사문(死文)이 된다.
> **권고: `src/doctor/emrSummary.ts` + `tests/emrSummary.spec.mjs` 삭제.**
> 분리 가능한 항목이므로 PO/Opus가 보류해도 4.1-A는 성립한다.

### 15.4 (출력 방향) 제거 경로 R2 — `명리` 아코디언 (파트 4.1-B)

제거 대상: `src/doctor/DoctorView.tsx:4686-4788`
(`{viewProfile !== 'pain' && (<ReferenceAccordion title="명리">` … `)}` 전체 —
`MyungriCompactCard` + `명리 검토` reviewGrid).

| 표시 값 | 초진/재진(pain) | 한약(herbal) | mixed | fixture 미리보기 | 제거 후 |
|---|---|---|---|---|---|
| 원국 연/월/일/시주 | **이미 안 보임** (PR #24 invariant) | 보임 | 보임 | 보임 | 화면에서 제거. `payload.myungri_calculation`은 계속 계산·저장되고 `원본 JSON` 아코디언에 그대로 남음 |
| 일간 | 안 보임 | 보임 | 보임 | 보임 | 동일 |
| `출생정보: 출생시간 확인됨 · 4주 8자` / `미상 · 3주 6자` | 안 보임 | 보임 | 보임 | 보임 | **출생 시간대 한 줄이 대체** (아래) |
| 오행 분포 / 한열조습 (`해석 규칙 미확정` 고정 문구) | 안 보임 | 보임 | 보임 | 보임 | 제거 (값이 아니라 고정 안내문) |
| 계산주의(정책 승인 대기) | 안 보임 | 보임 | 보임 | 보임 | 제거. `원본 JSON`에 남음 |
| `명리 검토` reviewGrid 좌열(환자 원본 입력) | 안 보임 | 보임 | 보임 | 보임 | **`참고 > 문진 원본 > 환자 기본`의 `BIRTH_*` 5필드가 이미 같은 값을 보여주고 있다** (중복이었음) |
| `명리 검토` reviewGrid 우열(계산 결과) | 안 보임 | 보임 | 보임 | 보임 | 제거. `원본 JSON`에 남음 |

**대체 표시 (PO가 요청한 "간략하게"):**
`참고 > 문진 원본 > 환자 기본`의 기존 `<Field qid="BIRTH_03" …/>`에
doctor-facing 라벨만 붙인다.

```
- <Field qid="BIRTH_03" value={r.birth_info.birth_time_branch} />
+ <Field qid="BIRTH_03" label="출생 시간대" value={r.birth_info.birth_time_branch} />
```

- 값은 이미 `새벽 3시 ~ 새벽 5시 (인시)` 형태 — **자축인묘가 그대로 들어 있다.**
  스펙(`coreSpec.ts` BIRTH_03, FROZEN)을 손대지 않고 요구를 만족한다.
- 라벨만 바꾸는 이유: 지금은 환자용 질문문("태어난 시간대를 선택해주세요.")이
  원장 화면에 그대로 라벨로 쓰인다.
- `viewProfile !== 'pain'` 게이트는 그대로 — 통증 프로필에는 계속 안 보인다.
- `unknown`이면 `잘 모르겠어요`가 muted로 표시된다(기존 `Field` 동작). 값이
  없으면 `Field`가 `null`을 반환해 줄 자체가 안 생긴다 — **"미상"을 "확인됨"으로
  둔갑시키는 경로가 새로 생기지 않는다.**

`src/saju/`, `computeSaju`, payload의 `myungri_calculation`은 **전부 그대로 둔다.**
계산은 계속 돌고 저장도 계속 된다 — 원장 화면 렌더링만 없어진다.

### 15.5 남는 죽은 export 처리 (4.1-B)

`MyungriCompactCard` / `sajuStatusLine` / `myungriGroupCount`는 4.1-B 이후
프로덕션 렌더 지점이 0이 된다. **권고: 삭제하지 말고 남긴다.**

- 이들은 "쓰기는 되는데 안 읽히는 필드"가 아니라 **읽기 전용 표시 함수**다 —
  CLAUDE.md 규칙이 막으려는 위험(원장이 못 보는 값이 출력에 도달)에 해당하지 않는다.
- 12차/13차 독립 리뷰에서 `pillars.day` wrong-type, `flags.hour_unknown` 결측
  등으로 **전체 임상 화면을 날리던 버그**를 잡아 하드닝한 코드이고,
  `tests/doctor.spec.mjs`에 그 회귀 테스트가 붙어 있다. 지금 지우면 나중에
  되살릴 때 그 하드닝을 처음부터 다시 해야 한다.
- 각 export 상단에 "4.1-B 이후 프로덕션 렌더 지점 없음 — 되살릴 때 `viewProfile
  !== 'pain'` 게이트를 반드시 함께 복원할 것" 주석을 단다.

`saju` 지역 변수(`DoctorView.tsx:3067`)는 계속 살아 있다 — `JudgmentPanel`의
`source` prop(`myungri_algorithm_version` 등)이 여전히 읽는다.

### 15.6 열린 판단 3건 (구현 전 확인)

**(1) 생년월일·양음력·윤달은 남기는가?**
PO 지시는 "몇시에 태어난지만 알수 있게" 였다. 문자 그대로면 `BIRTH_01`(생년월일),
`BIRTH_02`(양/음력), `BIRTH_02A`(윤달), `BIRTH_03A`(시간 확신도)도 원장 화면에서
빼야 한다. **본 브리프의 기본안은 "남긴다"** — 이유: 생년월일은 사주 해석이 아니라
환자 기본 인적사항이고, 대표님이 사주를 볼 때 시(時) 단독으로는 원국을 세울 수
없다. 빼라는 지시로 확정되면 `BIRTH_03` 한 줄만 남기는 것으로 바꾼다.

**(2) `명리·감사 기록` 아코디언에 남는 `선천 특징` / `현재 증상 연결`은?**
이 둘도 사주 해석 성격의 자유서술이며 EMR 어디로도 가지 않는다(설명 개요
read-back만). 4.1-A는 여기까지 건드리지 않는다 — PO가 지목한 것은 4필드 블록뿐이다.
같은 근거로 함께 빼야 한다면 별도 지시를 받아 4.1-C로 처리한다.

**(3) 아코디언 제목 `명리·감사 기록`**
4.1-A 이후 그 안에 "명리"라 부를 것이 `선천 특징`/`증상 연결`뿐이고, 4.1-B에서
`명리` 아코디언 자체가 사라지면 제목이 오해를 부른다. (2)의 결론이 나온 뒤
한 번에 재명명하는 것이 낫다 — **4.1에서는 제목을 건드리지 않는다.**

**부수 관찰(범위 밖, 기록만)**: `명리·감사 기록` 아코디언은
`viewProfile` 게이트가 **없다** — `명리` 아코디언(`viewProfile !== 'pain'`)과 달리
통증 레코드에서도 열린다. 즉 PR #24의 "pain 프로필은 명리 내용을 노출하지 않는다"
invariant가 이 경로로는 이미 새고 있었다. 4.1-A가 그 중 4필드분을 우연히 막지만,
(2)가 남으면 누수는 남는다.

### 15.7 테스트 (CLAUDE.md: 지운 경로 1개당 소스 텍스트 단언 1개)

제거 단언 — 전부 번들 소스 텍스트 기준:

| # | 경로 | 단언 |
|---|---|---|
| T1 | R1 입력 블록 | `.judgment-panel-bundle.cjs`에 `saju_only_prediction`을 값으로 바인딩한 textarea가 없다 + 요약문 `사주 예상 → 수정 판단` 문자열이 없다 |
| T2 | R1 read-back | 같은 번들에 `치료 우선순위·한약 방향` 문자열이 없다 |
| T3 | R1 pain EMR 배선 | `.doctor-view-bundle.cjs`에 `clinicianJudgmentAssessment` / `clinicianJudgmentTreatment` / `clinicianJudgmentPlan` 문자열이 없다 |
| T4 | R1 EMR 출력 | `buildPainWorkspaceEmrPreview`를 모든 필드를 채운 입력으로 호출해도 출력에 `원장 평가:` / `치료/처방 방향:` / `진료 계획:` 이 나오지 않는다 |
| T5 | R1 배지 | `judgmentRecordedFieldCount`가 4필드만 채워진 judgment에 대해 `0`을 반환한다 |
| T6 | R2 (4.1-B) | `.doctor-view-bundle.cjs`에 `명리 검토` / `오행 분포` / `4주 8자` 문자열이 없다 |

유지 단언(회귀 방지) — 이게 빠지면 T1~T6은 "그냥 다 지웠다"와 구분되지 않는다:

| # | 단언 |
|---|---|
| T7 | herbal fixture 렌더에 `출생 시간대` 라벨과 해당 지지(예: `인시`)가 함께 보인다 |
| T8 | mixed fixture에서도 T7이 성립한다 |
| T9 | **pain fixture에는 `출생 시간대`도 `BIRTH_` 어떤 값도 보이지 않는다** (PR #24 invariant 유지 — 4.1-B가 이걸 깨지 않았음을 증명) |
| T10 | 출생시간 `unknown` fixture에서 `잘 모르겠어요`가 보이고 `출생시간 확인됨` 류 문구는 어디에도 없다 |
| T11 | `O \| 객관적 소견` 경계 불변: R1 제거 후에도 `O`에 도달하는 push 지점은 4개(검사 결과 / 허리 움직임 반응 / 오늘 재검 소견 / 객관적 근력저하)뿐이다 |
| T12 | pain EMR 6키가 여전히 6개 전부, 같은 순서로 나온다 |

**mutation 검증 필수** — T1~T6은 "없음"을 주장하는 단언이라 **구조적으로
공허해지기 쉽다**(오타 난 문자열은 언제나 "없다"). Sonnet은 각 단언에 대해
*제거를 되돌린 상태에서 그 단언이 실제로 실패하는 것*을 보이고 원복해야 하며,
그 결과를 브리프에 남긴다. Batch 4의 C-3(공허한 `firstIfIdx < firstSetEmrTextIdx`
가드)가 바로 이 함정에 빠졌던 사례다.

### 15.8 FROZEN 영향

`src/spec/**` · `index.html` · `src/App.tsx` · `server/**` · `tablet core/**`
**전부 zero-diff.** BIRTH_03 스펙을 바꾸지 않고 라벨만 원장 화면에서 덧씌우며,
`ClinicianJudgment` 타입/기본값을 유지하므로 서버 payload 모양도 그대로다.
