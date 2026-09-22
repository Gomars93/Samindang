/**
 * 통증 닥터뷰 브리핑 — payload에서 화면 행을 만드는 **순수 함수**.
 *
 * 설계 의도
 * ---------
 * Figma `01 · Pain Doctor View`는 4블록(FUNCTION / LOAD·BEHAVIOR / NEURO /
 * RECOVERY·CONTEXT) × 한 가지 행 문법(`라벨 ──── 값`)으로만 이루어져 있다.
 * 깔끔함의 출처가 디자인이 아니라 **구조**이므로, 그 구조를 여기서 만든다.
 * 렌더 컴포넌트는 이 함수가 만든 배열을 그리기만 한다 — 화면에서 값을
 * 계산하지 않는다.
 *
 * 임상 경계 (CLAUDE.md)
 * ---------------------
 * 이 파일은 **임상 판단을 하지 않는다.**
 *  - 새 임상 규칙을 만들지 않는다. 안전 플래그를 읽지도, 바꾸지도 않는다.
 *    (안전은 기존 레인1 패널이 그대로 담당한다.)
 *  - `tone`은 **읽기 보조용 색**일 뿐 중증도 판정이 아니다. 각 행이 자기
 *    enum→tone 표를 명시적으로 들고 있어서 원장이 한 줄씩 감수할 수 있다.
 *  - 값은 `optionLabel()`로만 한글화한다 — 환자가 실제로 본 문구 그대로이고,
 *    이 파일이 라벨을 지어내지 않는다.
 *
 * 미수집 행을 왜 남기나
 * ---------------------
 * Figma 14행 중 지금 문진이 채울 수 있는 것은 일부뿐이다. 못 채우는 행을
 * 조용히 빼면 "이 화면은 완성됐다"는 착각이 생기고, 나중에 문항을 추가할 때
 * 어디에 넣어야 하는지가 사라진다. 그래서 `status: 'not_collected'`로
 * **자리를 남기고 이유를 붙인다.** 화면에서는 흐리게 표시되고,
 * `includeNotCollected: false`로 끌 수 있다.
 */
import { optionLabel, optionLabels } from '../labels'
import type { DoctorPayload } from '../types'

/** 값의 읽기 보조 색. 중증도 판정이 아니다(파일 헤더 참고). */
export type RowTone = 'good' | 'neutral' | 'warn'

export type RowStatus =
  /** 환자가 답했고 값이 있다. */
  | 'answered'
  /** 문진에 문항은 있으나 이 환자는 답하지 않았다(또는 해당 없음). */
  | 'unanswered'
  /** 문진이 아직 묻지 않는 항목이다. `note`에 이유를 적는다. */
  | 'not_collected'

export type BriefingRow = {
  /** 행 라벨. 원장이 훑는 단어라 짧게 고정한다. */
  label: string
  /** 표시값. `null`이면 값 자리에 상태 표기가 들어간다. */
  value: string | null
  tone: RowTone
  status: RowStatus
  /**
   * 이 값이 어디서 왔는지. 화면에는 안 나오지만 테스트가 이걸로
   * "필드 × 화면" 도달을 검증한다(CLAUDE.md의 경로 교체 규칙).
   */
  source: string
  /** `not_collected`일 때의 이유. */
  note?: string
}

export type BriefingBlockKey = 'function' | 'load' | 'neuro' | 'recovery'

export type BriefingBlock = {
  key: BriefingBlockKey
  /** Figma의 대문자 eyebrow. */
  eyebrow: string
  /** eyebrow 아래 한 줄 — 이 블록이 답하는 **질문**이다. */
  question: string
  rows: BriefingRow[]
}

export type BriefingOptions = {
  /** 아직 문진이 묻지 않는 행을 자리만 남겨 보여줄지. 기본 true. */
  includeNotCollected?: boolean
}

/* ------------------------------------------------------------------ *
 * tone 표
 *
 * 각 표는 "이 답이 화면에서 어떤 색으로 읽히는가"만 정한다. 표에 없는
 * 값은 neutral이다 — 모르는 값을 warn으로 칠해 겁주지 않는다.
 * ------------------------------------------------------------------ */

const TONE_IMPACT: Record<string, RowTone> = {
  minimal: 'good',
  mild: 'neutral',
  moderate: 'warn',
  severe: 'warn',
}

const TONE_WORK_IMPACT: Record<string, RowTone> = {
  NONE: 'good',
  SOME: 'neutral',
  MAJOR: 'warn',
}

const TONE_YES_IS_WARN: Record<string, RowTone> = {
  NO: 'good',
  YES: 'warn',
}

const TONE_YES_IS_GOOD: Record<string, RowTone> = {
  NO: 'neutral',
  YES: 'good',
}

const TONE_FEAR: Record<string, RowTone> = {
  NO: 'good',
  SOMEWHAT: 'neutral',
  YES: 'warn',
}

const TONE_DISTAL: Record<string, RowTone> = {
  BACK_ONLY: 'good',
  BUTTOCK: 'neutral',
  THIGH: 'neutral',
  BELOW_KNEE: 'warn',
  FOOT: 'warn',
}

const TONE_RADIATION: Record<string, RowTone> = {
  none: 'good',
  upper_limb: 'warn',
  lower_limb: 'warn',
  other: 'neutral',
}

/** 이 값들은 "증상 없음"을 뜻하므로 good으로 읽는다. */
const NEGATIVE_VALUES = new Set(['NONE', 'none', 'NO'])

/* ------------------------------------------------------------------ *
 * 행 생성 헬퍼
 * ------------------------------------------------------------------ */

type RawValue = string | number | readonly string[] | null | undefined

const isEmpty = (v: RawValue): boolean =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

/** 단일 선택 행. `qid`로 라벨을 스펙에서 되찾아온다. */
function choiceRow(
  label: string,
  qid: string,
  raw: RawValue,
  toneMap: Record<string, RowTone>,
  source: string,
): BriefingRow {
  if (isEmpty(raw)) {
    return { label, value: null, tone: 'neutral', status: 'unanswered', source }
  }
  const key = String(raw)
  return {
    label,
    value: optionLabel(qid, key),
    tone: toneMap[key] ?? (NEGATIVE_VALUES.has(key) ? 'good' : 'neutral'),
    status: 'answered',
    source,
  }
}

/**
 * 다중 선택 행. "없음"만 골랐으면 good, 그 밖에 뭔가 골랐으면 warn으로
 * 읽되, `neutralWhenPresent`면 값이 있어도 중립으로 둔다(증상 양상처럼
 * 많고 적음이 곧 나쁨이 아닌 항목).
 */
function multiRow(
  label: string,
  qid: string,
  raw: RawValue,
  source: string,
  opts: { neutralWhenPresent?: boolean } = {},
): BriefingRow {
  if (isEmpty(raw)) {
    return { label, value: null, tone: 'neutral', status: 'unanswered', source }
  }
  const values = (Array.isArray(raw) ? raw : [String(raw)]).map(String)
  const onlyNegative = values.every((v) => NEGATIVE_VALUES.has(v))
  return {
    label,
    value: optionLabels(qid, values).join(' · '),
    tone: onlyNegative ? 'good' : opts.neutralWhenPresent ? 'neutral' : 'warn',
    status: 'answered',
    source,
  }
}

/**
 * 아직 문진이 묻지 않는 항목들을 **한 줄로 접는다.**
 *
 * 처음에는 항목마다 한 행씩 남겼는데, 컨택트 시트로 실제 픽스처를 렌더해
 * 보니 FUNCTION 블록이 "아직 안 물어봄" 4줄로 절반이 차서 블록이 고장 난
 * 것처럼 보였다. 정보가 아니라 로드맵인 행들이 실제 값보다 자리를 더
 * 많이 차지하면 안 된다. 자리는 남기되 한 줄로 줄인다.
 */
function pendingRow(labels: string[], note: string): BriefingRow {
  return {
    label: '아직 안 묻는 항목',
    value: labels.join(' · '),
    tone: 'neutral',
    status: 'not_collected',
    source: '—',
    note,
  }
}

/* ------------------------------------------------------------------ *
 * 본체
 * ------------------------------------------------------------------ */

const PENDING_ACTIVITY =
  '활동별 수행능력 문항(PAIN_F 매트릭스) 미도입 — 도입 전까지 빈칸으로 둔다'
const PENDING_LOAD = '활동별 부하 반응 문항 미도입'
const PENDING_NIGHT = '야간 통증·수면 방해 문항이 문진에 없음(LBP_04/05는 red flag 전용)'

export function buildPainBriefing(
  payload: DoctorPayload,
  options: BriefingOptions = {},
): BriefingBlock[] {
  const includePending = options.includeNotCollected !== false
  const r = payload.responses
  const visit = r.visit_goal
  const pain = r.modules?.pain

  /*
   * 부위 게이트.
   *
   * `modules.lbp`는 허리 환자가 아니어도 **전 필드가 null인 객체로 항상
   * 존재한다** -- 그래서 `modules.lbp ?? null`로는 걸러지지 않는다. 처음
   * 구현이 그렇게 돼 있었고, 컨택트 시트에서 목 통증 환자 화면에 `내려가는
   * 범위 / 다리 신경 증상 / 증상 쪽`이 전부 "미응답"으로 뜨는 걸 보고 잡았다.
   * 판정 기준은 객체의 존재가 아니라 **환자가 고른 부위**다.
   */
  const region = pain?.primary_location ?? null
  const mods = r.modules
  const lbp = region === 'low_back_pelvis' ? mods?.lbp ?? null : null

  const keep = (rows: BriefingRow[]): BriefingRow[] =>
    includePending ? rows : rows.filter((row) => row.status !== 'not_collected')

  const fn: BriefingRow[] = [
    choiceRow(
      '일상 지장',
      'VISIT_04_SYMPTOM_IMPACT',
      visit?.chief_impact,
      TONE_IMPACT,
      'visit_goal.chief_impact',
    ),
  ]
  if (lbp) {
    fn.push(
      choiceRow('일·집안일', 'LBP_14', lbp.work_impact, TONE_WORK_IMPACT, 'modules.lbp.work_impact'),
    )
  }
  fn.push(pendingRow(['앉아 있기', '앉았다 일어나기', '숙이기', '걷기'], PENDING_ACTIVITY))

  const load: BriefingRow[] = [
    multiRow('통증 양상', 'PAIN_02', pain?.pain_qualities, 'modules.pain.pain_qualities', {
      neutralWhenPresent: true,
    }),
  ]
  if (lbp) {
    load.push(
      choiceRow(
        '서기·걷기로 악화',
        'LBP_08',
        lbp.claudication_walking,
        TONE_YES_IS_WARN,
        'modules.lbp.claudication_walking',
      ),
      choiceRow(
        '앉기·숙이기로 완화',
        'LBP_09',
        lbp.claudication_relief,
        TONE_YES_IS_GOOD,
        'modules.lbp.claudication_relief',
      ),
    )
  }
  /*
   * 허리 외 부위.
   *
   * 실측: 기능·부하·회복 문항을 실제로 가진 부위는 허리(7개)뿐이고, 목 1개 /
   * 팔꿈치·손목 2개 / 어깨·무릎·턱·고관절은 **0개**다(나머지는 전부 안전 문항).
   * 그래서 여기서 붙일 수 있는 것만 붙이고, 없는 부위는 억지로 채우지 않는다 --
   * 빈 화면이 나오는 것이 "이 부위는 아직 안 묻는다"는 사실 그 자체다.
   */
  if (region === 'neck_shoulder') {
    load.push(
      choiceRow(
        '오래 같은 자세',
        'NECK_12',
        mods?.neck?.sustained_posture_aggravation,
        TONE_YES_IS_WARN,
        'modules.neck.sustained_posture_aggravation',
      ),
    )
  }
  if (region === 'arm_hand') {
    const elbow = mods?.elbow?.load_activity_pattern
    const wrist = mods?.wrist_hand?.load_activity_pattern
    if (!isEmpty(elbow)) {
      load.push(multiRow('악화 동작(팔꿈치)', 'ELBOW_14', elbow, 'modules.elbow.load_activity_pattern'))
    }
    if (!isEmpty(wrist)) {
      load.push(multiRow('악화 동작(손목·손)', 'WH_10', wrist, 'modules.wrist_hand.load_activity_pattern'))
    }
  }

  load.push(pendingRow(['앉았다 일어날 때', '활동별 부하 반응'], PENDING_LOAD))

  const neuro: BriefingRow[] = [
    choiceRow('방사', 'PAIN_04', pain?.radiation, TONE_RADIATION, 'modules.pain.radiation'),
  ]
  if (lbp) {
    neuro.push(
      choiceRow(
        '내려가는 범위',
        'LBP_01',
        lbp.distal_extent,
        TONE_DISTAL,
        'modules.lbp.distal_extent',
      ),
      multiRow(
        '다리 신경 증상',
        'LBP_02',
        lbp.leg_neuro_symptoms,
        'modules.lbp.leg_neuro_symptoms',
      ),
      choiceRow('증상 쪽', 'LBP_03', lbp.leg_side, {}, 'modules.lbp.leg_side'),
    )
  }

  const recovery: BriefingRow[] = [
    choiceRow(
      '기간',
      'VISIT_03_SYMPTOM_DURATION',
      visit?.chief_duration,
      {},
      'visit_goal.chief_duration',
    ),
  ]
  if (lbp) {
    recovery.push(
      choiceRow('재발', 'LBP_07', lbp.recurrence, {}, 'modules.lbp.recurrence'),
      choiceRow(
        '움직임 회피',
        'LBP_13',
        lbp.fear_avoidance,
        TONE_FEAR,
        'modules.lbp.fear_avoidance',
      ),
      recoveryExpectationRow(lbp.recovery_expectation),
    )
  }
  recovery.push(pendingRow(['야간 수면 방해'], PENDING_NIGHT))

  return [
    { key: 'function', eyebrow: 'FUNCTION', question: '무엇을 하기 어려운가?', rows: keep(fn) },
    {
      key: 'load',
      eyebrow: 'LOAD / BEHAVIOR',
      question: '어떤 조건에 반응하는가?',
      rows: keep(load),
    },
    { key: 'neuro', eyebrow: 'NEURO', question: '신경학적 증상', rows: keep(neuro) },
    {
      key: 'recovery',
      eyebrow: 'RECOVERY / CONTEXT',
      question: '회복을 바꾸는 요인',
      rows: keep(recovery),
    },
  ]
}

/**
 * 회복 기대(LBP_12)는 0~10 숫자라 optionLabel이 라벨을 못 찾는다.
 * 숫자를 그대로 보여주되 척도를 함께 적어 원장이 방향을 헷갈리지 않게 한다.
 * 0=전혀 기대 못 함, 10=완전히 좋아질 것 — 문항 원문 그대로다.
 */
function recoveryExpectationRow(raw: RawValue): BriefingRow {
  const source = 'modules.lbp.recovery_expectation'
  if (isEmpty(raw)) {
    return { label: '회복 기대', value: null, tone: 'neutral', status: 'unanswered', source }
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    return { label: '회복 기대', value: null, tone: 'neutral', status: 'unanswered', source }
  }
  return {
    label: '회복 기대',
    value: `${n} / 10`,
    tone: n <= 3 ? 'warn' : n >= 7 ? 'good' : 'neutral',
    status: 'answered',
    source,
  }
}

/** 한 화면에 들어가는 블록 수 상한. 넘으면 테스트가 실패한다(화면이 다시 길어지는 것을 막는 유일한 장치). */
export const MAX_BRIEFING_BLOCKS = 4
