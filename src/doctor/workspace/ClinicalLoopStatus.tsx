/**
 * Clinical Loop Status (round 3 Phase G) — a subtle, clinician-only
 * OPERATIONAL completeness cue ("did I fill in the pieces of today's
 * record"), never a quality/gamification score and never a medical
 * judgment about the visit itself.
 */

export type ClinicalLoopStatusItem = { key: string; label: string; done: boolean }

export function ClinicalLoopStatusBar({ items }: { items: ClinicalLoopStatusItem[] }) {
  return (
    <div className="workspace__loopStatus" role="status" aria-label="오늘 기록 진행 상태(참고용)">
      {items.map((i) => (
        <span
          key={i.key}
          className={`workspace__loopStatus__item${i.done ? ' workspace__loopStatus__item--done' : ''}`}
        >
          <span aria-hidden="true">{i.done ? '●' : '○'}</span> {i.label}
        </span>
      ))}
    </div>
  )
}
