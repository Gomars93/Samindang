/**
 * 목(NECK) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 임상 프레임워크 정본: PR #30 `docs/recovered_rehab_architecture/NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md`
 * (+ `source/NECK_V1_Evidence_Matrix_v0.2_HANDOFF.md`, 2026-08-25, REFERENCE ONLY). PO 승인 2026-09-07
 * (DECISIONS "추천안으로 모두 승인"): 가설 패턴은 PR #30 §6 후보 5개, 수동 검사는 PR #30 §5 Selective Exam
 * Engine 항목, 도메인은 §7 도메인 9개. 2026-09-06 R3의 Notion 아카이브 4패턴(FHP형/승모·견갑거근 과활성형/
 * 플랫넥형/흉추 제한형)은 **폐기** — 운동 이름 8개만 `아카이브(후보)`로 보존한다(원장이 ② 근거 매트릭스
 * `docs/NECK_EXERCISE_EVIDENCE_MATRIX_v0.1.md`에서 행마다 유지/삭제).
 *
 * 필드별 출처(요통 동등성 설계 §4, `provenance`가 같은 내용을 기계가 읽는 형태로 갖는다):
 *   hypothesisPatterns     PR#30 §6 (id) — 한국어 라벨·환자용 쉬운 말은 Claude 초안(설계 §5, 원장 확정)
 *   clinicianAddableExams  PR#30 §5 — 도움말 문장(어떻게/왜)은 Claude 초안
 *   rehabDomains           PR#30 §7 도메인 9
 *   coreExercises          아카이브(후보) — `domain` 배정은 Claude의 서술적 분류(추천 규칙 아님)
 *   targetFunctions        Claude 초안(R3 그대로)
 *   neuroExamIds           PR#30 §5 "Arm/hand" C5–T1 신경학적 기준선 + "Myelopathy concern" UMN 징후 — D-1
 *   directionalResponse    적용(PR#30 도메인 "directional symptom response"); 칩 라벨·도움말은 목 문구(E-1)
 *   stageTable / directSupportByExam  비어 있음 — 원장 ② 문서
 *
 * `MUST_EXCLUDE_*`(척수증·혈관·특정 병리)는 L0 안전(`neckLogic.ts`, FROZEN)이 담당 — 가설 칩으로 두지 않는다.
 * 진단명(디스크·협착·일자목) → 운동 하드코딩 금지(PR#30 §7 "금지") — `tests/region-pack.spec.mjs` J절이 단언.
 */
import { buildDraftPack } from './draftPack'
import { evaluateNeckSafety } from './regionSafety'

export const NECK_REGION_PACK = buildDraftPack({
  region: 'neck',
  sourceDocument:
    'DRAFT — PR #30 docs/recovered_rehab_architecture/NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md (프레임워크) + Notion 매선 프로토콜 › 경추 패턴 (운동 이름, 아카이브 후보). 원장 승인 전.',
  // PR#30 §6 초기 hypothesis 후보 5개(MUST_EXCLUDE_* 3개 제외). 요통과 같은 5개.
  hypothesisPatterns: [
    { id: 'AXIAL_MOBILITY_DEFICIT', labelKo: '목 움직임 제한(축성 목통증)', patientEasyLabelKo: '목 움직임', particleKo: '과' },
    { id: 'RADICULAR_INVOLVEMENT', labelKo: '신경근 관여(팔 증상)', patientEasyLabelKo: '팔로 내려가는 증상', particleKo: '과' },
    { id: 'CERVICOGENIC_HEADACHE', labelKo: '경추성 두통 패턴', patientEasyLabelKo: '목에서 오는 두통', particleKo: '과' },
    { id: 'MOVEMENT_COORDINATION_DEFICIT', labelKo: '움직임 조절·지구력 부족', patientEasyLabelKo: '오래 버티는 힘', particleKo: '과' },
    { id: 'SHOULDER_OR_PERIPHERAL', labelKo: '어깨·말초 기여', patientEasyLabelKo: '어깨 쪽 기여', particleKo: '와' },
  ],
  targetFunctions: [
    { id: 'neck_tf_looking_back', label: '뒤돌아보기(운전)' },
    { id: 'neck_tf_desk_work', label: '컴퓨터·책상 작업' },
    { id: 'neck_tf_sleep', label: '수면·베개' },
    { id: 'neck_tf_overhead', label: '팔 올리기·높은 곳 보기' },
    { id: 'neck_tf_custom', label: '기타 목표 동작', placeholder: '예: 머리 감기, 운전 후진 — 목표 동작을 적어주세요' },
  ],
  // PR#30 §7 Domain 후보 9개. 라벨은 Claude 번역.
  rehabDomains: [
    { id: 'CERVICAL_MOBILITY', labelKo: '경추 가동성' },
    { id: 'THORACIC_MOBILITY', labelKo: '흉추 가동성' },
    { id: 'DIRECTIONAL_RESPONSE', labelKo: '방향성 증상 반응' },
    { id: 'DNF_CONTROL_ENDURANCE', labelKo: '심부경부굴곡근 조절·지구력' },
    { id: 'CERVICAL_EXTENSOR_ENDURANCE', labelKo: '경추 신전근 지구력' },
    { id: 'SCAPULAR_CONTROL_STRENGTH', labelKo: '견갑 조절·근력·지구력' },
    { id: 'NEURAL_MOBILITY', labelKo: '신경 가동성' },
    { id: 'GRADED_EXPOSURE_WORK_POSTURE', labelKo: '단계적 노출·작업 자세 내성' },
    { id: 'AEROBIC_ACTIVITY', labelKo: '유산소·활동' },
  ],
  // 아카이브(후보) 8개 — 이름만 보존. 도메인 배정은 서술적 분류(Claude)이며 원장이 ②에서 확정한다.
  exercises: [
    { id: 'NECK_FHP_01', sourceName: 'Chin tuck + Deep neck flexor activation', displayNameKo: '턱 당기기 + 심부경부굴곡근 활성화', domain: 'DNF_CONTROL_ENDURANCE' },
    { id: 'NECK_FHP_02', sourceName: 'Wall slide with chin control', displayNameKo: '벽 슬라이드(턱 조절)', domain: 'SCAPULAR_CONTROL_STRENGTH' },
    { id: 'NECK_TRAP_01', sourceName: 'Scapular depression drill', displayNameKo: '견갑 하강 드릴', domain: 'SCAPULAR_CONTROL_STRENGTH' },
    { id: 'NECK_TRAP_02', sourceName: 'Lower trap Y-raise', displayNameKo: '하부 승모근 Y-레이즈', domain: 'SCAPULAR_CONTROL_STRENGTH' },
    { id: 'NECK_FLAT_01', sourceName: 'Deep neck flexor endurance (DNF hold)', displayNameKo: '심부경부굴곡근 지구력 유지', domain: 'DNF_CONTROL_ENDURANCE' },
    { id: 'NECK_FLAT_02', sourceName: 'Foam roller thoracic extension', displayNameKo: '폼롤러 흉추 신전', domain: 'THORACIC_MOBILITY' },
    { id: 'NECK_THX_01', sourceName: 'Quadruped thoracic rotation', displayNameKo: '네발기기 흉추 회전', domain: 'THORACIC_MOBILITY' },
    { id: 'NECK_THX_02', sourceName: 'Serratus wall slide + thoracic lift', displayNameKo: '전거근 벽 슬라이드 + 흉추 들기', domain: 'SCAPULAR_CONTROL_STRENGTH' },
  ],
  // PR#30 §5 Selective Exam Engine v0.1 — 태블릿 분기별 검사를 "확인 추가" 고정 목록으로 옮김(자동 삽입 없음:
  // 자동 규칙은 PAIN_EXAM_RECOMMENDATION_TEMPLATE.md APPROVED 행에서만). 단일 검사 = 진단 확정 금지(§원칙).
  clinicianAddableExams: [
    // Base
    { id: 'neck_exam_crom', title: '경추 능동 관절가동범위(CROM) + 증상 반응', help: { howKo: '굴곡·신전·좌우 회전·측굴을 능동으로 하게 하고 제한 방향과 평소 증상 재현·감소를 본다.', whyKo: 'PR#30 Base 검사. 축성 목통증·가동성 제한 가설의 지지/반박 근거이자 재평가 기준값.' } },
    { id: 'neck_exam_target_function_reproduction', title: '목표 기능 재현', help: { howKo: '환자가 고른 목표 동작(뒤돌아보기·책상 자세 등)을 실제로 해 보게 하고 증상 재현 여부를 본다.', whyKo: 'PR#30 Base 검사. 재평가는 같은 동작으로 비교한다.' } },
    // Arm / hand symptoms
    { id: 'neck_exam_neuro_c5_t1', title: 'C5–T1 신경학적 기준선(근력·감각·반사)', help: { howKo: 'C5–T1 근절 근력, 피부절 감각, 이두·요골·삼두 반사를 좌우 비교한다.', whyKo: 'POSITIVE = 새로 생기거나 악화된 객관적 결손 → 운동 추천이 잠기고 안전 재평가가 우선(D-1). NEGATIVE = 안정. 미시행은 "이상 없음"으로 가정하지 않는다.' } },
    { id: 'neck_exam_spurling', title: 'Spurling 검사', help: { howKo: '경추를 신전·측굴(±회전)한 상태에서 축성 압박을 가해 팔 증상 재현을 본다.', whyKo: '신경근 관여 가설의 지지 근거(유발 검사). 단독으로 진단하지 않고 distraction·ULTT·신경학적 검사와 묶어 본다.' } },
    { id: 'neck_exam_distraction', title: '경추 견인(Distraction) 검사', help: { howKo: '앙와위/좌위에서 머리를 축 방향으로 가볍게 견인해 팔 증상 감소를 본다.', whyKo: '신경근 관여 가설 클러스터의 한 항목. 감소하면 지지.' } },
    { id: 'neck_exam_ultt', title: '상지 신경긴장 검사(ULTT, 해당 신경 편향)', help: { howKo: '증상 분포에 맞는 신경 편향(정중/요골/척골)으로 상지를 순차 긴장시키며 증상 재현·좌우 차이를 본다.', whyKo: '신경근 관여·신경 가동성 도메인 판단 근거. 클러스터 해석은 원장 판단(cutoff 미고정, PR#30 §10).' } },
    // Myelopathy concern
    { id: 'neck_exam_umn', title: '상위운동신경(UMN) 징후 + 보행/탠덤', help: { howKo: '보행·탠덤 보행, 반사 항진·비대칭, Hoffmann, Babinski, 클로누스, 손 기민성을 본다.', whyKo: 'POSITIVE = 척수 관여 우려 → 일상 운동 추천 잠금 + 의학적 평가 우선(D-1). Hoffmann 하나로 확진하지 않는다(PR#30 §2-2 A).' } },
    // Headache
    { id: 'neck_exam_upper_cervical_cfrt', title: '상부 경추 평가 + 경추 굴곡-회전 검사(CFRT)', help: { howKo: '상부 경추 분절 평가와 함께 경추를 굴곡한 상태에서 좌우 회전 범위·증상 재현을 본다.', whyKo: '경추성 두통 가설의 지지 근거. cutoff는 미고정(PR#30 §10 4). 새롭고 유례없이 심한 두통은 안전 문제가 먼저다.' } },
    // Movement-coordination / sustained-posture
    { id: 'neck_exam_dnf_endurance', title: '심부경부굴곡근 지구력/조절', help: { howKo: '앙와위 턱 당기기 유지(또는 두부 들기 유지) 시간과 대체 전략(표층 굴곡근 과활성) 여부를 본다.', whyKo: '움직임 조절·지구력 부족 가설과 DNF 도메인 운동 선택의 근거.' } },
    { id: 'neck_exam_scapular_control', title: '견갑 조절/지구력', help: { howKo: '팔 올리기·유지 중 견갑 움직임(익상·과상승·조기 상승)과 유지 내성을 본다.', whyKo: '견갑 조절·근력 도메인 선택 근거. 어깨 우세 표현과의 구분에도 쓴다.' } },
    // Shoulder-dominant presentation
    { id: 'neck_exam_shoulder_vs_neck', title: '어깨 AROM/PROM/저항 vs 경추 증상 재현 비교', help: { howKo: '어깨 능동·수동 가동범위와 저항 검사에서 평소 증상이 재현되는지, 경추 움직임과 어느 쪽이 더 일치하는지 비교한다.', whyKo: '어깨·말초 기여 가설. 목 진단으로 억지 귀속하지 않는다(PR#30). NS01 어깨 우세면 어깨 팩이 구동한다.' } },
  ],
  // E-2 (D-1): 객관적 신경학적 결손 검사만. Spurling/ULTT(유발 검사)는 넣지 않는다.
  neuroExamIds: ['neck_exam_neuro_c5_t1', 'neck_exam_umn'],
  // PR#30 도메인 "directional symptom response" — 목은 방향성 반응 카드를 켠다(설계 §3). 값 6개는 공통, 라벨만 목 문구.
  directionalResponseApplicable: true,
  directionalResponseLabels: {
    FLEXION_FAVORABLE: '굽히면(굴곡) 호전',
    EXTENSION_FAVORABLE: '젖히면(신전) 호전',
    DISTAL_WORSENING: '팔 쪽으로 퍼짐(원위부 악화)',
  },
  directionalResponseHelp: {
    howKo: '앉거나 서서 목을 굽히고, 뒤로 젖히고, 좌우로 돌리며 평소 증상의 재현·감소를 봅니다. 팔 증상이 있다면 몸쪽으로 줄거나 손 쪽으로 더 퍼지는지도 관찰합니다.',
    whyKo: '모든 방향의 각도를 기록하기 위한 검사가 아니라, 실제 운동·재평가 방향을 바꿀 만한 증상반응이 있는지 확인하기 위한 검사입니다.',
  },
  provenance: {
    hypothesisPatterns: 'PR30_FRAMEWORK',
    targetFunctions: 'CLAUDE_DRAFT',
    coreExercises: 'ARCHIVE_CANDIDATE',
    stageTable: 'CLAUDE_DRAFT',
    clinicianAddableExams: 'PR30_FRAMEWORK',
    directSupportByExam: 'CLAUDE_DRAFT',
  },
  evaluateSafety: (payload) => evaluateNeckSafety(payload),
})
