/**
 * 통증 닥터뷰 — 입력 3블록 렌더 (검사 / 판단 / 처치).
 *
 * 읽기 블록(`PainBriefing.tsx`)과 **같은 행 뼈대**를 쓴다:
 *
 *   라벨(왼쪽, 줄바꿈 없음)  ────────  값(오른쪽)
 *
 * 읽기에서는 값 자리가 텍스트·점척도·비교였고, 여기서는 **칩**이다. 그것뿐이다.
 * 이 파일에 두 번째 행 모양을 만들지 않는다.
 *
 * 소견(설진·맥진·복진) 블록은 여기 없다 -- 그건 한약 진료의 것이고
 * `HerbalWorkspace`의 `ClinicianObservationChecklist`가 담당한다. 이유는
 * `clinicalModel.ts` 헤더에 적어뒀다. 2층(`＋ 전체`) 접기 UI도 그 블록과 함께
 * 빠졌다 -- 남은 세 블록의 칩은 행마다 3개씩이라 접을 것이 없고, 아무것도
 * 담기지 않는 버튼을 남겨두지 않는다.
 *
 * 값을 계산하지 않는다
 * --------------------
 * `clinicalModel.ts`가 만든 행 배열을 그리고, 토글은 `onToggle`로 그대로
 * 위로 올려보낸다. 화면이 임상 값을 몰래 정하는 경로가 생기지 않는다.
 *
 * 타겟 크기
 * ---------
 * 칩은 44px 이상이다. 같은 날 고친 `judgment__radioOption` 18px 결함과 같은
 * 종류의 사고를 여기서 되풀이하지 않는다.
 */
import './tokens.css'
import './briefing.css'
import './clinical.css'
import {
  buildClinicalBlocks,
  MAX_INLINE_CHIPS,
  type Chip,
  type ClinicalBlock,
  type ClinicalInput,
  type ClinicalRow,
} from './clinicalModel'

export type ToggleHandler = (blockKey: string, rowKey: string, chipValue: string) => void
export type NoteHandler = (blockKey: string, value: string) => void

function ChipButton({
  chip,
  onClick,
  readOnly,
}: {
  chip: Chip
  onClick?: () => void
  readOnly?: boolean
}) {
  const cls = `painChip${chip.selected ? ' painChip--on' : ''}`
  if (readOnly) {
    return (
      <span className={cls} title={chip.tooltip} aria-pressed={chip.selected}>
        {chip.label}
      </span>
    )
  }
  return (
    <button type="button" className={cls} title={chip.tooltip} aria-pressed={chip.selected} onClick={onClick}>
      {chip.label}
    </button>
  )
}

function Row({
  row,
  blockKey,
  onToggle,
  readOnly,
}: {
  row: ClinicalRow
  blockKey: string
  onToggle?: ToggleHandler
  readOnly?: boolean
}) {
  const fire = (value: string) => () => onToggle?.(blockKey, row.key, value)

  return (
    <div
      className={`painRow painRow--input${row.untouched ? ' painRow--untouched' : ''}`}
      data-source={row.source}
      data-row-key={row.key}
    >
      <span className="painRow__label">{row.label}</span>
      <span className="painRow__value painRow__chips">
        {row.chips.map((c) => (
          <ChipButton key={c.label} chip={c} onClick={fire(c.value ?? c.label)} readOnly={readOnly} />
        ))}
      </span>
    </div>
  )
}

function Block({
  block,
  onToggle,
  onNote,
  readOnly,
}: {
  block: ClinicalBlock
  onToggle?: ToggleHandler
  onNote?: NoteHandler
  readOnly?: boolean
}) {
  return (
    <section className="painBlock painBlock--input" aria-labelledby={`painClinical-${block.key}`}>
      <header className="painBlock__head">
        <h3 className="painBlock__eyebrow" id={`painClinical-${block.key}`}>
          {block.eyebrow}
        </h3>
        <p className="painBlock__question">{block.question}</p>
      </header>

      {block.rows.length === 0 && <p className="painBlock__empty">제안된 항목이 없습니다.</p>}

      {block.rows.map((row) => (
        <Row key={row.key} row={row} blockKey={block.key} onToggle={onToggle} readOnly={readOnly} />
      ))}

      {block.note && (
        <label className="painNote">
          <span className="painNote__label">{block.note.label}</span>
          <textarea
            className="painNote__input"
            rows={2}
            value={block.note.value}
            placeholder={block.note.placeholder}
            readOnly={readOnly}
            onChange={(e) => onNote?.(block.key, e.target.value)}
          />
        </label>
      )}
    </section>
  )
}

export type ClinicalBlocksProps = {
  input: ClinicalInput
  onToggle?: ToggleHandler
  onNote?: NoteHandler
  /** 컨택트 시트·미리보기처럼 정적으로 그릴 때. 칩이 버튼이 아니라 표시로만 나온다. */
  readOnly?: boolean
}

export function ClinicalBlocks({ input, onToggle, onNote, readOnly }: ClinicalBlocksProps) {
  const blocks = buildClinicalBlocks(input)
  return (
    /*
     * `painClinical`이 토큰 스코프다 -- `tokens.css`가 CSS 변수를 그 클래스에
     * 선언하므로, 이게 빠지면 `var(--pain-*)`가 전부 해석되지 않아 칩이
     * 스타일 없는 맨 텍스트로 떨어진다(컨택트 시트에서 실제로 그렇게 났다).
     */
    <div className="painClinical painBriefing painBriefing--input">
      {blocks.map((b) => (
        <Block key={b.key} block={b} onToggle={onToggle} onNote={onNote} readOnly={readOnly} />
      ))}
    </div>
  )
}

export { MAX_INLINE_CHIPS }
export default ClinicalBlocks
