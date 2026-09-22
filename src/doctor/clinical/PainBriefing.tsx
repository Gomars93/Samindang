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
import { buildPainBriefing, type BriefingOptions } from './briefingModel'
import type { DoctorPayload } from '../types'

function Row({ row }: { row: BriefingRow }) {
  const isPending = row.status === 'not_collected'
  const isUnanswered = row.status === 'unanswered'
  return (
    <div
      className={`painRow${isPending ? ' painRow--pending' : ''}`}
      data-source={row.source}
      data-status={row.status}
    >
      <span className="painRow__label">{row.label}</span>
      <span className={`painRow__value painRow__value--${row.tone}`}>
        {row.value ?? (isPending ? '아직 안 물어봄' : isUnanswered ? '미응답' : '')}
      </span>
    </div>
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
}

export function PainBriefing({ payload, options }: PainBriefingProps) {
  const blocks = buildPainBriefing(payload, options)
  return (
    <div className="painClinical painBriefing">
      {blocks.map((block) => (
        <Block key={block.key} block={block} />
      ))}
    </div>
  )
}

export default PainBriefing
