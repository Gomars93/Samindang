# LBP 재활운동 라이브러리 근거 리서치 v0.1

- 대상: `src/doctor/workspace/lbpExerciseCoreMetadata.ts` (Core-20, `CORE_20_V0_1`)
- 목적: 현재 20개 운동 항목의 **근거 기반 갱신**을 위한 문헌 조사
- 작성: 2026-09-05, 브랜치 `claude/clinical-os-lbp-architecture-xym6po`
- 상태: **DRAFT — 임상 채택 전 원문 검증 필수**
- 코드 변경 없음 (문서만)

---

## 0. 방법론과 이 문서의 치명적 한계 — 먼저 읽으세요

### 0.1 원문을 한 편도 읽지 못했다

이 세션의 실행 환경에서 **WebFetch(웹 원문 가져오기)가 전면 차단**되어 있다.
도메인 선별 차단이 아니라 **모든 외부 HTTP 요청이 차단**된다. 검증:

| 시도한 URL | 결과 |
|---|---|
| `https://example.com` | `EGRESS_BLOCKED` |
| `https://en.wikipedia.org/wiki/Low_back_pain` | `EGRESS_BLOCKED` |

`curl`도 동일하게 `CONNECT tunnel failed, response 403`으로 막힌다
(`nice.org.uk`, `pmc.ncbi.nlm.nih.gov`, `physio-pedia.com` 모두 확인).

따라서 **이 문서의 모든 인용은 예외 없이 "검색 결과 스니펫/요약 수준"이며,
원문(full text)을 직접 열어 확인한 것은 단 하나도 없다.**
프로젝트 규칙 2항에 따라, 각 항목에 개별 표기를 반복하는 대신 여기서 한 번에
전역 선언한다:

> **이 문서 전체가 "스니펫만 확인, 원문 미확인" 상태다.**
> 문헌의 존재(제목·저널·연도·DOI·URL)는 검색 결과에 실제로 나타난 것만 기록했으나,
> **인용문의 정확한 워딩, 근거등급 문자(A/B/C), 숫자값은 원문 대조 전까지 신뢰하면 안 된다.**

특히 다음은 **채택 전에 사람이 원문을 열어 반드시 대조**해야 한다:
- JOSPT 2021 CPG의 근거등급 **문자(A/B/C)** 배정
- WHO 2023 권고의 **강도(strong/conditional)와 certainty**
- ACP 2017 권고 1/2/3의 **정확한 문장과 quality 표기**
- 모든 **숫자**(20시간, 520/920 MET-min, 표본수, 효과크기)

### 0.2 사용 가능했던 것

WebSearch만 작동했다. 검색 결과에 포함된 URL과 검색엔진이 생성한 요약을
근거로 삼았다. 검색 요약은 원문의 축약이므로 **오역·맥락 누락 가능성**이 있다.

### 0.3 이 문서가 하지 않는 것

- 임상 규칙을 창작하지 않는다. "발표된 것이 무엇인가"만 보고한다.
- 특정 환자에게 무엇을 하라고 정하지 않는다.
- 현재 20개 항목의 한국어 문안(시작기준/허용반응/중단기준)의 임상적 타당성을
  판정하지 않는다 — 그건 원장(Product Owner)과 임상 검토자의 몫이다.

---

## 1. 요약 — 현재 라이브러리에 대한 판정

### 1.1 지지되는 것 (카테고리 수준)

현재 20개는 **운동 유형(category) 수준에서는 주요 가이드라인과 충돌하지 않는다.**
- 만성 LBP에 대해 JOSPT 2021 CPG는 `trunk muscle strengthening and endurance`,
  `multimodal exercise`, `specific trunk muscle activation`, `aerobic exercise`,
  `aquatic exercise`, `general exercise`를 "should use"로 열거한다.
  현재 목록의 심부체간(9, 10), 체간지구력(11, 12), 기능(14, 15, 16),
  걷기(1, 2)는 모두 이 열거 안에 들어간다.
- NICE NG59는 운동을 **1차 치료의 핵심**으로 두되 "그룹 운동 프로그램(생체역학 /
  유산소 / 심신 / 혼합)을 고려(consider)"라고 쓴다. 현재 목록은 개별 홈운동
  중심이라 NICE의 "그룹·감독" 요소와는 방향이 다르다(→ 1.3).
- ACP 2017은 **만성** LBP 1차 치료로 exercise, motor control exercise,
  progressive relaxation, tai chi, yoga 등을 열거한다. 현재 목록의
  호흡·이완 훈련(20)은 `progressive relaxation` 계열로 대응된다.

### 1.2 빠진 것 (근거상 넣을 만한 것)

| 빠진 항목 | 근거 위치 | 우선도 |
|---|---|---|
| **명시적 유산소 운동** (걷기 이외: 자전거, 수중, 조깅) | Cochrane 2024 aerobic (CD015503); JOSPT 2021 CPG 만성 목록에 `aerobic`·`aquatic` 명시 | **높음** |
| **재발 예방용 점진적 걷기 프로그램** (치료용 걷기와 구분) | WalkBack RCT, Lancet 2024 | **높음** |
| **Pilates 계열** | Hayden 2021 Cochrane에서 Pilates가 상위 효과; JOSPT 2022 NMA | 중간 |
| **요가 / 태극권(심신 운동)** | ACP 2017 만성 권고 목록; NICE 그룹 프로그램의 mind-body | 중간 |
| **감독(supervision) / 총 프로그램 시간 개념** | WHO 2023 (≥20시간, 감독, 개인화); 홈운동 순응도 SR | **높음**(운동 자체가 아니라 **처방 구조**의 결손) |
| McGill curl-up, side bridge | 근거 약함 — 넣을 근거 불충분(→ 4.4) | 낮음 |

### 1.3 근거가 약한 것 / 과대표현 위험

1. **용량 숫자 전부.** "1회 5~10분, 하루 1~2회", "5~8회 1~2세트", "20~30초 × 2회"
   같은 숫자는 **어떤 가이드라인에도 없다.** 이건 이 문서의 가장 중요한 발견이며,
   코드 주석(`PRAGMATIC_STARTING_DEFAULT_NOT_CLINICAL_THRESHOLD`)이 이미
   정확하게 표기하고 있다 — 그 표기는 **유지되어야 하고 강화되어야 한다.**
2. **심부근 특이 활성화(9, 10)의 "우월성".** MCE는 다른 운동보다 **우월하지 않다**
   (Saragiotto 2016 Cochrane). 카테고리로는 가이드라인에 들어 있지만,
   "이게 더 좋은 운동"이라는 함의를 UI에 실으면 안 된다.
3. **고관절 강화(13) / 고관절 앞쪽 스트레칭(8).** 추가 이득 근거가 불확실하다.
   RCT 하나는 **추가 이득 없음**을 보고했다.
4. **방향성 운동(5, 6, 7)의 판정 근거.** centralization/peripheralization은
   **예후 지표로는 지지**되지만 **평가자 신뢰도가 낮고**(kappa 0.15–0.9),
   환자의 약 1/3에서는 반응 자체가 기록되지 않는다. 현재 라이브러리는 이 개념을
   중단기준·진행기준의 **핵심 판정축**으로 쓰고 있어 실제 신뢰도보다 무겁다.
5. **급성 LBP 적용.** 현재 20개는 급성/만성 구분 없이 하나의 세트다.
   그런데 **ACP 2017의 급성 권고 목록에는 운동이 없고**, JOSPT 2021도 급성은
   "may/can use"(약한 권고)이며 **다리 통증 없는 급성 LBP에는 RCT 자체가 부족**하다.
   → 급성/만성 분기가 없는 것이 현재 구조의 실질적 결손이다.

### 1.4 한 줄 판정

> 현재 Core-20은 **운동 유형의 선택은 방어 가능하나, (a) 용량 숫자, (b) 급성/만성
> 구분, (c) 처방 구조(감독·총 시간)** 세 축에서 문헌적 뒷받침이 비어 있다.
> 그리고 **문헌 인용이 0건**이라는 지적은 사실이며, 이 문서로도 아직 해소되지
> 않는다 — 원문 대조가 남아 있다.

---

## 2. Q1. 가이드라인 수준 권고 — 어떤 운동이 지지되는가

> 아래 모든 인용은 §0.1대로 **스니펫만 확인, 원문 미확인**이다.

### 2.1 JOSPT / APTA (AOPT) CPG 2021

- 서지: *Interventions for the Management of Acute and Chronic Low Back Pain:
  Revision 2021*, JOSPT 2021;51(11):CPG1–CPG60.
- URL: <https://www.jospt.org/doi/10.2519/jospt.2021.0304> (**차단됨**)
- PubMed: <https://pubmed.ncbi.nlm.nih.gov/34719942/> (**차단됨**)
- PDF 미러(검색 결과에 노출): `https://www.orthopt.org/uploads/content_files/files/jospt.2021.0304.pdf`,
  `https://4balance.ch/wp-content/uploads/2021/11/LBP-Guidlines-2021-jospt.2021.0304.pdf` (**둘 다 차단됨**)

**등급 체계** (해설 논문 `jospt.2021.0507` 관련 스니펫에서):
> "Grade A–level evidence corresponds with 'should use' … grade B–level evidence
> corresponds with 'may use' … grade C–level evidence corresponds with 'can use'"
- 해설 논문: <https://www.jospt.org/doi/10.2519/jospt.2021.0507> (**차단됨**)

**만성 LBP** (스니펫):
> "Physical therapists should use exercise training interventions, including
> trunk muscle strengthening and endurance, multimodal exercise interventions,
> specific trunk muscle activation exercise, aerobic exercise, aquatic exercise,
> and general exercise, for patients with chronic LBP."
- "should use" → 위 등급 체계상 **Grade A**로 추정. **단, 등급 문자를 직접 본 것은
  아니다 — 추정이며 원문 대조 필요.**

**급성 LBP** (스니펫 — **서로 다른 두 표현이 나왔다**):
> (a) "Physical therapists **may use** exercise training interventions, including
> trunk muscle strengthening and endurance and specific trunk muscle activation,
> to reduce pain and disability in patients with **acute LBP with leg pain**."
> (b) "Physical therapists **can use** exercise training interventions, including
> specific trunk muscle activation, for patients with acute LBP."

⚠️ (a)는 Grade B, (b)는 Grade C에 해당하는 동사다. **두 문장이 서로 다른 권고인지
(다리통증 유무로 나뉜 두 권고), 아니면 검색 요약의 부정확인지 확인 못 함.**
원문 §급성 운동 권고 절을 반드시 대조할 것.

**중요한 부정 소견** (스니펫):
> "there is a lack of RCTs examining exercise training interventions for patients
> with **acute LBP who do not have related leg pain**, and this paucity of clinical
> trials is the primary limiting factor in making a stronger recommendation"

→ **다리 통증이 없는 급성 요통에 대한 운동 근거는 가이드라인 스스로 부족하다고
명시한다.** 현재 라이브러리가 급성 환자에게 20개를 그대로 제시한다면 이 사실이
UI/문안에 반영돼야 한다.

**기타** (스니펫): 2021 개정판은 dry needling, cognitive functional therapy,
pain neuroscience education을 새로 다룬다. thrust/nonthrust joint mobilization은
급성·만성 모두에서 유지된다.

### 2.2 NICE NG59 (영국)

- 서지: *Low back pain and sciatica in over 16s: assessment and management*,
  NICE guideline NG59. 최초 2016-11-30, 최종 갱신 2020-12-11.
- URL: <https://www.nice.org.uk/guidance/ng59> (**차단됨**),
  <https://www.nice.org.uk/guidance/ng59/chapter/recommendations> (**차단됨**),
  <https://www.nice.org.uk/guidance/ng59/ifp/chapter/Exercise-and-physical-activity> (**차단됨**)

권고 (스니펫):
> "Consider a group exercise programme (biomechanical, aerobic, mind–body or a
> combination of approaches) within the NHS for people with a specific episode
> or flare-up of low back pain with or without sciatica."

- 동사는 **"consider"** — offer가 아니다. (강도 약함)
- 형태는 **그룹 프로그램**이 기본형.
- 운동 예시로 stretching, strengthening, aerobic, yoga, Tai Chi가 언급된다.
- **위험 층화**: "use risk stratification (for example, the STarT Back risk
  assessment tool) at first point of contact … for each new episode".
- ⚠️ **권고 번호(1.2.x)를 확인하지 못했다.** 스니펫에 번호가 없었다. 인용 시 번호를
  붙이지 말 것.

### 2.3 ACP 2017 (Qaseem et al., Annals of Internal Medicine)

- 서지: *Noninvasive Treatments for Acute, Subacute, and Chronic Low Back Pain:
  A Clinical Practice Guideline From the American College of Physicians*,
  Ann Intern Med. 2017. DOI 10.7326/M16-2367.
- URL: <https://www.acpjournals.org/doi/10.7326/M16-2367> (**차단됨**)
- PubMed: <https://pubmed.ncbi.nlm.nih.gov/28192789/> (**차단됨**)

**권고 1 (급성/아급성)** (스니펫):
> "clinicians and patients should select nonpharmacologic treatment with
> superficial heat (moderate-quality evidence), massage, acupuncture, or spinal
> manipulation (low-quality evidence)"

→ **급성 권고 목록에 운동(exercise)이 없다.** 이건 현재 라이브러리에 직접 관련된
가장 중요한 가이드라인 소견 중 하나다.

**권고 2 (만성)** (스니펫):
> "clinicians and patients should initially select nonpharmacologic treatment with
> exercise, multidisciplinary rehabilitation, acupuncture, mindfulness-based stress
> reduction (moderate-quality evidence), tai chi, yoga, motor control exercise,
> progressive relaxation, electromyography biofeedback, low-level laser therapy,
> operant therapy, cognitive behavioral therapy, or spinal manipulation
> (low-quality evidence)" — **strong recommendation**

**권고 3**: 약물치료에 관한 것으로 보이나 **스니펫에서 확인 못 함.**

⚠️ 별도 스니펫에 "evidence was insufficient to determine the effectiveness of
Pilates, tai chi, and yoga"라는 상충되는 문장이 나왔다. 이는 ACP 본문이 아니라
근거로 삼은 AHRQ 체계적 고찰의 특정 비교 문맥일 가능성이 높지만 **확인 못 함.**
Pilates/yoga/tai chi를 라이브러리에 넣기 전 이 문장의 출처를 반드시 특정할 것.

### 2.4 WHO 2023 (만성 1차성 요통, 성인)

- 서지: *WHO guideline for non-surgical management of chronic primary low back
  pain in adults in primary and community care settings*, 2023.
- URL(검색 결과에 노출): <https://www.ncbi.nlm.nih.gov/books/NBK599212/>,
  근거·권고 장 <https://www.ncbi.nlm.nih.gov/books/NBK599213/> (**둘 다 차단됨**)
- WHO 행사 페이지: <https://www.who.int/news-room/events/detail/2023/12/07/default-calendar/who-guideline-for-non-surgical-management-of-chronic-primary-low-back-pain-in-adults-in-primary-and-community-care-settings> (**차단됨**)
- 해설 논문(PMC): <https://pmc.ncbi.nlm.nih.gov/articles/PMC12232859/> (**차단됨**)

권고 (스니펫):
> "A structured exercise therapy or programme **may be offered** as part of care to
> adults, including older people, with CPLBP. … programmes are generally being more
> beneficial if they are **tailored to the clinical profile of the individual
> (personalised)**, **supervised** (individual supervision, group supervision, or
> performed at home with practitioner follow up), and encourage a **high dose
> (at least 20 h of total programme time)**."

- 이것이 **주요 가이드라인 중 유일하게 구체적 용량 수치를 제시한 문장**이다.
- ⚠️ 권고 강도(strong/conditional)와 certainty of evidence를 **확인 못 함.**
  "may be offered"는 conditional을 시사하나 확정할 수 없다.
- 근거가 된 체계적 고찰: *Systematic Review to Inform a WHO CPG: Benefits and
  Harms of Structured Exercise Programs for Chronic Primary Low Back Pain in
  Adults* — <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10684665/> (**차단됨**)

### 2.5 한국어 가이드라인

**확인 못 함 — 이 항목은 사실상 실패했다.**

- 국가한의임상정보포털(NIKOM): <https://nikom.or.kr/> — 한의표준임상진료지침이
  존재한다는 것까지만 확인. 검색 스니펫에 "27개 권고, 8개 임상적 고려사항,
  11개 한의 치료(침·전침·온침·화침·도침·매선·약침·추나·부항·뜸·한약)"라는 서술이
  나왔으나, **이것이 "요통" 지침인지 다른 상병(예: 경항통, 요추추간판탈출증)
  지침인지 특정하지 못했다.** 인용하면 안 된다.
- 대한의사협회지 리뷰: "Exercise for patients with low back pain",
  <https://jkma.org/m/journal/view.php?number=3563> — **가이드라인이 아니라 리뷰
  논문**이다. 검색 요약에 나온 "운동요법의 기전(신경근 기계적 압박 감소, 염증반응
  완화, 자가면역반응 조절)"은 이 리뷰의 서술로 보이나 원문 미확인.

→ **한국어 가이드라인 반영은 별도 작업으로 남긴다.** 원장이 NIKOM/대한한의학회
지침 PDF를 직접 받아 제공하는 것이 가장 확실하다.

### 2.6 Q1 정리표 — 급성 vs 만성

| | 급성 / 아급성 LBP | 만성 LBP |
|---|---|---|
| **JOSPT 2021** | 운동 = 약한 권고. "may/can use"(B 또는 C 추정). trunk strengthening·endurance, specific trunk muscle activation. **다리통증 없는 급성은 RCT 부족 명시** | 운동 = "should use"(A 추정). trunk strengthening·endurance, multimodal, specific trunk activation, **aerobic**, **aquatic**, general exercise |
| **NICE NG59** | 그룹 운동 프로그램 "consider"(생체역학/유산소/심신/혼합). STarT Back 층화 | 동일 프레임 |
| **ACP 2017** | **운동 없음.** 표재열(moderate), 마사지·침·척추도수(low) | exercise, MDR, 침, MBSR(moderate); tai chi, yoga, MCE, progressive relaxation, EMG biofeedback, LLLT, operant, CBT, SMT(low). **strong recommendation** |
| **WHO 2023** | (대상 아님 — CPLBP 지침) | structured exercise "may be offered"; 개인화·감독·**총 ≥20시간** |
| **한국 지침** | 확인 못 함 | 확인 못 함 |

---

## 3. Q2. 용량(dose) 근거

### 3.1 핵심 발견: 가이드라인은 용량에 대해 "침묵"한다

- 서지: Comachio J, Ferreira ML, Mork PJ, Holtermann A, et al.
  *Clinical guidelines are silent on the recommendation of physical activity and
  exercise therapy for low back pain: A systematic review.*
  J Sci Med Sport. 2024;27(4):257–265.
- URL: <https://www.jsams.org/article/S1440-2440(24)00020-3/fulltext> (**차단됨**),
  <https://www.sciencedirect.com/science/article/pii/S1440244024000203> (**차단됨**)

스니펫:
> "When guidance is provided, recommendations typically **lack specificity concerning
> the type, intensity, duration, and frequency of exercise** and, in many cases,
> represent a combination of scarce available evidence and stakeholder perspectives."
> "no guidelines provided recommendations for the primary prevention of low back
> pain or incorporated adequate physical activity aspects considering type, dosage,
> frequency, and intensity."
> 18개 지침 포함. **100%가 최소 1종의 supervised exercise를 권고**, 88%가
> "stay physically active"를 권고. 5개(27%)만 근거 품질이 satisfactory.

→ **질문 Q2에 대한 답은 "가이드라인은 구체적 용량을 제시하지 않는다"이며,
이것은 문헌으로 뒷받침되는 사실이다.** (전체 논문 한 편이 이 결론이다.)

### 3.2 문헌에 실제로 존재하는 용량 숫자 (전부 가이드라인 밖)

| 출처 | 숫자 | 성격 |
|---|---|---|
| **WHO 2023 CPLBP** | 총 프로그램 시간 **≥20시간** ("high dose") | 유일한 가이드라인 수준 용량 언급 |
| **Hayden 2021 Cochrane** (CD009790.pub2) | 249 RCT 중 **68%(288 study group)가 저용량(<20시간)** / 개별감독 38%, 그룹감독 38% | 기술 통계(무엇이 연구되었나), 권고 아님 |
| **Bayesian dose NMA, JOSPT 2024** (10.2519/jospt.2024.12153) | MCID 도달 **520 MET-min/주**, 최대 반응 **920 MET-min** (SMD −1.74, 95% CrI −2.43 ~ −1.04), **U자형** 용량-반응, **low~moderate certainty** | 단일 NMA. **520과 920의 단위가 동일한지(둘 다 주당인지) 스니펫에서 불일치 — 확인 못 함** |
| **안정화운동 용량-반응 메타회귀** (PMC7547082) | "optimal dose-response-relationship … is still unknown" | 부정 소견 |

- Hayden 2021: <https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD009790.pub2/full> (**차단됨**), PubMed 34580864
- Hayden 2023 NMA: <https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD015608/references> (**차단됨**, 내용 확인 못 함)
- JOSPT 2024 dose NMA: <https://www.jospt.org/doi/abs/10.2519/jospt.2024.12153> (**차단됨**), PubMed 38457134
- 메타회귀: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7547082/> (**차단됨**)

### 3.3 현재 라이브러리 용량에 대한 판정

현재 20개 항목의 모든 숫자 — `5~10분`, `하루 1~2회`, `5~8회 1~2세트`,
`10~30초 × 3~5회`, `20~30초 × 2회/측`, `8~12회`, `2~5분` — 는
**어떤 가이드라인·체계적 고찰에도 대응하는 근거가 없다.**

이건 잘못이 아니다. **문헌 자체가 그 층위(개별 운동의 sets/reps)를 다루지 않는다.**
따라서 올바른 대응은 "숫자를 문헌으로 바꾸기"가 아니라 **"숫자의 지위를 정직하게
표시하고, 문헌이 실제로 말하는 층위(총 시간·감독·개인화)를 별도 필드로 추가하기"**다.
→ §7 참조.

---

## 4. Q3. 단계/진행(staging) 체계

### 4.1 TBC — Alrwaily et al. 2016

- 서지: Alrwaily M, Timko M, Schneider M, Stevans J, Bise C, Hariharan K, Delitto A.
  *Treatment-Based Classification System for Low Back Pain: Revision and Update.*
  Phys Ther. 2016;96(7):1057–1066.
- URL: <https://academic.oup.com/ptj/article/96/7/1057/2864925> (**차단됨**),
  PubMed <https://pubmed.ncbi.nlm.nih.gov/26637653/> (**차단됨**)
- PDF 미러: `https://www.psp.pitt.edu/pdfs/TBC.pdf`,
  `https://www.orthodiv.org/wp-content/uploads/2021/08/...watermark.pdf` (**둘 다 차단됨**)
- 관련 코멘터리(있음, 원문 미확인): Phys Ther. 2016;96(10):1669,
  <https://academic.oup.com/ptj/article/96/10/1669/2870255>

**세 접근법 정의** (스니펫):

| 접근 | 대상 | 목표 |
|---|---|---|
| **Symptom modulation** | "patients with a recent—new or recurrent—LBP episode that has caused significant symptomatic features"; "spinal movement is hindered **primarily by significant pain and symptomatic features**" | "control the noxious pain generator(s) and its sequelae that interfere with lumbar movement" |
| **Movement control** | "spinal movement is hindered more by **dysfunctional joint and soft tissue compliance and neuromuscular control**"; "**moderate** pain and disability status" | "improve joint and soft tissue compliance, and to integrate that with appropriate neuromuscular control in order to improve the quality of the lumbar movement" |
| **Function optimization** | "**low** pain and disability status" | 스니펫에서 목표 문장 **확인 못 함** |

**임상 상태(clinical status) 3분류** (스니펫):
- **Volatile**: "clinical status easily aggravated by minor movements"
- **Stable**: "status increases with certain movements but returns to baseline relatively quickly"
- **Well-controlled**: "mostly asymptomatic but aggravated with increased performance demands"

**각 단계에 배정된 중재 목록: 확인 못 함.** 스니펫에서 중재 목록 자체가 나오지 않았다.
(일반적으로 symptom modulation에 directional preference exercise / manipulation /
traction 등이 배정된다고 알려져 있으나, **이 문서에서는 그것을 사실로 쓰지 않는다.**
원문 대조 전까지 미기재.)

### 4.2 배정 지표와 컷오프 — **명시된 수치 컷오프를 찾지 못했다**

이것이 Q3의 실질적 답이다.

스니펫:
> "Disability can be assessed with **any outcome measure of disability**
> (e.g., Modified Oswestry Disability Questionnaire, Roland-Morris Disability
> Questionnaire)."

- 즉 논문은 **특정 도구를 지정하지 않고**, "high / moderate / low disability"라는
  **서술적 구간**만 쓴다.
- **ODI %나 NPRS 점수의 숫자 컷오프는 검색으로 확인되지 않았다.**
  전용 검색("high/moderate/low disability … percentage cutoff")에서도 나오지 않았고,
  검색엔진 스스로 "the search results ... do not provide specific percentage cutoffs"
  라고 응답했다.
- 참고: Modified ODI 채점 자체는 0~100%로 환산된다는 것만 확인
  (<https://www.medbridge.com/blog/oswestry-disability-index>, **차단됨**).

⚠️ **판정: TBC 2016은 숫자 컷오프를 제시하지 않는 것으로 보인다. 단, "제시하지
않는다"를 최종 확정하려면 원문 Table을 봐야 한다 — 현재는 "찾지 못했다" 상태다.**
Samindang 시스템에서 단계 배정에 숫자 컷오프를 쓰려면 그건 **TBC의 인용이 아니라
Samindang의 자체 규정**이며, 그렇게 표기해야 한다.

### 4.3 TBC — Movement control 논문 (2017)

- 서지: Alrwaily M, Timko M, Schneider M, Kawchuk G, Bise C, Hariharan K,
  Stevans J, Delitto A. *Treatment-based Classification System for Patients With
  Low Back Pain: The Movement Control Approach.* Phys Ther. 2017;97(12):1147–1157.
  DOI 10.1093/ptj/pzx087.
- URL: <https://academic.oup.com/ptj/article/97/12/1147/4097724> (**차단됨**)
- **내용 확인 못 함** — 존재와 서지만 확인.

### 4.4 STarT Back

- **NICE NG59가 명시적으로 STarT Back을 예시로 들어 first-contact 층화를 권고**한다(§2.2).
- Keele 층화 모델 (스니펫, <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5291975/> **차단됨**):
  > 전원 30분 세션(안심·교육 + 점수별 치료). **저위험**: 추가 중재 없음.
  > **중위험**: 물리치료 의뢰(주로 신체적 예후 인자). **고위험**: 심리학적 정보를
  > 반영한 물리치료 의뢰(불안·공포 등 심리사회 인자 대응). 고위험군은
  > "enhanced treatment and **more sessions**".
- 원 RCT: Hill JC et al., Lancet 2011 (STarT Back). IMPaCT Back:
  Foster NE et al., Ann Fam Med 2014. — **둘 다 서지만 확인, 원문·초록 미확인.**
- **중요한 반대 근거**: *Stratified health care for low back pain using the STarT
  Back approach: holy grail or doomed to fail?*
  <https://pubmed.ncbi.nlm.nih.gov/39037849/> (**차단됨**, 2024) — 제목이
  시사하는 비판적 재평가가 존재한다. **내용 확인 못 함.**

**Q3의 STarT Back 하위질문 답**:
> STarT Back은 **"운동 강도"를 직접 배정하지 않는다.** 배정하는 것은
> **치료 경로(pathway)와 세션 수/심리사회 요소 포함 여부**다. 층화 결과가
> 결과적으로 더 많은 세션·감독을 뜻하므로 간접적으로 "강도"에 영향을 주지만,
> "고위험 → 운동 강도 상향" 같은 규칙은 **문헌에 없다.** (스니펫 수준 판단)

---

## 5. Q4. 빠진 것 / 근거가 약한 것

### 5.1 McGill Big 3 — curl-up, side bridge

**판정: 가이드라인 수준 근거 없음. 개별 운동 수준의 근거는 약하다.**

- 어떤 가이드라인(JOSPT 2021 / NICE / ACP / WHO)도 curl-up이나 side bridge를
  **개별 운동으로 지명하지 않는다.** 지명되는 것은 "trunk muscle strengthening and
  endurance" 같은 **카테고리**다. Big 3는 그 카테고리의 한 구현일 뿐이다.
- 존재하는 문헌:
  - *The McGill Approach to Core Stabilization in the Treatment of Chronic Low
    Back Pain: A Review* — **medRxiv 프리프린트**,
    <https://www.medrxiv.org/content/10.1101/2022.01.21.22269311v1> (**차단됨**).
    ⚠️ **동료심사 전 프리프린트다. 임상 근거로 쓰면 안 된다.**
  - 6주 RCT에서 McGill 방식이 conventional therapy와 **비슷한** 개선
    (스니펫; 정확한 서지 미확인 — researchgate 항목 "McGill Exercises versus
    Conventional Exercises in Chronic Low Back Pain"). ⚠️ **서지 불완전, 인용 불가.**
  - bridging + bird-dog 이중맹검 RCT: **건강한 젊은 남성** 대상, 체간 수행·동적
    균형에서 **대조군 대비 개선 없음**. <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12140198/>
    (**차단됨**) — **LBP 환자 대상이 아니므로 우리 목적에 직접 적용 불가.**
  - Squat University, BodySpec, 개별 클리닉 블로그 등은 **전문가 의견/상업 콘텐츠**로
    근거등급 최하위. 인용하지 않는다.

**결론**: curl-up / side bridge를 "근거 때문에" 추가할 이유는 **없다.**
현재 목록에 이미 bird-dog(11)과 bridge(12)가 있으므로 카테고리 커버리지는 충족된다.
추가한다면 그것은 **임상 편의·현장 관행에 의한 선택**이며 그렇게 표기해야 한다.

### 5.2 유산소 운동 — **가장 명확한 결손**

- **JOSPT 2021 만성 목록에 `aerobic exercise`와 `aquatic exercise`가 명시적으로
  포함**된다(§2.1). 현재 라이브러리에는 유산소가 **걷기(1, 2)뿐**이고, 그 걷기도
  "짧게 걷기 5~10분" 수준의 **활동 재개(activity resumption)** 성격이지
  유산소 트레이닝이 아니다.
- Cochrane 2024: de Zoete A, et al. *Aerobic exercise therapy for chronic low
  back pain.* CDSR. DOI 10.1002/14651858.CD015503.
  <https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD015503/full> (**차단됨**),
  PMC <https://pmc.ncbi.nlm.nih.gov/articles/PMC11145739/> (**차단됨**)
  - 스니펫: "running, cycling, or walking **may be better** than a variety of
    different treatments for chronic low back pain" — "may be"는 낮은 확실성 시사.
    **GRADE 등급 확인 못 함.**
- 별도 SR (17연구, 1146명): "aerobic exercise **combined with** other interventions
  was more effective than aerobic exercise alone"
  <https://pubmed.ncbi.nlm.nih.gov/37854288/> (**차단됨**)
- ACP 2017 만성 목록에는 `aerobic`이라는 단어가 스니펫에 나오지 않았다 — 확인 못 함.
- NICE는 그룹 프로그램 유형에 `aerobic`을 명시.

**권고**: 유산소를 별도 항목으로 추가 (→ §8).

### 5.3 걷기 — 재발 예방 근거가 따로 있다

- WalkBack RCT: Pocovi NC, et al. *Effectiveness and cost-effectiveness of an
  individualised, progressive walking and education intervention for the
  prevention of low back pain recurrence in Australia (WalkBack): a randomised
  controlled trial.* Lancet. 2024 (온라인 2024-06-19, 인쇄 2024-07-13).
  <https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(24)00755-4/fulltext> (**차단됨**)
- 부속 논평: <https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(24)01247-9/abstract> (**차단됨**)
- 2차 분석: JOSPT 2025, DOI 10.2519/jospt.2025.13361 (**차단됨**)
- 스니펫: 25개 호주 민간 물리치료 클리닉, 은폐 배정 병행군 RCT.
  "the first randomised controlled trial assessing the effectiveness of a
  walking-based intervention to prevent low back pain recurrence."
  삶의 질 개선, 의료 이용 및 결근이 **약 절반**으로 감소.
  ⚠️ **주 결과지표(재발까지의 시간)의 HR 등 수치는 확인 못 함.**

→ 현재 항목 1, 2("짧게 걷기", "짧게 걷고 쉬기")는 **급성기 활동 재개**용이다.
WalkBack이 지지하는 것은 **회복기 이후의 개인화·점진적 걷기 + 교육 프로그램**으로,
**목적이 다른 별개 항목**이다.

### 5.4 Pilates / 요가 / 태극권

| 운동 | 근거 위치 | 등급 |
|---|---|---|
| **Pilates** | Hayden 2021 Cochrane: "Pilates, McKenzie therapy, and functional restoration were more effective than other types of exercise". JOSPT 2022 NMA *Best Exercise Options … Pilates, Strength, Core-Based, and Mind-Body* (10.2519/jospt.2022.10671). JOSPT 2024 dose NMA에서 "Pilates was the most effective" | 체계적 고찰 / NMA. **가이드라인 지명은 확인 못 함** |
| **요가** | ACP 2017 만성 권고 목록 (**low-quality evidence**). NICE 그룹 프로그램 예시 | 가이드라인 권고(근거 낮음) |
| **태극권** | ACP 2017 만성 권고 목록 (**low-quality evidence**). "moderate-quality evidence showed tai chi moderately decreased pain intensity at 3 and 6 months compared with backward walking or jogging but not versus swimming"(스니펫, 출처 특정 못 함). NICE 예시. Qigong/Tai Chi SR·메타분석 <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12173434/> (**차단됨**) | 가이드라인 권고(근거 낮음) |

⚠️ §2.3의 상충 문장("insufficient to determine the effectiveness of Pilates,
tai chi, and yoga")이 미해결이다. **넣기 전에 이 문장의 출처와 문맥을 특정할 것.**

**한의원 맥락 코멘트(사실 아님, 판단 유보)**: Pilates/요가/태극권은 장비·강사·
집단 세션 전제가 강해 1:1 진료실 홈운동 처방과 전달 구조가 다르다. 근거는 있으나
**전달 가능성(deliverability)이 별개 문제**다 — 이건 원장이 판단할 사항이다.

### 5.5 우리 목록에 있는데 근거가 약한 것

#### (a) 심부근 특이 활성화 (9 `LBP_DEEP_TRUNK_01`, 10 `LBP_DEEP_TRUNK_03`)

- Saragiotto BT, Maher CG, Yamato TP, et al. *Motor control exercise for chronic
  non-specific low-back pain.* Cochrane Database Syst Rev. 2016;(1):CD012004.
  <https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD012004/full> (**차단됨**),
  PubMed <https://pubmed.ncbi.nlm.nih.gov/26742533/> (**차단됨**)
- 스니펫: MCE는 "activation of the deep trunk muscles … progressing to more
  complex and functional tasks". 결론: **"no single form of exercise is superior
  to another for chronic low back pain"** — MCE가 다른 운동보다 우월하다는 근거 없음.
- 최신 검토(2023 narrative review, <https://pmc.ncbi.nlm.nih.gov/articles/PMC10321050/>, **차단됨**)
  존재. 내용 확인 못 함. **2023~2024년의 새로운 체계적 고찰로 결론이 뒤집혔다는
  증거는 찾지 못했다.**
- Core stability vs general exercise 메타분석 (PLOS ONE 2012,
  <https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0052082>, **차단됨**):
  스니펫 — 단기에는 core stability가 유리할 수 있으나 **3개월 이후 장기 차이 없음.**

→ **결론: 유지하되, "특별히 좋은 운동"이라는 함의를 제거.** ACP 2017과 JOSPT 2021이
MCE/specific trunk muscle activation을 **목록에 포함**시키므로 제거할 이유는 없다.
문제는 위계이지 존재가 아니다.

#### (b) 고관절 항목 (8 `LBP_HIP_MOB_01`, 13 `LBP_HIP_STR_03`)

- SR: *Effect of Hip Muscle Strengthening Exercises on Pain and Disability in
  Patients with Non-Specific Low Back Pain — A Systematic Review.*
  Sports. 2023;11(9):167. DOI 10.3390/sports11090167.
  <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10536491/> (**차단됨**)
  - 스니펫: "**Uncertain evidence** suggested that hip strengthening enhances the
    short-term effect of other active interventions on pain intensity and disability"
- RCT (Brazilian J Phys Ther): *Does adding hip strengthening exercises to manual
  therapy and segmental stabilization improve outcomes …?*
  <https://www.rbf-bjpt.org.br/en-does-adding-hip-strengthening-exercises-articulo-S1413355521001027> (**차단됨**)
  - 스니펫: "specific hip strengthening exercises **do not provide additional
    benefits** to clinical and kinematic outcomes"
- 다른 SR/메타분석(PMC9776732)은 "may be beneficial … moderate for pain, low for
  disability"로 다소 우호적. **상충한다.**

→ **결론: 근거는 불확실·상충. 제거까지는 아니나 "격하" 대상.**
고관절 항목이 기본 세트에 자동 포함되기보다 **선택적**이어야 한다.

#### (c) 신경 slider (17 `LBP_NEURAL_01`)

- SR/메타분석: *Neural Mobilization for Reducing Pain and Disability in Patients
  with Lumbar Radiculopathy: A Systematic Review and Meta-Analysis* (2023).
  <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10744707/> (**차단됨**)
  - 스니펫: 20 RCT, 877명. 통증·장애 감소에 효과. ⚠️ **효과크기·certainty 확인 못 함.**
- 다른 SR: <https://pubmed.ncbi.nlm.nih.gov/35583521/> (**차단됨**, 8연구)
- slider vs tensioner: "slider … more effective in the treatment of acute
  conditions than tensioner"(스니펫; **출처 특정 못 함 — 인용 금지**).
- ⚠️ **어떤 주요 가이드라인도 neural mobilization을 지명하지 않았다**(검색 범위 내).
  JOSPT 2021이 다루는지 **확인 못 함.**

→ **결론: 체계적 고찰 수준 지지는 있음(radiculopathy 대상). 가이드라인 지명은 미확인.**
현재 항목의 "sustained tensioner로 자동 전환하지 않음"이라는 진행 규칙은
문헌으로 확인 못 한 Samindang 자체 안전 규칙이다 — 그렇게 표기할 것.

#### (d) 단계적 노출 (18, 19)

- Macedo LG, et al. *Graded Activity and Graded Exposure for Persistent
  Nonspecific Low Back Pain: A Systematic Review.* Phys Ther. 2010;90(6):860–879.
  <https://pubmed.ncbi.nlm.nih.gov/20395306/> (**차단됨**)
  - 스니펫: graded activity는 minimal intervention보다 단기·중기에 **약간** 우수,
    **다른 형태의 운동보다는 우수하지 않다.** graded exposure는 minimal treatment나
    graded activity와 **동등**.
- Cochrane 2025: *Graded activity for acute and subacute low back pain*
  (CD015509), <https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD015509/full> (**차단됨**),
  PubMed 39868574. 그리고 *Graded activity for chronic low back pain*,
  PubMed 39936503. **둘 다 존재만 확인, 결론 확인 못 함.**

→ **결론: 유지 타당. 단 "다른 운동보다 낫다"는 주장 금지.**

#### (e) 호흡·이완 (20 `LBP_REG_01`)

- ACP 2017 만성 권고 목록에 **`progressive relaxation`이 명시**(low-quality evidence).
- 현재 항목은 "느린 호흡·이완"으로 progressive muscle relaxation과 정확히 같지 않다.
  **호흡 훈련(breathing exercise) 단독의 근거는 확인 못 함.**

→ **결론: 유지. 단 근거는 `progressive relaxation`(low quality)에 걸쳐 있고
호흡법 자체의 근거는 미확인이라고 표기.**

---

## 6. Q5. 중단 기준 / 안전

### 6.1 운동 중 신경학적 악화의 정의·감시 — **가이드라인 수준 프로토콜 확인 못 함**

검색 범위 내에서 **"운동 중 신경학적 악화를 이렇게 정의하고 매 세션 이렇게
감시하라"는 가이드라인 문장을 찾지 못했다.** 찾은 것은 **red flag 기반 의뢰 기준**
(=진료 시점 스크리닝)이며, **운동 세션 내 실시간 감시 기준이 아니다.**

→ 현재 라이브러리 20개 전 항목의 `stopReviewKo`("새로운 또는 진행하는 신경증상",
"하지 원위부 증상 확산" 등)는 **문헌 인용이 아니라 Samindang의 자체 안전 규칙**이다.
임상적으로 합리적일 수 있으나 **"가이드라인에 근거한다"고 표기하면 안 된다.**

### 6.2 Red flag — 마미증후군

- NICE CKS가 마미증후군 red flag를 개정했다는 사실은 **2차 출처**로만 확인:
  - <https://www.medicalprotection.org/uk/articles/mps-works-with-nice-to-revise-cauda-equina-syndrome-red-flags> (**차단됨**)
  - <https://www.gponline.com/cauda-equina-syndrome-changes-nice-cks-red-flags/musculoskeletal-disorders/article/1464440> (**차단됨**)
  - ⚠️ **법률사무소·보험사 블로그가 다수다. 1차 출처(NICE CKS)를 확인 못 했다.**
- 스니펫에 나온 red flag 항목:
  > 양측 하지의 심하거나 진행하는 신경학적 결손(무릎 신전, 발목 외번, 발등굽힘의
  > 주요 근력 저하), 배뇨 개시 곤란 또는 요류 감각 저하, 직장 충만감 소실,
  > 회음부·항문주위·생식기 감각 소실(안장 마취/이상감각)
- "If not decompressed urgently, cauda equina symptoms can become permanent, and
  surgery may be needed within hours of symptom onset."

→ **red flag ↔ 운동 처방의 관계에 대한 명시적 가이드라인 문장은 확인 못 함.**
"red flag 있으면 운동 금기"는 검색엔진의 추론이었지 인용 가능한 문장이 아니다.
논리적으로는 자명하나, **문헌 인용으로 쓰면 안 된다.**

### 6.3 centralization / peripheralization

- May S, Aina A 계열: *Centralization and directional preference: An updated
  systematic review with synthesis of previous evidence.*
  Musculoskelet Sci Pract. 2018. <https://pubmed.ncbi.nlm.nih.gov/30273918/> (**차단됨**),
  <https://www.sciencedirect.com/science/article/abs/pii/S2468781218302066> (**차단됨**)
  - 저자원고 PDF(검색 결과에 노출): `https://shura.shu.ac.uk/22921/9/May-CentralizationDirectionalPreference(AM).pdf` (**차단됨**)
- 선행 SR: *Centralization and directional preference: A systematic review*,
  <https://www.sciencedirect.com/science/article/abs/pii/S1356689X12000999> (**차단됨**)

스니펫 소견:

| 측면 | 소견 | 등급 |
|---|---|---|
| **예후 인자** | "twenty-one of 23 studies supported the prognostic validity of centralization, including 3 high quality studies and 4 of moderate quality; whereas 2 moderate quality studies showed evidence that did not support" | **체계적 고찰 — 지지** |
| **치료효과 조절인자** | ⚠️ **상충**: "useful treatment effect modifiers in 7 out of 8 studies" (선행 SR) vs "**there was no evidence** that these might be important treatment effect modifiers" (갱신 SR) | **상충 — 확정 불가** |
| **신뢰도** | "One study evaluated reliability, and found **generally poor levels, despite training**"; "levels of reliability were **very variable (kappa 0.15–0.9)** in 5 studies" | **약점 — 중요** |
| **적용 범위** | "Neither clinical response was recorded in **about a third of patients**" | **약점 — 중요** |
| **권고** | "worthwhile indicators of prognosis, and should be routinely examined for even in patients with chronic low back pain" | 저자 결론 |

→ **결론: 개념의 예후적 가치는 체계적 고찰 수준으로 지지된다. 그러나 (a) 평가자
신뢰도가 낮고, (b) 환자 1/3에서는 판정 불가이며, (c) "치료 배정 기준"으로서의
근거는 상충한다.**

이건 현재 라이브러리에 직접적 함의가 있다: 항목 5, 6, 7의 시작기준·허용반응·
중단기준이 모두 centralization/peripheralization 판정에 걸려 있는데,
**그 판정 자체가 신뢰도 낮고 1/3에서 불가능하다.** → 판정 불가 상태를 명시적으로
표현하는 경로가 필요하다(§9).

---

## 7. Q6. 한의원 맥락

### 7.1 침·추나 + 운동 병행

| 근거 | 내용 | 등급 |
|---|---|---|
| **ACP 2017** | **급성**: 침(low-quality), 척추도수(low-quality) 권고 목록 포함. **만성**: 침(moderate-quality) 권고 목록 포함 | **가이드라인 권고** |
| **NICE NG59** | ⚠️ NICE의 침에 대한 입장(2016 원판은 권고하지 않음 → 2020 갱신 여부)을 **확인 못 함.** 인용 금지 | 확인 못 함 |
| **침 + core 운동 SR/메타분석** | *Clinical efficacy of acupuncture therapy combined with core muscle exercises in treating patients with chronic nonspecific low back pain*, Front Med. 2024;11:1372748. <https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2024.1372748/full> (**차단됨**), PMC11024316. 스니펫: 11 RCT, n=727. 병행군이 core 운동 단독 대비 통증·ODI 개선. ⚠️ **비뚤림 위험·연구 지역 확인 못 함 — 소규모 RCT 다수일 가능성** | 체계적 고찰(질 미확인) |
| **침 = 부가치료 SR** | <https://www.sciencedirect.com/science/article/pii/S2213422023000513> (**차단됨**). 스니펫: 4 RCT, n=374, 침 + 통상치료 vs 통상치료 — **통증은 차이 없음**, 장애는 감소 | 체계적 고찰 — **혼재** |
| **추나(chuna)** | 한의 지침에 포함된다는 서술만(§2.5). **요통에 대한 추나+운동 병행 근거는 확인 못 함** | 확인 못 함 |

→ **결론: "침 + 운동 병행"에 대한 체계적 고찰 수준 근거는 존재하나 결과가
일관되지 않는다(통증 무차이 vs 개선). 가이드라인은 침과 운동을 각각 권고할 뿐
"병행 시너지"를 권고하지 않는다.**

### 7.2 홈운동 순응도

- Beinart 계열 SR: *Individual and intervention-related factors associated with
  adherence to home exercise in chronic low back pain: a systematic review.*
  <https://pubmed.ncbi.nlm.nih.gov/24169445/> (**차단됨**)
  - 스니펫: "**Up to 70% of patients do not engage in prescribed home exercise**".
    순응도 증가와 연관된 **moderate evidence** 4요인:
    (1) greater **health locus of control**, (2) **supervision**,
    (3) participation in an **exercise program**,
    (4) participation in a general **behavior change program incorporating
    motivational strategies**.
- 감독 유무 비교 SR: <https://www.sciencedirect.com/science/article/abs/pii/S1746068925000343> (**차단됨**)
  - 스니펫: "unsupervised home exercise appears to be **less effective** than
    supervised in-person exercise in effectively reducing pain intensity and
    functional disability **in the short term**"
- JOSPT 2023 scoping review (292 RCT): *Home Exercise Programs Are Infrequently
  Prescribed in Trials of Supervised Exercise for Individuals With Low Back Pain.*
  DOI 10.2519/jospt.2023.11448. <https://www.jospt.org/doi/10.2519/jospt.2023.11448> (**차단됨**)
  - 스니펫: "Guidelines for prescribing home exercise programs for low back pain
    are **generic**, and the dose to aim for when home exercise programs are
    delivered alongside a supervised exercise program is **unclear**."
- 홈운동 SR/다변량 메타분석: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12428419/> (**차단됨**),
  DOI 10.3390/healthcare13172094. 내용 확인 못 함.

→ **Samindang에 대한 함의**: 현재 시스템은 **순수 홈운동 처방**이다. 문헌은
(a) 홈운동만으로는 감독 운동보다 효과가 낮고, (b) 최대 70%가 이행하지 않으며,
(c) **감독과 행동변화 전략이 순응도의 moderate-evidence 인자**라고 말한다.
→ 운동 항목을 늘리는 것보다 **재진 시 순응도 확인 / 감독 요소(추적 확인) 설계**가
문헌상 더 큰 효과 지렛대일 수 있다. **(판단이며 문헌의 직접 권고는 아님.)**

---

## 8. 현재 20개 각각에 대한 근거 평가 표

등급 표기:
- **G** = 가이드라인 권고 (해당 **카테고리**가 가이드라인에 명시)
- **SR** = 체계적 고찰 / 메타분석
- **S** = 단일 연구
- **E** = 전문가 의견 / 근거 미확인
- 괄호 안은 그 등급의 근거가 **개별 운동**이 아니라 **카테고리**임을 뜻하는 `(cat)`

| # | id / 한국어명 | 지지하는 문헌 | 등급 | 비고 |
|---|---|---|---|---|
| 1 | `LBP_ACT_01` 짧게 걷기 | JOSPT 2021 만성 `aerobic exercise`; NICE `aerobic` 그룹; WalkBack(Lancet 2024, **재발예방** 목적) | **G(cat)** | 현재 문안은 "활동 재개"이지 유산소 트레이닝이 아님. WalkBack이 지지하는 것은 별개 프로그램 |
| 2 | `LBP_ACT_02` 짧게 걷고 쉬기 반복 | 위와 동일 카테고리. **간헐적 보행(pacing) 자체의 개별 근거 확인 못 함** | **E** | 신경인성 파행 맥락의 pacing으로 임상적 타당성은 있으나 인용 없음 |
| 3 | `LBP_LUMBAR_02` 고양이·낙타 | JOSPT 2021 `general exercise`(cat) 이외 **개별 근거 확인 못 함** | **E / G(cat)** | 광범위 관행. 개별 RCT 미확인 |
| 4 | `LBP_LUMBAR_03` 무릎 좌우 눕히기 | 동상 | **E / G(cat)** | 동상 |
| 5 | `LBP_DIR_02` 팔꿈치 괴고 엎드리기 | McKenzie/MDT 계열. Hayden 2021: "McKenzie therapy … more effective than other types of exercise". centralization SR(May 2018) | **SR** | centralization 판정 **신뢰도 낮음**(§6.3) |
| 6 | `LBP_DIR_03` 엎드려 반복 젖히기 | 위와 동일 | **SR** | 동상 |
| 7 | `LBP_DIR_04` 누워서·앉아서 굽히기 | 위와 동일(굴곡 방향 선호) | **SR** | 굴곡 방향 선호 단독 근거는 신전보다 더 약함 — 확인 못 함 |
| 8 | `LBP_HIP_MOB_01` 고관절 앞쪽 스트레칭 | **직접 근거 확인 못 함.** 인접: hip strengthening SR(불확실) | **E** | §5.5(b). **격하 후보** |
| 9 | `LBP_DEEP_TRUNK_01` 배에 살짝 힘주기 | JOSPT 2021 `specific trunk muscle activation`(급성·만성 모두); ACP 2017 `motor control exercise`(만성, low quality); Saragiotto 2016 Cochrane | **G(cat) + SR** | **우월하지 않음**(Cochrane). 위계 상향 금지 |
| 10 | `LBP_DEEP_TRUNK_03` 발꿈치 미끄러뜨리기 | 위와 동일 | **G(cat) + SR** | 동상 |
| 11 | `LBP_TRUNK_03` 버드독 | JOSPT 2021 `trunk muscle strengthening and endurance`(cat). 개별: McGill Big 3 문헌(프리프린트 · 비-LBP RCT) | **G(cat)** | 개별 운동 근거는 약함 |
| 12 | `LBP_TRUNK_END_01` 브릿지 | 위와 동일 | **G(cat)** | 동상 |
| 13 | `LBP_HIP_STR_03` 다리 옆으로 들기 | hip strengthening SR: "uncertain evidence"; RCT: "**no additional benefit**"; 다른 메타분석: "may be beneficial(moderate/low)" | **SR — 상충** | §5.5(b). **격하 후보** |
| 14 | `LBP_FUNC_01` 앉았다 일어서기 | JOSPT 2021 `general exercise` / `functional restoration`(Hayden 2021 상위 효과) | **G(cat) / SR(cat)** | 개별 근거 미확인 |
| 15 | `LBP_FUNC_05` 고관절 접기(hip hinge) | 동상 | **G(cat)** | hip hinge 기술 훈련 단독 RCT **확인 못 함** |
| 16 | `LBP_LOAD_02` 들어올리기 연습 | `functional restoration`(Hayden 2021); graded activity SR(Macedo 2010) | **SR(cat)** | "안전한 들기 자세" 교육의 근거는 별개 논쟁 영역 — **확인 못 함** |
| 17 | `LBP_NEURAL_01` 좌골신경 slider | Neural mobilization SR/메타분석 2023(20 RCT, n=877, lumbar radiculopathy) | **SR** | **가이드라인 지명 없음**. 대상이 radiculopathy임에 주의 |
| 18 | `LBP_EXPOSURE_01` 숙이기 단계적 시도 | Macedo 2010 SR (graded exposure = minimal treatment/graded activity와 **동등**); Cochrane 2025 CD015509(결론 미확인) | **SR** | "다른 운동보다 낫다" 주장 금지 |
| 19 | `LBP_EXPOSURE_03` 앉기 단계적 증가 | 위와 동일 | **SR** | 동상 |
| 20 | `LBP_REG_01` 호흡·이완 | ACP 2017 만성 목록 `progressive relaxation`(**low-quality**) | **G(cat, low)** | 현재 항목은 PMR이 아니라 호흡·이완. **호흡법 단독 근거 확인 못 함** |

**표 전체에 대한 총평**: 20개 중 **개별 운동 수준의 직접 근거가 있는 것은
5·6·7(방향성/McKenzie)과 17(neural mobilization)뿐**이다. 나머지 16개는
**카테고리 수준 지지 또는 관행**이다. 이건 결함이 아니라 이 분야 문헌의
실제 구조다 — 다만 **UI/문서에서 그렇게 표기되어야 한다.**

---

## 9. 추가 권고 항목 (넣어야 할 운동)

우선순위 순. **모두 "카테고리 근거"임을 전제로 한다.**

| 우선 | 제안 항목 | 근거 | 등급 | 비고 |
|---|---|---|---|---|
| 1 | **유산소 운동 (자전거 / 실내걷기 / 수중)** — 걷기와 별개의 트레이닝 항목 | JOSPT 2021 만성 `aerobic exercise`·`aquatic exercise`; Cochrane 2024 CD015503 | **G(cat) + SR** | 현재 명백한 결손. 수중은 한의원 전달 가능성 낮음 → 자전거/실내 유산소 우선 |
| 2 | **점진적 걷기 프로그램 (재발 예방)** — 항목 1·2와 목적 분리 | WalkBack RCT, Lancet 2024 | **S (대규모 RCT)** | "치료"가 아니라 **재발 예방** 지표로 배치해야 함 |
| 3 | **처방 구조 필드: 총 프로그램 시간 / 감독 / 개인화** (운동이 아니라 메타필드) | WHO 2023 (≥20h, supervised, personalised); 홈운동 순응도 SR | **G + SR** | 개별 운동 20개를 늘리는 것보다 문헌 지지가 강함 |
| 4 | **Pilates 계열** | Hayden 2021 Cochrane; JOSPT 2022 NMA; JOSPT 2024 dose NMA | **SR/NMA** | 가이드라인 지명 미확인. 전달 가능성 검토 필요 |
| 5 | **태극권 / 요가(심신 운동)** | ACP 2017 만성 목록(**low quality**); NICE 그룹 프로그램 `mind–body` | **G(low)** | §2.3 상충 문장 해소 후에 결정 |
| — | **McGill curl-up / side bridge** | **가이드라인 지명 없음. 개별 근거 약함**(프리프린트·비-LBP RCT) | **E** | **근거를 이유로는 추가 권고하지 않음.** 추가한다면 "임상 관행"으로 표기 |

**추가하지 말 것 (근거 부족)**: 견인, 특정 기구 운동, 특정 유파 고유 프로토콜 —
검색 범위에서 가이드라인 지지를 확인하지 못했다.

---

## 10. 제거·격하 권고 항목

**제거 권고: 없음.** 20개 중 어느 것도 "가이드라인이 하지 말라고 한 것"이 아니다.

**격하(demote) 권고:**

| 항목 | 사유 | 제안 조치 |
|---|---|---|
| 8 `LBP_HIP_MOB_01`, 13 `LBP_HIP_STR_03` | hip strengthening 추가 이득 근거 **불확실·상충**; RCT 하나는 추가 이득 없음 | 기본 세트에서 빼고 **선택 항목**으로. 근거 라벨 "불확실" |
| 9, 10 (심부근) | MCE는 다른 운동 대비 **우월하지 않다**(Cochrane 2016) | 유지하되 **순위/기본 노출에서 특권 제거**. "핵심 운동" 같은 표현 금지 |
| 5, 6, 7 (방향성) | centralization 판정 자체의 **신뢰도 낮음(kappa 0.15–0.9), 환자 1/3에서 판정 불가** | 유지하되 **"판정 불가" 상태를 명시적 3번째 경로로 추가**. 현재 문안은 판정이 항상 가능하다는 전제 |
| 2 `LBP_ACT_02` | 간헐적 pacing 자체의 개별 근거 **확인 못 함** | 유지(임상 타당). 근거 라벨 "전문가 의견" |
| 3, 4 (고양이·낙타, 무릎 눕히기) | 개별 근거 **확인 못 함** | 유지(저위험·광범위 관행). 근거 라벨 "전문가 의견/관행" |
| 20 `LBP_REG_01` | ACP가 지지하는 것은 `progressive relaxation`이며 호흡법 단독이 아님 | 유지. 라벨을 "progressive relaxation 계열(low quality)"로 정확히 |

**전체에 적용할 조치(가장 중요)**: 각 row에 **`evidenceLevel` + `evidenceCitations`
필드를 추가**하여, 위 §8 표의 등급과 URL이 코드에 남게 한다. 현재 "출처가 내부 문서
1개뿐"인 상태의 근본 해결은 항목을 바꾸는 게 아니라 **근거 필드를 만드는 것**이다.
(코드 변경은 이 문서 범위 밖 — 별도 작업.)

---

## 11. 용량 권고 — 문헌에 있는 것만

### 11.1 문헌에 있는 것

| 층위 | 문헌이 말하는 것 | 출처 |
|---|---|---|
| **총 프로그램 시간** | 만성 1차성 요통에서 **총 ≥20시간**을 "high dose"로 장려 | WHO 2023 |
| **전달 형태** | **개인화(personalised)** + **감독(supervised)** — 개별 감독, 그룹 감독, **또는 재택 + 치료자 추적**. 셋 다 인정 | WHO 2023 |
| **주당 에너지 소비** | MCID 도달 **약 520 MET-min/주**, 최대 반응 **920 MET-min**, **U자형**(더 많이 = 더 좋음이 아님), low~moderate certainty | JOSPT 2024 dose NMA (⚠️ 단위 불일치 미해결) |
| **감독 vs 비감독** | 비감독 홈운동은 감독 대면 운동보다 **단기 효과가 낮음** | 감독 비교 SR |
| **순응도** | 최대 **70%가 처방 홈운동을 이행하지 않음** | 홈운동 순응도 SR |

### 11.2 문헌에 **없는** 것 — 명시적으로 기록한다

> **개별 운동의 세트 수, 반복 횟수, 유지 시간(초), 1일 시행 횟수, 총 주(週) 수에
> 대한 가이드라인 권고는 문헌에 없다.**
> 이것은 Comachio 2024(JSAMS)가 18개 지침을 검토해 내린 결론이기도 하다:
> 권고는 "type, intensity, duration, frequency에 대한 구체성이 결여"되어 있다.

따라서:
- 현재 `startingDoseKo`의 숫자 20개는 **그대로 두는 것이 문헌적으로 틀리지 않다**
  (문헌이 대안을 제시하지 않으므로). 틀린 것은 그 숫자가 아니라 **그 숫자에
  근거가 있는 것처럼 보이는 표시 방식**이다.
- 코드의 `doseMeaning: 'PRAGMATIC_STARTING_DEFAULT_NOT_CLINICAL_THRESHOLD'`는
  **정확하며 유지되어야 한다.**
- 추가 권고: 개별 dose와 **별개 층위**로 "총 프로그램 시간/주당 빈도/감독 형태"를
  기록하는 필드를 두면 WHO 2023과 정합한다.

---

## 12. 막힌 URL 목록

**WebFetch가 전면 차단되어 아래 URL을 하나도 열지 못했다.**
(직접 시도한 것은 ✱ 표시. 나머지는 검색 결과에 나타났으나 시도 전 동일 차단이
확실해 시도하지 않은 것.)

### 12.1 직접 시도 → `EGRESS_BLOCKED` 확인

| URL | 용도 |
|---|---|
| ✱ `https://www.jospt.org/doi/10.2519/jospt.2021.0304` | JOSPT 2021 CPG 원문 |
| ✱ `https://www.guidelinecentral.com/guideline/1317053/` | JOSPT 2021 CPG 요약 |
| ✱ `https://www.nice.org.uk/guidance/ng59/chapter/recommendations` | NICE NG59 권고 |
| ✱ `https://www.ncbi.nlm.nih.gov/books/NBK599212/` | WHO 2023 지침(Bookshelf) |
| ✱ `https://pmc.ncbi.nlm.nih.gov/articles/PMC12232859/` | WHO 2023 해설 |
| ✱ `https://www.acpjournals.org/doi/10.7326/M16-2367` | ACP 2017 원문 |
| ✱ `https://cpdcentre.co.za/.../Quaseem-2017-LBP-guidlines-ARTICLE.pdf` | ACP 2017 PDF 미러 |
| ✱ `https://chiro.org/.../WHO_Guideline_for_Non-Surgical_Management_of_Chronic_Primary_Low_Back_Pain.pdf` | WHO 2023 PDF 미러 |
| ✱ `https://www.orthodiv.org/wp-content/uploads/2021/08/Treatment-Based-Classification-System-for-Low-Back-Pain_-Revision-and-Update-watermark.pdf` | TBC 2016 PDF |
| ✱ `https://www.psp.pitt.edu/pdfs/TBC.pdf` | TBC 2016 PDF |
| ✱ `https://europepmc.org/article/MED/28192789` | ACP 2017 초록 |
| ✱ `https://www.who.int/publications/i/item/9789240081789` | WHO 지침(**URL 존재 여부 자체 미확인 — 인용 금지**) |
| ✱ `https://example.com` | **차단 범위 확인용** |
| ✱ `https://en.wikipedia.org/wiki/Low_back_pain` | **차단 범위 확인용** |

### 12.2 `curl`로도 차단 확인 (`CONNECT tunnel failed, 403`)

`https://www.nice.org.uk/guidance/ng59/chapter/recommendations`,
`https://pmc.ncbi.nlm.nih.gov/articles/PMC10684665/`,
`https://www.physio-pedia.com/Low_Back_Pain`

### 12.3 검색 결과에 나타났으나 접근 불가 (동일 차단, 시도 생략)

- `https://pubmed.ncbi.nlm.nih.gov/34719942/` (JOSPT 2021)
- `https://pubmed.ncbi.nlm.nih.gov/28192789/` (ACP 2017)
- `https://pubmed.ncbi.nlm.nih.gov/26637653/` (TBC 2016)
- `https://academic.oup.com/ptj/article/96/7/1057/2864925` (TBC 2016)
- `https://academic.oup.com/ptj/article/97/12/1147/4097724` (TBC movement control 2017)
- `https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD012004/full` (MCE)
- `https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD009790.pub2/full` (Hayden 2021)
- `https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD015503/full` (aerobic 2024)
- `https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD015509/full` (graded activity 2025)
- `https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD015608/references` (Hayden NMA 2023)
- `https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(24)00755-4/fulltext` (WalkBack)
- `https://www.jospt.org/doi/abs/10.2519/jospt.2024.12153` (dose NMA)
- `https://www.jospt.org/doi/10.2519/jospt.2022.10671` (best exercise NMA)
- `https://www.jospt.org/doi/10.2519/jospt.2023.11448` (HEP scoping review)
- `https://www.jsams.org/article/S1440-2440(24)00020-3/fulltext` (guidelines are silent)
- `https://pubmed.ncbi.nlm.nih.gov/30273918/` (centralization SR 2018)
- `https://shura.shu.ac.uk/22921/9/May-CentralizationDirectionalPreference(AM).pdf`
- `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10744707/` (neural mobilization SR)
- `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10536491/` (hip strengthening SR)
- `https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2024.1372748/full` (침+운동)
- `https://pubmed.ncbi.nlm.nih.gov/24169445/` (홈운동 순응도)
- `https://pubmed.ncbi.nlm.nih.gov/39037849/` (STarT Back 비판)
- `https://nikom.or.kr/` (한의표준임상진료지침)

---

## 13. 확신 없는 것 — 정직한 목록

1. **모든 인용문의 정확한 워딩.** 검색엔진 요약을 통과한 것이며 원문 대조를 안 했다.
2. **JOSPT 2021의 등급 문자(A/B/C).** "should/may/can use" 동사에서 **역추론**했다.
   급성 LBP에 대해 "may use"와 "can use" 두 가지 표현이 스니펫에 모두 나타나
   **어느 쪽이 맞는지, 혹은 둘 다 서로 다른 권고인지 모른다.**
3. **WHO 2023 권고의 강도와 certainty.** "may be offered"만 봤다. conditional인지
   확정 못 했다.
4. **ACP 2017 권고 3의 내용.** 확인 못 했다.
5. **520 / 920 MET-min의 단위와 관계.** 스니펫이 "520 MET minutes **per week**"와
   "920 MET minutes"를 다르게 표기했다. 둘 다 주당인지 불명확.
6. **TBC의 단계별 중재 목록.** 스니펫에 나오지 않았다. "symptom modulation에는
   directional preference exercise가 배정된다"는 널리 알려진 서술을
   **일부러 쓰지 않았다** — 확인 못 했기 때문이다.
7. **TBC에 숫자 컷오프가 없다는 판정.** "찾지 못했다"이지 "없음을 확인했다"가 아니다.
8. **한국어 가이드라인 전부.** NIKOM 지침의 존재만 알고, 요통 지침의 권고 내용은
   전혀 모른다. §2.5의 "27개 권고" 서술이 요통 지침의 것인지 **모른다.**
9. **NICE NG59의 침에 대한 입장.** 확인 못 했다 — 한의원 맥락에서 중요한 공백.
10. **Pilates/tai chi/yoga에 대한 "insufficient evidence" 문장의 출처.**
    ACP 본문인지 AHRQ 근거보고서인지 특정 못 했다.
11. **McGill 방식 vs conventional therapy RCT의 서지.** researchgate 제목만 봤고
    저자·저널·연도를 모른다 → **이 문서에서 근거로 쓰지 않았다.**
12. **"slider가 tensioner보다 급성에 효과적"** 이라는 스니펫 문장의 출처를 특정
    못 했다 → 근거로 쓰지 않았다.
13. **WalkBack의 주 결과 수치**(재발까지 시간, HR). 확인 못 했다.
14. **JOSPT 2021이 neural mobilization을 다루는지.** 확인 못 했다.
15. **red flag와 운동 처방의 관계에 대한 명시적 가이드라인 문장.** 없는 것으로
    보이지만 확인 못 했다.
16. **§8 표의 등급 배정.** 내가 스니펫을 근거로 배정한 것이며 **문헌이 부여한
    등급이 아니다.** 특히 `E`(전문가 의견) 배정은 "근거를 못 찾았다"의 뜻이지
    "근거가 없음이 확인됐다"가 아니다.

---

## 14. 다음 단계 제안 (실행 순서)

1. **원문 확보.** 네트워크가 열린 환경(원장 로컬 PC 등)에서 최소 4편을 PDF로
   내려받아 저장소 밖 안전한 위치에 둔다: JOSPT 2021 CPG, WHO 2023, ACP 2017,
   Alrwaily 2016. → 이 문서의 §2, §4, §11을 **v0.2에서 원문 대조로 승격**한다.
2. **§13의 16개 불확실 항목을 하나씩 닫는다.** 특히 2, 3, 5, 8.
3. **한국어 가이드라인 확보** — NIKOM 요통 지침 PDF를 원장이 직접 제공.
4. 그 다음에야 **코드 변경**(evidenceLevel/evidenceCitations 필드 추가,
   유산소 항목 추가, 고관절 항목 격하)을 별도 브랜치·별도 PR로 진행한다.
5. **이 문서를 근거로 코드를 먼저 바꾸지 않는다.** 원문 대조 전이다.

---

*작성: Claude (Opus 5) 리서치 세션. 상태 DRAFT — §0의 한계를 읽지 않고 이 문서를
임상 근거로 인용하지 말 것.*
