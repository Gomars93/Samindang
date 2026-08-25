# WRIST_HAND_V1 — Tablet Question Set v0.1.1

작성일: 2026-08-25
상태: **FINAL CANDIDATE / OPUS FINAL VERIFICATION REQUIRED**
대상: 삼인당 Clinical OS — MSK Wrist/Hand module

기준 문서:
- `docs/WRIST_HAND_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.1.md`
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.2.md`

> **Versioning rule:** v0.1.1은 `WRIST_HAND_V1_Tablet_Question_Set_v0.1.md`의 모든 문항, routing, safety tier, hypothesis, flag, Sigma/chart boundary, reassessment contract를 그대로 상속한다. 아래 §1의 단일 문서 정합성 수정 외에는 어떤 임상 threshold·문항·분기·flag 조건도 변경하지 않는다. 구현 시 v0.1 본문과 이 v0.1.1 delta를 함께 읽되, 충돌 시 v0.1.1이 우선한다.

---

# 1. v0.1.1 단일 수정 — Opus v0.2 FINDING closure

Opus v0.2가 지적한 문서 내부 drift는 `§6 infection_assessment_required`의 WH_07A 조건에서 `empty`가 누락된 한 곳뿐이다.

## v0.1 기존 표기

```text
infection_assessment_required = true when:
- WH_06 contains HUMAN_OR_ANIMAL_BITE
- OR WH_07 in [LOCALIZED_STABLE, FINGER_LOCALIZED_SWOLLEN_PAINFUL, SYSTEMIC_OR_RAPIDLY_SPREADING, UNKNOWN]
- OR WH_07 is missing/malformed protected response
- OR WH_07A concrete positive/UNKNOWN/missing/malformed when shown
```

## v0.1.1 정정 표기 — authoritative

```text
infection_assessment_required = true when:
- WH_06 contains HUMAN_OR_ANIMAL_BITE
- OR WH_07 in [LOCALIZED_STABLE, FINGER_LOCALIZED_SWOLLEN_PAINFUL, SYSTEMIC_OR_RAPIDLY_SPREADING, UNKNOWN]
- OR WH_07 is missing/malformed protected response
- OR WH_07A concrete positive/UNKNOWN/missing/malformed/empty when shown
```

즉, `WH_07A`가 노출된 상태에서 empty multi-select이면:

```text
wrist_hand_safety_status = REVIEW_REQUIRED
infection_assessment_required = true
```

`empty`를 negative/NONE으로 해석하지 않는다.

---

# 2. 변경 금지 확인

이 v0.1.1은 아래 항목을 **변경하지 않는다**.

- W1 routing boundary: `FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN` 노출, `ELBOW`만 제외
- `ELBOW_00`은 routing/tagging 전용이며 safety tier 직접 생성 금지
- WH_02 uncontrolled bleeding / severe deep open wound standalone `URGENT_REVIEW`
- WH_04 trauma + radial/thumb-base pain → `REVIEW_REQUIRED + fracture_imaging_consider`
- WH_04A prior X-ray → non-gating context only
- WH_06 human/animal bite 단독 → `REVIEW_REQUIRED + infection_assessment_required`
- WH_06A active flex/ext loss → `REVIEW_REQUIRED + expedited_referral_consider + tendon_injury_assessment_required`
- WH_07 `SYSTEMIC_OR_RAPIDLY_SPREADING`의 OR semantics
- WH_07A concrete positive 단독 `URGENT_REVIEW + infection_assessment_required`
- Kanavel sign 점수화 금지
- stable sensory-only + WH_08A `[NONE]` → phenotype only, safety escalation 금지
- sensory-positive + WH_08A concrete/UNKNOWN/missing/malformed/empty → `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`
- ordinary trigger/catching → phenotype only
- post-traumatic fixed block → REVIEW이지만 blanket expedited 금지
- 별도 wrist/hand cardiac screen 추가 금지; Core global chest/breathing safety passthrough 유지
- protected UNKNOWN/missing/malformed/empty/invalid → CLEAR 금지
- optional phenotype missing은 safety escalation 금지
- patient response만으로 `O | 객관적 소견`/확진 생성 금지
- LBP/NECK/SHOULDER/KNEE/ELBOW CLOSED/FROZEN threshold 변경 금지

---

# 3. Final verification gate

Opus final verification은 **새 임상 쟁점을 열지 않고** 아래 한 가지만 확인한다.

```text
WH_07A shown + empty
→ REVIEW_REQUIRED
→ infection_assessment_required = true
```

그리고 v0.1.1이 v0.1의 다른 임상결정을 변경하지 않았는지만 확인한다.

최종 판정은 반드시 둘 중 하나:

```text
PASS / CLINICAL DECISIONS CLOSED
```

또는

```text
CLINICAL DECISION REQUIRED
```

PASS 전까지 Fable 통합 / TypeScript / UI / tests 구현은 금지한다.
