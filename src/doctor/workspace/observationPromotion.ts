/**
 * 2층 항목의 승격 제안 (PR-B1, PO 승인 2026-09-21).
 *
 * ## 왜 있는가
 * PO의 고민은 "다 넣자니 너무 많은데, 그렇다고 빼자니 아쉽다"였다. 그 고민의
 * 정체는 **지금 시점에 뭘 쓸지 모른다**는 것이므로, 결정을 지금 내리지 않고
 * 실사용 데이터가 대신 내리게 한다: 1층 23칸은 고정하고, `＋ 전체`에서
 * 꺼내 쓴 횟수가 임계에 닿으면 "첫 줄에 올릴까요?"를 한 번 묻는다.
 *
 * ## 승격 장치가 없는 2층은 쓰레기통이다
 * 접어둔 서랍은 현실적으로 다시 안 열린다. 2층 → 1층으로 올라오는 경로가
 * 실제로 작동하기 때문에만 "아쉬우니 2층에 넣어두자"가 자기기만이 아니게
 * 된다. 둘은 세트이고, 승격을 빼려면 2층도 함께 빼는 것이 맞다.
 *
 * ## 자동 재배치는 하지 않는다 (이 파일의 가장 중요한 제약)
 * 체크박스 입력 속도를 결정하는 것은 항목 개수가 아니라 **위치의 예측
 * 가능성**이다. 20칸이어도 자리가 고정이면 눈으로 안 보고 누르지만, 8칸이어도
 * 매번 순서가 바뀌면 매번 읽어야 해서 더 느리다. 그래서
 *  - 임계에 닿아도 **자리는 움직이지 않는다.** 제안 배너만 뜬다.
 *  - 원장이 수락해야 비로소 올라가고,
 *  - 올라간 항목은 1층 **맨 뒤에** 붙는다. 기존 23칸의 자리는 영구히 고정.
 *
 * ## 저장 위치
 * `localStorage` — 원장 1인 PC 전용 도구이고, 이 값은 임상 기록이 아니라
 * 화면 개인화 설정이다. 환자 데이터 경로(.data/·서버)에 절대 넣지 않는다.
 * 사생활 보호 모드·저장소 차단에서 접근 자체가 throw할 수 있으므로 모든
 * 읽기·쓰기를 try/catch로 감싸고, 실패하면 "승격 기능만 조용히 없는" 상태로
 * 동작한다 -- 체크리스트 본체는 저장소 없이도 완전히 작동해야 한다.
 */

export const PROMOTION_THRESHOLD = 3

export type PromotionState = {
  /** 2층 항목을 `＋ 전체`에서 켠 누적 횟수. */
  counts: Record<string, number>
  /** 원장이 수락해 1층 맨 뒤로 올린 라벨들 (수락 순서 유지). */
  promoted: string[]
  /** 원장이 "괜찮음"으로 거절한 라벨들 — 다시 묻지 않는다. */
  declined: string[]
}

export function emptyPromotionState(): PromotionState {
  return { counts: {}, promoted: [], declined: [] }
}

/** 2층 항목을 켤 때 1 증가. 끄는 것은 세지 않는다(켰다 껐다로 임계를 채울 수 없게). */
export function recordTier2Use(state: PromotionState, label: string): PromotionState {
  return { ...state, counts: { ...state.counts, [label]: (state.counts[label] ?? 0) + 1 } }
}

/**
 * 지금 물어볼 후보 하나. 없으면 null.
 * 이미 올렸거나 거절한 항목은 다시 묻지 않는다. 여러 개가 임계를 넘으면
 * 가장 많이 쓴 것 하나만 — 배너를 쌓지 않는다.
 */
export function promotionCandidate(state: PromotionState): string | null {
  const eligible = Object.entries(state.counts)
    .filter(([label, n]) => n >= PROMOTION_THRESHOLD && !state.promoted.includes(label) && !state.declined.includes(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return eligible.length > 0 ? eligible[0][0] : null
}

export function acceptPromotion(state: PromotionState, label: string): PromotionState {
  if (state.promoted.includes(label)) return state
  return { ...state, promoted: [...state.promoted, label] }
}

export function declinePromotion(state: PromotionState, label: string): PromotionState {
  if (state.declined.includes(label)) return state
  return { ...state, declined: [...state.declined, label] }
}

const STORAGE_KEY = 'samindang.observationPromotion.v1'

/**
 * 저장된 상태를 읽는다. **어떤 이유로든 실패하면 빈 상태**를 돌려준다 --
 * 손상된 JSON, 차단된 저장소, 타입이 바뀐 옛 값 모두 같은 처리다. 이 값은
 * 임상 기록이 아니라 화면 설정이므로, 복구 시도보다 조용한 초기화가 맞다.
 */
export function loadPromotionState(storage?: Pick<Storage, 'getItem' | 'setItem'>): PromotionState {
  try {
    const s = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    if (!s) return emptyPromotionState()
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return emptyPromotionState()
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return emptyPromotionState()
    const o = parsed as Partial<PromotionState>
    const counts: Record<string, number> = {}
    if (o.counts != null && typeof o.counts === 'object') {
      for (const [k, v] of Object.entries(o.counts)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) counts[k] = Math.floor(v)
      }
    }
    return {
      counts,
      promoted: Array.isArray(o.promoted) ? o.promoted.filter((x): x is string => typeof x === 'string') : [],
      declined: Array.isArray(o.declined) ? o.declined.filter((x): x is string => typeof x === 'string') : [],
    }
  } catch {
    return emptyPromotionState()
  }
}

/** 저장 실패는 조용히 무시한다 -- 승격은 편의 기능이고, 실패가 진료를 막으면 안 된다. */
export function savePromotionState(
  state: PromotionState,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): void {
  try {
    const s = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    if (!s) return
    s.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 무시 */
  }
}
