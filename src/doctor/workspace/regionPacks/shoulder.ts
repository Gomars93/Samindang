/**
 * 어깨(SHOULDER) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 임상 프레임워크 정본: PR #30 `docs/recovered_rehab_architecture/SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md`
 * (+ `source/SHOULDER_V1_Evidence_Matrix_REHAB_EXTRACT.md`, 2026-08-25, REFERENCE ONLY). PO 승인 2026-09-07:
 * 가설 패턴은 PR #30 phenotype 6개(AC/local 기여는 원장 결정으로 7번째 후보 보류), 도메인은 8개.
 * R3의 Notion 아카이브 4패턴(견갑 전인형/상승형/내회전·하방회전형/흉추 제한형)은 폐기 — 운동 이름 8개만
 * `아카이브(후보)`로 보존. 목과 분리된 별개 팩(PO 결정 2026-09-06 Q1), 구동은 NS01 판별(`regionRouting.ts`).
 *
 * 필드별 출처(§4):
 *   hypothesisPatterns     PR#30 phenotype — 한국어 라벨·환자용 쉬운 말은 Claude 초안
 *   clinicianAddableExams  Drive 「회전근개.md」(2026-08-04, 원장 검사 스크립트) → 원장 문서(팩 용도 확정 전).
 *                          PR#30 어깨 문서에는 §5 Selective Exam 목록이 없다(복구 추출본이 재활 절만 담음).
 *   rehabDomains           PR#30 Domain 8
 *   coreExercises          아카이브(후보) — `domain` 배정은 Claude의 서술적 분류
 *   neuroExamIds           비어 있음 — PR#30 재평가 조건부 항목 "distal neuro change"를 검사 항목으로 만들지는 원장 ② 결정
 *   directionalResponse    미적용(설계 §3)
 *
 * 감염·비정복 탈구/골절·급성 외상성 건파열·비근골격계 방사통은 L0 안전(`shoulderLogic.ts`, FROZEN).
 * "회전근개 = 밴드 외회전", "오십견 = 강한 ROM", "충돌증후군 = 견봉 공간 넓히기" 하드코딩 금지(PR#30).
 */
import { buildDraftPack } from './draftPack'
import { evaluateShoulderSafety } from './regionSafety'

export const SHOULDER_REGION_PACK = buildDraftPack({
  region: 'shoulder',
  sourceDocument:
    'DRAFT — PR #30 docs/recovered_rehab_architecture/SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md (프레임워크) + Drive 회전근개.md (원장 검사 스크립트) + Notion 매선 프로토콜 › 어깨 패턴 (운동 이름, 아카이브 후보). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'RC_RELATED', labelKo: '회전근개 관련 어깨통증', patientEasyLabelKo: '어깨 힘줄(회전근개)', particleKo: '와' },
    { id: 'FROZEN_SHOULDER', labelKo: '동결견(오십견) 패턴', patientEasyLabelKo: '굳은 어깨', particleKo: '와' },
    { id: 'GH_OA', labelKo: '관절와상완 관절염 패턴', patientEasyLabelKo: '어깨 관절 마모', particleKo: '와' },
    { id: 'INSTABILITY_TRAUMATIC', labelKo: '외상성 불안정(재발 포함)', patientEasyLabelKo: '다친 뒤 빠지는 느낌', particleKo: '과' },
    { id: 'INSTABILITY_ATRAUMATIC_MOTOR_CONTROL', labelKo: '비외상성 불안정·움직임 조절형', patientEasyLabelKo: '느슨한 어깨 조절', particleKo: '과' },
    { id: 'CERVICAL_CONTRIBUTION', labelKo: '경추 기여(목 팩으로 넘김)', patientEasyLabelKo: '목에서 오는 기여', particleKo: '와' },
  ],
  targetFunctions: [
    { id: 'shoulder_tf_overhead', label: '팔 머리 위로 올리기' },
    { id: 'shoulder_tf_dressing', label: '옷 입기·뒤로 손 돌리기' },
    { id: 'shoulder_tf_lifting', label: '물건 들기·나르기' },
    { id: 'shoulder_tf_sleep', label: '아픈 쪽으로 눕기' },
    { id: 'shoulder_tf_custom', label: '기타 목표 동작', placeholder: '예: 머리 감기, 선반 위 물건 꺼내기 — 목표 동작을 적어주세요' },
  ],
  rehabDomains: [
    { id: 'EDUCATION_LOAD_MODIFICATION', labelKo: '교육·활동/부하 조절' },
    { id: 'MOBILITY', labelKo: '가동성' },
    { id: 'ROTATOR_CUFF_RESISTANCE', labelKo: '회전근개 저항 운동' },
    { id: 'SCAPULAR_MOTOR_CONTROL', labelKo: '견갑 운동 조절·지구력' },
    { id: 'KINETIC_CHAIN', labelKo: '운동 연쇄 통합' },
    { id: 'OVERHEAD_GRADED_EXPOSURE', labelKo: '머리 위 동작 단계적 노출' },
    { id: 'STABILITY_CONTROL', labelKo: '불안정·안정성 조절' },
    { id: 'FUNCTIONAL_REACH_LIFT', labelKo: '기능적 뻗기·들기 내성' },
  ],
  exercises: [
    { id: 'SH_PROT_01', sourceName: 'Wall slide with serratus activation', displayNameKo: '전거근 활성화 벽 슬라이드', domain: 'SCAPULAR_MOTOR_CONTROL' },
    { id: 'SH_PROT_02', sourceName: 'Pec minor opener + thoracic lift', displayNameKo: '소흉근 열기 + 흉추 들기', domain: 'MOBILITY' },
    { id: 'SH_TRAP_01', sourceName: 'Lower trap raise (Y-raise, prone)', displayNameKo: '엎드려 하부 승모근 Y-레이즈', domain: 'SCAPULAR_MOTOR_CONTROL' },
    { id: 'SH_TRAP_02', sourceName: 'Scapular depression drill', displayNameKo: '견갑 하강 드릴', domain: 'SCAPULAR_MOTOR_CONTROL' },
    { id: 'SH_IR_01', sourceName: 'External rotation (ER) band drill', displayNameKo: '밴드 외회전 드릴', domain: 'ROTATOR_CUFF_RESISTANCE' },
    { id: 'SH_IR_02', sourceName: 'Scapular upward rotation drill', displayNameKo: '견갑 상방회전 드릴', domain: 'SCAPULAR_MOTOR_CONTROL' },
    { id: 'SH_THX_01', sourceName: 'Quadruped thoracic rotation', displayNameKo: '네발기기 흉추 회전', domain: 'MOBILITY' },
    { id: 'SH_THX_02', sourceName: 'Foam roller thoracic extension', displayNameKo: '폼롤러 흉추 신전', domain: 'MOBILITY' },
  ],
  clinicianAddableExams: [
    { id: 'shoulder_exam_rom', title: '간단 능동/수동 ROM(목덜미·브라끈 잡기)', help: { howKo: '아픈 쪽 팔로 목덜미 뒤를 잡고, 다음에 브라끈 잡듯이 뒤를 잡게 한다.', whyKo: '외회전·내회전 범위를 빠르게 본다. 능동 vs 수동 차이는 PR#30 선택 입력.' } },
    { id: 'shoulder_exam_empty_can', title: '엠티캔 검사(Empty can, 극상근)', help: { howKo: '앞으로 나란히 팔을 펴고 엄지가 아래로 가게 돌린 뒤 아래로 누르는 힘에 버티게 한다.', whyKo: '극상근 저항 검사. 단독으로 파열을 진단하지 않는다.' } },
    { id: 'shoulder_exam_er_resist', title: '극하근/소원근 저항검사', help: { howKo: '팔꿈치 90°로 옆구리에 붙이고 팔을 밖으로 벌리게 하며 안쪽으로 저항한다.', whyKo: '외회전근 저항 검사 — 근력/부하 반응(PR#30 선택 입력).' } },
    { id: 'shoulder_exam_subscap_resist', title: '견갑하근 저항검사', help: { howKo: '같은 자세에서 팔을 안쪽으로 모으게 하며 바깥쪽으로 저항한다.', whyKo: '내회전근 저항 검사.' } },
    { id: 'shoulder_exam_horizontal_adduction', title: '견관절 수평내전', help: { howKo: '팔에 힘을 빼게 한 뒤 잡고 안쪽으로 움직인다.', whyKo: '견봉쇄골관절·후방 구조물 자극 여부(AC/local 기여 후보).' } },
  ],
  provenance: {
    hypothesisPatterns: 'PR30_FRAMEWORK',
    targetFunctions: 'CLAUDE_DRAFT',
    coreExercises: 'ARCHIVE_CANDIDATE',
    stageTable: 'CLAUDE_DRAFT',
    clinicianAddableExams: 'CLINICIAN_DOCUMENT',
    directSupportByExam: 'CLAUDE_DRAFT',
  },
  evaluateSafety: (payload, judgment) => evaluateShoulderSafety(payload, judgment),
})
