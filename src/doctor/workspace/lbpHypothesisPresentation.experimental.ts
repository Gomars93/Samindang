/*
 * EXPERIMENTAL / DRAFT ONLY — PRESENTATION PROJECTION, NOT CLINICAL LOGIC.
 *
 * Purpose:
 * - prevent explainable working hypotheses from becoming a card wall;
 * - preserve every hypothesis and its evidence without arbitrarily selecting a
 *   winner among hypotheses with the same support level;
 * - keep the clinician-facing first view compact while allowing progressive
 *   disclosure of the full hypothesis details.
 *
 * This module DOES NOT:
 * - create, remove, upgrade, or downgrade a clinical hypothesis;
 * - change safety, candidate generation, exam priority, treatment, or rehab;
 * - choose a final diagnosis;
 * - use source-code order to break equal-support ties.
 */
import type {
  LbpHypothesisSupportLevel,
  LbpWorkingHypothesisId,
  LbpWorkingHypothesisItem,
  LbpWorkingHypothesisOutput,
} from './lbpWorkingHypothesis.experimental'

export type LbpHypothesisSurfaceBlockKind =
  | 'SINGLE_HYPOTHESIS'
  | 'GROUPED_HYPOTHESES'
  | 'EMPTY_STATE'

export type LbpHypothesisSurfaceRole =
  | 'LEADING'
  | 'PLAUSIBLE_GROUP'
  | 'ADDITIONAL_CONSIDER'
  | 'UNEXPLAINED'

export interface LbpHypothesisSurfaceBlock {
  id: string
  kind: LbpHypothesisSurfaceBlockKind
  role: LbpHypothesisSurfaceRole
  titleKo: string
  subtitleKo: string
  hypothesisIds: LbpWorkingHypothesisId[]
  hypothesisTitlesKo: string[]
  detailState: 'EXPANDED' | 'COLLAPSED'
  ruleStatus: 'DRAFT_EXPERIMENTAL'
}

export interface LbpHypothesisCollapsedGroup {
  id: string
  titleKo: string
  hypothesisIds: LbpWorkingHypothesisId[]
  hypothesisTitlesKo: string[]
  reasonKo: string
  ruleStatus: 'DRAFT_EXPERIMENTAL'
}

export interface LbpHypothesisPresentationOutput {
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  safetyFirst: boolean
  warningBannerKo: string[]
  surfaceBlocks: LbpHypothesisSurfaceBlock[]
  collapsedGroups: LbpHypothesisCollapsedGroup[]
  preservedHypotheses: LbpWorkingHypothesisItem[]
  allHypothesesPreserved: true
  equalSupportTieBrokenByCodeOrder: false
  finalDiagnosisClaimed: false
  clinicianConfirmationRequired: true
}

function groupedBlock(
  id: string,
  role: LbpHypothesisSurfaceRole,
  titleKo: string,
  subtitleKo: string,
  hypotheses: LbpWorkingHypothesisItem[],
  detailState: 'EXPANDED' | 'COLLAPSED',
): LbpHypothesisSurfaceBlock {
  return {
    id,
    kind: hypotheses.length === 1 ? 'SINGLE_HYPOTHESIS' : 'GROUPED_HYPOTHESES',
    role,
    titleKo,
    subtitleKo,
    hypothesisIds: hypotheses.map((item) => item.id),
    hypothesisTitlesKo: hypotheses.map((item) => item.titleKo),
    detailState,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
  }
}

function collapsedGroup(
  id: string,
  titleKo: string,
  hypotheses: LbpWorkingHypothesisItem[],
  reasonKo: string,
): LbpHypothesisCollapsedGroup {
  return {
    id,
    titleKo,
    hypothesisIds: hypotheses.map((item) => item.id),
    hypothesisTitlesKo: hypotheses.map((item) => item.titleKo),
    reasonKo,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
  }
}

function byLevel(
  hypotheses: LbpWorkingHypothesisItem[],
  level: LbpHypothesisSupportLevel,
): LbpWorkingHypothesisItem[] {
  return hypotheses.filter((item) => item.supportLevel === level)
}

function emptyState(titleKo: string, subtitleKo: string): LbpHypothesisSurfaceBlock {
  return {
    id: 'LBP_HYPOTHESIS_EMPTY',
    kind: 'EMPTY_STATE',
    role: 'UNEXPLAINED',
    titleKo,
    subtitleKo,
    hypothesisIds: [],
    hypothesisTitlesKo: [],
    detailState: 'EXPANDED',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
  }
}

/**
 * UI-only projection.
 *
 * Important rule: equal-support hypotheses are grouped together. This layer
 * never selects one equal-support hypothesis as the winner merely because it
 * appeared earlier in the source array.
 */
export function presentLbpWorkingHypotheses(
  output: LbpWorkingHypothesisOutput,
): LbpHypothesisPresentationOutput {
  if (output.safetyContext.routinePathway !== 'AVAILABLE') {
    return {
      ruleStatus: 'DRAFT_EXPERIMENTAL',
      safetyFirst: true,
      warningBannerKo: output.warningsKo,
      surfaceBlocks: [
        emptyState(
          '안전성 재평가가 먼저 필요합니다',
          output.safetyContext.reasonKo,
        ),
      ],
      collapsedGroups: [],
      preservedHypotheses: output.hypotheses,
      allHypothesesPreserved: true,
      equalSupportTieBrokenByCodeOrder: false,
      finalDiagnosisClaimed: false,
      clinicianConfirmationRequired: true,
    }
  }

  const higher = byLevel(output.hypotheses, 'HIGHER_SUPPORT')
  const consider = byLevel(output.hypotheses, 'CONSIDER')
  const lower = byLevel(output.hypotheses, 'LOWER_SUPPORT')
  const insufficient = byLevel(output.hypotheses, 'INSUFFICIENT_DATA')

  const surfaceBlocks: LbpHypothesisSurfaceBlock[] = []
  const collapsedGroups: LbpHypothesisCollapsedGroup[] = []

  if (higher.length === 1) {
    surfaceBlocks.push(
      groupedBlock(
        'LBP_HYPOTHESIS_LEADING',
        'LEADING',
        higher[0].titleKo,
        '현재 자료에서 상대적으로 지지가 높은 working hypothesis입니다.',
        higher,
        'EXPANDED',
      ),
    )

    if (consider.length > 0) {
      surfaceBlocks.push(
        groupedBlock(
          'LBP_HYPOTHESIS_ADDITIONAL_CONSIDER',
          'ADDITIONAL_CONSIDER',
          consider.length === 1 ? '추가로 고려할 수 있음' : `추가로 고려할 수 있음 ${consider.length}개`,
          '현재 계획을 바꿀 수 있는 경우 펼쳐서 근거를 확인합니다.',
          consider,
          'COLLAPSED',
        ),
      )
    }
  } else if (higher.length >= 2) {
    // Multiple equal HIGHER_SUPPORT contributors stay peers. One compact group
    // replaces multiple first-view cards without hiding any member.
    surfaceBlocks.push(
      groupedBlock(
        'LBP_HYPOTHESIS_MULTI_HIGHER',
        'PLAUSIBLE_GROUP',
        `복합 기여 가능성 ${higher.length}개`,
        '한 가지 원인으로 억지로 좁히지 않고, 현재 지지가 높은 기여 요인을 함께 봅니다.',
        higher,
        'EXPANDED',
      ),
    )

    if (consider.length > 0) {
      collapsedGroups.push(
        collapsedGroup(
          'LBP_HYPOTHESIS_CONSIDER_BEHIND_HIGHER',
          `추가 고려 ${consider.length}개`,
          consider,
          '현재 지지가 더 높은 기여 요인이 이미 있어 첫 화면에서는 접어 둡니다. 삭제하거나 배제하지 않습니다.',
        ),
      )
    }
  } else if (consider.length === 1) {
    surfaceBlocks.push(
      groupedBlock(
        'LBP_HYPOTHESIS_SINGLE_CONSIDER',
        'LEADING',
        consider[0].titleKo,
        '현재 자료에서 고려할 수 있으나 아직 확정할 수 없습니다.',
        consider,
        'EXPANDED',
      ),
    )
  } else if (consider.length >= 2) {
    // No arbitrary primary is created when several hypotheses have the same
    // CONSIDER support level.
    surfaceBlocks.push(
      groupedBlock(
        'LBP_HYPOTHESIS_MULTI_CONSIDER',
        'PLAUSIBLE_GROUP',
        `여러 가능성 함께 고려 ${consider.length}개`,
        '현재 자료만으로 한 가설을 우선 확정하지 않고 같은 지위의 가능성을 묶어 표시합니다.',
        consider,
        'EXPANDED',
      ),
    )
  } else {
    surfaceBlocks.push(
      emptyState(
        '현재 자료로 충분히 설명되지 않음',
        '진단명을 억지로 붙이지 않고 경과와 의미 있는 미확인 정보를 기준으로 다시 판단합니다.',
      ),
    )
  }

  if (lower.length > 0) {
    collapsedGroups.push(
      collapsedGroup(
        'LBP_HYPOTHESIS_LOWER_SUPPORT',
        `현재 우선순위 낮음 ${lower.length}개`,
        lower,
        '현재 자료에서 지지가 낮아 첫 화면에서는 접어 두지만 완전히 배제하지 않습니다.',
      ),
    )
  }

  if (insufficient.length > 0) {
    collapsedGroups.push(
      collapsedGroup(
        'LBP_HYPOTHESIS_INSUFFICIENT_DATA',
        `판단 정보 부족 ${insufficient.length}개`,
        insufficient,
        '자료 부족 또는 모순 때문에 우선순위를 정할 수 없어 별도 접힌 영역에 보존합니다.',
      ),
    )
  }

  return {
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    safetyFirst: false,
    warningBannerKo: output.warningsKo,
    surfaceBlocks,
    collapsedGroups,
    preservedHypotheses: output.hypotheses,
    allHypothesesPreserved: true,
    equalSupportTieBrokenByCodeOrder: false,
    finalDiagnosisClaimed: false,
    clinicianConfirmationRequired: true,
  }
}
