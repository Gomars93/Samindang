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
  workspaceState: Pick<WorkspaceState, 'lbpDirectionalResponse' | 'lbpConfirmedCapabilities'>,
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
  const distalSymptomResponse: LbpExerciseEligibilityContext['distalSymptomResponse'] =
    workspaceState.lbpDirectionalResponse === 'DISTAL_WORSENING'
      ? 'WORSENING'
      : workspaceState.lbpDirectionalResponse === 'NOT_ASSESSED'
        ? 'UNKNOWN'
        : 'STABLE_OR_IMPROVING'

  const directionalResponse = toEligibilityDirectionalResponse(workspaceState.lbpDirectionalResponse)

  // CD-1 (PO-approved option B): a capability the clinician has not
  // explicitly tap-confirmed this record is UNKNOWN, never inferred 'NO' —
  // there is no negative-confirmation UI in v1 (RF-9(i): capabilities are
  // never derived from directionalResponse either; confirmation is the only
  // path to 'YES').
  const confirmed = new Set(workspaceState.lbpConfirmedCapabilities)
  const capabilities: LbpExerciseEligibilityContext['capabilities'] = {}
  for (const cap of LBP_EXERCISE_CAPABILITY_IDS) {
    capabilities[cap] = confirmed.has(cap) ? 'YES' : 'UNKNOWN'
  }

  return { routineCareAllowed, neuroStatus, distalSymptomResponse, directionalResponse, capabilities }
}
