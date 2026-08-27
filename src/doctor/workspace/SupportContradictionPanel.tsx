/**
 * Generic 지지/반증/확인 필요 panel, shared by Pain and Herbal workspaces
 * (PR #24 Phase 5). Purely presentational — classification happens
 * upstream (fixtures today; an approved rule engine eventually), this
 * component only renders already-grouped evidence.
 */
import { groupEvidence, type EvidenceItem } from './supportEngine'
import { PROVENANCE_BADGE } from './provenance'

export function SupportContradictionPanel({ items, emptyText }: { items: EvidenceItem[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="workspace__empty">{emptyText}</p>
  }
  const { support, contradiction, unknown } = groupEvidence(items)

  return (
    <div className="workspace__evidence" aria-label="확인 필요 / 서로 맞지 않는 정보">
      {support.length > 0 && (
        <div className="workspace__evidenceGroup workspace__evidenceGroup--support">
          <h4>지지</h4>
          <ul>
            {support.map((it) => (
              <li key={it.id}>
                <span className="workspace__provBadge">{PROVENANCE_BADGE[it.provenance]}</span>
                {it.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {contradiction.length > 0 && (
        <div className="workspace__evidenceGroup workspace__evidenceGroup--contradiction">
          <h4>반증 / 주의</h4>
          <ul>
            {contradiction.map((it) => (
              <li key={it.id}>
                <span className="workspace__provBadge">{PROVENANCE_BADGE[it.provenance]}</span>
                {it.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {unknown.length > 0 && (
        <div className="workspace__evidenceGroup workspace__evidenceGroup--unknown">
          <h4>확인 필요</h4>
          <ul>
            {unknown.map((it) => (
              <li key={it.id}>
                <span className="workspace__provBadge">{PROVENANCE_BADGE[it.provenance]}</span>
                {it.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
