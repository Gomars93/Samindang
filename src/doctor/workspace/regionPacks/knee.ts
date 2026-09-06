/**
 * 무릎(KNEE) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 출처: Notion 「매선 프로토콜 › 무릎 패턴」(2025-12-01, 아카이브) 패턴 4개 +
 * 패턴별 운동 2개 + 움직임 평가 6개. "AI 확장 초안" 가능성은 경추 팩 헤더와
 * 같다. Claude 초안 필드: `patientEasyLabelKo`, `targetFunctions`.
 */
import { buildDraftPack } from './draftPack'
import { evaluateKneeSafety } from './regionSafety'

export const KNEE_REGION_PACK = buildDraftPack({
  region: 'knee',
  sourceDocument: 'DRAFT — Notion 매선 프로토콜 › 무릎 패턴 (2025-12-01, 아카이브). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'INTERNAL_ROTATION', labelKo: '내회전형', patientEasyLabelKo: '무릎이 안쪽으로 돌아가는 움직임', particleKo: '과' },
    { id: 'EXTERNAL_ROTATION', labelKo: '외회전형', patientEasyLabelKo: '무릎이 바깥쪽으로 돌아가는 움직임', particleKo: '과' },
    { id: 'STIFF_KNEE', labelKo: '경직형', patientEasyLabelKo: '무릎이 잘 굽혀지고 펴지지 않는 상태', particleKo: '와' },
    { id: 'HIP_KNEE_COUPLING', labelKo: '고관절–무릎 연동형', patientEasyLabelKo: '고관절에서 시작되는 무릎 부담', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'knee_tf_stairs', label: '계단 오르내리기' },
    { id: 'knee_tf_squat', label: '쪼그려 앉기·일어서기' },
    { id: 'knee_tf_walking', label: '걷기' },
    { id: 'knee_tf_running', label: '달리기·운동 복귀' },
    { id: 'knee_tf_custom', label: '기타 목표 동작', placeholder: '예: 등산 하산, 양반다리 — 목표 동작을 적어주세요' },
  ],
  exercises: [
    { id: 'KNEE_IR_01', sourceName: 'VMO 스텝다운', displayNameKo: '내측광근(VMO) 스텝다운', strategyLabelKo: '내회전형' },
    { id: 'KNEE_IR_02', sourceName: '힙 ER 밴드 회전운동', displayNameKo: '고관절 외회전 밴드 운동', strategyLabelKo: '내회전형' },
    { id: 'KNEE_ER_01', sourceName: '힙 IR/내전 조절 운동(90/90 IR 드릴)', displayNameKo: '90/90 고관절 내회전 드릴', strategyLabelKo: '외회전형' },
    { id: 'KNEE_ER_02', sourceName: 'Side-lying hip adduction', displayNameKo: '옆으로 누워 고관절 내전', strategyLabelKo: '외회전형' },
    { id: 'KNEE_STIFF_01', sourceName: 'Heel-elevated squat', displayNameKo: '뒤꿈치 높인 스쿼트(가동성 회복)', strategyLabelKo: '경직형' },
    { id: 'KNEE_STIFF_02', sourceName: 'Hamstring/Calf 슬라이더 드릴', displayNameKo: '햄스트링·종아리 슬라이더 드릴', strategyLabelKo: '경직형' },
    { id: 'KNEE_HIP_01', sourceName: 'Step-down (중둔근 + 고관절 안정화)', displayNameKo: '스텝다운(중둔근·고관절 안정화)', strategyLabelKo: '고관절–무릎 연동형' },
    { id: 'KNEE_HIP_02', sourceName: 'Pallof press lunge', displayNameKo: '팔로프 프레스 런지(회전 안정성)', strategyLabelKo: '고관절–무릎 연동형' },
  ],
  clinicianAddableExams: [
    { id: 'knee_exam_squat', title: '스쿼트 관찰(무릎 안쪽 붕괴·회전)', help: { howKo: '스쿼트에서 무릎 안쪽 붕괴, 발끝 대비 내외회전, 힙힌지 실패를 본다.', whyKo: '무릎 중심 스쿼트인지 고관절 전략인지 구분.' } },
    { id: 'knee_exam_step_down', title: '스텝다운 검사', help: { howKo: '한 발로 내려서며 무릎 안쪽 붕괴를 본다.', whyKo: '고관절 안정성 평가의 핵심.' } },
    { id: 'knee_exam_single_leg_stance', title: '한 발 서기', help: { howKo: '발목–무릎–고관절 라인 붕괴 여부를 본다.', whyKo: '회전형 패턴의 대표 평가.' } },
    { id: 'knee_exam_tke', title: '무릎 완전 신전(TKE)', help: { howKo: '무릎 완전 신전 시 통증·보상을 본다.', whyKo: '대퇴사두근 개입 패턴 확인.' } },
  ],
  evaluateSafety: (payload) => evaluateKneeSafety(payload),
})
