# 무릎(KNEE) Exercise Clinical Decisions v1.0 — CLOSED

**상태**: CLOSED (2026-09-07). 팩 `src/doctor/workspace/regionPacks/knee.ts` `productionApproved: true`의 근거 문서.
**승인 경로**: PR #30 `docs/recovered_rehab_architecture/KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md`(phenotype 7·Domain 11·금지 6) +
`docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §4(B수준 근거) → Claude 초안 → PO "허리를 기준으로 모든 파트 진행"(2026-09-07) → 이 문서.
어깨와 달리 **별도 근거 매트릭스 초안 단계를 거치지 않았다** — 이 문서가 매트릭스 겸 CLOSED다(PO가 "전부" 진행을 택했고 PR #30
프레임워크가 이미 도메인·관리 방향을 정해 둔 부위라서). 파일럿 §10에서 원장이 카드 문장을 읽고 고칠 항목을 모은다.
**진입 기준**: B수준(요통·목·어깨와 동일).

---

## 1. Opus 임상 검수 — PASS (조건부 항목 2)

| 항목 | 판정 | 근거 |
|---|---|---|
| 안전 게이트가 운동 추천보다 앞서는가 | PASS | `evaluateKneeSafety` = `kneeLogic.ts` FROZEN 재계산, fail-closed. 진성 잠김·화농관절·미응답 → SAFETY_REVIEW(비네트 V4a–c). |
| 진단명 → 운동 하드코딩이 없는가 | PASS | 가설 id가 운동 쪽에 없음(E-4). PR#30 금지 6 대응: "OA = 사두근 1개" 없음(OA 환자도 목표 기능·단계로 12행 중 후보), "PFP = VMO 고립" 없음(VMO id 폐기), "반월판 = 회전 금지" 없음(회전 제한 규칙 없음), "ACL = 동일 재활" 없음(인대 복귀 행은 검사 소견으로만 뒷받침), "건 = 휴식" 없음(TEND_01 용량 문장 "휴식은 부하를 낮추는 것", 비네트 0절). |
| 신경 결손 시 운동을 내지 않는가 | PASS | 무릎 팩은 `neuroExamIds` 없음 — 원위 신경 변화는 L0 문항(KNEE_02 MAJOR_NEW_DISTAL_NEURO_CHANGE → URGENT)이 잠근다. |
| 확률·cutoff를 넣지 않았는가 | PASS | 팩·문서 어디에도 없음. 슬개건 등척성 각도(30~60°)는 시작 자세 서술이지 임계값이 아니다. |
| **근거 범주 밖 행** | **조건부** | 로그 §4-2: 스텝업/다운(c)·카프 레이즈(j 일부)·건 등척성→HSR(i)은 CPG 범주 직접 근거 없음(리뷰·RCT 수준). 유지 근거: 기능 목표(계단)에 직접 대응하고 PR#30 도메인(계단 내성·건 부하 점진)에 속한다. §10에서 채택률 관찰. |
| **행 단위 문장 검토** | **미완(조건부)** | PO 위임 승인. 파일럿 §10-1. |

## 2. 가설 패턴 (7) — 확정
PR#30 phenotype 7 그대로(KNEE_OA / PATELLOFEMORAL_PAIN / PATELLAR_TENDINOPATHY / ACUTE_MENISCAL / DEGENERATIVE_MENISCAL /
LIGAMENT_INSTABILITY / PATELLAR_INSTABILITY). 참고 표시이며 후보 필터가 아니다.

## 3. Core 12 — 확정 (아카이브 8 → 전부 폐기)

| id | 운동 | 도메인 | 단계 | 근거 범주(로그 §4) |
|---|---|---|---|---|
| KNEE_EDU_01 | 걷기·활동 유지 + 통증 반응 교육 | ACTIVITY_AEROBIC | 1 | AAOS 2021 Strong(운동·자가관리), OARSI 2019 Core, NICE NG226 |
| KNEE_MOB_01 | 무릎 굽힘·펴기 가동성 | MOBILITY | 1 | JOSPT 2018 ROM B |
| KNEE_QUAD_01 | 대퇴사두근 활성화(쿼드셋·SLR·TKE) | QUADRICEPS_STRENGTH | 1 | JOSPT 2019 비체중부하 신전 A, 2017 A |
| KNEE_QUAD_02 | 앉았다 일어서기·박스 스쿼트 | SIT_TO_STAND_SQUAT_STAIR | 2 | JOSPT 2019 저항 스쿼트 A |
| KNEE_STEP_01 | 스텝업·스텝다운 조절 | SIT_TO_STAND_SQUAT_STAIR | 2 | 범주 직접 근거 없음(기능 운동) — 조건부 |
| KNEE_GLUT_01 | 고관절 후외측 강화 | HAMSTRING_CALF_HIP_STRENGTH | 1 | JOSPT 2019 A(가장 직접) |
| KNEE_HSC_01 | 햄스트링·종아리 강화 | HAMSTRING_CALF_HIP_STRENGTH | 2 | 햄스트링: Kotsifaki 2023 / 종아리: 직접 범주 없음 |
| KNEE_BAL_01 | 한 발 균형·신경근 조절 | NEUROMUSCULAR_BALANCE | 2 | JOSPT 2017 A, 2018 B, AAOS Moderate |
| KNEE_PF_01 | 슬개대퇴 단계적 부하(제한 각도) | PF_GRADED_LOADING | 2 | JOSPT 2019 A(각도 수치는 Malliaras 2015 문맥) |
| KNEE_TEND_01 | 슬개건 부하 점진(등척성 → 느린 고부하) | TENDON_LOAD_PROGRESSION | 2 | Rio 2015 / Malliaras 2015 / Kongsgaard 2009 — CPG 등급 없음, 조건부 |
| KNEE_LIG_01 | 감속·방향 전환 조절 | LIGAMENT_RETURN_TO_FUNCTION | 3 | JOSPT 2017 신경근 A, van Melick 2016 기준 기반 단계 |
| KNEE_GAIT_01 | 달리기 복귀 단계적(걷기·뛰기 교대) | GAIT_LOAD_PROGRESSION | 3 | Kotsifaki 2023(근력 기준 게이트) |

**아카이브 8개 처리**: KNEE_IR_01(VMO 스텝다운) → STEP_01에 병합(VMO 고립 폐기) / IR_02(힙 ER 밴드) → GLUT_01 / ER_01(90/90) 미채택 /
ER_02(내전) 미채택 / STIFF_01(뒤꿈치 스쿼트) → QUAD_02 / STIFF_02(슬라이더) → MOB_01 / HIP_01(스텝다운) → STEP_01 / HIP_02(팔로프 런지) →
LIG_01. **id 전부 폐기**(region-pack J-④, `KNEE_(IR|ER|STIFF|HIP)_` 부재 단언). 도메인 11 중 GRADED_EXPOSURE는 독립 행 없음.

## 4. 메타 7필드 — 확정 (팩 파일이 정본)
중단·재검토 첫 항목 공통: "새로운 또는 진행하는 신경증상(다리 힘빠짐·감각저하) 또는 무릎이 완전히 펴지지 않는 잠김·급격한 붓기".
용량은 삼인당 시작 기본값(임상 임계값 아님). 통증 반응 원칙(NICE: 초기 일시적 증가는 정상 범위, 다음 날 기저 회복)을 EDU_01에 문장으로.

## 5. 단계표·적격성 — 확정
1단계 4(EDU_01·MOB_01·QUAD_01·GLUT_01) / 2단계 6 / 3단계 2(LIG_01·GAIT_01). 규칙 전부 기본값, 방향성 카드 미적용, `neuroExamIds` 없음.

## 6. 검사(10) → 직접 뒷받침(8쌍) — 확정
아카이브 4(squat·step_down·single_leg_stance·tke) + 추가 6(rom·effusion·quad_lag·stability·pf_load·joint_line).
`tke → QUAD_01` / `quad_lag → QUAD_01` / `squat → QUAD_02` / `step_down → STEP_01, GLUT_01` / `single_leg_stance → BAL_01` /
`rom → MOB_01` / `pf_load → PF_01, TEND_01` / `stability → BAL_01, LIG_01`. effusion·joint_line은 쌍 없음(가설 근거·안전 문맥).
검사 소견 → 운동이지 진단명 → 운동이 아니다(안정성 검사 이완 소견이 균형·기능 복귀 행을 뒷받침).

## 7. 목표 기능·재질문 — 확정
프리셋 4(STAIRS / SQUAT / WALKING / RUNNING) + 자유. 재질문 `KNEE_12`(아침 강직 지속), `KNEE_13`(휘청·빠질 느낌) — 서버 표 parity.

## 8. 금지(코드 단언) — 확정
E-4(가설 id 부재·진단 토큰 부재), 아카이브 id 부재(J-④), TEND_01 "휴식은 부하를 낮추는 것"(비네트 0절).

## 9. 구동
`safety_flags.knee` 단독 부위 — 후퇴 쌍 없음.

## 10. 파일럿 관찰 항목 — 원장 기록
**집계**: `npm run pilot:region-observation -- knee` / 절차·임계값은 `docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md` §1~§3과 같다.
1. 후보 카드 문장 중 고칠 것.
2. 조건부 행(STEP_01·HSC_01·TEND_01) 채택률 → v1.1 유지/삭제.
3. `pilot:region-stage -- knee` 단계 분포 — 12행 중 1단계가 4행뿐이라 1단계 환자에게 후보가 적게 느껴지는지.
4. `KNEE_12`·`KNEE_13` 응답률.
5. effusion·joint_line 검사 기록률(뒷받침 쌍이 없는 검사를 원장이 계속 기록하는가 — 아니면 v1.1에서 삭제).
6. 달리기 복귀 목표(RUNNING) 환자 비율 → GAIT_01·LIG_01(3단계 전용) 도달 여부.

## 11. 코드 대응 (2026-09-07)
- `regionPacks/knee.ts` 전 필드 + `provenance` 전부 `CLINICIAN_APPROVED` + `productionApproved: true`.
- `server/detailCheck.js` `knee: ['KNEE_12', 'KNEE_13']`.
- `tests/knee-exercise-core.vignettes.spec.mjs`(22단언), `tests/region-pack.spec.mjs` 갱신.
