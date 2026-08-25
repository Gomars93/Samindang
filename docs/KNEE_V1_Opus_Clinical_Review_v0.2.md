# KNEE_V1 Tablet Question Set v0.1 — Opus 재검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**대상 문서**: `KNEE_V1_Tablet_Question_Set_v0.1.md` (상위: `KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md`, `KNEE_V1_Opus_Clinical_Review_v0.1.md`)
**판정**: **CLINICAL DECISION REQUIRED**

이번 검수는 §19가 요청한 8개 질문(K2/K3-K4/K5/C2/K9/C1/fail-closed/문항부담)만을 대상으로 한다. 코드 구현·Fable 통합·Sonnet 구현은 이번 작업 범위 밖이며 수행하지 않았다. v0.1에서 이미 CLOSED로 채택된 K1/K3/K4/K6-K8의 tier 자체는 재해석하지 않았다.

---

# Part 1 — §19 질문별 판정

## §19-1, 7 (K2). KNEE_02A 무조건 노출 + fail-closed — PASS

`KNEE_02A`는 `show_when: IS_PRIMARY_KNEE`로 KNEE_01(외상 여부)과 무관하게 모든 knee-primary 환자에게 무조건 노출되고 `required: true`다. v0.1이 지적한 "이미 저절로 정복되어 외형이 정상인 환자가 어떤 문항에도 걸리지 않는" fail-open 경로가 정확히 막혔다 — trauma 인식 여부에 게이팅되지 않는 것이 핵심이다. YES → URGENT_REVIEW, UNKNOWN → REVIEW_REQUIRED로 §11 엔진에도 정확히 반영되어 있다. **수정 불필요.**

## §19-2 (K3/K4). Extensor mechanism / true locked knee tier — PASS

KNEE_04(extensor)·KNEE_05(locked knee) 모두 YES/UNKNOWN → `REVIEW_REQUIRED + expedited_referral_consider`이고 URGENT로 자동 승격하지 않는다. §11(REVIEW_REQUIRED 목록)과 §12(flag 조건) 양쪽에 일관되게 반영되어 있다. v0.1 결정과 정확히 일치. **수정 불필요.**

참고(비차단): KNEE_05는 무조건 노출(`required: true`, gate 없음)인 반면 KNEE_04는 `KNEE_01 in [YES,UNKNOWN]`에 게이팅되어 있다. 이 비대칭은 임상적으로 타당하다 — locked knee는 환자가 유발 사건을 기억하지 못해도 발생할 수 있지만, extensor rupture는 거의 항상 식별 가능한 급격한 부하 순간을 동반하며 KNEE_01 문항 자체가 "갑자기 강하게 힘을 준 뒤"까지 포괄적으로 묻는다. SHOULDER SH03/SH04가 SH01에 게이팅된 것과 동일한 이미 CLOSED된 패턴이므로 재론하지 않는다.

## §19-3 (K5). DVT tiering — **결정 필요 (§11/§12 내부 불일치)**

Wells를 clinician-side로 유지하는 원칙과 KNEE_06B(PE-type) → URGENT_REVIEW는 정확히 K5 결정대로 구현되어 있다. **문제는 KNEE_06(증상 단독) 계산이 §11과 §12에서 서로 다르다는 점이다.**

- §12(`dvt_assessment_required` flag)는 이미 올바르게 좁혀져 있다: KNEE_06 YES는 KNEE_06A가 concrete risk이거나 UNKNOWN/invalid일 때만 flag를 켠다. KNEE_06 YES + KNEE_06A `NONE`(위험인자 명시적으로 없음)은 flag 조건에 없다.
- 그런데 §11(`knee_safety_status`)의 REVIEW_REQUIRED 목록은 "KNEE_06 YES/UNKNOWN/invalid"를 KNEE_06A 값과 무관하게 단독으로 트리거로 두고 있다. 즉 위험인자를 전부 `NONE`으로 명시적으로 부인한 환자도 `knee_safety_status != CLEAR`가 되어 §13의 routine exercise lock이 걸린다.

이건 fail-open이 아니라 반대 방향(과잉 트리거)이지만, safety에 실질적 영향이 있다: 이 모듈에서 "한쪽 다리가 새로 붓거나 아프다"는 소견은 knee effusion·OA·인대손상 등 흔한 knee phenotype 대부분에서 나올 수 있는 일반적 소견이다. 위험인자가 전혀 없는데도 DVT 계열 REVIEW_REQUIRED가 사실상 상시 발동하면, REVIEW_REQUIRED 신호가 이 모듈에서 식별력을 잃고("항상 켜져 있는 경고") 정작 위험인자가 있는 진짜 DVT 의심 케이스가 원장 눈에 묻힐 위험이 생긴다. NICE NG158 자체도 증상 단독이 아니라 증상+위험인자(Wells)로 판단한다 — 원 문서 §3-E/E10의 근거 적용범위와도 어긋난다.

**결정(§11 수정, §12에 이미 있는 로직으로 통일):**
- KNEE_06 UNKNOWN/invalid → REVIEW_REQUIRED (KNEE_06A 무관, 유지)
- KNEE_06 YES + KNEE_06A concrete risk → REVIEW_REQUIRED + dvt_assessment_required (유지)
- KNEE_06 YES + KNEE_06A UNKNOWN/invalid/missing → REVIEW_REQUIRED + dvt_assessment_required (유지)
- **KNEE_06 YES + KNEE_06A `NONE`(명시적 위험인자 전무) → 이 경로만으로는 REVIEW_REQUIRED를 만들지 않는다.** 다른 safety gate(KNEE_02/05/07/08 등)가 독립적으로 여전히 적용되므로 실제 위험 신호는 다른 도메인에서 그대로 잡힌다.

§12는 수정할 필요 없다 — §11을 §12와 동일한 combined-condition 로직으로 맞추기만 하면 된다.

## §19-4 (C2). KNEE_06B double-barreled 여부 — PASS

KNEE_06B는 "움직임과 무관하게", "휴식 중일 때만" 같은 부가 AND 조건이 전혀 없다 — 흉통/호흡곤란/객혈 중 하나라도 concrete positive면 그 자체로 URGENT_REVIEW다. SHOULDER SH05의 F2 실수를 정확히 피했다.

`show_when`의 "Core general_red not already urgent" 조건도 검증했다: `computeFlags(r).general_red`가 true면 이미 `STAFF_CHECK_TRIGGERS.SAFETY_01`이 그 시점에 즉시 인터럽트를 발생시키고(NECK_03B와 동일 패턴, `coreSpec.ts:1432`), 게다가 §11 KNEE URGENT_REVIEW 목록 1번 항목("Core global safety already urgent")이 `knee_safety_status` 자체도 독립적으로 URGENT로 만든다. 따라서 이 조건부 생략은 fail-open이 아니라 이미 CLOSED된 NECK_V1 아키텍처의 정확한 재사용이다. **수정 불필요.**

## §19-5 (K9). KNEE_08 최소 red-flag — **결정 필요 (콘텐츠 누락)**

LBP 엔진을 억지로 재사용하지 않고 KNEE 전용 최소 screen을 신설한 아키텍처 결정 자체는 맞다(v0.1의 K9 논리 그대로 옳음). 하지만 **KNEE_08의 실제 3개 옵션(NEW_SENSORY_CHANGE / NEW_WEAKNESS / NEW_BLADDER_BOWEL_CONTROL_CHANGE)은 v0.1 K9가 이 신규 screen을 요구한 이유로 든 두 시나리오 중 하나만 포착한다.**

v0.1 원문(K9): *"고관절 골절이 무릎통증으로 오인되는 노인 환자", "요추 마미증후군이 무릎 쪽 다리통증으로 발현하는 환자"*. 뒤쪽(마미증후군형 방사통)은 감각/힘빠짐/방광-장 조절변화 옵션으로 정확히 커버된다. **앞쪽(폐색성 고관절 골절이 무릎 통증으로 연관통을 일으키는 노인 환자)은 커버되지 않는다** — 이 시나리오는 특징적으로 신경학적 결손 없이 고관절/서혜부 통증 + 체중부하 곤란만 있고, 외상이 경미하거나 (병적 골절의 경우) 없을 수도 있어 KNEE_03(외상 후 체중부하 곤란, KNEE_01 게이팅)에도 걸리지 않을 수 있다. 즉 원 문서 §3-F 자체가 서술한 위험("non-knee pathology를 knee label로 가리지 않는다")의 절반이 아직 문항으로 옮겨지지 않았다 — 지난 라운드 K2와 같은 패턴이다.

**결정(최소 콘텐츠 추가, 새 safety tier·새 flag 불필요):** KNEE_08 multi-select에 옵션 1개를 추가한다 — 예: `NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE`("이 무릎 증상과 별개로 엉덩이·사타구니 통증이나, 그로 인해 체중을 싣기 어려운 증상이 새로 있나요?"). Semantics는 기존 KNEE_08 나머지 옵션과 동일하게 concrete positive → REVIEW_REQUIRED로 두되, 이 옵션이 select되면 이미 §12에 정의되어 있는 `fracture_imaging_consider` flag를 함께 켠다(occult fracture 우려이므로 K2/C1과 동일 flag 재사용 — 새 flag 신설 아님). 새로운 safety status tier나 새로운 hypothesis enum은 필요 없다 — 기존 `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY`(C1) 범주에 속한다.

## §19-6 (C1). MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY — PASS

§9 hypothesis contract에 enum이 명시적으로 추가됐고 §10에 매트릭스 행도 추가됐다. v0.1이 지적한 domain B 이름 누락 문제가 정확히 해소됐다. **수정 불필요.** (§19-5의 신규 옵션도 이 enum에 자연스럽게 귀속되므로 추가 enum이 필요 없다.)

## §19-7 (fail-closed 전반). UNKNOWN/missing/malformed → CLEAR 경로 — §11 K5 항목 외 1건 추가 발견

§11의 fail-closed 원칙 목록(missing != NO, UNKNOWN != NO, malformed != NONE, empty multi-select != NONE, NONE+positive = invalid, UNKNOWN+positive = invalid) 자체는 완전하고 이 repo의 기존 LBP/NECK/SHOULDER 계약과 정확히 같다.

**그러나 스펙 레벨에서 실제로 "missing"이 발생 가능한 경로가 하나 있다.** KNEE_05는 `required: true`가 명시되어 있어 이 repo의 기존 UI 계약(`App.tsx`의 `disabled={!answered}`, `answered = !current.required || isAnswered(...)`)상 노출되면 답변 없이는 진행이 막힌다. 반면 **KNEE_03과 KNEE_04는 문서에 `required: true`가 명시되어 있지 않다.** `required`가 없으면 이 repo의 UI 계약상 해당 문항은 하드블록되지 않으므로, 노출된 상태에서 patient가 진행 버튼으로 그냥 넘어가 응답이 순수 `undefined`(UNKNOWN이 아니라 진짜 missing)로 남는 경로가 구현 단계에서 열릴 수 있다. §11은 "YES/UNKNOWN/invalid when shown"만 명시하고 "missing when shown"이 이 "invalid"에 포함되는지 명시적으로 정의하지 않아 Sonnet 구현자가 이 두 필드를 skippable로 구현할 위험이 있다 — 이건 v0.1 SHOULDER integration에서 이미 한 번 실제로 겪은 것과 같은 종류의 "protected-safety invariant 문서화 누락 → 구현 fail-open" 패턴이다.

**결정(최소 문서 수정):** KNEE_03, KNEE_04 정의에 `required: true`를 명시적으로 추가한다(KNEE_05와 동일 패턴). 다른 필드는 전부 문제없다.

## §19-8. 문항 부담 — PASS (변경 불필요, 원칙만 재확인)

Base 13 + 최대 branch 18은 SHOULDER_V1(~15)과 같은 규모대이고, §18이 이미 "safety는 fatigue 때문에 suppress하지 않는다"를 명시하고 있다 — 이 세션 전체에서 이미 CLOSED된 원칙(LBP/NECK/SHOULDER 전부 동일 트레이드오프 채택)과 일치한다. §19-3/§19-5의 신규 옵션 1개(KNEE_08 항목 추가)는 기존 문항 수를 그대로 두고 선택지만 늘리는 것이라 branch 수 자체에 영향이 없다. **수정 불필요.**

---

# Part 2 — 체크리스트

| ID | 항목 | 판정 | 필요한 변경 |
|---|---|---|---|
| K2 | KNEE_02A 무조건 노출 + fail-closed | **PASS** | 없음 |
| K3/K4 | Extensor/locked knee tier | **PASS** | 없음 |
| K5 | DVT tiering, Wells 소재 | **결정 필요** | §11 REVIEW_REQUIRED 조건을 §12 flag 로직과 동일한 combined-condition으로 수정 (KNEE_06 YES + KNEE_06A=NONE 단독은 REVIEW_REQUIRED 아님) |
| C2 | KNEE_06B double-barreled 방지 | **PASS** | 없음 |
| K9 | KNEE_08 최소 red-flag | **결정 필요** | 고관절 골절 연관통 discriminator 옵션 1개 추가, 기존 `fracture_imaging_consider` flag 재사용 |
| C1 | Domain B enum/매트릭스 행 | **PASS** | 없음 |
| fail-closed | UNKNOWN/missing/malformed | **결정 필요** | KNEE_03, KNEE_04에 `required: true` 명시 |
| 문항 부담 | 안전-피로 트레이드오프 | **PASS** | 없음 |

**신규/수정 사항 총 3건** — 전부 이미 문서가 서술한 원칙(§1 protected-safety invariant, §3-F non-knee referred pathology, §12의 이미 올바른 flag 로직)을 실제로 완성하는 콘텐츠·정합성 보완이며, 새로운 임상 판단이나 CLOSED된 tier의 재해석이 아니다.

---

# 결론

Tablet Question Set v0.1은 K1/K3/K4/K6-K8/C1/C2를 정확히 반영했고, 이번 라운드에서 새로 발견된 문제는 전부 **문서 내부 불일치(K5) 또는 문서가 이미 서술한 위험의 미완성 조작화(K9) 또는 스펙 정밀도(fail-closed)**이지, 새로운 임상 영역이나 기존 tier의 재해석이 아니다. 세 건 모두 최소 수정(§11 조건문 1곳 정정, 옵션 1개 추가, `required: true` 2곳 추가)으로 닫을 수 있다.

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

K5(§11/§12 정합화)·K9(고관절 골절 연관통 옵션)·fail-closed(KNEE_03/04 `required: true`) 세 건이 Tablet Question Set에 반영되면, 그 개정판에 대해 재검수 후 `PASS / CLINICAL DECISIONS CLOSED`로 진행 가능하다.

**PASS 이전에는 KNEE production code를 구현하지 않는다.**

---

## 다음 단계

세 결정 반영 → Tablet Question Set v0.1.1 개정 → Opus 재검수(3건 확인만, 범위 확대 없음) → CLINICAL DECISIONS CLOSED → Fable 통합 계획 → Sonnet 구현 → 전체 회귀 → `KNEE_V1: PASS / FROZEN`
