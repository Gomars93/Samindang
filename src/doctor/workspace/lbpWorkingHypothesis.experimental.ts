/*
 * EXPERIMENTAL / DRAFT ONLY — NOT PRODUCTION CLINICAL LOGIC.
 *
 * Explainable LBP working-hypothesis experiment.
 *
 * Original Clinical OS intent:
 * - no forced final pathoanatomic diagnosis;
 * - multiple contributors may coexist;
 * - show support, contradiction, meaningful unknowns, and management meaning;
 * - safety stays upstream;
 * - no treatment/rehab selection in this module.
 */
import {
  evaluateLbpActionAdaptiveExperimentV02,
  type LbpActionContextV02,
} from './lbpActionAdaptiveEngine.v02.experimental'

export type LbpWorkingHypothesisId =
  | 'MECHANICAL_LUMBAR_CONTRIBUTION'
  | 'RADICULAR_INVOLVEMENT'
  | 'WALKING_RELATED_NEURAL_PATTERN'
  | 'HIP_CONTRIBUTION'
  | 'SIJ_CONTRIBUTION'

export type LbpHypothesisSupportLevel =
  | 'HIGHER_SUPPORT'
  | 'CONSIDER'
  | 'LOWER_SUPPORT'
  | 'INSUFFICIENT_DATA'

export type LbpHypothesisInterpretationState =
  | 'SAFETY_FIRST'
  | 'SINGLE_LEADING_PATTERN'
  | 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS'
  | 'PARTIALLY_EXPLAINED'
  | 'INSUFFICIENTLY_EXPLAINED'

export interface LbpWorkingHypothesisItem {
  id: LbpWorkingHypothesisId
  titleKo: string
  supportLevel: LbpHypothesisSupportLevel
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  supportsKo: string[]
  contradictionsKo: string[]
  meaningfulUnknownsKo: string[]
  managementMeaningKo: string[]
  whyKo: string
  finalDiagnosisClaimed: false
}

export interface LbpWorkingHypothesisOutput {
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  interpretationState: LbpHypothesisInterpretationState
  primaryHypothesisId: LbpWorkingHypothesisId | null
  hypotheses: LbpWorkingHypothesisItem[]
  globalMeaningfulUnknownsKo: string[]
  warningsKo: string[]
  safetyContext: {
    routinePathway: 'AVAILABLE' | 'SAFETY_REVIEW_FIRST' | 'SAFETY_REFRESH_FIRST'
    reasonKo: string
  }
  finalDiagnosisClaimed: false
  clinicianConfirmationRequired: true
}

const UNKNOWN_STATES = new Set(['NOT_ASSESSED', 'NOT_PERFORMED', 'LIMITED', 'UNCLEAR'])

function isUnknownState(value: string): boolean {
  return UNKNOWN_STATES.has(value)
}

function makeItem(
  id: LbpWorkingHypothesisId,
  titleKo: string,
  supportLevel: LbpHypothesisSupportLevel,
  supportsKo: string[],
  contradictionsKo: string[],
  meaningfulUnknownsKo: string[],
  managementMeaningKo: string[],
): LbpWorkingHypothesisItem {
  const supports = supportsKo.filter(Boolean)
  const contradictions = contradictionsKo.filter(Boolean)
  const unknowns = meaningfulUnknownsKo.filter(Boolean)

  const lead =
    supportLevel === 'HIGHER_SUPPORT'
      ? '현재 자료에서 상대적으로 지지가 높습니다.'
      : supportLevel === 'CONSIDER'
        ? '현재 자료에서 고려할 수 있으나 아직 확정할 수 없습니다.'
        : supportLevel === 'LOWER_SUPPORT'
          ? '현재 자료에서는 우선순위가 낮아졌지만 완전히 배제되지는 않습니다.'
          : '현재 자료만으로 판단하기 어렵습니다.'

  return {
    id,
    titleKo,
    supportLevel,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    supportsKo: supports,
    contradictionsKo: contradictions,
    meaningfulUnknownsKo: unknowns,
    managementMeaningKo,
    whyKo: [
      lead,
      supports.length ? `지지: ${supports.join(', ')}` : '',
      contradictions.length ? `약화/반대: ${contradictions.join(', ')}` : '',
      unknowns.length ? `미확인: ${unknowns.join(', ')}` : '',
    ].filter(Boolean).join(' '),
    finalDiagnosisClaimed: false,
  }
}

function mechanicalLumbar(context: LbpActionContextV02): LbpWorkingHypothesisItem | null {
  const meaningfulLumbarResponse = [
    'CONCORDANT_SYMPTOM_REPRODUCTION',
    'IMPROVES',
    'CENTRALIZES',
    'PERIPHERALIZES',
  ].includes(context.lumbarMovement)

  // Target-function reproduction alone is NOT lumbar-source evidence.
  if (!meaningfulLumbarResponse) return null

  const supports: string[] = []
  if (context.lumbarMovement === 'CONCORDANT_SYMPTOM_REPRODUCTION') {
    supports.push('허리 움직임에서 익숙한 증상이 재현됨')
  }
  if (context.lumbarMovement === 'IMPROVES') {
    supports.push('특정 허리 움직임에서 증상이 감소함')
  }
  if (context.lumbarMovement === 'CENTRALIZES') {
    supports.push('허리 움직임에 따라 하지증상이 몸쪽으로 감소함')
  }
  if (context.lumbarMovement === 'PERIPHERALIZES') {
    supports.push('허리 움직임에 따라 하지증상이 더 원위부로 증가함')
  }

  return makeItem(
    'MECHANICAL_LUMBAR_CONTRIBUTION',
    '허리 움직임과 연관된 기계적 요통 패턴',
    'HIGHER_SUPPORT',
    supports,
    [],
    [],
    [
      '허리 움직임 반응과 목표 기능을 함께 경과 추적에 활용할 수 있습니다.',
      '이 가설은 특정 조직 손상이나 영상 병변을 확정하지 않습니다.',
    ],
  )
}

function radicular(context: LbpActionContextV02): LbpWorkingHypothesisItem | null {
  const leg = context.legSymptoms === 'PRESENT'
  const cue = context.radicularCue === 'PRESENT'
  const objectiveAbnormal = context.objectiveNeuro === 'ABNORMAL_NON_PROGRESSIVE'
  const neurodynamicConcordant = context.neurodynamic === 'CONCORDANT_LEG_SYMPTOM'

  if (!leg && !cue && !objectiveAbnormal && !neurodynamicConcordant) return null

  const supports: string[] = []
  const contradictions: string[] = []
  const unknowns: string[] = []

  if (leg) supports.push('하지로 내려가는 통증·저림 등 관련 증상이 있음')
  if (cue) supports.push('신경근성 관여를 고려하게 하는 단서가 있음')
  if (objectiveAbnormal) supports.push('객관적 하지 신경학적 이상이 확인됨')
  if (neurodynamicConcordant) supports.push('신경가동성 검사에서 익숙한 하지증상이 재현됨')

  if (context.legSymptoms === 'ABSENT' && cue) {
    contradictions.push('하지증상 없음 기록과 신경근성 단서가 서로 모순됨')
  }
  if (context.objectiveNeuro === 'NORMAL') {
    contradictions.push('현재 객관적 신경학적 이상은 확인되지 않음')
  }
  if (context.neurodynamic === 'NEGATIVE') {
    contradictions.push('신경가동성 검사에서 익숙한 하지증상이 재현되지 않음')
  }

  if (context.legSymptoms === 'UNCERTAIN') unknowns.push('하지증상의 실제 존재와 분포')
  if (isUnknownState(context.objectiveNeuro)) unknowns.push('객관적 근력·감각·반사 baseline')
  if (isUnknownState(context.neurodynamic)) unknowns.push('신경가동성 검사 반응')

  let level: LbpHypothesisSupportLevel = 'CONSIDER'
  if (leg && (objectiveAbnormal || neurodynamicConcordant)) level = 'HIGHER_SUPPORT'
  if (!leg && cue) level = 'INSUFFICIENT_DATA'
  if (leg && !cue && context.objectiveNeuro === 'NORMAL' && context.neurodynamic === 'NEGATIVE') {
    level = 'LOWER_SUPPORT'
  }

  return makeItem(
    'RADICULAR_INVOLVEMENT',
    '신경근성 증상 관여 가능성',
    level,
    supports,
    contradictions,
    unknowns,
    [
      '객관적 신경학적 baseline과 하지증상 변화를 추적할 필요가 있는지 판단하는 데 사용합니다.',
      'SLR/Slump 한 검사만으로 디스크나 특정 병변을 확정하지 않습니다.',
    ],
  )
}

function walkingRelatedNeural(context: LbpActionContextV02): LbpWorkingHypothesisItem | null {
  if (context.walkingStandingLegPattern !== 'PRESENT') return null

  const supports = ['걷기·기립과 연관되어 하지증상이 나타나는 패턴이 있음']
  const contradictions: string[] = []
  const unknowns: string[] = []

  if (context.walkingTolerance === 'KNOWN') supports.push('실제 보행 가능시간·거리 baseline이 확보됨')
  else unknowns.push('실제 보행 가능시간·거리')

  if (context.legSymptoms === 'ABSENT') {
    contradictions.push('하지증상 없음 기록과 보행-기립 하지증상 pattern이 서로 모순됨')
  }
  if (isUnknownState(context.objectiveNeuro)) unknowns.push('객관적 하지 신경학적 baseline')

  const level: LbpHypothesisSupportLevel =
    context.legSymptoms === 'PRESENT' && context.walkingTolerance === 'KNOWN'
      ? 'HIGHER_SUPPORT'
      : context.legSymptoms === 'ABSENT'
        ? 'INSUFFICIENT_DATA'
        : 'CONSIDER'

  return makeItem(
    'WALKING_RELATED_NEURAL_PATTERN',
    '보행·기립 연관 신경성 하지증상 패턴',
    level,
    supports,
    contradictions,
    unknowns,
    [
      '보행 허용량을 기능 outcome으로 추적할 가치가 있습니다.',
      '이 패턴만으로 척추관 협착증을 확정하거나 영상검사를 자동 요구하지 않습니다.',
    ],
  )
}

function contribution(
  kind: 'HIP' | 'SIJ',
  cue: 'PRESENT' | 'ABSENT' | 'UNCERTAIN',
  screen: LbpActionContextV02['hipScreen'],
): LbpWorkingHypothesisItem | null {
  if (cue === 'ABSENT' && screen !== 'CONTRIBUTORY') return null

  const hip = kind === 'HIP'
  const supports: string[] = []
  const contradictions: string[] = []
  const unknowns: string[] = []

  if (cue === 'PRESENT') supports.push(hip ? '고관절 기여를 의심하게 하는 선행 단서가 있음' : '천장관절 기여를 의심하게 하는 선행 단서가 있음')
  if (screen === 'CONTRIBUTORY') supports.push(hip ? '고관절 선별에서 익숙한 증상·기능과의 관련성이 확인됨' : '천장관절 선별에서 익숙한 증상·기능과의 관련성이 확인됨')
  if (screen === 'NON_CONTRIBUTORY') contradictions.push(hip ? '현재 고관절 선별에서는 의미 있는 기여가 확인되지 않음' : '현재 천장관절 선별에서는 의미 있는 기여가 확인되지 않음')
  if (cue === 'UNCERTAIN') unknowns.push(hip ? '고관절 기여 단서의 실제 존재 여부' : '천장관절 기여 단서의 실제 존재 여부')
  if (isUnknownState(screen)) unknowns.push(hip ? '고관절 선별에서 익숙한 증상·목표기능과의 연결' : '천장관절 선별에서 익숙한 증상·목표기능과의 연결')

  let level: LbpHypothesisSupportLevel = 'CONSIDER'
  if (screen === 'CONTRIBUTORY') level = 'HIGHER_SUPPORT'
  if (screen === 'NON_CONTRIBUTORY') level = 'LOWER_SUPPORT'
  if (cue === 'UNCERTAIN' && isUnknownState(screen)) level = 'INSUFFICIENT_DATA'

  return makeItem(
    hip ? 'HIP_CONTRIBUTION' : 'SIJ_CONTRIBUTION',
    hip ? '고관절의 증상·기능 기여 가능성' : '천장관절의 증상·기능 기여 가능성',
    level,
    supports,
    contradictions,
    unknowns,
    [
      hip
        ? '고관절을 별도 치료·재활 타깃으로 포함할지 임상의가 판단하는 근거가 됩니다.'
        : '천장관절을 별도 치료·재활 타깃으로 포함할지 임상의가 판단하는 근거가 됩니다.',
      `${hip ? '고관절' : '천장관절'} 선별 하나만으로 최종 진단을 확정하지 않습니다.`,
    ],
  )
}

function interpret(
  routinePathway: 'AVAILABLE' | 'SAFETY_REVIEW_FIRST' | 'SAFETY_REFRESH_FIRST',
  hypotheses: LbpWorkingHypothesisItem[],
  warnings: string[],
): { state: LbpHypothesisInterpretationState; primary: LbpWorkingHypothesisId | null } {
  if (routinePathway !== 'AVAILABLE') return { state: 'SAFETY_FIRST', primary: null }

  const higher = hypotheses.filter((h) => h.supportLevel === 'HIGHER_SUPPORT')
  const consider = hypotheses.filter((h) => h.supportLevel === 'CONSIDER')
  const usable = hypotheses.filter((h) => h.supportLevel === 'HIGHER_SUPPORT' || h.supportLevel === 'CONSIDER')

  if (warnings.length > 0 && higher.length === 0) return { state: 'INSUFFICIENTLY_EXPLAINED', primary: null }
  if (higher.length >= 2) return { state: 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS', primary: null }
  if (higher.length === 1 && usable.length === 1) return { state: 'SINGLE_LEADING_PATTERN', primary: higher[0].id }
  if (higher.length === 1 && consider.length > 0) return { state: 'PARTIALLY_EXPLAINED', primary: higher[0].id }
  if (higher.length === 0 && consider.length >= 2) return { state: 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS', primary: null }
  if (higher.length === 0 && consider.length === 1) return { state: 'PARTIALLY_EXPLAINED', primary: null }
  return { state: 'INSUFFICIENTLY_EXPLAINED', primary: null }
}

function globalUnknowns(context: LbpActionContextV02): string[] {
  const values: string[] = []
  if (!context.targetFunctionAvailable) values.push('환자가 가장 회복하고 싶은 목표 기능')
  if (context.legSymptoms === 'UNCERTAIN') values.push('하지증상 존재 여부와 분포')
  if (context.walkingStandingLegPattern === 'PRESENT' && context.walkingTolerance !== 'KNOWN') values.push('실제 보행 허용량')
  return [...new Set(values)]
}

export function evaluateLbpWorkingHypothesisExperiment(
  context: LbpActionContextV02,
): LbpWorkingHypothesisOutput {
  const action = evaluateLbpActionAdaptiveExperimentV02(context)
  const warningsKo = [
    ...action.invariantWarningsKo,
    ...action.freshnessWarningsKo,
    ...action.consistencyWarningsKo,
  ].filter((value, index, values) => values.indexOf(value) === index)

  if (action.routinePathway !== 'AVAILABLE') {
    return {
      ruleStatus: 'DRAFT_EXPERIMENTAL',
      interpretationState: 'SAFETY_FIRST',
      primaryHypothesisId: null,
      hypotheses: [],
      globalMeaningfulUnknownsKo: globalUnknowns(context),
      warningsKo,
      safetyContext: {
        routinePathway: action.routinePathway,
        reasonKo: action.routinePathway === 'SAFETY_REFRESH_FIRST'
          ? '악화 또는 새로운 신경학적 변화로 routine working hypothesis보다 안전성 재평가가 먼저입니다.'
          : '질환 안전성 검토가 완료되기 전에는 routine working hypothesis를 우선 확정하지 않습니다.',
      },
      finalDiagnosisClaimed: false,
      clinicianConfirmationRequired: true,
    }
  }

  const hypotheses = [
    mechanicalLumbar(context),
    radicular(context),
    walkingRelatedNeural(context),
    contribution('HIP', context.hipContributionCue, context.hipScreen),
    contribution('SIJ', context.sijContributionCue, context.sijScreen),
  ].filter((value): value is LbpWorkingHypothesisItem => value !== null)

  const interpreted = interpret(action.routinePathway, hypotheses, warningsKo)

  return {
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    interpretationState: interpreted.state,
    primaryHypothesisId: interpreted.primary,
    hypotheses,
    globalMeaningfulUnknownsKo: globalUnknowns(context),
    warningsKo,
    safetyContext: {
      routinePathway: action.routinePathway,
      reasonKo: '현재 질환 안전성 경로가 routine working hypothesis 검토를 허용합니다.',
    },
    finalDiagnosisClaimed: false,
    clinicianConfirmationRequired: true,
  }
}
