/**
 * 통증 닥터뷰 브리핑 — 렌더.
 *
 * 이 파일은 값을 **계산하지 않는다.** `briefingModel.ts`가 만든 행 배열을
 * 그리기만 한다. 그래야 "화면에서 몰래 임상 판단을 하는" 경로가 생기지
 * 않고, 테스트가 순수 함수 쪽만 붙들면 된다.
 *
 * 행 문법은 하나다: `라벨 ──────── 값(우측)`. Figma의 그 문법이고,
 * 이 파일에 두 번째 행 모양을 추가하지 않는다.
 */
import './tokens.css'
import './briefing.css'
import type { BriefingBlock, BriefingRow } from './briefingModel'
import {
  buildPainBriefing,
  buildPainHeadline,
  type BriefingOptions,
  type PriorNrs,
} from './briefingModel'
import type { DoctorPayload } from '../types'

/**
 * 0~10을 점 열 개로 그린다.
 *
 * 숫자 버튼 11개보다 훑기가 빠르고, 값의 폭이 고정돼 우측 정렬이 흔들리지
 * 않는다. 숫자를 함께 적는 이유는 점을 세게 하지 않기 위해서다.
 */
function Dots({ n, max = 10 }: { n: number; max?: number }) {
  const filled = Math.max(0, Math.min(max, Math.round(n)))
  return (
    <span className="painDots" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={`painDots__d${i < filled ? ' painDots__d--on' : ''}`} />
      ))}
    </span>
  )
}

function Row({ row }: { row: BriefingRow }) {
  const isPending = row.status === 'not_collected'
  const isUnanswered = row.status === 'unanswered'
  const kind = row.kind ?? 'text'

  // 값 자리만 바뀐다. 행의 뼈대(라벨 왼쪽 / 값 오른쪽)는 세 종류 모두 같다.
  let valueNode: React.ReactNode
  if (row.status !== 'answered') {
    valueNode = isPending ? '아직 안 물어봄' : isUnanswered ? '미응답' : ''
  } else if (kind === 'scale' && typeof row.n === 'number') {
    valueNode = (
      <>
        <Dots n={row.n} max={row.max} />
        <b className="painRow__num">{row.n}</b>
      </>
    )
  } else if (kind === 'delta' && typeof row.n === 'number' && typeof row.prev === 'number') {
    const d = row.n - row.prev
    valueNode = (
      <>
        <span className="painRow__prev">{row.prev}</span>
        <span className="painRow__arrow" aria-hidden="true">→</span>
        <b className="painRow__num">{row.n}</b>
        <span className="painRow__delta">{d === 0 ? '변화 없음' : `${d < 0 ? '↓' : '↑'}${Math.abs(d)}`}</span>
      </>
    )
  } else {
    valueNode = row.value
  }

  return (
    <div
      className={`painRow${isPending ? ' painRow--pending' : ''}`}
      data-source={row.source}
      data-status={row.status}
      data-kind={kind}
    >
      <span className="painRow__label">{row.label}</span>
      <span className={`painRow__value painRow__value--${row.tone}`}>{valueNode}</span>
    </div>
  )
}

/** Figma `A · Clinical Snapshot` — 4블록 위의 전폭 띠. */
function Headline({ payload, prior }: { payload: DoctorPayload; prior?: PriorNrs }) {
  const h = buildPainHeadline(payload, prior)
  return (
    <section className="painSnapshot" aria-label="환자 요약">
      <div className="painSnapshot__lead">
        <h2 className="painSnapshot__title">{h.title}</h2>
        <p className="painSnapshot__subtitle">{h.subtitle}</p>
      </div>
      <div className="painSnapshot__rows">
        {h.rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </div>
    </section>
  )
}

function Block({ block }: { block: BriefingBlock }) {
  return (
    <section className="painBlock" aria-labelledby={`painBlock-${block.key}`}>
      <header className="painBlock__head">
        <h3 className="painBlock__eyebrow" id={`painBlock-${block.key}`}>
          {block.eyebrow}
        </h3>
        <p className="painBlock__question">{block.question}</p>
      </header>
      {block.rows.map((row) => (
        <Row key={`${block.key}:${row.label}`} row={row} />
      ))}
    </section>
  )
}

export type PainBriefingProps = {
  payload: DoctorPayload
  options?: BriefingOptions
  /** 지난 방문의 NRS. 주면 상단 척도 행이 비교 행으로 바뀐다. */
  priorNrs?: PriorNrs
}

export function PainBriefing({ payload, options, priorNrs }: PainBriefingProps) {
  const blocks = buildPainBriefing(payload, options)
  return (
    <div className="painClinical painBriefingRoot">
      <Headline payload={payload} prior={priorNrs} />
      <div className="painBriefing">
        {blocks.map((block) => (
          <Block key={block.key} block={block} />
        ))}
      </div>
    </div>
  )
}

export default PainBriefing
