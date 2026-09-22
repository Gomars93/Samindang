/**
 * 통증 닥터뷰 — 입력 4블록 렌더 (소견 / 검사 / 판단 / 처치).
 *
 * 읽기 블록(`PainBriefing.tsx`)과 **같은 행 뼈대**를 쓴다:
 *
 *   라벨(왼쪽, 줄바꿈 없음)  ────────  값(오른쪽)
 *
 * 읽기에서는 값 자리가 텍스트·점척도·비교였고, 여기서는 **칩**이다. 그것뿐이다.
 * 이 파일에 두 번째 행 모양을 만들지 않는다.
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
  NO_FINDING_VALUE,
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
  const hasOverflow = row.overflowChips.length > 0

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
        {hasOverflow && (
          /*
           * 2층(`＋ 전체`). <details>를 쓰는 이유: 상태를 컴포넌트가 들지
           * 않아도 되고, 키보드·스크린리더 동작이 네이티브로 따라온다.
           * 선택된 2층 칩은 모델이 이미 인라인으로 올려 보내므로, 여기 접히는
           * 것은 **아직 안 고른 것들**뿐이다.
           */
          <details className="painChips__more">
            <summary className="painChip painChip--more">＋ 전체 {row.overflowChips.length}</summary>
            <div className="painChips__moreBody">
              {row.overflowChips.map((c) => (
                <ChipButton key={c.label} chip={c} onClick={fire(c.value ?? c.label)} readOnly={readOnly} />
              ))}
            </div>
          </details>
        )}
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

      {/*
       * "봤는데 특이소견 없음". 미체크는 "정상"이 아니라 "아직 안 봤음"을
       * 뜻하므로(카탈로그 헤더 참고) 이 한 번의 탭이 그 구분을 만든다.
       */}
      {block.key === 'observation' && (
        <div className="painRow painRow--input">
          <span className="painRow__label">전체</span>
          <span className="painRow__value painRow__chips">
            <ChipButton
              chip={{ label: NO_FINDING_VALUE, selected: false }}
              onClick={() => onToggle?.(block.key, '__all__', NO_FINDING_VALUE)}
              readOnly={readOnly}
            />
          </span>
        </div>
      )}

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
