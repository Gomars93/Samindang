# 손목/손(WRIST_HAND) Exercise Clinical Decisions v1.0 — CLOSED

**상태**: CLOSED (2026-09-07). 팩 `src/doctor/workspace/regionPacks/wristHand.ts` `productionApproved: true`의 근거 문서.
**승인 경로**: 원장 문서 **없음**(2026-09-06 Notion·Drive 조사, R3 빈 팩) → `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §7(B수준:
CTS JOSPT 2019/2026, EULAR 2018·ACR 2019 손 OA, JOSPT 2024 원위요골골절, de Quervain NMA 2025, 손목 건병증 SR 2023 등) → Claude 초안
(가설 7·Core 10·검사 8·도메인 8) → PO "허리를 기준으로 모든 파트 진행"(2026-09-07) → 이 문서.
**이 팩의 특수성**: 6개 승인 팩 중 유일하게 **원장 콘텐츠가 0**인 상태에서 승인됐다. 그래서 §10 관찰이 다른 부위보다 무겁다 —
첫 10건에서 원장이 카드 문장을 읽고 고치는 것이 v1.1의 본체다. **진입 기준**: B수준(다른 부위와 동일).

---

## 1. Opus 임상 검수 — PASS (조건부 항목 3)

| 항목 | 판정 | 근거 |
|---|---|---|
| 안전 게이트가 운동 추천보다 앞서는가 | PASS | `evaluateWristHandSafety` = `wristHandLogic.ts` FROZEN 재계산, fail-closed. 변형·전신 감염·미응답 → SAFETY_REVIEW(비네트 V5a–c). 진행성 신경 결손(WH_08/08A)은 L0. |
| 진단명 → 운동 하드코딩이 없는가 | PASS | 가설 id가 운동 쪽에 없음(E-4). "수근관 = 신경 활주 자동" 없음 — NERVE_01은 목표 기능·단계·객관 검사 안정·유발 검사 뒷받침으로만 오른다. "de Quervain = 편심성 부하" 없음 — Finkelstein은 뒷받침 쌍 없음(근거 공백, 로그 §7-2 g). |
| 신경 결손 시 운동을 내지 않는가 | PASS | `wrist_hand_exam_median_neuro`(무지구 근력·위축·2점 식별) POSITIVE → 전체 차단(V2). AAOS: 무지구 위축은 수술 의뢰 고려 → 보존 운동 단독 지속에 신중. NERVE_01만 STABLE 요구(목 NEURAL_01과 대칭, V1). |
| 확률·cutoff를 넣지 않았는가 | PASS | 없음. |
| **근거 범주 밖 행** | **조건부** | RES_01(손목 저항)은 단일 연구·SR "제한적"(로그 §7-2 e); WH_ECC_01(편심성)은 **보류**. RES_01 유지 근거: 고정 후 강직·비특이 부하 통증에 부하 진행 행이 하나는 필요(요통·목의 지구력 행과 대칭). §10 채택률 관찰. |
| **재질문 문항 적합성** | **조건부** | `WH_11`(딸깍·걸림)만 single_choice로 쓸 수 있다. 부하 관련 문항 WH_10은 multi_choice라 세부문진이 지원하지 않는다 → v1.1에서 세부문진 multi 지원 또는 문항 신설 시 교체. |
| **행 단위 문장 검토** | **미완(조건부, 가장 중요)** | 원장 문서 0. 파일럿 §10-1. |

## 2. 가설 패턴 (7) — 확정
MEDIAN_NERVE_ENTRAPMENT_PATTERN / RADIAL_THUMB_TENDON_LOAD / THUMB_CMC_OA_PATTERN / ULNAR_SIDED_WRIST_LOAD / HAND_FINGER_OA_PATTERN /
POST_IMMOBILIZATION_STIFFNESS / NONSPECIFIC_WRIST_LOAD_PAIN. 관리 지향(수근관 "진단"이 아니라 정중신경 관리 패턴). 후보 필터가 아니다.

## 3. Core 10 — 확정 (WH_ECC_01 보류)

| id | 운동 | 도메인 | 단계 | 근거 범주(로그 §7) |
|---|---|---|---|---|
| WH_EDU_01 | 활동 조절·인체공학(손목 중립·페이싱; 야간 보조기 병행 안내) | EDUCATION_ACTIVITY_MODIFICATION | 1 | CTS CPG 교육·보조기, EULAR Rec1 A |
| WH_MOB_01 | 손목 능동 가동범위 | MOBILITY | 1 | JOSPT 2024 DRF ROM |
| WH_MOB_02 | 전완 회내·회외 가동 | MOBILITY | 1 | DRF CPG(회내/회외 명시 미확인 C) |
| WH_GLIDE_01 | 건 활주(주먹 순서) | TENDON_NERVE_GLIDING | 1 | CTS CPG 항목(등급 C) |
| WH_NERVE_01 | 정중신경 활주(저림 없는 범위) | TENDON_NERVE_GLIDING | 1 | CTS CPG 항목(등급 C), neurodynamic SR 단기 |
| WH_GRIP_01 | 악력 강화(퍼티·볼) | GRIP_STRENGTH | 2 | DRF CPG 악력, EULAR Rec2 A, JOSPT 2024 손 OA MA |
| WH_RES_01 | 손목 신근·굴근 저항(등척성 → 덤벨·밴드) | WRIST_LOADING | 2 | 직접 범주 없음 — 조건부 |
| WH_THUMB_01 | 엄지 CMC 안정화(FDI·대립근 + 손샅 스트레칭) | THUMB_STABILIZATION | 2 | McVeigh 2022 RCT, CMC 운동 MA, ACR 강력 권고(운동) |
| WH_HAND_01 | 손가락·손 관절 운동 프로그램 | HAND_OA_PROGRAM | 1 | EULAR Rec2 1a/A, ACR 2019 강력 |
| WH_FUNC_01 | 단계적 기능 노출 | FUNCTIONAL_GRADED_EXPOSURE | 3 | EULAR Rec1 페이싱, CTS CPG 활동 상담 |

**보류**: WH_ECC_01(편심성 손목 신근 부하 — 저질 리뷰만). 도메인 8(신설).

## 4. 메타 7필드 — 확정 (팩 파일이 정본)
중단·재검토 첫 항목 공통: "새로운 또는 진행하는 신경증상(손 힘빠짐·엄지 두덩 위축·지속 감각저하) 또는 손가락이 갑자기 움직이지 않음".
보조기는 운동이 아니므로 행을 만들지 않고 EDU_01 문장에 "야간 저림이 있으면 손목 중립 보조기 착용을 함께 안내"로만 둔다.

## 5. 단계표·적격성 — 확정
1단계 6 / 2단계 3 / 3단계 1. `WH_NERVE_01: requiresStableNeuro`. `neuroExamIds: ['wrist_hand_exam_median_neuro']`. 방향성 미적용.

## 6. 검사(8) → 직접 뒷받침(5쌍) — 확정
`rom → MOB_01, MOB_02` / `grip → GRIP_01` / `resisted_wrist → RES_01` / `cmc_grind → THUMB_01` / `phalen_tinel → NERVE_01, GLIDE_01`.
finkelstein·ulnar_load·median_neuro는 쌍 없음(가설 근거 / 차단 게이트).

## 7. 목표 기능·재질문 — 확정
프리셋 4(TYPING / GRIP / LIFTING_CHILDCARE / WEIGHT_BEARING) + 자유. 재질문 `WH_11`.

## 8. 금지(코드 단언) — 확정
E-4, Phalen/Tinel은 `neuroExamIds`에 없음(region-pack E-2), NERVE_01만 STABLE 요구(비네트 0절·V1).

## 9. 구동
`safety_flags.wrist_hand` 단독 부위 — 후퇴 쌍 없음.

## 10. 파일럿 관찰 항목 — 원장 기록
**집계**: `npm run pilot:region-observation -- wrist_hand` / 절차·임계값은 `docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md` §1~§3과 같다.
1. **후보 카드 문장 중 고칠 것 — 전 행**(원장 콘텐츠 0). 첫 10건에서 반드시.
2. 정중신경 객관 검사 기록률(③) → NERVE_01 후보 등장률.
3. RES_01 채택률(조건부) / WH_ECC_01 요구 여부.
4. `pilot:region-stage -- wrist_hand` 단계 분포.
5. `WH_11` 응답률 — 낮으면 v1.1 문항 교체.
6. 가설 칩 7개 중 쓰이지 않는 것 → 삭제 후보.

## 11. 코드 대응 (2026-09-07)
- `regionPacks/wristHand.ts` 전체 신규(빈 팩 → Core 10) + `provenance` 전부 `CLINICIAN_APPROVED` + `productionApproved: true`.
- `server/detailCheck.js` `wrist_hand: ['WH_11']`.
- `tests/wrist-hand-exercise-core.vignettes.spec.mjs`(23단언), `tests/region-pack.spec.mjs` 갱신.
