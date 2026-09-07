# 어깨(SHOULDER) Exercise Evidence Matrix v0.1 — 원장+Opus 초안

**상태**: CLOSED로 승격(2026-09-07, `docs/SHOULDER_EXERCISE_DECISIONS_v1.0_CLOSED.md`). 아래는 초안 기록. 목과 같은 절차: 이 문서 §0 체크리스트 → Opus 검수 →
`docs/SHOULDER_EXERCISE_DECISIONS_v1.0_CLOSED.md` → 팩 인코딩 → `productionApproved: true`.
**작성 근거**: PO 2026-09-07 "나머지는 추천안으로 진행"(직전 보고의 다음 행동 2 "어깨 ② 초안 착수").
**프레임워크 정본**: PR #30 `docs/recovered_rehab_architecture/SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md` +
`source/SHOULDER_V1_Evidence_Matrix_REHAB_EXTRACT.md`. **검사 원본**: Drive 「회전근개.md」(원장 검사 스크립트, 팩에 이미 5개).
**근거 검증**: `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §3 (전부 B수준 — 검색 요약 인용, 원문 미열람).

> 목과 같은 원칙. 추가로 어깨 고유: **"회전근개 = 밴드 외회전", "오십견 = 강한 ROM", "충돌증후군 = 견봉 공간 넓히기"
> 하드코딩 금지**(PR #30). 동결견은 "세게 늘릴수록 좋다"가 아니라 irritability에 맞춘 가동. 불안정은 스트레칭이 아니라
> 조절·안정·단계적 기능.

---

## 0. 원장 결정 체크리스트 (추천안 포함 — "추천안으로 진행"이면 그대로 확정)

| # | 결정 | 추천안 | 원장 표기 |
|---|---|---|---|
| 1 | 가설 패턴 7번째 `AC_LOCAL_CONTRIBUTION` 추가 여부 | **추가** — 원장 검사 스크립트에 수평내전(AC 자극) 검사가 이미 있어 걸 곳이 필요 | ☐ |
| 2 | Core 후보(§3) 11개 → 유지/삭제 | **10개** — SH_THX_01(흉추 가동)만 보류 | ☐ |
| 3 | 수동 검사 3개 추가(§6): 견갑 조절 관찰 / C5–T1 원위 신경 / 불안정 apprehension-relocation | **추가** (원위 신경 검사는 `neuroExamIds`로 지정 — 목과 같은 D-1 의미) | ☐ |
| 4 | 메타 7필드 문장(§4) | 초안 그대로, 파일럿에서 수정 | ☐ |
| 5 | 단계표(§5) | 1단계 4 / 2단계 5 / 3단계 1 | ☐ |
| 6 | 적격성 규칙(§5) | 전부 기본값(false/false); 방향성 카드 미적용 | ☐ |
| 7 | 검사 → 직접 뒷받침 5쌍(§6) | 초안 그대로 | ☐ |
| 8 | 재검 재질문 | `SH08`(부하 관련 통증 패턴) 1개 | ☐ |
| 9 | 근거 A수준 확인(로그 §5-5): Lee 2025 동결견 CPG irritability별 강도 | 원장 로컬 확인 | ☐ |

---

## 1. 근거 — B수준으로 확인된 것 (로그 §3)

| 출처 | 이 초안이 쓰는 문장 |
|---|---|
| Desmeules 2025 JOSPT RC 건병증 CPG | 능동 재활 운동이 **초기 치료**; 운동 조절 및/또는 저항 운동, 다양한 부하; 영상은 12주 실패 후(초음파 우선); 스테로이드 주사 1차 아님 |
| AAOS 2025 RC 손상 CPG | 소·중 전층 파열은 물리치료도 수술과 같은 수준으로 권고 — "파열 = 수술"이 아니다 |
| BESS 2025 견봉하 통증 pathway | 병력·진찰로 진단, 영상 필수 아님, 운동 1차 |
| Lee 2025 동결견 CPG(**Ann Rehabil Med**, JOSPT 아님) | 일차성 동결견 비수술 치료 권고 — irritability별 세부는 미확인(C) |
| BESS/BOA 비외상성 불안정 pathway 2019 · Derby 프로그램 | 안심·교육 + 고유수용·견갑·회전근개 운동; 이정표형 단계 진행 |
| BESS 2026 외상성 전방 탈구 재활 가이드 | 장기 고정 근거 부족, 조기 재활; 단계별 프로토콜 |

**근거로 주장하지 않는 것**: 운동별 세트·반복(삼인당 시작 기본값), 동결견 스트레칭 강도의 수치, 불안정 단계의 주 수.

---

## 2. 가설 패턴 (팩 6 + 추천 1)

| id | 라벨 | 관리 방향(PR #30) | 검사 근거 |
|---|---|---|---|
| RC_RELATED | 회전근개 관련 어깨통증 | 능동 재활 중심, 운동 조절/저항을 기능·반응에 맞춰, 단계적 부하 | 엠티캔·외회전/내회전 저항 재현 |
| FROZEN_SHOULDER | 동결견 패턴 | irritability 맞춤 가동 + 교육 + 단계적 기능; 강한 스트레칭 가정 금지 | 능동=수동 ROM 제한(외회전 우세) |
| GH_OA | 관절와상완 관절염 패턴 | 기능/부하/가동 허용 범위; 영상 중증도로 운동 결정 금지 | 능동=수동 제한 + 연령·마찰음 |
| INSTABILITY_TRAUMATIC | 외상성 불안정 | 급성 안전 후 단계별 안정·근력·조절; 재발·기능 맥락 | SH09/SH09A 외상 계기, apprehension |
| INSTABILITY_ATRAUMATIC_MOTOR_CONTROL | 비외상성·조절형 | 교육·운동 조절·회전근개/견갑 안정·단계적 기능 노출 | SH09A 비외상, 견갑 조절 관찰 |
| CERVICAL_CONTRIBUTION | 경추 기여 | 목 팩 선택 검사/안전 의미 재사용; 어깨 국소 진단 강요 금지 | NS01, 목 증상 재현 비교 |
| **AC_LOCAL_CONTRIBUTION** (추천 추가) | 견봉쇄골·국소 기여 | 증상 유도 국소 부하 조절 + 재활 | 수평내전 재현 |

`MUST_EXCLUDE`(감염·비정복 탈구/골절·급성 외상성 건파열·비근골격계 방사통)는 L0 `shoulderLogic.ts`(FROZEN) + 원장
`shoulder_objective_cuff_weakness` — 팩 범위 밖.

---

## 3. Core 후보 11 (추천 10) + 도메인 + 아카이브 8 처리

| # | id(안) | 운동(안) | 도메인 | 출처(범주) | 아카이브 | 단계 |
|---|---|---|---|---|---|---|
| 1 | SH_EDU_01 | 활동·부하 조절(통증 허용 범위 사용, 야간 팔 받침, 통증 유발 동작 줄이기) | EDUCATION_LOAD_MODIFICATION | Desmeules 2025 / BESS | — | 1 |
| 2 | SH_MOB_01 | 진자 + 보조 거상(막대·벽 타기, 통증 허용 범위) | MOBILITY | 동결견·RC 공통 가동 | — | 1 |
| 3 | SH_MOB_02 | 앞가슴·후방 어깨 저강도 스트레칭(소흉근 열기, 슬리퍼/크로스바디 — irritability 맞춤) | MOBILITY | 동결견 CPG(강도 미확인) | SH_PROT_02 병합 | 1 |
| 4 | SH_THX_01 | 흉추 신전/회전 가동성 | MOBILITY | 보조 | SH_THX_01 + SH_THX_02 병합 | 2 — **보류 추천** |
| 5 | SH_RC_01 | 등척성 외회전·내회전(벽/문틀, 통증 허용) | ROTATOR_CUFF_RESISTANCE | Desmeules 2025(저항, 다양한 부하) | — | 1 |
| 6 | SH_RC_02 | 밴드 외회전·내회전 점진 부하 | ROTATOR_CUFF_RESISTANCE | 같음 | SH_IR_01 | 2 |
| 7 | SH_SCAP_01 | 전거근 벽 슬라이드 + 견갑 상방회전 조절 | SCAPULAR_MOTOR_CONTROL | Desmeules 2025(운동 조절) | SH_PROT_01 + SH_IR_02 병합 | 2 |
| 8 | SH_SCAP_02 | 하부 승모근 Y-레이즈 / 견갑 하강 유지 | SCAPULAR_MOTOR_CONTROL | 같음 | SH_TRAP_01 + SH_TRAP_02 병합 | 2 |
| 9 | SH_STAB_01 | 폐쇄 사슬 안정성(벽 푸시업 플러스·볼 압박·고유수용 흔들기) | STABILITY_CONTROL | BESS 비외상성 불안정 / Derby | — | 2 |
| 10 | SH_OVH_01 | 머리 위 동작 단계적 노출(벽 슬라이드 → 가벼운 부하 거상, 하지·몸통 구동 포함) | OVERHEAD_GRADED_EXPOSURE (+KINETIC_CHAIN) | PR#30 도메인 | — | 2 |
| 11 | SH_FUNC_01 | 뻗기·들기 내성 단계적(카운터 높이 → 선반, 들기 무게 점진) | FUNCTIONAL_REACH_LIFT | PR#30 도메인 | — | 3 |

아카이브 8개: 병합 6(PROT_02→3, THX_01/02→4, PROT_01/IR_02→7, TRAP_01/02→8), 대응 1(IR_01→6), 전부 **폐기**(id 남지 않음).
도메인 커버리지: 8개 도메인 중 KINETIC_CHAIN은 SH_OVH_01에 흡수(독립 행 없음) — 도메인 표는 8개 유지.

---

## 4. 메타 7필드 (제안, 요통·목 문형; 중단·재검토 첫 항목 공통 = "새로운 또는 진행하는 신경증상(팔 힘빠짐·감각저하) 또는 어깨가 빠지는 사건")

| id | 시작 기준 | 시작 용량 | 수용 반응 | 중단·재검토(공통 +) | 후퇴 | 전진 | 목표 기능 |
|---|---|---|---|---|---|---|---|
| SH_EDU_01 | 안전 CLEAR; 환자가 통증 유발 동작·야간 자세를 말할 수 있음 | 매일: 유발 동작 목록 + 대체 방법 1~2개, 야간 팔 받침 | 야간 통증·유발 빈도가 늘지 않음 | +야간 통증 급증, 팔 들기 갑자기 불가 | 활동 범위 더 축소 | 유발 동작 1개씩 재도입 | OVERHEAD, DRESSING, LIFTING, SLEEP |
| SH_MOB_01 | 급성 외상 안전 확인 CLEAR; 진자에서 날카로운 통증 없음 | 진자 1분 × 2 + 보조 거상 10회, 하루 2회 | 당김만, 종료 후 기저 회복 | +통증이 다음 날까지 악화, 빠지는 느낌 | 진자만 | 보조 거상 각도 | OVERHEAD, DRESSING |
| SH_MOB_02 | 능동·수동 ROM 제한이 기록됨; 스트레칭 중 통증 ≤ 가벼운 당김 | 20~30초 × 3, 하루 2회, **통증 범위 내** | 당김이 반복 중 줄어듦 | +당일 야간 통증 악화 → 강도 낮춤(동결견에서 "세게" 금지) | 시간·범위 절반 | 유지 시간만 | DRESSING, OVERHEAD, SLEEP |
| SH_THX_01 | 네발기기/폼롤러 가능 | 5~8회 × 1~2세트 | 등 위쪽 당김만 | +어깨·목 증상 증가 | 범위 축소 | 범위 | OVERHEAD |
| SH_RC_01 | 저항 검사에서 힘 주기가 가능(급성 외상성 건파열 우려 없음) | 5초 유지 × 10회, 통증 허용 강도, 하루 2회 | 힘줄 주변 가벼운 피로 | +힘이 갑자기 빠짐, 통증 급증 | 강도 절반 | 유지 시간 → 밴드 | LIFTING, OVERHEAD, DRESSING |
| SH_RC_02 | SH_RC_01 수행 가능; 팔꿈치 옆구리 고정 유지 가능 | 가벼운 밴드 10~15회 × 2세트, 하루 1회 | 다음 날 통증 기저 회복 | +통증 누적, 보상(어깨 으쓱) | 밴드 제거 → 등척성 | 밴드 강도 또는 세트 중 하나 | LIFTING, OVERHEAD |
| SH_SCAP_01 | 벽 슬라이드 중 통증 재현 없음 | 8~10회 × 2세트 | 견갑 주변 피로만 | +어깨 앞 통증 재현 | 범위 축소 | 범위 → 저항 | OVERHEAD, DRESSING |
| SH_SCAP_02 | 엎드리기 가능, 목 보상 없음 | 무부하 8~12회 × 2세트 | 견갑 사이 피로 | +목·승모근 과긴장 보상 | 횟수 절반 | 가벼운 부하 | OVERHEAD, LIFTING |
| SH_STAB_01 | 벽 푸시업 자세에서 빠지는 느낌 없음 | 벽 푸시업 플러스 10회 + 볼 압박 30초 × 3 | 조절감 유지 | +빠질 것 같은 느낌 재현 → 중단 | 벽 각도 완화 | 표면 불안정 → 부하 | LIFTING, OVERHEAD |
| SH_OVH_01 | 벽 슬라이드 통증 없이 가능; 목표 기능에 머리 위 동작 포함 | 벽 슬라이드 10회 → 무부하 거상 10회, 하루 2회 | 거상 각도가 유지·증가 | +거상 시 통증 급증, 팔 힘 빠짐 | 벽 슬라이드만 | 부하 0.5~1 kg 단계 | OVERHEAD |
| SH_FUNC_01 | 목표 동작을 환자가 말할 수 있음; 현재 허용 높이·무게 파악 | 허용 무게의 70%부터, 높이 1단계 | 다음 날 기저 회복 | +세션마다 허용량 감소 | 높이·무게 한 단계 아래 | 높이 또는 무게 중 하나 | LIFTING, DRESSING |

---

## 5. 단계표·적격성
- 단계: 1단계 SH_EDU_01, SH_MOB_01, SH_MOB_02, SH_RC_01 / 2단계 SH_RC_02, SH_SCAP_01, SH_SCAP_02, SH_STAB_01, SH_OVH_01(+THX_01 보류) / 3단계 SH_FUNC_01.
- 적격성: 전부 기본값(`requiresStableNeuro:false`, `stopOnDistalWorsening:false`). 방향성 카드 미적용(설계 §3).
  신경 상태는 `neuroExamIds: ['shoulder_exam_distal_neuro']` → POSITIVE면 RF-3b 전체 차단(목과 같음). 어떤 운동도
  STABLE을 요구하지 않으므로 미시행이 후보를 비우지 않는다.
- 불안정 관련 보수성: 외상성 불안정은 L0(SH02 변형/신경혈관·비정복 의심)가 잠근다. 팩 규칙 입력에 "불안정"은 없어
  운동 단위 게이트는 만들지 않는다 — 시작 기준 문장으로 서술.

---

## 6. 수동 검사(팩 5 + 추천 3) → 직접 뒷받침 5쌍

| 검사 id | 출처 | POSITIVE → 직접 뒷받침 |
|---|---|---|
| shoulder_exam_rom(목덜미·브라끈) | 원장 스크립트 | SH_MOB_01, SH_MOB_02 |
| shoulder_exam_empty_can | 원장 스크립트 | SH_RC_01 |
| shoulder_exam_er_resist | 원장 스크립트 | SH_RC_01, SH_RC_02 |
| shoulder_exam_subscap_resist | 원장 스크립트 | (쌍 없음 — 가설 근거) |
| shoulder_exam_horizontal_adduction | 원장 스크립트 | (쌍 없음 — AC 가설 근거) |
| **shoulder_exam_scapular_control** (추가) | PR#30 선택 입력 "movement control" | SH_SCAP_01, SH_SCAP_02 |
| **shoulder_exam_distal_neuro** (추가, `neuroExamIds`) | PR#30 재평가 "distal neuro change"; 목 semantics 재사용 | (쌍 없음 — 차단 게이트) |
| **shoulder_exam_apprehension_relocation** (추가) | PR#30 instability; 급성 탈구 의심 시 시행 금지(도움말) | SH_STAB_01 |

---

## 7. 목표 기능·재질문
프리셋 4(OVERHEAD / DRESSING / LIFTING / SLEEP) + 자유(현행). 재질문 **`SH08`** "팔을 들거나, 물건을 들거나, 어깨에 힘을
줄 때 통증이 더 뚜렷해지나요?"(single_choice, 부하 관련 패턴) 1개.

## 8. 금지(코드 단언 대상)
RC = 밴드 외회전 자동 / 동결견 = 강한 ROM / 충돌 = 견봉 공간 운동 → 가설 id가 운동 쪽에 없음(E-4 J절), 동결견 행의
용량 문장에 "통증 범위 내" 고정, 진단 토큰(IMPINGEMENT) id 금지.

## 9. 파일럿 관찰(⑥) — 목 CLOSED §10과 같은 6항목 + 어깨 고유: 야간 통증 추적(보조 지표, 안전 지표 아님), 불안정 사건 수.

## 10. 착수 조건
> **2026-09-07 해제**: PO "허리를 기준으로 모든 파트 진행" → 체크리스트 9를 추천안 그대로 확정, `docs/SHOULDER_EXERCISE_DECISIONS_v1.0_CLOSED.md`.
> 부위별 집계 스크립트(`pilot:region-observation -- <region>`)가 목·어깨 관찰을 분리하므로 동시 파일럿의 리스크 3은 완화됐다.

목 파일럿 첫 관찰(CLOSED §10-1 문장 수정 목록)이 한 번 돌아온 뒤 이 문서를 CLOSED로 올린다 — 같은 가정(VISIT_04
단계 축·7필드 문형)에 두 부위를 동시에 거는 것을 피하기 위해(설계 §9 리스크 3). PO가 "지금 진행"을 택하면 목과 같은
절차로 즉시 인코딩 가능(예상: 팩 1파일 + 비네트 스위트 + 서버 표 1행 + 테스트 갱신).
