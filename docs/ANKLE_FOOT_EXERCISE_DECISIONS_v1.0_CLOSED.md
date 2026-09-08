# 발목/발(ANKLE_FOOT) Exercise Clinical Decisions v1.0 — CLOSED

**상태**: CLOSED (2026-09-07). 팩 `src/doctor/workspace/regionPacks/ankleFoot.ts` `productionApproved: true`의 근거 문서.
**승인 경로**: Notion 「매선 프로토콜 › 발목 패턴」(2025-12-04, **원장 원안 포맷** — 「목차」 명시) → R3 DRAFT 팩(패턴 3·운동 11·검사 4 이름만)
→ `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §6(B수준) → Claude가 7필드·단계·도메인을 채우고 CPG 관리 범주 3개를 **추가** →
PO "허리를 기준으로 모든 파트 진행"(2026-09-07) → 이 문서. 별도 매트릭스 초안 단계 없음(무릎과 같은 이유).
**원장 원안 보존 원칙**: 3패턴 id·라벨, 운동 11개 id·표시명, 검사 4개 id·문구(10cm / 6~8cm / 55:45 기준값 포함), 배굴 스트레칭 "10회"는
**그대로**. 추가한 것은 전부 "추가"로 표시하고 원안을 바꾸지 않았다(region-pack J-④가 11개 id 보존을 단언).
**진입 기준**: B수준(요통·목·어깨·무릎과 동일).

---

## 1. Opus 임상 검수 — PASS (조건부 항목 3)

| 항목 | 판정 | 근거 |
|---|---|---|
| 안전 게이트가 운동 추천보다 앞서는가 | PASS | `evaluateAnkleFootSafety` = `ankleFootLogic.ts` FROZEN(A1–A8) 재계산, fail-closed. 사지 위협·진행성 신경·미응답 → SAFETY_REVIEW(비네트 V4a–c). Ottawa·아킬레스 파열·DVT·감염/Charcot는 L0 문항. |
| 진단명 → 운동 하드코딩이 없는가 | PASS | 가설 id가 운동 쪽에 없음(E-4). CPG 패턴 3개(염좌·아킬레스·족저)는 칩일 뿐이며 그 운동(BAL_01·TEND_01·PF_01)은 목표 기능·단계·검사 소견으로만 오른다. |
| 신경 결손 시 운동을 내지 않는가 | PASS | `neuroExamIds` 없음 — 원위 신경 변화는 L0(AF_02·AF_08). |
| 확률·cutoff를 넣지 않았는가 | PASS(원안 예외) | 팩에 새 cutoff 없음. 원장 원안 검사 문구의 10cm·6~8cm·55:45는 **원장 기준값**이라 그대로 두었다(Claude가 만든 값이 아님). |
| **두 분류 축의 공존** | **조건부** | 원장 3패턴(골반·고관절 전략·발목 가동성 — 움직임 전략 축)과 CPG 3패턴(염좌·아킬레스·족저 — 관리 범주 축)이 한 칩 줄에 있다. 겹치는 환자가 많으면 v1.1에서 축을 나누거나 CPG 3을 뺀다(§10-2). |
| **근거 범주 밖 행** | **조건부** | 로그 §6-2: 힙 힌지·힙 쓰러스트(g)·90/90(k)은 발·발목 CPG 직접 근거 없음, 스텝다운(h)은 단면 연구 수준. 전부 **원장 원안**이라 유지. §10에서 채택률 관찰. |
| **행 단위 문장 검토** | **미완(조건부)** | PO 위임 승인. 파일럿 §10-1. |

## 2. 가설 패턴 (6) — 확정
원장 3(PELVIC_ALIGNMENT_LOSS / HIP_STRATEGY_LOSS / ANKLE_MOBILITY_LOSS, 선언 순서 유지) + CPG 3(LATERAL_ANKLE_SPRAIN_RECOVERY /
ACHILLES_TENDON_LOAD / PLANTAR_HEEL_PAIN). 참고 표시이며 후보 필터가 아니다.

## 3. Core 15 — 확정 (원장 11 + 추가 4)

| id | 운동 | 도메인 | 단계 | 출처 |
|---|---|---|---|---|
| AF_EDU_01 | 통증 반응 교육 + 점진적 체중부하 | EDUCATION_LOAD_MODIFICATION | 1 | 추가 — JOSPT 2021, Silbernagel 통증 모니터링 |
| AF_PELV_01 | 클램 | PROXIMAL_HIP_CONTROL | 1 | 원안 |
| AF_PELV_02 | 사이드 브릿지 | PROXIMAL_HIP_CONTROL | 2 | 원안 |
| AF_PELV_03 | 힙 어브덕션(중둔근 강화) | PROXIMAL_HIP_CONTROL | 2 | 원안 — CAI 고관절 강화 SR/MA(병행 시) |
| AF_HIPS_01 | 힙 힌지 | PROXIMAL_HIP_CONTROL | 2 | 원안 — 범주 직접 근거 없음(조건부) |
| AF_HIPS_02 | 힙 쓰러스트 | PROXIMAL_HIP_CONTROL | 2 | 원안 — 조건부 |
| AF_HIPS_03 | 스텝다운 컨트롤 | PROXIMAL_HIP_CONTROL | 2 | 원안 — 조건부 |
| AF_HIPS_04 | 90/90 고관절 내·외회전 | PROXIMAL_HIP_CONTROL | 2 | 원안 — 조건부 |
| AF_MOB_01 | 벽 발목 배굴 스트레칭 | ANKLE_MOBILITY | 1 | 원안(10회) — JOSPT 2021 배굴, 2023 종아리 스트레칭 |
| AF_MOB_02 | 카프 레이즈 | CALF_PLANTARFLEXOR_STRENGTH | 2 | 원안 — JOSPT 2018 부하 A, 2023 저항운동 B |
| AF_MOB_03 | 발목 가동성 드릴 | ANKLE_MOBILITY | 1 | 원안 |
| AF_MOB_04 | 부드러운 착지 훈련 | LANDING_RETURN_TO_ACTIVITY | 3 | 원안 — hop-stabilization RCT |
| AF_BAL_01 | 한 발 균형 진행(베개·폼 → 보드) | BALANCE_PROPRIOCEPTION | 1 | 추가 — JOSPT 2021(진행 명시), CAI SR/MA |
| AF_TEND_01 | 아킬레스 부하 점진(등척성 → 뒤꿈치 내리기·HSR) | TENDON_LOAD_PROGRESSION | 1 | 추가 — JOSPT 2018 Grade A, Alfredson, Beyer 2015 |
| AF_PF_01 | 족저근막 특이 스트레칭 + 종아리 스트레칭 | PLANTAR_FASCIA_HEEL | 1 | 추가 — JOSPT 2023 |

도메인 8(신설). 문서의 3-Phase(방문 회차 1~4/5~8/9~12)는 단계 축과 다르므로 옮기지 않았다.

## 4. 메타 7필드 — 확정 (팩 파일이 정본)
중단·재검토 첫 항목 공통: "새로운 또는 진행하는 신경증상(발·발가락 힘빠짐·감각저하) 또는 종아리 한쪽 붓기·통증(혈전 우려)".
통증 모니터링(운동 중 ≤5/10, 다음 날 아침 기저 회복)을 EDU_01·TEND_01에 문장으로. 용량은 시작 기본값(원안 10회만 원장 값).

## 5. 단계표·적격성 — 확정
1단계 7(EDU_01·MOB_01·MOB_03·PELV_01·PF_01·TEND_01·BAL_01) / 2단계 7 / 3단계 1(MOB_04). 규칙 전부 기본값, 방향성 카드 미적용.

## 6. 검사(8) → 직접 뒷받침(8쌍) — 확정
원안 4 + 추가 4(heel_raise·achilles_load·plantar_heel·ligament_laxity).
`df_lunge → MOB_01, MOB_03` / `sls → BAL_01, PELV_01` / `squat → HIPS_01, HIPS_03` / `weight_shift → PELV_01, PELV_02, PELV_03` /
`heel_raise → MOB_02` / `achilles_load → TEND_01` / `plantar_heel → PF_01` / `ligament_laxity → BAL_01`.

## 7. 목표 기능·재질문 — 확정
프리셋 4(WALKING / STAIRS / RUNNING / STANDING_LONG) + 자유. 재질문 `AF_00`(가장 불편한 부위 — 재검 때 위치 이동 확인;
발목 모듈에 증상 문항이 안전 8개뿐이라 이것이 유일한 single_choice 후보). v1.1: 부하 관련 통증 문항 신설 시 교체.

## 8. 금지(코드 단언) — 확정
E-4, 원안 11개 id·표시명 보존(J-④, 비네트 0절), 원안 "10회" 보존(비네트 0절).

## 9. 구동
`safety_flags.ankle_foot` 단독 부위 — 후퇴 쌍 없음.

## 10. 파일럿 관찰 항목 — 원장 기록
**집계**: `npm run pilot:region-observation -- ankle_foot` / 절차·임계값은 `docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md` §1~§3과 같다.
1. 후보 카드 문장 중 고칠 것 — 특히 원안 운동 11개의 7필드(Claude가 채움).
2. 원장 3패턴 vs CPG 3패턴 칩 선택 분포 → 두 축 공존 유지/분리/삭제.
3. 조건부 행(HIPS_01·02·03·04) 채택률.
4. `pilot:region-stage -- ankle_foot` 단계 분포.
5. `AF_00` 재질문 응답률·위치 이동 빈도.
6. 추가 4행(EDU_01·BAL_01·TEND_01·PF_01) 채택률 — 원안에 없던 행이 실제로 쓰이는가.

## 11. 코드 대응 (2026-09-07)
- `regionPacks/ankleFoot.ts` 전 필드 + `provenance` 전부 `CLINICIAN_APPROVED` + `productionApproved: true`.
- `server/detailCheck.js` `ankle_foot: ['AF_00']`.
- `tests/ankle-foot-exercise-core.vignettes.spec.mjs`(22단언), `tests/region-pack.spec.mjs` 갱신.
