# ELBOW_V1 — Fable Repo Integration Plan v0.1

작성일: 2026-08-25
상태: **IMPLEMENTATION PLAN COMPLETE / CLINICAL DECISIONS CLOSED / CODE NOT YET IMPLEMENTED**
브랜치: `clinical/elbow-v1-review`

## 0. Source of Truth

임상결정은 아래 문서에서 이미 CLOSED 상태다.

- `docs/ELBOW_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/ELBOW_V1_Opus_Clinical_Review_v0.1.md`
- `docs/ELBOW_V1_Opus_Clinical_Review_v0.2.md`
- `docs/ELBOW_V1_Tablet_Question_Set_v0.1.1.md`
- `docs/ELBOW_V1_Opus_Final_Verification_v1.0_CLOSED.md`

최종 임상 판정:

```text
PASS / CLINICAL DECISIONS CLOSED
```

이 문서는 임상결정을 새로 만들지 않는다. 실제 repo의 기존 LBP/NECK/SHOULDER/KNEE 구현 패턴을 감사한 뒤, CLOSED semantics를 어디에 어떻게 연결할지만 지정한다. **TypeScript/UI/테스트 구현은 이 문서의 범위가 아니다** — 다음 단계(Sonnet)에서 이 계획을 literal하게 실행한다.

---

# 1. Actual Repo Audit

## 1.1 routing — 현재 `PAIN_01 === 'arm_hand'` 처리 경로

`coreSpec.ts`를 직접 확인했다.

- `PAIN_01`(L710-728)의 옵션에 `arm_hand`가 있다(`{ value: 'arm_hand', label: '팔·손' }`, L722). ELBOW 전용 값은 없다 — CLOSED 문서 E9의 전제 그대로다.
- `arm_hand`는 **두 곳**에서 나온다: (1) 주호소가 pain일 때의 `PAIN_01`(L722), (2) 동반문제(secondary concern)로 pain을 고른 환자용 짧은 화면 `SEC_PAIN_01`(L2290-2310, L2302). **ELBOW_V1은 (1)만 대상이다** — 기존 LBP/NECK/SHOULDER/KNEE 전부 `SEC_PAIN_01`을 트리거하지 않는 것과 동일한 scope 경계이며(그 화면은 동반문제용 짧은 screen이지 전체 모듈이 아니다), ELBOW도 이 경계를 그대로 따른다.
- `IS_PRIMARY_PAIN`(L698): `primaryConcernKey(r) === 'pain'`.
- `IS_PRIMARY_LBP`(L708)/`IS_PRIMARY_NECK`(L1053)/`IS_PRIMARY_KNEE`(L1061) 전부 `IS_PRIMARY_PAIN(r) && r['PAIN_01'] === '<value>'` 패턴 — **단일 값 직접 비교**다. ELBOW는 `arm_hand` 하나가 elbow/forearm/wrist-hand를 전부 포함하므로 이 패턴을 그대로 쓸 수 없다 — 상위 gate(`IS_PRIMARY_ARM_HAND`) + region discriminator 2단 구조가 필요하다(§2).
- `arm_hand_region_discriminator`(ELBOW_00) 같은 필드는 현재 repo 어디에도 없다 — 신규로 만든다.

## 1.2 질문/모듈 조합 — `CORE_QUESTIONS`(L2891-2903+)

```text
...PAIN_QUESTIONS,
...LBP_QUESTIONS,
...SHOULDER_QUESTIONS,
...NECK_QUESTIONS,
...KNEE_QUESTIONS,
...FATIGUE_QUESTIONS,
```

각 모듈 배열은 `IS_PRIMARY_XXX` 단일 predicate로 게이트되는 `Question[]` 상수다. ELBOW도 이 패턴을 따르되, §2에서 결정하는 대로 **routing 질문(ELBOW_00)과 임상 질문(ELBOW_01-15)을 별도 배열로 분리**한다 — routing 질문은 ELBOW 임상 로직에 속하지 않기 때문이다(E9 원칙 "공통 경험은 통합하고, 임상 도메인은 분리한다"의 코드 레벨 구현).

## 1.3 `STAFF_CHECK_TRIGGERS`(L2967-3032)

Record 형태, 각 key는 화면 id, value는 `(r: Responses) => boolean`. 기존 패턴(LBP_04/NECK_02.../SH02.../KNEE_02...)은 전부 "개별 조건을 손으로 재구현하지 않고, 해당 모듈의 `compute*Flags(to*State(...))` 전체를 재호출해 `*_safety_status === 'URGENT_REVIEW'`인지만 확인"하는 구조다. ELBOW도 동일하게 `computeElbowFlags(toElbowState(...)).elbow_safety_status === 'URGENT_REVIEW'`를 재사용한다.

## 1.4 계산/번역 계층 — `src/spec/*Logic.ts` / `*Adapter.ts`

현재: `lbpLogic.ts`/`lbpAdapter.ts`, `neckLogic.ts`/`neckAdapter.ts`, `shoulderLogic.ts`/`shoulderAdapter.ts`(NECK을 직접 호출하는 유일한 예외), `kneeLogic.ts`/`kneeAdapter.ts`(독립형, 재사용 없음). ELBOW는 CLOSED 문서(§6 "NECK_QUESTIONS(canonical)를 재사용하지 않는다")에 따라 **KNEE와 같은 독립형**이다 — `elbowAdapter.ts`는 다른 모듈의 logic/adapter를 import하지 않는다.

## 1.5 Submission payload — `buildResponsePayload`(safety_flags/modules)와 `buildRoutingPayload`(primary_module_detail)

- `safety_flags.knee`(L3313): `IS_PRIMARY_KNEE(r) ? computeKneeFlags(toKneeState(r, computeFlags(r).general_red)) : null` — 비대상 환자에게 엔진을 돌리면 fail-closed로 전원 REVIEW_REQUIRED가 되는 무의미한 노이즈이므로 대상자에게만 계산한다는 원칙. ELBOW도 동일: `IS_PRIMARY_ELBOW_SAFETY(r) ? computeElbowFlags(...) : null`.
- `modules.knee`(raw field block) 패턴을 그대로 따른다.
- `buildRoutingPayload().primary_module_detail`(L3139-3147): `IS_PRIMARY_LBP ? 'LBP' : IS_PRIMARY_NECK ? (...) : IS_PRIMARY_KNEE ? 'KNEE' : null` 체인. ELBOW를 이 체인 끝에 추가한다 — `IS_PRIMARY_ARM_HAND(r) ? 'ELBOW' : null`(WRIST_HAND/FOREARM-only가 별도 모듈 없이 `arm_hand` 팔호소로만 남는 경우는 아래 §2에서 결정).

## 1.6 Doctor View — `src/doctor/DoctorView.tsx`

- `computeKneeFlags`/`kneeSafetyLocked`/`KNEE08_HIP_FRACTURE_OPTION`/`toKneeStateFromDoctorPayload` import(L38-39), `KneeSafetyPanel`(L963, 게이트: `payload.responses.safety_flags.knee === null` → `return null`), 렌더 호출 `<KneeSafetyPanel payload={payload} />`(L1781, `<ShoulderSafetyPanel .../>` 바로 다음). ELBOW도 동일 위치·동일 패턴.
- `primaryModuleFields`의 `case 'Pain':`에서 `m.pain.primary_location === 'knee'`로 KNEE 원시 필드 블록을 게이트한다(NECK/SHOULDER의 `=== 'neck_shoulder'`와 동일 관용구). ELBOW는 `m.pain.primary_location === 'arm_hand'`로 게이트 — WRIST_HAND-only 환자도 이 조건은 true이지만 ELBOW_* 필드 자체가 애초에 비어있으므로(그 환자는 ELBOW_01-15를 본 적이 없다) 안전하다.

## 1.7 fixtures / test wiring

- `src/doctor/fixtures.ts`: `buildFixture(name, patch)` 헬퍼로 실제 builder를 그대로 실행. 최근 KNEE fixture 1개가 이 패턴으로 추가됐다(기존 fixture 수정 없이 신규 추가만).
- `package.json`: `test:lbp`/`test:neck`/`test:shoulder`/`test:knee` 전부 "logic 번들 + adapter 번들 + node tests/X.spec.mjs" 동일 셸 패턴이고 `test:all`에 순서대로 연결된다.
- `tests/integration.spec.mjs`의 `STAFF_CHECK_TRIGGERS` 키 목록 검증(I1)과, KNEE의 N 섹션(question visibility/staff interrupt/payload-routing) 패턴이 ELBOW의 test plan 템플릿이 된다(§10).

---

# 2. Upper-limb Routing Decision (E9 구현)

## 2.1 discriminator 배치 — 별도 공통 블록으로 분리

**결정: `arm_hand_region_discriminator`(질문 id `ELBOW_00`, CLOSED 문서와 동일 id 유지)를 `ELBOW_QUESTIONS`가 아니라 별도의 `ARM_HAND_ROUTING_QUESTIONS`(단일 질문짜리 상수 배열)에 둔다.**

이유:
1. **순환 의존 방지** — `ELBOW_QUESTIONS`의 노출 조건(`IS_PRIMARY_ELBOW_SAFETY`)이 `ELBOW_00`의 값을 읽어야 하는데, `ELBOW_00` 자신이 `ELBOW_QUESTIONS` 안에서 그 조건으로 게이트되면 자기 자신을 노출 조건으로 쓰는 순환이 생긴다. `ARM_HAND_ROUTING_QUESTIONS`는 오직 `IS_PRIMARY_ARM_HAND`(= `IS_PRIMARY_PAIN && PAIN_01 === 'arm_hand'`)로만 게이트한다.
2. **E9 원칙의 코드화** — discriminator는 "공통 경험"(향후 WRIST/HAND_V1도 같은 필드를 재사용할 수 있는 라우팅 인프라)이고 ELBOW_01-15는 "임상 도메인"이다. 같은 배열에 두면 이 구분이 코드에서 사라진다.
3. **F1류 invariant 보존** — `ELBOW_00`은 `ElbowState`(Layer 1 타입)에 필드로 들어가지 않는다(§4). Layer 1이 이 값을 아예 모르게 하려면, Layer 2(adapter)도 이 필드를 읽지 않아야 하고, 그러려면 이 필드는 애초에 "ELBOW 모듈의 일부"가 아니라 "라우팅 인프라"로 물리적으로도 분리되어 있는 편이 실수를 구조적으로 막는다.

```ts
export const IS_PRIMARY_ARM_HAND = (r: Responses) =>
  IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'arm_hand'

const ARM_HAND_ROUTING_QUESTIONS: Question[] = [
  {
    id: 'ELBOW_00',
    variable: 'arm_hand_region_discriminator',
    input: 'single_choice',
    required: true,
    step: '상세 증상',
    showIf: IS_PRIMARY_ARM_HAND,
    question: '지금 가장 불편한 부위는 어디에 가장 가깝나요?',
    options: [
      { value: 'ELBOW', label: '팔꿈치' },
      { value: 'FOREARM', label: '팔꿈치와 손목 사이(전완)' },
      { value: 'WRIST_HAND', label: '손목이나 손' },
      { value: 'DIFFUSE_OR_MULTIPLE', label: '여러 부위 또는 전체적으로' },
      { value: 'UNKNOWN', label: '잘 모르겠어요' },
    ],
  },
]

export const IS_PRIMARY_ELBOW_SAFETY = (r: Responses) =>
  IS_PRIMARY_ARM_HAND(r) &&
  ['ELBOW', 'FOREARM', 'DIFFUSE_OR_MULTIPLE', 'UNKNOWN'].includes(r['ELBOW_00'] as string)
```

`WRIST_HAND`만 제외 — CLOSED 문서 E9 그대로. `ELBOW_00`이 `undefined`(아직 미답변)인 경우도 `.includes()`가 `false`를 반환해 노출되지 않는데, 이는 안전하다 — `ELBOW_00`은 `required: true`이므로 이 repo의 기존 UI 계약(`disabled={!answered}`)상 `PAIN_01 === 'arm_hand'`인 환자는 `ELBOW_00`에 답하지 않고는 다음 화면으로 진행할 수 없다. 즉 "노출 게이트가 아직 계산 불가능한" 상태는 실제 환자 플로우에서 도달 불가능하다(LBP_V1 감사 때 확인한 것과 동일한 종류의 "이론상 gap이지만 UI 하드블록으로 실제 도달 불가능" 케이스).

## 2.2 `primary_module_detail` — WRIST_HAND-only 환자 처리

`IS_PRIMARY_ARM_HAND(r)`이 true이지만 `ELBOW_00 === 'WRIST_HAND'`인 환자는 ELBOW protected safety가 노출되지 않는다. 이 환자의 `primary_module_detail`은 `'ELBOW'`로 표시하지 않는다 — 아직 이 repo에 WRIST/HAND 모듈이 없으므로, 기존 미구현 모듈과 동일하게 `null`로 둔다(향후 WRIST/HAND_V1이 붙으면 그 시점에 확장). 즉:

```ts
: IS_PRIMARY_ARM_HAND(r)
  ? (IS_PRIMARY_ELBOW_SAFETY(r) ? 'ELBOW' : null)
  : null
```

이 결정은 임상적 재해석이 아니다 — CLOSED 문서가 요구한 것은 "ELBOW protected safety의 노출 범위"이지 "WRIST_HAND 환자를 위한 미구현 모듈을 만들라"는 요구가 아니다.

---

# 3. New Files

## 3.1 `src/spec/elbowLogic.ts`

### Types

```ts
export type ElbowSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

export interface ElbowState {
  elbow_recent_trauma_or_sudden_load?: YesNoUnknown           // ELBOW_01
  elbow_deformity_neurovascular_screen?: string[]              // ELBOW_02
  elbow_spontaneously_reduced_dislocation_screen?: YesNoUnknown // ELBOW_02A
  elbow_post_trauma_functional_loss?: YesNoUnknown             // ELBOW_03 (show_when ELBOW_01 in [YES,UNKNOWN])
  elbow_distal_biceps_concern?: YesNoUnknown                   // ELBOW_04 (show_when ELBOW_01 in [YES,UNKNOWN])
  elbow_distal_triceps_concern?: YesNoUnknown                  // ELBOW_05 (show_when ELBOW_01 in [YES,UNKNOWN])
  elbow_true_locked_rom_block?: YesNoUnknown                   // ELBOW_06
  elbow_septic_joint_emergency_screen?: YesNoUnknown           // ELBOW_07
  elbow_posterior_bursal_screen?: 'NONE' | 'LOCALIZED_STABLE' | 'SYSTEMIC_OR_RAPIDLY_SPREADING' | 'UNKNOWN' // ELBOW_08 (single_choice)
  elbow_ulnar_sensory_screen?: YesNoUnknown                    // ELBOW_09
  elbow_ulnar_motor_progression_screen?: string[]              // ELBOW_09A (show_when ELBOW_09 in [YES,UNKNOWN])
  elbow_referred_proximal_screen?: string[]                    // ELBOW_10
  elbow_cardiac_associated_screen?: string[]                   // ELBOW_11 (show_when !general_red)
  /** Core computeFlags(r).general_red -- URGENT_REVIEW rule 1. */
  core_safety_already_urgent: boolean
}

export interface ElbowComputedFields {
  elbow_safety_status: ElbowSafetyStatus
  fracture_imaging_consider: boolean
  expedited_referral_consider: boolean
  neuro_assessment_required: boolean
  infection_assessment_required: boolean
}
```

`ELBOW_00`(arm_hand_region_discriminator)은 이 타입에 **존재하지 않는다** — §2.1의 F1류 invariant.

### Concrete sets (kneeLogic.ts의 `KNEE02_URGENT`류 패턴 재사용)

```text
ELBOW_02 urgent concrete:
- GROSS_DEFORMITY_OR_STILL_OUT
- COLD_PALE_BLUE_HAND
- MAJOR_NEW_DISTAL_NEURO_CHANGE

ELBOW_09A concrete:
- NEW_OR_WORSENING_HAND_WEAKNESS
- VISIBLE_MUSCLE_WASTING

ELBOW_10 concrete:
- NEW_NECK_SHOULDER_SYMPTOM
- MULTI_LEVEL_OR_BILATERAL_SENSORY_CHANGE

ELBOW_11 urgent concrete:
- CHEST_PAIN_OR_TIGHTNESS
- SHORTNESS_OF_BREATH
- COLD_SWEAT
- NAUSEA
```

`ELBOW_08`은 multi_choice가 아니라 **single_choice**다(Tablet 문서 §4 명시) — `knee08Status`류의 배열-분류 헬퍼가 아니라 단순 값 비교로 구현한다. `SYSTEMIC_OR_RAPIDLY_SPREADING`이라는 하나의 enum 값 자체가 이미 "systemic illness OR rapid spreading"을 합친 것이므로, **코드에서 이 두 조건을 별도로 분리해 AND로 재조합하면 안 된다** — 값 자체를 그대로 URGENT 트리거로 쓴다(Opus v0.2가 검증한 것과 동일한 이유로, 이 값의 존재 자체가 이미 fail-safe OR 결합이다).

### URGENT_REVIEW

```text
core_safety_already_urgent === true
ELBOW_02 concrete urgent positive
ELBOW_02A === YES
ELBOW_07 === YES
ELBOW_08 === 'SYSTEMIC_OR_RAPIDLY_SPREADING'
ELBOW_11 any concrete positive
```

### REVIEW_REQUIRED

urgent가 아니면서 CLOSED v0.1.1 §10 조건을 literal port:

```text
required safety missing/malformed
ELBOW_01 UNKNOWN/missing
ELBOW_02 UNKNOWN/invalid/missing
ELBOW_02A UNKNOWN/invalid/missing
ELBOW_03 YES/UNKNOWN/invalid/missing when shown
ELBOW_04 YES/UNKNOWN/invalid/missing when shown
ELBOW_05 YES/UNKNOWN/invalid/missing when shown
ELBOW_06 YES/UNKNOWN/invalid/missing
ELBOW_07 UNKNOWN/invalid/missing
ELBOW_08 === 'LOCALIZED_STABLE' / UNKNOWN/invalid/missing
ELBOW_09 UNKNOWN/missing
ELBOW_09 YES + ELBOW_09A concrete positive/UNKNOWN/invalid/missing when shown
  (ELBOW_09A === [NONE]은 제외 -- §5 핵심 de-escalation 결정, 아래 참고)
ELBOW_10 concrete positive/UNKNOWN/invalid/missing
ELBOW_11 UNKNOWN/invalid/missing when shown
```

**중요 negative regression (stable sensory-only de-escalation):**

```text
ELBOW_09 == YES
AND ELBOW_09A == [NONE]
```

이면 **이 경로만으로 REVIEW_REQUIRED가 되지 않아야 한다.** KNEE의 A6(DVT combined-condition) critical regression과 동일한 성격의 필수 테스트 케이스다.

### Flags

```text
fracture_imaging_consider = (ELBOW_03 === 'YES')

expedited_referral_consider =
  (ELBOW_04 === 'YES' || ELBOW_04 === 'UNKNOWN')
  || (ELBOW_05 === 'YES' || ELBOW_05 === 'UNKNOWN')
  || (ELBOW_06 === 'YES' || ELBOW_06 === 'UNKNOWN')
  || (ELBOW_09 === 'YES' && (09A concrete positive OR 09A UNKNOWN/invalid/missing))
  -- v0.1.1 수정사항: 09A가 UNKNOWN/invalid/missing인 분기도 포함한다(§5/§11
     불일치를 Opus v0.2가 지적, v0.1.1에서 명시적으로 닫힘). 09A === [NONE]이면
     제외.

neuro_assessment_required =
  ELBOW_09 === 'YES' && (09A concrete positive OR 09A UNKNOWN/invalid/missing)
  -- expedited_referral_consider의 마지막 조건과 정확히 동일한 조건. 이 둘이
     문서에서 항상 함께 true/false여야 한다 -- 별도 함수로 중복 구현하지 말고
     같은 boolean 표현식(또는 같은 helper 함수 결과)을 두 곳에서 재사용할 것.

infection_assessment_required =
  ELBOW_07 !== 'NO'   // YES/UNKNOWN/missing 포함
  || ELBOW_08 !== 'NONE' && ELBOW_08 !== undefined  // LOCALIZED_STABLE/SYSTEMIC.../UNKNOWN 포함
  || (ELBOW_08 === undefined)  // missing도 포함 -- 위 조건과 합쳐 "NONE이 아니면 전부"로 단순화 가능
```

missing(순수 무응답)은 ELBOW_04/05/06 자체에서는 REVIEW를 만들지만 `expedited_referral_consider`를 임의로 true로 만들지 않는다(Tablet 문서 §11 그대로) — **단 `ELBOW_09A`의 missing/UNKNOWN/malformed는 이 예외에서 제외된다**(위 §5/§11 v0.1.1 수정사항 참고). 이 비대칭을 실수로 통일하지 말 것 — ELBOW_04/05/06은 게이트 자체가 YES/UNKNOWN일 때만 flag가 켜지는 구조이고, ELBOW_09/09A는 게이트(ELBOW_09)가 이미 YES로 확정된 뒤 후속 문항의 불확실성을 다루는 구조라 다르다.

### Lock

```ts
export const elbowSafetyLocked = (f: ElbowComputedFields): boolean =>
  f.elbow_safety_status !== 'CLEAR'
```

KNEE/SHOULDER와 동일하게 단일 lock — 별도 manipulation-risk lock domain 없음(CLOSED 문서에 그런 도메인이 없다).

## 3.2 `src/spec/elbowAdapter.ts`

```text
toElbowState(r: Responses, coreGeneralRed: boolean): ElbowState
toElbowStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean): ElbowState
```

`kneeAdapter.ts`와 동일한 형태 — 다른 모듈의 adapter/logic을 import하지 않는다(§1.4). ELBOW_01-11 raw answer → `ElbowState` 필드 1:1 매핑, `computeFlags(r).general_red`(또는 `payload.flags.general_red`) → `core_safety_already_urgent`. **`ELBOW_00`은 이 어댑터가 아예 읽지 않는다** — routing 값은 `coreSpec.ts`의 `IS_PRIMARY_ELBOW_SAFETY`/`buildRoutingPayload`에서만 소비된다.

이번 iteration에 clinician-entered objective field가 필요하지 않다(CLOSED 문서 어디에도 그런 요구가 없음) — SHOULDER의 `clinician_objective_cuff_weakness`, LBP의 `clinician_objective_motor_deficit` 같은 필드를 새로 만들지 않는다. `JudgmentPanel.tsx`/`judgment.ts`는 변경하지 않는다.

## 3.3 `tests/elbow.spec.mjs`

`tests/knee.spec.mjs`와 동일한 Section A(logic) + Section B(adapter) 구조. 세부는 §10.

---

# 4. `coreSpec.ts` Integration

## 4.1 import

```ts
import { toElbowState } from './elbowAdapter'
import { computeElbowFlags } from './elbowLogic'
```

## 4.2 entry helpers (§2 참고)

```ts
export const IS_PRIMARY_ARM_HAND = (r: Responses) => IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'arm_hand'

export const IS_PRIMARY_ELBOW_SAFETY = (r: Responses) =>
  IS_PRIMARY_ARM_HAND(r) &&
  ['ELBOW', 'FOREARM', 'DIFFUSE_OR_MULTIPLE', 'UNKNOWN'].includes(r['ELBOW_00'] as string)
```

LBP/NECK/SHOULDER/KNEE의 `IS_PRIMARY_XXX`와 독립적으로 둔다(다른 export를 수정하지 않는다).

## 4.3 `ARM_HAND_ROUTING_QUESTIONS` + `ELBOW_QUESTIONS`

CLOSED v0.1.1의 문구/값/showIf를 literal port한다.

### routing (§2.1)
```text
ELBOW_00 -> IS_PRIMARY_ARM_HAND
```

### protected safety (ELBOW_QUESTIONS, IS_PRIMARY_ELBOW_SAFETY 게이트)
```text
ELBOW_01, ELBOW_02, ELBOW_02A, ELBOW_06, ELBOW_07, ELBOW_08, ELBOW_09, ELBOW_10, ELBOW_11
```

### protected safety follow-up (하위 조건)
```text
ELBOW_03, ELBOW_04, ELBOW_05 -> IS_PRIMARY_ELBOW_SAFETY && ELBOW_01 in [YES, UNKNOWN]
ELBOW_09A -> IS_PRIMARY_ELBOW_SAFETY && ELBOW_09 in [YES, UNKNOWN]
ELBOW_11 -> IS_PRIMARY_ELBOW_SAFETY && !computeFlags(r).general_red  (§6)
```

### phenotype (required: false)
```text
ELBOW_12, ELBOW_13, ELBOW_14, ELBOW_15(-> IS_PRIMARY_ELBOW_SAFETY && ELBOW_01 in [YES,UNKNOWN])
```

**`ELBOW_01/02/02A/06/07/08/09/10`은 반드시 `required: true`.** `ELBOW_03/04/05/09A/11`도 shown되면 `required: true`(v0.1.1에서 이미 CLOSED — KNEE_03/04가 처음에 이 표기가 빠져 실제로 fail-open 위험이 있었던 전례를 반복하지 않는다).

## 4.4 question composition

```text
...PAIN_QUESTIONS,
...LBP_QUESTIONS,
...SHOULDER_QUESTIONS,
...NECK_QUESTIONS,
...KNEE_QUESTIONS,
...ARM_HAND_ROUTING_QUESTIONS,
...ELBOW_QUESTIONS,
...FATIGUE_QUESTIONS,
```

기존 모듈은 전부 showIf가 상호 배타적이므로(각 `PAIN_01` 값은 single_choice) 기존 LBP/NECK/SHOULDER/KNEE 환자의 visible sequence는 변하지 않는다.

## 4.5 StaffCheckScreen interrupt

등록 screen (URGENT_REVIEW가 확정될 수 있는 5개 지점, CLOSED 문서 §10 URGENT_REVIEW 목록의 화면-특정 조건 2-6번):

```text
ELBOW_02, ELBOW_02A, ELBOW_07, ELBOW_08, ELBOW_11
```

각 trigger는 개별 조건을 재구현하지 않고:

```ts
computeElbowFlags(toElbowState(r, computeFlags(r).general_red)).elbow_safety_status === 'URGENT_REVIEW'
```

원칙을 사용한다(NECK_02/SH02/KNEE_02와 동일한 "부분 재구현 대신 엔진 재사용" 패턴).

등록하지 않는 screen: `ELBOW_01, ELBOW_03, ELBOW_04, ELBOW_05, ELBOW_06, ELBOW_09, ELBOW_09A, ELBOW_10` — REVIEW/expedited/flag 계층이지 urgent interrupt source가 아니다.

## 4.6 payload

`safety_flags`:
```ts
elbow: IS_PRIMARY_ELBOW_SAFETY(r)
  ? computeElbowFlags(toElbowState(r, computeFlags(r).general_red))
  : null
```

`modules.elbow`:
```text
region_discriminator (ELBOW_00 -- 편의상 여기 함께 보관, Layer 1/2에는 없음)
recent_trauma_or_sudden_load
deformity_neurovascular_screen
spontaneously_reduced_dislocation_screen
post_trauma_functional_loss
distal_biceps_concern
distal_triceps_concern
true_locked_rom_block
septic_joint_emergency_screen
posterior_bursal_screen
ulnar_sensory_screen
ulnar_motor_progression_screen
referred_proximal_screen
cardiac_associated_screen
pain_location_pattern
primary_side
load_activity_pattern
rapid_post_trauma_swelling
```

## 4.7 routing

`buildRoutingPayload().primary_module_detail`에 ELBOW를 추가한다(§2.2):

```ts
primary_module_detail: IS_PRIMARY_LBP(r)
  ? 'LBP'
  : IS_PRIMARY_NECK(r)
    ? (r['NS01'] === 'SHOULDER_DOMINANT' ? 'SHOULDER' : 'NECK')
    : IS_PRIMARY_KNEE(r)
      ? 'KNEE'
      : IS_PRIMARY_ARM_HAND(r)
        ? (IS_PRIMARY_ELBOW_SAFETY(r) ? 'ELBOW' : null)
        : null,
```

기존 LBP/NECK/SHOULDER/KNEE 결과는 변하지 않는다(각 조건이 상호 배타적).

---

# 5. Doctor View Integration

## 5.1 imports

```text
computeElbowFlags
elbowSafetyLocked
ElbowComputedFields
toElbowStateFromDoctorPayload
```

## 5.2 `ElbowSafetyPanel`

render gate:
```ts
if (payload.responses.safety_flags.elbow === null) return null
```

4개 flag를 분리 표시(KneeSafetyPanel과 동일한 chip 패턴):
```text
팔꿈치 안전: CLEAR / REVIEW_REQUIRED / URGENT_REVIEW
신속 의뢰 고려: yes/no
골절·영상 평가 고려: yes/no
신경학적 평가 필요: yes/no
감염 평가 필요: yes/no
```

`elbow_safety_status !== CLEAR`이면 routine exercise/manual-treatment suggestion lock 안내.

## 5.3 raw patient summary

측성/통증 위치/부하패턴/자연정복 여부/척골신경 감각-진행/연관통/심장동반증상 응답을 S/patient-reported 정보로 표시할 수 있다. **객관적 진찰로 표시하지 않는다**(§7).

## 5.4 Suggested Exam — minimal mechanical mapping only

Base(module active): elbow AROM/PROM, forearm pronation/supination, target function reproduction.

Safety-selective(CLOSED 문서 §8 그대로): 골절/NV, distal biceps(hook test 등), distal triceps, mechanical lock, cubital tunnel, lateral/medial elbow, radial tunnel/PIN. 새 임상판단을 만들지 않고 CLOSED 문서가 직접 연결한 경우만 추천한다(KNEE/SHOULDER의 `suggestedKneeExamCodes`/`suggestedShoulderExamCodes`와 동일한 성격 — 정확한 트리거는 구현 시점에 확정해도 되는 non-clinical 세부).

## 5.5 `primaryModuleFields`

`case 'Pain':`에 ELBOW 블록 추가, 게이트는 `m.pain.primary_location === 'arm_hand'`(§1.6). ELBOW_00(region_discriminator)도 이 블록에 포함해 원장이 환자가 어느 부위를 골랐는지 볼 수 있게 한다.

## 5.6 No new JudgmentPanel field

§3.2와 동일한 이유로 이번 iteration에서 만들지 않는다.

---

# 6. Cardiac Screen (E8/§6) — 구현 원칙

- `ELBOW_11`의 4개 옵션(`CHEST_PAIN_OR_TIGHTNESS`/`SHORTNESS_OF_BREATH`/`COLD_SWEAT`/`NAUSEA`) 중 **어느 것도** 움직임/자세/안정시 여부를 묻는 수식어를 갖지 않는다 — 구현 시 옵션 문구나 판정 로직에 그런 조건을 새로 추가하지 않는다.
- `show_when`에 `!computeFlags(r).general_red`가 있어 Core가 이미 urgent를 확인했으면 화면 자체를 생략할 수 있다. **이 생략이 fail-open이 되지 않는 이유**: `ElbowState.core_safety_already_urgent`가 true면 `computeElbowFlags`의 URGENT_REVIEW rule 1이 독립적으로 이미 URGENT를 만들기 때문에(§3.1), `ELBOW_11`이 미답변(`undefined`)이어도 elbow_safety_status는 이미 URGENT다 — SH05/KNEE_06B와 정확히 동일한 passthrough 원칙.
- `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`은 phenotype enum 목록에서 `REFERRED_OR_PROXIMAL_SOURCE`와 별도로 유지한다(둘을 하나의 enum으로 합치지 않는다) — Doctor View나 payload 어디서도 이 둘을 병합하지 말 것.

---

# 7. Sigma / Chart Boundary

Tablet 응답은 C/C, O/S, S에 활용 가능하나 **O(객관적 소견)는 원장이 실제 시행한 객관적 진찰만 기록**한다. `ElbowSafetyPanel`/`primaryModuleFields`가 렌더하는 모든 ELBOW_* raw 값은 환자 자가보고이며, 어떤 화면에서도 이를 "객관적 소견"이라는 라벨로 표시하지 않는다(기존 LBP/NECK/SHOULDER/KNEE 패널의 동일 원칙).

---

# 8. Supportive Phenotype Scope

CLOSED 문서가 정의하는 phenotype:

```text
LATERAL_ELBOW_TENDINOPATHY
MEDIAL_FLEXOR_PRONATOR_PATTERN
ULNAR_NEUROPATHY_AT_ELBOW
RADIAL_TUNNEL_OR_PIN
INTRA_ARTICULAR_MECHANICAL_PATHOLOGY
ELBOW_DEGENERATIVE_PATTERN
REFERRED_OR_PROXIMAL_SOURCE
```

모든 phenotype에 대해 구현 가능한 deterministic scoring threshold가 CLOSED되어 있지는 않다. 따라서:

- raw discriminator(ELBOW_12-15)는 payload/Doctor View에 보존
- MUST_EXCLUDE safety domain(7개, §9)은 구현
- CLOSED safety flags(4개)는 구현
- 확진/자동 점수화/가짜 확률은 구현하지 않음(single test = diagnosis 금지, CLOSED 문서 §9 그대로)

---

# 9. Files Expected to Change

## New

```text
src/spec/elbowLogic.ts
src/spec/elbowAdapter.ts
tests/elbow.spec.mjs
docs/ELBOW_V1_INTEGRATION_REPORT.md   // implementation 완료 후
```

## Modify

```text
src/spec/coreSpec.ts     (IS_PRIMARY_ARM_HAND/IS_PRIMARY_ELBOW_SAFETY, ARM_HAND_ROUTING_QUESTIONS,
                           ELBOW_QUESTIONS, CORE_QUESTIONS splice, STAFF_CHECK_TRIGGERS,
                           buildResponsePayload, buildRoutingPayload)
src/doctor/DoctorView.tsx (ElbowSafetyPanel, primaryModuleFields case 'Pain')
src/doctor/fixtures.ts    (최소 ELBOW fixture 1-2개, 기존 fixture 수정 없이 추가만)
package.json              (test:elbow 추가, test:all에 연결)
.gitignore                (elbow 번들 파일 2개 추가)
```

필요한 경우에만:
```text
tests/integration.spec.mjs
tests/doctor.spec.mjs
```

## 절대 수정 금지 (zero diff 목표)

```text
src/spec/lbpLogic.ts
src/spec/lbpAdapter.ts
src/spec/neckLogic.ts
src/spec/neckAdapter.ts
src/spec/shoulderLogic.ts
src/spec/shoulderAdapter.ts
src/spec/kneeLogic.ts
src/spec/kneeAdapter.ts
src/doctor/judgment.ts
src/doctor/JudgmentPanel.tsx
```

구현 완료 후 `git diff --stat`으로 이 10개 파일이 실제로 0 diff임을 증명한다(KNEE_V1 통합 때와 동일한 검증 방식).

---

# 10. Test Matrix

## A. Logic Engine (`elbowLogic.ts`)
- A0 valid negative → CLEAR
- A1 ELBOW_02: 3개 concrete → URGENT 각각, UNKNOWN/missing → REVIEW, malformed(NONE+urgent concrete) → URGENT(널값이 진짜 양성을 취소하지 않음)
- A2 ELBOW_02A: YES → URGENT(ELBOW_01=NO여도), UNKNOWN/missing → REVIEW, NO → 기여 없음
- A3 ELBOW_03: shown일 때 YES → REVIEW+fracture flag, UNKNOWN/missing → REVIEW, NO → 기여 없음, ELBOW_01=NO면 not-shown
- A4 ELBOW_04/A5 ELBOW_05: YES/UNKNOWN → REVIEW+expedited, missing → REVIEW만(expedited는 false), 절대 URGENT 자동승격 없음
- A6 ELBOW_06: YES/UNKNOWN → REVIEW+expedited, 절대 URGENT 자동승격 없음
- A7 ELBOW_07: YES → URGENT, UNKNOWN/missing → REVIEW
- A8 ELBOW_08: `SYSTEMIC_OR_RAPIDLY_SPREADING` → URGENT, `LOCALIZED_STABLE` → REVIEW, UNKNOWN/missing → REVIEW, `NONE` → 기여 없음 — **AND-gate 회귀 방지**: `SYSTEMIC_OR_RAPIDLY_SPREADING`가 단일 enum 값임을 직접 검증(두 조건을 각각 별도 필드로 나눠 구현하지 않았는지)
- **A9 CRITICAL**: `ELBOW_09 = YES` + `ELBOW_09A = [NONE]` → CLEAR 기여(REVIEW 아님), `expedited_referral_consider = false`, `neuro_assessment_required = false`
- A10 `ELBOW_09 = YES` + `ELBOW_09A` concrete positive(각각) → REVIEW + neuro + expedited
- **A11 v0.1.1 회귀**: `ELBOW_09 = YES` + `ELBOW_09A` UNKNOWN/missing/malformed → REVIEW + `neuro_assessment_required=true` + **`expedited_referral_consider=true`**(이 마지막 flag가 빠지면 BLOCKER)
- A12 `ELBOW_09 = UNKNOWN`/missing → REVIEW(09A 값 무관)
- A13 ELBOW_10: concrete/UNKNOWN/missing → REVIEW, NONE → 기여 없음
- **A14 cardiac**: ELBOW_11 4개 옵션 각각 단독 → URGENT, 움직임/자세 조건부 AND 없이 단일값만으로 발동하는지 직접 검증, UNKNOWN/missing → REVIEW, NONE → 기여 없음
- A15 `core_safety_already_urgent = true` 단독 → URGENT
- A16 locks: CLEAR 미잠금, REVIEW/URGENT 잠금

## B. Adapter
- 전체 ELBOW_0x id가 정확한 `ElbowState` 필드에 매핑
- multi-choice는 배열 유지, 부재 필드는 undefined(null 아님)
- `core_safety_already_urgent` passthrough
- **`ElbowState`에 `ELBOW_00`(region) 필드가 존재하지 않음을 타입 레벨/런타임 양쪽에서 확인**(F1류 invariant 회귀 방지)

## C. Question visibility (routing 포함)
- non-arm_hand 환자 → ARM_HAND_ROUTING_QUESTIONS/ELBOW_QUESTIONS 전부 비노출
- `PAIN_01 === 'arm_hand'` → `ELBOW_00`만 노출(다른 ELBOW_* 아직 비노출)
- `ELBOW_00 in [ELBOW, FOREARM, DIFFUSE_OR_MULTIPLE, UNKNOWN]` → ELBOW protected safety 전체 노출
- **`ELBOW_00 === 'WRIST_HAND'` → ELBOW protected safety 전체 비노출**(이 프로젝트에서 가장 중요한 routing 회귀 테스트)
- ELBOW_00 미답변 상태에서도 fail-open 없음(required:true UI 하드블록 전제, §2.1)
- ELBOW_03/04/05/15는 ELBOW_01 YES/UNKNOWN에서만, ELBOW_09A는 ELBOW_09 YES/UNKNOWN에서만
- ELBOW_01/02/02A/06/07/08/09/10과 ELBOW_03/04/05/09A/11 전부 `required: true`
- stale prune: PAIN_01을 arm_hand에서 다른 값으로 바꾸면 ELBOW_00 포함 전체 ELBOW_* 응답이 null로 정리됨

## D. Staff interrupt
- ELBOW_02 urgent 값 → StaffCheck
- ELBOW_02A YES → StaffCheck
- ELBOW_07 YES → StaffCheck
- ELBOW_08 `SYSTEMIC_OR_RAPIDLY_SPREADING` → StaffCheck
- ELBOW_11 concrete positive → StaffCheck
- ELBOW_03/04/05/06/09/09A/10 positive → StaffCheck 없음(REVIEW/flag만)
- Core general_red 이미 true → ELBOW_11 자체가 생략되어도 위 5개 trigger 함수가 여전히 true(engine passthrough)

## E. Payload/routing
- ELBOW 환자 → `safety_flags.elbow !== null`
- 비-ELBOW(WRIST_HAND 포함) 환자 → `safety_flags.elbow === null`
- 전체 ELBOW 응답이 `modules.elbow` 아래
- `primary_module_detail === 'ELBOW'`(ELBOW-safety-exposed 환자만)
- WRIST_HAND-only 환자 → `primary_module_detail === null`(§2.2)
- 기존 LBP/NECK/SHOULDER/KNEE routing 불변

## F. Doctor View
- elbow panel은 `safety_flags.elbow` 존재할 때만 렌더
- 4개 flag/status 분리 렌더
- raw tablet 응답이 객관적 진찰로 라벨되지 않음
- REVIEW/URGENT에서 lock 안내 렌더

## G. Full regression
```bash
npm run build
npm run test:elbow
npm run test:lbp
npm run test:neck
npm run test:shoulder
npm run test:knee
npm run test:all
```
전부 **0 failed**. 현재 기존 suite 총 assertion 수(1385, 13 suites)를 새 고정 숫자로 문서화하지 않는다 — 구현 완료 시 실제 실행결과를 `ELBOW_V1_INTEGRATION_REPORT.md`에 기록한다.

---

# 11. Sonnet Implementation Order

```text
1. elbowLogic.ts + unit tests (Section A, 특히 A9/A11 critical regression)
2. elbowAdapter.ts + adapter tests (Section B, ELBOW_00 부재 확인 포함)
3. coreSpec.ts: IS_PRIMARY_ARM_HAND/IS_PRIMARY_ELBOW_SAFETY + ARM_HAND_ROUTING_QUESTIONS + ELBOW_QUESTIONS
   + visibility/stale-prune/WRIST_HAND-exclusion tests (Section C)
4. safety_flags/modules payload + routing (primary_module_detail 'ELBOW' 분기, WRIST_HAND→null 분기)
5. STAFF_CHECK_TRIGGERS urgent 통합 (ELBOW_02/02A/07/08/11)
6. Doctor View ElbowSafetyPanel + primaryModuleFields + 최소 fixture/tests
7. package.json test:elbow/test:all wiring
8. build + LBP/NECK/SHOULDER/KNEE 회귀 (10개 frozen 파일 zero-diff 확인)
9. 전체 test:all
10. ELBOW_V1_INTEGRATION_REPORT.md
```

각 단계에서 LBP/NECK/SHOULDER/KNEE 관련 파일을 불필요하게 건드리지 않는다.

---

# 12. Stop Conditions

Sonnet은 아래 중 하나면 구현을 멈추고 **INTEGRATION DECISION REQUIRED**로 보고한다(CLINICAL DECISION REQUIRED로 되돌리지 않는다):

- CLOSED 문서끼리 값/문구가 충돌
- 기존 UI type contract로 CLOSED semantics를 literal port할 수 없음
- safety status를 지키려면 기존 LBP/NECK/SHOULDER/KNEE 임상 threshold를 바꿔야 함
- 새로운 clinical threshold/diagnosis rule이 필요함
- `expedited_referral_consider`/`neuro_assessment_required`의 09A-UNKNOWN 분기(§3.1 Flags)를 구현 중 실수로 하나만 반영하고 하나를 빠뜨렸는데, 문서 재해석 없이는 어느 쪽이 맞는지 판단할 수 없는 상황(이런 경우는 없어야 하지만, 발생하면 CLOSED 문서 원문을 재확인하고도 판단 불가할 때만 stop)

단순한 TypeScript/React/test 구조 문제는 Sonnet이 해결한다.

---

# 13. Definition of Done

```text
[ ] ELBOW_00 routing이 실제 tablet flow에서 동작 (WRIST_HAND 제외 확인)
[ ] protected safety visibility correct
[ ] Elbow safety engine literal CLOSED semantics
[ ] A9 stable-sensory-only de-escalation regression test passes
[ ] A11 v0.1.1 expedited_referral_consider 09A-UNKNOWN regression test passes
[ ] A8 infection OR (not AND) regression test passes
[ ] urgent screens interrupt via full engine reuse (5개 지점)
[ ] response payload + routing integrated (WRIST_HAND -> null 포함)
[ ] Doctor View safety panel integrated
[ ] no fake diagnosis / no single-test-confirms-diagnosis
[ ] build passes
[ ] test:elbow passes
[ ] LBP/NECK/SHOULDER/KNEE regressions pass (10개 frozen 파일 zero diff)
[ ] test:all passes with 0 failed
[ ] integration report committed
```

완료 후: `ELBOW_V1: PASS / FROZEN`. 그 전에는 FROZEN을 선언하지 않는다.

---

# 14. Sonnet에게 넘기는 Literal Invariants (요약)

1. `IS_PRIMARY_ARM_HAND = primary concern == pain && PAIN_01 == 'arm_hand'`.
2. `IS_PRIMARY_ELBOW_SAFETY = IS_PRIMARY_ARM_HAND && ELBOW_00 in [ELBOW, FOREARM, DIFFUSE_OR_MULTIPLE, UNKNOWN]`. `WRIST_HAND`만 제외.
3. `ELBOW_00`은 routing/tagging 전용 — `ElbowState`/safety 계산 입력에 절대 포함하지 않는다.
4. URGENT_REVIEW: Core urgent passthrough / ELBOW_02 concrete / ELBOW_02A YES / ELBOW_07 YES / ELBOW_08 == SYSTEMIC_OR_RAPIDLY_SPREADING / ELBOW_11 concrete positive.
5. REVIEW+expedited(URGENT 자동승격 금지): distal biceps(ELBOW_04) / distal triceps(ELBOW_05) / mechanical lock(ELBOW_06) / progressive ulnar(ELBOW_09+09A concrete 또는 UNKNOWN/invalid/missing).
6. `ELBOW_09 YES + ELBOW_09A [NONE]`은 이 경로 단독으로 REVIEW를 만들지 않는다(stable sensory-only de-escalation).
7. `ELBOW_09 YES + ELBOW_09A UNKNOWN/invalid/missing` → REVIEW + `neuro_assessment_required=true` + **`expedited_referral_consider=true`**(v0.1.1에서 명시적으로 CLOSED된 조건, 누락 시 BLOCKER).
8. flags(`fracture_imaging_consider`/`expedited_referral_consider`/`neuro_assessment_required`/`infection_assessment_required`)는 safety tier와 별개, 여러 개 동시 true 가능.
9. Cardiac screen(ELBOW_11)에 movement/rest-independent 같은 AND gate를 새로 만들지 않는다. Core urgent면 화면 생략 가능하되 engine passthrough로 fail-open 없음.
10. `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`은 `REFERRED_OR_PROXIMAL_SOURCE`와 별도 domain 유지.
11. ELBOW_02/ELBOW_02A 포함 모든 protected safety에서 UNKNOWN/missing/malformed가 CLEAR를 만들지 않는다. optional phenotype(ELBOW_12-15) missing은 safety escalation 금지.
12. Tablet 응답만으로 O(객관적 소견) 생성 금지, 진단 확정 scoring 금지, single test = diagnosis 금지.
13. LBP/NECK/SHOULDER/KNEE의 8개 logic/adapter 파일 + judgment.ts/JudgmentPanel.tsx는 zero diff.

---

# 15. Current Gate

```text
LBP_V1       PASS / FROZEN
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN
KNEE_V1      PASS / FROZEN

ELBOW Evidence/Tablet/Opus     PASS / CLINICAL DECISIONS CLOSED
Fable repo audit               COMPLETE
Fable integration plan         COMPLETE
Sonnet implementation          NOT STARTED
ELBOW production status        NOT YET FROZEN
```

다음 단일 단계:

> **Sonnet: implement this plan literally on `clinical/elbow-v1-review`, then run full regression and write `docs/ELBOW_V1_INTEGRATION_REPORT.md`.**

이번 문서 작성 단계에서는 production code를 작성하지 않았다.
