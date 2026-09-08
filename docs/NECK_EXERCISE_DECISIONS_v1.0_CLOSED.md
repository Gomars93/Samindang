# 목(NECK) Exercise Clinical Decisions v1.0 — CLOSED

**상태**: CLOSED (2026-09-07). 팩 `src/doctor/workspace/regionPacks/neck.ts` `productionApproved: true`의 근거 문서.
**승인 경로**: `docs/NECK_EXERCISE_EVIDENCE_MATRIX_v0.1.md`(원장+Opus 초안) → PO "네 추천안으로 진행 부탁"
(2026-09-07) → 초안 §0 체크리스트 9개를 **초안 제안값 그대로** 확정 → Opus 임상 검수(아래 §1) → 이 문서.
**주의**: 원장이 행 단위로 문장을 다듬지 않았다. 7필드 문장은 Claude 초안이 PO 위임 승인으로 확정된 것이며,
파일럿(§10)에서 원장이 카드에서 읽고 고칠 항목이 나오면 이 문서를 v1.1로 올린다(CLOSED 재개방 = DECISIONS 항목).

---

## 1. Opus 임상 검수 결과 — PASS (조건부 항목 2)

| 항목 | 판정 | 근거 |
|---|---|---|
| 안전 게이트가 운동 추천보다 앞서는가 | PASS | `evaluateNeckSafety` = `neckLogic.ts` FROZEN 재계산, fail-closed(비어 있음/미응답 → REVIEW). 비네트 V7a–c. |
| 진단명 → 운동 하드코딩이 없는가 | PASS | 가설 id가 운동 쪽에 없음, 엔진이 가설을 읽지 않음, Spurling/distraction은 뒷받침 쌍에 없음(E-4 + V3b). |
| 신경 결손 시 운동을 내지 않는가 | PASS | C5–T1/UMN 어느 하나 POSITIVE → 전체 차단(V4). 미시행은 STABLE로 읽지 않음(V2b). |
| 원위 악화 시 신경·방향성 운동을 멈추는가 | PASS | DISTAL_WORSENING → NEURAL_01·DIR_01 제외(V5c). |
| 확률·cutoff를 넣지 않았는가 | PASS | 팩·문서 어디에도 LR/cutoff/등급 없음. |
| 용량이 임상 임계값으로 읽히지 않는가 | PASS | 시작 기본값 문장 + 시작 기준·중단 기준 병기(요통 Core-20과 같은 경계). |
| **CPG 2017 분류별 권고 원문 대조** | **B수준 완료 / A수준 미완** (2026-09-07 리서치) | `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §1: 검색 요약(1차 문헌 페이지 인용)으로 분류별 권고·등급(B/C)을 확인했고 Core 9 중 8개가 CPG 권고 범주 안에 있다. **급성 방사통** 행만 미확인. 원문 전문(A수준)은 이 세션의 네트워크가 PubMed·JOSPT를 차단해 열지 못했다 — 원장 로컬 5분 체크리스트(로그 §5) — **파일럿 전제조건 아님, v1.1 항목**(DECISIONS 2026-09-07 "검증 수준 정책": 요통 팩과 같은 B수준 진입 기준). 등급 문자는 여전히 팩·이 문서에 옮기지 않는다. |
| **NECK_DIR_01(방향성 반복 운동)의 근거** | **제한 — 조건부 유지** | 로그 §2-4: 경추 방향 선호·중심화 근거는 제한적(May & Aina 2018 갱신 SR: 경추 연구 4편, MDT 경추 적용 "little support"). CPG 2017 권고 범주에 직접 대응하지 않는 유일한 Core 행. 유지 근거: 신전 호전 **반응이 기록된 경우에만** 후보, 원위 악화 시 즉시 제외, 요통 팩과 대칭. §10에 관찰 항목 추가, v1.1에서 유지/삭제. |
| **이 부위 문장의 원장 행 단위 검토** | **미완(조건부)** | PO 위임 승인. 파일럿 첫 10건에서 원장이 카드 문장을 읽고 고칠 항목을 §10으로 모은다. |

두 조건부 항목은 **운동 추천의 안전성**에 영향을 주지 않는다(안전·신경·원위 악화 게이트는 모두 코드로 검증됨).
영향을 주는 것은 **후보의 임상적 적절성·문장 품질**이며, 그것이 파일럿의 관찰 대상이다.

---

## 2. 가설 패턴 (5, PR #30 §6) — 확정
AXIAL_MOBILITY_DEFICIT / RADICULAR_INVOLVEMENT / CERVICOGENIC_HEADACHE / MOVEMENT_COORDINATION_DEFICIT /
SHOULDER_OR_PERIPHERAL. 라벨·환자용 쉬운 말은 초안 §2 그대로. 가설은 참고 표시이며 후보 필터가 아니다.

## 3. Core 9 — 확정 (초안 12 → 9)

| id | 운동 | 도메인 | 단계 |
|---|---|---|---|
| NECK_MOB_01 | 목 능동 가동범위 운동 | CERVICAL_MOBILITY | 1 |
| NECK_THX_01 | 흉추 가동성 운동(폼롤러 신전 또는 네발기기 회전) | THORACIC_MOBILITY | 2 |
| NECK_DIR_01 | 방향성 반복 운동(턱 당기고 뒤로 젖히기) — 신전 호전형 | DIRECTIONAL_RESPONSE | 1 |
| NECK_DNF_01 | 심부경부굴곡근 활성화(턱 당기기) | DNF_CONTROL_ENDURANCE | 1 |
| NECK_DNF_02 | 심부경부굴곡근 지구력(유지 시간 늘리기) | DNF_CONTROL_ENDURANCE | 2 |
| NECK_EXT_01 | 목 뒤 근육 지구력(엎드려 머리 중립 유지) | CERVICAL_EXTENSOR_ENDURANCE | 2 |
| NECK_SCAP_01 | 견갑 조절(견갑 후인·하강 유지, 벽 슬라이드) | SCAPULAR_CONTROL_STRENGTH | 2 |
| NECK_NEURAL_01 | 팔 신경 가동성 슬라이더 | NEURAL_MOBILITY | 2 |
| NECK_EXPO_01 | 작업 자세 내성 단계적 늘리기 | GRADED_EXPOSURE_WORK_POSTURE | 2 |

**보류(v1.1 후보)**: NECK_DIR_02(굴곡 호전형), NECK_SCAP_02(견갑·상지 근력, 3단계), NECK_ACT_01(걷기). 초안 §3의
"3·4 / 8·9 / 11·12 중 1개" 권고를 그대로 적용했다. 굴곡 호전 환자는 v1.0에서 방향성 운동 후보가 없다(V5b) —
파일럿에서 그 비율을 보고 DIR_02 추가를 결정한다.
**아카이브 8개**: 전부 폐기(병합 3·대체 3·미채택 2). id `NECK_FHP_*`, `NECK_TRAP_*`, `NECK_FLAT_*`, `NECK_THX_02`는
코드에 남지 않는다(테스트 J-④).
**도메인 커버리지**: 9개 도메인 중 AEROBIC_ACTIVITY(ACT_01 보류)를 제외한 8개에 후보가 있다. 도메인 표는 9개 그대로 둔다.

## 4. 메타 7필드 — 확정 (팩 파일이 정본)
초안 §4 표를 9행에 대해 그대로 옮겼다. 전 운동의 중단·재검토 첫 항목은 공통 문장 "새로운 또는 진행하는
신경증상(…)"이다(비네트 0절 단언). 용량 의미는 요통과 같다: 삼인당 실용 시작 기본값, 임상 임계값 아님.

## 5. 단계표 — 확정
1단계 3(MOB_01, DIR_01, DNF_01) / 2단계 6. 0단계는 표에 없다(능동 운동 미처방). 3단계 전용 행 없음 → 3단계
확정 시 9개 전부 허용(V6d). 단계 축은 공통 문항(VISIT_04·VISIT_03)만 작동하고 목 안전 플래그에는 재발 간격·
공포회피 입력이 없어 격하 2·상한 1은 발동하지 않는다(`pilot:region-stage -- neck`이 경고로 표시).

## 6. 적격성 규칙 — 확정
| id | requiresStableNeuro | stopOnDistalWorsening | requiredDirectionalResponse |
|---|---|---|---|
| NECK_NEURAL_01 | true | true | — |
| NECK_DIR_01 | false | true | EXTENSION_FAVORABLE |
| 그 외 7 | false | false | — |
신경 상태는 D-1 파생(`neuroExamIds`: `neck_exam_neuro_c5_t1`, `neck_exam_umn`). 둘 다 NEGATIVE일 때만 STABLE.

## 7. 검사 → 직접 뒷받침 — 확정 (순위 버킷만)
`neck_exam_ultt → NECK_NEURAL_01` / `neck_exam_dnf_endurance → NECK_DNF_01, NECK_DNF_02` /
`neck_exam_scapular_control → NECK_SCAP_01` / `neck_exam_crom → NECK_MOB_01`. Spurling·distraction 없음(V3b).

## 8. 목표 기능·재질문 — 확정
프리셋 4(LOOKING_BACK / DESK_WORK / SLEEP / OVERHEAD) + 자유. 재질문 `NECK_12`(서버 표 parity, C절).

## 9. 구동 규칙 변경 (이 승인과 함께) — 어깨 우세 환자는 목 팩으로 후퇴하지 않는다
R2의 "판별 부위 팩이 승인 전이면 같은 모집단의 승인 팩으로 후퇴"는 **고관절 → 요통만** 남긴다.
어깨 → 목 후퇴를 허용하면 NS01=어깨 우세 환자가 목 가설 칩·목 운동 후보를 새로 보게 되는데, 이것은 회귀 방지가
아니라 다른 부위의 판단을 덧씌우는 일이다. 어깨 팩 승인 전까지 그 환자는 R2 이전처럼 안전 패널만 본다
(`regionRouting.ts` `FALLBACK_REGIONS`, 서버 parity, 테스트 B-fallback·H절).

## 10. 파일럿 관찰 항목 (⑥) — 원장 기록
**집계**: 2·3·4·5·7은 `npm run pilot:region-observation -- neck`이 저장 기록에서 자동으로 센다. 1·6은 손으로
(`docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md` — 기록 절차 §1, 판정 임계값 §3, 수동 표 §4, 종료 기준 §5).
1. 후보 카드 문장 중 고칠 것(운동 id + 필드 + 수정 문장).
2. 굴곡 호전 환자 비율 → DIR_02 추가 여부.
3. 신경 검사 2개를 모두 기록한 비율 → 미기록 안내문이 실제로 검사를 유도하는가.
4. `npm run pilot:region-stage -- neck` 단계 분포(0단계 >30% / 한 단계 >80% 경고).
5. 세부문진 `NECK_12` 응답률.
6. §1 조건부 2건: CPG 2017 원문 A수준 대조 결과(로그 §5-1, **v1.1 항목 — 파일럿 전제 아님**), 행 단위 문장 검토 결과.
7. **NECK_DIR_01 채택률·반응**(근거 제한, 로그 §2-4) → v1.1 유지/삭제 결정.

## 11. 코드 대응 (④ 실행 완료, 2026-09-07)
- `regionPacks/neck.ts` 전 필드 + `provenance` 전부 `CLINICIAN_APPROVED` + `productionApproved: true`.
- `server/detailCheck.js` `neck: ['NECK_12']`.
- `regionRouting.ts` / `server/regionRouting.js` `FALLBACK_REGIONS = { hip: ['lbp'] }`.
- `tests/neck-exercise-core.vignettes.spec.mjs`(신설, 엔진 구동 39단언), `tests/region-pack.spec.mjs` 318.
