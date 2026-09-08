/**
 * 목(NECK) 부위 팩 — **승인**, `productionApproved: true` (2026-09-07).
 *
 * 원장 승인 문서: `docs/NECK_EXERCISE_DECISIONS_v1.0_CLOSED.md` (PO "추천안으로 진행", 2026-09-07 —
 * `docs/NECK_EXERCISE_EVIDENCE_MATRIX_v0.1.md` §0 체크리스트 9개를 초안 제안값으로 확정).
 * 임상 프레임워크 정본: PR #30 `docs/recovered_rehab_architecture/NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md`.
 *
 * 내용 요약(CLOSED §3~§8):
 *   hypothesisPatterns     PR#30 §6 후보 5 (요통과 같은 수). MUST_EXCLUDE_*는 L0(`neckLogic.ts`, FROZEN).
 *   clinicianAddableExams  PR#30 §5 Selective Exam 11. 자동 제안 규칙 없음(APPROVED 행 없음 → []).
 *   rehabDomains           PR#30 §7 도메인 9.
 *   coreExercises          Core 9 (초안 12 → 9; 아카이브 8개는 병합·대체로 전부 폐기). 용량은 삼인당 시작
 *                          기본값(요통 Core-20과 같은 경계: 임상 임계값 아님).
 *   stageTable             1단계 3 / 2단계 6 (0단계 = 능동 운동 미처방, 요통 방식).
 *   eligibilityRules       NECK_NEURAL_01만 신경 안정 요구 + 원위 악화 중단, NECK_DIR_01은 신전 호전 조건 +
 *                          원위 악화 중단, 나머지 기본값(false/false).
 *   directSupportByExam    검사 4 → 운동(순위 버킷만). Spurling/distraction은 가설 근거라 넣지 않는다.
 *   neuroExamIds           C5–T1 기준선 + UMN 징후(D-1). 유발 검사는 넣지 않는다.
 *   directionalResponse    적용. 칩 라벨·도움말은 목 문구(E-1).
 *   detailCheckQuestionIds NECK_12 (서버 `DETAIL_CHECK_REGION_QUESTION_IDS.neck`와 parity).
 *
 * 금지(PR#30 §7): 진단명 → 운동 하드코딩 없음 — `tests/region-pack.spec.mjs` J절(E-4)이 단언한다.
 * 근거 경계: CPG 2017 분류별 권고 등급은 원문 대조가 이 세션에서 불가(egress 차단)해 어디에도 적지 않았다.
 * 이 팩은 운동 **범주**만 PR #30 §4 문장에 기대고, 운동별 용량은 근거 주장이 아니다(CLOSED §1).
 */
import { buildDraftPack } from './draftPack'
import { evaluateNeckSafety } from './regionSafety'

export const NECK_REGION_PACK = buildDraftPack({
  region: 'neck',
  productionApproved: true,
  sourceDocument:
    'docs/NECK_EXERCISE_DECISIONS_v1.0_CLOSED.md (2026-09-07, PO 승인) + PR #30 docs/recovered_rehab_architecture/NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md (프레임워크)',
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
  // CLOSED §3·§4 — Core 9. 중단·재검토 첫 항목은 전 운동 공통(새로운/진행하는 신경증상).
  exercises: [
    {
      id: 'NECK_MOB_01',
      sourceName: 'Cervical active ROM (rotation / side-bending / flexion-extension)',
      displayNameKo: '목 능동 가동범위 운동',
      domain: 'CERVICAL_MOBILITY',
      startingCriteriaKo: ['안전 확인 CLEAR', '능동 회전에서 날카로운 통증이나 팔 증상 증가가 없음'],
      startingDoseKo: '각 방향 5~8회, 1~2세트, 하루 2회부터 시작. 통증 허용 범위 안에서.',
      acceptableResponseKo: ['당김이나 익숙한 불편이 반복하면서 줄거나 유지됨', '종료 후 기저 수준으로 회복됨'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상(팔 힘빠짐·감각저하·손 서툼·보행 변화)', '팔/손 쪽으로 증상 확산', '어지럼·시야 변화'],
      regressionKo: '범위를 줄이고 앉아서, 횟수 절반으로',
      progressionKo: '범위 또는 횟수 중 한 가지만 점진적으로 증가',
      targetFunctions: ['LOOKING_BACK', 'DESK_WORK', 'OVERHEAD'],
    },
    {
      id: 'NECK_THX_01',
      sourceName: 'Thoracic mobility (foam roller extension or quadruped rotation)',
      displayNameKo: '흉추 가동성 운동(폼롤러 신전 또는 네발기기 회전)',
      domain: 'THORACIC_MOBILITY',
      startingCriteriaKo: ['네발기기 또는 폼롤러 위 자세를 유지할 수 있음', '등 위쪽 움직임에서 목·팔 증상 증가가 없음'],
      startingDoseKo: '5~8회, 1~2세트, 하루 1~2회부터 시작.',
      acceptableResponseKo: ['등 위쪽의 당김만 느껴짐', '반복하면서 움직임이 더 편해지거나 최소한 악화되지 않음'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '목·팔 증상 증가', '흉추 압통 급증'],
      regressionKo: '범위를 줄이고 벽에 기대어 시행',
      progressionKo: '범위 또는 유지 시간 중 한 가지만 증가',
      targetFunctions: ['LOOKING_BACK', 'DESK_WORK', 'OVERHEAD'],
    },
    {
      id: 'NECK_DIR_01',
      sourceName: 'Directional repeated movement — retraction/extension (extension-favorable)',
      displayNameKo: '방향성 반복 운동(턱 당기고 뒤로 젖히기)',
      domain: 'DIRECTIONAL_RESPONSE',
      startingCriteriaKo: ['목 움직임 반응이 "젖히면(신전) 호전"으로 기록됨', '반복 중 팔 쪽으로 증상 확산이 없음'],
      startingDoseKo: '후인 10회 → 신전 5~10회, 하루 3~5회부터 시작.',
      acceptableResponseKo: ['증상이 목 중심으로 모이거나 줄어듦', '반복 후 범위가 늘거나 유지됨'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '팔 쪽으로 퍼짐(원위부 악화) → 즉시 중단', '두통·어지럼 유발'],
      regressionKo: '후인만, 앉아서 횟수를 줄여서',
      progressionKo: '신전 범위 또는 횟수 중 한 가지만 증가',
      targetFunctions: ['DESK_WORK', 'LOOKING_BACK'],
      rule: { requiredDirectionalResponse: 'EXTENSION_FAVORABLE', stopOnDistalWorsening: true },
    },
    {
      id: 'NECK_DNF_01',
      sourceName: 'Deep neck flexor activation (chin tuck, low load, short hold)',
      displayNameKo: '심부경부굴곡근 활성화(턱 당기기)',
      domain: 'DNF_CONTROL_ENDURANCE',
      startingCriteriaKo: ['앙와위 자세를 유지할 수 있음', '턱 당기기에서 목 앞 표층 근육의 과활성이나 통증이 없음'],
      startingDoseKo: '5~10초 유지 × 10회, 하루 2회부터 시작.',
      acceptableResponseKo: ['목 앞 깊은 곳의 가벼운 피로만 느껴짐', '종료 후 두통·불편이 남지 않음'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '두통 유발', '어지럼'],
      regressionKo: '유지 3~5초로 줄이고 머리 받침을 높임',
      progressionKo: '유지 시간만 점진적으로 증가',
      targetFunctions: ['DESK_WORK', 'SLEEP', 'LOOKING_BACK'],
    },
    {
      id: 'NECK_DNF_02',
      sourceName: 'Deep neck flexor endurance (progressive hold)',
      displayNameKo: '심부경부굴곡근 지구력(유지 시간 늘리기)',
      domain: 'DNF_CONTROL_ENDURANCE',
      startingCriteriaKo: ['턱 당기기(활성화)를 수행할 수 있음', '대체 전략 없이 10초 유지가 가능함'],
      startingDoseKo: '10~15초 유지 × 10회부터 시작. 총 유지 시간을 점진적으로.',
      acceptableResponseKo: ['피로는 있으나 통증이 누적되지 않음', '다음 회차 시작 전 회복됨'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '표층 굴곡근 과활성·떨림으로 대체됨', '두통 유발'],
      regressionKo: '심부경부굴곡근 활성화(짧은 유지)로 돌아감',
      progressionKo: '유지 시간 또는 반복 중 한 가지만 증가',
      targetFunctions: ['DESK_WORK', 'LOOKING_BACK'],
    },
    {
      id: 'NECK_EXT_01',
      sourceName: 'Cervical extensor endurance (prone / quadruped neutral head hold)',
      displayNameKo: '목 뒤 근육 지구력(엎드려 머리 중립 유지)',
      domain: 'CERVICAL_EXTENSOR_ENDURANCE',
      startingCriteriaKo: ['엎드리거나 네발기기 자세가 가능함', '머리 중립 유지에 통증이 없음'],
      startingDoseKo: '10초 유지 × 8~10회, 하루 1~2회부터 시작.',
      acceptableResponseKo: ['목 뒤 근육의 피로만 느껴짐', '종료 후 두통이 남지 않음'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '두통·어지럼 유발'],
      regressionKo: '유지 5초로 줄이고 이마를 받침',
      progressionKo: '유지 시간만 증가',
      targetFunctions: ['DESK_WORK', 'OVERHEAD'],
    },
    {
      id: 'NECK_SCAP_01',
      sourceName: 'Scapular control (retraction-depression hold / wall slide)',
      displayNameKo: '견갑 조절(견갑 후인·하강 유지, 벽 슬라이드)',
      domain: 'SCAPULAR_CONTROL_STRENGTH',
      startingCriteriaKo: ['팔 올리기 중 견갑 움직임을 관찰할 수 있음', '동작 중 어깨 통증 재현이 없음'],
      startingDoseKo: '벽 슬라이드 8~10회 또는 후인·하강 유지 10초 × 10회, 하루 1~2회부터 시작.',
      acceptableResponseKo: ['견갑 주변 근육의 피로만 느껴짐', '반복하면서 동작이 더 편해짐'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '어깨 통증 재현(어깨 팩 검토)', '팔 저림'],
      regressionKo: '범위를 줄이고 팔꿈치를 굽힌 채 시행',
      progressionKo: '범위를 먼저, 그다음 가벼운 저항',
      targetFunctions: ['OVERHEAD', 'DESK_WORK'],
    },
    {
      id: 'NECK_NEURAL_01',
      sourceName: 'Upper-limb neural mobility slider (symptom-biased nerve)',
      displayNameKo: '팔 신경 가동성 슬라이더',
      domain: 'NEURAL_MOBILITY',
      startingCriteriaKo: ['신경학적 기준선(C5–T1·UMN)이 안정으로 기록됨', '원위부 악화 없음', '통증 없는 범위에서만'],
      startingDoseKo: '통증 없는 범위의 슬라이더 10회, 하루 2회부터 시작.',
      acceptableResponseKo: ['가벼운 당김만 느껴짐', '종료 후 증상이 기저로 회복됨'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '팔/손 증상 확산·지속', '감각 변화 → 중단 후 신경 재평가'],
      regressionKo: '범위를 줄이고 목을 중립으로 고정',
      progressionKo: '범위만 증가(텐셔너 전환은 원장 판단)',
      targetFunctions: ['LOOKING_BACK', 'DESK_WORK', 'SLEEP'],
      rule: { requiresStableNeuro: true, stopOnDistalWorsening: true },
    },
    {
      id: 'NECK_EXPO_01',
      sourceName: 'Graded exposure — work-posture tolerance (sitting / screen time)',
      displayNameKo: '작업 자세 내성 단계적 늘리기',
      domain: 'GRADED_EXPOSURE_WORK_POSTURE',
      startingCriteriaKo: ['현재 연속 앉기·작업 허용 시간을 환자가 말할 수 있음'],
      startingDoseKo: '허용 시간의 70~80%부터 시작, 구간 사이 1~2분 목·견갑 리셋.',
      acceptableResponseKo: ['다음 구간 시작 전 기저 수준으로 회복됨', '구간이 세션마다 유지되거나 늘어남'],
      stopReviewKo: ['새로운 또는 진행하는 신경증상', '세션마다 허용 시간이 뚜렷하게 감소'],
      regressionKo: '구간을 짧게, 휴식을 길게',
      progressionKo: '구간 연장 또는 휴식 단축 중 한 가지만 변경',
      targetFunctions: ['DESK_WORK'],
    },
  ],
  // CLOSED §5 — 0단계는 표에 없음(능동 운동 미처방). 3단계 전용 행 없음: 2단계 운동은 3단계에서도 허용.
  stageTable: {
    NECK_MOB_01: 1,
    NECK_DIR_01: 1,
    NECK_DNF_01: 1,
    NECK_THX_01: 2,
    NECK_DNF_02: 2,
    NECK_EXT_01: 2,
    NECK_SCAP_01: 2,
    NECK_NEURAL_01: 2,
    NECK_EXPO_01: 2,
  },
  // PR#30 §5 Selective Exam Engine v0.1 — 자동 삽입 없음(자동 규칙은 APPROVED 행에서만).
  clinicianAddableExams: [
    { id: 'neck_exam_crom', title: '경추 능동 관절가동범위(CROM) + 증상 반응', help: { howKo: '굴곡·신전·좌우 회전·측굴을 능동으로 하게 하고 제한 방향과 평소 증상 재현·감소를 본다.', whyKo: 'PR#30 Base 검사. 축성 목통증·가동성 제한 가설의 지지/반박 근거이자 재평가 기준값. POSITIVE면 목 능동 가동범위 운동이 직접 뒷받침된다.' } },
    { id: 'neck_exam_target_function_reproduction', title: '목표 기능 재현', help: { howKo: '환자가 고른 목표 동작(뒤돌아보기·책상 자세 등)을 실제로 해 보게 하고 증상 재현 여부를 본다.', whyKo: 'PR#30 Base 검사. 재평가는 같은 동작으로 비교한다.' } },
    { id: 'neck_exam_neuro_c5_t1', title: 'C5–T1 신경학적 기준선(근력·감각·반사)', help: { howKo: 'C5–T1 근절 근력, 피부절 감각, 이두·요골·삼두 반사를 좌우 비교한다.', whyKo: 'POSITIVE = 새로 생기거나 악화된 객관적 결손 → 운동 추천이 잠기고 안전 재평가가 우선(D-1). NEGATIVE = 안정. 미시행은 "이상 없음"으로 가정하지 않는다.' } },
    { id: 'neck_exam_spurling', title: 'Spurling 검사', help: { howKo: '경추를 신전·측굴(±회전)한 상태에서 축성 압박을 가해 팔 증상 재현을 본다.', whyKo: '신경근 관여 가설의 지지 근거(유발 검사). 단독으로 진단하지 않고 distraction·ULTT·신경학적 검사와 묶어 본다. 운동 뒷받침 쌍에는 넣지 않는다.' } },
    { id: 'neck_exam_distraction', title: '경추 견인(Distraction) 검사', help: { howKo: '앙와위/좌위에서 머리를 축 방향으로 가볍게 견인해 팔 증상 감소를 본다.', whyKo: '신경근 관여 가설 클러스터의 한 항목. 감소하면 지지.' } },
    { id: 'neck_exam_ultt', title: '상지 신경긴장 검사(ULTT, 해당 신경 편향)', help: { howKo: '증상 분포에 맞는 신경 편향(정중/요골/척골)으로 상지를 순차 긴장시키며 증상 재현·좌우 차이를 본다.', whyKo: '신경근 관여·신경 가동성 도메인 판단 근거. POSITIVE면 팔 신경 가동성 슬라이더가 직접 뒷받침된다(신경 기준선이 안정일 때만 후보). 클러스터 해석은 원장 판단.' } },
    { id: 'neck_exam_umn', title: '상위운동신경(UMN) 징후 + 보행/탠덤', help: { howKo: '보행·탠덤 보행, 반사 항진·비대칭, Hoffmann, Babinski, 클로누스, 손 기민성을 본다.', whyKo: 'POSITIVE = 척수 관여 우려 → 일상 운동 추천 잠금 + 의학적 평가 우선(D-1). Hoffmann 하나로 확진하지 않는다(PR#30 §2-2 A).' } },
    { id: 'neck_exam_upper_cervical_cfrt', title: '상부 경추 평가 + 경추 굴곡-회전 검사(CFRT)', help: { howKo: '상부 경추 분절 평가와 함께 경추를 굴곡한 상태에서 좌우 회전 범위·증상 재현을 본다.', whyKo: '경추성 두통 가설의 지지 근거. cutoff는 미고정. 새롭고 유례없이 심한 두통은 안전 문제가 먼저다.' } },
    { id: 'neck_exam_dnf_endurance', title: '심부경부굴곡근 지구력/조절', help: { howKo: '앙와위 턱 당기기 유지(또는 두부 들기 유지) 시간과 대체 전략(표층 굴곡근 과활성) 여부를 본다.', whyKo: '움직임 조절·지구력 부족 가설의 근거. POSITIVE면 심부경부굴곡근 활성화·지구력 운동이 직접 뒷받침된다.' } },
    { id: 'neck_exam_scapular_control', title: '견갑 조절/지구력', help: { howKo: '팔 올리기·유지 중 견갑 움직임(익상·과상승·조기 상승)과 유지 내성을 본다.', whyKo: 'POSITIVE면 견갑 조절 운동이 직접 뒷받침된다. 어깨 우세 표현과의 구분에도 쓴다.' } },
    { id: 'neck_exam_shoulder_vs_neck', title: '어깨 AROM/PROM/저항 vs 경추 증상 재현 비교', help: { howKo: '어깨 능동·수동 가동범위와 저항 검사에서 평소 증상이 재현되는지, 경추 움직임과 어느 쪽이 더 일치하는지 비교한다.', whyKo: '어깨·말초 기여 가설. 목 진단으로 억지 귀속하지 않는다(PR#30). NS01 어깨 우세면 목 팩은 구동하지 않는다.' } },
  ],
  // CLOSED §7 — 순위 버킷만 바꾼다. 후보 집합은 목표 기능·단계·적격성만이 정한다.
  directSupportByExam: {
    neck_exam_ultt: ['NECK_NEURAL_01'],
    neck_exam_dnf_endurance: ['NECK_DNF_01', 'NECK_DNF_02'],
    neck_exam_scapular_control: ['NECK_SCAP_01'],
    neck_exam_crom: ['NECK_MOB_01'],
  },
  // E-2 (D-1): 객관적 신경학적 결손 검사만. Spurling/ULTT(유발 검사)는 넣지 않는다.
  neuroExamIds: ['neck_exam_neuro_c5_t1', 'neck_exam_umn'],
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
  // 출처: 전 필드 원장 승인(PO 위임 승인 2026-09-07 — DECISIONS 참조). 승인 게이트 통과의 전제.
  provenance: {
    hypothesisPatterns: 'CLINICIAN_APPROVED',
    targetFunctions: 'CLINICIAN_APPROVED',
    coreExercises: 'CLINICIAN_APPROVED',
    stageTable: 'CLINICIAN_APPROVED',
    clinicianAddableExams: 'CLINICIAN_APPROVED',
    directSupportByExam: 'CLINICIAN_APPROVED',
  },
  // CLOSED §8 — 서버 `DETAIL_CHECK_REGION_QUESTION_IDS.neck`와 같아야 한다(C절 parity).
  detailCheckQuestionIds: ['NECK_12'],
  evaluateSafety: (payload) => evaluateNeckSafety(payload),
})
