/**
 * LBP Exercise Library — canonical catalog (LBP v1 Batch 2, G6).
 *
 * Ported verbatim (structure and every field byte-identical) from
 * `lbpExerciseLibrary.v01.experimental.ts` on
 * `origin/claude/feat-lbp-action-adaptive-engine-prototype` (head `b099417`)
 * — see `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §2.2/§3 and
 * `docs/LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md` (Opus
 * bounded validation raised no findings against this file — the catalog
 * itself, unlike Eligibility, needed no RF-* fix). The `.experimental`
 * suffix is dropped because this is now the v1 production canonical ID
 * source (architecture doc §2.2's "운동 데이터" row) — every id below is
 * kept byte-identical to the research branch on purpose, since
 * `lbpExerciseCoreMetadata.ts`/`lbpExerciseEligibility.ts` and this file's
 * own tests all key off these exact strings.
 *
 * Source authority:
 *   `02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx`
 *   dated 2026-08-23.
 *
 * The source narrative says "약 40개", while the actual table explicitly lists
 * 57 exercise labels across 13 domains. This catalog preserves every explicitly
 * listed label instead of forcing the inventory to the approximate narrative count.
 *
 * IMPORTANT:
 * - No patient -> exercise mapping lives here.
 * - No diagnosis -> exercise mapping lives here.
 * - Missing item-level fields are intentionally null; never infer them here.
 * - `LBP_TRUNK_03 = Bird-dog` is preserved because it is the sole explicit EX_ID
 *   example in the source document.
 * - All other IDs are migration identifiers only; they do not imply ranking.
 * - Only the Core-20 subset (`lbpExerciseCoreMetadata.ts`) is ever surfaced to
 *   a recommendation — the remaining 57-20=37 catalog rows exist for ID
 *   stability/reference only and are never ranked (architecture doc §3
 *   "카탈로그 57: 데이터로 포팅, UI 노출 없음").
 */

export type LbpExerciseDomain =
  'ACTIVITY_AEROBIC' | 'LUMBAR_MOBILITY' | 'DIRECTIONAL_RESPONSE' | 'HIP_MOBILITY' | 'DEEP_TRUNK_ACTIVATION' | 'TRUNK_CONTROL' | 'TRUNK_ENDURANCE' | 'HIP_STRENGTH' | 'FUNCTIONAL_STRENGTH' | 'LOAD_CAPACITY' | 'NEURAL_MOBILITY' | 'GRADED_EXPOSURE' | 'MIND_BODY_REGULATION'

export type LbpExerciseSourceDetail =
  | 'EXPLICIT_NAME_ONLY'
  | 'EXPLICIT_OBJECT_EXAMPLE'

export type LbpExerciseTargetFunction =
  | 'FLEXION'
  | 'EXTENSION'
  | 'SITTING'
  | 'STANDING'
  | 'WALKING'
  | 'SIT_TO_STAND'
  | 'DRESSING'
  | 'LIFTING'
  | 'SLEEP'
  | 'WORK'
  | 'CUSTOM'

export type LbpExerciseCatalogItem = {
  id: string
  canonicalName: string
  /** Literal labels retained from the source table/object example. */
  sourceLabels: readonly string[]
  domain: LbpExerciseDomain
  sourceDetail: LbpExerciseSourceDetail
  /** Null means the source did not provide an item-level value. */
  level: number | null
  startingDoseKo: string | null
  progressionKo: string | null
  regressionKo: string | null
  targetFunctions: readonly LbpExerciseTargetFunction[] | null
  stopReviewKo: readonly string[] | null
  videoSpecKo: string | null
}

export const LBP_EXERCISE_LIBRARY_SOURCE = {
  sourceDocument: '02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx',
  sourceVersion: 'v0.2',
  sourceDate: '2026-08-23',
  narrativeApproximateCountKo: '약 40개',
  explicitDomainCount: 13,
  explicitExerciseCount: 57,
  migrationStatus: 'CATALOG_ONLY_NO_RECOMMENDER' as const,
} as const

export const LBP_EXERCISE_DOMAIN_META: Record<
  LbpExerciseDomain,
  { label: string; purposeKo: string }
> = {
  ACTIVITY_AEROBIC: { label: 'Activity/Aerobic', purposeKo: '활동유지·유산소·재발예방' },
  LUMBAR_MOBILITY: { label: 'Lumbar mobility', purposeKo: '편안한 움직임 탐색' },
  DIRECTIONAL_RESPONSE: { label: 'Directional response', purposeKo: '증상반응 기반 조건부' },
  HIP_MOBILITY: { label: 'Hip mobility', purposeKo: '인접관절 mobility' },
  DEEP_TRUNK_ACTIVATION: { label: 'Deep trunk activation', purposeKo: '저부하 motor control' },
  TRUNK_CONTROL: { label: 'Trunk control', purposeKo: 'movement control' },
  TRUNK_ENDURANCE: { label: 'Trunk endurance', purposeKo: '지구력' },
  HIP_STRENGTH: { label: 'Hip strength', purposeKo: '골반/하지 capacity' },
  FUNCTIONAL_STRENGTH: { label: 'Functional strength', purposeKo: '일상부하' },
  LOAD_CAPACITY: { label: 'Load capacity', purposeKo: '업무·운동 복귀' },
  NEURAL_MOBILITY: { label: 'Neural mobility', purposeKo: '선택적 하지증상 환자' },
  GRADED_EXPOSURE: { label: 'Graded exposure', purposeKo: '회피·기능복귀' },
  MIND_BODY_REGULATION: { label: 'Mind-body/regulation', purposeKo: '만성통증·전신운동' },
}

function nameOnly(
  id: string,
  canonicalName: string,
  domain: LbpExerciseDomain,
  sourceLabels: readonly string[] = [canonicalName],
): LbpExerciseCatalogItem {
  return {
    id,
    canonicalName,
    sourceLabels,
    domain,
    sourceDetail: 'EXPLICIT_NAME_ONLY',
    level: null,
    startingDoseKo: null,
    progressionKo: null,
    regressionKo: null,
    targetFunctions: null,
    stopReviewKo: null,
    videoSpecKo: null,
  }
}

export const LBP_EXERCISE_LIBRARY: readonly LbpExerciseCatalogItem[] = [
  // Activity/Aerobic
  nameOnly('LBP_ACT_01', '걷기 5~10분', 'ACTIVITY_AEROBIC'),
  nameOnly('LBP_ACT_02', 'interval walking', 'ACTIVITY_AEROBIC'),
  nameOnly('LBP_ACT_03', '20~30분 걷기', 'ACTIVITY_AEROBIC'),
  nameOnly('LBP_ACT_04', '실내 자전거', 'ACTIVITY_AEROBIC'),

  // Lumbar mobility
  nameOnly('LBP_LUMBAR_01', 'pelvic tilt', 'LUMBAR_MOBILITY'),
  nameOnly('LBP_LUMBAR_02', 'cat-camel', 'LUMBAR_MOBILITY'),
  nameOnly('LBP_LUMBAR_03', 'lumbar rotation', 'LUMBAR_MOBILITY'),
  nameOnly('LBP_LUMBAR_04', 'knee-to-chest', 'LUMBAR_MOBILITY'),
  nameOnly('LBP_LUMBAR_05', 'standing extension', 'LUMBAR_MOBILITY'),

  // Directional response
  nameOnly('LBP_DIR_01', 'prone lying', 'DIRECTIONAL_RESPONSE'),
  nameOnly('LBP_DIR_02', 'prone-on-elbows', 'DIRECTIONAL_RESPONSE'),
  nameOnly('LBP_DIR_03', 'repeated extension', 'DIRECTIONAL_RESPONSE'),
  nameOnly('LBP_DIR_04', 'flexion in lying/sitting', 'DIRECTIONAL_RESPONSE'),

  // Hip mobility
  nameOnly('LBP_HIP_MOB_01', 'hip flexor', 'HIP_MOBILITY'),
  nameOnly('LBP_HIP_MOB_02', 'hamstring', 'HIP_MOBILITY'),
  nameOnly('LBP_HIP_MOB_03', 'hip rotation', 'HIP_MOBILITY'),
  nameOnly('LBP_HIP_MOB_04', 'glute/piriformis mobility', 'HIP_MOBILITY'),

  // Deep trunk activation
  nameOnly('LBP_DEEP_TRUNK_01', 'abdominal brace', 'DEEP_TRUNK_ACTIVATION'),
  nameOnly('LBP_DEEP_TRUNK_02', 'TrA awareness', 'DEEP_TRUNK_ACTIVATION'),
  nameOnly('LBP_DEEP_TRUNK_03', 'heel slide', 'DEEP_TRUNK_ACTIVATION'),
  nameOnly('LBP_DEEP_TRUNK_04', 'bent-knee fallout', 'DEEP_TRUNK_ACTIVATION'),
  nameOnly('LBP_DEEP_TRUNK_05', 'multifidus awareness', 'DEEP_TRUNK_ACTIVATION'),

  // Trunk control
  nameOnly('LBP_TRUNK_01', 'dead-bug regression', 'TRUNK_CONTROL'),
  nameOnly('LBP_TRUNK_02', 'dead bug', 'TRUNK_CONTROL'),
  nameOnly('LBP_TRUNK_04', 'quadruped arm', 'TRUNK_CONTROL'),
  nameOnly('LBP_TRUNK_05', 'quadruped leg', 'TRUNK_CONTROL'),
  {
    ...nameOnly('LBP_TRUNK_03', 'Bird-dog', 'TRUNK_CONTROL', [
      'bird-dog progression',
      'Bird-dog Level 2',
    ]),
    sourceDetail: 'EXPLICIT_OBJECT_EXAMPLE',
    level: 2,
    startingDoseKo: '예: 5회 × 2세트 - 환자상태 따라 수정',
    progressionKo: '반복수/hold/부하 증가',
    regressionKo: '팔만/다리만/지지면 확대',
    targetFunctions: ['LIFTING', 'STANDING', 'WORK'],
    stopReviewKo: ['새 신경증상', '뚜렷한 distal symptom 증가', '견디기 어려운 악화'],
    videoSpecKo: '20~40초, 한 운동 한 영상',
  },

  // Trunk endurance
  nameOnly('LBP_TRUNK_END_01', 'bridge', 'TRUNK_ENDURANCE'),
  nameOnly('LBP_TRUNK_END_02', 'bridge progression', 'TRUNK_ENDURANCE'),
  nameOnly('LBP_TRUNK_END_03', 'side-bridge regression', 'TRUNK_ENDURANCE'),
  nameOnly('LBP_TRUNK_END_04', 'side bridge', 'TRUNK_ENDURANCE'),
  nameOnly('LBP_TRUNK_END_05', 'modified curl-up', 'TRUNK_ENDURANCE'),

  // Hip strength
  nameOnly('LBP_HIP_STR_01', 'clamshell', 'HIP_STRENGTH'),
  nameOnly('LBP_HIP_STR_02', 'side-lying abduction', 'HIP_STRENGTH'),
  nameOnly('LBP_HIP_STR_03', 'standing hip abduction', 'HIP_STRENGTH'),
  nameOnly('LBP_HIP_STR_04', 'lateral band walk', 'HIP_STRENGTH'),
  nameOnly('LBP_HIP_STR_05', 'hip extension', 'HIP_STRENGTH'),

  // Functional strength
  nameOnly('LBP_FUNC_01', 'sit-to-stand', 'FUNCTIONAL_STRENGTH'),
  nameOnly('LBP_FUNC_02', 'squat', 'FUNCTIONAL_STRENGTH'),
  nameOnly('LBP_FUNC_03', 'split squat', 'FUNCTIONAL_STRENGTH'),
  nameOnly('LBP_FUNC_04', 'step-up', 'FUNCTIONAL_STRENGTH'),
  nameOnly('LBP_FUNC_05', 'hip hinge', 'FUNCTIONAL_STRENGTH'),

  // Load capacity
  nameOnly('LBP_LOAD_01', 'loaded squat', 'LOAD_CAPACITY'),
  nameOnly('LBP_LOAD_02', 'deadlift pattern', 'LOAD_CAPACITY'),
  nameOnly('LBP_LOAD_03', 'suitcase carry', 'LOAD_CAPACITY'),
  nameOnly('LBP_LOAD_04', 'bilateral carry', 'LOAD_CAPACITY'),
  nameOnly('LBP_LOAD_05', 'box lift', 'LOAD_CAPACITY'),

  // Neural mobility
  nameOnly('LBP_NEURAL_01', 'sciatic slider', 'NEURAL_MOBILITY'),
  nameOnly('LBP_NEURAL_02', '분지별 slider', 'NEURAL_MOBILITY'),
  nameOnly('LBP_NEURAL_03', 'femoral slider', 'NEURAL_MOBILITY'),

  // Graded exposure
  nameOnly('LBP_EXPOSURE_01', '숙이기', 'GRADED_EXPOSURE'),
  nameOnly('LBP_EXPOSURE_02', 'lifting', 'GRADED_EXPOSURE'),
  nameOnly('LBP_EXPOSURE_03', 'prolonged sitting', 'GRADED_EXPOSURE'),
  nameOnly('LBP_EXPOSURE_04', 'walking 단계노출', 'GRADED_EXPOSURE'),

  // Mind-body/regulation
  nameOnly('LBP_REG_01', '호흡·이완', 'MIND_BODY_REGULATION'),
  nameOnly('LBP_REG_02', 'yoga 기반 mobility', 'MIND_BODY_REGULATION'),
  nameOnly('LBP_REG_03', 'Tai Chi 기반 movement', 'MIND_BODY_REGULATION'),
]

const CATALOG_BY_ID = new Map(LBP_EXERCISE_LIBRARY.map((item) => [item.id, item]))

export function getLbpExerciseById(id: string): LbpExerciseCatalogItem | undefined {
  return CATALOG_BY_ID.get(id)
}

export function listLbpExercisesByDomain(
  domain: LbpExerciseDomain,
): readonly LbpExerciseCatalogItem[] {
  return LBP_EXERCISE_LIBRARY.filter((item) => item.domain === domain)
}
