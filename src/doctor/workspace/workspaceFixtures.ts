/**
 * Doctor Clinical Workspace synthetic preview scenarios (PR #24 Phase 12).
 *
 * SYNTHETIC / NO-PHI / NOT CLINICAL RULES. Every DoctorPayload here is built
 * through the exact same production builders fixtures.ts uses
 * (buildResponsePayload/buildRoutingPayload/computeFlags/computeSaju) on
 * hand-written Responses -- never a hand-written payload JSON, so a spec
 * change breaks or matches these automatically, same discipline as
 * fixtures.ts. The decision-support data attached to each scenario
 * (examSuggestions/patternCandidates/evidence/clinicianObservations) is
 * illustrative UX fixture data only -- it demonstrates the UI, it is not a
 * clinical inference engine, and none of it is wired into production
 * (DoctorView.tsx passes no `synthetic` prop when rendering real
 * submissions).
 */
import {
  ALL_QUESTIONS,
  buildResponsePayload,
  buildRoutingPayload,
  buildSajuInput,
  computeFlags,
  pruneStaleResponses,
} from '../../spec/coreSpec'
import { computeSaju } from '../../saju'
import type { Responses } from '../../types'
import type { DoctorPayload } from '../types'
import type { WorkspaceSyntheticData } from './DoctorWorkspace'
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { HerbalPatternCandidate } from './patternCandidate'
import type { EvidenceItem } from './supportEngine'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { RehabSuggestion } from './rehabSuggestion'

const emptyResponses = (): Responses => Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))

const BASE_DEFAULTS: Responses = {
  ID_02: '9012',
  MED_USE: 'none',
  HISTORY_01: ['none'],
  ALLERGY_01: 'none',
  SURGERY_01: 'none',
  TEST_01: 'none',
  FREE_01: 'none',
  HERB_APPETITE: 'normal',
  HERB_THERMAL: 'cold_sensitive',
  HERB_THIRST: 'normal',
  HERB_SWEAT: 'normal',
  BIRTH_02: 'solar',
  BIRTH_03: 'o',
  BIRTH_03A: 'exact',
}

let seq = 0

function buildScenarioPayload(patch: Responses): DoctorPayload {
  seq += 1
  const merged: Responses = { ...emptyResponses(), ...BASE_DEFAULTS, ...patch }
  const { responses } = pruneStaleResponses(merged)
  return {
    questionnaire_version: '1.0',
    session_id: `workspace-scenario-${seq}`,
    responses: buildResponsePayload(responses),
    flags: computeFlags(responses),
    routing: buildRoutingPayload(responses),
    myungri_calculation: computeSaju(buildSajuInput(responses)),
    metadata: { session_started_at: null, answers: {} },
  }
}

export type WorkspaceScenario = {
  id: string
  label: string
  kind: 'pain' | 'herbal' | 'mixed'
  payload: DoctorPayload
  synthetic: WorkspaceSyntheticData
}

// ---------- Pain scenarios ----------

const PAIN_1_EXAMS: PhysicalExamSuggestion[] = [
  {
    id: 'p1-rom',
    title: '요추 능동 움직임 반응 검사',
    priority: 'MUST_CHECK',
    reasonFacts: [{ text: '숙일 때 통증 악화(환자 응답)', provenance: 'PATIENT_FACT' }],
    source: 'SUGGESTED',
    result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
  },
  {
    id: 'p1-gait',
    title: '보행 및 보행 내구성 검사',
    priority: 'CONTEXTUAL',
    reasonFacts: [{ text: '기간 3개월 이상(환자 응답)', provenance: 'PATIENT_FACT' }],
    source: 'SUGGESTED',
    result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
  },
]

const PAIN_2_EXAMS: PhysicalExamSuggestion[] = [
  {
    id: 'p2-slr',
    title: 'SLR(하지직거상) 검사',
    priority: 'MUST_CHECK',
    reasonFacts: [
      { text: '다리 저림 증상 보고(환자 응답)', provenance: 'PATIENT_FACT' },
      { text: 'leg_symptom_present = YES(시스템 계산)', provenance: 'DERIVED' },
    ],
    source: 'SUGGESTED',
    result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
  },
  {
    id: 'p2-neuro',
    title: '하지 근절(myotome) 근력 검사',
    priority: 'MUST_CHECK',
    reasonFacts: [{ text: 'lbp_neuro_baseline_required(시스템 계산)', provenance: 'DERIVED' }],
    source: 'SUGGESTED',
    result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
  },
  {
    id: 'p2-slump',
    title: 'Slump 검사',
    priority: 'CONTEXTUAL',
    reasonFacts: [{ text: '신경학적 증상 동반(환자 응답)', provenance: 'PATIENT_FACT' }],
    source: 'SUGGESTED',
    result: { status: 'POSITIVE', laterality: 'RIGHT', note: '우측 재현됨', recordedAt: '2026-01-01T00:00:00.000Z' },
  },
]

const PAIN_3_EXAMS: PhysicalExamSuggestion[] = [
  {
    id: 'p3-faber',
    title: 'FABER 검사',
    priority: 'CONTEXTUAL',
    reasonFacts: [{ text: '고관절/천장관절 연관통 가능성(환자 응답 패턴)', provenance: 'PATIENT_FACT' }],
    source: 'SUGGESTED',
    result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
  },
  {
    id: 'p3-cuff',
    title: '회전근개 근력 검사',
    priority: 'MUST_CHECK',
    reasonFacts: [{ text: '외상 후 팔 들기 저하 의심(환자 응답)', provenance: 'PATIENT_FACT' }],
    source: 'SUGGESTED',
    result: { status: 'UNCLEAR', laterality: 'LEFT', note: '통증으로 정확한 근력 평가 어려움', recordedAt: '2026-01-01T00:00:00.000Z' },
  },
]

const PAIN_3_EVIDENCE: EvidenceItem[] = [
  { id: 'p3-e1', text: '외상 병력 있음(환자 응답)', kind: 'SUPPORT', provenance: 'PATIENT_FACT' },
  { id: 'p3-e2', text: '외상 직후에는 통증이 경미했다고 보고(환자 응답)', kind: 'CONTRADICTION', provenance: 'PATIENT_FACT' },
  { id: 'p3-e3', text: '회전근개 객관적 근력저하 아직 미확정', kind: 'UNKNOWN', provenance: 'OBSERVED' },
]

// Round 3 Phase I: SYNTHETIC-only illustration of the RehabSuggestion
// framework's shape. Not a clinical mapping (see rehabSuggestion.ts header)
// -- production RehabSuggestion[] stays empty until an approved rule
// exists; this example never ships to a real submission.
const PAIN_1_REHAB: RehabSuggestion[] = [
  {
    id: 'p1-rehab-core',
    title: '(예시) 코어 안정화 홈 운동',
    goal: '(예시) 체간 안정성 향상',
    rationale: '(예시) 단순 기계적 요통 소견에서 흔히 고려되는 홈 운동 항목의 표시 형태 예시',
    sourceFacts: [{ text: '단순 기계적 요통 소견(원장 최종 판단)', provenance: 'FINAL_ASSESSMENT' }],
    contraindicationFacts: [],
    source: 'SUGGESTED',
    status: 'SUGGESTED',
    clinicianFinalInstruction: '',
  },
]

export const PAIN_SCENARIO_1: WorkspaceScenario = {
  id: 'pain-1-mechanical-lbp',
  label: 'SYNTHETIC · 단순 기계적 요통',
  kind: 'pain',
  payload: buildScenarioPayload({
    ID_01: '(예시) 김OO',
    ID_03: 'male',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    VISIT_03_SYMPTOM_DURATION: '1_3m',
    VISIT_04_SYMPTOM_IMPACT: 'mild',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    PAIN_01: 'low_back_pelvis',
    PAIN_02: ['aching', 'movement_related'],
    PAIN_04: 'none',
    LBP_01: 'CENTRAL',
    LBP_02: ['NONE'],
    LBP_03: 'NONE',
    LBP_04: ['NONE'],
    LBP_05: ['NONE'],
    LBP_06: 'NO',
    LBP_07: 'NO',
    LBP_08: 'NO',
    LBP_10: 'NO',
    LBP_11: ['NONE'],
    LBP_12: 7,
    LBP_13: 'A_LOT',
    LBP_14: 'A_LOT',
  }),
  synthetic: { examSuggestions: PAIN_1_EXAMS, evidence: [], rehabSuggestions: PAIN_1_REHAB },
}

export const PAIN_SCENARIO_2: WorkspaceScenario = {
  id: 'pain-2-lbp-leg-symptom',
  label: 'SYNTHETIC · 요통 + 다리 증상',
  kind: 'pain',
  payload: buildScenarioPayload({
    ID_01: '(예시) 이OO',
    ID_03: 'female',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    VISIT_03_SYMPTOM_DURATION: '3m_1y',
    VISIT_04_SYMPTOM_IMPACT: 'moderate',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    PAIN_01: 'low_back_pelvis',
    PAIN_02: ['aching', 'movement_related'],
    PAIN_04: 'lower_limb',
    LBP_01: 'BUTTOCK',
    LBP_02: ['NUMBNESS', 'TINGLING'],
    LBP_03: 'RIGHT',
    LBP_04: ['NONE'],
    LBP_05: ['NONE'],
    LBP_06: 'NO',
    LBP_07: 'YES',
    LBP_08: 'NO',
    LBP_10: 'NO',
    LBP_11: ['NONE'],
    LBP_12: 5,
    LBP_13: 'SOMEWHAT',
    LBP_14: 'SOME',
  }),
  synthetic: { examSuggestions: PAIN_2_EXAMS, evidence: [] },
}

export const PAIN_SCENARIO_3: WorkspaceScenario = {
  id: 'pain-3-mixed-uncertain-shoulder',
  label: 'SYNTHETIC · 어깨 통증(불확실/재검 필요)',
  kind: 'pain',
  payload: buildScenarioPayload({
    ID_01: '(예시) 박OO',
    ID_03: 'male',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    VISIT_03_SYMPTOM_DURATION: 'under_1w',
    VISIT_04_SYMPTOM_IMPACT: 'severe',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    PAIN_01: 'neck_shoulder',
    PAIN_02: ['aching', 'movement_related'],
    PAIN_04: 'none',
    NS01: 'SHOULDER_DOMINANT',
    N01: 'NONE',
    N02: ['NONE'],
    N03: 'NONE',
    N06: 'NONE',
    N07: ['NONE'],
    N08: 'NONE',
    N09: ['NONE'],
    N10: 'NO',
    N11: 'NO',
    SH01: 'YES',
    SH02: ['NONE'],
    SH03: 'YES',
    SH04: 'NONE',
    SH05: ['NONE'],
    SH06: 'NO',
    SH07: 'NO',
    SH08: 'NONE',
    SH09: 'NO',
  }),
  synthetic: { examSuggestions: PAIN_3_EXAMS, evidence: PAIN_3_EVIDENCE },
}

// ---------- Herbal scenarios ----------

const HERBAL_1_CANDIDATES: HerbalPatternCandidate[] = [
  {
    id: 'h1-c1',
    displayName: '비기허 예시 (EXAMPLE ONLY — NOT CLINICAL LOGIC)',
    supportingFacts: [
      { text: '식후 더부룩함 보고(환자 응답)', provenance: 'PATIENT_FACT' },
      { text: '오후 피로 심화 보고(환자 응답)', provenance: 'PATIENT_FACT' },
    ],
    contradictingFacts: [{ text: '식욕 정상 범위(환자 응답)', provenance: 'PATIENT_FACT' }],
    unknownChecks: ['설진 미입력', '맥진 미입력'],
    source: 'SUGGESTED',
    status: 'PENDING_REVIEW',
    clinicianNote: '',
  },
]

const HERBAL_1_OBSERVATIONS: ClinicianObservationItem[] = [
  { id: 'h1-o1', category: 'TONGUE', title: '설진', checked: false, value: '', recordedAt: null },
  { id: 'h1-o2', category: 'PULSE', title: '맥진', checked: false, value: '', recordedAt: null },
  { id: 'h1-o3', category: 'ABDOMEN', title: '복진', checked: false, value: '', recordedAt: null },
]

const HERBAL_2_OBSERVATIONS: ClinicianObservationItem[] = [
  { id: 'h2-o1', category: 'TONGUE', title: '설진', checked: true, value: '홍설, 소태', recordedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'h2-o2', category: 'PULSE', title: '맥진', checked: true, value: '삭맥', recordedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'h2-o3', category: 'ABDOMEN', title: '복진', checked: false, value: '', recordedAt: null },
  { id: 'h2-o4', category: 'FOLLOW_UP_QUESTION', title: '야간 발한 빈도', checked: false, value: '', recordedAt: null },
]

const HERBAL_3_EVIDENCE: EvidenceItem[] = [
  { id: 'h3-e1', text: '평소 추위를 많이 탄다고 보고(환자 응답, HERB_THERMAL)', kind: 'SUPPORT', provenance: 'PATIENT_FACT' },
  { id: 'h3-e2', text: '최근 야간 발한/열감 보고(환자 응답)', kind: 'CONTRADICTION', provenance: 'PATIENT_FACT' },
  { id: 'h3-e3', text: '한열 패턴이 상반되어 추가 확인 필요', kind: 'UNKNOWN', provenance: 'OBSERVED' },
]

const HERBAL_3_CANDIDATES: HerbalPatternCandidate[] = [
  {
    id: 'h3-c1',
    displayName: '상열하한 예시 (EXAMPLE ONLY — NOT CLINICAL LOGIC)',
    supportingFacts: [{ text: '야간 발한/열감 보고(환자 응답)', provenance: 'PATIENT_FACT' }],
    contradictingFacts: [{ text: '평소 추위를 많이 탐(환자 응답)', provenance: 'PATIENT_FACT' }],
    unknownChecks: ['복진 미입력'],
    source: 'SUGGESTED',
    status: 'PENDING_REVIEW',
    clinicianNote: '',
  },
]

export const HERBAL_SCENARIO_1: WorkspaceScenario = {
  id: 'herbal-1-gi-fatigue',
  label: 'SYNTHETIC · 소화·피로 중심',
  kind: 'herbal',
  payload: buildScenarioPayload({
    ID_01: '(예시) 최OO',
    ID_03: 'female',
    BIRTH_01: '19850320',
    VISIT_01: 'constitution',
    VISIT_02_CONST: 'constitution',
    SECONDARY_01: ['fatigue'],
    SAFETY_01: ['none'],
    SEC_FATIGUE_01: ['morning_fatigue', 'afternoon_slump'],
    CONST_ENERGY: 'tired_recovers',
    CONST_SLEEP: 'frequent_waking',
    CONST_DIGESTION: 'occasional',
    CONST_BOWEL: 'regular',
    HERB_APPETITE: 'normal',
    HERB_THERMAL: 'cold_sensitive',
  }),
  synthetic: { patternCandidates: HERBAL_1_CANDIDATES, clinicianObservations: HERBAL_1_OBSERVATIONS },
}

export const HERBAL_SCENARIO_2: WorkspaceScenario = {
  id: 'herbal-2-sleep-heat-sweat',
  label: 'SYNTHETIC · 수면·열감/발한 중심',
  kind: 'herbal',
  payload: buildScenarioPayload({
    ID_01: '(예시) 정OO',
    ID_03: 'female',
    BIRTH_01: '19700612',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'sleep',
    VISIT_03_SYMPTOM_DURATION: '1_3m',
    VISIT_04_SYMPTOM_IMPACT: 'moderate',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    SLEEP_01: ['night_awakenings', 'early_waking'],
    SLEEP_02: '5_plus_days',
    SLEEP_03: ['heat_sweat'],
    HERB_THERMAL: 'heat_sensitive',
    HERB_SWEAT: 'night_sweat',
    WOMEN_SAFETY_01: ['none'],
  }),
  synthetic: { patternCandidates: [], clinicianObservations: HERBAL_2_OBSERVATIONS },
}

export const HERBAL_SCENARIO_3: WorkspaceScenario = {
  id: 'herbal-3-mixed-contradictory',
  label: 'SYNTHETIC · 혼합/모순 소견',
  kind: 'herbal',
  payload: buildScenarioPayload({
    ID_01: '(예시) 한OO',
    ID_03: 'male',
    BIRTH_01: '19650505',
    VISIT_01: 'constitution',
    VISIT_02_CONST: 'constitution',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    CONST_ENERGY: 'tired_recovers',
    CONST_SLEEP: 'frequent_waking',
    CONST_DIGESTION: 'occasional',
    CONST_BOWEL: 'regular',
    HERB_APPETITE: 'normal',
    HERB_THERMAL: 'cold_sensitive',
    HERB_SWEAT: 'night_sweat',
  }),
  synthetic: { patternCandidates: HERBAL_3_CANDIDATES, evidence: HERBAL_3_EVIDENCE, clinicianObservations: [] },
}

// ---------- Mixed scenario ----------

export const MIXED_SCENARIO_1: WorkspaceScenario = {
  id: 'mixed-1-pain-plus-herbal-addon',
  label: 'SYNTHETIC · 요통 + 한약 추가문진',
  kind: 'mixed',
  payload: buildScenarioPayload({
    ID_01: '(예시) 서OO',
    ID_03: 'female',
    BIRTH_01: '19900101',
    VISIT_01: 'symptom',
    VISIT_02_SYMPTOM_MAIN: 'pain',
    VISIT_03_SYMPTOM_DURATION: '3m_1y',
    VISIT_04_SYMPTOM_IMPACT: 'moderate',
    SECONDARY_01: ['none'],
    SAFETY_01: ['none'],
    PAIN_01: 'low_back_pelvis',
    PAIN_02: ['aching'],
    PAIN_04: 'none',
    LBP_01: 'CENTRAL',
    LBP_02: ['NONE'],
    LBP_03: 'NONE',
    LBP_04: ['NONE'],
    LBP_05: ['NONE'],
    LBP_06: 'NO',
    LBP_07: 'NO',
    LBP_08: 'NO',
    LBP_10: 'NO',
    LBP_11: ['NONE'],
    LBP_12: 6,
    LBP_13: 'SOMEWHAT',
    LBP_14: 'SOME',
    HERBAL_ADDON_ACTIVE: 'yes',
    CONST_ENERGY: 'tired_recovers',
    CONST_SLEEP: 'frequent_waking',
    CONST_DIGESTION: 'occasional',
    CONST_BOWEL: 'regular',
    HERB_APPETITE: 'reduced',
    HERB_THERMAL: 'cold_sensitive',
  }),
  synthetic: {
    examSuggestions: [PAIN_1_EXAMS[0]],
    patternCandidates: [HERBAL_1_CANDIDATES[0]],
    clinicianObservations: HERBAL_1_OBSERVATIONS,
  },
}

export const WORKSPACE_SCENARIOS: WorkspaceScenario[] = [
  PAIN_SCENARIO_1,
  PAIN_SCENARIO_2,
  PAIN_SCENARIO_3,
  HERBAL_SCENARIO_1,
  HERBAL_SCENARIO_2,
  HERBAL_SCENARIO_3,
  MIXED_SCENARIO_1,
]
