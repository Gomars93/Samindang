/**
 * Core Reduction P2 — V3 셸 좌측 요약 (Phase 5 Synthesis v1.2 §2.1, Phase 7
 * UI spec §2.3/§3.2/§6.1). Fixed-height, non-scrolling 5-block stack:
 * ①신원 ②주호소·기간 ③지난 대비 ④레인1 안전 결론 요약 ⑤저장 상태.
 *
 * This component never computes anything clinical itself -- it only
 * formats values its caller (DoctorWorkspace.tsx) already derived
 * (Lane1Summary from lane1Summary.ts, the same union every region's real
 * SafetyPanel already renders). Truncation (max 2 regions + `외 N`,
 * calc-unavailable suffix, the auth-recovery replacement of the save row)
 * happens here, at the value level, per §3.2's explicit rule that
 * `overflow:hidden` is a safety net, not the truncation mechanism itself.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { DoctorTokenSetup } from '../DoctorTokenSetup'
import {
  formatCalcUnavailableSuffix,
  relatedRegionLabels,
  truncateRegionLabels,
  type Lane1Summary,
} from './lane1Summary'

/**
 * §3.2's 834-portrait row (①+④를 1줄씩 압축해 96px) is a CONTENT
 * reformat, not a CSS reflow of the same five blocks -- squeezing five
 * already-narrow blocks under one `max-height:96px` via CSS alone would
 * clip blocks 3-5 entirely (문진 인용 여부·최중요한 레인1 안전 칩·저장
 * 상태 자체가 사라짐), which is exactly the "규칙 위반 시의 안전망일 뿐"
 * `overflow:hidden` warns against, not a real compression. This tracks the
 * portrait media query with `matchMedia` so the compact 2-line variant
 * below can actually render different, denser markup instead of just
 * clipping. SSR/tests never run this effect (no `window`), so they always
 * see the full 5-block layout -- unaffected either way, since none of the
 * Phase 7 §1 required tests exercise portrait rendering.
 */
function usePortraitCompact(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 1023px) and (orientation: portrait)')
    const update = () => setCompact(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return compact
}

export type VisitSummarySaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const LANE1_STATUS_GLYPH: Record<Lane1Summary['status'], string> = {
  URGENT: '🔴',
  '확인 필요': '🟡▲',
  계산불가: '▦',
  CLEAR: '🟢',
  해당없음: '○',
}

export function VisitSummaryAside({
  patientName,
  chartNo,
  sexAgeLine,
  chiefConcern,
  durationFrequency,
  lastVsDeltaLine,
  lane1,
  /**
   * §6.1/§3.2 "잠금 여부 🔒": approximated as "the union status itself is
   * not CLEAR/해당없음" -- disease-safety lock (`diseaseSafetyLocked`,
   * FROZEN per-region logic) always implies a non-CLEAR status, so this
   * catches every disease-lock case exactly. It does NOT independently
   * re-derive a treatment-only lock (e.g. pregnancy caution while disease
   * safety itself reads CLEAR) since that status is not encoded in the
   * per-region panel's outer className this shell already reuses for the
   * union (lane1Summary.ts) -- documented gap, not a silent guess.
   */
  saveStatus,
  lastSaveErrorKind,
  onRetryAfterTokenSet,
}: {
  patientName: string
  chartNo?: string | null
  sexAgeLine?: string | null
  chiefConcern: string
  durationFrequency?: string | null
  lastVsDeltaLine?: string | null
  lane1: Lane1Summary
  saveStatus?: VisitSummarySaveStatus
  lastSaveErrorKind?: 'auth' | 'network' | 'other' | null
  onRetryAfterTokenSet?: () => void
}) {
  const compact = usePortraitCompact()
  const locked = lane1.status === 'URGENT' || lane1.status === '확인 필요' || lane1.status === '계산불가'
  const related = truncateRegionLabels(relatedRegionLabels(lane1))
  // §2.2/§1.1-#3: the calc-unavailable suffix is appended to the SAME
  // status chip text ("계산불가 — 목"), never a separate/second chip.
  const calcSuffix = lane1.status === '계산불가' ? formatCalcUnavailableSuffix(lane1.calcUnavailableLabels) : null
  const statusChipText = calcSuffix ?? lane1.status

  let saveRow: ReactNode = ' '
  if (saveStatus && saveStatus !== 'idle') {
    if (saveStatus === 'error' && lastSaveErrorKind === 'auth') {
      // §2.9/§3.2: replaces the save line entirely (never an added line) --
      // in-flow token re-entry without leaving 진료.
      saveRow = <DoctorTokenSetup authFailed onSet={() => onRetryAfterTokenSet?.()} />
    } else if (saveStatus === 'saving') {
      saveRow = '저장 중…'
    } else if (saveStatus === 'saved') {
      saveRow = '저장됨'
    } else if (saveStatus === 'error') {
      saveRow = '저장 실패 — 다시 시도해주세요'
    } else if (saveStatus === 'conflict') {
      saveRow = '저장 중단됨 — 아래 안내 확인'
    }
  }

  if (compact) {
    // §3.2: 834 portrait -- ①+② inline on line 1 (이름·chart_no·주호소),
    // ④+⑤ inline on line 2 (안전 칩+저장 상태). ③(지난 대비) is dropped
    // from this compressed row (not budgeted a line in the spec table) --
    // still reachable in 레인2's own "지난번 추적" line, never fabricated
    // here as a fake third row.
    return (
      <aside className="doctor__visitSummary doctor__visitSummary--compact" aria-label="환자 요약">
        <div className="doctor__visitSummary__compactRow">
          <strong>{patientName || '(이름 없음)'}</strong>
          {chartNo && <span> · {chartNo}</span>}
          <span> · {chiefConcern}</span>
        </div>
        <div
          className="doctor__visitSummary__compactRow"
          role={lane1.status === 'URGENT' ? 'alert' : undefined}
          aria-live={lane1.status === 'URGENT' ? undefined : 'polite'}
        >
          <span
            className={`doctor__lane1Chip doctor__lane1Chip--${lane1.status === '확인 필요' ? 'review' : lane1.status === '계산불가' ? 'unavailable' : lane1.status === '해당없음' ? 'na' : lane1.status.toLowerCase()}`}
          >
            <span aria-hidden="true">{LANE1_STATUS_GLYPH[lane1.status]}</span> {statusChipText}
          </span>
          {locked && <span aria-label="안전 확인 전 잠금">🔒</span>}
          <span aria-live="polite">{saveRow}</span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="doctor__visitSummary" aria-label="환자 요약">
      <div className="doctor__visitSummary__identity">
        <strong className="doctor__visitSummary__name">{patientName || '(이름 없음)'}</strong>
        <span className="doctor__visitSummary__meta">
          {[chartNo, sexAgeLine].filter((v): v is string => Boolean(v && v.trim())).join(' · ') || ' '}
        </span>
      </div>

      <div className="doctor__visitSummary__chief">
        <span className="doctor__visitSummary__chiefValue">{chiefConcern}</span>
        {durationFrequency && <span className="doctor__visitSummary__chiefMeta">{durationFrequency}</span>}
      </div>

      <div className="doctor__visitSummary__delta">
        {lastVsDeltaLine ? <span className="doctor__patientFact">{lastVsDeltaLine}</span> : <span>&nbsp;</span>}
      </div>

      <div
        className="doctor__visitSummary__lane1"
        role={lane1.status === 'URGENT' ? 'alert' : undefined}
        aria-live={lane1.status === 'URGENT' ? undefined : 'polite'}
      >
        <span
          className={`doctor__lane1Chip doctor__lane1Chip--${lane1.status === '확인 필요' ? 'review' : lane1.status === '계산불가' ? 'unavailable' : lane1.status === '해당없음' ? 'na' : lane1.status.toLowerCase()}`}
        >
          <span aria-hidden="true">{LANE1_STATUS_GLYPH[lane1.status]}</span> {statusChipText}
        </span>
        {locked && (
          <span className="doctor__visitSummary__lock" aria-label="안전 확인 전 잠금">
            🔒
          </span>
        )}
        {related.shown.length > 0 && (
          <span className="doctor__visitSummary__regions">
            {related.shown.join(', ')}
            {related.overflowCount > 0 && ` 외 ${related.overflowCount}`}
          </span>
        )}
        <a href="#lane1-h2" className="doctor__visitSummary__evidenceLink">
          근거 보기
        </a>
      </div>

      <div className="doctor__visitSummary__save" aria-live="polite">
        {saveRow}
      </div>
    </aside>
  )
}
