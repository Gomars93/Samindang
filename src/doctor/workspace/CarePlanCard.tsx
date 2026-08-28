/**
 * Clinician-owned Care Plan card, parameterized for Pain or Herbal (round 3
 * Phase A, North Star "Treatment → Care Plan/Rehab"). Same pattern as
 * FinalAssessmentCard.tsx: every field starts empty, filled only by
 * explicit clinician typing, never auto-generated from a SUGGESTED item.
 */
import type { HerbalCarePlan, PainCarePlan } from './carePlan'

type Field = { key: string; label: string; value: string; placeholder: string }

function TextFields({ fields, onChange }: { fields: Field[]; onChange: (key: string, value: string) => void }) {
  return (
    <div className="workspace__finalAssessment__fields">
      {fields.map((f) => (
        <label key={f.key} className="workspace__finalAssessment__field">
          <span>{f.label}</span>
          <textarea rows={2} value={f.value} placeholder={f.placeholder} onChange={(e) => onChange(f.key, e.target.value)} />
        </label>
      ))}
    </div>
  )
}

export function PainCarePlanCard({ value, onChange }: { value: PainCarePlan; onChange: (next: PainCarePlan) => void }) {
  const fields: Field[] = [
    { key: 'currentTreatmentGoal', label: '현재 치료 목표', value: value.currentTreatmentGoal, placeholder: '원장이 직접 입력' },
    { key: 'rehabilitationGoal', label: '재활 목표', value: value.rehabilitationGoal, placeholder: '원장이 직접 입력' },
    { key: 'homeActionPlan', label: '집에서 할 행동/운동 계획', value: value.homeActionPlan, placeholder: '원장이 직접 입력 — 자동 추천 없음' },
    { key: 'activityPrecaution', label: '주의/당분간 피할 활동', value: value.activityPrecaution, placeholder: '원장이 직접 입력' },
    { key: 'patientInstruction', label: '환자 안내문', value: value.patientInstruction, placeholder: '환자에게 그대로 전달될 문구' },
    { key: 'nextVisitCheckItem', label: '다음 방문 확인 사항', value: value.nextVisitCheckItem, placeholder: '원장이 직접 입력' },
  ]
  return (
    <section className="workspace__carePlan" aria-label="치료 계획 (Care Plan)">
      <div className="workspace__carePlan__badge">치료 계획 — Care Plan</div>
      <TextFields fields={fields} onChange={(key, v) => onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as PainCarePlan)} />
    </section>
  )
}

export function HerbalCarePlanCard({ value, onChange }: { value: HerbalCarePlan; onChange: (next: HerbalCarePlan) => void }) {
  const fields: Field[] = [
    { key: 'currentManagementGoal', label: '현재 관리 목표', value: value.currentManagementGoal, placeholder: '원장이 직접 입력' },
    { key: 'medicationPlanNote', label: '처방/한약 계획 메모', value: value.medicationPlanNote, placeholder: '자동 처방 생성 없음 — 원장이 직접 입력' },
    { key: 'homeLifestyleManagement', label: '집·생활 관리', value: value.homeLifestyleManagement, placeholder: '원장이 직접 입력' },
    { key: 'symptomsToObserve', label: '관찰할 증상', value: value.symptomsToObserve, placeholder: '원장이 직접 입력' },
    { key: 'adverseEffectContactInstruction', label: '이상반응/연락 안내', value: value.adverseEffectContactInstruction, placeholder: '환자에게 그대로 전달될 문구' },
    { key: 'nextVisitCheckItem', label: '다음 방문 확인 사항', value: value.nextVisitCheckItem, placeholder: '원장이 직접 입력' },
  ]
  return (
    <section className="workspace__carePlan" aria-label="관리 계획 (Care Plan)">
      <div className="workspace__carePlan__badge">관리 계획 — Care Plan</div>
      <TextFields fields={fields} onChange={(key, v) => onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as HerbalCarePlan)} />
    </section>
  )
}
