# WRIST_HAND_V1 — Opus Clinical Review v0.1

작성일: 2026-08-25
검수 대상: `docs/WRIST_HAND_V1_Evidence_Matrix_v0.1_HANDOFF.md` (W1–W10)
검수자: Opus role (본 세션)
기준 브랜치: `clinical/wrist-hand-v1-review`
기준 commit: `3c9aa1e` (WRIST_HAND_V1 evidence matrix add, ELBOW_V1 merge 이후)

이 문서는 W1–W10만 검수한다. Tablet Question Set, Fable 통합계획,
TypeScript/UI/테스트 구현은 이 검수의 범위가 아니며 착수하지 않았다.

---

## 0. 검수 방법

Evidence Matrix의 W1–W10 서술뿐 아니라 실제 repo의 현재 상태를 직접
확인해 근거로 삼았다.

`src/spec/coreSpec.ts` 확인 결과 (읽은 그대로):

```text
IS_PRIMARY_ARM_HAND        (line 1077) = IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'arm_hand'
IS_PRIMARY_ELBOW_SAFETY    (line 1079-1080)
  = IS_PRIMARY_ARM_HAND(r) && ['ELBOW','FOREARM','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(r['ELBOW_00'])

ARM_HAND_ROUTING_QUESTIONS (line 1868-1885)
  - ELBOW_00 / variable: arm_hand_region_discriminator
  - showIf: IS_PRIMARY_ARM_HAND (즉 WRIST_HAND을 포함해 5개 값 전부에서 노출)
  - options: ELBOW / FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN

SAFETY_01 / general_red      (line 3252, 3279)
  - chest_breathing 옵션이 general_red를 만들고, 모든 모듈의
    safety_status URGENT 판정에서 core_safety_already_urgent로
    독립적으로 반영됨 (ELBOW_02/02A/07/08/11 STAFF_CHECK_TRIGGERS,
    line 3370-3374에서 확인).
```

Evidence Matrix §1의 서술(“현재 실제 repo”)은 위 확인과 정확히 일치한다.
router가 tagging/visibility 전용이고 값 자체가 safety tier를 만들지
않는다는 원칙(§1)도 `IS_PRIMARY_ELBOW_SAFETY`가 boolean 게이트로만
쓰이고 `elbowLogic.ts`/`ElbowState`에 `ELBOW_00`이 전혀 들어가지 않는
현재 구현과 일치한다. WRIST_HAND_V1이 동일 원칙을 따르는 것이 타당하다.

---

## 1. W1 — Region routing boundary

**결정: Option B.**

`FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN`에서
WRIST_HAND protected safety를 노출한다. `ELBOW`만 제외한다.

근거:
- distal radius fracture(FOOSH)는 손상 부위가 정확히 요골 원위부 —
  손목 관절선 바로 위 — 이며, 붓기가 전완 원위부까지 번지는 경우
  환자가 "손목"이 아니라 "팔(전완)이 아프다"고 표현하는 사례가 실제로
  드물지 않다. 이는 Evidence Matrix 자신이 제시한 근거(§11 W1
  rationale)와 일치하며, occult scaphoid/carpal fracture,
  deformity/NV compromise 등 이 모듈의 핵심 MUST_EXCLUDE 항목들이
  걸린 boundary다.
- ELBOW_V1은 동일한 문제(전완이 팔꿈치 병리로 인식될 수 있음, 예:
  외상과염 origin tendinopathy)에 대해 이미 FOREARM을 ELBOW safety
  노출 범위에 포함하는 쪽(포함적 경계)을 CLOSED/FROZEN으로 확정했다
  (`IS_PRIMARY_ELBOW_SAFETY`, Evidence Matrix E9). WRIST_HAND_V1이
  반대 방향(배타적 경계, Option A)을 택하면 두 모듈이 서로 다른
  boundary 철학을 갖게 되어 일관성이 깨지고, "손목 골절을 전완이라고
  말한 환자"가 두 모듈 모두에서 protected safety를 놓치는 fail-open
  이중 공백이 생긴다.
- 대가(부담)는 실재한다: FOREARM 태그 환자는 ELBOW_01–11과
  WRIST_HAND protected safety를 모두 보게 된다. 이는 Evidence Matrix
  §5 원칙("Safety first. Phenotype questions cannot hide protected
  safety.")과 이 세션 전체에서 반복 확정된 우선순위(부담보다 안전)에
  따라 수용 가능한 tradeoff로 판단한다. 새로운 architecture 변경은
  아니며 — 각 모듈이 독립적으로 자신의 `IS_PRIMARY_*_SAFETY` 게이트에
  FOREARM을 포함할지 결정하는 기존 패턴을 그대로 따르는 것뿐이다.

router 자신은 여전히 tagging 전용이며 WRIST_HAND_V1의 safety tier는
전적으로 `WRIST_HAND_QUESTIONS` 내부 protected 응답에서만 계산된다 —
W1은 노출 여부만 결정하고 escalation 로직에 관여하지 않는다.

---

## 2. W2 — Acute deformity / NV tier

**PASS (구조 확정) — 단, 누락된 concrete trigger 1건 발견. 아래
"FINDING W2-1" 참조.**

제안된 구조(gross deformity/still-out joint, cold-pale-blue digits,
major acute distal sensory-motor loss → URGENT_REVIEW;
unknown/missing/malformed → 최소 REVIEW_REQUIRED, 절대 CLEAR 아님)는
ELBOW_02의 검증된 구조(concrete positive → URGENT, invalid → 최소
REVIEW, never CLEAR)와 정확히 대칭이며 그대로 확정한다.

### FINDING W2-1

**현재 문제**: §6.1/§6.4의 concrete 후보 목록에 "major/uncontrolled
bleeding" 또는 "severe open wound with visible bone/tendon/joint
exposure"에 해당하는 항목이 없다. §6.4는 "if associated uncontrolled
bleeding / gross NV compromise / severe open injury → URGENT through
global/trauma pathway"라고 서술하지만, W2(§11)의 실제 concrete 후보
셋(gross deformity/still-out, cold-pale-blue, major NV change)에는
출혈/개방창 항목이 없다. `MAJOR_NEW_DISTAL_NEURO_CHANGE`류 항목은
신경학적 변화만 포착하며 대량 출혈이나 뼈/힘줄/관절이 노출된 심한
개방창은 포착하지 못한다.

**Safety impact**: 손/손목의 심한 열상으로 대량 출혈이 있거나 뼈·힘줄이
노출된 환자가, 손가락 감각/힘의 변화나 창백-청색증이 아직 뚜렷하지
않은 초기 단계라면, W2 어떤 concrete 옵션에도 해당하지 않아
URGENT_REVIEW로 가지 못하고 W4(레서레이션+건 기능소실) 경로를 통해
REVIEW_REQUIRED에만 머무를 수 있다. 대량 출혈·뼈 노출 개방창은 시간
민감도가 매우 높은 상황(감염·건/신경 추가 손상·저혈량 위험)이며
REVIEW_REQUIRED(비응급 대기)로는 불충분하다. §6.4 자신이 이미
"URGENT through global/trauma pathway"라고 명시했음에도 그 pathway를
실제로 발동시킬 concrete question이 어디에도 없다 — ELBOW_V1의 E2
(자연정복 탈구 discriminator 누락)와 동일한 유형의 구조적 공백이다.

**최소 수정안**: W2의 동일 protected screen(예: 기존
`elbow_deformity_neurovascular_screen`과 대칭되는
`wrist_hand_deformity_neurovascular_screen`)의 concrete 옵션 셋에
"멈추지 않는 심한 출혈" 및/또는 "뼈·힘줄·관절이 드러나 보이는 심한
개방창" 중 최소 하나를 명시적으로 추가하고, 이 옵션이 단독으로
URGENT_REVIEW를 발생시키도록 한다(다른 항목과 AND 아님). 새로운
hypothesis 도메인은 불필요 — 기존
`MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`에 이미
포함되는 개념이다.

---

## 3. W3 — Occult scaphoid/carpal fracture

**결정: threshold 확정, X-ray 이력은 patient-facing이되 non-gating.**

Threshold: trauma + radial-sided wrist/thumb-base pain(지속) →
`REVIEW_REQUIRED + fracture_imaging_consider`. deformity/NV/open
injury 없이는 자동 URGENT 금지 — 제안대로 확정. 이 protected 질문
하나만으로 트리거가 성립해야 하며 다른 조건과 AND로 묶이지 않는다.

**"X-ray가 정상이라고 들었다" 질문**: patient-facing 질문으로
포함하되, **safety escalation을 gate하지 않는 optional 부가 정보**로
취급한다.

근거:
- 환자가 "X-ray를 찍었고 정상이라고 들었다"는 사실 자체는 임상적
  판단이 아니라 단순 사실 회상(recall)이므로 환자가 답할 수 있는
  질문이다. 다른 모듈에서도 이전 검사/치료 이력을 사실 확인 수준으로
  묻는 패턴이 이미 존재한다.
- 그러나 이 답변으로 escalation을 낮추면 위험하다. ACR 근거(E1)의
  요지는 정확히 그 반대다 — initial radiograph negative/equivocal
  이어도 임상적으로 의심되면 repeat imaging/MRI/CT가 필요하다는
  것이다. "정상이라고 들었다"를 REVIEW_REQUIRED를 취소하는 조건으로
  쓰면 이 근거의 취지를 정면으로 위반한다.
- 따라서 REVIEW_REQUIRED + fracture_imaging_consider의 트리거는
  "trauma + radial-sided wrist/thumb-base pain(지속)" 하나로 고정하고,
  X-ray 이력 질문은 어떤 답(YES/NO/UNKNOWN)이든 이 트리거를 켜거나
  끄지 못하는 **순수 부가 컨텍스트**로만 둔다. clinician view에는
  참고 정보로 노출 가능하다.
- 손목 snuffbox 자가 촉진을 진단 도구로 요구하지 않는다는 §6.3의
  기존 원칙과 같은 방향이다 — 환자 입력은 비진단적·부가적이어야 한다.

---

## 4. W4 — Laceration/penetration + tendon-function loss

**PASS (제안대로 확정), FINDING W2-1에 의존.**

레서레이션/관통상 후 손가락·엄지 능동 굴곡/신전 소실 →
`REVIEW_REQUIRED + expedited_referral_consider +
tendon_injury_assessment_required` — 확정. 자동 URGENT는 대량
출혈/명백한 NV compromise/심한 개방창일 때만 — 이 URGENT 분기가
실제로 발동하려면 W2-1의 수정(concrete bleeding/open-wound trigger
추가)이 선행되어야 한다. W2-1이 반영되면 W4는 별도 수정 없이 그대로
닫힌다.

---

## 5. W5 — Deep infection / flexor tenosynovitis tier

**결정: 제안 threshold 확정 + bite wound 자체를 REVIEW_REQUIRED
트리거로 추가.**

Systemic illness OR rapidly spreading redness/swelling → URGENT +
infection_assessment_required. 이는 ELBOW_08이 이미 검증한 "단일
opaque enum value, OR이지 AND 아님" 패턴을 그대로 따라야 한다 —
"systemic illness"와 "rapidly spreading"을 별도 boolean으로 쪼개
AND로 묶는 구현은 금지한다(ELBOW A8 CRITICAL 회귀 테스트와 동일한
성격의 요구사항으로 Tablet 단계에 명시할 것).

Penetrating wound/bite + rapidly worsening swollen painful finger +
severe pain on straightening/flexed resting posture → URGENT — 확정.

Localized stable superficial swelling without systemic/rapid
progression → REVIEW — 확정.

**Bite wound 질문에 대한 결정**: 그렇다. Bite wound(동물 또는 사람)
자체가, 현재 감염 징후가 전혀 없어도 최소 `REVIEW_REQUIRED +
infection_assessment_required`를 독립적으로 발생시켜야 한다.

근거: 손 교상(특히 고양이 교상, 사람 교상 — clenched-fist injury 포함)은
피부천자가 작아 보여도 관절/건초까지 세균이 직접 접종되는 경우가 흔하고,
초기에는 무증상에 가깝다가 수 시간~1–2일 내 급격히 패혈성 관절염/화농성
굴건막염으로 진행하는 것으로 알려져 있다(E6/E7 근거와 정합). 환자가
아직 발적·부종의 "빠른 확산"을 자각하지 못하는 시점에 이미 임상 평가가
필요한 대표적 사례이며, "감염 징후가 나타날 때까지 기다렸다가
질문한다"는 현재 §6.5 구조는 이 시간창을 놓친다. 이는 ELBOW_V1의 E8
(심장 방사통 도메인 누락)과 유사하게 — Evidence Matrix가 스스로
질문으로 남겨둔 지점이자, 근거 문헌(E6/E7)이 이미 뒷받침하는 실제
공백이다.

최소 수정안: bite wound(동물/사람) 여부를 별도 protected 질문 또는
기존 감염 게이트의 concrete 옵션으로 추가하고, 이 옵션 단독으로
`REVIEW_REQUIRED + infection_assessment_required`를 발생시킨다(감염
징후 동시 존재를 요구하지 않음). 감염 징후가 함께 있으면 기존 W5
URGENT 규칙이 그대로 상위 적용된다.

---

## 6. W6 — Median/ulnar neuropathy calibration

**PASS (제안대로 확정).**

Stable sensory-only → CONSIDER only. Progressive
weakness/dropping/visible wasting → REVIEW + neuro +
expedited. Sensory positive + progression UNKNOWN/missing → 동일하게
fail-closed REVIEW + neuro + expedited. 이는 ELBOW_09/09A(stable
sensory-only de-escalation, v0.1.1 CLOSED)와 구조적으로 동일하며 그대로
포팅 가능하다.

CTS(median)/ulnar wrist가 동일한 progressive-motor threshold를
공유하는지: **그렇다, 동일 threshold를 공유한다.** stable-sensory vs
progressive-motor 판별 로직은 신경 종류(median/ulnar)와 무관한 임상
원칙이며, 두 신경에 대해 별도 threshold를 둘 근거가 없다. 하나의 공유
판별 함수(ELBOW의 `elbow09Contribution()`과 동일한 패턴)로 구현 가능—
이는 Fable 단계의 구현 세부사항이며 이 검수는 threshold 자체가 같다는
임상 결정만 확정한다.

---

## 7. W7 — Mechanical lock distinction

**PASS (제안대로 확정).**

일반적인 trigger finger catching/locking(스스로 풀림) → phenotype
only(`TRIGGER_FINGER_PATTERN_CONSIDER`), 자동 expedited 없음. 외상 후
고정된 관절 차단/정복되지 않은 관절 → trauma/deformity pathway를 통해
REVIEW 또는 URGENT. blanket "mechanical lock = expedited" 규칙을
만들지 않는다는 원칙 확정 — trigger finger는 매우 흔하고 대체로
비응급이므로 이 구분이 임상적으로 타당하다. ELBOW_06("단순히 아파서가
아니라 실제로 걸려서" 프레이밍)과 동일한 질문 설계 원칙을 그대로
적용한다.

---

## 8. W8 — Infection question architecture

**결정: Option B(broad gate + targeted flexor-sheath follow-up),
명시적 요구사항 1건 추가.**

넓은 감염 게이트 1개(systemic illness OR rapidly spreading
redness/swelling) + penetrating wound/bite 또는 손가락 국한 패턴이
있을 때만 조건부로 노출되는 flexor-sheath follow-up(심한 신전통,
굴곡 유지 자세, 방추형 부종)을 확정한다. 부담 감소 효과가 크고
W5의 broad gate만으로 이미 핵심 URGENT 케이스 대부분을 포착한다.

**요구사항**: follow-up 질문이 노출되었을 때 그 질문 자체의 양성
응답도 infection URGENT OR-set에 **반드시 포함**되어야 한다 —
즉 follow-up은 참고용 설명 문구가 아니라 그 자체로 escalation을
발생시킬 수 있는 독립 트리거여야 한다(broad gate가 음성이어도
flexor-sheath pattern 단독으로 URGENT 가능). §6.5가 이미 이를
암시하지만 W8 자체는 명시하지 않았으므로, 이후 Tablet Question Set
작성 시 이 점이 누락되지 않도록 여기서 명시적으로 고정한다. Kanavel
sign 점수화 금지는 그대로 유지.

---

## 9. W9 — Referred/systemic screen

**PASS (제안대로 확정).**

NECK_QUESTIONS 재사용 금지 — 기존 5개 모듈 모두 독립 모듈 원칙을
따르고 있으며(ELBOW_V1도 shoulder/neck 로직을 재사용하지 않음), 정합.

WRIST/HAND 전용 minimal proximal/multi-joint screen(비응급 phenotype
수준)은 후보로 확정 — 이는 protected safety가 아니라 §7.8의
`REFERRED_OR_PROXIMAL_SOURCE`/`SYSTEMIC_OR_INFLAMMATORY_CONTRIBUTION`
supportive hypothesis에 대응하는 phenotype 질문이므로 safety
escalation과 분리된다.

**신규 cardiac screen 미추가 확정.** 실제 repo 확인 결과, Core
`SAFETY_01`이 이미 `chest_breathing` 옵션으로 `general_red`를
만들고, 이는 모든 모듈의 URGENT 판정에서 `core_safety_already_urgent`로
독립 반영된다(현재 ELBOW_02/02A/07/08/11 트리거 코드에서 확인). 이는
ELBOW_11/SH05/KNEE_06B가 각자 `!general_red`일 때만 자기 모듈 전용
cardiac follow-up을 추가로 띄우는 것과 동일한 기반이다. 어깨·팔꿈치는
심장 방사통의 인정된 목표 부위이므로 모듈별 추가 screen을 두었지만,
손목/손 국소 통증은 심장 방사통의 저빈도 부위이므로 Core의 global
passthrough만으로 충분하다는 Evidence Matrix의 판단에 동의한다. 이
결정은 새로운 safety gap을 만들지 않는다 — chest/breathing 증상이
있으면 WRIST_HAND 여부와 무관하게 이미 `general_red`가 잡히기
때문이다.

---

## 10. W10 — Fail-closed semantics

**PASS (제안대로 확정).**

UNKNOWN != NO, missing != NO, malformed != NONE, empty multi-select
!= NONE, positive+NONE/UNKNOWN 혼합 = invalid → 최소 REVIEW_REQUIRED,
optional phenotype 누락은 escalation 없음 — LBP/NECK/SHOULDER/KNEE/ELBOW
전체에서 이미 검증된 동일 계약이며 그대로 확정한다.

---

## 11. 기존 CLOSED/FROZEN 모듈 영향

LBP/NECK/SHOULDER/KNEE/ELBOW의 임상 결정은 이 검수에서 열지 않았다.
`ARM_HAND_ROUTING_QUESTIONS`/`ELBOW_00`/`IS_PRIMARY_ELBOW_SAFETY`는
그대로 재사용 대상이며 본 검수는 이 shared router의 구조를 변경하지
않는다(W1은 WRIST_HAND 쪽의 노출 집합만 결정했고, 기존
`IS_PRIMARY_ELBOW_SAFETY`의 정의는 그대로 유지된다). ELBOW_V1의
protected safety 질문/로직/threshold는 문구 하나도 검토·수정
대상으로 삼지 않았다.

---

## 12. 종합 판정

W1, W3, W5, W8, W9는 이번 검수에서 결정을 확정했고, W2, W6, W7,
W10은 제안대로 확정(PASS)했다. 그러나 **W2-1** (심한 출혈/개방창에
대한 concrete URGENT trigger 부재)은 Tablet Question Set에 실제
질문 옵션을 추가해야 닫히는 구조적 공백이며, 아직 어떤 문서에도 그
옵션이 존재하지 않는다. W5의 bite-wound 트리거 추가도 마찬가지로
아직 문서화된 질문이 없다.

```text
CLINICAL DECISION REQUIRED
```

다음 단계: 이 문서가 확정한 결정들(W1 Option B, W2-1 수정안, W3
X-ray-이력 non-gating, W5 bite-wound 트리거, W8 follow-up
독립-트리거 요구사항 포함)을 반영해 `docs/WRIST_HAND_V1_Tablet_
Question_Set_v0.1.md`를 작성한다. 그 문서가 W2-1/W5 bite-wound 항목을
정확히 포함했는지는 이어지는 Opus 재검수에서 확인한다. Fable
통합계획/TypeScript/UI/테스트 구현은 계속 blocked 상태를 유지한다.
