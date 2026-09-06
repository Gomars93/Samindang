/**
 * LBP 운동 단계(0단계 + TBC 3단계) 제안 — 순수 로직.
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
 *    base 매핑 1개 + 격하 2개 + 상한 1개가 전부이고, 그 밖의 필드는 근거
 *    문장으로만 표시된다(`kind: 'CONTEXT'`).
 * 4. **진단명을 쓰지 않는다.**
 *
 * ---------------------------------------------------------------------------
 * 왜 "상한(CAP)"이 아니라 "격하(DEMOTION)" 모델인가 — 2026-09-05 원장 지시
 * ---------------------------------------------------------------------------
 * v0.3까지는 급성기를 "최대 2단계까지"라는 상한으로 눌렀다. 원장 지적:
 *
 *   "급성 요통 심한 케이스 2단계도 힘든지 바로 1단계지. 1단계도 힘들 수 있어.
 *    근육 락킹으로 신경계를 보호하려고 하잖아. 누워있는 게 치료라고."
 *   "재발 간격이 3개월이면 조심해야지, 1단계씩 격하시켜야지."
 *
 * 두 지시 모두 **"한 단계 낮춘다"**는 같은 연산이다. 그래서 상한 모델을
 * 격하 모델로 바꿨다. 결과가 달라지는 지점:
 *
 *   | 일상지장도 | 발병 1주 이내 | v0.3(상한) | v0.4(격하) |
 *   |-----------|-------------|-----------|-----------|
 *   | severe    | 예           | 1단계      | **0단계**  |
 *   | moderate  | 예           | 2단계      | **1단계**  |
 *   | mild      | 예           | 2단계      | 2단계      |
 *   | minimal   | 예           | 2단계      | 2단계      |
 *
 * 격하 모델을 쓰면 "severe + 급성 → 0단계"가 별도 규칙 없이 산술로 나온다.
 * 원장이 머릿속으로 결과를 예측할 수 있다는 것이 이 모델의 실제 이점이다.
 *
 * ---------------------------------------------------------------------------
 * 0단계는 왜 생겼나
 * ---------------------------------------------------------------------------
 * TBC(Alrwaily 2016)의 최저 단계인 Stage I은 "pain severely limits movement"
 * 상태를 가리키지만, 그 상태에서 **능동 운동을 시작한다**는 뜻은 아니다.
 * v0.3은 TBC 3단계를 그대로 가져오면서 그 아래를 비워둬, 급성 protective
 * muscle guarding 환자에게도 반드시 1단계 운동 9개가 배정됐다 — 설계 실수였다.
 *
 * 0단계는 "오늘은 능동 운동을 처방하지 않는다"는 **명시적 선택지**다.
 * 아무것도 안 하는 것이 아니라, 자세·호흡·통증 없는 범위의 자발 움직임을
 * 안내하고 다음 진료에서 다시 평가한다(`LBP_STAGE_0_GUIDANCE_KO`).
 *
 * 화면 배선 시 요구사항: 0단계 제안 옆에 **"1단계로 올리기"를 한 번의
 * 조작으로** 둘 것. 안전한 쪽이 기본값이고 올리는 것이 의식적 행위여야 한다.
 *
 * 근거와 미확정 사항은 `docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.3.md`에 있다.
 * TBC 원문에는 어떤 척도의 몇 점이 몇 단계라는 수치 기준이 없다 — 아래
 * 매핑은 **삼인당의 정책값**이며 원장 승인 대상이다. 논문에서 온 것처럼
 * 다루지 말 것.
 */

/** 0=보호·안정(운동 처방 없음), 1=증상 조절, 2=움직임 조절, 3=기능 최적화. */
export type LbpExerciseStage = 0 | 1 | 2 | 3

export const LBP_EXERCISE_STAGE_LABEL_KO: Record<LbpExerciseStage, string> = {
  0: '0단계 · 보호/안정',
  1: '1단계 · 증상 조절',
  2: '2단계 · 움직임 조절',
  3: '3단계 · 기능 최적화',
}

/**
 * 0단계일 때 화면에 띄우는 안내. "운동을 안 준다"가 아니라 "무엇을 하는가"를
 * 적는다 — 원장이 환자에게 그대로 말할 수 있는 문장이어야 한다.
 */
export const LBP_STAGE_0_GUIDANCE_KO =
  '오늘은 능동 운동을 처방하지 않습니다. 통증이 없는 자세(눕기·무릎 세우고 눕기)와 편안한 호흡, 통증 없는 범위의 자발적 움직임만 안내하고 다음 진료에서 다시 평가합니다.'

/**
 * 근거 문장의 종류.
 * - `BASE`      : 기본 단계를 정한 답변
 * - `DEMOTION`  : 단계를 한 칸 낮춘 답변 (누적됨)
 * - `CAP`       : 단계의 상한을 씌운 답변 (누적되지 않음)
 * - `CONTEXT`   : 단계를 바꾸지 않고 참고로만 보여주는 답변
 * - `INSUFFICIENT`: 제안을 낼 수 없는 이유
 */
export type LbpStageReasonKind = 'BASE' | 'DEMOTION' | 'CAP' | 'CONTEXT' | 'INSUFFICIENT'

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
 * - `chiefImpact`        : `payload.responses.visit_goal.chief_impact`   (VISIT_04)
 * - `chiefDuration`      : `payload.responses.visit_goal.chief_duration` (VISIT_03)
 * - `recurrenceInterval` : `payload.responses.safety_flags.lbp.recurrence_interval` (LBP_07B)
 * - `fearAvoidance`      : `payload.responses.safety_flags.lbp.fear_avoidance`      (LBP_13)
 * - `recoveryExpectation`: `payload.responses.safety_flags.lbp.recovery_expectation`(LBP_12)
 * - `workImpact`         : `payload.responses.safety_flags.lbp.work_impact`         (LBP_14)
 */
export type LbpStageInput = {
  chiefImpact?: unknown
  chiefDuration?: unknown
  recurrenceInterval?: unknown
  fearAvoidance?: unknown
  recoveryExpectation?: unknown
  workImpact?: unknown
}

export type LbpStageSuggestion = {
  /** 격하·상한까지 적용한 최종 제안. 판단 불가면 null. */
  suggestedStage: LbpExerciseStage | null
  /** 격하 적용 전, VISIT_04만으로 정한 단계. 격하가 실제로 작동했는지 화면에서 보이게 하려고 함께 낸다. */
  baseStage: LbpExerciseStage | null
  reasons: LbpStageReason[]
  /** 0단계일 때만 채워진다. 화면은 이 문장을 강조해서 띄운다. */
  guidance: string | null
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
 *
 * 기본 단계는 0이 될 수 없다 — 0단계는 격하로만 도달한다. "일상생활이
 * 어렵다"는 답 하나만으로 운동을 끊지는 않는다는 뜻이다.
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

/** 격하 사유 1: 발병한 지 얼마 안 됨 (VISIT_03). */
export const ACUTE_ONSET_DURATIONS: ReadonlySet<string> = new Set(['within_1w'])

/**
 * 격하 사유 2: 최근 재발 (LBP_07B).
 *
 * 원장 지시: "재발 간격이 3개월이면 조심해야지". `'3m_1y'`/`'over_1y'`는
 * 격하하지 않는다 — 재발 사실 자체가 아니라 **간격이 짧은 것**이 격하 사유다.
 * `'unknown'`과 미응답도 격하하지 않는다(없는 재발을 지어내지 않는다).
 */
export const RECENT_RECURRENCE_INTERVALS: ReadonlySet<string> = new Set(['within_3m'])

/**
 * 상한: 공포회피가 뚜렷할 때(LBP_13='YES') 허용하는 최대 단계.
 *
 * 이것만 격하가 아니라 상한으로 남아 있는 이유: 원장이 격하로 지시한 것은
 * 급성·재발 두 가지이고, 공포회피는 v0.3에서 상한으로 승인된 항목이다.
 * 승인 범위를 임의로 넓히지 않는다. 회피가 남아 있는 상태에서 기능 최적화
 * 단계로 올리는 것은 이르다고 보되, 그 자체로 단계를 깎지는 않는다.
 */
export const HIGH_FEAR_AVOIDANCE_MAX_STAGE: LbpExerciseStage = 2

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

/** 한 칸 낮춘다. 0 아래로는 내려가지 않는다. */
function demote(s: LbpExerciseStage): LbpExerciseStage {
  return (s > 0 ? s - 1 : 0) as LbpExerciseStage
}

/**
 * 오늘의 문진 답변으로 운동 단계를 제안한다.
 *
 * 적용 순서: 기본 매핑 → 격하(누적) → 상한. 상한은 최댓값을 씌우는
 * 연산이라 격하와 순서를 바꿔도 결과가 같지만, 근거 문장이 원장이 읽는
 * 순서대로 쌓이도록 이 순서를 고정한다.
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
    return { suggestedStage: null, baseStage: null, reasons, guidance: null, clinicianMustConfirm: true }
  }

  reasons.push({
    kind: 'BASE',
    text: `일상생활 지장도 "${CHIEF_IMPACT_LABEL_KO[chiefImpact] ?? chiefImpact}" → 기본 ${LBP_EXERCISE_STAGE_LABEL_KO[baseStage]}`,
  })

  let stage = baseStage

  const duration = asString(input.chiefDuration)
  if (duration != null && ACUTE_ONSET_DURATIONS.has(duration)) {
    stage = demote(stage)
    reasons.push({
      kind: 'DEMOTION',
      text: `발병 1주 이내 → 한 단계 낮춤 (${LBP_EXERCISE_STAGE_LABEL_KO[stage]})`,
    })
  }

  const interval = asString(input.recurrenceInterval)
  if (interval != null && RECENT_RECURRENCE_INTERVALS.has(interval)) {
    stage = demote(stage)
    reasons.push({
      kind: 'DEMOTION',
      text: `3개월 이내 재발 → 한 단계 낮춤 (${LBP_EXERCISE_STAGE_LABEL_KO[stage]})`,
    })
  }

  const fear = asString(input.fearAvoidance)
  if (fear === 'YES' && stage > HIGH_FEAR_AVOIDANCE_MAX_STAGE) {
    stage = HIGH_FEAR_AVOIDANCE_MAX_STAGE
    reasons.push({
      kind: 'CAP',
      text: `움직임에 대한 두려움이 큼 → ${LBP_EXERCISE_STAGE_LABEL_KO[HIGH_FEAR_AVOIDANCE_MAX_STAGE]}까지로 제한`,
    })
  }

  appendContextReasons(input, reasons)

  return {
    suggestedStage: stage,
    baseStage,
    reasons,
    guidance: stage === 0 ? LBP_STAGE_0_GUIDANCE_KO : null,
    clinicianMustConfirm: true,
  }
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
 * DoctorPayload에서 입력 6개를 뽑아낸다. payload 모양이 어긋나도 던지지
 * 않고, 못 읽은 필드는 `undefined`로 남긴다.
 *
 * 부위 팩 일반화(2026-09-06): 공통 문항 2개(VISIT_04/VISIT_03)는 `visit_goal`
 * 에서, 부위별 격하·참고 입력 4개는 `safety_flags[region]`에서 읽는다. 다른
 * 부위의 안전 플래그에는 그 4개 필드가 없으므로 `undefined`가 되어 격하·상한·
 * 참고 문장이 자연히 발동하지 않는다 — 규칙을 부위별로 끄는 스위치가 따로
 * 필요 없다(없는 답으로 단계를 움직이지 않는다는 원칙 그대로).
 */
export function stageInputFromPayload(region: string, payload: unknown): LbpStageInput {
  const p = (payload ?? {}) as Record<string, unknown>
  const responses = (p.responses ?? {}) as Record<string, unknown>
  const visitGoal = (responses.visit_goal ?? {}) as Record<string, unknown>
  const safetyFlags = (responses.safety_flags ?? {}) as Record<string, unknown>
  const regional = (safetyFlags[region] ?? {}) as Record<string, unknown>

  return {
    chiefImpact: visitGoal.chief_impact,
    chiefDuration: visitGoal.chief_duration,
    recurrenceInterval: regional.recurrence_interval,
    fearAvoidance: regional.fear_avoidance,
    recoveryExpectation: regional.recovery_expectation,
    workImpact: regional.work_impact,
  }
}

export function lbpStageInputFromPayload(payload: unknown): LbpStageInput {
  return stageInputFromPayload('lbp', payload)
}

// ---------------------------------------------------------------------------
// 부위 무관 별칭 (2026-09-06 부위 팩 일반화). 단계 엔진 자체는 처음부터 부위
// 입력을 받지 않았다 — 위 `LbpStageInput`의 6개 값은 전부 문진 답변이고 부위
// 이름은 어디에도 들어가지 않는다. 그래서 요통 이름을 뗀 별칭만 두고 본체는
// 그대로 쓴다. 요통 테스트(`tests/lbp-exercise-stage.spec.mjs`)가 옛 이름을
// 계속 쓰므로 옛 export는 지우지 않는다.
// ---------------------------------------------------------------------------

export type ExerciseStage = LbpExerciseStage
export type StageInput = LbpStageInput
export type StageSuggestion = LbpStageSuggestion
export type StageReason = LbpStageReason
export const EXERCISE_STAGE_LABEL_KO = LBP_EXERCISE_STAGE_LABEL_KO
export const STAGE_0_GUIDANCE_KO = LBP_STAGE_0_GUIDANCE_KO
export const suggestExerciseStage: (input: StageInput) => StageSuggestion = suggestLbpExerciseStage
