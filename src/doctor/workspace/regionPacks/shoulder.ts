/**
 * 어깨(SHOULDER) 부위 팩 — **승인**, `productionApproved: true` (2026-09-07).
 *
 * 원장 승인 문서: `docs/SHOULDER_EXERCISE_DECISIONS_v1.0_CLOSED.md` (PO "허리를 기준으로 모든 파트 진행",
 * 2026-09-07 — `docs/SHOULDER_EXERCISE_EVIDENCE_MATRIX_v0.1.md` §0 체크리스트 9개를 추천안 그대로 확정).
 * 임상 프레임워크 정본: PR #30 `docs/recovered_rehab_architecture/SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md`.
 * 검사 원본: Drive 「회전근개.md」(원장 검사 스크립트, 5개) + 매트릭스 §6 추가 3개.
 * 근거 확인: `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §3 (B수준 — 요통·목과 같은 진입 기준).
 *
 * 내용 요약(CLOSED §2~§8):
 *   hypothesisPatterns     PR#30 phenotype 6 + AC/국소 기여 1 = 7.
 *   clinicianAddableExams  원장 스크립트 5 + 견갑 조절 관찰 / 원위 신경 / apprehension-relocation = 8.
 *   rehabDomains           PR#30 Domain 8 (KINETIC_CHAIN은 SH_OVH_01에 흡수, 독립 행 없음).
 *   coreExercises          Core 10 (초안 11 → SH_THX_01 보류). 아카이브 8개는 병합·대응으로 전부 폐기.
 *   stageTable             1단계 4 / 2단계 5 / 3단계 1.
 *   eligibilityRules       전부 기본값(false/false). 방향성 카드 미적용.
 *   neuroExamIds           원위 신경 검사 1개(D-1 의미) — POSITIVE면 전체 차단, 미시행은 후보를 비우지 않는다.
 *   directSupportByExam    검사 5 → 운동(순위 버킷만).
 *   detailCheckQuestionIds SH08 (서버 `DETAIL_CHECK_REGION_QUESTION_IDS.shoulder`와 parity).
 *
 * 금지(PR#30): "회전근개 = 밴드 외회전", "오십견 = 강한 ROM", "충돌증후군 = 견봉 공간 넓히기" 하드코딩 없음 —
 * 가설 id가 운동 쪽에 없고(E-4 J절), 동결견 대응 가동 행(SH_MOB_02)은 용량 문장에 "통증 범위 내"가 고정된다.
 * 감염·비정복 탈구/골절·급성 외상성 건파열·비근골격계 방사통은 L0 안전(`shoulderLogic.ts`, FROZEN) +
 * 원장 `shoulder_objective_cuff_weakness`.
 */
import { buildDraftPack } from './draftPack'
import { evaluateShoulderSafety } from './regionSafety'

/** 전 운동 공통 중단·재검토 첫 항목(CLOSED §4) — 비네트 0절이 단언한다. */
const STOP_COMMON = '새로운 또는 진행하는 신경증상(팔 힘빠짐·감각저하) 또는 어깨가 빠지는 사건'

export const SHOULDER_REGION_PACK = buildDraftPack({
  region: 'shoulder',
  productionApproved: true,
  sourceDocument:
    'docs/SHOULDER_EXERCISE_DECISIONS_v1.0_CLOSED.md (2026-09-07, PO 승인) + PR #30 docs/recovered_rehab_architecture/SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md (프레임워크) + Drive 회전근개.md (원장 검사 스크립트)',
  hypothesisPatterns: [
    { id: 'RC_RELATED', labelKo: '회전근개 관련 어깨통증', patientEasyLabelKo: '어깨 힘줄(회전근개)', particleKo: '와' },
    { id: 'FROZEN_SHOULDER', labelKo: '동결견(오십견) 패턴', patientEasyLabelKo: '굳은 어깨', particleKo: '와' },
    { id: 'GH_OA', labelKo: '관절와상완 관절염 패턴', patientEasyLabelKo: '어깨 관절 마모', particleKo: '와' },
    { id: 'INSTABILITY_TRAUMATIC', labelKo: '외상성 불안정(재발 포함)', patientEasyLabelKo: '다친 뒤 빠지는 느낌', particleKo: '과' },
    { id: 'INSTABILITY_ATRAUMATIC_MOTOR_CONTROL', labelKo: '비외상성 불안정·움직임 조절형', patientEasyLabelKo: '느슨한 어깨 조절', particleKo: '과' },
    { id: 'CERVICAL_CONTRIBUTION', labelKo: '경추 기여(목 팩으로 넘김)', patientEasyLabelKo: '목에서 오는 기여', particleKo: '와' },
    { id: 'AC_LOCAL_CONTRIBUTION', labelKo: '견봉쇄골·국소 기여', patientEasyLabelKo: '어깨 위 관절(쇄골 끝) 자극', particleKo: '과' },
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
  // CLOSED §3·§4 — Core 10. 용량은 삼인당 시작 기본값(임상 임계값 아님).
  exercises: [
    {
      id: 'SH_EDU_01',
      sourceName: 'Education — activity / load modification (pain-tolerable use, night arm support)',
      displayNameKo: '활동·부하 조절(통증 허용 범위 사용, 야간 팔 받침)',
      domain: 'EDUCATION_LOAD_MODIFICATION',
      startingCriteriaKo: ['안전 확인 CLEAR', '환자가 통증 유발 동작과 야간 자세를 말할 수 있음'],
      startingDoseKo: '매일: 유발 동작 목록을 적고 대체 방법 1~2개 정하기, 야간에는 팔 아래 베개 받침.',
      acceptableResponseKo: ['야간 통증·유발 빈도가 늘지 않음', '팔을 완전히 쉬게 하지 않고 통증 허용 범위에서 계속 사용함'],
      stopReviewKo: [STOP_COMMON, '야간 통증 급증', '팔 들기가 갑자기 불가능해짐'],
      regressionKo: '활동 범위를 더 축소하고 유발 동작을 잠시 피함',
      progressionKo: '유발 동작을 한 번에 1개씩 재도입',
      targetFunctions: ['OVERHEAD', 'DRESSING', 'LIFTING', 'SLEEP'],
    },
    {
      id: 'SH_MOB_01',
      sourceName: 'Pendulum + assisted elevation (stick / wall walk, pain-tolerable range)',
      displayNameKo: '진자 운동 + 보조 거상(막대·벽 타기)',
      domain: 'MOBILITY',
      startingCriteriaKo: ['급성 외상 안전 확인 CLEAR', '진자 운동에서 날카로운 통증이 없음'],
      startingDoseKo: '진자 1분 × 2회 + 보조 거상 10회, 하루 2회부터 시작. 통증 허용 범위 안에서.',
      acceptableResponseKo: ['당김만 느껴짐', '종료 후 기저 수준으로 회복됨'],
      stopReviewKo: [STOP_COMMON, '통증이 다음 날까지 악화', '빠지는 느낌 재현'],
      regressionKo: '진자 운동만',
      progressionKo: '보조 거상 각도만 점진적으로 증가',
      targetFunctions: ['OVERHEAD', 'DRESSING'],
    },
    {
      id: 'SH_MOB_02',
      sourceName: 'Low-intensity anterior chest / posterior shoulder stretch (irritability-matched)',
      displayNameKo: '앞가슴·후방 어깨 저강도 스트레칭(소흉근 열기, 슬리퍼·크로스바디)',
      domain: 'MOBILITY',
      startingCriteriaKo: ['능동·수동 가동범위 제한이 기록됨', '스트레칭 중 통증이 가벼운 당김 이하'],
      startingDoseKo: '20~30초 × 3회, 하루 2회부터 시작. 통증 범위 내에서만 — 세게 늘리지 않는다.',
      acceptableResponseKo: ['당김이 반복 중 줄어듦', '당일 야간 통증이 늘지 않음'],
      stopReviewKo: [STOP_COMMON, '당일 야간 통증 악화 → 강도를 낮춤(동결견에서 "세게"는 금지)', '스트레칭 중 날카로운 통증'],
      regressionKo: '유지 시간과 범위를 절반으로',
      progressionKo: '유지 시간만 증가(강도는 올리지 않음)',
      targetFunctions: ['DRESSING', 'OVERHEAD', 'SLEEP'],
    },
    {
      id: 'SH_RC_01',
      sourceName: 'Isometric external / internal rotation (wall / doorframe, pain-tolerable)',
      displayNameKo: '등척성 외회전·내회전(벽·문틀 밀기)',
      domain: 'ROTATOR_CUFF_RESISTANCE',
      startingCriteriaKo: ['저항 검사에서 힘 주기가 가능함(급성 외상성 건파열 우려 없음)', '등척성 수축 중 통증이 허용 범위'],
      startingDoseKo: '5초 유지 × 10회, 통증 허용 강도, 하루 2회부터 시작.',
      acceptableResponseKo: ['힘줄 주변의 가벼운 피로만 느껴짐', '종료 후 통증이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '힘이 갑자기 빠짐', '통증 급증'],
      regressionKo: '강도를 절반으로',
      progressionKo: '유지 시간을 먼저, 그다음 밴드 저항으로',
      targetFunctions: ['LIFTING', 'OVERHEAD', 'DRESSING'],
    },
    {
      id: 'SH_RC_02',
      sourceName: 'Band external / internal rotation — progressive load',
      displayNameKo: '밴드 외회전·내회전 점진 부하',
      domain: 'ROTATOR_CUFF_RESISTANCE',
      startingCriteriaKo: ['등척성 외회전·내회전을 수행할 수 있음', '팔꿈치를 옆구리에 고정한 채 동작이 가능함'],
      startingDoseKo: '가벼운 밴드 10~15회 × 2세트, 하루 1회부터 시작.',
      acceptableResponseKo: ['다음 날 통증이 기저로 회복됨', '어깨 으쓱 같은 보상 없이 수행됨'],
      stopReviewKo: [STOP_COMMON, '통증 누적', '보상 동작(어깨 으쓱)으로만 수행됨'],
      regressionKo: '밴드를 빼고 등척성으로',
      progressionKo: '밴드 강도 또는 세트 중 한 가지만 증가',
      targetFunctions: ['LIFTING', 'OVERHEAD'],
    },
    {
      id: 'SH_SCAP_01',
      sourceName: 'Serratus wall slide + scapular upward-rotation control',
      displayNameKo: '전거근 벽 슬라이드 + 견갑 상방회전 조절',
      domain: 'SCAPULAR_MOTOR_CONTROL',
      startingCriteriaKo: ['벽 슬라이드 중 어깨 통증 재현이 없음'],
      startingDoseKo: '8~10회 × 2세트, 하루 1~2회부터 시작.',
      acceptableResponseKo: ['견갑 주변 근육의 피로만 느껴짐', '반복하면서 동작이 더 편해짐'],
      stopReviewKo: [STOP_COMMON, '어깨 앞 통증 재현'],
      regressionKo: '범위를 줄이고 팔꿈치를 굽힌 채 시행',
      progressionKo: '범위를 먼저, 그다음 가벼운 저항',
      targetFunctions: ['OVERHEAD', 'DRESSING'],
    },
    {
      id: 'SH_SCAP_02',
      sourceName: 'Lower trapezius Y-raise / scapular depression hold',
      displayNameKo: '하부 승모근 Y-레이즈 / 견갑 하강 유지',
      domain: 'SCAPULAR_MOTOR_CONTROL',
      startingCriteriaKo: ['엎드린 자세가 가능함', '목·승모근 보상 없이 견갑을 움직일 수 있음'],
      startingDoseKo: '무부하 8~12회 × 2세트, 하루 1회부터 시작.',
      acceptableResponseKo: ['견갑 사이의 피로만 느껴짐', '종료 후 목 통증이 남지 않음'],
      stopReviewKo: [STOP_COMMON, '목·승모근 과긴장 보상', '두통 유발'],
      regressionKo: '횟수를 절반으로, 팔을 몸 가까이',
      progressionKo: '가벼운 부하(0.5~1 kg)만 추가',
      targetFunctions: ['OVERHEAD', 'LIFTING'],
    },
    {
      id: 'SH_STAB_01',
      sourceName: 'Closed-chain stability (wall push-up plus, ball compression, perturbation)',
      displayNameKo: '폐쇄 사슬 안정성(벽 푸시업 플러스·볼 압박·고유수용 흔들기)',
      domain: 'STABILITY_CONTROL',
      startingCriteriaKo: ['벽 푸시업 자세에서 빠지는 느낌이 없음', '급성 탈구 의심이 없음(안전 CLEAR)'],
      startingDoseKo: '벽 푸시업 플러스 10회 + 볼 압박 30초 × 3회, 하루 1회부터 시작.',
      acceptableResponseKo: ['어깨의 조절감이 유지됨', '종료 후 불안감이 늘지 않음'],
      stopReviewKo: [STOP_COMMON, '빠질 것 같은 느낌 재현 → 즉시 중단'],
      regressionKo: '벽 각도를 완화(더 서서)',
      progressionKo: '표면을 불안정하게 → 그다음 부하',
      targetFunctions: ['LIFTING', 'OVERHEAD'],
    },
    {
      id: 'SH_OVH_01',
      sourceName: 'Overhead graded exposure (wall slide → light-load elevation with leg/trunk drive)',
      displayNameKo: '머리 위 동작 단계적 노출(벽 슬라이드 → 가벼운 부하 거상)',
      domain: 'OVERHEAD_GRADED_EXPOSURE',
      startingCriteriaKo: ['벽 슬라이드가 통증 없이 가능함', '목표 기능에 머리 위 동작이 포함됨'],
      startingDoseKo: '벽 슬라이드 10회 → 무부하 거상 10회, 하루 2회부터 시작. 다리·몸통으로 밀어 올리는 연쇄를 함께.',
      acceptableResponseKo: ['거상 각도가 유지되거나 늘어남', '다음 날 통증이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '거상 중 통증 급증', '팔 힘이 빠짐'],
      regressionKo: '벽 슬라이드만',
      progressionKo: '부하를 0.5~1 kg 단계로만 증가',
      targetFunctions: ['OVERHEAD'],
    },
    {
      id: 'SH_FUNC_01',
      sourceName: 'Reach / lift tolerance — graded (counter height → shelf, load progression)',
      displayNameKo: '뻗기·들기 내성 단계적 늘리기(높이·무게)',
      domain: 'FUNCTIONAL_REACH_LIFT',
      startingCriteriaKo: ['목표 동작을 환자가 말할 수 있음', '현재 허용 높이·무게를 파악함'],
      startingDoseKo: '허용 무게의 70%부터, 높이는 한 단계(카운터 → 선반)씩. 하루 1회.',
      acceptableResponseKo: ['다음 날 기저 수준으로 회복됨', '허용량이 세션마다 유지되거나 늘어남'],
      stopReviewKo: [STOP_COMMON, '세션마다 허용량이 뚜렷하게 감소'],
      regressionKo: '높이·무게를 한 단계 아래로',
      progressionKo: '높이 또는 무게 중 한 가지만 변경',
      targetFunctions: ['LIFTING', 'DRESSING'],
    },
  ],
  // CLOSED §5 — 0단계는 표에 없음(능동 운동 미처방). 3단계 행 1(FUNC_01).
  stageTable: {
    SH_EDU_01: 1,
    SH_MOB_01: 1,
    SH_MOB_02: 1,
    SH_RC_01: 1,
    SH_RC_02: 2,
    SH_SCAP_01: 2,
    SH_SCAP_02: 2,
    SH_STAB_01: 2,
    SH_OVH_01: 2,
    SH_FUNC_01: 3,
  },
  // 원장 검사 스크립트 5 + 매트릭스 §6 추가 3 — 자동 삽입 없음.
  clinicianAddableExams: [
    { id: 'shoulder_exam_rom', title: '간단 능동/수동 ROM(목덜미·브라끈 잡기)', help: { howKo: '아픈 쪽 팔로 목덜미 뒤를 잡고, 다음에 브라끈 잡듯이 뒤를 잡게 한다. 능동과 수동을 비교한다.', whyKo: '외회전·내회전 범위를 빠르게 본다. 능동=수동 제한은 동결견·관절염 가설의 근거. POSITIVE(제한)면 가동 운동 2개가 직접 뒷받침된다.' } },
    { id: 'shoulder_exam_empty_can', title: '엠티캔 검사(Empty can, 극상근)', help: { howKo: '앞으로 나란히 팔을 펴고 엄지가 아래로 가게 돌린 뒤 아래로 누르는 힘에 버티게 한다.', whyKo: '극상근 저항 검사. 단독으로 파열을 진단하지 않는다. POSITIVE(통증·약화)면 등척성 회전근개 운동이 직접 뒷받침된다.' } },
    { id: 'shoulder_exam_er_resist', title: '극하근/소원근 저항검사', help: { howKo: '팔꿈치 90°로 옆구리에 붙이고 팔을 밖으로 벌리게 하며 안쪽으로 저항한다.', whyKo: '외회전근 저항 검사 — 근력/부하 반응. POSITIVE면 회전근개 저항 운동 2개가 직접 뒷받침된다. 갑작스런 뚜렷한 약화는 원장 판단 필드(객관적 근력저하)로 안전이 먼저.' } },
    { id: 'shoulder_exam_subscap_resist', title: '견갑하근 저항검사', help: { howKo: '같은 자세에서 팔을 안쪽으로 모으게 하며 바깥쪽으로 저항한다.', whyKo: '내회전근 저항 검사. 가설 근거이며 운동 뒷받침 쌍은 없다.' } },
    { id: 'shoulder_exam_horizontal_adduction', title: '견관절 수평내전', help: { howKo: '팔에 힘을 빼게 한 뒤 잡고 안쪽으로 움직인다.', whyKo: '견봉쇄골관절·후방 구조물 자극 여부 — 견봉쇄골·국소 기여 가설의 근거. 운동 뒷받침 쌍은 없다.' } },
    { id: 'shoulder_exam_scapular_control', title: '견갑 조절 관찰(팔 올리기·내리기)', help: { howKo: '팔 올리기·내리기 중 견갑 익상·과상승·조기 상승과 내릴 때의 조절 상실을 본다.', whyKo: 'PR#30 선택 입력 "movement control". POSITIVE면 견갑 조절 운동 2개가 직접 뒷받침된다.' } },
    { id: 'shoulder_exam_distal_neuro', title: '원위 신경 검사(팔·손 근력·감각·반사)', help: { howKo: '팔·손의 근력, 감각, 반사를 좌우 비교한다. 목 팩의 C5–T1 기준선과 같은 의미.', whyKo: 'POSITIVE = 새로 생기거나 악화된 객관적 결손 → 운동 추천이 잠기고 안전 재평가가 우선(D-1). 미시행은 후보를 비우지 않는다(어깨 운동은 신경 안정을 요구하지 않음).' } },
    { id: 'shoulder_exam_apprehension_relocation', title: 'Apprehension-relocation 검사', help: { howKo: '앙와위 외전 90°·외회전에서 불안감(apprehension)과 후방 압박 시 완화(relocation)를 본다. 급성 탈구 의심 시 시행하지 않는다.', whyKo: '불안정 가설의 근거. POSITIVE면 폐쇄 사슬 안정성 운동이 직접 뒷받침된다.' } },
  ],
  // CLOSED §6 — 순위 버킷만. subscap·horizontal adduction·distal neuro는 쌍 없음.
  directSupportByExam: {
    shoulder_exam_rom: ['SH_MOB_01', 'SH_MOB_02'],
    shoulder_exam_empty_can: ['SH_RC_01'],
    shoulder_exam_er_resist: ['SH_RC_01', 'SH_RC_02'],
    shoulder_exam_scapular_control: ['SH_SCAP_01', 'SH_SCAP_02'],
    shoulder_exam_apprehension_relocation: ['SH_STAB_01'],
  },
  // E-2 (D-1): 객관적 결손 검사만. apprehension·저항 검사(유발)는 넣지 않는다.
  neuroExamIds: ['shoulder_exam_distal_neuro'],
  directionalResponseApplicable: false,
  provenance: {
    hypothesisPatterns: 'CLINICIAN_APPROVED',
    targetFunctions: 'CLINICIAN_APPROVED',
    coreExercises: 'CLINICIAN_APPROVED',
    stageTable: 'CLINICIAN_APPROVED',
    clinicianAddableExams: 'CLINICIAN_APPROVED',
    directSupportByExam: 'CLINICIAN_APPROVED',
  },
  // CLOSED §7 — 서버 `DETAIL_CHECK_REGION_QUESTION_IDS.shoulder`와 같아야 한다(C절 parity).
  detailCheckQuestionIds: ['SH08'],
  evaluateSafety: (payload, judgment) => evaluateShoulderSafety(payload, judgment),
})
