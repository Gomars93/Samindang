/**
 * 무릎(KNEE) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 임상 프레임워크 정본: PR #30 `docs/recovered_rehab_architecture/KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md`
 * (+ `source/KNEE_V1_Evidence_Matrix_REHAB_EXTRACT.md`, 2026-08-25, REFERENCE ONLY). PO 승인 2026-09-07:
 * 가설 패턴은 PR #30 phenotype 7개(무릎 V1 통합 리포트가 "raw discriminator로 보존"한 enum과 일치), 도메인 11개.
 * R3의 Notion 아카이브 4패턴(내회전형/외회전형/경직형/고관절–무릎 연동형)은 폐기 — 운동 이름 8개만
 * `아카이브(후보)`로 보존.
 *
 * 필드별 출처(§4):
 *   hypothesisPatterns     PR#30 phenotype — 한국어 라벨·환자용 쉬운 말은 Claude 초안
 *   clinicianAddableExams  Notion 아카이브 움직임 평가 4개 → 아카이브(후보). PR#30 무릎 문서에는 §5 검사 목록이 없다.
 *   rehabDomains           PR#30 Domain 11
 *   coreExercises          아카이브(후보) — `domain` 배정은 Claude의 서술적 분류
 *   neuroExamIds           비어 있음(무릎에 신경 결손 검사 항목 없음; 신경혈관 손상은 L0)
 *   directionalResponse    미적용(설계 §3)
 *
 * DVT·화농관절·골절/신경혈관 손상·신전기전 파열·진성 잠김은 L0 안전(`kneeLogic.ts`, FROZEN).
 * "OA = 대퇴사두근 운동 1개", "PFP = VMO 고립", "반월판 = 회전 금지", "ACL = 동일 재활", "건 = 휴식" 하드코딩 금지(PR#30).
 */
import { buildDraftPack } from './draftPack'
import { evaluateKneeSafety } from './regionSafety'

export const KNEE_REGION_PACK = buildDraftPack({
  region: 'knee',
  sourceDocument:
    'DRAFT — PR #30 docs/recovered_rehab_architecture/KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md (프레임워크) + Notion 매선 프로토콜 › 무릎 패턴 (운동·검사 이름, 아카이브 후보). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'KNEE_OA', labelKo: '무릎 골관절염 패턴', patientEasyLabelKo: '무릎 관절 마모', particleKo: '와' },
    { id: 'PATELLOFEMORAL_PAIN', labelKo: '슬개대퇴 통증 패턴', patientEasyLabelKo: '무릎 앞쪽(슬개골 주변) 통증', particleKo: '과' },
    { id: 'PATELLAR_TENDINOPATHY', labelKo: '슬개건병증·신전기전 부하 통증', patientEasyLabelKo: '무릎 앞 힘줄 부하', particleKo: '와' },
    { id: 'ACUTE_MENISCAL', labelKo: '급성 반월판 손상 패턴', patientEasyLabelKo: '무릎 속 연골판 손상', particleKo: '과' },
    { id: 'DEGENERATIVE_MENISCAL', labelKo: '퇴행성 반월판 기여', patientEasyLabelKo: '나이 든 연골판 변화', particleKo: '와' },
    { id: 'LIGAMENT_INSTABILITY', labelKo: '인대 손상·불안정', patientEasyLabelKo: '무릎이 흔들리는 느낌', particleKo: '과' },
    { id: 'PATELLAR_INSTABILITY', labelKo: '슬개골 불안정', patientEasyLabelKo: '슬개골이 빠지는 느낌', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'knee_tf_stairs', label: '계단 오르내리기' },
    { id: 'knee_tf_squat', label: '쪼그려 앉기·일어서기' },
    { id: 'knee_tf_walking', label: '걷기' },
    { id: 'knee_tf_running', label: '달리기·운동 복귀' },
    { id: 'knee_tf_custom', label: '기타 목표 동작', placeholder: '예: 등산 하산, 양반다리 — 목표 동작을 적어주세요' },
  ],
  rehabDomains: [
    { id: 'ACTIVITY_AEROBIC', labelKo: '활동·유산소' },
    { id: 'MOBILITY', labelKo: '가동성' },
    { id: 'QUADRICEPS_STRENGTH', labelKo: '대퇴사두근 근력' },
    { id: 'HAMSTRING_CALF_HIP_STRENGTH', labelKo: '햄스트링·종아리·고관절 근력' },
    { id: 'NEUROMUSCULAR_BALANCE', labelKo: '신경근 조절·균형' },
    { id: 'SIT_TO_STAND_SQUAT_STAIR', labelKo: '앉았다 서기·스쿼트·계단 내성' },
    { id: 'GAIT_LOAD_PROGRESSION', labelKo: '보행·부하 점진' },
    { id: 'PF_GRADED_LOADING', labelKo: '슬개대퇴 단계적 부하' },
    { id: 'TENDON_LOAD_PROGRESSION', labelKo: '건 부하 점진' },
    { id: 'LIGAMENT_RETURN_TO_FUNCTION', labelKo: '인대 손상 후 기능 복귀' },
    { id: 'GRADED_EXPOSURE', labelKo: '단계적 노출' },
  ],
  exercises: [
    { id: 'KNEE_IR_01', sourceName: 'VMO 스텝다운', displayNameKo: '내측광근(VMO) 스텝다운', domain: 'QUADRICEPS_STRENGTH' },
    { id: 'KNEE_IR_02', sourceName: '힙 ER 밴드 회전운동', displayNameKo: '고관절 외회전 밴드 운동', domain: 'HAMSTRING_CALF_HIP_STRENGTH' },
    { id: 'KNEE_ER_01', sourceName: '힙 IR/내전 조절 운동(90/90 IR 드릴)', displayNameKo: '90/90 고관절 내회전 드릴', domain: 'MOBILITY' },
    { id: 'KNEE_ER_02', sourceName: 'Side-lying hip adduction', displayNameKo: '옆으로 누워 고관절 내전', domain: 'HAMSTRING_CALF_HIP_STRENGTH' },
    { id: 'KNEE_STIFF_01', sourceName: 'Heel-elevated squat', displayNameKo: '뒤꿈치 높인 스쿼트(가동성 회복)', domain: 'SIT_TO_STAND_SQUAT_STAIR' },
    { id: 'KNEE_STIFF_02', sourceName: 'Hamstring/Calf 슬라이더 드릴', displayNameKo: '햄스트링·종아리 슬라이더 드릴', domain: 'MOBILITY' },
    { id: 'KNEE_HIP_01', sourceName: 'Step-down (중둔근 + 고관절 안정화)', displayNameKo: '스텝다운(중둔근·고관절 안정화)', domain: 'NEUROMUSCULAR_BALANCE' },
    { id: 'KNEE_HIP_02', sourceName: 'Pallof press lunge', displayNameKo: '팔로프 프레스 런지(회전 안정성)', domain: 'NEUROMUSCULAR_BALANCE' },
  ],
  clinicianAddableExams: [
    { id: 'knee_exam_squat', title: '스쿼트 관찰(무릎 안쪽 붕괴·회전)', help: { howKo: '스쿼트에서 무릎 안쪽 붕괴, 발끝 대비 내외회전, 힙힌지 실패를 본다.', whyKo: '무릎 중심 스쿼트인지 고관절 전략인지 구분(움직임 조절 — PR#30 선택 입력).' } },
    { id: 'knee_exam_step_down', title: '스텝다운 검사', help: { howKo: '한 발로 내려서며 무릎 안쪽 붕괴를 본다.', whyKo: '고관절 안정성·신경근 조절 평가.' } },
    { id: 'knee_exam_single_leg_stance', title: '한 발 서기', help: { howKo: '발목–무릎–고관절 라인 붕괴 여부를 본다.', whyKo: '균형·조절 도메인 평가.' } },
    { id: 'knee_exam_tke', title: '무릎 완전 신전(TKE)', help: { howKo: '무릎 완전 신전 시 통증·보상을 본다. 능동 신전 불가는 안전 분기(신전기전 파열 우려).', whyKo: '대퇴사두근 개입·신전 제한 확인.' } },
  ],
  provenance: {
    hypothesisPatterns: 'PR30_FRAMEWORK',
    targetFunctions: 'CLAUDE_DRAFT',
    coreExercises: 'ARCHIVE_CANDIDATE',
    stageTable: 'CLAUDE_DRAFT',
    clinicianAddableExams: 'ARCHIVE_CANDIDATE',
    directSupportByExam: 'CLAUDE_DRAFT',
  },
  evaluateSafety: (payload) => evaluateKneeSafety(payload),
})
