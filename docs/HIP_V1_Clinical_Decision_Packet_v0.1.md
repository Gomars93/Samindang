# HIP_V1 — Clinical Decision Packet v0.1

작성일: 2026-08-25  
근거 SSOT: `docs/HIP_V1_Evidence_Matrix_v0.1_HANDOFF.md`  
상태: **CLINICAL DECISION REQUIRED**

> 목적: HIP_V1 Evidence Matrix의 새 임상 threshold H1–H8만 압축해 검수한다. 기존 LBP_V1은 CLOSED/FROZEN이며 이 문서에서 재검토하지 않는다. Production 구현은 H1–H8이 CLOSED되기 전까지 금지한다.

---

## H1. Shared routing / LBP overlap

**질문**  
현재 `PAIN_01 === low_back_pelvis`에서 기존 LBP_V1 protected safety를 항상 유지하면서 `HIP_00`으로 HIP-specific safety를 추가 노출할 것인가?

제안 `HIP_00`:

- `LOW_BACK_DOMINANT`
- `BUTTOCK_PELVIS_DOMINANT`
- `HIP_GROIN_DOMINANT`
- `SIMILAR_OR_MULTIPLE`
- `UNKNOWN`

HIP protected safety 후보 노출:

- BUTTOCK_PELVIS_DOMINANT
- HIP_GROIN_DOMINANT
- SIMILAR_OR_MULTIPLE
- UNKNOWN

LOW_BACK_DOMINANT에서는 HIP-specific protected safety 생략.

**추천: YES.**

핵심 불변조건:

- `IS_PRIMARY_LBP` 수정 금지
- HIP_GROIN이어도 existing LBP safety를 숨기지 않음
- `HIP_00` 자체는 routing/tagging 전용이고 safety tier를 직접 만들지 않음

---

## H2. Acute traumatic major neurologic deficit

**질문**  
급성 hip/pelvic trauma 맥락에서 새로 생긴 뚜렷한 distal sensory/motor loss를 standalone `URGENT_REVIEW`로 둘 것인가?

**추천: YES.**

- acute trauma + major new distal sensory/motor loss → URGENT
- non-traumatic progressive deficit → REVIEW + expedited
- patient report는 객관적 neurologic exam이 아님

---

## H3. Suspected acute hip fracture tier

**질문**  
외상 후 새 hip/groin pain + 체중부하/보행이 현저히 어려운 경우를 자동 URGENT가 아니라 아래로 둘 것인가?

- `REVIEW_REQUIRED`
- `fracture_imaging_consider = true`
- `expedited_referral_consider = true`

그리고 gross deformity / unreduced joint / acute NV compromise / severe open injury가 있을 때만 `URGENT_REVIEW`로 올릴 것인가?

**추천: YES.**

이유:

- serious fracture concern은 신속 평가가 필요하지만 patient history만으로 limb-threatening 상태를 확정할 수 없음
- 기존 KNEE_V1 hip/groin fracture concern tier와 일관성 유지
- 실제 UI에서는 즉시 외부 영상/평가 고려를 명확히 보여줄 수 있음

---

## H4. Prior X-ray context

**질문**  
환자가 “X-ray는 정상이라고 들었다” 등의 prior imaging context를 tablet에서 수집하되 safety 판단에는 사용하지 않을 것인가?

**추천: YES.**

- optional patient-reported context only
- normal X-ray 답변이 REVIEW를 낮추지 못함
- fracture_imaging_consider를 끄지 못함
- occult fracture concern을 배제하지 못함
- 영상 finding을 `O | 객관적 소견`으로 자동 생성 금지

ACR/NICE 모두 clinical suspicion이 지속되면 negative/indeterminate radiograph 후 MRI/CT가 필요할 수 있음을 지지한다.

---

## H5. Femoral neck stress-fracture screen

**질문**  
아래와 같은 compatible pattern을 HIP_GROIN/BUTTOCK_PELVIS/SIMILAR/UNKNOWN에서 **protected conditional safety**로 둘 것인가?

- atraumatic/insidious groin or deep hip pain
- recent repetitive load/running/jumping/march/load increase
- progressive weight-bearing pain or worsening walking tolerance

**추천: YES.**

결과 후보:

- `REVIEW_REQUIRED`
- `stress_fracture_assessment_required = true`
- `fracture_imaging_consider = true`

routine loading exercise는 concern이 해소될 때까지 lock.

이유:

- early radiographs can be normal
- missed femoral neck stress fracture는 displacement/nonunion/osteonecrosis 등 중대한 결과 가능

자동 진단 또는 tear/fracture morphology 판단은 금지.

---

## H6. Serious infection architecture

**질문**  
hip-specific infection screen에서 `SYSTEMIC_OR_RAPIDLY_WORSENING`을 하나의 opaque OR enum으로 두고 concrete positive이면:

- `URGENT_REVIEW`
- `infection_assessment_required = true`

로 할 것인가?

**추천: YES.**

- systemic illness **OR** rapidly worsening severe hip/groin pain 중 하나가 concrete positive면 urgent route
- 둘을 AND로 구현 금지
- fever absence가 septic arthritis를 rule out하지 않음
- diagnosis는 clinician-directed exam/labs/imaging/aspiration 영역

---

## H7. LBP zero-regression boundary

**질문**  
`HIP_00 === HIP_GROIN_DOMINANT`이어도 기존 LBP protected safety를 계속 노출/계산할 것인가?

**추천: YES / mandatory.**

이 결정은 새로운 clinical threshold라기보다 기존 FROZEN architecture 보호 규칙이다.

금지:

- HIP route 때문에 LBP_01~LBP safety screens 숨김
- `IS_PRIMARY_LBP` 조건 변경
- LBP safety tier/flags 수정
- HIP safety를 LBP logic 내부에 삽입

권장 구조:

- shared `low_back_pelvis` population
- independent LBP safety engine
- independent HIP safety engine
- DoctorView에서는 필요 시 두 safety panel 동시 표시

---

## H8. Strict fail-closed runtime contract

**질문**  
WRIST_HAND 독립검수에서 발견된 malformed runtime input fail-open 문제를 HIP_V1 최초 구현부터 방지할 것인가?

**추천: YES.**

Protected input contract:

- `UNKNOWN != NO`
- missing != negative
- malformed != valid negative
- empty multi-select != `[NONE]`
- `[NONE, positive]` 또는 `[UNKNOWN, positive]` 혼합 = invalid
- protected invalid → 최소 `REVIEW_REQUIRED`
- conditional protected question은 실제 shown일 때만 missing/empty escalation
- optional phenotype missing은 safety escalation 금지

Implementation requirement after closure:

- single-choice runtime allowlist validation
- multi-choice allowlist + exclusivity validation
- malformed-input regression tests를 최초 test suite부터 포함

---

# Proposed closure

H1–H8을 모두 추천안대로 승인하면 임상설계는 다음 단계로 진행 가능하다.

`PASS / CLINICAL DECISIONS CLOSED`

그 다음 순서:

Tablet Question Set → Opus final verification → Fable integration plan → Sonnet implementation → full regression → PASS/FROZEN.

현재는 **CLINICAL DECISION REQUIRED**이며 production code 구현은 금지한다.
