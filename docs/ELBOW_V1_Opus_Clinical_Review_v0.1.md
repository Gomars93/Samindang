# ELBOW_V1 Evidence Matrix v0.1 — Opus 임상·근거 검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**판정**: **CLINICAL DECISION REQUIRED**

---

## 판정 요약

Evidence Matrix의 전반적 설계 품질은 KNEE_V1과 동등하거나 그보다 낫다. 특히 §6 hypothesis contract는 KNEE_V1 v0.1 초안이 겪었던 C1(domain B 이름 누락) 문제를 이미 스스로 피했다 — `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`가 처음부터 명시적으로 존재한다. §7의 "환자가 잘 답할 수 있는 것만 수집" 원칙과 §9의 diagnosis-to-exercise 자동매핑 금지도 정확하다.

§11이 요청한 E1-E10 중 **E3/E4/E7/E10은 그대로 채택 가능(PASS)**, **E6은 KNEE 정례(K4)에 맞춰 결정을 명확히 닫아야 하며(방향은 명확)**, **E1/E2/E5/E8/E9 다섯 항목은 이번 단계에서 구체적 결정 또는 콘텐츠 보완이 필요**하다. 특히 E8은 이 문서가 전혀 언급하지 않은 새로운 안전 도메인(심장 연관통) 하나를 요구한다.

---

# Part 1 — 항목별 판정

## E1. Infection tier — 구조는 PASS, 콘텐츠 보완 필요

Septic elbow joint(관절 자체)에 대한 hot/red/swollen + severe pain + systemic illness → `URGENT_REVIEW`는 SHOULDER SH04·KNEE KNEE_07과 정확히 같은 tier·같은 단일-질문 결합 패턴이며 그대로 채택한다.

Olecranon bursitis(관절 외 point 부종)를 별도 `MUST_EXCLUDE_SEPTIC_OLECRANON_BURSITIS` domain으로 분리한 것도 옳다 — 관절강 감염과 점액낭 감염은 실제로 다른 병태생리·다른 응급도를 가지므로, 같은 enum으로 묶으면 KNEE의 C1과 반대 방향의 실수(서로 다른 개념을 하나로 뭉개는 것)가 된다.

**그러나 §5 표 자체가 이미 "systemic illness **or** rapidly progressive spreading infection → urgent candidate"라고 적어 두었는데, §11 E1 질문은 systemic illness 조건만 재서술하고 "빠르게 번지는 발적/부종"이라는 두 번째 urgent 조건을 언급하지 않는다.** 이는 KNEE K2/K9에서 반복적으로 발견됐던 패턴과 동일하다 — 표(prose)는 이미 위험을 정확히 서술했는데, 그 결정 요약이 그중 절반만 옮겨 적어 Tablet 단계에서 누락될 위험이 있다.

**결정 필요:** olecranon bursitis 도메인의 URGENT 조건을 "systemic illness" 단독이 아니라 "systemic illness **또는** 빠르게 커지거나 번지는 발적/부종"의 두 조건으로 명시적으로 확정한다. 환자가 답할 수 있는 형태로("발적이 몇 시간~하루 사이에 눈에 띄게 커지고 있나요?" 유형) 다음 Tablet 초안에 반영할 것.

---

## E2. Acute trauma tier — 구조는 PASS, KNEE K2와 대칭적인 콘텐츠 gap

Gross deformity/unreduced dislocation/급성 원위부 신경혈관 결손 → URGENT, trauma+뚜렷한 기능손실/국소 골압통 의심 → REVIEW+`fracture_imaging_consider`라는 2-tier 구조 자체는 KNEE K2와 동일한 논리이며 타당하다.

**그러나 KNEE K2가 지적했던 것과 정확히 같은 종류의 gap이 여기에도 있다.** 팔꿈치 탈구(특히 후방 탈구, terrible triad 등 복합손상)는 자연정복되는 경우가 드물지 않고, 정복 직후 겉보기 변형이 없어도 상완동맥·정중신경·척골신경 손상이 지연 발현할 수 있다는 것이 정형외과 교육의 공통 내용이다(무릎 슬와동맥 손상만큼 발생률이 높지는 않지만, 발생 시 결과의 심각성은 동일한 카테고리다). 현재 §5/§7 어디에도 "팔꿈치가 크게 틀어지거나 빠진 느낌이 들었다가 저절로 제자리로 돌아온 적이 있는지"를 묻는 discriminator가 없다 — §7의 "deformity / still-out feeling" 항목은 **현재** 변형만 묻는다.

**결정(필수 콘텐츠 추가):** KNEE_02A와 동일한 패턴으로, KNEE_01 스타일의 외상 인지 여부와 무관하게 무조건 노출되는 discriminator를 하나 추가한다 — 예: *"팔꿈치가 크게 틀어지거나 빠진 느낌이 들었다가 저절로 제자리로 돌아온 적이 있나요?"* 양성이면 현재 변형·맥박이 정상이어도 동일하게 `URGENT_REVIEW`로 취급(원장이 지연성 신경혈관 손상 배제를 직접 확인할 때까지). 이 항목은 근거 인용이 KNEE만큼 강하지 않으므로(무릎 탈구만큼 고빈도로 인용되는 단일 근거가 이 문서에 없음), Tablet 단계 문서에 AAOS/ACR급 팔꿈치 탈구 근거 1개를 추가로 인용해 이 결정을 뒷받침할 것을 권고한다.

---

## E3. Distal biceps rupture — PASS

`REVIEW_REQUIRED + expedited_referral_consider`로 일반 lateral tendinopathy와 분리한 것이 정확하다. B1 근거(수술 시 injury 후 2-3주가 기술적으로 유리)는 "일(days~weeks)" 단위 시간 프레임이지 "시간(hours)" 단위 same-day emergency가 아니다 — SHOULDER SH03/KNEE K3와 정확히 같은 논리적 근거로 URGENT 승격을 배제한 것이 옳다. **수정 불필요.**

---

## E4. Distal triceps rupture — PASS

E3과 동일한 이유로 동일 tier(`REVIEW_REQUIRED + expedited_referral_consider`), URGENT 자동승격 없음이 정확하다. **수정 불필요.**

---

## E5. Ulnar neuropathy — 결정 필요 (양방향)

Sensory-only stable pattern과 progressive weakness/atrophy를 분리하는 원칙 자체는 옳다 — cubital tunnel의 감각 증상만 있는 경우와, intrinsic muscle wasting까지 진행한 경우는 실제로 다른 urgency를 가진다(B3).

Progressive motor deficit(새로 생기거나 진행 중인 힘빠짐 또는 근위축)을 `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`로 올리는 것은 타당하다 — 이는 척수 압박(NECK_02류)처럼 same-day emergency가 아니라 압박성 말초신경병증의 점진적 악화이므로, "일" 단위 신속 평가가 맞는 시간 프레임이다. **이 방향은 확정.**

**그러나 반대 방향에서 결정이 하나 더 필요하다.** §5 표는 "sensory-only stable pattern → review/**consider**"라고 애매하게 적어, sensory-only 증상 자체가 `REVIEW_REQUIRED`를 만드는지 아니면 순수 phenotype(`CONSIDER`)로만 남는지 확정하지 않았다. Cubital tunnel의 감각 증상 단독(4·5번 손가락 저림, 팔꿈치를 오래 구부릴 때 악화)은 일반 인구에서 매우 흔한 양성 소견이다 — 이것 하나만으로 `REVIEW_REQUIRED`를 강제하면, KNEE K5가 처음 겪었던 것과 같은 과잉경고(모든 팔꿈치 통증 환자의 상당수가 REVIEW_REQUIRED로 분류되어 신호가 희석되는) 문제가 재발할 수 있다.

**결정: sensory-only stable pattern 단독은 safety status를 올리지 않는다(순수 `CONSIDER` phenotype으로만 사용, `elbow_safety_status`는 다른 red flag가 없으면 CLEAR 유지). 진행/위축이 확인될 때만 REVIEW+flag로 올라간다.** 이는 KNEE K5의 de-escalation 결정과 같은 방향의 원칙(missing/UNKNOWN이 아닌, 완전히 답변된 양성-저위험 소견을 REVIEW로 강제하지 않는다)을 명시적으로 확정하는 것뿐이며, 새로운 임상영역이 아니다.

---

## E6. Mechanical lock — 결정 필요 (KNEE K4 대칭 결정)

True locking/fixed ROM block → `REVIEW_REQUIRED`, trauma/infection/NV 없이는 routine urgent가 아니라는 원칙은 옳다.

**그런데 이 항목은 KNEE_V1의 K4(true locked knee)와 구조적으로 동일한 임상 상황이다 — displaced meniscal fragment처럼, 팔꿈치의 true mechanical block도 loose body나 골연골 조각에 의한 기계적 감돈일 수 있고, 지연되면 관절연골 손상·정복 가능성 저하로 이어질 수 있다는 논리가 그대로 적용된다.** KNEE K4는 이 논리로 `REVIEW_REQUIRED + expedited_referral_consider`를 이미 CLOSED했는데, ELBOW E6은 `expedited_referral_consider` 부여 여부를 아직 열어 두고 있다.

**결정: KNEE K4와 동일하게 `REVIEW_REQUIRED + expedited_referral_consider`로 확정한다.** 새로운 임상 판단이 아니라 이미 CLOSED된 자매 모듈 결정의 대칭 적용이다. `expedited_referral_consider`를 주지 않을 임상적 근거(예: 팔꿈치 loose body가 무릎보다 덜 시급하다는 근거)가 확인되지 않는 한, 일관성을 위해 KNEE 정례를 따른다.

---

## E7. Tendinopathy tablet scope — PASS

Lateral/medial 통증에 대해 위치+부하패턴만 수집하고 구조진단(공통신전근기시부 병변 확진, UCL 손상 등)은 원장 몫으로 남기는 것은 KNEE의 PFP/patellar tendon scope(K8) 및 SHOULDER의 동일 원칙과 정확히 일치한다. **수정 불필요.**

---

## E8. Referred pain — 결정 필요 (신규 안전 도메인 1개 누락)

### KNEE K9와 같은 이유로 재사용이 아니라 신규 최소 screen이 필요

`arm_hand`(향후 elbow가 속할 route)는 `neck_shoulder`와 공유되는 population이 아니다 — E9가 스스로 인정하듯 현재 elbow 전용 top-level route조차 없다. 즉 NECK_01-05 canonical safety를 "직접 호출"로 재사용할 공유 환자군이 없다(KNEE K9와 정확히 같은 구조적 이유). 따라서 Core `PAIN_04` + clinician cervical screen만으로 충분하다고 보기는 어렵다 — clinician screen은 원장이 실제로 진찰할 때만 작동하므로, 그 전까지 tablet 단계에서 안전망 역할을 할 최소 discriminator가 필요하다.

**결정: ELBOW 전용 최소 referred-pain screen을 신설한다(LBP/NECK 엔진 재사용 아님)** — 목/어깨 증상 동반, 다발성/양측성 감각이상, 방사 패턴 등 cervical radiculopathy 계열 discriminator 1개. `REFERRED_OR_PROXIMAL_SOURCE_CONSIDER`로 이미 phenotype enum은 있으므로, 이를 실제로 포착할 patient-facing 문항 하나를 Tablet 단계에서 추가한다.

### 더 중요한 gap: 심장 연관통(cardiac referred pain)이 이 문서 어디에도 없다

**이것이 이번 검수에서 가장 중요한 단일 발견이다.** 협심증/심근경색의 연관통은 턱·목·어깨뿐 아니라 **팔·팔꿈치(특히 내측)**로도 방사되는 것이 심장학의 표준 교육 내용이며, SHOULDER_V1은 이미 이 위험을 정확히 인지해 SH05(비기계적 심장/전신 동반증상 gate)를 두었다. **그런데 ELBOW_V1 Evidence Matrix는 §2 scope 13개 항목, §5 표 11개 행, §6 hypothesis contract 어디에도 심장 연관통을 언급하지 않는다.** 이는 SHOULDER에서 이미 CLOSED된 안전장치가 해부학적으로 인접하고 병태생리적으로 동일한 위험을 공유하는 자매 모듈에서 조용히 빠진 경우다.

**결정(필수 신규 도메인):** SHOULDER SH05와 동일한 원칙으로 ELBOW에도 비기계적/심장 동반증상 cross-check 문항 1개를 추가한다 — "가슴 답답함·숨참·식은땀·메스꺼움이 함께 있었는지" 유형, 움직임/자세와 무관 여부를 묻는 이중조건(AND gate) 없이 단일조건으로(SHOULDER F2/KNEE C2가 이미 겪은 실수를 반복하지 않도록 Tablet 작성자에게 명시적으로 남긴다). 양성이면 `URGENT_REVIEW`. `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`(가칭) enum을 §6에 추가하거나, 기존 `REFERRED_OR_PROXIMAL_SOURCE_CONSIDER`와는 별도의 MUST_EXCLUDE-tier 도메인으로 명확히 분리한다 — 근골격계 연관통(CONSIDER)과 심장 응급(MUST_EXCLUDE)은 severity가 다르므로 같은 enum에 섞지 않는다.

Core `SAFETY_01.chest_breathing`이 이미 이 환자에게서 urgent로 확인됐다면 중복 질문은 생략 가능(SH05/KNEE_06B와 동일한 생략 원칙 — `core_safety_already_urgent` passthrough로 안전성은 유지된다).

---

## E9. arm_hand routing — safety boundary만 판정

기술적 통합 형태(discriminator 필드명, screen_id 배치 등)는 Fable 몫이라는 문서의 명시적 경계를 존중해, 여기서는 **안전 노출 범위만** 판정한다.

제안된 `ELBOW / FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN` discriminator에 대해:

**결정: ELBOW protected safety(트라우마/감염/건파열/신경병증/기계적 잠김 스크린 전체)는 `ELBOW`, `FOREARM`, `DIFFUSE_OR_MULTIPLE`, `UNKNOWN` 네 값 모두에서 노출한다. `WRIST_HAND`만 제외한다.**

근거: (1) 이 세션 전체에서 이미 확립된 원칙 — 위치/phenotype 애매성이 protected safety 노출을 줄이는 방향으로 작동해서는 안 된다(모든 UNKNOWN은 fail-closed로 노출 유지); (2) `FOREARM`을 제외하면 안 되는 구체적 이유가 있다 — 원위 이두근/삼두근 파열의 멍·부종은 전완까지 퍼져 환자가 "전완이 아프다"고 보고할 수 있고, radial tunnel/PIN 감별(§5 표에 이미 존재)도 "proximal lateral forearm pain"으로 정의되어 있어 ELBOW 도메인과 겹친다 — `FOREARM`을 별도 취급해 elbow safety를 숨기면 이 두 도메인 자체가 무의미해진다. `WRIST_HAND`만 명확히 다른 해부학적 안전 도메인(추후 WRIST/HAND_V1 몫)이므로 배제가 타당하다.

이 결정은 Fable이 실제 필드/게이트를 설계할 때 그대로 literal하게 적용해야 하는 constraint다.

---

## E10. fail-closed — PASS (원칙 확인, 신규 판단 아님)

Protected safety 질문의 UNKNOWN/missing/malformed가 CLEAR를 만들지 않고, optional phenotype 문항의 missing은 safety status를 올리지 않는다는 원칙은 LBP/NECK/SHOULDER/KNEE 전체에서 이미 CLOSED된 계약과 정확히 같다. **수정 불필요** — Tablet 단계에서 이 원칙을 리터럴하게 적용할 것.

---

# Part 2 — Cross-cutting 확인

## C1. Hypothesis enum 커버리지 — 양호, 단 E8 관련 1건 보완 필요

§2의 13개 scope 항목 대부분이 §6에 이름을 갖고 있다(KNEE v0.1 초안이 겪었던 domain-B 누락을 이 문서는 이미 스스로 피했다). 유일한 공백은 E8에서 발견한 심장 연관통 도메인 — `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`(가칭)이 필요하다(위 E8에 이미 반영).

## C2. (forward guidance, 비차단) 신규 문항 3개 전부에 double-barreled 위험 경고

E1(빠른 확산 발적), E2(자연정복 탈구), E8(심장 동반증상) 세 신규 문항 모두 Tablet 단계에서 SHOULDER SH05의 F2 실수(움직임-무관 AND 조건)를 반복하지 않도록 — 단일조건 게이트만 사용할 것을 이번 문서에 명시적으로 남긴다.

---

# Part 3 — 체크리스트

| ID | 항목 | 판정 | 신규 콘텐츠/결정 |
|---|---|---|---|
| E1 | Infection tier | PASS(구조) / **결정 필요(콘텐츠)** | +1 (bursitis 빠른확산 discriminator) |
| E2 | Acute trauma tier | PASS(구조) / **결정 필요(콘텐츠)** | +1 (자연정복 탈구 discriminator) |
| E3 | Distal biceps rupture | **PASS** | 0 |
| E4 | Distal triceps rupture | **PASS** | 0 |
| E5 | Ulnar neuropathy | **결정 필요(양방향)** | 0 (sensory-only 단독 REVIEW 강제 금지 확정 + progressive는 상향 확정) |
| E6 | Mechanical lock | **결정 확정** | 0 (REVIEW+expedited, KNEE K4와 통일) |
| E7 | Tendinopathy scope | **PASS** | 0 |
| E8 | Referred pain | **결정 필요(신규 도메인)** | +2 (cervical referred screen 1 + **심장 연관통 screen 1**) |
| E9 | arm_hand routing safety boundary | **결정 확정** | 0 (ELBOW/FOREARM/DIFFUSE/UNKNOWN 노출, WRIST_HAND만 제외) |
| E10 | fail-closed | **PASS** | 0 |

**신규 문항은 최대 4개**(bursitis 확산 1 + 자연정복 탈구 1 + cervical referred 1 + 심장 연관통 1) — 전부 신규 임상판단이 아니라 이미 CLOSED된 자매 모듈(SHOULDER/KNEE) 정례의 대칭 적용이거나, 이 문서 자신의 §5 표가 이미 서술한 위험의 미완성 조작화다.

---

# 결론

설계 철학은 KNEE_V1/SHOULDER_V1과 동일하게 건전하고, 오히려 hypothesis enum 커버리지는 KNEE 초안보다 처음부터 더 완성도가 높다. 차단 사유는 두 종류다: (1) 이 문서 §5 표가 이미 서술한 위험(빠르게 번지는 감염, 자연정복 탈구)을 아직 discriminator로 완성하지 못한 지점, (2) 자매 모듈(SHOULDER)에서 이미 CLOSED된 안전장치(심장 연관통)가 해부학적으로 인접한 이 모듈에 조용히 누락된 지점. 새로운 임상 영역을 여는 결정은 없다.

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

E1(콘텐츠)·E2(콘텐츠)·E5(양방향 확정)·E8(신규 도메인, 특히 심장 연관통)이 다음 개정에 반영되고, E6(REVIEW+expedited)·E9(FOREARM/DIFFUSE/UNKNOWN 노출)가 결정대로 채택되면, 그 개정판(Tablet Question Set v0.1)에 대해 재검수 후 CLOSED로 진행 가능합니다. E3·E4·E7·E10은 제시된 그대로 채택해 진행해도 좋습니다.

---

## 다음 단계

각 결정 반영 → **ELBOW_V1 Tablet Question Set v0.1** 작성(E9의 routing 형태는 Fable 통합 계획에서 확정) → Opus 재검수 → CLINICAL DECISIONS CLOSED → Fable 통합 계획 → Sonnet 구현 → 전체 회귀 → PASS / FROZEN

Tablet Question Set 작성, Fable 통합 계획, production code 구현은 이번 세션에서 수행하지 않았다.
