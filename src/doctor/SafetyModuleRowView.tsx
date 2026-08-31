/**
 * Doctor View 재설계 v0.2 §9.4/§11.3 — 안전 모듈 한 행의 3-status 시각
 * 인코딩(신규 구현 — 현행 코드에는 대응 CSS가 없었다, Opus B2) + 접힘
 * 정책.
 *
 * - URGENT_REVIEW: 접기 컨트롤 자체를 렌더하지 않는다(항상 완전히 펼침).
 * - REVIEW_REQUIRED: `<details open>` — 기본 확장, 원장이 접을 수는 있다.
 * - CLEAR: `<details>` — 기본 한 줄 접힘.
 * - 잠금 문구는 `<summary>` 안(=접힘 여부와 무관하게 항상 보이는 행 요약
 *   줄)에 둔다 — invariant 3.
 * - 계산 플래그는 `row.chips`에 이미 true인 것만 들어있다(safetyModules.ts).
 */
import type { SafetyModuleRow } from './safetyModules'

const STATUS_ICON: Record<SafetyModuleRow['status'], string> = {
  URGENT_REVIEW: '⚠',
  REVIEW_REQUIRED: '⚠',
  CLEAR: '✓',
}

const STATUS_TEXT: Record<SafetyModuleRow['status'], string> = {
  URGENT_REVIEW: '긴급 확인 필요',
  REVIEW_REQUIRED: '확인 필요',
  CLEAR: '안전',
}

function RowSummaryLine({ row }: { row: SafetyModuleRow }) {
  return (
    <span className="doctor__safetyRow__summaryLine">
      <span className="doctor__safetyRow__icon" aria-hidden="true">
        {STATUS_ICON[row.status]}
      </span>
      {/* "안전 확인 — <라벨>" 문구는 기존 개별 패널 제목과 동일한 형태를
          유지한다 — 텍스트 계약을 불필요하게 바꾸지 않기 위함. 템플릿
          리터럴 하나로 합쳐서 렌더한다 — 정적 텍스트와 표현식을 나누면
          React SSR이 그 사이에 `<!-- -->` 주석 노드를 끼워 넣어
          `html.includes('안전 확인 — 허리')` 같은 부분 문자열 검사가
          깨진다. */}
      <span className="doctor__safetyGlance__title">{`안전 확인 — ${row.label}`}</span>
      <span className="doctor__safetyRow__statusText">{STATUS_TEXT[row.status]}</span>
      {row.lockedNotes.map((note, i) => (
        <span key={i} className="doctor__safetyRow__lock">
          🔒 {note}
        </span>
      ))}
    </span>
  )
}

function RowBody({ row }: { row: SafetyModuleRow }) {
  return (
    <div className="doctor__safetyRow__body">
      <div className="doctor__safetyGlance__items">
        {row.chips.map((c) => (
          <span key={c.key} className="doctor__safetyChip">
            <strong>{c.label}</strong> {c.text}
          </span>
        ))}
      </div>
      {row.extraNotes.map((note, i) => (
        <p key={i} className="doctor__derivedNote">
          {note}
        </p>
      ))}
      {row.examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {row.examCodes.map((e) => (
              <li key={e.code}>{e.label}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="doctor__safetyRow__disclaimer">
        위 플래그는 문진 기반 fail-closed 계산 결과이며, 진찰로 확인된 음성 소견이 아닙니다.
      </p>
    </div>
  )
}

export function SafetyModuleRowView({ row }: { row: SafetyModuleRow }) {
  const statusClass = `doctor__safetyRow--${row.status.toLowerCase()}`

  if (row.status === 'URGENT_REVIEW') {
    return (
      <div className={`doctor__safetyRow ${statusClass}`} data-safety-module={row.key}>
        <div className="doctor__safetyRow__summary">
          <RowSummaryLine row={row} />
        </div>
        <RowBody row={row} />
      </div>
    )
  }

  return (
    <details className={`doctor__safetyRow ${statusClass}`} open={row.status === 'REVIEW_REQUIRED'} data-safety-module={row.key}>
      <summary className="doctor__safetyRow__summary">
        <RowSummaryLine row={row} />
      </summary>
      <RowBody row={row} />
    </details>
  )
}
