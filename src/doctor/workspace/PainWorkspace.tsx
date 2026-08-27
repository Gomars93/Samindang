/**
 * Pain Workspace V2 (PR #24 Phase 3): 10-second summary, "지금 확인할 것"
 * (PhysicalExamSuggestion list), the existing regional SafetyPanels reused
 * unchanged, a support/contradiction panel, clinician exam input (folded
 * into the exam suggestion cards themselves), and the clinician-owned
 * Final Assessment + reassessment targets + EMR preview.
 *
 * No Myungri/saju/birth-time/herbal-only systemic content anywhere in this
 * component (governing task Phase 2 invariant).
 */
import { useState } from 'react'
import {
  AnkleFootSafetyPanel,
} from '../AnkleFootSafetyPanel'
import { TmjSafetyPanel } from '../TmjSafetyPanel'
import { HipSafetyPanel } from '../HipSafetyPanel'
import {
  ElbowSafetyPanel,
  KneeSafetyPanel,
  LbpSafetyPanel,
  NeckSafetyPanel,
  ShoulderSafetyPanel,
  WristHandSafetyPanel,
  aggravatingField,
  aggravatingSummaryText,
  durationFrequencyText,
  frequencyField,
  isEmptyValue,
  primaryConcernLabel,
  primaryModuleFields,
  safetyIssueCategories,
} from '../DoctorView'
import { Field } from '../DoctorView'
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { ExamSuggestionList } from './ExamSuggestionList'
import { SupportContradictionPanel } from './SupportContradictionPanel'
import { PainFinalAssessmentCard } from './FinalAssessmentCard'
import { FollowUpTargetPicker } from './FollowUpTargetPicker'
import { EmrPreviewCard } from './EmrPreviewCard'
import { buildPainWorkspaceEmrPreview } from './emrPreview'
import { emptyPainFinalAssessment, PAIN_FOLLOW_UP_OPTIONS, type FollowUpTarget } from './finalAssessment'
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { EvidenceItem } from './supportEngine'

export function PainWorkspace({
  payload,
  lbpObjectiveMotorDeficit,
  shoulderObjectiveCuffWeakness,
  examSuggestions = [],
  evidence = [],
}: {
  payload: DoctorPayload
  lbpObjectiveMotorDeficit?: ClinicianJudgment['lbp_objective_motor_deficit']
  shoulderObjectiveCuffWeakness?: ClinicianJudgment['shoulder_objective_cuff_weakness']
  examSuggestions?: PhysicalExamSuggestion[]
  evidence?: EvidenceItem[]
}) {
  const r = payload.responses
  const { flags, routing } = payload

  const [items, setItems] = useState<PhysicalExamSuggestion[]>(examSuggestions)
  const [finalAssessment, setFinalAssessment] = useState(emptyPainFinalAssessment)
  const [followUpTargets, setFollowUpTargets] = useState<FollowUpTarget[]>([])

  const durFreq = durationFrequencyText(r, routing.primary_module)
  const aggravatingText = aggravatingSummaryText(routing.primary_module, r.modules)
  const safetyCats = safetyIssueCategories(flags)
  const safetyAnswered = !isEmptyValue(r.safety_flags.red_flag_general)
  // LBP_12: only exists for the LBP regional module — recovery expectation raw score,
  // never an inferred risk/yellow-flag bucket (governing task invariant).
  const recoveryScore = routing.primary_module_detail === 'LBP' ? r.modules.lbp.recovery_expectation : null

  const freq = frequencyField(routing.primary_module, r.modules)
  const agg = aggravatingField(routing.primary_module, r.modules)

  const emrText = buildPainWorkspaceEmrPreview({
    primaryConcern: primaryConcernLabel(r),
    examSuggestions: items,
    finalAssessment,
    followUpTargets,
  })

  return (
    <div className="workspace__pain">
      <section className="workspace__hero">
        <div className="workspace__hero__head">
          <h3>통증 진료</h3>
          <span className="workspace__hero__hint">통증 환자에게 필요한 정보만 우선</span>
        </div>
        <div className="workspace__heroGrid">
          <div className="workspace__metric workspace__metric--primary">
            <span className="workspace__metric__label">주호소</span>
            <strong className="workspace__metric__value">{primaryConcernLabel(r)}</strong>
          </div>
          {durFreq && (
            <div className="workspace__metric">
              <span className="workspace__metric__label">기간</span>
              <strong className="workspace__metric__value">{durFreq}</strong>
            </div>
          )}
          {!isEmptyValue(recoveryScore) && (
            <div className="workspace__metric">
              <span className="workspace__metric__label">회복 기대</span>
              <strong className="workspace__metric__value">
                {String(recoveryScore)} / 10 <span className="workspace__rawTag">원점수</span>
              </strong>
            </div>
          )}
          <div className={`workspace__metric${safetyCats.length > 0 ? ' workspace__metric--danger' : ''}`}>
            <span className="workspace__metric__label">안전이슈</span>
            <strong className="workspace__metric__value">
              {safetyCats.length > 0 ? safetyCats.join(', ') : safetyAnswered ? '없음' : '미확인'}
            </strong>
          </div>
        </div>
        {(aggravatingText || freq || agg) && (
          <div className="workspace__heroRows">
            {aggravatingText && (
              <div className="workspace__heroRow">
                <span>핵심 악화·유발요인</span>
                <strong>{aggravatingText}</strong>
              </div>
            )}
            {freq && (
              <div className="workspace__heroRow">
                <span>빈도</span>
                <Field qid={freq.qid} value={freq.value} />
              </div>
            )}
            {agg && !aggravatingText && (
              <div className="workspace__heroRow">
                <span>악화 요인 상세</span>
                <Field qid={agg.qid} value={agg.value} />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="workspace__block">
        <h3>기존 통증 모듈 안전패널</h3>
        <p className="workspace__block__hint">
          현재 계산된 flag와 안전 잠금 의미를 그대로 표시합니다 — 새 cutoff나 해석을 추가하지 않습니다.
        </p>
        <LbpSafetyPanel payload={payload} lbpObjectiveMotorDeficit={lbpObjectiveMotorDeficit} />
        <HipSafetyPanel payload={payload} />
        <NeckSafetyPanel payload={payload} />
        <ShoulderSafetyPanel payload={payload} shoulderObjectiveCuffWeakness={shoulderObjectiveCuffWeakness} />
        <KneeSafetyPanel payload={payload} />
        <ElbowSafetyPanel payload={payload} />
        <WristHandSafetyPanel payload={payload} />
        <AnkleFootSafetyPanel payload={payload} />
        <TmjSafetyPanel payload={payload} />
      </section>

      <section className="workspace__block">
        <h3>지금 확인할 것</h3>
        <ExamSuggestionList
          items={items}
          onChangeItem={(next) => setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)))}
        />
      </section>

      <section className="workspace__block">
        <h3>확인 필요 / 서로 맞지 않는 정보</h3>
        <SupportContradictionPanel items={evidence} emptyText="현재 확인된 지지/반증/미확인 항목이 없습니다." />
      </section>

      <section className="workspace__block">
        <h3>상세 응답</h3>
        <div className="doctor__grid">
          {primaryModuleFields(routing.primary_module, r.modules, routing.primary_module_detail).map((f) => (
            <Field key={f.qid} qid={f.qid} value={f.value} />
          ))}
          {primaryModuleFields(routing.primary_module, r.modules, routing.primary_module_detail).length === 0 && (
            <p className="doctor__empty">이번 방문에는 해당 상세 Module이 없습니다.</p>
          )}
        </div>
      </section>

      <PainFinalAssessmentCard value={finalAssessment} onChange={setFinalAssessment} />

      <FollowUpTargetPicker
        options={PAIN_FOLLOW_UP_OPTIONS}
        selected={followUpTargets}
        onChange={setFollowUpTargets}
      />

      <EmrPreviewCard text={emrText} />
    </div>
  )
}
