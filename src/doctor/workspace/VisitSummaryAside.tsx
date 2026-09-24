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
import {
  formatCalcUnavailableSuffix,
  relatedRegionLabels,
  truncateRegionLabels,
  type Lane1Summary,
} from './lane1Summary'
import { MICRO_FOLLOW_UP_ALERT_LABEL, type MicroFollowUpAlertKind } from './microFollowUp'

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
  identityLinkSlot,
  sexAgeLine,
  chiefConcern,
  durationFrequency,
  lastVsDeltaLine,
  lastVsAlertKind,
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
  onOpenTokenReentry,
}: {
  patientName: string
  chartNo?: string | null
  /**
   * 차트번호 연결(2026-09-21): 아직 시그마 차트번호가 연결되지 않은 서버
   * 레코드에서만 호출부가 채워 보내는 슬롯 -- `PatientIdentityLinkAction`이
   * 들어온다. 이 파일이 그 컴포넌트를 직접 import하지 않는 이유는, 순수
   * 표시용인 이 aside가 서버 클라이언트(linkPatientIdentity)에 의존하게
   * 되면 테스트 번들이 네트워크 모듈까지 끌고 오기 때문이다 -- 호출부가
   * 노드를 만들어 넣는다.
   *
   * compact(834 세로)에는 **의도적으로 렌더하지 않는다**: 그 행은 §3.2가
   * 2줄로 예산을 고정해 둔 자리이고(layout-budget 테스트가 감시한다),
   * 닥터뷰는 PO 확인상 PC 전용이다. 연결이 끝난 뒤의 차트번호 표시는
   * compact에도 그대로 나온다(위 `chartNo` 분기).
   */
  identityLinkSlot?: ReactNode
  sexAgeLine?: string | null
  chiefConcern: string
  durationFrequency?: string | null
  lastVsDeltaLine?: string | null
  /**
   * 2026-09-24 (PO 지시, 「간단 재확인」 카드가 확인 레인을 떠난 것의 짝):
   * 위 한 줄이 환자의 **이상반응/새 증상 신고**에서 온 것이면 그 사실을
   * 배지로 함께 보인다. 같은 글자라도 "이상반응으로 적은 것"과 "근황으로
   * 적은 것"은 원장에게 전혀 다른 정보인데, 카드가 내려간 뒤로는 이 배지
   * 말고 그 둘을 구분해 주는 것이 화면에 없다.
   *
   * `null`이면 배지를 아예 그리지 않는다 -- "신고 없음"이라는 빈 배지를
   * 두면 그것대로 읽히기 때문이다.
   */
  lastVsAlertKind?: MicroFollowUpAlertKind | null
  lane1: Lane1Summary
  saveStatus?: VisitSummarySaveStatus
  lastSaveErrorKind?: 'auth' | 'network' | 'other' | null
  /**
   * MAJOR-3 (Phase 10 closing review): block ⑤'s fixed 20px budget can only
   * ever hold a 1-line action, never the full DoctorTokenSetup banner
   * (>=100px, was silently clipping there before this fix) -- clicking
   * this asks the CALLER to render that form outside the left summary's
   * budget entirely (DoctorWorkspace.tsx renders it at the top of the
   * right work column's lane1 section). This component never renders the
   * token form itself.
   */
  onOpenTokenReentry?: () => void
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
      // MAJOR-3 (Phase 10 closing review) / §2.9/§3.2: replaces the save
      // line entirely (never an added line) -- but as a single-line ACTION
      // within the 20px budget, not the full token-entry banner itself
      // (that renders elsewhere, outside this budget, once clicked; see
      // onOpenTokenReentry's doc comment above).
      saveRow = (
        <button type="button" className="doctor__visitSummary__authBtn" onClick={() => onOpenTokenReentry?.()}>
          인증 만료 — 토큰 다시 입력
        </button>
      )
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
        {identityLinkSlot}
      </div>

      <div className="doctor__visitSummary__chief">
        <span className="doctor__visitSummary__chiefValue">{chiefConcern}</span>
        {durationFrequency && <span className="doctor__visitSummary__chiefMeta">{durationFrequency}</span>}
      </div>

      <div className="doctor__visitSummary__delta">
        {lastVsDeltaLine ? (
          <span className="doctor__patientFact">
            {/*
              배지는 문장 **앞**에 둔다 -- 한 줄이 좁아 문장이 잘릴 수 있는데,
              뒤에 두면 잘리는 쪽이 배지가 된다(가장 중요한 것이 먼저 사라진다).
            */}
            {lastVsAlertKind && (
              <span className="doctor__visitSummary__deltaAlert">{MICRO_FOLLOW_UP_ALERT_LABEL[lastVsAlertKind]}</span>
            )}
            {lastVsDeltaLine}
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
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
