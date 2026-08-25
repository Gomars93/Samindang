# KNEE_V1 Tablet Question Set v0.1 — Opus 재검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**대상 문서**: `KNEE_V1_Tablet_Question_Set_v0.1.md`
**판정**: **CLINICAL DECISION REQUIRED**

이 문서는 Opus v0.2 재검수 결과를 보존하는 기록이다. 이후 남은 3개 차단항목은 `KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md`에 규범적으로 반영되었다. 최종 PASS/CLOSED 판정 전까지 production code 구현은 계속 금지한다.

## 남은 차단항목(당시 판정)

1. **K5 DVT calibration**
   - `KNEE_06 YES` 단독 REVIEW는 과잉경고.
   - §11을 §12의 combined-condition 로직과 통일.
   - YES + risk context positive/UNKNOWN/invalid → REVIEW + `dvt_assessment_required`.
   - YES + explicit `NONE` → 이 경로만으로 REVIEW를 만들지 않음.

2. **K9 referred hip-fracture gap**
   - KNEE_08의 neuro/CES 옵션만으로는 occult hip fracture가 knee pain으로 보이는 경로를 포착하지 못함.
   - hip/groin pain 또는 knee만으로 설명되지 않는 weight-bearing difficulty 옵션 1개 추가.
   - positive 시 REVIEW + 기존 `fracture_imaging_consider` 재사용.

3. **fail-closed**
   - KNEE_03/KNEE_04에 `required: true`를 명시해 shown safety follow-up의 missing-answer 진행 경로를 차단.

## PASS 유지 항목

- K2 자연정복 무릎 탈구: KNEE_02A unconditional exposure, YES → URGENT_REVIEW
- K3/K4 extensor mechanism / true locked knee tier
- C2 KNEE_06B double-barreled 방지
- C1 `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY`
- question burden 최대 branch 18 허용

## 다음 단계

`KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md`만 최종 재검수한다.

최종 출력:

```text
PASS / CLINICAL DECISIONS CLOSED
```

또는

```text
CLINICAL DECISION REQUIRED
```
