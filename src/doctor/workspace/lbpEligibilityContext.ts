/**
 * LBP v1 Batch 2 (G8) — the Eligibility input adapter.
 *
 * Docs ref: `LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §2.2 ("Eligibility
 * 입력 adapter"), `LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md`
 * RF-2/RF-9/RF-12, `DECISIONS.md`'s 2026-09-02 "CD-1/CD-2 PO 결정" entry (CD-1).
 *
 * RF-2 (BLOCKER): `routineCareAllowed` MUST come from the RECOMPUTED safety
 * flags — the exact same path `DoctorView.tsx`'s `LbpSafetyPanel` uses
 * (`computeLbpFlags(toLbpStateFromDoctorPayload(responses,
 * lbpObjectiveMotorDeficit, age))`), never from `payload.responses.safety_flags.lbp`
 * (the tablet-submission-time snapshot, which `coreSpec.ts` computes with
 * `clinicianObjectiveMotorDeficit` FIXED to `undefined` — see
 * `coreSpec.ts`'s own comment: "Doctor View recomputes this fresh once a
 * clinician enters that field"). The snapshot is fine for Batch 1's exam
 * SUGGESTIONS (`lbpExamSuggestions.ts` reads it — Opus bounded validation
 * flagged this as an accepted, non-blocking simplification there because a
 * suggestion is never a treatment finalization). It is NOT fine here: this
 * adapter gates a treatment (exercise) recommendation, and reading the
 * snapshot would mean a clinician who has just recorded
 * `lbp_objective_motor_deficit === 'SEVERE_OR_PROGRESSIVE'` still sees
 * exercises marked eligible while lane 1's safety panel is already showing
 * URGENT_REVIEW — the exact defect RF-2 exists to prevent. Do not "fix" this
 * file to read the snapshot for convenience; that regresses a Batch-2-blocking
 * finding.
 */
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { computeLbpFlags } from '../../spec/lbpLogic'
import { toLbpStateFromDoctorPayload, ageFromDoctorPayload } from '../../spec/lbpAdapter'
import type {
  LbpExerciseEligibilityContext,
  LbpEligibilityDirectionalResponse,
} from './lbpExerciseEligibility'
import type { LbpDirectionalResponse } from './lbpExamSuggestions'
import type { WorkspaceState } from './persistence'

/*
 * 2026-09-05: `LBP_EXERCISE_CAPABILITY_IDS`와 `LBP_EXERCISE_CAPABILITY_LABEL_KO`
 * 를 제거했다. 준비조건 게이트가 사라지면서 이 두 상수의 소비자가 전부 없어졌다
 * — 이유는 `lbpExerciseEligibility.ts` 헤더 참고. 각 운동의 시작 조건은
 * `lbpExerciseCoreMetadata.ts`의 `startingCriteriaKo`(한국어 원문)가 유일한
 * 출처이고, 후보 카드에 그대로 표시된다.
 */

/**
 * RF-9(ii): Batch 1's 6-value `LbpDirectionalResponse` (records the
 * clinician's observed lumbar-movement response) maps onto Eligibility's
 * distinct 5-value `LbpEligibilityDirectionalResponse` EXACTLY as follows —
 * `DISTAL_WORSENING` is not a directional-gate value on its own; it only
 * ever feeds `distalSymptomResponse` (below). This mapping is intentionally
 * the only place the two types touch.
 */
function toEligibilityDirectionalResponse(v: LbpDirectionalResponse): LbpEligibilityDirectionalResponse {
  switch (v) {
    case 'FLEXION_FAVORABLE':
    case 'EXTENSION_FAVORABLE':
    case 'NO_CLEAR_DIRECTION':
    case 'UNCLEAR':
    case 'NOT_ASSESSED':
      return v
    case 'DISTAL_WORSENING':
      return 'UNCLEAR'
    default:
      return 'NOT_ASSESSED'
  }
}

/**
 * §2.2/G8: `DoctorPayload` + clinician judgment + workspace record ->
 * `LbpExerciseEligibilityContext`. Pure, synchronous, safe to call on every
 * render (architecture §2.3: derived results are never persisted, always
 * recomputed).
 */
export function buildLbpEligibilityContext(
  payload: DoctorPayload,
  lbpObjectiveMotorDeficit: ClinicianJudgment['lbp_objective_motor_deficit'],
  workspaceState: Pick<WorkspaceState, 'lbpDirectionalResponse'>,
): LbpExerciseEligibilityContext {
  const age = ageFromDoctorPayload(payload.responses)
  // RF-2: the recomputed path, NOT payload.responses.safety_flags.lbp — see
  // this file's header comment.
  const state = toLbpStateFromDoctorPayload(payload.responses, lbpObjectiveMotorDeficit, age)
  const flags = computeLbpFlags(state)
  const routineCareAllowed = flags.lbp_safety_status === 'CLEAR'
  const neuroStatus = neuroStatusFromLbpObjectiveMotorDeficit(lbpObjectiveMotorDeficit)
  return buildEligibilityContextFrom({ routineCareAllowed, neuroStatus }, workspaceState.lbpDirectionalResponse)
}

/** 원장의 객관적 하지 근력저하 소견 → 신경 상태 3값. 미입력(`undefined`)/`UNKNOWN`은 UNKNOWN — 안정으로 가정하지 않는다(RF-1). */
export function neuroStatusFromLbpObjectiveMotorDeficit(
  lbpObjectiveMotorDeficit: ClinicianJudgment['lbp_objective_motor_deficit'],
): LbpExerciseEligibilityContext['neuroStatus'] {
  return lbpObjectiveMotorDeficit === 'SEVERE_OR_PROGRESSIVE'
    ? 'NEW_OR_WORSENING'
    : lbpObjectiveMotorDeficit === 'NONE'
      ? 'STABLE'
      : 'UNKNOWN'
}

/**
 * 부위 팩 일반화(2026-09-06): 재계산된 안전 판정(부위 팩의 `evaluateSafety`)과
 * 원장이 기록한 방향성 반응에서 적격성 컨텍스트를 만든다. 요통은 위 래퍼가
 * 같은 값을 넘기고, 다른 부위는 그 부위의 안전 로직이 넘긴다. 방향성 반응이
 * 의미 없는 부위는 `'NOT_ASSESSED'`를 넘기면 원위 악화 = UNKNOWN, 방향 = 미시행이
 * 되어 방향 조건이 없는 규칙만 통과한다.
 */
export function buildEligibilityContextFrom(
  safety: { routineCareAllowed: boolean; neuroStatus: LbpExerciseEligibilityContext['neuroStatus'] },
  recordedDirectionalResponse: LbpDirectionalResponse,
): LbpExerciseEligibilityContext {
  const { routineCareAllowed, neuroStatus } = safety
  const workspaceState = { lbpDirectionalResponse: recordedDirectionalResponse }

  // RF-12: NOT_ASSESSED -> UNKNOWN, never STABLE_OR_IMPROVING — an
  // unrecorded response must never be read as a confirmed-stable one.
  //
  // Opus delta review defect 6: `UNCLEAR` (the clinician looked and the
  // movement response itself was ambiguous) must ALSO fold to UNKNOWN, not
  // STABLE_OR_IMPROVING — it is not a read on distal-symptom trend at all,
  // so treating it as "stable" would be inventing a reading that was never
  // made. `NO_CLEAR_DIRECTION` stays STABLE_OR_IMPROVING: that value means
  // no single lumbar direction was favorable, which is a real, completed
  // observation about DIRECTION and carries no distal-symptom-worsening
  // signal either way — a materially different thing from `UNCLEAR`
  // (the observation itself being unclear/incomplete).
  const distalSymptomResponse: LbpExerciseEligibilityContext['distalSymptomResponse'] =
    workspaceState.lbpDirectionalResponse === 'DISTAL_WORSENING'
      ? 'WORSENING'
      : workspaceState.lbpDirectionalResponse === 'NOT_ASSESSED' ||
          workspaceState.lbpDirectionalResponse === 'UNCLEAR'
        ? 'UNKNOWN'
        : 'STABLE_OR_IMPROVING'

  const directionalResponse = toEligibilityDirectionalResponse(workspaceState.lbpDirectionalResponse)

  // CD-1 (PO-approved option B) + CD-3 (PO-approved 3-state, `DECISIONS.md`
  // 2026-09-02 "CD-3 승인..."): a capability the clinician has not
  // explicitly tap-confirmed either way this record is UNKNOWN. 'YES' comes
  // from `lbpConfirmedCapabilities` (확인함), a genuine 'NO' now comes from
  // `lbpDeniedCapabilities` (지금은 안 됨) — the two lists are kept mutually
  // exclusive by the state-update handler (`DoctorWorkspace.tsx`'s
  // `onSetLbpCapabilityStatus`), never here. RF-9(i) still holds:
  // capabilities are never derived from directionalResponse.
  return { routineCareAllowed, neuroStatus, distalSymptomResponse, directionalResponse }
}
