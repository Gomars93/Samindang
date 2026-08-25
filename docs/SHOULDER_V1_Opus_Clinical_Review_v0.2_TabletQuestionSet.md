# SHOULDER_V1 Tablet Question Set v0.1 — Opus 재검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**판정**: **CLINICAL DECISION REQUIRED**
**대상 문서**: `SHOULDER_V1_Tablet_Question_Set_v0.1.md`

---

## 판정 요약

S1(급성 외상성 회전근개 파열 severity)과 S7(비MSK/심장 gap screen) 등 v0.1 검수의 필수 결정 사항은 **정확하고 충실하게 반영**되었다. C1(enum 분리), S2(PMR gate), S4(passive ROM discriminator 정의), S3(NECK 재사용 구조) 모두 이전 검수 의도대로 정확히 구현되어 있다.

다만 §17이 요청한 7개 질문 중 **2건에서 실질적 안전 아키텍처 결함**을 발견했다. 하나는 목/어깨 sub-gate가 shoulder-specific 응급 스크린 자체를 우회시킬 수 있는 구조적 문제(F1)이고, 다른 하나는 SH05가 두 조건을 결합한 double-barreled 문항이라 실제 흔한 발현 양상(운동성 협심증)을 놓칠 위험이 있는 문제(F2)다. 추가로 SH01(외상)의 독자적 review 승격이 NECK 선례와 조용히 어긋나는 지점(F3)도 발견했다.

**세 건 모두 이미 CLOSED된 원칙(S1/S3/S7)을 문서 자신의 다른 부분과 일관되게 만드는 작업이며, 새로운 임상 판단 영역을 여는 것은 아니다** — NECK v0.1 검수와 동일한 성격의 지적이다.

---

## §17 질문별 판정

| # | 질문 | 판정 |
|---|---|---|
| 1 | S1 반영 정확성 | **PASS** |
| 2 | SH05가 Core 중복 없이 gap만 메우는가 | **결정 필요 (F2)** |
| 3 | S3 canonical NECK 재사용 구조 명확성 | **PASS** |
| 4 | SH06 bilateral calibration 적절성 | **PASS** |
| 5 | "global" → multi-plane 정의 적절성 | **PASS** |
| 6 | C1 enum 분리 완전성 | **PASS** |
| 7 | NS01 sub-gate 임상적 문제 없음 | **결정 필요 (F1)** |

---

# Part 1 — PASS 항목 확인

## Q1. S1 반영 — 정확

§10 URGENT_REVIEW 목록에 SH04(감염)·SH02의 두 하드 항목(변형/미정복·신경혈관 변화)·SH05(심장)만 있고, SH03(급성 외상성 회전근개 우려)은 명시적으로 제외되어 REVIEW_REQUIRED 목록("SH03 YES/UNKNOWN/invalid")에만 있다. §11의 "URGENT_REVIEW로 자동 승격하지 않는다"는 문구까지 정확히 원래 결정을 재확인하고 있다.

**수정 불필요.**

## Q3. Canonical NECK 재사용 — 명확

§2·§8·§10이 삼중으로 원칙을 못박고 있다: 동일 ID/문구/threshold 그대로 사용, `neckLogic.ts` 함수 직접 호출, SHOULDER 전용 사본 금지. §4가 `RECENT_CERVICAL_PROCEDURE_OR_SURGERY`를 "shoulder-specific recent procedure의 대체물로 억지로 끼워 맞추지 않는다"고 명시한 부분은 재사용 범위를 과도하게 넓히지 않는 좋은 판단이다.

**수정 불필요.**

## Q4. SH06 bilateral calibration — 적절

단독 CONSIDER-tier 가설 플래그로만 두고 별도 systemic screen(NECK_05 재사용) 양성과 결합될 때만 실제 red-flag status를 따르게 한 계층 구조는, 양측 어깨통증의 흔한 양성 원인들(양측 OA, 과사용, 자세)과 PMR을 자가보고 1문항으로 구분하려 하지 않는 정직한 설계다.

**수정 불필요.**

## Q5. "Global" PROM 정의 — 적절

`MULTIPLANAR_PROM_RESTRICTION`을 2개 이상 평면의 임상적으로 의미 있는 제한으로 정의하고, ER 포함 여부를 별도 표시하며, 숫자 cutoff를 금지한 것은 v0.1 검수의 non-blocking note를 정확히 해소한다. 이 항목은 원장 전용(§6 "Tablet에서 묻지 않음")이라 환자 화면 wording 리스크도 없다.

**수정 불필요.**

## Q6. C1 enum 분리 — 완전 해결

§9가 `MUST_EXCLUDE_SYSTEMIC_OR_MALIGNANT_PATHOLOGY`와 `MUST_EXCLUDE_NON_MSK_REFERRED_PATHOLOGY`를 명시적으로 분리 유지하고, "합성 enum은 사용하지 않는다"는 fix까지 명문화했다.

**수정 불필요.**

---

# Part 2 — 결정 필요 항목

## F1 (Q7). NS01 sub-gate가 shoulder-specific 응급 스크린 자체를 우회시킬 위험

### 문제

§1은 NS01의 clinical intent를 이렇게 적는다:

```
SHOULDER_DOMINANT → SHOULDER primary
NECK_DOMINANT     → NECK primary
```

그리고 §1 architecture note는 "정확한 primary/secondary module routing은 Fable 통합 단계의 기술결정"이라며 이 문제를 미룬다.

**그런데 SH01-SH05는 "SHOULDER_V1 Tablet Question Set"의 일부로 정의되어 있다.** 만약 Fable이 §1의 "clinical intent"를 문자 그대로 구현해 "NECK_DOMINANT → NECK 모듈만 진입, SHOULDER 모듈 미진입"으로 라우팅하면, **어깨 외상이 있는 환자가 NS01에서 우연히 `NECK_DOMINANT`나 `SIMILAR`/`UNKNOWN`을 선택하는 것만으로 SH02(변형/미정복 탈구/신경혈관)·SH04(감염)·SH05(심장)를 전혀 보지 못하는 경로가 생긴다.**

이건 정확히 NECK_V1 v0.1 검수에서 지적했던 D2(hard-tier 혈관증상이 onset 게이트 뒤에 숨어 일부 환자가 아예 보지 못함)와 같은 구조다. 환자가 "지금 어느 쪽이 더 불편한지"를 주관적으로 답하는 것은, 실제로 위험한 것이 무엇인지와는 완전히 무관한 신호다 — 어깨가 빠진 채 아직 안 들어간 환자가 통증의 방사·근육 경직 때문에 "목이 더 불편하다"고 답할 수도 있다.

### 결정

**NS01의 답과 무관하게, `PAIN_01 === 'neck_shoulder'`인 모든 환자는 SH01-SH05(및 canonical NECK N01-N05)를 전부 본다.** NS01은 오직 **hypothesis 가중치/권장검사/phenotype 문항(SH06 이후)의 "primary" 태깅**에만 쓰인다 — 즉 어떤 module이 `primary_module_detail`이 되는지는 결정하지만, **어떤 safety 문항이 노출되는지는 절대 결정하지 않는다.**

이는 §2가 canonical NECK safety(N01-N05)에 대해 이미 확립한 것과 정확히 같은 원칙("shoulder primary 환자라도... 아직 응답되지 않았다면... 그대로 표시한다")을 SHOULDER-specific safety(SH01-SH05)에도 대칭적으로 적용하는 것뿐이다 — 새로운 임상판단이 아니라, 문서가 이미 NECK 쪽에 적용한 원칙을 SHOULDER 쪽에도 일관되게 적용하는 것이다.

**Fable 통합 범위로 남겨도 되는 것은 "primary/secondary 태깅 방식"이지, "safety 문항이 조건부로 숨겨지는지 여부"가 아니다.** §1의 architecture note에 이 구분을 명시적으로 추가할 것.

---

## F2 (Q2). SH05가 double-barreled 문항이라 운동성 협심증 발현을 놓칠 수 있다

### 문제

SH05 문구:

> "어깨나 팔의 불편감이 **움직이거나 자세를 바꿀 때와 별 관계없이** 나타나면서, 가슴 답답함·숨참·식은땀·메스꺼움 같은 증상이 함께 있었나요?"

이 문항은 **두 조건을 AND로 결합**한다: (a) 움직임/자세와 무관 **그리고** (b) 자율신경/전신 증상 동반. 설문 방법론에서 이런 결합형("double-barreled") 문항은 응답자가 어느 조건에 답하는지 혼동하기 쉬워 일반적으로 지양된다.

**임상적으로 더 중요한 문제는:** 흔한 anginal equivalent 발현 중 하나가 **운동성 협심증**(전신 운동/노동 부하로 유발되는 흉통·연관통)인데, 환자가 이걸 "움직일 때 생긴다"로 해석해 (a) 조건에서 "아니요(관계있다)"를 고르면, (b)의 자율신경 증상이 실제로 함께 있었더라도 전체 문항에 "아니요"로 답하게 될 위험이 있다. E7(AHA/ACC 2021)이 정확히 경고하는 시나리오이며, 이 문항이 막으려는 바로 그 케이스를 문항 자체의 문구 때문에 놓칠 수 있다.

SH08("팔을 들거나, 물건을 들거나, 어깨에 힘을 줄 때")처럼 **어깨-특이적 동작**으로 명확히 한정했다면 이 위험이 없었겠지만, SH05의 "움직이거나 자세를 바꿀 때"는 전신 운동/노동까지 포괄하는 것으로 읽힐 여지가 있다.

### 결정

**게이트가 되는 핵심 질문에서 "움직임 무관" 전제조건을 제거하고, 자율신경/전신 증상 동반 여부만으로 YES/NO를 가른다.**

```
> 최근 어깨나 팔이 불편할 때, 가슴 답답함·숨참·식은땀·메스꺼움 같은 증상이 함께 있었나요?
```

과잉 트리거(위양성 → 직원 확인 1회 추가)의 비용은 과소 트리거(위음성 → MI 누락)의 비용과 비교가 안 될 만큼 작다. "움직임과의 관계"는 문진 색채 정보로 clinician 쪽에 남기되(Doctor View narrative에 참고용으로만), 안전 게이트의 AND 조건에서는 제거한다.

---

## F3. SH01(외상) 단독 YES가 review를 승격하지 않는 것 — 명시적 근거 필요

### 문제

§10 REVIEW_REQUIRED 목록에 `SH01 == YES` 자체는 없다. 즉 외상이 확인됐어도(SH01=YES) 후속 SH02/SH03가 모두 valid negative면 `shoulder_safety_status = CLEAR`가 가능하다.

NECK_V1 v0.2.1 §5는 N01(외상) YES/UNKNOWN을 그 자체로 REVIEW_REQUIRED 발생 조건으로 명시했다(후속 문항 결과와 무관하게). SHOULDER는 이 선례에서 조용히 벗어나 있는데, 문서 어디에도 "왜 어깨 외상은 목 외상과 다르게 취급하는지"에 대한 근거 서술이 없다.

**이게 실제 fail-open은 아니다** — §13 Doctor View 템플릿에 `{trauma_summary}`가 무조건 렌더링되므로, CLEAR로 계산되어도 외상 이력 자체는 원장에게 항상 보인다. 정보 손실은 없고, 단지 "우선순위 강조 배지"가 빠질 뿐이다.

### 결정 (택1)

- **(A)** NECK과 동일하게 `SH01 == YES/UNKNOWN` 자체를 REVIEW_REQUIRED 최소 조건에 추가한다(fail-closed 철학과 완전히 일관), 또는
- **(B)** 현재 설계를 유지하되, "SH01 단독 양성은 SH02/SH03가 모두 clean하면 최우선순위 배지를 만들지 않는다 — 외상 이력은 trauma_summary에 항상 노출되므로 정보 손실이 아니다"라는 근거를 §10에 명문화한다.

**권고:** (B). 목 외상과 어깨 외상은 실제로 위험 프로파일이 다르다(경추는 척수·추골동맥 손상 가능성이 자가보고만으로 배제하기 어려운 반면, 어깨는 SH02/SH03 두 문항이 이미 변형·신경혈관·급성 근력저하를 직접 포착한다). 다만 이 비대칭은 **의도적**이어야지 **누락**이어서는 안 되므로, 반드시 문서에 근거를 남길 것.

---

# Part 3 — 비차단 문서 정리

**SH02 exclusivity 표기 불완전:** "NONE은 positive/UNKNOWN과 동시 선택 불가"만 명시되어 있고, UNKNOWN과 positive의 동시선택 배제는 별도 언급이 없다. NECK/LBP 전체가 사용하는 `exclusive: ['NONE', 'UNKNOWN']` UI 패턴을 그대로 적용한다는 뜻이면 표기만 보완할 것(구현 의도상 문제는 없어 보임).

---

# Part 4 — 체크리스트

| ID | 항목 | 등급 | 신규 문항 |
|---|---|---|---|
| **F1** | NS01은 primary 태깅만 결정, SH01-05/canonical NECK safety는 무조건 노출 | **필수** | 0 (원칙 명문화만) |
| **F2** | SH05에서 "움직임 무관" 전제조건 제거, 자율신경 증상 단독 게이트로 단순화 | **필수** | 0 (문구 수정만) |
| F3 | SH01 YES 단독 비승격의 근거를 §10에 명문화 (또는 NECK처럼 승격) | 권고 | 0 |
| — | SH02 exclusivity에 UNKNOWN 명시 | 권고 (문서) | 0 |

**필수 2건 모두 신규 문항·신규 임상판단 없이 해결됨** — F1은 이미 §2가 NECK 쪽에 적용한 원칙의 대칭 적용, F2는 문구 단순화.

---

# 결론

이번 문서는 v0.1 검수의 7개 결정 사항(S1-S7)과 C1을 매우 충실하게 반영했고, 특히 S1/S3/S6/C1 네 곳은 원래 권고보다 더 명확하게 구현되었다(neckLogic.ts 직접 호출 명시, enum 분리 근거 서술 등).

차단 사유 2건(F1, F2)은 모두 **문서가 이미 다른 곳에서 채택한 원칙(canonical safety의 무조건 노출, anginal-equivalent gap 포착)을 자기 자신과 일관되게 만드는 작업**이며, 새로운 임상 영역을 여는 것이 아니다.

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

F1·F2가 반영되면(신규 문항 없이, 원칙 명문화 + 문구 수정만으로 가능) 그 개정본은 재검수 없이 CLOSED로 처리 가능 — 두 수정 모두 이미 CLOSED된 원칙의 기계적 적용이기 때문(NECK v0.2→v0.2.1과 동일한 성격). F3와 SH02 표기는 권고 사항으로 병행 반영을 권한다.

---

## 다음 단계

F1·F2(및 권고 F3) 반영 → v0.1.1 → CLINICAL DECISIONS CLOSED → Fable 통합 계획(NS01 기반 primary/secondary 태깅, canonical NECK 직접 호출 아키텍처) → Sonnet 구현 → 전체 회귀 → PASS / FROZEN
