/**
 * Clinician-owned Final Assessment card, parameterized for Pain or Herbal
 * (PR #24 Phase 7). Always visibly labeled "원장 최종 판단" — a system
 * SUGGESTED item is never auto-copied in here; every field starts empty
 * and is filled only by explicit clinician typing.
 */
import type {
  HerbalFinalAssessment,
  PainFinalAssessment,
} from './finalAssessment'

type Field = { key: string; label: string; value: string; placeholder: string }

function TextFields({
  fields,
  onChange,
}: {
  fields: Field[]
  onChange: (key: string, value: string) => void
}) {
  return (
    <div className="workspace__finalAssessment__fields">
      {fields.map((f) => (
        <label key={f.key} className="workspace__finalAssessment__field">
          <span>{f.label}</span>
          <textarea
            rows={2}
            value={f.value}
            placeholder={f.placeholder}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </label>
      ))}
    </div>
  )
}

/*
 * Round 11: the default clinician action area compresses toward 판단 /
 * 처치 / 재검. Secondary fields stay in the persisted schema and stay
 * editable -- they simply stop looking mandatory on every visit. A
 * secondary field that ALREADY holds text opens automatically, so nothing
 * a clinician wrote is ever hidden from them.
 */
function SecondaryFields({
  fields,
  onChange,
}: {
  fields: Field[]
  onChange: (key: string, value: string) => void
}) {
  if (fields.length === 0) return null
  const hasContent = fields.some((f) => f.value.trim() !== '')
  return (
    <details className="workspace__optional workspace__finalAssessment__secondary" open={hasContent}>
      <summary>{fields.map((f) => f.label).join(' · ')} — 필요할 때 입력</summary>
      <TextFields fields={fields} onChange={onChange} />
    </details>
  )
}

export function PainFinalAssessmentCard({
  value,
  onChange,
}: {
  value: PainFinalAssessment
  onChange: (next: PainFinalAssessment) => void
}) {
  // 판단 / 처치 / 재검 -- the three the default view asks for.
  const primary: Field[] = [
    { key: 'finalWorkingAssessment', label: '최종 임상 판단', value: value.finalWorkingAssessment, placeholder: '원장이 직접 입력' },
    {
      key: 'interventionPerformedOrPlanned',
      label: '시행/예정 처치',
      value: value.interventionPerformedOrPlanned,
      placeholder: '원장이 직접 입력',
    },
    {
      key: 'immediateRetestTarget',
      label: '즉시 재검 대상',
      value: value.immediateRetestTarget,
      placeholder: '예: 숙일 때 통증 재현 여부',
    },
  ]
  const secondary: Field[] = [
    { key: 'treatmentFocus', label: '치료 초점', value: value.treatmentFocus, placeholder: '원장이 직접 입력' },
  ]
  const handleChange = (key: string, v: string) =>
    onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as PainFinalAssessment)
  return (
    <section className="workspace__finalAssessment" aria-label="원장 최종 판단">
      <div className="workspace__finalAssessment__badge">원장 최종 판단</div>
      <TextFields fields={primary} onChange={handleChange} />
      <SecondaryFields fields={secondary} onChange={handleChange} />
    </section>
  )
}

export function HerbalFinalAssessmentCard({
  value,
  onChange,
}: {
  value: HerbalFinalAssessment
  onChange: (next: HerbalFinalAssessment) => void
}) {
  const fields: Field[] = [
    {
      key: 'finalPatternOrMechanism',
      label: '최종 변증·병기',
      value: value.finalPatternOrMechanism,
      placeholder: '원장이 직접 입력',
    },
    { key: 'treatmentPrinciple', label: '치법', value: value.treatmentPrinciple, placeholder: '원장이 직접 입력' },
    {
      key: 'prescriptionPlanNote',
      label: '처방/계획 메모',
      value: value.prescriptionPlanNote,
      placeholder: '자동 처방 생성 없음 — 원장이 직접 입력',
    },
    { key: 'symptomsToTrack', label: '추적할 증상', value: value.symptomsToTrack, placeholder: '원장이 직접 입력' },
  ]
  return (
    <section className="workspace__finalAssessment" aria-label="최종 변증·병기 — 원장 판단">
      <div className="workspace__finalAssessment__badge">최종 변증·병기 — 원장 판단</div>
      <TextFields
        fields={fields}
        onChange={(key, v) =>
          onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as HerbalFinalAssessment)
        }
      />
    </section>
  )
}
