# ELBOW_V1 — Tablet Question Set v0.1

작성일: 2026-08-25
상태: **DRAFT — Opus v0.1 decisions incorporated / Opus re-review required before CLOSED**
대상: 삼인당 Clinical OS — MSK Elbow module

상위 근거:
- `ELBOW_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `ELBOW_V1_Opus_Clinical_Review_v0.1.md`

이 문서는 Opus v0.1 검수의 E1–E10을 Tablet 문항과 safety semantics로 옮긴 초안이다. **아직 CLINICAL DECISIONS CLOSED가 아니다.** 다음 단계는 Opus 재검수다.

---

# 0. Model Orchestration

## Opus — 임상·근거 재검수 (다음 단계)
이번 문서에 대한 책임:
- E1/E2/E5/E8/E9 결정이 실제 문항과 safety engine에 정확히 반영됐는지 확인
- 신규 fail-open 경로 확인 (특히 E5의 sensory-only de-escalation이 진짜 진행성 소견을 놓치지 않는지)
- UNKNOWN / missing / malformed 처리 확인
- E11(cardiac-associated screen)이 double-barreled 함정을 만들지 않았는지 확인
- 결과: `PASS / CLINICAL DECISIONS CLOSED` 또는 `CLINICAL DECISION REQUIRED`

## Fable — 통합 리드 (Opus PASS 이후에만)
- 실제 repo audit
- `PAIN_01 === 'arm_hand'` + region discriminator routing의 실제 필드/screen_id 배치
- Core `SAFETY_01`과 ELBOW targeted safety의 중복 최소화
- LBP/NECK/SHOULDER/KNEE 회귀 0

## Sonnet — 구현 워커 (Fable 이후에만)
- TypeScript/UI/adapter/tests
- CLOSED semantics literal port
- safety threshold 독자 변경 금지

```text
Evidence Matrix
→ Opus review v0.1 (E1-E10 결정)
→ Tablet Question Set v0.1 (이 문서)
→ Opus re-review
→ Clinical decisions CLOSED
→ Fable integration
→ Sonnet implementation
→ full regression
→ ELBOW_V1: PASS / FROZEN
```

**이번 세션은 이 문서 작성까지만 수행한다. Fable 통합계획·TypeScript/UI/테스트 구현·production code 수정은 하지 않았다.**

---

# 1. Entry / Routing Contract (E9 반영)

현재 `PAIN_01`에는 `elbow` 전용 값이 없다 — 팔꿈치는 `arm_hand` 안에 포함된다(Evidence Matrix §1). 따라서 ELBOW는 KNEE처럼 `PAIN_01` 단일 값으로 바로 게이트할 수 없다.

```text
IS_PRIMARY_ARM_HAND =
  primary concern == pain
  AND PAIN_01 == 'arm_hand'
```

## ELBOW_00 — region discriminator (신규, 공통 상위 질문)

**variable:** `arm_hand_region_discriminator`
**required:** true / **show_when:** `IS_PRIMARY_ARM_HAND` (무조건 노출)

> 지금 가장 불편한 부위는 어디에 가장 가깝나요?

- `ELBOW` — 팔꿈치
- `FOREARM` — 팔꿈치와 손목 사이(전완)
- `WRIST_HAND` — 손목이나 손
- `DIFFUSE_OR_MULTIPLE` — 여러 부위 또는 전체적으로
- `UNKNOWN` — 잘 모르겠어요

## ELBOW protected-safety 노출 게이트 (E9 결정)

```text
IS_PRIMARY_ELBOW_SAFETY =
  IS_PRIMARY_ARM_HAND
  AND ELBOW_00 in [ELBOW, FOREARM, DIFFUSE_OR_MULTIPLE, UNKNOWN]
```

**`WRIST_HAND`만 제외한다.** 근거는 v0.1 검수 E9 — 원위 이두근/삼두근 파열의 멍·부종은 전완까지 퍼질 수 있고, radial tunnel/PIN 감별 자체가 "proximal lateral forearm pain"으로 정의되어 elbow 도메인과 겹치며, `UNKNOWN`은 이 세션 전체의 fail-closed 원칙상 노출을 줄이는 방향으로 쓰지 않는다.

**F1류 invariant:** `ELBOW_00`의 값은 protected safety 노출 여부(위 게이트)에만 쓰이고, safety status 계산 자체의 입력 필드로 들어가지 않는다 — 라우팅/태깅 필드가 safety tier를 직접 결정하지 않는다는 이 세션의 기존 원칙(SHOULDER F1, KNEE의 primary tag 분리)과 동일하다.

## Core reuse

기존 Core에서 이미 수집되는 정보는 다시 묻지 않는다.

재사용:
- `VISIT_03_SYMPTOM_DURATION` — 발병/지속기간
- `VISIT_04_SYMPTOM_IMPACT` — 일상 영향
- `PAIN_02` — 통증 양상
- `PAIN_04` — 방사/퍼짐
- `SAFETY_01` — 전역 응급 red flag

### protected-safety invariant

ELBOW safety 문항(ELBOW_01–11)은 phenotype 답변이나 구조가설에 의해 숨겨지지 않는다. 명시된 safety follow-up만 직전 safety 답변의 정해진 값(YES/UNKNOWN 등)에 조건부 표시할 수 있다. **안전 문항은 어느 것도 optional(required: false)로 만들지 않는다** — required: false는 §7의 순수 phenotype 문항에만 쓴다.

---

# 2. Safety Status / Flags

`elbow_safety_status`: `CLEAR / REVIEW_REQUIRED / URGENT_REVIEW`

별도 clinician-facing flags:
- `fracture_imaging_consider`
- `expedited_referral_consider`
- `neuro_assessment_required`
- `infection_assessment_required`

별도 flag는 4번째 safety status가 아니다. 여러 개가 동시에 true일 수 있다.

---

# 3. Protected Safety Questions

## ELBOW_01 — 최근 외상 또는 갑작스러운 강한 부하

**variable:** `elbow_recent_trauma_or_sudden_load`
**required:** true / **show_when:** `IS_PRIMARY_ELBOW_SAFETY`

> 최근 3개월 이내 넘어지거나 부딪히거나 팔꿈치가 크게 꺾이거나 비틀렸거나, 갑자기 강하게 힘을 준 뒤 증상이 시작되거나 뚜렷하게 심해졌나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES/UNKNOWN → ELBOW_03/04/05/15 표시
- UNKNOWN/missing → 최소 REVIEW_REQUIRED
- 외상 자체(YES)만으로는 REVIEW_REQUIRED가 아니다 — 아래 후속 문항이 실제 위험을 담당한다.

## ELBOW_02 — 현재 변형 / 신경혈관 응급 (E2)

**variable:** `elbow_deformity_neurovascular_screen`
**input:** multi_choice / **required:** true / **exclusive:** `['NONE','UNKNOWN']`
**show_when:** `IS_PRIMARY_ELBOW_SAFETY` (무조건 노출)

> 지금 팔꿈치나 팔에 다음 변화가 있나요?

- `GROSS_DEFORMITY_OR_STILL_OUT` — 팔꿈치 모양이 확연히 달라졌거나 빠진 채 제자리로 돌아오지 않은 느낌
- `COLD_PALE_BLUE_HAND` — 손이나 손목이 갑자기 매우 차갑거나 창백·푸르게 변함
- `MAJOR_NEW_DISTAL_NEURO_CHANGE` — 손·손가락 감각이나 힘이 갑자기 크게 떨어짐
- `NONE`
- `UNKNOWN`

Semantics:
- concrete positive → **URGENT_REVIEW**
- UNKNOWN/missing/malformed → REVIEW_REQUIRED
- hypothesis: `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`

## ELBOW_02A — 자연정복 팔꿈치 탈구 discriminator (E2 필수 추가)

**variable:** `elbow_spontaneously_reduced_dislocation_screen`
**required:** true / **show_when:** `IS_PRIMARY_ELBOW_SAFETY` (ELBOW_01과 무관하게 무조건 노출)

> 팔꿈치가 크게 틀어지거나 빠진 느낌이 들었다가 저절로 제자리로 돌아온 적이 있나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES → **URGENT_REVIEW**
- UNKNOWN/missing → REVIEW_REQUIRED
- 현재 변형/맥박이 정상이라는 이유로 YES를 무효화하지 않는다
- hypothesis: `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`

## ELBOW_03 — 외상 후 기능 소실 / 골절 평가 필요성 (E2)

**variable:** `elbow_post_trauma_functional_loss`
**required:** true / **show_when:** `ELBOW_01 in [YES, UNKNOWN]`

> 외상이나 갑작스러운 손상 이후, 그 팔로 짚거나 팔꿈치를 사용하기가 매우 어렵나요?

- `YES` → REVIEW_REQUIRED + `fracture_imaging_consider=true`
- `UNKNOWN` → REVIEW_REQUIRED
- `NO` → 다른 safety 결과에 따름

국소 골압통·영상 필요성 판단은 clinician-side. Tablet이 Ottawa-type rule을 자체 계산하지 않는다.

## ELBOW_04 — distal biceps rupture concern (E3)

**variable:** `elbow_distal_biceps_concern`
**required:** true / **show_when:** `ELBOW_01 in [YES, UNKNOWN]`

> 손상 이후, 팔꿈치를 굽히거나 손바닥을 위로 돌리는 힘이 갑자기 뚜렷하게 약해졌나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES/UNKNOWN → REVIEW_REQUIRED + `expedited_referral_consider=true`
- **URGENT_REVIEW로 자동 승격하지 않음**
- hypothesis: `MUST_EXCLUDE_DISTAL_BICEPS_RUPTURE`

원장 확인: hook test, resisted supination/flexion, tendon contour/gap.

## ELBOW_05 — distal triceps rupture concern (E4)

**variable:** `elbow_distal_triceps_concern`
**required:** true / **show_when:** `ELBOW_01 in [YES, UNKNOWN]`

> 손상 이후, 팔꿈치를 스스로 끝까지 펴는 힘이 갑자기 뚜렷하게 약해졌나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES/UNKNOWN → REVIEW_REQUIRED + `expedited_referral_consider=true`
- **URGENT_REVIEW로 자동 승격하지 않음**
- hypothesis: `MUST_EXCLUDE_DISTAL_TRICEPS_RUPTURE`

원장 확인: active extension against gravity/resistance, palpable gap, NV.

## ELBOW_06 — true mechanical lock screen (E6)

**variable:** `elbow_true_locked_rom_block`
**required:** true / **show_when:** `IS_PRIMARY_ELBOW_SAFETY` (무조건 노출)

> 단순히 아파서 펴거나 굽히기 어려운 것이 아니라, 팔꿈치가 실제로 걸린 느낌 때문에 끝까지 펴지지 않거나 굽혀지지 않나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES/UNKNOWN → REVIEW_REQUIRED + `expedited_referral_consider=true` (KNEE K4 정례와 대칭 확정)
- **URGENT_REVIEW로 자동 승격하지 않음**
- hypothesis: `INTRA_ARTICULAR_MECHANICAL_PATHOLOGY_CONSIDER`

원장 확인: true mechanical block vs pain-limited ROM, effusion, imaging escalation per ACR Chronic Elbow Pain.

---

# 4. Infection Safety — E1 반영

## ELBOW_07 — 관절 자체의 급성 패혈성 관절염 패턴

**variable:** `elbow_septic_joint_emergency_screen`
**required:** true / **show_when:** `IS_PRIMARY_ELBOW_SAFETY`

> 팔꿈치가 붉거나 뜨겁게 붓고 심하게 아프면서, 열·오한 또는 몸 상태가 매우 좋지 않은 증상이 함께 있나요?

- `YES` → **URGENT_REVIEW** + `infection_assessment_required=true`
- `UNKNOWN`/missing/malformed → REVIEW_REQUIRED + `infection_assessment_required=true`
- `NO` → 다른 safety 결과에 따름

hypothesis: `MUST_EXCLUDE_SEPTIC_ARTHRITIS`

## ELBOW_08 — 팔꿈치 뒤쪽 점액낭(olecranon bursa) screen

**variable:** `elbow_posterior_bursal_screen`
**input:** single_choice / **required:** true / **show_when:** `IS_PRIMARY_ELBOW_SAFETY`

> 팔꿈치 뒤쪽 뾰족한 뼈 부위(점액낭)가 붓거나 빨갛게 변했다면, 다음 중 가장 가까운 것을 골라주세요.

- `NONE` — 해당 없음(붓거나 빨갛지 않음)
- `LOCALIZED_STABLE` — 그 부위만 국소적으로 붓거나 빨갛고, 열·오한 등 전신 증상은 없으며 빠르게 커지지도 않음
- `SYSTEMIC_OR_RAPIDLY_SPREADING` — 열·오한이나 몸 상태가 매우 안 좋음이 함께 있거나, 발적·부기가 몇 시간~하루 사이 눈에 띄게 커지고 있음
- `UNKNOWN`

Semantics:
- `SYSTEMIC_OR_RAPIDLY_SPREADING` → **URGENT_REVIEW** + `infection_assessment_required=true`
- `LOCALIZED_STABLE` → REVIEW_REQUIRED + `infection_assessment_required=true`
- `UNKNOWN`/missing/malformed → REVIEW_REQUIRED + `infection_assessment_required=true`
- `NONE` → 다른 safety 결과에 따름
- hypothesis: `MUST_EXCLUDE_SEPTIC_OLECRANON_BURSITIS` (관절강 감염 `MUST_EXCLUDE_SEPTIC_ARTHRITIS`와 별도 도메인 — 병태생리가 다르므로 같은 enum에 섞지 않는다)

**설계 노트:** `SYSTEMIC_OR_RAPIDLY_SPREADING` 옵션은 "전신증상 **또는** 빠른 확산" 두 조건을 OR로 묶은 것이지, 두 조건을 모두 요구하는 AND gate가 아니다 — 어느 한쪽만 있어도 이 옵션을 고르면 되므로 fail-safe 방향의 결합이며, SHOULDER SH05/KNEE C2가 경고한 double-barreled AND 함정과는 반대 방향이다.

---

# 5. Ulnar Neuropathy — E5 반영 (양방향 결정)

## ELBOW_09 — 척골신경 감각 증상 gate

**variable:** `elbow_ulnar_sensory_screen`
**required:** true / **show_when:** `IS_PRIMARY_ELBOW_SAFETY`

> 4번째(약지)·5번째(새끼) 손가락에 저림이나 감각이상이 있나요?

- `YES`
- `NO`
- `UNKNOWN`

## ELBOW_09A — 진행성 운동 증상 / 위축 follow-up

**variable:** `elbow_ulnar_motor_progression_screen`
**input:** multi_choice / **required:** true / **exclusive:** `['NONE','UNKNOWN']`
**show_when:** `ELBOW_09 in [YES, UNKNOWN]`

> 위 손저림과 함께 다음에 해당하는 것이 있나요?

- `NEW_OR_WORSENING_HAND_WEAKNESS` — 손의 힘이 새로 빠지거나 점점 심해짐(물건을 자주 떨어뜨리는 것 포함)
- `VISIBLE_MUSCLE_WASTING` — 손의 근육이 눈에 띄게 마르거나 홀쭉해짐
- `NONE`
- `UNKNOWN`

## Semantics (E5 핵심 결정 — 양방향)

- `ELBOW_09 = UNKNOWN` 또는 missing → **REVIEW_REQUIRED** (증상 유무 자체가 불확실하면 fail-closed, ELBOW_09A는 그래도 표시해 안전망을 유지한다)
- `ELBOW_09 = YES` + `ELBOW_09A` concrete positive(둘 중 하나 이상) → **REVIEW_REQUIRED + `neuro_assessment_required=true` + `expedited_referral_consider=true`**
- `ELBOW_09 = YES` + `ELBOW_09A` UNKNOWN/missing/malformed → REVIEW_REQUIRED + `neuro_assessment_required=true` + `expedited_referral_consider=true` (진행 여부가 불확실하면 배제 불가로 fail-closed)
- **`ELBOW_09 = YES` + `ELBOW_09A = [NONE]`(명시적 진행/위축 없음) → 이 경로만으로는 REVIEW_REQUIRED를 만들지 않는다. `ULNAR_NEUROPATHY_AT_ELBOW_CONSIDER` phenotype으로만 기록한다.** (KNEE K5의 de-escalation과 같은 방향 — 완전히 답변된 저위험 소견을 REVIEW로 강제하지 않는다)
- `ELBOW_09 = NO` → 두 문항 모두 CLEAR 기여 없음

hypothesis: `ULNAR_NEUROPATHY_AT_ELBOW_CONSIDER`(안정형) / `MUST_EXCLUDE_PROGRESSIVE_ULNAR_NEUROPATHY`(진행형)

---

# 6. Referred / Non-mechanical Safety — E8 반영

## ELBOW_10 — 경추/근위부 연관통 screen

**variable:** `elbow_referred_proximal_screen`
**input:** multi_choice / **required:** true / **exclusive:** `['NONE','UNKNOWN']`
**show_when:** `IS_PRIMARY_ELBOW_SAFETY`

> 이 팔꿈치 증상과 함께 목·어깨나 팔 전체에 새로 생긴 변화가 있나요?

- `NEW_NECK_SHOULDER_SYMPTOM` — 목이나 어깨에 새로 생긴 통증·뻣뻣함이 함께 있음
- `MULTI_LEVEL_OR_BILATERAL_SENSORY_CHANGE` — 양팔 또는 여러 부위에 동시에 저림·감각이상이 있음
- `NONE`
- `UNKNOWN`

Semantics:
- any concrete positive → REVIEW_REQUIRED
- UNKNOWN/missing/malformed → REVIEW_REQUIRED
- `NONE` → 다른 safety 결과에 따름
- hypothesis: `REFERRED_OR_PROXIMAL_SOURCE_CONSIDER`

Architecture: NECK_QUESTIONS(canonical)를 재사용하지 않는다 — `arm_hand`와 `neck_shoulder`는 공유 population이 아니다(KNEE K9와 같은 이유). ELBOW 독립 최소 screen을 유지한다.

## ELBOW_11 — 심장 연관통 cross-check (E8 신규 필수 도메인)

**variable:** `elbow_cardiac_associated_screen`
**input:** multi_choice / **required:** true / **exclusive:** `['NONE','UNKNOWN']`
**show_when:** `IS_PRIMARY_ELBOW_SAFETY AND Core general_red not already urgent`

> 이 팔꿈치·팔 증상과 함께 최근 다음 증상이 있었나요?

- `CHEST_PAIN_OR_TIGHTNESS` — 가슴 통증이나 답답함
- `SHORTNESS_OF_BREATH` — 숨이 차거나 숨쉬기 어려움
- `COLD_SWEAT` — 식은땀
- `NAUSEA` — 메스꺼움
- `NONE`
- `UNKNOWN`

Semantics:
- any concrete positive → **URGENT_REVIEW**
- UNKNOWN/missing/malformed → REVIEW_REQUIRED
- `NONE` → 다른 safety 결과에 따름
- hypothesis: `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`(신규 도메인 — 근골격계 연관통 `REFERRED_OR_PROXIMAL_SOURCE_CONSIDER`와 severity가 다르므로 분리)

### 금지 (E8 명시 요구사항)
"움직임과 무관할 때만", "휴식 중일 때만" 같은 별도 AND 전제를 추가하지 않는다. 심장 동반증상 존재 여부 하나만 본다(SHOULDER SH05의 F2 실수, KNEE C2 경고를 반복하지 않는다). Core `SAFETY_01.chest_breathing`이 이미 urgent면 중복 질문 생략 가능 — `core_safety_already_urgent`가 이미 elbow_safety_status를 URGENT로 만들므로 이 생략은 fail-open이 아니다.

---

# 7. Phenotype Questions

Safety 이후 아래 정보는 diagnosis가 아니라 hypothesis support로만 사용한다. **모두 required: false.**

## ELBOW_12 — 통증 위치
`elbow_pain_location_pattern`: LATERAL / MEDIAL / POSTERIOR / ANTERIOR / DIFFUSE / UNKNOWN

## ELBOW_13 — 측성
`elbow_primary_side`: LEFT / RIGHT / BILATERAL / UNKNOWN

## ELBOW_14 — 부하/활동 패턴

**input:** multi_choice / **exclusive:** `['NONE','UNKNOWN']`

> 어떤 동작에서 팔꿈치가 더 불편한가요?

- `GRIPPING` — 물건을 쥘 때
- `LIFTING_CARRYING` — 들거나 나를 때
- `PUSHING` — 밀 때
- `PULLING` — 당길 때
- `ROTATION` — 손목을 돌릴 때(회내/회외)
- `NONE`
- `UNKNOWN`

사용:
- lateral pain + gripping/lifting/rotation → `LATERAL_ELBOW_TENDINOPATHY_HIGHER_SUPPORT` 후보
- medial pain + gripping/pulling/rotation → `MEDIAL_FLEXOR_PRONATOR_PATTERN_CONSIDER` 후보
- 단독 문항으로 diagnosis 확정 금지

## ELBOW_15 — 외상 후 빠른 부종

**show_when:** `ELBOW_01 in [YES, UNKNOWN]`

> 손상 뒤 비교적 빠르게 팔꿈치가 눈에 띄게 부었나요?

YES/NO/UNKNOWN. YES는 significant soft-tissue/intra-articular injury support 상승 가능하나 단독으로 구조를 특정하지 않는다.

---

# 8. Clinician Objective Exam — Tablet에서 생성하지 않음

**환자 답변만으로 O(객관적 소견)를 생성하지 않는다.** 아래는 원장이 실제 시행했을 때만 기록되는 후보 목록이다.

Base:
- elbow AROM/PROM flexion-extension
- forearm pronation/supination
- target function reproduction
- gross swelling / location
- grip / functional load

Safety-selective:
- fracture/dislocation/NV: deformity, bony tenderness, distal pulse/perfusion, median/ulnar/radial motor-sensory, radiograph indication
- distal biceps: hook test, resisted supination/flexion, tendon contour/gap
- distal triceps: active extension against gravity/resistance, extensor lag/palpable defect
- mechanical lock: true mechanical block vs pain-limited ROM, effusion, imaging escalation per ACR
- cubital tunnel: ulnar sensory distribution, intrinsic hand strength/coordination, Tinel/provocation as adjunct only, cervical differential
- lateral elbow: common extensor origin palpation, resisted wrist extension/grip, cervical/radial nerve differential
- medial elbow: flexor-pronator loading, UCL assessment if relevant, ulnar nerve screen
- radial tunnel/PIN: resisted supination/middle-finger extension in context, radial/PIN motor exam

금지: Cozen/Mill/Maudsley/Tinel 등 단일 특수검사로 확진, MRI tendinosis = 통증원인 확정, X-ray OA = severity 확정, tablet pattern = 수술 적응 확정.

---

# 9. Hypothesis Contract

MUST_EXCLUDE:
```text
MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY
MUST_EXCLUDE_SEPTIC_ARTHRITIS
MUST_EXCLUDE_SEPTIC_OLECRANON_BURSITIS
MUST_EXCLUDE_DISTAL_BICEPS_RUPTURE
MUST_EXCLUDE_DISTAL_TRICEPS_RUPTURE
MUST_EXCLUDE_PROGRESSIVE_ULNAR_NEUROPATHY
MUST_EXCLUDE_CARDIAC_REFERRED_PAIN
```

Supportive/differential phenotypes:
```text
LATERAL_ELBOW_TENDINOPATHY
MEDIAL_FLEXOR_PRONATOR_PATTERN
ULNAR_NEUROPATHY_AT_ELBOW
RADIAL_TUNNEL_OR_PIN
INTRA_ARTICULAR_MECHANICAL_PATHOLOGY
ELBOW_DEGENERATIVE_PATTERN
REFERRED_OR_PROXIMAL_SOURCE
```

상태는 기존 MSK 규격 유지: `HIGHER_SUPPORT / CONSIDER / LOWER_SUPPORT / MUST_EXCLUDE`.

금지 (E7/Evidence Matrix §6 그대로):
- Cozen/Mill/Maudsley 단일검사 = 확진
- Tinel positive = cubital tunnel 확진
- MRI tendinosis/tear = 통증 원인 확정
- X-ray OA = 통증 severity 확정
- Tablet pattern = 수술 적응 확정
- 진단명 대신 hypothesis/support 수준을 유지한다 — patient-facing 결과물에 확정 진단 문구를 쓰지 않는다.

---

# 10. Elbow Safety Engine v0.1

## URGENT_REVIEW
1. Core global safety already urgent
2. ELBOW_02 concrete positive
3. ELBOW_02A == YES
4. ELBOW_07 == YES
5. ELBOW_08 == SYSTEMIC_OR_RAPIDLY_SPREADING
6. ELBOW_11 any concrete positive

## REVIEW_REQUIRED
urgent가 아니면서:
- any required safety answer missing/malformed
- ELBOW_01 UNKNOWN/missing
- ELBOW_02 UNKNOWN/invalid
- ELBOW_02A UNKNOWN/invalid
- ELBOW_03 YES/UNKNOWN/invalid/missing when shown
- ELBOW_04 YES/UNKNOWN/invalid/missing when shown
- ELBOW_05 YES/UNKNOWN/invalid/missing when shown
- ELBOW_06 YES/UNKNOWN/invalid/missing
- ELBOW_07 UNKNOWN/invalid/missing
- ELBOW_08 LOCALIZED_STABLE / UNKNOWN/invalid/missing
- ELBOW_09 UNKNOWN/missing
- ELBOW_09 YES + ELBOW_09A concrete positive/UNKNOWN/invalid/missing when shown (ELBOW_09A == `[NONE]`은 **제외** — §5 핵심 결정)
- ELBOW_10 concrete positive/UNKNOWN/invalid/missing
- ELBOW_11 UNKNOWN/invalid/missing when shown

## CLEAR
모든 required safety source가 valid하고 URGENT/REVIEW 조건이 하나도 없을 때만.

## fail-closed (E10)
- missing != NO
- UNKNOWN != NO
- malformed != NONE
- empty multi-select != NONE
- NONE + positive = invalid
- UNKNOWN + positive = invalid
- invalid → 최소 REVIEW_REQUIRED
- **optional phenotype 문항(§7, ELBOW_12-15)의 missing은 safety status를 올리지 않는다** — protected safety(§3-6)와 명확히 분리된 계약이다.

---

# 11. Flags

`fracture_imaging_consider=true`:
- ELBOW_03 == YES

`expedited_referral_consider=true`:
- ELBOW_04 == YES 또는 UNKNOWN
- ELBOW_05 == YES 또는 UNKNOWN
- ELBOW_06 == YES 또는 UNKNOWN
- ELBOW_09 == YES + ELBOW_09A concrete positive

missing(순수 무응답)은 safety REVIEW를 만들지만 위 flag를 임의로 true로 만들지 않는다(ELBOW_04/05/06 자체 missing 시).

`neuro_assessment_required=true`:
- ELBOW_09 == YES + ELBOW_09A concrete positive(NEW_OR_WORSENING_HAND_WEAKNESS 또는 VISIBLE_MUSCLE_WASTING)
- ELBOW_09 == YES + ELBOW_09A UNKNOWN/invalid/missing (진행 여부 불확실 시에도 fail-closed로 true)

`infection_assessment_required=true`:
- ELBOW_07 != NO (YES/UNKNOWN/missing 포함)
- ELBOW_08 != NONE (LOCALIZED_STABLE/SYSTEMIC_OR_RAPIDLY_SPREADING/UNKNOWN/missing/malformed 포함)

---

# 12. Intervention / Exercise Lock

`elbow_safety_status != CLEAR`:
- routine exercise recommendation lock
- routine manual-treatment suggestion lock
- safety review 우선

`URGENT_REVIEW`:
- routine elbow pathway보다 직원/원장 즉시 확인 우선

`expedited_referral_consider`/`neuro_assessment_required`/`infection_assessment_required`는 URGENT로 자동 변환하지 않는다 — 각각 독립적인 clinician-facing 신호다.

---

# 13. Doctor View (mock)

```text
[팔꿈치 요약]

주된 쪽 {elbow_primary_side}
증상 부위 {elbow_pain_location_pattern}

Core
발병/경과 {VISIT_03_SYMPTOM_DURATION}
일상영향 {VISIT_04_SYMPTOM_IMPACT}
통증양상 {PAIN_02}
방사/퍼짐 {PAIN_04}

안전
질환 안전 {elbow_safety_status}
신속 의뢰 고려 {expedited_referral_consider}
골절/영상 평가 고려 {fracture_imaging_consider}
신경학적 평가 필요 {neuro_assessment_required}
감염 평가 필요 {infection_assessment_required}

외상/혈관 {trauma_summary} {spontaneous_reduction_summary} {neurovascular_summary}
건파열 {biceps_summary} {triceps_summary}
감염/점액낭 {septic_summary} {bursal_summary}
심장 연관통 {cardiac_summary}
척골신경 {ulnar_sensory_summary} {ulnar_motor_progression_summary}
연관통 {referred_summary}
기계적 증상 {mechanical_lock_summary}

현재 고려
- {hypothesis_1}
- {hypothesis_2}

권장 진찰
- AROM/PROM (굴곡-신전, 회내-회외)
- target function reproduction
- {conditional_exam_items}
```

---

# 14. Sigma external_note Mapping

삼인당 표준:
```text
C/C | 주호소
O/S | 발병 및 경과
S   | 주관적 소견
O   | 객관적 소견
A   | 평가
P   | 계획
```

Tablet 응답은 C/C, O/S, S에 활용할 수 있으나 **O는 원장이 실제 시행한 객관적 진찰만 기록**한다.

---

# 15. Exercise Contract

JOSPT 2022 Lateral Elbow CPG를 lateral elbow pain의 주된 framework로 사용한다. Medial/tendon pattern은 근거 수준이 낮으므로 lateral protocol을 그대로 복제하지 않고 `CONSIDER` 수준으로 progressive loading을 사용한다.

입력: target function + irritability + ROM + strength + load response + instability(해당 시) + movement control + patient goal + safety.

출력: **후보 2–3개 → 원장 승인/삭제/교체 → 최종 1–2개**.

후보 domain:
- wrist extensor loading
- grip capacity
- forearm pronation/supination control
- flexor-pronator progressive loading (medial, CONSIDER 수준)
- proximal/scapular contribution (해당 시)
- work/sport-specific graded exposure

금지:
- diagnosis 하나만으로 운동 자동배정
- cubital tunnel에서 progressive weakness/atrophy가 있는데 exercise를 nerve assessment/referral보다 우선 제안
- 급성 rupture/fracture/infection에서 routine progression

---

# 16. Reassessment

모든 재진:
- Pain NRS
- Target Function 0–10

조건부:
- grip/load tolerance
- elbow ROM / pronation-supination
- swelling
- locking episodes
- ulnar sensory symptoms / hand weakness / dropping objects
- flexion-supination strength (biceps concern 이력 시)
- extension strength (triceps concern 이력 시)

Response: `RESPONDING / PARTIAL_RESPONSE / NON_RESPONSE / DETERIORATION / DISCHARGE`.
`DETERIORATION` → safety/diagnosis/referral reassessment.

---

# 17. Question Burden — deterministic design check

기존 Core 제외 ELBOW 신규 screens:
- 공통: ELBOW_00 = **1**
- base(무조건 노출): ELBOW_01,02,02A,06,07,08,09,10,11,12,13,14 = **12**
- trauma YES/UNKNOWN: ELBOW_03,04,05,15 = +4
- ulnar sensory YES/UNKNOWN: ELBOW_09A = +1
- maximum branch = **18**

18개는 모든 safety branch가 동시에 열리는 고위험 경로다(KNEE_V1과 동일 규모). Safety는 fatigue 때문에 suppress하지 않는다 — 이 세션에서 LBP/NECK/SHOULDER/KNEE 전부 채택한 원칙을 그대로 따른다. 실제 P50/P90 시간은 pilot telemetry 전까지 확정하지 않는다.

문항 형식 원칙: 한 화면 한 개념, 가능한 tap 중심(single_choice/multi_choice 우선, 자유서술 없음), 모든 required 문항에 "잘 모르겠어요" 제공.

---

# 18. Opus Re-review Questions

1. E1: ELBOW_08의 `SYSTEMIC_OR_RAPIDLY_SPREADING` 단일 옵션이 systemic illness와 rapid spreading 두 urgent 조건을 정확히 포괄하는가? 이 결합이 AND gate가 아니라 OR라는 설계 노트가 충분히 명확한가?
2. E2: ELBOW_02A의 무조건 노출이 자연정복 탈구 fail-open을 막는가? YES→URGENT가 정확한가?
3. E5: ELBOW_09/09A의 combined-condition이 sensory-only stable de-escalation(§5 핵심 결정)과 progressive-motor escalation을 동시에 올바르게 구현했는가? ELBOW_09 UNKNOWN이 09A 값과 무관하게 REVIEW를 강제하는 것이 맞는가?
4. E6: ELBOW_06(true mechanical lock)의 REVIEW+expedited가 KNEE K4 정례와 정확히 대칭인가?
5. E8: ELBOW_11에 움직임/자세 AND gate가 없는가? `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`을 `REFERRED_OR_PROXIMAL_SOURCE_CONSIDER`와 분리한 것이 적절한가?
6. E9: `IS_PRIMARY_ELBOW_SAFETY`가 ELBOW/FOREARM/DIFFUSE_OR_MULTIPLE/UNKNOWN에서 노출되고 WRIST_HAND에서만 제외되는 것이 정확히 구현됐는가? `ELBOW_00`이 safety 계산 자체의 입력이 아니라 노출 게이트로만 쓰이는가?
7. UNKNOWN/missing/malformed가 CLEAR를 만들 수 있는 새 경로가 없는가?
8. 신규 safety content와 phenotype 문항 부담(최대 18개 branch)이 허용 가능한가?
9. LBP/NECK/SHOULDER/KNEE의 기존 CLOSED 결정을 재해석하거나 수정한 곳이 없는가?

출력:
- `PASS / CLINICAL DECISIONS CLOSED`
또는
- `CLINICAL DECISION REQUIRED`

**PASS 전 ELBOW code 구현 금지.**

---

# 19. Current Gate

```text
LBP_V1       PASS / FROZEN
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN
KNEE_V1      PASS / FROZEN

ELBOW Evidence Matrix v0.1     COMPLETE
Opus clinical review v0.1      COMPLETE — CLINICAL DECISION REQUIRED
E1/E2/E5/E6/E8/E9 decisions    INCORPORATED
Tablet Question Set v0.1       COMPLETE
Clinical decisions             OPEN — Opus re-review required
Code implementation            NOT STARTED
```

다음 단일 과제:

> **Opus re-review of ELBOW_V1 Tablet Question Set v0.1**

이 문서는 CLINICAL DECISIONS CLOSED가 아니다. Fable 통합계획·TypeScript/UI/테스트 구현·production code 수정은 Opus 재검수 PASS 이후에만 진행한다.
