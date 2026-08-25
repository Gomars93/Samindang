# KNEE_V1 Evidence Matrix v0.1 — Opus 임상·근거 검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**판정**: **CLINICAL DECISION REQUIRED**

---

## 판정 요약

Evidence Matrix의 전반적 품질은 SHOULDER_V1과 동등하게 높다. 특히 §6(meniscus calibration의 acute-only scope 제한), §7(ligament 특수검사 비확정), §8(OA age-alone 확정 금지), §10(imaging principle) 모두 인용 근거(NICE NG226, AAOS 2024 Acute Meniscus, AAOS ACL 2022)와 정확히 일치하며 진단 확정·단일검사 확진을 올바르게 배제한다.

§14가 명시적으로 요청한 **K1-K9 중 4건(K2 일부, K5, K9, +cross-cutting 1건)은 이번 단계에서 닫아야 하는 구체적 결정 또는 콘텐츠 추가**가 필요하고, 나머지는 대체로 타당하다.

---

# Part 1 — 판정별 결정

## K1. Septic knee severity — URGENT_REVIEW 확정

패혈성 관절염은 24-48시간 내 연골 파괴가 진행될 수 있고 면역저하 환자에서 사망률도 무시할 수 없다. SHOULDER_V1의 감염 도메인(SH04)과 정확히 동일한 위험 프로파일 — hot/swollen/severe pain + systemic sign(발열/오한/전신쇠약)은 same-day emergency 등급이다.

**결정: URGENT_REVIEW 실시간 인터럽트로 확정.** SHOULDER SH04와 동일한 tier·동일한 실시간 인터럽트 메커니즘을 그대로 적용.

---

## K2. Trauma severity — 분류 자체는 PASS, 콘텐츠 추가 필수

### 분류 구조는 적절

- 명백한 변형/신경혈관 손상 → URGENT_REVIEW
- 외상+체중부하 불가/골절 의심 → REVIEW_REQUIRED + `fracture_imaging_consider`

이는 SHOULDER_V1의 급성 회전근개 파열 tiering(URGENT가 아니라 REVIEW+expedited)과 같은 논리를 정확히 따른다 — "특수의뢰가 필요하지만 same-day 응급은 아님"의 시간 프레임이 타당하게 구분되어 있다.

### 그러나 spontaneously reduced knee dislocation 대응이 콘텐츠 레벨에서 비어 있다

무릎 탈구는 흔히 내원 전에 저절로 정복되며, 슬와동맥(popliteal artery) 손상은 실제 탈구의 상당 비율에서 발생하고 — 정복 직후 외형과 즉시 맥박이 정상이어도 수 시간 뒤 지연성 허혈로 발현할 수 있다는 것이 정형외과·응급의학의 공통된 교육 내용이다. 문서 §3-B 자체가 이 위험을 정확히 서술("현재 변형 없음 = 안전으로 처리하지 않는다")하지만, **이를 실제로 포착할 patient discriminator 문항이 아직 없다.** 현재 §4 표의 discriminator는 "gross deformity/cold-pale limb/major distal neurovascular change"뿐이라, 이미 저절로 정복되어 외형이 정상인 환자는 이 문항들 중 어느 것에도 걸리지 않는다.

**결정(필수 콘텐츠 추가):** Tablet 단계에서 다음 patient discriminator를 K2 URGENT 후보에 추가한다 — 예: *"무릎이 크게 틀어지거나 빠진 느낌이 들었다가 저절로 제자리로 돌아온 적이 있나요?"* 양성이면 현재 외형·맥박이 정상이어도 **동일하게 URGENT_REVIEW**로 취급하고(원장이 지연성 혈관손상 배제를 직접 확인할 때까지), "변형 없음"을 안전 신호로 대체 사용하지 않는다.

---

## K3. Extensor mechanism rupture — REVIEW_REQUIRED + expedited_referral_consider

Complete patellar/quadriceps tendon rupture는 조기 봉합(대략 2-3주 이내, 빠를수록 좋음)이 예후를 크게 좌우하지만, 그 시간 프레임은 "일(days)" 단위지 "시간(hours)" 단위의 same-day emergency가 아니다 — 정확히 SHOULDER_V1의 급성 회전근개 파열과 같은 성격이다.

**결정:** `REVIEW_REQUIRED + expedited_referral_consider`. URGENT_REVIEW로 승격하지 않는다 — SHOULDER SH03의 F3 결정과 동일한 논리적 근거.

---

## K4. True locked knee — REVIEW_REQUIRED + expedited_referral_consider

같은 이유로 K3와 동일하게 처리한다. 진짜 mechanical extension block(displaced meniscal fragment 의심)은 혈관/신경 위험이 없으므로 same-day emergency는 아니지만, 지연되면 연골 손상·수복 가능성 저하로 이어질 수 있어 신속한 전문의 평가가 필요하다.

**결정:** `REVIEW_REQUIRED + expedited_referral_consider`. K3와 동일 tier로 통일해 원장에게 일관된 우선순위 신호를 준다.

---

## K5. DVT safety — 결정 필요, 구체안 제시

### Wells를 clinician-side로 두는 것은 PASS

Wells score는 "반대쪽 다리와 비교한 부종 정도", "표재정맥 확장" 등 임상 관찰이 필요해 환자 자가보고로 신뢰성 있게 수집할 수 없다 — NECK_V1이 IFOMPT의 위험인자 축을 clinician-side로 남긴 것과 동일한 원칙.

### Severity tiering에 구체적 결정 필요

**결정:**

- 단독 편측 종아리/다리 부종 + 위험 맥락(최근 수술/장기부동/과거 DVT/활동성 암 등) → **`REVIEW_REQUIRED + dvt_assessment_required`** (당일 원장 평가·Wells 산정 대상이지, ER 즉시 이송 대상은 아니다 — NICE NG158 자체 pathway도 이 프레임을 따른다)
- 단, 여기에 **흉통/호흡곤란/객혈** 등 폐색전 의심 증상이 동반되면 → **`URGENT_REVIEW`**

**중요:** 이 흉부 동반증상 교차확인은 Core의 기존 `SAFETY_01`(chest_breathing) 전역 net을 다시 만드는 게 아니라, SHOULDER_V1의 SH05(F2 결정)와 정확히 같은 이유로 **1개의 targeted 문항**만 추가한다 — "다리 부종과 함께 가슴 답답함·호흡곤란이 있었는지"를 KNEE 모듈 안에서 한 번 더 물어, "가슴" 언어 없이 다리 증상으로만 발현하는 케이스의 gap을 메운다. **이 문항을 설계할 때 SHOULDER SH05의 F2 실수(움직임-무관 AND 조건을 걸어 이중조건 질문으로 만드는 것)를 반복하지 않도록 Tablet 단계에 명시적으로 남긴다** — 단일조건(흉부/호흡 동반증상 유무)만으로 게이트할 것.

---

## K6-K8. 모두 PASS

- K6(OA pattern): NICE NG226의 age≥45+activity-related+경미한 조조강직 기준을 `HIGHER_SUPPORT` 전용으로만 쓰고, 나이 단독 확정·X-ray grade와 통증 동일시를 명시적으로 금지 — 정확.
- K7(meniscus scope): AAOS 2024를 acute isolated tear에만 적용하고 degenerative meniscal contribution을 별도 phenotype으로 분리한 것은 근거의 실제 적용범위를 정확히 존중한 판단 — SHOULDER의 RC CPG 적용범위 준수와 동일한 수준.
- K8(PFP/tendon scope): 환자 태블릿은 위치·부하관련성만 수집하고 구체 진단(패드안정성/건병증 확진)은 원장 몫으로 남김 — 정확.

세 항목 모두 **수정 불필요.**

---

## K9. Referred hip/lumbar contribution — 결정 필요 (재사용이 아니라 신규 최소 스크린)

### NECK/SHOULDER의 재사용 모델이 그대로 적용되지 않는 이유

NECK_V1과 SHOULDER_V1은 `PAIN_01 === 'neck_shoulder'`라는 **공유 entry gate**를 갖고 있어, 두 모듈이 정확히 같은 환자군에게 항상 동시 노출된다 — 그래서 SHOULDER가 canonical NECK safety를 "직접 호출"로 재사용할 수 있었다.

**KNEE는 이 구조가 없다.** 이 repo의 `PAIN_01`에는 `low_back_pelvis`(LBP)와 `knee`가 **서로 다른, 상호 배타적인 옵션**으로 이미 존재한다(신체 부위가 다르므로 애초에 하나로 묶일 이유가 없다). 즉 무릎 주호소 환자는 애초에 `IS_PRIMARY_LBP`가 되지 않으므로, LBP_QUESTIONS가 그 환자에게 노출될 자연스러운 경로 자체가 없다 — "canonical LBP safety를 직접 호출해 재사용"하려 해도 공유되는 환자 모집단이 존재하지 않는다.

### 결정: KNEE 전용 최소 red-flag 스크린 신설(LBP 엔진 재사용 아님)

이 gap이 실제로 보호해야 하는 것은 "고관절 골절이 무릎통증으로 오인되는 노인 환자", "요추 마미증후군이 무릎 쪽 다리통증으로 발현하는 환자"처럼 **KNEE가 아닌 곳의 안전 문제가 KNEE 라벨에 가려지는 것**이다. 이는 §3-F의 "knee OA/meniscus/PFP label로 non-knee pathology를 가리지 않는다" 원칙의 실질적 구현이 아직 없다는 뜻이다.

**신규 최소 문항 1개**(예): *"이 무릎 증상과 함께 엉덩이·허리·다리에 새로 생긴 감각 이상, 힘빠짐, 또는 대소변 조절 변화가 있나요?"* → 양성/UNKNOWN이면 `MUST_EXCLUDE_SYSTEMIC_OR_REFERRED_PATHOLOGY`로 review.

**Fable 통합 단계에 넘길 것과 넘기지 말 것을 여기서 명확히 한다:** "재사용 아키텍처를 설계하라"는 기술결정으로 넘기지 않는다 — 현재 라우팅 구조상 재사용이 불가능하다는 임상 검수 결론이므로, 신규 최소 문항 신설이 이번 단계의 결정이다. (장기적으로 LBP/NECK/KNEE가 공유하는 "referred pain hub"를 만드는 것은 이 모듈의 v1 범위를 넘는 더 큰 구조 프로젝트로, 여기서 요구하지 않는다.)

---

# Part 2 — Cross-cutting 결함

## C1. Domain B(외상/골절/탈구/신경혈관)에 전용 hypothesis enum과 매트릭스 행이 없다

§3의 A/C/D/E/F는 각각 `MUST_EXCLUDE_*` enum 이름을 갖고 있는데, **가장 고전적으로 위험한 domain B(major trauma/fracture/dislocation/neurovascular)만 이름이 없다.** §4 매트릭스 표에도 domain B 전용 행이 없다(다른 phenotype 행들 사이 어디에도 외상/골절이 명시적으로 없음).

SHOULDER_V1은 이 대응 도메인에 `MUST_EXCLUDE_FRACTURE_OR_UNREDUCED_DISLOCATION`이라는 명시적 enum과 매트릭스 행을 갖고 있었다 — KNEE에서 이게 빠지면, Tablet 단계에서 Sonnet 구현자가 이 도메인을 다른 enum에 억지로 끼워 넣거나 누락시킬 위험이 있다(정확히 SHOULDER v0.1의 C1이 지적했던 "같은 개념이 문서 안에서 이름을 못 얻어 드리프트하는" 패턴).

**수정안:** `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY`(가칭) enum을 §3-B에 명시적으로 추가하고, §4 표에 이 domain 전용 행을 추가한다.

## C2. (forward guidance, 비차단) DVT 문항의 double-barreled 위험을 Tablet 단계에 미리 경고

K5에서 이미 다뤘지만 재강조: SHOULDER v0.1의 F2(움직임-무관 AND 조건이 운동성 협심증을 놓칠 위험)와 완전히 동일한 함정이 KNEE의 DVT-cardiac 교차확인 문항에도 존재할 수 있다. Tablet Question Set 작성자가 이 전례를 알고 시작하도록 이번 문서에 명시적으로 남긴다(위 K5 결정안에 이미 반영).

---

# Part 3 — 체크리스트

| ID | 항목 | 판정 | 신규 콘텐츠 |
|---|---|---|---|
| K1 | 패혈성 관절염 severity | **결정 확정** | 0 (URGENT_REVIEW) |
| K2 | 외상 tiering 구조 | PASS (구조) / **결정 필요 (콘텐츠)** | +1 (자연정복 탈구 discriminator) |
| K3 | Extensor mechanism rupture tier | **결정 확정** | 0 (REVIEW+expedited) |
| K4 | True locked knee tier | **결정 확정** | 0 (REVIEW+expedited, K3와 통일) |
| K5 | DVT tiering + Wells 소재 | **결정 필요** | +1 (흉부/호흡 교차확인 단일조건 문항) |
| K6 | OA calibration | PASS | 0 |
| K7 | Meniscus acute/degenerative 분리 | PASS | 0 |
| K8 | PFP/tendon scope | PASS | 0 |
| K9 | Hip/lumbar referred 처리 | **결정 필요** | +1 (KNEE 전용 최소 red-flag, LBP 재사용 아님) |
| C1 | Domain B enum/매트릭스 행 누락 | **결정 필요 (문서)** | 0 (명명만) |
| C2 | DVT 문항 double-barreled 위험 예방 | 권고 (forward guidance) | 0 |

**신규 문항은 최대 3개**(자연정복 탈구 1 + DVT-흉부 교차확인 1 + referred-pain red flag 1) — 전부 신규 임상판단이 아니라 이미 문서 §3이 서술한 위험을 실제로 포착하는 콘텐츠 보완이다.

---

# 결론

**설계 철학은 SHOULDER_V1과 동일하게 건전하다.** 진단 확정·단일검사 확진·영상 자동처방을 모두 정확히 배제했고, 근거의 실제 적용범위(특히 AAOS 2024 acute meniscus)를 과도하게 확장하지 않았다.

**차단 사유는 문서가 이미 인지하고 서술한 위험(§3-B의 자연정복 탈구, §3-F의 non-knee referred pathology)을 아직 실제 discriminator 문항으로 옮기지 못한 지점들이다** — 새로운 임상 영역을 여는 게 아니라, 이미 쓰여 있는 원칙을 문항으로 완성하는 작업이다.

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

K2(콘텐츠)·K5·K9·C1이 다음 개정(Tablet Question Set v0.1)에 반영되면, 그 문서에 대해 재검수 후 CLOSED로 진행 가능합니다. K1·K3·K4·K6-K8은 제시된 결정 그대로 채택해 진행해도 좋습니다.

---

## 다음 단계

각 결정 반영 → **KNEE_V1 Tablet Question Set v0.1** 작성 → Opus 재검수 → CLINICAL DECISIONS CLOSED → Fable 통합 계획(K9: KNEE 전용 최소 red-flag 스크린의 실제 필드/screen_id 배치, LBP/NECK/SHOULDER 회귀 0) → Sonnet 구현 → 전체 회귀 → PASS / FROZEN
