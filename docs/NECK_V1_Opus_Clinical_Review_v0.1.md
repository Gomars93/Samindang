# NECK_V1 Tablet v0.1 — Opus 임상·근거 검수

**검수 완료일**: 2026-08-25  
**검수자**: Opus  
**판정**: **CLINICAL DECISION REQUIRED**

---

## 판정 요약

문항 설계와 근거 인용의 전반적 수준은 높다. 특히 IFOMPT의 핵심 취지(positional vascular test로 clearance 만들지 않기), Spurling 단독 확진 금지, CFRT를 clinician-side로 남긴 판단은 모두 정확하다. **다만 fail-open이 발생하는 경로 3개와, 경추 모듈에서 반드시 있어야 할 lock 1개의 누락**이 확인되어 freeze 전 임상결정이 필요하다.

**6개 질문 중 PASS 3개, 조건부 3개** | **추가 cross-cutting 결함 4건** | **신규 문항 최대 3개(2개는 조건부)** | **피로 예산 내 수용 가능**

---

# Part 1 — 제출된 6개 질문 판정

## Q1. cord screen의 URGENT / REVIEW 구분

### 판정: **PASS** (단, 문항 stem에 결함)

**근거:**  
Fehlings 2017 DCM CPG의 중증도 계층과 부합. rapidly worsening limb weakness와 new bladder-bowel change를 URGENT로 올린 것은 비교적 후기·중증 소견이고 시간 의존적. hand clumsiness / gait change / bilateral-multilimb neuro는 초기 소견이며 서서히 진행하므로 응급이 아닌 timely referral이 정확함.

**구분 자체는 그대로 유지 권고.**

### 결함: N02 stem이 실질적 false-negative를 만든다

> **현재**: "최근 새로 생기거나 뚜렷하게 심해진 증상이 있나요?"

**문제점:**  
이미 확립되어 안정화된 DCM 환자(수년간 젓가락질이 서툴고 보행이 불안정하지만 최근 변화 없음)는 이 문항에 `NONE`을 선택하여 safety CLEAR 후보로 내려감. 이는 임상적으로 중요한 누락:
- (a) 확립된 DCM은 여전히 수술적 질환이고 지연이 회복률과 상관
- (b) 경추 도수치료·추나의 상대적 금기

### 최소 수정안 (D1)

1. **stem을 현재 상태 기준으로 변경**
   ```
   "다음 증상이 있나요? 최근 새로 생긴 것뿐 아니라, 
    이전부터 있었더라도 현재 있으면 모두 골라주세요."
   ```

2. **positive 시 조건부 1문항 추가** (`neck_cord_symptom_course`, 5s)
   - 옵션: 악화 중 / 그대로 / 호전 중 / 모르겠음
   - **악화 중 → URGENT_REVIEW로 상향**
   - 그대로 / 호전 / 모르겠음 → REVIEW_REQUIRED 유지

**효과:** tempo 정보가 stem에서 semantics로 이동하여, 확립된 DCM을 놓치지 않으면서 급속 진행은 오히려 더 정확히 잡음.

**비차단 note:** 다발 소견 동시 양성(clumsiness + gait + bilateral neuro)은 명백한 myelopathy 증후군이지만 단일 양성과 동일 등급. 임상적으로는 여전히 응급이 아닌 timely referral이 맞으므로 조합 규칙 신설은 권고하지 않음. Doctor View에서 양성 개수만 노출하면 충분.

---

## Q2. sudden severe pain + new neuro symptom → URGENT threshold

### 판정: **조건부 / 수정 필요**

**부족한 부분 2가지:**

### (a) UNKNOWN을 통한 fail-open — 문서의 invariant 위반

**문제:**  
§5 엔진에서:
```
URGENT_REVIEW if: ... sudden unusual severe pain == YES
                  AND vascular screen has any concrete positive
```

N03가 `UNKNOWN`이면 N04가 열리지만, N04에 구체적 양성이 있어도 URGENT가 아니라 REVIEW_REQUIRED에 머무름.

"갑자기 시작했는지 잘 모르겠다"고 답한 환자가 새로 생긴 복시·구음장애·편측 위약을 보고해도 urgent가 아님.

**이는 문서가 §5에 명시한 `UNKNOWN != NO` 원칙을 정면으로 위반.**

### (b) 시간 의존적 뇌졸중 증상이 onset 게이트 뒤에 갇혀 있음 (더 중대)

**문제:**  
N04는 `neck_sudden_unusual_severe_pain in [YES, UNKNOWN]`일 때만 표시됨. 따라서 **목 통증이 서서히 시작된 환자는 N04를 아예 보지 못함.**

그런데 N04 항목 중 다음은 **경부 통증의 onset 양상과 무관하게 그 자체로 시간 의존적 응급:**
- `NEW_ONE_SIDED_WEAKNESS_OR_NUMBNESS` — 급성 뇌졸중 (혈전용해 window)
- `NEW_SPEECH_OR_SWALLOWING_DIFFICULTY` — 뇌졸중
- `NEW_VISUAL_DISTURBANCE` (복시) — 후순환계
- `NEW_FACE_OR_EYELID_CHANGE` — Horner / 안면마비

**구조적 누락:** N02의 `BILATERAL_OR_MULTI_LIMB_NEURO`는 양측/다지이므로, **편측** 위약·감각이상 + 안면/언어 증상의 반신 마비 양상은 N02·N04 어디에도 걸리지 않음. 이는 정확히 IFOMPT가 상정하는 시나리오(경부통이 수일 선행한 뒤 후순환계 dissection이 뇌졸중으로 발현).

### (c) thunderclap headache 단독이 과소분류됨

**문제:**  
N03 stem이 **"목 통증이나 두통"**을 한 문항에 묶음:
- 갑작스러운 심한 **경부통** 단독 → 급성 사경/후관절, 응급 아님 (흔함)
- 갑작스러운 심한 **두통** (thunderclap, "인생 최악") → SAH까지 감별, 신경학적 진찰 정상이어도 당일 응급평가 대상

현행 규칙: N03 YES + N04 `[NONE]` → REVIEW_REQUIRED (응급 아님). 전형적 thunderclap headache가 응급으로 올라가지 않음.

### 최소 수정안 (D2)

**1. N04를 무조건 표시로 전환** (`show_when` 제거)
- 추가 10s이나 §2가 "safety 문항은 fatigue suppression 대상이 아니다"라고 이미 선언
- 설계 원칙과 일관된 조치

**2. N04 항목을 2계층으로 분리하고 URGENT를 N03에서 분리:**

| 계층 | 항목 | 규칙 |
|---|---|---|
| **Hard neuro** | one-sided weakness/numbness, speech/swallowing, visual disturbance, face/eyelid change | **N03 값과 무관하게 단독 URGENT_REVIEW** |
| **Soft** | severe dizziness/faintness, severe balance/coordination | N03 == YES/UNKNOWN 동반 시 URGENT, 단독이면 REVIEW_REQUIRED |

**효과:** (a) UNKNOWN fail-open 해소, (b) 편측 신경 증상 포착, (c) thunderclap과 경부통 구분.

---

## Q3. vascular screen 문구의 IFOMPT 정합성 / 5D3N 오용 회피

### 판정: **PASS** (근거 서술 1건 정정 필요)

**5D/3N 오용은 정확히 회피했다.**

§4 rule 문단:
> "이 문항은 '5D/3N 검사'가 아니며, 단일 체크 하나로 혈관질환을 진단하지 않는다. 경추 positional vascular test로 safety CLEAR를 만들지 않는다."

IFOMPT 2020의 핵심 메시지를 정확히 반영. 체위성/유발성 혈관검사의 타당도가 낮아 clearance 근거로 쓸 수 없고, 위험평가는 병력·증상양상·위험인자에 기반해야 한다는 명시와 일치. **이 부분은 그대로 유지 권고.**

**증상 커버리지도 양호.** `NEW_FACE_OR_EYELID_CHANGE`로 Horner 증후군(내경동맥 박리의 고전적 소견)을 환자 언어로 포착한 것은 좋은 설계. 미포함 항목(안진, 오심)의 제외 판단도 타당.

### 정정 필요: 근거 표기 과대

**문제:**  
IFOMPT 프레임워크는 **증상 축 + 위험인자 축**의 결합. 위험인자 축(고혈압·고지혈증·당뇨·흡연·심질환·편두통·응고장애·항응고제·최근 경부 도수치료 등)은 이 문서의 환자 문항 어디에도 없음. §6 treatment safety에서 항응고/출혈위험만 소비한다고 언급할 뿐.

**증상 축만 구현한 상태에서 "IFOMPT 취지에 맞다"고 서술하면 근거의 범위를 과대 표기.**

### 최소 수정안 (D4)

**서술만 조정 (문항 추가 불필요)**

§4 rule 문단에 1줄 추가:
```
"본 문항은 IFOMPT 프레임워크의 **증상 축**만 태블릿에서 수집한다. 
심혈관 위험인자 축은 Core/EMR 및 원장 병력청취에서 평가되며, 
태블릿 단독으로 vascular risk를 배제하지 않는다."
```

또는 Core에서 소비 가능한 위험인자를 §6에 명시적으로 열거.

**특이도 note:**  
`NEW_SEVERE_DIZZINESS_OR_FAINTNESS`는 경부통 인구에서 유병률이 높고 특이도가 낮음(경성 어지럼·BPPV·기립성·불안). 현행 "N03 YES + any positive → URGENT"에서는 통증으로 아찔했던 급성 사경 환자가 URGENT가 되어 alarm fatigue 유발. **D2의 hard/soft 계층화가 이 문제를 함께 해결하므로 별도 조치는 불필요.**

---

## Q4. trauma 1문항 전수 + YES/UNKNOWN → review

### 판정: **조건부 / 경미한 수정 필요**

**기본 판단은 PASS.** 5초 1문항으로 골절·인대 불안정(특히 alar/transverse ligament)·박리 위험을 동시에 커버하고, 양성 시 도수치료 전 원장 검토로 넘기는 것은 안전성 대비 피로 비용이 매우 우수. UNKNOWN을 review로 보내는 것도 fail-closed 원칙과 일관.

### 문구 결함 2가지

**(a) "최근"이 정의되지 않았다**

6주 전 교통사고 후 지속되는 경부통은 "최근"인가? 판단이 환자에게 위임됨.

**(b) 고령에서 "강한 충격"의 기준선이 너무 높다**

골다공증이 있는 80세 환자의 서서 넘어짐(ground-level fall)은 치상돌기 골절의 충분한 기전. 그러나 환자 본인은 이를 "강한 충격"으로 인지하지 않아 `NO`를 선택.

LBP_V1에서 이미 age modifier와 osteoporosis를 도입한 것과 동일한 문제 구조.

### 최소 수정안 (D5)

**신규 환자 문항 0개**

1. **stem에 기간 명시**
   ```
   "최근 3개월 이내..."
   ```
   또는 Core의 onset과 명시적 연결

2. **semantics에 modifier 추가**
   ```
   Core에서 연령 ≥65 또는 osteoporosis 양성인 경우, 
   낙상 기전은 강도와 무관하게 YES로 처리
   ```
   Core의 `osteoporosis` 플래그는 LBP_V1에서 이미 `HISTORY_01`에 추가되어 신규 수집 없이 소비 가능.

3. **stem 예시에 "서서 넘어짐" 명시 포함**

### 근거 note

Canadian C-Spine Rule(Stiell 2001)은 **응급실 내원한 각성·안정 외상환자의 영상촬영 결정 규칙**. 수일~수주 후 한의원에 내원한 환자군에는 직접 적용되지 않음. 참고문헌으로만 남기되, 후속 구현자가 CCR을 그대로 적용하지 않도록 **"배경 근거이며 본 모듈은 CCR을 구현하지 않는다"** (D9에 포함).

---

## Q5. radicular support를 distal extent + arm neuro로만 분류

### 판정: **PASS** (logic gap 1건)

**임상적으로 정확하고 근거 사용도 모범적.**

Spurling: 특이도는 높으나 민감도가 낮고 변동이 크며, 최신 SR의 확실성 등급도 낮음.

환자 보고만으로 radiculopathy를 확정하지 않고 `HIGHER_SUPPORT / CONSIDER / LOWER_SUPPORT`라는 **비확정 어휘** 사용 — 정확.

provocative test를 원장 진찰 이후로 미룬 것 모두 옳음.

피부분절 매핑을 환자에게 묻지 않은 판단도 신뢰도 측면에서 타당.

**이 설계는 그대로 freeze 권고.**

### 규칙 집합의 미정의 상태

**문제:**  
명시된 규칙:
- `FOREARM/HAND_FINGERS` + concrete neuro → HIGHER_SUPPORT
- proximal extent + neuro → CONSIDER
- `NECK_ONLY` + `NONE` → LOWER_SUPPORT

**`FOREARM/HAND_FINGERS` + N09 `NONE`이 정의되지 않았다.** 손까지 내려가는 방사통은 있으나 저림·감각저하·위약이 없는 환자 — 순수 radicular pain의 흔한 발현이고 radiculopathy의 cardinal symptom. 현재 어느 상태로도 분류되지 않음.

또한 N09 stem의 **"목 통증과 별개로"**라는 한정어는, 목에서 팔로 **연속적으로** 이어지는 전형적 방사 증상을 가진 환자가 "별개가 아니므로" `NONE`을 고르게 만들 수 있음.

### 최소 수정안 (D6)

1. **규칙 1개 추가**
   ```
   FOREARM/HAND_FINGERS + N09 NONE → CONSIDER (LOWER_SUPPORT 아님)
   ```

2. **N09 stem에서 한정어 수정**
   ```
   현재: "목 통증과 별개로..."
   변경: "목에서 이어지는 것이든 따로 생긴 것이든..."
   ```

---

## Q6. headache gate를 neck-linked behavior까지만, CFRT는 clinician

### 판정: **PASS** (누락 1건)

**판단은 옳다.** 경인성 두통 진단은 경추 기원의 입증을 요구하며, CFRT는 그중 가장 근거가 나은 검사이나 여전히 clinician manual test. `CERVICOGENIC_HEADACHE_PATTERN = CONSIDER`로 확정을 금지한 calibration도 인용 SR들의 확실성 수준과 정확히 일치. **N10/N11 구조는 유지 권고.**

### 누락: 두통 분기의 red flag 스크리닝 부재

**문제:**  
N10/N11은 존재 여부와 경부 연관성만 묻음. thunderclap은 N03가, 발열·암·면역억제는 N05가 부분적으로 커버하지만, **"새로 발생했거나 양상이 뚜렷이 달라진 두통"**이라는 가장 수율 높은 범주가 어디에도 없음.

특히 50세 이상에서 새로 생긴 두통(거대세포동맥염 포함 — GCA는 PMR 중복으로 경부·견갑대 통증을 동반해 내원할 수 있음)은 이 모듈이 두통 분기를 여는 이상 최소한의 안전망이 필요.

### 최소 수정안 (D7)

**조건부 1문항 추가 (+5s)**

N10 == YES 분기에 추가:
```
"이 두통이 최근 새로 생겼거나, 평소 두통과 양상이 뚜렷이 달라졌나요?"
옵션: YES / NO / UNKNOWN

YES 또는 UNKNOWN → REVIEW_REQUIRED
```

두통 모듈을 만들지 않으면서 신규/변화 두통 전체를 한 문항으로 포착.

---

# Part 2 — Cross-cutting 결함

## D8. §5에 cervical manipulation lock이 없다 — **최중대 누락**

### 문제

문서 전체에서 lock은 두 곳뿐:
- §7: *"Routine MSK/exercise suggestion은 safety review 전 lock"*
- §10: *"Safety != CLEAR: → exercise recommendation lock"*

**둘 다 운동 추천만 잠근다. 경추 고속저진폭 도수조작(추나/HVLA manipulation)이 잠긴다는 서술이 문서 어디에도 없다.**

이 모듈이 vascular screen(§4)과 cord screen(§3)을 두는 근본 이유가 바로 경추 조작의 위험. **IFOMPT 프레임워크 자체가 OMT 시행 전 위험평가 도구.** 그런데 결과물에서 잠기는 것은 운동뿐이고 정작 조작은 규정되지 않았음.

운동보다 조작이 훨씬 높은 위험을 갖는데 lock의 방향이 반대.

### 최소 수정안

§5 또는 §6에 명시:

```
neck_safety_status != CLEAR이면 경추 HVLA/추나 조작 및 경추 견인 제안을 lock한다.
이는 §10의 exercise lock과 독립적이며 우선한다.

URGENT_REVIEW에서는 원장 검토 완료 전까지 모든 경추 도수 개입을 lock.
```

---

## D9. §5 N05 "Core reuse" 규칙이 silent fail-open을 허용

### 문제

```
"Core/EMR에서 특정 항목이 이미 명시적으로 확인되었다면 그 항목은 
다시 표시하지 않는다. 모든 항목이 이미 명확히 확인된 경우 N05를 
재질문하지 않고 기존 값을 소비한다."
```

**"명시적으로 확인"이 정의되지 않았다.** 구현자가 Core의 `HISTORY_01 = ['none']`을 5개 항목 전체의 명시적 음성으로 매핑하면, N05는 표시되지 않고 곧바로 safety CLEAR 후보가 됨.

그러나 Core의 기왕력 문항이 **원인 불명 발열·최근 중증 감염·설명되지 않는 체중감소·최근 경부 시술**까지 명시적으로 배제했다고 보기는 어려움.

이는 LBP_V1에서 adapter 레이어를 따로 두고 별도 테스트해야 했던 것과 정확히 동일한 위험 구조.

마찬가지로 N12의 `show_when: chronic/recurrent condition from Core`도 미정의 — LBP_V1의 `VISIT_03_SYMPTOM_DURATION` 버킷 같은 구체 필드로 확정 필요.

### 최소 수정안

1. **N05 5개 항목 각각에 대해 매핑표 작성**
   - 항목 → Core 필드 → 명시적 음성으로 인정되는 값

2. **기본값은 fail-closed**
   ```
   명시적 매핑이 없는 항목은 반드시 재질문한다
   ```

3. **동일 원칙을 N12에 적용**
   - `show_when: chronic/recurrent condition from Core` 구체 정의

---

## D10. §6 treatment safety에 fail-closed 규칙이 없다

### 문제

§5는 fail-closed invariant를 명시:
```
missing != NO
UNKNOWN != NO
empty multi-select != NONE
malformed != NONE
NONE + positive = invalid → REVIEW
NONE + UNKNOWN = invalid → REVIEW
```

**§6은 소비할 입력만 나열하고 결측·불명 시의 semantics가 없다.** §6이 게이트하는 것이 침·약침·추나이고 여기에 항응고제 상태가 포함되므로, 항응고 상태 결측이 CLEAR로 흐르면 중대한 fail-open.

### 최소 수정안

§6에 1줄 추가:

```
"§5의 fail-closed invariant를 동일하게 적용한다. 
소비 대상 필드 중 결측·UNKNOWN이 하나라도 있으면 
neck_treatment_safety_status = REVIEW_REQUIRED."
```

---

## D11. 근거–주장 매핑이 없어 downstream 오귀인 위험

### 문제

§13의 10개 문헌이 무차별 나열되어, 어떤 문헌이 어떤 항목을 지지하는지 문서 내에서 확인 불가.

**성격이 다른 문헌이 섞여 있음:**

| 문헌 | 실제 성격 | 주의 |
|---|---|---|
| Jiang 2024 (DCM signs) | **원장 진찰 소견**(Hoffmann, 반사항진 등) SR | N02의 **환자 보고** 항목 근거로 인용되면 오용. §7 cord exam 목록의 근거로만 유효 |
| Stiell 2001 (CCR) | 응급실 외상 영상촬영 결정규칙 | 본 모듈은 미구현 |
| ACR AC 2024 | 영상검사 적절성 | 본 모듈은 영상 권고 안 함 — dangling reference |
| IFOMPT 2020 | 증상 + **위험인자** 결합 프레임워크 | 증상 축만 구현 (D4) |

**양호한 인용:**  
Blanpied 2017, Fehlings 2017, Lin 2025, 2026 radiculopathy SR, Rubio-Ochoa 2016, 2022 CGH SR — 모두 적절하며 주장을 제한하는 방향으로 인용. 특히 Spurling·CFRT는 모범적.

### 최소 수정안

§13 각 문헌에 지지 대상 항목 번호와 1줄 주석 부기:

```
예: Jiang 2024 — §7 cord concern **진찰 항목** 근거. 
    환자 자가보고 문항 근거로 사용 금지.
```

---

# Part 3 — 피로 예산 영향

제안된 수정이 §11의 180s fatigue budget을 침범하지 않는지 검증.

| 항목 | 시간 영향 |
|---|---|
| D2 — N04 무조건 표시 | +10s (현재 skip되던 경로에만) |
| D3 — N03 분리 (권장안 채택 시) | +6s |
| D1 — cord course 조건부 | +5s (N02 positive 시) |
| D7 — 두통 변화 조건부 | +5s (N10 YES 시) |

**결과:**
- 모듈 최대 결정경로: 82s → **약 98s**
- 모듈 P90: 72s → **약 85s**
- Core + NECK P90: 142s → **약 155s**

**180s 예산 내에서 전부 수용 가능.** 문항 수 P90은 11 → 약 13. §2의 "safety 문항은 fatigue suppression 대상이 아니다" 원칙과 상충 없음.

> §11의 synthetic simulation은 정직하게 한계를 명시하고 있어 그대로 두어도 됨. LBP_V1에서 P90 ≤180s 항목이 미커버 처리된 전례가 있으므로, NECK도 동일하게 repo-side 검증은 불가. 이는 임상결정 사항이 아니라 후속 인프라 과제.

---

# Part 4 — 임상결정 체크리스트

| ID | 항목 | 등급 | 신규 문항 | 설명 |
|---|---|---|---|---|
| **D1** | N02 stem을 현재상태 기준으로 변경 + course 후속문항 | **필수** | +1 조건부 | 확립 DCM false-negative 방지 |
| **D2** | N04 무조건 표시 + hard/soft 계층화 | **필수** | 0 | UNKNOWN fail-open + 뇌졸중 window 해소 |
| **D3** | N03 분리 (thunderclap headache 독립 URGENT) | **필수** | +1 | 두통과 경부통 위험 구분 |
| **D4** | IFOMPT 증상축-only 범위 명시 | **필수** (서술) | 0 | 근거 과대 표기 방지 |
| **D5** | trauma 기간 정의 + 고령/골다공증 modifier | 권고 | 0 | 환자 재량 감소, 낙상 기전 공평화 |
| **D6** | distal extent + N09 NONE → CONSIDER, N09 stem 수정 | 권고 | 0 | 순수 radicular pain 포착 |
| **D7** | 신규/변화 두통 1문항 | 권고 | +1 조건부 | 두통 분기의 red flag 안전망 |
| **D8** | **경추 HVLA/추나 lock 명문화** | **최우선 필수** | 0 | 모듈의 핵심 목적 — 조작 금지 |
| **D9** | N05 Core reuse 항목별 매핑표 + fail-closed 기본값, N12 chronic 정의 | **필수** | 0 | silent fail-open 방지 |
| **D10** | §6 treatment safety fail-closed invariant 명시 | **필수** | 0 | 항응고제 결측 safe-open 방지 |
| **D11** | 근거–주장 매핑 주석 | 권고 (문서) | 0 | 후속 오귀인 방지 |

**필수 7건 중 5건은 신규 문항 0개로 해결됨.**  
**문항 추가는 총 3개(2개는 조건부) — 피로 예산 내.**

---

# Part 5 — 결론

## 설계 철학 — 건전함

다음 세 가지 원칙은 이 도메인에서 가장 흔한 오류이며, 문서는 모두 정확히 피해 갔음:
1. 진단 확정을 환자 문항에서 만들지 않음
2. provocative test를 clinician-side로 남김
3. positional vascular test로 clearance를 만들지 않음

## 차단 사유 — 경계 조건

UNKNOWN을 통한 fail-open(D2), Core reuse의 미정의 매핑(D9), treatment safety의 invariant 부재(D10), 그리고 경추 모듈에서 조작 lock이 아닌 운동 lock만 존재하는 비대칭(D8) — **이들은 구현자 재량으로 넘길 수 없는 임상결정.**

---

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

### D1·D2·D3·D4·D8·D9·D10 (필수 7건)이 CLOSED되기 전까지 **Fable 통합 계획 및 Sonnet 구현 단계로 진행 금지.**

D5·D6·D7·D11(권고 4건)은 구현과 병행 가능하나, **D5·D6은 문항 추가 없이 해결되므로 이번 라운드에 함께 닫는 것을 권함.**

---

## 다음 단계

각 결정에 대한 **선택지 확정** 요청 → 개정본 v0.2 작성 → Opus 재검수 → CLINICAL DECISION CLOSED → Fable 통합 계획 → Sonnet 구현

