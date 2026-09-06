/**
 * 요통 이외 부위의 `evaluateSafety` — 각 부위 안전 패널(`DoctorView.tsx`,
 * `HipSafetyPanel.tsx`, `AnkleFootSafetyPanel.tsx`, `TmjSafetyPanel.tsx`)이
 * 쓰는 **같은 재계산 경로**(`to<Region>StateFromDoctorPayload` →
 * `compute<Region>Flags`)를 그대로 부른다(RF-2: 태블릿 스냅샷을 치료 게이트로
 * 쓰지 않는다). 패널이 "계산 불가"로 보는 조건(모듈 객체 비어 있음, flags 손상)
 * 에서는 **fail closed** — `routineCareAllowed: false`. 패널이 안내문을 띄우는
 * 환자에게 운동 후보를 내지 않는다.
 *
 * `neuroStatus`: 요통 외 부위에는 원장이 입력하는 신경 소견 필드가 없다(어깨의
 * 회전근개 근력저하는 신경 소견이 아니다). 그래서 항상 'UNKNOWN' — DRAFT 팩의
 * 적격성 규칙이 `requiresStableNeuro: false`인 이유(`draftPack.ts` 헤더).
 * `treatmentSafetyLocked`: 목만 별도의 치료 안전 상태(`neck_treatment_safety_status`)
 * 가 있고, 나머지 부위는 질환 안전 잠금과 같다(치료 잠금 개념이 없다 → false).
 */
import type { DoctorPayload } from '../../types'
import type { RegionJudgmentInputs, RegionKey, RegionSafetyEvaluation } from '../regionPack'
import { toNeckStateFromDoctorPayload } from '../../../spec/neckAdapter'
import { computeNeckFlags, neckDiseaseSafetyLocked, neckTreatmentSafetyLocked } from '../../../spec/neckLogic'
import { toShoulderStateFromDoctorPayload } from '../../../spec/shoulderAdapter'
import { computeShoulderFlags, shoulderSafetyLocked } from '../../../spec/shoulderLogic'
import { toKneeStateFromDoctorPayload } from '../../../spec/kneeAdapter'
import { computeKneeFlags, kneeSafetyLocked } from '../../../spec/kneeLogic'
import { toHipStateFromDoctorPayload } from '../../../spec/hipAdapter'
import { computeHipFlags } from '../../../spec/hipLogic'
import { toAnkleFootStateFromDoctorPayload } from '../../../spec/ankleFootAdapter'
import { computeAnkleFootFlags } from '../../../spec/ankleFootLogic'
import { toElbowStateFromDoctorPayload } from '../../../spec/elbowAdapter'
import { computeElbowFlags, elbowSafetyLocked } from '../../../spec/elbowLogic'
import { toWristHandStateFromDoctorPayload } from '../../../spec/wristHandAdapter'
import { computeWristHandFlags, wristHandSafetyLocked } from '../../../spec/wristHandLogic'
import { toTmjStateFromDoctorPayload } from '../../../spec/tmjAdapter'
import { computeTmjFlags } from '../../../spec/tmjLogic'
import { ageFromDoctorPayload } from '../../../spec/lbpAdapter'

const NOT_APPLICABLE: RegionSafetyEvaluation = { applicable: false, routineCareAllowed: false, treatmentSafetyLocked: false, neuroStatus: 'UNKNOWN' }
const FAIL_CLOSED: RegionSafetyEvaluation = { applicable: true, routineCareAllowed: false, treatmentSafetyLocked: false, neuroStatus: 'UNKNOWN' }

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0
}

/** `payload.flags.general_red`를 그대로 신뢰하는 어댑터들 앞의 최소 가드 — 손상된 flags면 fail closed. */
function generalRedUsable(payload: DoctorPayload): boolean {
  const f = payload.flags as unknown
  return typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>).general_red === 'boolean'
}

function guard(payload: DoctorPayload, region: RegionKey, needsGeneralRed: boolean): RegionSafetyEvaluation | null {
  const flags = payload.responses?.safety_flags as Record<string, unknown> | undefined
  if (flags == null || flags[region] == null) return NOT_APPLICABLE
  const modules = payload.responses?.modules as Record<string, unknown> | undefined
  if (!isNonEmptyObject(modules?.[region])) return FAIL_CLOSED
  if (needsGeneralRed && !generalRedUsable(payload)) return FAIL_CLOSED
  return null
}

function evaluation(routineCareAllowed: boolean, treatmentSafetyLocked = false): RegionSafetyEvaluation {
  return { applicable: true, routineCareAllowed, treatmentSafetyLocked, neuroStatus: 'UNKNOWN' }
}

export function evaluateNeckSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'neck', false)
  if (g) return g
  try {
    const flags = computeNeckFlags(toNeckStateFromDoctorPayload(payload.responses))
    return evaluation(!neckDiseaseSafetyLocked(flags), neckTreatmentSafetyLocked(flags))
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateShoulderSafety(payload: DoctorPayload, judgment: RegionJudgmentInputs): RegionSafetyEvaluation {
  const g = guard(payload, 'shoulder', true)
  if (g) return g
  try {
    const flags = computeShoulderFlags(
      toShoulderStateFromDoctorPayload(payload.responses, payload.flags.general_red, judgment.shoulder_objective_cuff_weakness),
    )
    return evaluation(!shoulderSafetyLocked(flags))
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateKneeSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'knee', true)
  if (g) return g
  try {
    const flags = computeKneeFlags(toKneeStateFromDoctorPayload(payload.responses, payload.flags.general_red))
    return evaluation(!kneeSafetyLocked(flags))
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateHipSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'hip', true)
  if (g) return g
  try {
    const flags = computeHipFlags(toHipStateFromDoctorPayload(payload.responses, payload.flags.general_red))
    // `loading_exercise_lock`은 부하 운동 잠금이다 — 질환 안전이 CLEAR여도 이 잠금이
    // 켜져 있으면 운동 후보를 내지 않는다(팩이 부하/비부하를 구분하기 전까지 보수적으로).
    return evaluation(flags.hip_safety_status === 'CLEAR' && !flags.loading_exercise_lock)
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateAnkleFootSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'ankle_foot', true)
  if (g) return g
  try {
    const flags = computeAnkleFootFlags(toAnkleFootStateFromDoctorPayload(payload.responses, payload.flags.general_red))
    return evaluation(flags.ankle_foot_safety_status === 'CLEAR')
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateElbowSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'elbow', true)
  if (g) return g
  try {
    const flags = computeElbowFlags(toElbowStateFromDoctorPayload(payload.responses, payload.flags.general_red))
    return evaluation(!elbowSafetyLocked(flags))
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateWristHandSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'wrist_hand', true)
  if (g) return g
  try {
    const flags = computeWristHandFlags(toWristHandStateFromDoctorPayload(payload.responses, payload.flags.general_red))
    return evaluation(!wristHandSafetyLocked(flags))
  } catch {
    return FAIL_CLOSED
  }
}

export function evaluateTmjSafety(payload: DoctorPayload): RegionSafetyEvaluation {
  const g = guard(payload, 'tmj', true)
  if (g) return g
  try {
    const age = ageFromDoctorPayload(payload.responses)
    const flags = computeTmjFlags(toTmjStateFromDoctorPayload(payload.responses, payload.flags.general_red, age))
    return evaluation(flags.tmj_safety_status === 'CLEAR')
  } catch {
    return FAIL_CLOSED
  }
}
