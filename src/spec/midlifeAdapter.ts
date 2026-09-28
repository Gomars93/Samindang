/**
 * Midlife v0.1 어댑터 — 태블릿 응답(Responses) 또는 저장된 DoctorPayload를
 * `midlifeLogic.ts`의 `MidlifeState`로 바꾼다. 판정은 하지 않는다.
 *
 * 저장값은 검증 없는 JSON에서 온다. 허용 값 집합 밖의 값·배열 아닌 값은
 * 조용히 버리지 않고 `malformed`로 표시한다 — 모르는 값을 "해당 없음"으로
 * 읽으면 fail-open이 된다.
 */
import type { AnswerValue, Responses } from '../types'
import type { DoctorPayload } from '../doctor/types'
import type { MidlifePregnancyStatus, MidlifeState } from './midlifeLogic'

const CYCLE_VALUES = new Set(['regular', 'slightly_changed', 'very_irregular', 'amenorrhea_12m_plus', 'not_assessable'])
const URGENT_VALUES = new Set(['heavy_bleeding_faint', 'self_harm_plan', 'none'])
const PRIORITY_VALUES = new Set([
  'postmenopausal_bleeding',
  'abnormal_bleeding',
  'postcoital_bleeding',
  'bloating_pelvic',
  'weight_loss_fever',
  'palpitation_persistent',
  'none',
])
const WOMEN_SAFETY_VALUES = new Set([
  'none',
  'pregnant',
  'pregnancy_possible',
  'postpartum_1y',
  'breastfeeding',
  'menopause',
  'unknown',
])

type Read<T> = { value: T; malformed: boolean }

function readSingle(raw: unknown, allowed: Set<string>): Read<string | null> {
  if (raw === null || raw === undefined) return { value: null, malformed: false }
  if (typeof raw === 'string' && allowed.has(raw)) return { value: raw, malformed: false }
  return { value: null, malformed: true }
}

function readMulti(raw: unknown, allowed: Set<string>): Read<string[] | null> {
  if (raw === null || raw === undefined) return { value: null, malformed: false }
  if (!Array.isArray(raw) || raw.length === 0) return { value: null, malformed: true }
  if (!raw.every((v) => typeof v === 'string' && allowed.has(v))) return { value: null, malformed: true }
  return { value: raw as string[], malformed: false }
}

function readGeneralRed(raw: unknown): Read<boolean> {
  // SAFETY_01은 모든 환자에게 항상 나오는 필수 문항이다 -- 없거나 배열이 아니면 손상.
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((v) => typeof v === 'string')) {
    return { value: false, malformed: true }
  }
  return { value: raw.some((v) => v !== 'none'), malformed: false }
}

function readPregnancy(raw: unknown): Read<MidlifePregnancyStatus | null> {
  const r = readMulti(raw, WOMEN_SAFETY_VALUES)
  if (r.value === null) return { value: null, malformed: r.malformed }
  if (r.value.includes('pregnant') || r.value.includes('pregnancy_possible')) return { value: 'yes', malformed: false }
  if (r.value.includes('unknown')) return { value: 'unknown', malformed: false }
  return { value: 'no', malformed: false }
}

function build(
  safety01: unknown,
  cycle: unknown,
  urgent: unknown,
  priority: unknown,
  womenSafety: unknown,
  requireGeneral: boolean,
): MidlifeState {
  const g = requireGeneral ? readGeneralRed(safety01) : safety01 == null ? { value: false, malformed: false } : readGeneralRed(safety01)
  const c = readSingle(cycle, CYCLE_VALUES)
  const u = readMulti(urgent, URGENT_VALUES)
  const p = readMulti(priority, PRIORITY_VALUES)
  const w = readPregnancy(womenSafety)
  return {
    generalRed: g.value,
    cycleChange: c.value,
    urgentItems: u.value,
    priorityItems: p.value,
    pregnancy: w.value,
    malformed: g.malformed || c.malformed || u.malformed || p.malformed || w.malformed,
  }
}

/**
 * 태블릿 진행 중(직원 확인 트리거) 사용. 아직 답하지 않은 문항은 null이며
 * 그 자체는 형식 오류가 아니다 — SAFETY_01도 진행 중이면 비어 있을 수 있다.
 */
export function toMidlifeState(r: Responses): MidlifeState {
  const v = (id: string): AnswerValue | undefined => r[id]
  return build(v('SAFETY_01'), v('MID_01'), v('MID_08'), v('MID_09'), v('WOMEN_SAFETY_01'), false)
}

/** 원장 화면 사용. 제출 완료된 기록이므로 SAFETY_01이 비어 있으면 손상으로 본다. */
export function toMidlifeStateFromDoctorPayload(r: DoctorPayload['responses']): MidlifeState {
  const m = (r as { modules?: { midlife?: Record<string, unknown> } }).modules?.midlife
  const isObj = typeof m === 'object' && m !== null && !Array.isArray(m)
  const state = build(
    r.safety_flags?.red_flag_general,
    isObj ? m.cycle_change : undefined,
    isObj ? m.urgent_screen : undefined,
    isObj ? m.priority_screen : undefined,
    r.reproductive_status?.reproductive_status,
    true,
  )
  return isObj ? state : { ...state, malformed: true }
}
