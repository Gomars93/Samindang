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
  LbpExerciseCapability,
  LbpExerciseEligibilityContext,
  LbpEligibilityDirectionalResponse,
} from './lbpExerciseEligibility'
import type { LbpDirectionalResponse } from './lbpExamSuggestions'
import type { WorkspaceState } from './persistence'
import { inferredCapabilitiesForStage } from './lbpCapabilityLayer'

/** Every capability the Core-20 eligibility rules reference — used to build a complete (never partial) capabilities map and to render the CD-1 confirmation chip list. */
export const LBP_EXERCISE_CAPABILITY_IDS: readonly LbpExerciseCapability[] = [
  'SAFE_WALKING',
  'CAN_SELF_PACE',
  'QUADRUPED_TOLERATED',
  'SUPINE_TOLERATED',
  'PRONE_TOLERATED',
  'SUPPORTED_STANDING_TOLERATED',
  'SITTING_TOLERATED',
  'LOW_LOAD_TRUNK_CONTROL',
  'HIP_HINGE_CONTROL',
  'LOAD_READY',
  'BALANCE_WITH_SUPPORT',
  'FLEXION_EXPOSURE_TOLERATED',
  'EXTENSION_EXPOSURE_TOLERATED',
  'NEURAL_SLIDER_TOLERATED',
  'NATURAL_BREATHING_TOLERATED',
]

/**
 * RF-6 addendum (Opus §5-1): posture-tolerance labels explicitly include
 * "getting down into and back up from" the posture, not just holding it —
 * the fall/transfer risk gap Opus flagged for this patient population.
 * RF-5 addendum: BALANCE_WITH_SUPPORT's label is the clinician-facing proxy
 * for "fall risk / orthostatic symptoms have not been left unassessed".
 */
export const LBP_EXERCISE_CAPABILITY_LABEL_KO: Record<LbpExerciseCapability, string> = {
  SAFE_WALKING: '보조도구 포함, 안전하게 걸을 수 있음',
  CAN_SELF_PACE: '필요하면 스스로 멈추거나 속도를 조절할 수 있음',
  QUADRUPED_TOLERATED: '네발기기 자세 유지 가능 (내려가고 다시 일어나기 포함)',
  SUPINE_TOLERATED: '바로 누운 자세 유지 가능 (눕고 다시 일어나기 포함)',
  PRONE_TOLERATED: '엎드린 자세 유지 가능 (엎드리고 다시 일어나기 포함)',
  SUPPORTED_STANDING_TOLERATED: '지지물을 잡고 안정적으로 설 수 있음',
  SITTING_TOLERATED: '짧은 앉기가 가능함',
  LOW_LOAD_TRUNK_CONTROL: '저강도 몸통 조절이 가능함',
  HIP_HINGE_CONTROL: '무부하 고관절 힌지 동작을 통제된 형태로 수행 가능',
  LOAD_READY: '증상 irritability가 고부하 연습을 허용하고 안전 관련 제한이 해소됨',
  BALANCE_WITH_SUPPORT: '지지물을 잡고 균형 유지 가능 (낙상 위험 별도 평가 없음)',
  FLEXION_EXPOSURE_TOLERATED: '숙이기 방향 노출을 낮은 범위에서 시도할 수 있음',
  EXTENSION_EXPOSURE_TOLERATED: '신전 방향 노출을 낮은 범위에서 시도할 수 있음',
  NEURAL_SLIDER_TOLERATED: '신경을 강하게 당기지 않는 부드러운 왕복 움직임이 가능함',
  NATURAL_BREATHING_TOLERATED: '편안한 자연호흡을 유지할 수 있음',
}

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
  workspaceState: Pick<
    WorkspaceState,
    'lbpDirectionalResponse' | 'lbpConfirmedCapabilities' | 'lbpDeniedCapabilities'
  > &
    Partial<Pick<WorkspaceState, 'lbpConfirmedStage'>>,
): LbpExerciseEligibilityContext {
  const age = ageFromDoctorPayload(payload.responses)
  // RF-2: the recomputed path, NOT payload.responses.safety_flags.lbp — see
  // this file's header comment.
  const state = toLbpStateFromDoctorPayload(payload.responses, lbpObjectiveMotorDeficit, age)
  const flags = computeLbpFlags(state)
  const routineCareAllowed = flags.lbp_safety_status === 'CLEAR'

  const neuroStatus: LbpExerciseEligibilityContext['neuroStatus'] =
    lbpObjectiveMotorDeficit === 'SEVERE_OR_PROGRESSIVE'
      ? 'NEW_OR_WORSENING'
      : lbpObjectiveMotorDeficit === 'NONE'
        ? 'STABLE'
        : 'UNKNOWN'

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
  //
  // 2026-09-05 (원장 결정, `lbpCapabilityLayer.ts` 헤더): C층 준비조건은
  // 원장이 확정한 단계에서 추정한다. 우선순위 — 원장이 직접 누른 값이 항상
  // 추정을 이긴다:
  //   확인함(YES) > 지금은 안 됨(NO) > 단계 추정(YES) > UNKNOWN
  // A층(안전 3개)은 `inferredCapabilitiesForStage`가 절대 돌려주지 않으므로
  // 여기서 따로 거를 것이 없다. 확정 단계가 null/0이면 추정 목록이 비어
  // 기존 동작(전부 UNKNOWN)과 같다 — 옛 기록은 이 경로로 들어온다.
  const confirmed = new Set(workspaceState.lbpConfirmedCapabilities)
  const denied = new Set(workspaceState.lbpDeniedCapabilities)
  const inferred = new Set(inferredCapabilitiesForStage(workspaceState.lbpConfirmedStage ?? null))
  const capabilities: LbpExerciseEligibilityContext['capabilities'] = {}
  for (const cap of LBP_EXERCISE_CAPABILITY_IDS) {
    capabilities[cap] = confirmed.has(cap) ? 'YES' : denied.has(cap) ? 'NO' : inferred.has(cap) ? 'YES' : 'UNKNOWN'
  }

  return { routineCareAllowed, neuroStatus, distalSymptomResponse, directionalResponse, capabilities }
}

/**
 * 화면용: 지금 이 기록에서 **추정으로만** YES인 준비조건(원장이 확인도 부인도
 * 하지 않았고, 확정 단계가 그 조건의 최소 단계 이상). 원장이 "안 되면 끄는"
 * 대상 목록이다 — `PainWorkspace.tsx`가 3상태 버튼과 함께 띄운다.
 * `buildLbpEligibilityContext`와 정확히 같은 우선순위를 쓴다.
 */
export function lbpInferredCapabilities(
  workspaceState: Pick<WorkspaceState, 'lbpConfirmedCapabilities' | 'lbpDeniedCapabilities'> &
    Partial<Pick<WorkspaceState, 'lbpConfirmedStage'>>,
): LbpExerciseCapability[] {
  const confirmed = new Set(workspaceState.lbpConfirmedCapabilities)
  const denied = new Set(workspaceState.lbpDeniedCapabilities)
  return inferredCapabilitiesForStage(workspaceState.lbpConfirmedStage ?? null).filter(
    (cap) => !confirmed.has(cap) && !denied.has(cap),
  )
}
