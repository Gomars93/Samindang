/**
 * 고관절(HIP) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 출처: Drive 「고관절 패턴.md」(2026-08-04 사본; Notion 매선 프로토콜 계열)
 * 패턴 4개 + 패턴별 운동 2개 + 움직임 평가 6개. 구동은 HIP_00 판별 —
 * `HIP_GROIN_DOMINANT`일 때만 이 팩, 엉덩이·골반 우세는 요통 팩
 * (`regionRouting.ts`). 요통·고관절이 문진 모집단을 공유하므로 이 팩의 패턴 D
 * (고관절–요추 연동형)는 요통 팩의 "고관절 기여"와 겹친다 — 원장 확인 항목.
 */
import { buildDraftPack } from './draftPack'
import { evaluateHipSafety } from './regionSafety'

export const HIP_REGION_PACK = buildDraftPack({
  region: 'hip',
  sourceDocument: 'DRAFT — Drive 고관절 패턴.md (2026-08-04, Notion 매선 프로토콜 계열). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'ANTERIOR_TILT', labelKo: '전방경사형', patientEasyLabelKo: '골반이 앞으로 기운 자세', particleKo: '와' },
    { id: 'POSTERIOR_TILT', labelKo: '후방경사형', patientEasyLabelKo: '골반이 뒤로 기운 자세', particleKo: '와' },
    { id: 'ROTATIONAL', labelKo: '회전형', patientEasyLabelKo: '골반 좌우 비틀림', particleKo: '과' },
    { id: 'HIP_LUMBAR_COUPLING', labelKo: '고관절–요추 연동형', patientEasyLabelKo: '허리가 먼저 움직이는 습관', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'hip_tf_walking', label: '걷기' },
    { id: 'hip_tf_sit_to_stand', label: '앉았다 일어서기' },
    { id: 'hip_tf_stairs', label: '계단 오르내리기' },
    { id: 'hip_tf_socks', label: '양말 신기·다리 꼬기' },
    { id: 'hip_tf_custom', label: '기타 목표 동작', placeholder: '예: 차에서 내리기, 바닥에 앉기 — 목표 동작을 적어주세요' },
  ],
  exercises: [
    { id: 'HIP_ANT_01', sourceName: 'Dead bug', displayNameKo: '데드버그(복근 활성)', strategyLabelKo: '전방경사형' },
    { id: 'HIP_ANT_02', sourceName: 'Hamstring hinge drill', displayNameKo: '햄스트링 힌지 드릴', strategyLabelKo: '전방경사형' },
    { id: 'HIP_POST_01', sourceName: '90/90 Hip lift', displayNameKo: '90/90 힙 리프트', strategyLabelKo: '후방경사형' },
    { id: 'HIP_POST_02', sourceName: 'Glute bridge march', displayNameKo: '글루트 브릿지 마치', strategyLabelKo: '후방경사형' },
    { id: 'HIP_ROT_01', sourceName: 'Side plank with hip abduction', displayNameKo: '사이드 플랭크 + 고관절 외전', strategyLabelKo: '회전형' },
    { id: 'HIP_ROT_02', sourceName: '90/90 IR/ER mobility', displayNameKo: '90/90 내·외회전 가동성', strategyLabelKo: '회전형' },
    { id: 'HIP_LUMB_01', sourceName: 'Hip hinge 벽 드릴', displayNameKo: '힙 힌지 벽 드릴(요추–고관절 분리)', strategyLabelKo: '고관절–요추 연동형' },
    { id: 'HIP_LUMB_02', sourceName: 'Bird-dog', displayNameKo: '버드독', strategyLabelKo: '고관절–요추 연동형' },
  ],
  clinicianAddableExams: [
    { id: 'hip_exam_hinge', title: '힙 힌지 관찰', help: { howKo: '둔부 우선 접힘인지 허리 먼저 굽는지 본다.', whyKo: '"먼저 움직이는 곳 = 문제".' } },
    { id: 'hip_exam_single_leg_stance', title: '한 발 서기(골반 흔들림)', help: { howKo: '골반 좌우 흔들림을 본다.', whyKo: '중둔근 평가의 핵심.' } },
    { id: 'hip_exam_ir_er', title: '고관절 내·외회전 범위', help: { howKo: '내회전 20°, 외회전 25° 기준으로 본다.', whyKo: '내회전 제한은 전방경사형, 외회전 제한은 후방경사형 단서.' } },
    { id: 'hip_exam_9090', title: '90/90 내·외회전 검사', help: { howKo: '좌우 비대칭을 본다.', whyKo: '비대칭이면 회전 패턴.' } },
  ],
  evaluateSafety: (payload) => evaluateHipSafety(payload),
})
