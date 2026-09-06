/**
 * 어깨(SHOULDER) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 출처: Notion 「매선 프로토콜 › 어깨 패턴」(2025-12-01, 아카이브) 패턴 4개 +
 * 패턴별 운동 2개; 수동 검사 5개는 Drive 「회전근개.md」(2026-08-04, 원장 검사
 * 스크립트 — medistream 강의 검사법과 동일하다고 적혀 있음). 목과 분리된 별개 팩
 * (PO 결정 2026-09-06 Q1 "목이랑 회전근개를 따로"). 구동은 NS01 판별
 * (`regionRouting.ts`). 경추 페이지와 같은 "AI 확장 초안" 가능성 — 승인 시 행마다
 * 확인. Claude 초안 필드: `patientEasyLabelKo`, `targetFunctions`, 운동 한글 표시명.
 */
import { buildDraftPack } from './draftPack'
import { evaluateShoulderSafety } from './regionSafety'

export const SHOULDER_REGION_PACK = buildDraftPack({
  region: 'shoulder',
  sourceDocument: 'DRAFT — Notion 매선 프로토콜 › 어깨 패턴 (2025-12-01) + Drive 회전근개.md (검사 스크립트). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'SCAPULAR_PROTRACTION', labelKo: '견갑 전인형(어깨 말림)', patientEasyLabelKo: '앞으로 말린 어깨', particleKo: '와' },
    { id: 'UPPER_TRAP_DOMINANT', labelKo: '견갑 상승형(승모근 우세)', patientEasyLabelKo: '어깨가 올라가는 습관', particleKo: '과' },
    { id: 'SCAPULAR_IR_DOWNWARD', labelKo: '견갑 내회전·하방회전형', patientEasyLabelKo: '팔 돌림이 부족한 어깨', particleKo: '와' },
    { id: 'THORACIC_RESTRICTION', labelKo: '흉추 제한형', patientEasyLabelKo: '등 위쪽(흉추)의 뻣뻣함', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'shoulder_tf_overhead', label: '팔 머리 위로 올리기' },
    { id: 'shoulder_tf_dressing', label: '옷 입기·뒤로 손 돌리기' },
    { id: 'shoulder_tf_lifting', label: '물건 들기·나르기' },
    { id: 'shoulder_tf_sleep', label: '아픈 쪽으로 눕기' },
    { id: 'shoulder_tf_custom', label: '기타 목표 동작', placeholder: '예: 머리 감기, 선반 위 물건 꺼내기 — 목표 동작을 적어주세요' },
  ],
  exercises: [
    { id: 'SH_PROT_01', sourceName: 'Wall slide with serratus activation', displayNameKo: '전거근 활성화 벽 슬라이드', strategyLabelKo: '견갑 전인형' },
    { id: 'SH_PROT_02', sourceName: 'Pec minor opener + thoracic lift', displayNameKo: '소흉근 열기 + 흉추 들기', strategyLabelKo: '견갑 전인형' },
    { id: 'SH_TRAP_01', sourceName: 'Lower trap raise (Y-raise, prone)', displayNameKo: '엎드려 하부 승모근 Y-레이즈', strategyLabelKo: '견갑 상승형' },
    { id: 'SH_TRAP_02', sourceName: 'Scapular depression drill', displayNameKo: '견갑 하강 드릴', strategyLabelKo: '견갑 상승형' },
    { id: 'SH_IR_01', sourceName: 'External rotation (ER) band drill', displayNameKo: '밴드 외회전 드릴', strategyLabelKo: '견갑 내회전·하방회전형' },
    { id: 'SH_IR_02', sourceName: 'Scapular upward rotation drill', displayNameKo: '견갑 상방회전 드릴', strategyLabelKo: '견갑 내회전·하방회전형' },
    { id: 'SH_THX_01', sourceName: 'Quadruped thoracic rotation', displayNameKo: '네발기기 흉추 회전', strategyLabelKo: '흉추 제한형' },
    { id: 'SH_THX_02', sourceName: 'Foam roller thoracic extension', displayNameKo: '폼롤러 흉추 신전', strategyLabelKo: '흉추 제한형' },
  ],
  clinicianAddableExams: [
    { id: 'shoulder_exam_rom', title: '간단 능동/수동 ROM(목덜미·브라끈 잡기)', help: { howKo: '아픈 쪽 팔로 목덜미 뒤를 잡고, 다음에 브라끈 잡듯이 뒤를 잡게 한다.', whyKo: '외회전·내회전 범위를 빠르게 본다.' } },
    { id: 'shoulder_exam_empty_can', title: '엠티캔 검사(Empty can, 극상근)', help: { howKo: '앞으로 나란히 팔을 펴고 엄지가 아래로 가게 돌린 뒤 아래로 누르는 힘에 버티게 한다.', whyKo: '극상근 저항 검사.' } },
    { id: 'shoulder_exam_er_resist', title: '극하근/소원근 저항검사', help: { howKo: '팔꿈치 90°로 옆구리에 붙이고 팔을 밖으로 벌리게 하며 안쪽으로 저항한다.', whyKo: '외회전근 저항 검사.' } },
    { id: 'shoulder_exam_subscap_resist', title: '견갑하근 저항검사', help: { howKo: '같은 자세에서 팔을 안쪽으로 모으게 하며 바깥쪽으로 저항한다.', whyKo: '내회전근 저항 검사.' } },
    { id: 'shoulder_exam_horizontal_adduction', title: '견관절 수평내전', help: { howKo: '팔에 힘을 빼게 한 뒤 잡고 안쪽으로 움직인다.', whyKo: '견봉쇄골관절·후방 구조물 자극 여부.' } },
  ],
  evaluateSafety: (payload, judgment) => evaluateShoulderSafety(payload, judgment),
})
