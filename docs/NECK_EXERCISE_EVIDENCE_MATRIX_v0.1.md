# 목(NECK) Exercise Evidence Matrix v0.1 — 원장+Opus 초안

**상태**: 초안 → **2026-09-07 PO "추천안으로 진행"으로 §0 체크리스트 9개가 제안값 그대로 확정됨.** 확정본과
Opus 검수 결과는 `docs/NECK_EXERCISE_DECISIONS_v1.0_CLOSED.md`(정본). 이 문서는 근거·대안(보류 후보 DIR_02/SCAP_02/
ACT_01, §1.2 CPG 표 — **원문 대조 미완**)의 기록으로 남긴다. **이 문서 자체는 운동 라이브러리가 아니다** — 팩(`src/doctor/workspace/regionPacks/neck.ts`)의
정본은 CLOSED 문서이며, 이 초안과 팩이 다르면 CLOSED 문서가 맞다.
**작성 근거**: PO 결정 2026-09-07 (설계 §10-5 "원장+Opus 초안") — 요통 동등성 설계
`docs/PAIN_REGION_PACK_LBP_PARITY_DESIGN_v0.1.md` §7 ②단계.
**프레임워크 정본**: PR #30 `docs/recovered_rehab_architecture/NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md`
+ `source/NECK_V1_Evidence_Matrix_v0.2_HANDOFF.md`(2026-08-25).
**요통 대응물**: `tablet core/evidence_matrix_lbp_v1.md` §6 + `docs/LBP_EXERCISE_LEVEL_DRAFT_v0.2.md` +
`docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.4.md` + `lbpExerciseCoreMetadata.ts`(Core-20).

> 원칙(요통 v1과 동일): 진단명 → 운동 하드코딩 금지. 후보 2~3개 → 원장 승인/교체 → 최종 1~2개.
> 용량은 **삼인당 실용 시작 기본값**이지 임상 임계값이 아니다(`doseMeaning:
> PRAGMATIC_STARTING_DEFAULT_NOT_CLINICAL_THRESHOLD`). 확률·cutoff는 넣지 않는다.

---

## 0. 원장이 이 문서에서 결정할 것 (체크리스트)

| # | 결정 | 이 문서의 제안 | 원장 표기 |
|---|---|---|---|
| 1 | Core 후보 목록(§3) — 11개 중 유지/삭제, 아카이브 8개의 병합·폐기 | 11개 유지, 아카이브 8 → 후보 6개로 병합 | ☐ |
| 2 | 도메인 배정(§3) | PR #30 도메인 9개에 1:1 | ☐ |
| 3 | 메타 7필드(§4) — 운동당 7칸의 문장 | 요통 Core-20 문형으로 초안 | ☐ |
| 4 | 단계표(§5) — 운동당 1/2/3/ALL | 요통 방식(0단계 = 능동 운동 미처방) | ☐ |
| 5 | 적격성 규칙(§6) — 신경 안정 요구·원위 악화 중단·방향 조건 | 신경 가동성·방향성 운동만 true | ☐ |
| 6 | 검사 → "직접 뒷받침" 쌍(§7) | 4쌍 제안 | ☐ |
| 7 | 재검 재질문 문항(§8) | `NECK_12`(지속 자세) 1개 | ☐ |
| 8 | 목표 기능 프리셋(§8) | 현행 4개 유지 | ☐ |
| 9 | 근거 재검증 항목(§10) | freeze 전 원문 확인 5건 | ☐ |

체크 9개가 다 채워지면 Opus가 §1~§10을 임상 검수하고(`PASS` / `CLINICAL DECISION REQUIRED`),
PASS면 v1.0 CLOSED 문서를 만들고 Sonnet이 팩에 옮긴다(설계 §7 ③→④).

---

## 1. 근거 기반 — 무엇이 확인됐고 무엇이 아닌가

### 1.1 PR #30이 원문 확인했다고 적은 출처
1. **Blanpied PR, et al. Neck Pain: Revision 2017. JOSPT 2017;47(7):A1–A83. PMID 28666405.**
   목통증 관리 CPG. 아래 §2·§3의 분류별 운동 방향의 중심 근거.
2. **ACR Appropriateness Criteria — Cervical Neck Pain or Cervical Radiculopathy (2019). PMID 31054759.**
   영상·의뢰 게이트 근거(운동 선택에는 직접 쓰지 않음).

### 1.2 이 초안이 CPG 2017에서 가져온 "분류 → 운동 방향" (요약 — **원문 재확인 필요**)
아래는 Opus의 문헌 지식으로 요약한 것이며, **v1.0 CLOSED 전에 원장/Opus가 원문 표(권고 등급 포함)를
대조해야 한다**(§10). 등급(A/B/C/F)은 여기 적지 않는다 — 기억에 의존한 등급을 확정값으로 만들지 않기 위해.

| CPG 2017 분류 | 급성 | 만성 | 이 문서의 도메인 대응 |
|---|---|---|---|
| 가동성 결핍(mobility deficit) 동반 목통증 | 흉추 도수치료 + 경추 ROM 운동 + 견갑흉곽/상지 강화 | 경추·흉추 도수치료 + 목·견갑대 지구력/강화 + 스트레칭(복합) | CERVICAL_MOBILITY, THORACIC_MOBILITY, SCAPULAR_CONTROL_STRENGTH, CERVICAL_EXTENSOR_ENDURANCE |
| 움직임 조절 장애(movement coordination impairment, WAD 포함) | 교육(활동 유지) + 능동 가동 운동 | 교육 + 감독 하 운동(조절·지구력·강화) + 통증 조절 | DNF_CONTROL_ENDURANCE, GRADED_EXPOSURE_WORK_POSTURE, AEROBIC_ACTIVITY |
| 두통 동반 목통증 | 능동 가동 운동 지도 | 경추·경흉추 도수치료 + 견갑대·목 스트레칭/강화/지구력 + C1-2 self-SNAG | CERVICAL_MOBILITY, DNF_CONTROL_ENDURANCE, SCAPULAR_CONTROL_STRENGTH |
| 방사통 동반 목통증 | 가동·안정화 운동, (단기 보조기 고려) | 간헐적 견인 **+ 스트레칭/강화 복합** + 경추·흉추 도수치료, 활동 유지 교육 | NEURAL_MOBILITY, DIRECTIONAL_RESPONSE, SCAPULAR_CONTROL_STRENGTH |

PR #30 NECK §4의 "Management / exercise direction" 열과 일치한다(축성 = mobility + cervicoscapular
endurance; 신경근 = symptom-guided cervical/scapular + neural mobility **선택적**, traction은 복합 맥락에서만;
두통 = 상부 경추·경흉추 가동 + 지구력; 조절 결핍 = graded endurance/control/activity exposure).

### 1.3 이 문서가 **근거로 주장하지 않는 것**
- 운동별 세트·반복·유지 시간 — CPG는 운동 **범주**를 지지할 뿐 특정 용량을 정하지 않는다. §4의 용량은
  삼인당 시작 기본값이다(요통 Core-20 `LBP_EXERCISE_LIBRARY_EVIDENCE_RESEARCH_v0.1.md`와 같은 경계).
- CFRT cutoff, Spurling/distraction/ULTT 클러스터 해석, 견인 적응증 — PR #30 §10 "freeze 안 함" 그대로.
- irritability 점수 — 시스템 입력에 없다(요통 DEFER). `startingCriteriaKo` 문장으로만 서술한다.

---

## 2. 가설 패턴 5개 ↔ 관리 방향 (PR #30 §4·§6 → 팩 `hypothesisPatterns`, PO 승인)

가설은 **참고 표시**다 — 후보 필터가 아니다(요통 §11.7, `tests/region-pack.spec.mjs` E-4 부정 단언).
아래 "관리 방향"은 원장이 후보를 고를 때 읽는 문장이며 코드가 읽지 않는다.

| id | 라벨(팩) | 지지 소견 | 반박 소견 | 관리 방향(PR #30) | 재평가 |
|---|---|---|---|---|---|
| AXIAL_MOBILITY_DEFICIT | 목 움직임 제한(축성 목통증) | CROM 제한 + 일치하는 국소 통증/뻣뻣함 | 신경 결손, 진행하는 팔 증상, 척수/전신 징후 | 가동성 + 경추견갑 지구력/강화 + 활동 | NRS + 목표 기능 + CROM/기능 |
| RADICULAR_INVOLVEMENT | 신경근 관여(팔 증상) | 신경해부학적 팔 증상 + 일치하는 검사 클러스터 | 정상 신경학, 어깨/말초 패턴 | 증상 유도 경추/견갑 운동, 반응이 지지하면 신경 가동성, 견인은 복합 맥락에서만 | 팔 증상 범위 + 신경 + 목표 기능 |
| CERVICOGENIC_HEADACHE | 경추성 두통 패턴 | 목 연관 두통 재현 + ROM 제한 | 편두통 유사/전신/신경 패턴 | 상부 경추·경흉추 가동 + 반응으로 고른 경추견갑 지구력; 새롭고 유례없이 심한 두통은 안전 먼저 | 두통 빈도/강도 + 목표 기능 |
| MOVEMENT_COORDINATION_DEFICIT | 움직임 조절·지구력 부족 | 부하/시간 의존 증상, 지구력·조절 저하 | 강한 신경/전신 패턴 | 단계적 지구력, 경추/견갑흉곽 조절, 활동 노출 | 유지 내성 + 목표 기능 |
| SHOULDER_OR_PERIPHERAL | 어깨·말초 기여 | 어깨/말초 검사가 익숙한 증상을 재현 | 목 움직임/검사 클러스터가 강하게 일치 | 해당 도메인 추가 평가; 목 진단 억지 귀속 금지(NS01 어깨 우세면 어깨 팩) | 기능 |

`MUST_EXCLUDE_*`(척수 관여·혈관·특정 병리)는 L0 안전(`neckLogic.ts`, PASS/FROZEN) — 이 문서 범위 밖.

---

## 3. Core 후보 (제안 11개) + 도메인 배정 + 아카이브 8개 처리

id 접두 `NECK_`. 도메인은 팩 `rehabDomains`(PR #30 §7, 9개). "출처"는 이 운동 **범주**의 근거이며 용량 근거가 아니다.

| # | id(안) | 운동(안) | 도메인 | 출처(범주) | 아카이브 대응 |
|---|---|---|---|---|---|
| 1 | NECK_MOB_01 | 경추 능동 가동범위 운동(회전·측굴·굴신, 통증 허용 범위 반복) | CERVICAL_MOBILITY | CPG 2017 mobility deficit / headache(능동 가동) | — |
| 2 | NECK_THX_01 | 흉추 가동성(폼롤러 신전 **또는** 네발기기 회전 — 원장이 1개 선택) | THORACIC_MOBILITY | CPG 2017 mobility deficit(흉추) | NECK_FLAT_02 + NECK_THX_01 **병합** |
| 3 | NECK_DIR_01 | 방향성 반복 운동 — 신전/후인 호전형(턱 당긴 채 후인 → 신전 반복) | DIRECTIONAL_RESPONSE | PR #30 도메인; CPG radiating(가동·안정화) | — |
| 4 | NECK_DIR_02 | 방향성 반복 운동 — 굴곡 호전형(상부 경추 굴곡·후두하 이완 반복) | DIRECTIONAL_RESPONSE | 같음 | — |
| 5 | NECK_DNF_01 | 심부경부굴곡근 활성화(앙와위 턱 당기기, 저강도·짧은 유지) | DNF_CONTROL_ENDURANCE | CPG 2017 coordination / headache | NECK_FHP_01 |
| 6 | NECK_DNF_02 | 심부경부굴곡근 지구력(유지 시간·반복 점진) | DNF_CONTROL_ENDURANCE | 같음 | NECK_FLAT_01 |
| 7 | NECK_EXT_01 | 경추 신전근 지구력(엎드려/네발기기에서 머리 중립 유지) | CERVICAL_EXTENSOR_ENDURANCE | CPG 2017 chronic mobility deficit(목 지구력) | — |
| 8 | NECK_SCAP_01 | 견갑 조절(견갑 후인·하강 유지, 벽 슬라이드) | SCAPULAR_CONTROL_STRENGTH | CPG 2017 견갑대 강화/지구력 | NECK_FHP_02 + NECK_TRAP_01 + NECK_THX_02 **병합** |
| 9 | NECK_SCAP_02 | 견갑·상지 근력(엎드려 Y-레이즈 또는 밴드 로우) | SCAPULAR_CONTROL_STRENGTH | 같음 | NECK_TRAP_02 |
| 10 | NECK_NEURAL_01 | 상지 신경 가동성 슬라이더(증상 편향 신경, 통증 없는 범위) | NEURAL_MOBILITY | CPG 2017 radiating; PR #30 "response supports" 조건 | — |
| 11 | NECK_EXPO_01 | 작업 자세 내성 단계적 노출(앉기/컴퓨터 연속 시간 점진 + 휴식 리듬) | GRADED_EXPOSURE_WORK_POSTURE | CPG 2017 coordination(교육·활동 유지) | — |
| 12 | NECK_ACT_01 | 짧게 걷기(유산소) | AEROBIC_ACTIVITY | CPG 2017 활동 유지; 요통 LBP_ACT_01과 같은 문형 | — |

(12개 — "8~12" 상한. 원장이 §0-1에서 8~10개로 줄이는 것을 권한다: 3·4 중 1개, 8·9 중 1개, 11·12 중 1개를
남기면 9개.)

**아카이브 8개 처리 제안**: 병합 3(FLAT_02+THX_01 → 2; FHP_02+TRAP_01+THX_02 → 8), 대응 3(FHP_01 → 5,
FLAT_01 → 6, TRAP_02 → 9). 결과적으로 아카이브 id 8개는 모두 **폐기**되고 새 id로 대체된다.
원장이 아카이브 이름 그대로 남기고 싶은 행이 있으면 §0-1에 적는다.

**빠진 도메인**: 없음 — 9개 도메인 모두 최소 1개 후보를 갖는다(E-3 검사).

---

## 4. 메타 7필드 (제안 — 요통 Core-20 문형)

형식은 `lbpExerciseCoreMetadata.ts`의 `row(id, 표시명, 시작기준[], 시작용량, 수용반응[], 중단·재검토[], 후퇴, 전진,
목표기능[])`과 같다. 목표 기능 enum은 §8. **중단·재검토 첫 항목은 전 운동 공통**: "새로운 또는 진행하는
신경증상(팔 힘빠짐·감각저하·손 서툼·보행 변화)" — 요통 Core-20의 공통 문장을 목에 맞게 바꾼 것.

| id | 시작 기준 | 시작 용량(삼인당 기본값) | 수용 반응 | 중단·재검토(공통 + 고유) | 후퇴 | 전진 | 목표 기능 |
|---|---|---|---|---|---|---|---|
| NECK_MOB_01 | 안전 CLEAR; 능동 회전에서 날카로운 통증·팔 증상 증가 없음 | 각 방향 5~8회, 1~2세트, 하루 2회 | 당김·익숙한 불편이 반복 중 줄거나 유지 | +팔/손 쪽 증상 확산, 어지럼·시야 변화 | 범위 축소·앉아서·횟수 절반 | 범위 또는 횟수 중 하나만 증가 | LOOKING_BACK, DESK_WORK, OVERHEAD |
| NECK_THX_01 | 네발기기 또는 폼롤러 위 자세 유지 가능 | 5~8회, 1~2세트 | 등 위쪽 당김만 | +목·팔 증상 증가, 흉추 압통 급증 | 범위 축소, 벽 기대고 시행 | 범위·유지 중 하나 | LOOKING_BACK, DESK_WORK, OVERHEAD |
| NECK_DIR_01 | **방향성 반응 = 젖히면(신전) 호전** 기록됨; 반복 중 원위 확산 없음 | 후인 10회 → 신전 5~10회, 하루 3~5회 | 목 중심으로 증상이 모이거나 줄어듦 | +팔 쪽으로 퍼짐(원위부 악화) → 즉시 중단 | 후인만, 앉아서 | 신전 범위·횟수 중 하나 | DESK_WORK, LOOKING_BACK |
| NECK_DIR_02 | **방향성 반응 = 굽히면(굴곡) 호전** 기록됨 | 상부 경추 굴곡 5~10회, 하루 3회 | 두통/후두하 긴장 완화 | +두통 양상 변화(새롭고 심한), 어지럼 | 횟수 절반 | 유지 시간 | DESK_WORK, SLEEP |
| NECK_DNF_01 | 앙와위 유지 가능; 턱 당기기에서 표층 굴곡근 과활성·통증 없음 | 5~10초 유지 × 10회, 하루 2회 | 목 앞 깊은 곳의 가벼운 피로만 | +두통 유발, 어지럼 | 유지 3~5초, 머리 받침 높임 | 유지 시간 | DESK_WORK, SLEEP, LOOKING_BACK |
| NECK_DNF_02 | NECK_DNF_01 수행 가능 + 대체 전략 없이 10초 유지 | 10~15초 × 10회 → 총 유지 시간 점진 | 피로는 있으나 통증 누적 없음 | +표층 굴곡근 과활성·떨림으로 대체 | NECK_DNF_01로 | 유지·반복 중 하나 | DESK_WORK, LOOKING_BACK |
| NECK_EXT_01 | 엎드려/네발기기 가능; 머리 중립 유지에 통증 없음 | 10초 × 8~10회 | 목 뒤 근육 피로만 | +두통·어지럼 유발 | 유지 5초, 이마 받침 | 유지 시간 | DESK_WORK, OVERHEAD |
| NECK_SCAP_01 | 팔 올리기 중 견갑 조절 관찰 가능; 어깨 통증 재현 없음 | 벽 슬라이드 8~10회 또는 후인·하강 유지 10초 × 10 | 견갑 주변 피로만 | +어깨 통증 재현(→ 어깨 팩 검토), 팔 저림 | 범위 축소, 팔꿈치 굽힌 채 | 범위 → 저항 | OVERHEAD, DESK_WORK |
| NECK_SCAP_02 | NECK_SCAP_01 수행 가능; 저항에 목 보상 없음 | 가벼운 밴드/무부하 8~12회, 1~2세트 | 견갑 주변 근육 피로 | +목·상부 승모근 과긴장으로 보상, 팔 증상 | 저항 제거, 횟수 절반 | 저항 또는 세트 중 하나 | OVERHEAD, DESK_WORK |
| NECK_NEURAL_01 | **신경 상태 STABLE**(C5–T1 기준선 음성) + 원위 악화 없음; ULTT 양성이면 직접 뒷받침 | 통증 없는 범위 슬라이더 10회, 하루 2회 | 가벼운 당김, 종료 후 증상 기저로 회복 | +팔/손 증상 확산·지속, 감각 변화 → 중단·신경 재평가 | 범위 축소, 목 중립 고정 | 범위 → 텐셔너(원장 판단) | LOOKING_BACK, DESK_WORK, SLEEP |
| NECK_EXPO_01 | 현재 연속 앉기/작업 허용 시간을 환자가 말할 수 있음 | 허용 시간의 70~80%부터, 사이 1~2분 목·견갑 리셋 | 다음 구간 시작 전 기저로 회복 | +세션마다 허용 시간 감소, 새 신경증상 | 구간 단축, 휴식 연장 | 구간 연장 또는 휴식 단축 중 하나 | DESK_WORK |
| NECK_ACT_01 | 안전하게 걸을 수 있음 | 1회 5~10분, 하루 1~2회 | 보행 중 증상 누적 없음 | +보행 후 회복 안 되는 악화 | 2~5분 | 시간 또는 속도 중 하나 | DESK_WORK, LOOKING_BACK |

주의: 위 문장은 전부 **제안**이다. 요통 Core-20에서 원장이 2,000행을 직접 다듬었듯, 목도 원장 문장이 최종이다.

---

## 5. 단계표 (제안 — 요통 방식: VISIT_04 축, 0/1/2/3, `ALL`)

단계 축은 부위 무관(`stageInputFromPayload('neck', …)`; 목 안전 플래그에는 재발 간격·공포회피 입력이 없어
격하 2·상한 1은 발동하지 않는다 — `scripts/region-stage-distribution.mjs neck`이 이를 경고로 표시한다).

| 단계 | 의미(요통 v0.4) | 목 후보(안) |
|---|---|---|
| 0 보호/안정 | 능동 운동 미처방(안전 재평가·통증 조절) | — (표에 넣지 않음) |
| 1 증상 조절 | 통증 허용 범위의 가동·활성화 | NECK_MOB_01, NECK_DIR_01, NECK_DIR_02, NECK_DNF_01, NECK_ACT_01 |
| 2 움직임 조절 | 조절·지구력, 신경 가동성, 노출 시작 | NECK_THX_01, NECK_DNF_02, NECK_EXT_01, NECK_SCAP_01, NECK_NEURAL_01, NECK_EXPO_01 |
| 3 기능 최적화 | 저항·기능 부하 | NECK_SCAP_02 |
| ALL | 전 단계 공통 | (없음 — 원장이 NECK_MOB_01/ACT_01을 ALL로 둘지 결정) |

---

## 6. 적격성 규칙 (제안 — `buildEligibilityRule` 옵션)

기본값은 요통과 다르게 `requiresStableNeuro:false, stopOnDistalWorsening:false`(DRAFT 조립기 헤더). 아래만 바꾼다.

| id | requiresStableNeuro | stopOnDistalWorsening | requiredDirectionalResponse | 이유 |
|---|---|---|---|---|
| NECK_NEURAL_01 | **true** | **true** | — | 요통 LBP_NEURAL_01과 동일. 신경 상태는 D-1 파생(`neuroExamIds`: C5–T1 기준선 + UMN) |
| NECK_DIR_01 | false | **true** | **EXTENSION_FAVORABLE** | 요통 LBP_DIR_* 방식. 방향 미기록이면 후보에 오르지 않음 |
| NECK_DIR_02 | false | **true** | **FLEXION_FAVORABLE** | 같음 |
| 그 외 9개 | false | false | — | 기본값 |

신경 상태 미기록(UNKNOWN)이면 NECK_NEURAL_01만 보류되고 화면 안내가 "C5–T1 신경학적 기준선, UMN 징후"
검사를 가리킨다(`neuroUnrecordedHintForPack`). 설계 §9 리스크 2가 이렇게 제한된다.

---

## 7. 검사 → "직접 뒷받침" 쌍 (제안 — `directSupportByExam`, 순위 버킷만, 필터 아님)

요통 `lbp_exam_neurodynamic → LBP_NEURAL_01`과 같은 메커니즘: 검사 POSITIVE면 그 운동이 앞 버킷으로 올라간다.
후보 집합은 바뀌지 않는다(목표 기능·단계·적격성만이 집합을 정한다).

| 검사 id(팩) | POSITIVE 의미 | 직접 뒷받침 운동 |
|---|---|---|
| neck_exam_ultt | 신경 편향 긴장에서 증상 재현 | NECK_NEURAL_01 |
| neck_exam_dnf_endurance | 유지 불가/대체 전략 | NECK_DNF_01, NECK_DNF_02 |
| neck_exam_scapular_control | 익상·과상승·유지 불가 | NECK_SCAP_01 |
| neck_exam_crom | 제한 방향 + 일치 증상 | NECK_MOB_01 |

`neck_exam_spurling`/`neck_exam_distraction`은 **가설(신경근 관여) 근거**이지 운동 뒷받침이 아니다 — 쌍에 넣지 않는다
("방사통이면 무조건 traction" 금지의 코드 형태).

---

## 8. 목표 기능 · 재검 재질문

**목표 기능 프리셋(현행 유지 제안)**: `neck_tf_looking_back`(LOOKING_BACK) / `neck_tf_desk_work`(DESK_WORK) /
`neck_tf_sleep`(SLEEP) / `neck_tf_overhead`(OVERHEAD) + 자유 입력. 두통 빈도는 목표 기능이 아니라 재평가
항목(NRS 옆)으로 둔다(PR #30 §8 조건부).

**재검 재질문(`detailCheckQuestionIds`, single_choice만)**: `NECK_12` "오래 앉기·컴퓨터·운전처럼 같은 자세를
유지할 때 목이 더 불편해지나요?" 1개 제안. `NECK_10`(두통 동반)은 안전 분기(`NECK_10A`)와 얽혀 있어
재질문 후보에서 제외. 승인 시 `server/detailCheck.js` `DETAIL_CHECK_REGION_QUESTION_IDS.neck`에 같은 배열
(`tests/region-pack.spec.mjs` C절 parity).

---

## 9. 금지 목록 (PR #30 §7) — 코드가 단언하는 형태

| 금지 | 테스트로 막는 방식 |
|---|---|
| "디스크니까 chin tuck" / "일자목이니까 이 운동" | 가설 id가 운동 쪽(규칙·단계표·검사 쌍·TF 매핑)에 나타나지 않음; 엔진 소스가 `hypothesisPatterns`/`workingHypothesis`를 읽지 않음(E-4) |
| "방사통이면 무조건 traction" | 견인은 Core 후보에 없음; Spurling/distraction은 `directSupportByExam`에 없음(§7) |
| 구조 진단 id | 패턴·운동 id에 DISC/STENOSIS/FACET/IMPINGEMENT 토큰 없음(E-4) |
| 안전 미확인 상태의 운동 진행 | `evaluateNeckSafety` fail-closed + RF-3b 전체 차단(G절) |

---

## 10. freeze 전 재검증 (원문 대조 필수)

1. CPG 2017 분류별 권고 문장·등급 — §1.2 표를 원문 표와 대조.
2. 신경 가동성 운동의 적응·금기 서술(방사통 만성 권고의 정확한 문맥).
3. 방향성 반복 운동(McKenzie 계열)의 경추 적용 근거 수준 — DIR_01/02 유지 여부.
4. DNF/신전근 지구력 검사의 정상 참고치(있다면) — §4 시작 기준 문장에 숫자를 넣을지.
5. 견인·CFRT·Spurling 클러스터 — PR #30 §10과 같이 시스템 해석 범위 결정.

---

## 11. 이 문서가 CLOSED가 되면 바뀌는 코드 (④ 예고, 지금은 0)

- `regionPacks/neck.ts`: `exercises`(§3·§4), `stageTable`(§5), 규칙 옵션(§6, 행 단위), `directSupportByExam`(§7),
  `detailCheckQuestionIds`(§8), `provenance` 전 필드 → `CLINICIAN_APPROVED`, 마지막에 `productionApproved: true`.
- `server/detailCheck.js`: `neck: ['NECK_12']`.
- `tests/neck-exercise-core.vignettes.spec.mjs`(신설, 요통 core20.vignettes 형식) + `tests/region-pack.spec.mjs` D절 갱신
  (승인 팩 2개) + 변이 검사.
- `packContentGaps(NECK) === []`이 승인의 기계적 전제.
