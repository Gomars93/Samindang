/**
 * Herbal Workspace V2 (PR #24 Phase 4): 10-second systemic summary,
 * "핵심 병기 후보" (HerbalPatternCandidate list), "오늘 반드시 확인"
 * clinician checklist (tongue/pulse/abdomen/follow-up questions), Myungri
 * kept secondary and collapsed by default, and the clinician-owned final
 * variation/mechanism + reassessment targets + EMR preview.
 *
 * Systemic/herbal information is prioritized first; Myungri is always the
 * last, collapsed section (governing task Phase 2/4.4 invariant).
 */
import { useState } from 'react'
import {
  Field,
  MyungriCompactCard,
  isEmptyValue,
  primaryConcernLabel,
  safetyIssueCategories,
} from '../DoctorView'
import type { DoctorPayload } from '../types'
import { PatternCandidateCard } from './PatternCandidateCard'
import { ClinicianObservationChecklist } from './ClinicianObservationChecklist'
import { HerbalFinalAssessmentCard } from './FinalAssessmentCard'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildHerbalWorkspaceEmrPreview } from './emrPreview'
import { emptyHerbalFinalAssessment, HERBAL_FOLLOW_UP_OPTIONS, type FollowUpTarget } from './finalAssessment'
import type { HerbalPatternCandidate } from './patternCandidate'
import type { ClinicianObservationItem } from './clinicianObservation'

export function HerbalWorkspace({
  payload,
  patternCandidates = [],
  clinicianObservations = [],
}: {
  payload: DoctorPayload
  patternCandidates?: HerbalPatternCandidate[]
  clinicianObservations?: ClinicianObservationItem[]
}) {
  const r = payload.responses
  const { flags } = payload
  const saju = payload.myungri_calculation
  const safetyCats = safetyIssueCategories(flags)
  const safetyAnswered = !isEmptyValue(r.safety_flags.red_flag_general)

  const [candidates, setCandidates] = useState<HerbalPatternCandidate[]>(patternCandidates)
  const [observations, setObservations] = useState<ClinicianObservationItem[]>(clinicianObservations)
  const [finalAssessment, setFinalAssessment] = useState(emptyHerbalFinalAssessment)
  const [followUpTargets, setFollowUpTargets] = useState<FollowUpTarget[]>([])

  const emrText = buildHerbalWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    clinicianObservations: observations,
    finalAssessment,
    followUpTargets,
  })

  const systemicFields: Array<{ qid: string; label: string; value: unknown }> = [
    { qid: 'SLEEP_01', label: '수면', value: r.modules.sleep.problems },
    { qid: 'GI_01', label: '소화', value: r.modules.gi.problems },
    { qid: 'BOWEL_01', label: '대변', value: r.modules.bowel.problems },
    { qid: 'URINARY_01', label: '소변', value: r.modules.urinary.problems },
    { qid: 'HERB_APPETITE', label: '식욕', value: r.constitution_basics.appetite_level },
    { qid: 'WEIGHT_03', label: '체중 변화', value: r.modules.weight.recent_weight_change },
    { qid: 'HERB_THERMAL', label: '한열 경향', value: r.constitution_basics.thermal_tendency },
    { qid: 'HERB_SWEAT', label: '땀', value: r.constitution_basics.sweat_pattern },
    { qid: 'HERB_THIRST', label: '갈증', value: r.constitution_basics.thirst_level },
  ]
  const populatedSystemic = systemicFields.filter((f) => !isEmptyValue(f.value as never))

  return (
    <div className="workspace__herbal">
      <section className="workspace__hero">
        <div className="workspace__hero__head">
          <h3>한약·전신</h3>
          <span className="workspace__hero__hint">전신 상태와 한약 상담 정보를 먼저</span>
        </div>
        <div className="workspace__systemicGrid">
          {populatedSystemic.length === 0 && <p className="workspace__empty">전신 문진 응답이 없습니다.</p>}
          {populatedSystemic.map((f) => (
            <div key={f.qid} className="workspace__systemCard">
              <Field qid={f.qid} label={f.label} value={f.value as never} />
            </div>
          ))}
        </div>
        <div className="workspace__heroRow">
          <span>상담 목적</span>
          <strong>{primaryConcernLabel(r)}</strong>
        </div>
        <div className="workspace__heroRow">
          <span>안전이슈</span>
          <strong className={safetyCats.length > 0 ? 'workspace__heroRow__value--danger' : undefined}>
            {safetyCats.length > 0 ? safetyCats.join(', ') : safetyAnswered ? '없음' : '미확인'}
          </strong>
        </div>
      </section>

      <section className="workspace__block">
        <h3>여성·생식 정보</h3>
        <div className="doctor__grid">
          <Field
            qid="WOMEN_SAFETY_01"
            label="환자가 답한 것"
            value={r.reproductive_status.reproductive_status as never}
          />
        </div>
      </section>

      <section className="workspace__block">
        <h3>약물·병력</h3>
        <div className="doctor__grid">
          <Field qid="MED_USE" value={r.medication.medication_use} />
          <Field qid="MED_TYPES" value={r.medication.medication_types} />
          <Field qid="HISTORY_01" value={r.medical_history.medical_history_flags as never} />
        </div>
      </section>

      <section className="workspace__block">
        <h3>핵심 병기 후보</h3>
        {candidates.length === 0 ? (
          <p className="workspace__empty">현재 후보로 제안된 병기가 없습니다.</p>
        ) : (
          candidates.map((c) => (
            <PatternCandidateCard
              key={c.id}
              candidate={c}
              onChange={(next) => setCandidates((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            />
          ))
        )}
      </section>

      <section className="workspace__block">
        <h3>오늘 반드시 확인</h3>
        <ClinicianObservationChecklist
          items={observations}
          onChangeItem={(next) => setObservations((prev) => prev.map((o) => (o.id === next.id ? next : o)))}
        />
      </section>

      <details className="workspace__myungri">
        <summary>
          명리 참고 <span className="workspace__myungri__hint">· 보조 정보 · 기본 접힘</span>
        </summary>
        <MyungriCompactCard saju={saju} />
      </details>

      <HerbalFinalAssessmentCard value={finalAssessment} onChange={setFinalAssessment} />

      <FollowUpTargetPicker
        options={HERBAL_FOLLOW_UP_OPTIONS}
        selected={followUpTargets}
        onChange={setFollowUpTargets}
      />

      <EmrPreviewCard text={emrText} />
    </div>
  )
}
