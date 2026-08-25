# WRIST_HAND_V1 — Opus Clinical Review v0.2

작성일: 2026-08-25
검수 대상: `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.md`가 Opus v0.1의
W1–W10 결정을 정확히 반영했는지 재검수
검수자: Opus role (본 세션)
기준 브랜치: `clinical/wrist-hand-v1-review`
기준 commit: `45eb0e6` (Tablet Question Set v0.1 add)

이 문서는 사용자가 지정한 13개 체크리스트 항목만 검수한다. 새 임상
쟁점을 열지 않았다. Fable 통합계획, TypeScript/UI/테스트 구현은 이
검수의 범위가 아니며 착수하지 않았다.

---

## 검수 방법

Tablet Question Set v0.1의 §1(routing), §3(문항별 semantics),
§5(safety engine literal contract), §6(flags)을 직접 원문 대조했다.
각 임상결정이 §3(개별 문항)/§5(tier 판정)/§6(flag 판정) 세 곳
모두에서 서로 어긋나지 않는지를 ELBOW_V1의 v0.1.1 발견 패턴과 동일한
방식으로 교차 확인했다.

---

## 1. W1 — Region routing boundary

> §1: `IS_PRIMARY_WRIST_HAND_SAFETY = PAIN_01=='arm_hand' AND ELBOW_00 in [FOREARM, WRIST_HAND, DIFFUSE_OR_MULTIPLE, UNKNOWN]`
> "ELBOW만 WRIST_HAND protected safety에서 제외한다."
> "ELBOW_00 값 자체가 wrist_hand_safety_status를 REVIEW/URGENT로 만들지 않는다."

**PASS.** `FOREARM/WRIST_HAND/DIFFUSE_OR_MULTIPLE/UNKNOWN` 4개 값 노출,
`ELBOW`만 제외 — Opus v0.1 W1 Option B와 정확히 일치. `ELBOW_00`은
게이트 조건에서만 쓰이고 `wrist_hand_safety_status` 계산 어디에도
값 자체가 등장하지 않는다(§5.1/§5.2에 `ELBOW_00` 참조 없음).

---

## 2. W2-1 — Uncontrolled bleeding / severe open wound

> §5.1 URGENT_REVIEW 항목 2: `UNCONTROLLED_HEAVY_BLEEDING`,
> `SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE`가 다른 3개 항목과 함께 "concrete
> positive 중 하나라도 있으면 단독으로 URGENT_REVIEW"
> §3 WH_02: "bleeding/open-wound 옵션을 다른 증상과 AND로 묶지 않는다."

**PASS.** 두 옵션 모두 standalone URGENT trigger로 명시되어 있고,
AND 조건 없음이 §3/§5.1 두 곳에서 일치한다.

---

## 3. W3 — Occult scaphoid/carpal fracture + X-ray context

> §3 WH_04: `YES → REVIEW_REQUIRED + fracture_imaging_consider=true`
> §3 WH_04A: "순수 context only. 어떤 답도 WH_03/WH_04에서 발생한 REVIEW
> 또는 fracture flag를 끄지 못한다." `required: false`

**PASS.** WH_04A는 WH_03/WH_04의 escalation 경로에 어떤 조건절로도
등장하지 않는다(§5.2, §6 어디에도 `WH_04A`가 게이팅 조건으로 언급되지
않음) — 순수 optional context라는 설계가 실제로 지켜졌다.

---

## 4. W4 — Laceration + tendon-function loss

> §3 WH_06A: `YES → REVIEW_REQUIRED + expedited_referral_consider=true + tendon_injury_assessment_required=true`
> §6 tendon_injury_assessment_required: `WH_06A == YES`
> §6 expedited_referral_consider: `WH_06A == YES` (첫 번째 OR 절)

**PASS.** 세 곳(§3/§5.2/§6) 모두 일치.

---

## 5. W5 — Bite wound standalone REVIEW

> §3 WH_06: "`HUMAN_OR_ANIMAL_BITE`는 감염 징후가 아직 없어도
> **독립적으로** `REVIEW_REQUIRED + infection_assessment_required=true`."
> §5.2: `WH_06 HUMAN_OR_ANIMAL_BITE`가 WH_07(감염 게이트)과 별개의
> 독립 bullet으로 존재.
> §6 infection_assessment_required 첫 번째 OR 절: `WH_06 contains HUMAN_OR_ANIMAL_BITE`

**PASS.** WH_06(교상 exposure)과 WH_07(감염 징후 게이트)이 서로 다른
질문이고, bite 트리거가 WH_07의 어떤 값과도 AND로 묶이지 않는다 —
감염 징후 동반을 요구하지 않는다.

---

## 6. W5/W8 — Infection OR semantics

> §3 WH_07: "이 값은 `systemic illness OR rapidly spreading`을 하나의
> opaque enum으로 보존한다. 둘을 분해해 AND 조건으로 구현 금지."

**PASS.** `SYSTEMIC_OR_RAPIDLY_SPREADING`은 단일 enum 값이며, 이후
구현 단계에서 두 조건으로 분해해 AND로 묶는 것을 명시적으로 금지하는
문구가 존재한다 — ELBOW_08이 실제 코드에서 검증한 것과 동일한 원칙을
설계 문서 단계에서 이미 고정했다.

---

## 7. WH_07A — Flexor-sheath follow-up

> §5.1 URGENT_REVIEW 항목 4: "WH_07A가 shown이고 concrete positive
> 중 하나라도 있음" — WH_07의 값과 무관하게 독립 조건.
> "WH_07A는 broad infection gate의 보조 설명이 아니라 독립 urgent
> trigger다. Kanavel 점수화는 하지 않는다."
> §3 WH_07A: "Kanavel sign 개수/점수/확률을 계산하지 않는다."

**PASS.** WH_07A concrete positive 하나만으로 독립 URGENT다 — §5.1
항목 3(WH_07)과 항목 4(WH_07A)가 분리된 별개 OR 조건으로 존재하므로
WH_07=NONE이어도 WH_06 wound/bite 경로로 WH_07A가 노출되고 양성이면
URGENT가 성립한다(§3 WH_07A 자체 설명과 일치). Kanavel scoring 금지
문구가 §3/§5.1 두 곳에 명시.

---

## 8. W6 — Median/ulnar neuropathy calibration

> §3 WH_08A: "WH_08 concrete sensory positive + WH_08A `[NONE]` →
> stable sensory-only; 이 경로만으로 REVIEW 금지, phenotype CONSIDER만."
> "WH_08 concrete sensory positive + WH_08A concrete positive → REVIEW_REQUIRED + neuro_assessment_required=true + expedited_referral_consider=true."
> "WH_08 concrete sensory positive + WH_08A UNKNOWN/missing/malformed/empty → 동일하게 REVIEW_REQUIRED + neuro_assessment_required=true + expedited_referral_consider=true."
> §5.3 CLEAR 예시: `WH_08 = MEDIAN_DISTRIBUTION + WH_08A = [NONE]`,
> `WH_08 = ULNAR_DISTRIBUTION + WH_08A = [NONE]`

**PASS.** stable-sensory-only carve-out과 fail-closed 확대 경로
(concrete/UNKNOWN/missing/malformed/empty 전부 포함) 모두 §3/§5.2/§6
세 곳에서 정확히 일치한다 — ELBOW_09/09A 패턴을 문자 그대로 계승했다.
median/ulnar 모두 동일 threshold를 공유하며(WH_08의 값이 어느 쪽이든
WH_08A 규칙은 동일하게 적용) 별도 threshold 분기가 없다.

**단, §6 flag 정의 한 곳에서 사소한 표기 누락을 발견했다 — 아래
FINDING 참조 (W6 자체의 임상 threshold 문제는 아니며, W8/감염
섹션의 flag 목록 표기 문제다).**

---

## 9. W7 — Mechanical lock distinction

> §3 WH_11: "`YES → TRIGGER_FINGER_PATTERN CONSIDER only`. 자동
> REVIEW/expedited 금지."
> §3 WH_05: "`YES → REVIEW_REQUIRED`... `YES`만으로 blanket expedited
> flag를 만들지 않는다."
> §6 expedited_referral_consider: "`WH_05 == YES` 일반 fixed block만으로
> 자동 expedited 금지."

**PASS.** 일반 trigger/catching(WH_11)은 phenotype only로 확정,
외상 후 fixed block(WH_05)은 REVIEW이되 expedited flag 목록(§6)에
`WH_05`가 아예 등장하지 않아 blanket expedited 규칙이 실제로
존재하지 않음을 세 곳(§3 WH_05, §3 WH_11, §6) 모두에서 확인했다.

---

## 10. W10 — Fail-closed semantics

**PASS.** 모든 protected 질문(WH_01, WH_02, WH_03, WH_04, WH_05,
WH_06, WH_06A, WH_07, WH_07A, WH_08, WH_08A)에 대해 UNKNOWN/missing/
malformed/empty/invalid-combination이 §3 개별 semantics와 §5.2
REVIEW_REQUIRED 목록에 각각 명시되어 있고, 어느 조합도 CLEAR로
이어지는 경로가 없다. §5.3은 "CLEAR은 모든 protected safety가
**명시적으로 negative**일 때만 가능하다"고 정의해 missing 상태가
CLEAR로 이어질 수 있는 여지를 구조적으로 차단한다.

---

## 11. Cardiac screen

> §3 WH_13: "별도 wrist/hand cardiac screen 추가하지 않는다. Core
> global chest/breathing safety passthrough만 유지한다."

**PASS.** 신규 cardiac 질문이 문서 어디에도 없고, `core_safety_already_urgent`가
§5.1 URGENT_REVIEW 목록의 1번 항목으로 유지되어 Core `SAFETY_01`
passthrough가 계속 독립적으로 작동한다.

---

## 12. Objective-data / diagnosis 자동생성 금지

> §7: "Tablet response만으로 definitive diagnosis를 생성하지 않는다."
> §8: Finkelstein/Tinel/Phalen/Kanavel 자가확진, tendon integrity
> 자동판정, 객관적 motor grade 자동생성, pulse/perfusion objective
> confirmation 전부 명시적으로 금지 목록에 포함.
> §10: "patient response만으로 `O | 객관적 소견` 생성" 금지, "`O`는
> clinician-confirmed objective data만 사용한다."

**PASS.** Evidence Matrix §8/§13이 요구한 모든 금지 항목이 Tablet
문서에 그대로 반영되어 있다.

---

## 13. 기존 CLOSED/FROZEN 모듈 영향

**PASS.** `git diff --stat 3c9aa1e..45eb0e6`는 `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.md`
1개 파일 추가만 보여준다(871줄 신규 문서, 다른 파일 변경 없음).
LBP/NECK/SHOULDER/KNEE/ELBOW의 threshold, 질문, 코드는 이 문서
작성 과정에서 전혀 건드리지 않았다. 기존 `ELBOW_00`/
`arm_hand_region_discriminator`/`IS_PRIMARY_ELBOW_SAFETY`의 정의도
재사용만 했을 뿐 변경을 요구하지 않는다.

---

## FINDING — §6 infection_assessment_required의 WH_07A 조건에서 `/empty` 누락

**현재 문제**: §6 `infection_assessment_required`의 네 번째 OR 절은
"`WH_07A concrete positive/UNKNOWN/missing/malformed when shown`"으로
적혀 있어 `empty`(빈 multi-select) 상태가 빠져 있다. 그러나 같은
WH_07A에 대해 §3 자체 semantics("UNKNOWN/missing/malformed/empty/invalid
combination when shown → 최소 REVIEW **+ infection assessment
consideration**")와 §5.2 REVIEW_REQUIRED 목록("WH_07A shown +
UNKNOWN/missing/malformed/**empty**/invalid combination")은 모두
`empty`를 포함한다. WH_02/WH_06 등 이 문서의 다른 모든 fail-closed
목록은 일관되게 "UNKNOWN/missing/malformed/empty/invalid combination"
5단어 세트를 쓰는데, §6의 이 한 줄만 `empty`가 빠져 있다.

**Safety impact**: WH_07A가 노출된 상태에서 환자가 multi-select에서
아무것도 선택하지 않고 빈 값으로 넘어가는 경우, §5.2 규칙에 따라
`wrist_hand_safety_status`는 정확히 REVIEW_REQUIRED로 fail-closed
되지만, 이 문구를 문자 그대로 구현하면 `infection_assessment_required`
플래그만 false로 남을 수 있다. 이는 안전 tier 자체를 무너뜨리지는
않지만(§2가 명시하듯 flag는 추가 safety tier가 아니다), 원장이
REVIEW_REQUIRED 손목/손 감염 의심 환자를 볼 때 감염 관련 clinician
exam 후속 조치를 권고하는 flag가 조용히 빠지는 것은 ELBOW_V1의
v0.1.1에서 고친 것과 정확히 같은 유형의 문서 내부 drift다 — 방치하면
Fable/Sonnet 구현 단계에서 문서를 문자 그대로 포팅했을 때 그대로
코드에 재현된다.

**최소 수정안**: §6 `infection_assessment_required`의 해당 bullet을
"`WH_07A concrete positive/UNKNOWN/missing/malformed/empty when
shown`"으로 한 단어(`/empty`) 추가 수정한다. 다른 문항·다른 flag·다른
threshold는 변경하지 않는다.

---

## 종합 판정

체크리스트 1–13 중 12개 항목은 원문 대조 결과 Opus v0.1의 W1–W10
결정을 정확히 반영하고 있음을 확인했다. 위 FINDING 1건은 새로운
임상 쟁점이 아니라 §6 한 줄의 표기 누락이며, 최소 수정(단어 하나
추가)으로 닫힌다.

```text
CLINICAL DECISION REQUIRED
```

다음 단계: `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.1.md`를
만들어 위 FINDING의 `/empty` 수정 한 곳만 반영하고(ELBOW_V1의
v0.1→v0.1.1 패턴과 동일), 이어지는 Opus final verification에서 이
한 가지만 확인해 CLOSED로 닫는다. Fable 통합/TypeScript/UI/테스트
구현은 계속 blocked 상태를 유지한다.
