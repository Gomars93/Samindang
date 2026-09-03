/**
 * "재진 간단 체크(30~60초)" — LBP v1 Batch 3 (§9.2(d)). Five independent
 * chip groups, the same `workspace__followUpChip` + `aria-pressed` +
 * re-click-to-deselect convention `NextReassessmentPlanCard.tsx` already
 * uses, plus one optional memo field and a read-only guidance readout
 * (`deriveRevisitQuickCheckGuidance`).
 *
 * The hint line below the title is load-bearing, not decoration: this card
 * NEVER reads a `MicroFollowUpResponse` (the patient's own tablet answer,
 * shown above it in RevisitWorkspace.tsx) -- every value here starts
 * NOT_ASSESSED and is filled only by an explicit clinician tap.
 */
import {
  deriveRevisitQuickCheckGuidance,
  QUICK_CHECK_CHANGE_LABEL,
  QUICK_CHECK_CHANGE_OPTIONS,
  QUICK_CHECK_EXERCISE_ADHERENCE_LABEL,
  QUICK_CHECK_EXERCISE_ADHERENCE_OPTIONS,
  QUICK_CHECK_YES_NO_LABEL,
  QUICK_CHECK_YES_NO_OPTIONS,
  REVISIT_QUICK_CHECK_GROUP_TITLE,
  REVISIT_QUICK_CHECK_SAFETY_LINE,
  type QuickCheckChange,
  type QuickCheckExerciseAdherence,
  type QuickCheckYesNo,
  type RevisitQuickCheck,
} from './revisitQuickCheck'

function ChipGroup<T extends string>({
  title,
  groupAriaLabel,
  options,
  labels,
  activeValue,
  onSelect,
}: {
  title: string
  groupAriaLabel: string
  /** Chip values actually rendered -- excludes 'NOT_ASSESSED', which every T here already carries as its "nothing pressed" member. */
  options: T[]
  labels: Record<T, string>
  activeValue: T
  /** Receives the pressed chip's own value, or the group's NOT_ASSESSED member when the already-active chip is pressed again (deselect). */
  onSelect: (next: T) => void
}) {
  return (
    <div className="workspace__revisit__quickCheckGroup">
      <h5>{title}</h5>
      <div className="workspace__followUp__options" role="group" aria-label={groupAriaLabel}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={activeValue === opt}
            className={`workspace__followUpChip${activeValue === opt ? ' workspace__followUpChip--active' : ''}`}
            onClick={() => onSelect(activeValue === opt ? ('NOT_ASSESSED' as T) : opt)}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** True when at least one of the 5 chip fields is not NOT_ASSESSED. */
function anyAssessed(v: RevisitQuickCheck): boolean {
  return (
    v.targetFunctionChange !== 'NOT_ASSESSED' ||
    v.overallResponse !== 'NOT_ASSESSED' ||
    v.newNeuroOrRedFlag !== 'NOT_ASSESSED' ||
    v.exerciseAdherence !== 'NOT_ASSESSED' ||
    v.adverseEffect !== 'NOT_ASSESSED'
  )
}

export function RevisitQuickCheckCard({
  value,
  onChange,
}: {
  value: RevisitQuickCheck
  onChange: (next: RevisitQuickCheck) => void
}) {
  function setField<K extends 'targetFunctionChange' | 'overallResponse' | 'newNeuroOrRedFlag' | 'exerciseAdherence' | 'adverseEffect'>(
    key: K,
    next: RevisitQuickCheck[K],
  ) {
    const merged: RevisitQuickCheck = { ...value, [key]: next }
    onChange({ ...merged, recordedAt: anyAssessed(merged) ? new Date().toISOString() : null })
  }

  const guidance = deriveRevisitQuickCheckGuidance(value)

  return (
    <section className="workspace__block" aria-label="재진 간단 체크">
      <h3>
        재진 간단 체크(30~60초){' '}
        <span className="workspace__block__hint">
          원장이 보고 듣고 확인한 것만 표시합니다. 환자 태블릿 응답(위)은 자동으로 옮겨오지 않습니다.
        </span>
      </h3>

      <ChipGroup<QuickCheckChange>
        title={REVISIT_QUICK_CHECK_GROUP_TITLE.targetFunctionChange}
        groupAriaLabel="목표 기능 변화 선택"
        options={QUICK_CHECK_CHANGE_OPTIONS}
        labels={QUICK_CHECK_CHANGE_LABEL}
        activeValue={value.targetFunctionChange}
        onSelect={(next) => setField('targetFunctionChange', next)}
      />

      <ChipGroup<QuickCheckChange>
        title={REVISIT_QUICK_CHECK_GROUP_TITLE.overallResponse}
        groupAriaLabel="전체 증상 반응 선택"
        options={QUICK_CHECK_CHANGE_OPTIONS}
        labels={QUICK_CHECK_CHANGE_LABEL}
        activeValue={value.overallResponse}
        onSelect={(next) => setField('overallResponse', next)}
      />

      <ChipGroup<QuickCheckYesNo>
        title={REVISIT_QUICK_CHECK_GROUP_TITLE.newNeuroOrRedFlag}
        groupAriaLabel="새 신경증상·위험신호 선택"
        options={QUICK_CHECK_YES_NO_OPTIONS}
        labels={QUICK_CHECK_YES_NO_LABEL}
        activeValue={value.newNeuroOrRedFlag}
        onSelect={(next) => setField('newNeuroOrRedFlag', next)}
      />

      <ChipGroup<QuickCheckExerciseAdherence>
        title={REVISIT_QUICK_CHECK_GROUP_TITLE.exerciseAdherence}
        groupAriaLabel="운동 실제 시행·난이도 선택"
        options={QUICK_CHECK_EXERCISE_ADHERENCE_OPTIONS}
        labels={QUICK_CHECK_EXERCISE_ADHERENCE_LABEL}
        activeValue={value.exerciseAdherence}
        onSelect={(next) => setField('exerciseAdherence', next)}
      />

      <ChipGroup<QuickCheckYesNo>
        title={REVISIT_QUICK_CHECK_GROUP_TITLE.adverseEffect}
        groupAriaLabel="치료 후 이상반응 선택"
        options={QUICK_CHECK_YES_NO_OPTIONS}
        labels={QUICK_CHECK_YES_NO_LABEL}
        activeValue={value.adverseEffect}
        onSelect={(next) => setField('adverseEffect', next)}
      />

      <label className="workspace__finalAssessment__field workspace__revisit__quickCheckNote">
        <span>메모(선택)</span>
        <input
          type="text"
          className="workspace__noteInput"
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="이상반응·신경증상 내용 등"
        />
      </label>

      {guidance.lines.length > 0 && (
        <div className="workspace__revisit__quickCheckGuidance">
          {guidance.lines.map((line) => (
            <p
              key={line}
              role="status"
              className={
                line === REVISIT_QUICK_CHECK_SAFETY_LINE
                  ? 'workspace__revisit__safetyNotice'
                  : 'workspace__revisit__quickCheckGuidance__line'
              }
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
