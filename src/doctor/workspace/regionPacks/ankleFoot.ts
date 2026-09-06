/**
 * 발목/발(ANKLE_FOOT) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 출처: Notion 「매선 프로토콜 › 발목 패턴」(2025-12-04, 아카이브) — 「매선 프로토콜
 * 목차」가 "원장님이 만든 발목 프로토콜 포맷"이라 부르는 **원장 원안 포맷**이다
 * (3패턴 분류 "삼인당 표준 분류", 패턴별 운동 3~4개, 3단계 치료 진행, 경과 지표).
 * 문서의 3-Phase(통증 조절 1~4회 / 기능 회복 5~8회 / 고착화 9~12회)는 방문 회차
 * 기준이라 이 시스템의 운동 단계(0~3, VISIT_04 축)와 다르다 — 단계표는 원장이 정한다.
 */
import { buildDraftPack } from './draftPack'
import { evaluateAnkleFootSafety } from './regionSafety'

export const ANKLE_FOOT_REGION_PACK = buildDraftPack({
  region: 'ankle_foot',
  sourceDocument: 'DRAFT — Notion 매선 프로토콜 › 발목 패턴 (2025-12-04, 원장 원안 포맷). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'PELVIC_ALIGNMENT_LOSS', labelKo: '골반 비정렬형', patientEasyLabelKo: '골반 높이가 맞지 않는 자세', particleKo: '와' },
    { id: 'HIP_STRATEGY_LOSS', labelKo: '고관절 전략 문제형', patientEasyLabelKo: '고관절이 축 역할을 못 하는 움직임', particleKo: '과' },
    { id: 'ANKLE_MOBILITY_LOSS', labelKo: '발목 가동성 제한형', patientEasyLabelKo: '발목이 충분히 젖혀지지 않는 상태', particleKo: '와' },
  ],
  targetFunctions: [
    { id: 'ankle_foot_tf_walking', label: '걷기' },
    { id: 'ankle_foot_tf_stairs', label: '계단 오르내리기' },
    { id: 'ankle_foot_tf_running', label: '달리기·점프' },
    { id: 'ankle_foot_tf_standing_long', label: '오래 서 있기' },
    { id: 'ankle_foot_tf_custom', label: '기타 목표 동작', placeholder: '예: 등산 하산, 축구 복귀 — 목표 동작을 적어주세요' },
  ],
  exercises: [
    { id: 'AF_PELV_01', sourceName: '클램(Clam)', displayNameKo: '클램', strategyLabelKo: '골반 비정렬형' },
    { id: 'AF_PELV_02', sourceName: '사이드 브릿지', displayNameKo: '사이드 브릿지', strategyLabelKo: '골반 비정렬형' },
    { id: 'AF_PELV_03', sourceName: '힙어브덕션(중둔근 강화)', displayNameKo: '힙 어브덕션(중둔근 강화)', strategyLabelKo: '골반 비정렬형' },
    { id: 'AF_HIPS_01', sourceName: '힙힌지', displayNameKo: '힙 힌지', strategyLabelKo: '고관절 전략 문제형' },
    { id: 'AF_HIPS_02', sourceName: '힙쓰러스트', displayNameKo: '힙 쓰러스트', strategyLabelKo: '고관절 전략 문제형' },
    { id: 'AF_HIPS_03', sourceName: 'Step-down control', displayNameKo: '스텝다운 컨트롤', strategyLabelKo: '고관절 전략 문제형' },
    { id: 'AF_HIPS_04', sourceName: '고관절 내·외회전 운동(90–90)', displayNameKo: '90/90 고관절 내·외회전', strategyLabelKo: '고관절 전략 문제형' },
    { id: 'AF_MOB_01', sourceName: 'Wall Dorsiflexion Stretch (10회)', displayNameKo: '벽 발목 배굴 스트레칭', startingDoseKo: '10회', strategyLabelKo: '발목 가동성 제한형' },
    { id: 'AF_MOB_02', sourceName: 'Calf Raise', displayNameKo: '카프 레이즈', strategyLabelKo: '발목 가동성 제한형' },
    { id: 'AF_MOB_03', sourceName: 'Ankle Mobility Drills', displayNameKo: '발목 가동성 드릴', strategyLabelKo: '발목 가동성 제한형' },
    { id: 'AF_MOB_04', sourceName: 'Soft Landing Training', displayNameKo: '부드러운 착지 훈련', strategyLabelKo: '발목 가동성 제한형' },
  ],
  clinicianAddableExams: [
    { id: 'ankle_foot_exam_df_lunge', title: '발목 배굴 런지 검사(10cm 기준)', help: { howKo: '벽에서 무릎이 닿는 거리를 잰다.', whyKo: '6~8cm 이하면 발목 가동성 제한형 강력 의심.' } },
    { id: 'ankle_foot_exam_sls', title: '한 발 서기 10초', help: { howKo: '10초 유지 여부, 골반 흔들림, 발목/무릎 정렬을 본다.', whyKo: '골반 비정렬형·고관절 전략 문제형 단서.' } },
    { id: 'ankle_foot_exam_squat', title: '스쿼트 관찰', help: { howKo: '무릎 안쪽 붕괴, 발목 배굴 제한, 골반 회전/기울기를 본다.', whyKo: '패턴 분류의 기본 검사.' } },
    { id: 'ankle_foot_exam_weight_shift', title: '체중 분배 비율(55:45 기준)', help: { howKo: '좌우 체중 분배를 잰다.', whyKo: '55:45 이상 차이면 비정렬 의심.' } },
  ],
  evaluateSafety: (payload) => evaluateAnkleFootSafety(payload),
})
