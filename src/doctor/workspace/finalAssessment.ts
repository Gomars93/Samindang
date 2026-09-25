/**
 * Clinician-owned Final Assessment / Plan / Follow-up Targets (PR #24
 * Phase 7-8). Pure types + tiny helpers, no React.
 *
 * These are entirely separate from the existing ClinicianJudgment
 * (src/doctor/judgment.ts), which is the Myungri shadow-mode audit trail
 * (saju-only prediction vs revised-after-exam, debrief) plus the two
 * FROZEN-logic-linked objective exam fields
 * (lbp_objective_motor_deficit / shoulder_objective_cuff_weakness).
 * ClinicianJudgment is untouched by this PR and continues to drive
 * lbpLogic.ts/shoulderLogic.ts safety computation exactly as before.
 *
 * A system SUGGESTED item (PhysicalExamSuggestion, HerbalPatternCandidate)
 * must NEVER be auto-copied into these fields — every field here starts
 * empty and is filled only by explicit clinician typing/selection.
 */

export type PainFinalAssessment = {
  /** 최종 임상 판단(원장) — free text, starts empty. */
  finalWorkingAssessment: string
  /** 치료 초점. */
  treatmentFocus: string
  /** 시행/예정 처치. */
  interventionPerformedOrPlanned: string
  /** 즉시 재검 대상 (예: "숙일 때 통증 재현 여부"). */
  immediateRetestTarget: string
  recordedAt: string | null
}

export function emptyPainFinalAssessment(): PainFinalAssessment {
  return {
    finalWorkingAssessment: '',
    treatmentFocus: '',
    interventionPerformedOrPlanned: '',
    immediateRetestTarget: '',
    recordedAt: null,
  }
}

export function isPainFinalAssessmentRecorded(a: PainFinalAssessment): boolean {
  return a.recordedAt !== null
}

export type HerbalFinalAssessment = {
  /** 최종 변증·병기 — 원장 판단. Free text, starts empty. */
  finalPatternOrMechanism: string
  /** 치법(치료 원칙). */
  treatmentPrinciple: string
  /** 처방/계획 메모 — 자동 처방 생성 없음, 원장이 직접 기록. */
  prescriptionPlanNote: string
  /** 추적할 증상. */
  symptomsToTrack: string
  recordedAt: string | null
}

export function emptyHerbalFinalAssessment(): HerbalFinalAssessment {
  return {
    finalPatternOrMechanism: '',
    treatmentPrinciple: '',
    prescriptionPlanNote: '',
    symptomsToTrack: '',
    recordedAt: null,
  }
}

export function isHerbalFinalAssessmentRecorded(a: HerbalFinalAssessment): boolean {
  return a.recordedAt !== null
}

/**
 * Reassessment target the clinician nominates to track at next visit
 * (Phase 8). Max 3 per workspace. `baseline`/`postTreatmentValue` are both
 * optional free-text the clinician may record for THIS visit only — never
 * an auto-computed number, never an inferred improvement/worsening
 * judgment (see REPEAT_VISIT_AUTO_COMPARE_STATUS below for why no actual
 * prior-visit comparison happens here).
 */
export type FollowUpTarget = {
  id: string
  label: string
  baseline: string
  postTreatmentValue: string
}

export function followUpTarget(id: string, label: string): FollowUpTarget {
  return { id, label, baseline: '', postTreatmentValue: '' }
}

export const MAX_FOLLOW_UP_TARGETS = 3

/** Example option sets from the governing task — clinician picks, does not have to use these exact labels. */
export const PAIN_FOLLOW_UP_OPTIONS: FollowUpTarget[] = [
  followUpTarget('pain_intensity', '통증 강도'),
  followUpTarget('movement_function', '움직임·기능'),
  followUpTarget('symptom_reproduction', '증상 재현 여부'),
]

/**
 * 2026-09-06 (원장 지시 "재진시 추적항목만 체크 — NRS라던지", "자유입력을 최대한
 * 피하고"): 통증 강도의 기준값·직후값은 0~10 버튼(NRS)으로 입력한다.
 *
 * 저장 타입은 그대로 `string`이다 — 버튼은 그 문자열('7')을 만드는 구조화 입력일
 * 뿐이고(처치 chip과 같은 원칙, §14.2), EMR("기준 7")·이전 방문 표시("이전
 * baseline: 7")·이어받기 경로는 한 줄도 바뀌지 않는다. 이 문항 도입 전에 적힌
 * 자유값('7/10', '심함')은 `isNrsValue`가 false를 돌려주고, 화면은 그 값을 담은
 * 텍스트 칸을 버튼 위에 그대로 남긴다 — 절대 조용히 버리지 않는다.
 */
export const PAIN_NRS_TARGET_IDS: ReadonlySet<string> = new Set(['pain_intensity'])
export const NRS_VALUES: readonly string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
export function isNrsValue(v: string): boolean {
  return NRS_VALUES.includes(v)
}

/*
  2026-09-25 (PO 승인): 라벨이 방향을 말하게 바꿨다 -- `수면`/`소화`는 중립
  명사라 0~10 중 10이 좋은 쪽인지 나쁜 쪽인지 화면만 보고 알 수 없다.
  `수면 불편`/`속 불편`이면 NRS가 통증과 같은 한 방향(↓ 좋다)으로 읽힌다.

  id는 그대로 둔다. 바꾸면 이전 방문에서 이어받기·이전 방문 표시·EMR이
  전부 끊긴다(그쪽이 훨씬 비싸다). 이건 같은 축(이 환자의 수면 문제)에
  대한 라벨 정밀화이지 다른 것을 재는 것이 아니다 -- 다만 중립 명사에서
  방향이 있는 이름으로 좁아지는 것은 사실이라, 옛 자유값('잘 자요')이
  어떻게 처리되는지는 아래 `HERBAL_NRS_TARGET_IDS` 주석에 적었다.

  `대변`은 라벨도 NRS도 그대로다 -- 아래 주석 참고.
*/
export const HERBAL_FOLLOW_UP_OPTIONS: FollowUpTarget[] = [
  followUpTarget('sleep', '수면 불편'),
  followUpTarget('digestion', '속 불편'),
  followUpTarget('stool', '대변'),
  followUpTarget('fatigue', '피로'),
]

/**
 * 2026-09-25 (PO 승인): 한약 재평가 대상도 기준값·직후값을 0~10 버튼으로
 * 받는다 -- 통증의 `PAIN_NRS_TARGET_IDS`(2026-09-06 원장 지시 "재진시
 * 추적항목만 체크 -- NRS라던지", "자유입력을 최대한 피하고")와 **같은
 * 스위치**다. 이 집합에 id가 있으면 원장 화면(FollowUpTargetPicker)과
 * 환자 재진 링크(FollowUpScreen)가 둘 다 텍스트 칸 대신 버튼을 그린다.
 *
 * 새 문진 문항을 만들지 않았다. 이미 있는 스위치를 한약에도 켰을 뿐이고,
 * 그래서 문진 길이는 그대로다.
 *
 * 2026-09-25 검수 F5 정정: 이 집합이 닿는 화면은 **mixed 진료**와 **재진
 * 화면**(`RevisitWorkspace`)뿐이다. 한약 단독 진료에는 재평가 대상 picker
 * 자체가 없다 -- PR-A(2026-09-21, PO 승인)가 herbal 단독의 `다음` 레인을
 * 통째로 폐기했고, 그 picker가 그 안에 있었다. 처음 커밋 메시지는 "한약
 * 재평가 대상도 NRS로 받는다"라고만 적어 한약 단독까지 닿는 것처럼
 * 읽혔다. tests/doctor-workspace.spec.mjs의 F5 단언이 이 사실을 고정한다.
 *
 * `stool`(대변)은 **일부러 뺐다.** 대변은 강도가 아니라 횟수·양상이라
 * 0~10에 얹으면 "대변 7점"이 무슨 뜻인지 아무도 모른다. 자유 기록으로
 * 남긴다 -- 숫자가 필요해지면 그때 횟수 전용 형식을 따로 만든다.
 *
 * 옛 자유값 처리: 이 스위치 도입 전에 적힌 값('잘 자요', '보통')은
 * `isNrsValue`가 false를 돌려주고 화면이 그 값을 담은 텍스트 칸을 버튼
 * 위에 그대로 남긴다(통증과 같은 처리). 이어받기는 값을 나르지 않으므로
 * (`revisitCarryForward.ts`의 `trackingOnly`가 baseline/직후값을 ''로
 * 비운다) 옛 값이 새 방문의 **입력 칸**으로 둔갑하는 경로는 없다.
 *
 * 2026-09-25 검수 F4 정정: 위 문장이 처음에는 "둔갑하는 경로는 없다"로만
 * 끝났는데, **표시** 경로 하나를 놓쳤다 -- 「지난번 추적」 줄이 옛 방문의
 * 맨 숫자('7')와 오늘 값을 비교해 화살표를 붙일 수 있었고, 라벨이 중립
 * 명사에서 방향 있는 이름으로 좁아진 이 배치에서는 그 화살표가 **악화를
 * 호전으로** 보일 수 있었다. `longitudinal.ts`의 `trackedValueText`가
 * 이제 **라벨이 같을 때만** 비교한다(다르면 지난 값만 보여준다).
 *
 * 이 배치 이후 기록은 모두 새 라벨이라 다음 방문부터 비교가 자연히
 * 되살아난다.
 */
export const HERBAL_NRS_TARGET_IDS: ReadonlySet<string> = new Set(['sleep', 'digestion', 'fatigue'])

/**
 * This string means specifically "no automatic interpretation of the
 * comparison" (no computed %/개선/악화 judgment) — it does NOT mean "no
 * prior-visit data is ever shown." Round 3 Phase C adds a real, narrow,
 * patient_id-scoped prior-visit RAW value lookup (see
 * `src/doctor/workspace/longitudinal.ts`) that displays the previous
 * baseline/post-treatment value next to today's input field, purely as
 * read-only reference facts — never as a computed delta, percentage, or
 * "호전/악화" judgment. This constant still correctly describes why that
 * interpretation step itself is not implemented: no clinician-approved
 * improvement-threshold rule exists to interpret the numbers with.
 *
 * Copy note (round 3 QA fix): this text renders directly in the clinician
 * UI (FollowUpTargetPicker.tsx) — it must stay pure Korean, matching every
 * other on-screen hint here. Earlier it literally contained the English
 * internal-tracking phrase "OPERATIONAL INTEGRATION REQUIRED", which real
 * headless QA caught leaking into the rendered page.
 */
export const REPEAT_VISIT_AUTO_COMPARE_STATUS = '재진 자동 비교: 자동 판단 없음 — 이전 방문 기록은 아래에서 원장이 직접 확인'

/**
 * NextReassessmentPlan (round 3 Phase B, North Star "Structured
 * Reassessment"): the clinician explicitly decides how this patient's next
 * detailed re-evaluation should be scheduled/tracked. No default "2 weeks"
 * or any other clinical timing rule is invented here — `status` starts
 * `UNSET`, and the clinician must pick one of the other three states
 * (a literal date, a visit count, or a free-text note when neither a date
 * nor a count is practical to commit to yet).
 */
export type NextReassessmentPlanStatus = 'UNSET' | 'DATE' | 'VISIT_COUNT' | 'CLINICIAN_DECIDES'

export type NextReassessmentPlan = {
  status: NextReassessmentPlanStatus
  /** ISO date string (yyyy-mm-dd), meaningful only when status === 'DATE'. */
  targetDate: string
  /** Meaningful only when status === 'VISIT_COUNT'. */
  afterVisitCount: number | null
  note: string
}

export function emptyNextReassessmentPlan(): NextReassessmentPlan {
  return { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' }
}

export const NEXT_REASSESSMENT_PLAN_STATUS_LABEL: Record<NextReassessmentPlanStatus, string> = {
  UNSET: '미정',
  DATE: '날짜 지정',
  VISIT_COUNT: '방문 횟수 지정',
  CLINICIAN_DECIDES: '원장 판단(추후 결정)',
}
