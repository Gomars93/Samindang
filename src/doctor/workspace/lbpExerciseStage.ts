/**
 * LBP 운동 단계(TBC 3단계) 제안 — 순수 로직.
 *
 * 목적: 원장이 "이 환자에게 몇 단계 운동을 줄까"를 정할 때, 이미 수집된
 * 문진 답변을 근거 문장과 함께 한 곳에 모아 **제안**한다.
 *
 * 이 파일이 하지 않는 것 (아키텍처 제약, 어기지 말 것):
 *
 * 1. **확정하지 않는다.** 출력은 `suggestedStage` + `reasons`뿐이고,
 *    단계 확정은 언제나 원장의 명시적 조작이다 — `rehabSuggestion.ts`의
 *    "adopt, never automatic" 패턴과 동일하다.
 * 2. **이전 방문과 자동 비교하지 않는다.** `finalAssessment.ts`의
 *    `REPEAT_VISIT_AUTO_COMPARE_STATUS`가 선언한 원칙 그대로다. 재평가
 *    대상의 `baseline`/`postTreatmentValue`는 자유 텍스트이고, 여기서
 *    파싱하거나 델타를 계산하지 않는다. 재진에서도 이 함수는 **오늘의
 *    답변만** 본다.
 * 3. **점수를 만들지 않는다.** 가중합·임계값·랭킹이 없다. 규칙은 아래
 *    base 매핑 1개 + cap 2개가 전부이고, 그 밖의 필드는 근거 문장으로만
 *    표시된다(`kind: 'CONTEXT'`).
 * 4. **진단명을 쓰지 않는다.**
 *
 * 근거와 미확정 사항은 `docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.3.md`에
 * 있다. TBC(Alrwaily 2016) 원문에는 어떤 척도의 몇 점이 몇 단계라는
 * 수치 기준이 없다 — 아래 매핑은 **삼인당의 정책값**이며 원장 승인
 * 대상이다. 논문에서 온 것처럼 다루지 말 것.
 */

/** TBC 3단계. 1=증상 조절, 2=움직임 조절, 3=기능 최적화. */
export type LbpExerciseStage = 1 | 2 | 3

export const LBP_EXERCISE_STAGE_LABEL_KO: Record<LbpExerciseStage, string> = {
  1: '1단계 · 증상 조절',
  2: '2단계 · 움직임 조절',
  3: '3단계 · 기능 최적화',
}

/**
 * 근거 문장의 종류.
 * - `BASE`      : 기본 단계를 정한 답변
 * - `CAP`       : 기본 단계를 낮춘 답변
 * - `CONTEXT`   : 단계를 바꾸지 않고 참고로만 보여주는 답변
 * - `INSUFFICIENT`: 제안을 낼 수 없는 이유
 */
export type LbpStageReasonKind = 'BASE' | 'CAP' | 'CONTEXT' | 'INSUFFICIENT'

export type LbpStageReason = {
  kind: LbpStageReasonKind
  /** 화면에 그대로 띄우는 한국어 한 줄. 환자 개인정보를 담지 않는다. */
  text: string
}

/**
 * 입력. 전부 `unknown`으로 받는다 — 서버에 저장된 옛 기록/손상된 기록이
 * 선언된 타입과 다를 수 있고(이 저장소에서 여러 번 실제로 발생했다),
 * 여기서 그것 때문에 크래시가 나면 원장 화면 전체가 죽는다.
 *
 * 각 값의 출처:
 * - `chiefImpact`         : `payload.responses.visit_goal.chief_impact`   (VISIT_04)
 * - `chiefDuration`       : `payload.responses.visit_goal.chief_duration` (VISIT_03)
 * - `fearAvoidance`       : `payload.responses.safety_flags.lbp.fear_avoidance`      (LBP_13)
 * - `recoveryExpectation` : `payload.responses.safety_flags.lbp.recovery_expectation`(LBP_12)
 * - `workImpact`          : `payload.responses.safety_flags.lbp.work_impact`         (LBP_14)
 */
export type LbpStageInput = {
  chiefImpact?: unknown
  chiefDuration?: unknown
  fearAvoidance?: unknown
  recoveryExpectation?: unknown
  workImpact?: unknown
}

export type LbpStageSuggestion = {
  /** cap까지 적용한 최종 제안. 판단 불가면 null. */
  suggestedStage: LbpExerciseStage | null
  /** cap 적용 전, VISIT_04만으로 정한 단계. cap이 실제로 작동했는지 화면에서 보이게 하려고 함께 낸다. */
  baseStage: LbpExerciseStage | null
  reasons: LbpStageReason[]
  /** 항상 true. 이 값은 제안이며 원장 확정 없이 환자에게 나가지 않는다. */
  clinicianMustConfirm: true
}

// ---------------------------------------------------------------------------
// 정책값 (원장 승인 대상 — 논문 근거 아님)
// ---------------------------------------------------------------------------

/**
 * VISIT_04(일상생활 지장도) → 기본 단계.
 *
 * TBC 원문의 단계 정의를 역매핑한 것이다:
 *   Stage I  "pain severely limits movement"   → severe
 *   Stage II "moderate pain and disability"    → moderate
 *   Stage III"low pain and disability"         → mild / minimal
 * 원문에 "VISIT_04가 severe면 1단계"라고 적혀 있는 것은 아니다.
 */
export const BASE_STAGE_BY_CHIEF_IMPACT: Record<string, LbpExerciseStage> = {
  severe: 1,
  moderate: 2,
  mild: 3,
  minimal: 3,
}

export const CHIEF_IMPACT_LABEL_KO: Record<string, string> = {
  severe: '일상생활이 어려울 정도',
  moderate: '많이 불편함',
  mild: '조금 불편함',
  minimal: '거의 지장 없음',
}

/**
 * 발병 1주 이내일 때 허용하는 최대 단계.
 *
 * TBC Stage I은 "recent onset **or recurrence**"에 더해 증상이 두드러질
 * 것을 함께 요구한다. 그래서 "1주 이내"만으로 1단계까지 내리지 않는다 —
 * 그렇게 하면 급성 초진 환자 전원이 VISIT_04와 무관하게 1단계가 되어
 * 일상지장도 축 자체가 무의미해진다. 대신 급성기에 3단계(부하·기능
 * 최적화)로 바로 가는 것만 막는다.
 */
export const ACUTE_ONSET_MAX_STAGE: LbpExerciseStage = 2

/**
 * 공포회피가 뚜렷할 때(LBP_13='YES') 허용하는 최대 단계.
 * 회피가 남아 있는 상태에서 기능 최적화 단계로 올리는 것은 이르다고 보되,
 * 1단계까지 내릴 근거는 없다.
 */
export const HIGH_FEAR_AVOIDANCE_MAX_STAGE: LbpExerciseStage = 2

export const ACUTE_ONSET_DURATIONS: ReadonlySet<string> = new Set(['within_1w'])

// ---------------------------------------------------------------------------

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** 0~10 정수만 통과. 그 밖(문자열 '7', 11, NaN, null)은 전부 null. */
function asRecoveryScore(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  if (!Number.isInteger(v)) return null
  if (v < 0 || v > 10) return null
  return v
}

function lower(a: LbpExerciseStage, b: LbpExerciseStage): LbpExerciseStage {
  return (a < b ? a : b) as LbpExerciseStage
}

/**
 * 오늘의 문진 답변으로 운동 단계를 제안한다.
 *
 * VISIT_04가 없거나 알 수 없는 값이면 제안을 내지 않는다(`null`) — 이
 * 축이 유일한 기본 단계 근거이므로, 없는데 아무 단계나 찍는 것보다
 * "원장이 정해야 한다"고 말하는 편이 정직하다.
 */
export function suggestLbpExerciseStage(input: LbpStageInput): LbpStageSuggestion {
  const reasons: LbpStageReason[] = []

  const chiefImpact = asString(input.chiefImpact)
  const baseStage = chiefImpact != null ? (BASE_STAGE_BY_CHIEF_IMPACT[chiefImpact] ?? null) : null

  if (chiefImpact == null || baseStage == null) {
    reasons.push({
      kind: 'INSUFFICIENT',
      text: '일상생활 지장도(문진) 답변이 없어 단계를 제안하지 않습니다 — 원장이 직접 정해주세요.',
    })
    appendContextReasons(input, reasons)
    return { suggestedStage: null, baseStage: null, reasons, clinicianMustConfirm: true }
  }

  reasons.push({
    kind: 'BASE',
    text: `일상생활 지장도 "${CHIEF_IMPACT_LABEL_KO[chiefImpact] ?? chiefImpact}" → 기본 ${LBP_EXERCISE_STAGE_LABEL_KO[baseStage]}`,
  })

  let stage = baseStage

  const duration = asString(input.chiefDuration)
  if (duration != null && ACUTE_ONSET_DURATIONS.has(duration) && baseStage > ACUTE_ONSET_MAX_STAGE) {
    stage = lower(stage, ACUTE_ONSET_MAX_STAGE)
    reasons.push({
      kind: 'CAP',
      text: `발병 1주 이내 → ${LBP_EXERCISE_STAGE_LABEL_KO[ACUTE_ONSET_MAX_STAGE]}까지로 제한`,
    })
  }

  const fear = asString(input.fearAvoidance)
  if (fear === 'YES' && baseStage > HIGH_FEAR_AVOIDANCE_MAX_STAGE) {
    stage = lower(stage, HIGH_FEAR_AVOIDANCE_MAX_STAGE)
    reasons.push({
      kind: 'CAP',
      text: `움직임에 대한 두려움이 큼 → ${LBP_EXERCISE_STAGE_LABEL_KO[HIGH_FEAR_AVOIDANCE_MAX_STAGE]}까지로 제한`,
    })
  }

  appendContextReasons(input, reasons)

  return { suggestedStage: stage, baseStage, reasons, clinicianMustConfirm: true }
}

/**
 * 단계를 바꾸지 않는 참고 문장. 이 값들로 단계를 움직일 근거가 원문에
 * 없으므로 표시만 한다 — 원장이 보고 스스로 판단한다.
 */
function appendContextReasons(input: LbpStageInput, reasons: LbpStageReason[]): void {
  const fear = asString(input.fearAvoidance)
  if (fear === 'SOMEWHAT') {
    reasons.push({ kind: 'CONTEXT', text: '움직임에 대한 두려움이 조금 있음 (참고 — 단계는 바꾸지 않음)' })
  }

  const recovery = asRecoveryScore(input.recoveryExpectation)
  if (recovery != null) {
    reasons.push({ kind: 'CONTEXT', text: `회복 기대 ${recovery}/10 (참고 — 단계는 바꾸지 않음)` })
  }

  const work = asString(input.workImpact)
  if (work === 'MAJOR') {
    reasons.push({ kind: 'CONTEXT', text: '일·집안일 지장이 큼 (참고 — 단계는 바꾸지 않음)' })
  } else if (work === 'SOME') {
    reasons.push({ kind: 'CONTEXT', text: '일·집안일에 일부 지장 (참고 — 단계는 바꾸지 않음)' })
  }
}

/**
 * DoctorPayload에서 입력 5개를 뽑아낸다. payload 모양이 어긋나도 던지지
 * 않고, 못 읽은 필드는 `undefined`로 남긴다.
 */
export function lbpStageInputFromPayload(payload: unknown): LbpStageInput {
  const p = (payload ?? {}) as Record<string, unknown>
  const responses = (p.responses ?? {}) as Record<string, unknown>
  const visitGoal = (responses.visit_goal ?? {}) as Record<string, unknown>
  const safetyFlags = (responses.safety_flags ?? {}) as Record<string, unknown>
  const lbp = (safetyFlags.lbp ?? {}) as Record<string, unknown>

  return {
    chiefImpact: visitGoal.chief_impact,
    chiefDuration: visitGoal.chief_duration,
    fearAvoidance: lbp.fear_avoidance,
    recoveryExpectation: lbp.recovery_expectation,
    workImpact: lbp.work_impact,
  }
}
