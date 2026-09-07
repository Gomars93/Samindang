/**
 * 무릎(KNEE) 부위 팩 — **승인**, `productionApproved: true` (2026-09-07).
 *
 * 원장 승인 문서: `docs/KNEE_EXERCISE_DECISIONS_v1.0_CLOSED.md` (PO "허리를 기준으로 모든 파트 진행", 2026-09-07).
 * 임상 프레임워크 정본: PR #30 `docs/recovered_rehab_architecture/KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md`
 * (phenotype 7, Domain 11, 금지 6). 근거 확인: `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §4 (B수준).
 *
 * 내용 요약(CLOSED §2~§8):
 *   hypothesisPatterns     PR#30 phenotype 7 그대로.
 *   clinicianAddableExams  아카이브 4(스쿼트·스텝다운·한 발 서기·TKE) + 추가 6 = 10.
 *   rehabDomains           PR#30 Domain 11 (GRADED_EXPOSURE는 독립 행 없음 — 목의 AEROBIC과 같은 처리).
 *   coreExercises          Core 12. 아카이브 8개는 병합·대체·미채택으로 전부 폐기(VMO 고립·90/90·내전 폐기).
 *   stageTable             1단계 4 / 2단계 6 / 3단계 2.
 *   eligibilityRules       전부 기본값. 방향성 카드 미적용. neuroExamIds 없음(원위 신경 변화는 L0 문항 KNEE_02).
 *   directSupportByExam    검사 8 → 운동(순위 버킷만). 안정성·관절선 검사는 가설 근거이자 균형·기능 복귀 행의 뒷받침.
 *   detailCheckQuestionIds KNEE_12(아침 강직 지속), KNEE_13(휘청·빠질 느낌).
 *
 * 금지(PR#30): "OA = 대퇴사두근 운동 1개", "PFP = VMO 고립", "반월판 = 회전 금지", "ACL = 동일 재활", "건 = 휴식"
 * 하드코딩 없음 — 가설 id가 운동 쪽에 없다(E-4 J절). DVT·화농관절·골절/신경혈관·신전기전 파열·진성 잠김은 L0
 * (`kneeLogic.ts`, FROZEN).
 */
import { buildDraftPack } from './draftPack'
import { evaluateKneeSafety } from './regionSafety'

/** 전 운동 공통 중단·재검토 첫 항목(CLOSED §4) — 비네트 0절이 단언한다. */
const STOP_COMMON = '새로운 또는 진행하는 신경증상(다리 힘빠짐·감각저하) 또는 무릎이 완전히 펴지지 않는 잠김·급격한 붓기'

export const KNEE_REGION_PACK = buildDraftPack({
  region: 'knee',
  productionApproved: true,
  sourceDocument:
    'docs/KNEE_EXERCISE_DECISIONS_v1.0_CLOSED.md (2026-09-07, PO 승인) + PR #30 docs/recovered_rehab_architecture/KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md (프레임워크)',
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
  // CLOSED §3·§4 — Core 12. 용량은 삼인당 시작 기본값(임상 임계값 아님).
  exercises: [
    {
      id: 'KNEE_EDU_01',
      sourceName: 'Education + walking / activity maintenance (pain-response rule)',
      displayNameKo: '걷기·활동 유지 + 통증 반응 교육',
      domain: 'ACTIVITY_AEROBIC',
      startingCriteriaKo: ['안전 확인 CLEAR', '환자가 현재 편하게 걷는 시간을 말할 수 있음'],
      startingDoseKo: '매일 편한 걷기 시간의 70~80%부터, 하루 1~2회. 운동 중 통증은 참을 만한 범위(다음 날 아침 기저로 회복)면 계속.',
      acceptableResponseKo: ['운동 초기의 일시적 통증 증가가 다음 날 기저로 회복됨', '걷기 시간이 세션마다 유지되거나 늘어남'],
      stopReviewKo: [STOP_COMMON, '걷기 후 붓기가 다음 날까지 남음', '세션마다 허용 시간이 뚜렷하게 감소'],
      regressionKo: '걷기 시간을 줄이고 하루 2~3회로 나눔',
      progressionKo: '시간 또는 속도 중 한 가지만 증가',
      targetFunctions: ['WALKING', 'STAIRS', 'SQUAT', 'RUNNING'],
    },
    {
      id: 'KNEE_MOB_01',
      sourceName: 'Knee flexion / extension mobility (heel slide, prone hang, wall slide)',
      displayNameKo: '무릎 굽힘·펴기 가동성(힐 슬라이드·엎드려 매달기)',
      domain: 'MOBILITY',
      startingCriteriaKo: ['잠김(완전 신전 불가)이 없음', '가동 중 날카로운 통증이 없음'],
      startingDoseKo: '힐 슬라이드 10회 + 신전 유지 30초 × 3회, 하루 2~3회부터 시작. 통증 허용 범위 안에서.',
      acceptableResponseKo: ['당김만 느껴짐', '반복하면서 범위가 유지되거나 늘어남'],
      stopReviewKo: [STOP_COMMON, '가동 중 걸림·잠김이 새로 생김', '붓기 증가'],
      regressionKo: '범위를 줄이고 능동 보조 없이 능동만',
      progressionKo: '범위 또는 유지 시간 중 한 가지만 증가',
      targetFunctions: ['SQUAT', 'STAIRS', 'WALKING'],
    },
    {
      id: 'KNEE_QUAD_01',
      sourceName: 'Quadriceps activation (quad set / SLR / terminal knee extension, low load)',
      displayNameKo: '대퇴사두근 활성화(쿼드셋·다리 들기·끝 범위 펴기)',
      domain: 'QUADRICEPS_STRENGTH',
      startingCriteriaKo: ['다리를 편 채 들어 올릴 수 있음(신전기전 파열 우려 없음)', '수축 중 통증이 허용 범위'],
      startingDoseKo: '5초 유지 × 10회 × 2세트, 하루 2회부터 시작.',
      acceptableResponseKo: ['허벅지 앞의 피로만 느껴짐', '종료 후 무릎 통증이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '다리 들기가 갑자기 불가능해짐', '붓기 증가'],
      regressionKo: '유지 시간을 3초로, 무릎 아래 수건 받침',
      progressionKo: '유지 시간을 먼저, 그다음 발목 부하',
      targetFunctions: ['WALKING', 'STAIRS', 'SQUAT'],
    },
    {
      id: 'KNEE_QUAD_02',
      sourceName: 'Sit-to-stand / box squat (pain-tolerable depth)',
      displayNameKo: '앉았다 일어서기·박스 스쿼트(통증 허용 깊이)',
      domain: 'SIT_TO_STAND_SQUAT_STAIR',
      startingCriteriaKo: ['대퇴사두근 활성화를 수행할 수 있음', '의자 높이에서 통증 허용 범위로 일어설 수 있음'],
      startingDoseKo: '높은 의자 8~10회 × 2세트, 하루 1~2회부터 시작. 깊이는 통증 허용 각도까지만.',
      acceptableResponseKo: ['허벅지 피로만 느껴짐', '다음 날 통증이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '동작 중 무릎이 휘청하거나 빠지는 느낌', '다음 날 붓기'],
      regressionKo: '의자를 높이고 손으로 보조',
      progressionKo: '깊이 또는 횟수 중 한 가지만 증가',
      targetFunctions: ['SQUAT', 'STAIRS'],
    },
    {
      id: 'KNEE_STEP_01',
      sourceName: 'Step-up / step-down control (stair tolerance, hip-knee alignment)',
      displayNameKo: '스텝업·스텝다운 조절(계단 내성)',
      domain: 'SIT_TO_STAND_SQUAT_STAIR',
      startingCriteriaKo: ['낮은 단(10~15 cm)을 통증 허용 범위로 오를 수 있음', '무릎 안쪽 붕괴 없이 조절할 수 있음'],
      startingDoseKo: '낮은 단 8~10회 × 2세트(양쪽), 하루 1회부터 시작.',
      acceptableResponseKo: ['무릎 앞 통증이 반복 중 늘지 않음', '정렬(무릎이 발끝 위)을 유지함'],
      stopReviewKo: [STOP_COMMON, '내려설 때 통증 급증', '무릎 안쪽 붕괴가 조절되지 않음'],
      regressionKo: '단 높이를 낮추고 난간 잡기',
      progressionKo: '단 높이를 먼저, 그다음 속도',
      targetFunctions: ['STAIRS', 'WALKING'],
    },
    {
      id: 'KNEE_GLUT_01',
      sourceName: 'Hip posterolateral strengthening (side-lying abduction, band ER, clam)',
      displayNameKo: '고관절 후외측 강화(옆으로 누워 벌리기·밴드 외회전·클램)',
      domain: 'HAMSTRING_CALF_HIP_STRENGTH',
      startingCriteriaKo: ['옆으로 누운 자세가 가능함', '동작 중 무릎 통증 재현이 없음'],
      startingDoseKo: '10~15회 × 2세트, 하루 1회부터 시작.',
      acceptableResponseKo: ['엉덩이 옆·뒤의 피로만 느껴짐', '무릎 통증이 늘지 않음'],
      stopReviewKo: [STOP_COMMON, '허리·고관절 앞쪽 통증 유발'],
      regressionKo: '범위를 줄이고 밴드 제거',
      progressionKo: '밴드 강도 또는 세트 중 한 가지만 증가',
      targetFunctions: ['STAIRS', 'WALKING', 'RUNNING', 'SQUAT'],
    },
    {
      id: 'KNEE_HSC_01',
      sourceName: 'Hamstring / calf strengthening (bridge, calf raise)',
      displayNameKo: '햄스트링·종아리 강화(브릿지·카프 레이즈)',
      domain: 'HAMSTRING_CALF_HIP_STRENGTH',
      startingCriteriaKo: ['종아리 붓기·통증(혈전 우려)이 없음', '동작 중 무릎 뒤 날카로운 통증이 없음'],
      startingDoseKo: '브릿지 10회 × 2세트 + 카프 레이즈 10~15회 × 2세트, 하루 1회부터 시작.',
      acceptableResponseKo: ['허벅지 뒤·종아리의 피로만 느껴짐', '다음 날 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '종아리 한쪽 붓기·통증', '무릎 뒤 붓기'],
      regressionKo: '양발 → 범위 축소, 브릿지는 짧게 유지',
      progressionKo: '한 발 → 그다음 부하',
      targetFunctions: ['WALKING', 'STAIRS', 'RUNNING'],
    },
    {
      id: 'KNEE_BAL_01',
      sourceName: 'Single-leg balance / neuromuscular control progression',
      displayNameKo: '한 발 균형·신경근 조절(눈 뜨고 → 불안정면)',
      domain: 'NEUROMUSCULAR_BALANCE',
      startingCriteriaKo: ['한 발로 10초 설 수 있음(붙잡을 것 옆에서)', '급성 불안정 사건이 없음'],
      startingDoseKo: '한 발 서기 20~30초 × 3회(양쪽), 하루 1~2회부터 시작.',
      acceptableResponseKo: ['흔들림이 반복하면서 줄어듦', '무릎 통증이 늘지 않음'],
      stopReviewKo: [STOP_COMMON, '무릎이 빠지는 느낌 재현 → 중단'],
      regressionKo: '손끝을 벽에 대고 시간을 줄임',
      progressionKo: '눈 감기 또는 불안정면 중 한 가지만 추가',
      targetFunctions: ['WALKING', 'STAIRS', 'RUNNING'],
    },
    {
      id: 'KNEE_PF_01',
      sourceName: 'Patellofemoral graded loading (wall sit / leg press, limited range)',
      displayNameKo: '슬개대퇴 단계적 부하(벽 스쿼트·레그프레스, 제한 각도)',
      domain: 'PF_GRADED_LOADING',
      startingCriteriaKo: ['제한 각도(0~45°)에서 통증이 허용 범위', '대퇴사두근 활성화를 수행할 수 있음'],
      startingDoseKo: '벽 스쿼트 30초 유지 × 3회 또는 레그프레스 제한 각도 10회 × 2세트, 하루 1회부터 시작.',
      acceptableResponseKo: ['무릎 앞 통증이 운동 중 늘지 않음', '다음 날 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '무릎 앞 통증 급증', '슬개골이 빠지는 느낌'],
      regressionKo: '각도를 줄이고 유지 시간 절반',
      progressionKo: '각도 또는 부하 중 한 가지만 증가',
      targetFunctions: ['SQUAT', 'STAIRS', 'RUNNING'],
    },
    {
      id: 'KNEE_TEND_01',
      sourceName: 'Patellar tendon load progression (isometric → slow heavy resistance)',
      displayNameKo: '슬개건 부하 점진(등척성 → 느린 고부하)',
      domain: 'TENDON_LOAD_PROGRESSION',
      startingCriteriaKo: ['급성 건파열 우려가 없음(안전 CLEAR)', '등척성 수축 중 통증이 허용 범위'],
      startingDoseKo: '등척성 무릎 신전(굴곡 30~60°) 30~45초 × 5회, 하루 1~2회부터 시작. 휴식은 쉬는 것이 아니라 부하를 낮추는 것.',
      acceptableResponseKo: ['운동 직후 힘줄 통증이 줄거나 유지됨', '다음 날 아침 통증이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '다음 날 아침 힘줄 통증이 뚜렷하게 악화', '갑작스런 힘 빠짐'],
      regressionKo: '등척성만, 각도를 줄임',
      progressionKo: '등척성 → 느린 등장성(3초 내림/3초 올림) → 부하',
      targetFunctions: ['SQUAT', 'STAIRS', 'RUNNING'],
    },
    {
      id: 'KNEE_LIG_01',
      sourceName: 'Ligament return-to-function (deceleration / change-of-direction control: lunge, lateral step)',
      displayNameKo: '감속·방향 전환 조절(런지·측면 스텝)',
      domain: 'LIGAMENT_RETURN_TO_FUNCTION',
      startingCriteriaKo: ['한 발 균형과 스텝다운을 조절할 수 있음', '보행 중 휘청·빠짐이 없음'],
      startingDoseKo: '앞 런지 8회 + 측면 스텝 8회(양쪽) × 2세트, 하루 1회부터 시작.',
      acceptableResponseKo: ['무릎이 흔들리지 않고 착지를 조절함', '다음 날 붓기가 없음'],
      stopReviewKo: [STOP_COMMON, '방향 전환 중 휘청·빠짐 재현 → 중단', '다음 날 붓기'],
      regressionKo: '보폭을 줄이고 난간 옆에서',
      progressionKo: '속도 또는 보폭 중 한 가지만 증가',
      targetFunctions: ['RUNNING', 'STAIRS'],
    },
    {
      id: 'KNEE_GAIT_01',
      sourceName: 'Gait / load progression toward running (walk-run intervals)',
      displayNameKo: '달리기 복귀 단계적(걷기·뛰기 교대)',
      domain: 'GAIT_LOAD_PROGRESSION',
      startingCriteriaKo: ['30분 걷기가 통증 없이 가능함', '한 발 균형·스텝다운을 조절할 수 있음'],
      startingDoseKo: '걷기 4분 + 가볍게 뛰기 1분 × 4회부터 시작, 격일.',
      acceptableResponseKo: ['다음 날 아침 통증·붓기가 기저로 회복됨', '구간이 세션마다 유지되거나 늘어남'],
      stopReviewKo: [STOP_COMMON, '뛰기 후 붓기', '세션마다 허용 구간이 감소'],
      regressionKo: '걷기 구간을 늘리고 뛰기 구간을 줄임',
      progressionKo: '뛰기 구간 또는 세션 수 중 한 가지만 증가',
      targetFunctions: ['RUNNING'],
    },
  ],
  // CLOSED §5 — 0단계는 표에 없음. 1단계 4 / 2단계 6 / 3단계 2.
  stageTable: {
    KNEE_EDU_01: 1,
    KNEE_MOB_01: 1,
    KNEE_QUAD_01: 1,
    KNEE_GLUT_01: 1,
    KNEE_QUAD_02: 2,
    KNEE_STEP_01: 2,
    KNEE_HSC_01: 2,
    KNEE_BAL_01: 2,
    KNEE_PF_01: 2,
    KNEE_TEND_01: 2,
    KNEE_LIG_01: 3,
    KNEE_GAIT_01: 3,
  },
  // 아카이브 4 + 추가 6 — 자동 삽입 없음.
  clinicianAddableExams: [
    { id: 'knee_exam_squat', title: '스쿼트 관찰(무릎 안쪽 붕괴·회전)', help: { howKo: '스쿼트에서 무릎 안쪽 붕괴, 발끝 대비 내외회전, 힙힌지 실패를 본다.', whyKo: '무릎 중심 스쿼트인지 고관절 전략인지 구분(움직임 조절). POSITIVE면 앉았다 일어서기·박스 스쿼트가 직접 뒷받침된다.' } },
    { id: 'knee_exam_step_down', title: '스텝다운 검사', help: { howKo: '한 발로 내려서며 무릎 안쪽 붕괴·통증을 본다.', whyKo: '고관절 안정성·신경근 조절 평가. POSITIVE면 스텝업·스텝다운 조절과 고관절 후외측 강화가 직접 뒷받침된다.' } },
    { id: 'knee_exam_single_leg_stance', title: '한 발 서기', help: { howKo: '발목–무릎–고관절 라인 붕괴 여부와 유지 시간을 본다.', whyKo: '균형·조절 도메인 평가. POSITIVE면 한 발 균형 운동이 직접 뒷받침된다.' } },
    { id: 'knee_exam_tke', title: '무릎 완전 신전(TKE)', help: { howKo: '무릎 완전 신전 시 통증·보상을 본다. 능동 신전 불가는 안전 분기(신전기전 파열 우려).', whyKo: '대퇴사두근 개입·신전 제한 확인. POSITIVE면 대퇴사두근 활성화가 직접 뒷받침된다.' } },
    { id: 'knee_exam_rom', title: '무릎 굴곡·신전 가동범위(능동/수동, 끝느낌)', help: { howKo: '앙와위에서 능동·수동 굴곡·신전 범위와 끝느낌, 좌우 차이를 본다.', whyKo: 'PR#30 선택 입력 ROM. POSITIVE(제한)면 가동성 운동이 직접 뒷받침된다. 완전 신전 차단은 잠김 → 안전 문항으로.' } },
    { id: 'knee_exam_effusion', title: '관절액 저류(스윕·부유 검사)', help: { howKo: '슬개상낭 스윕 또는 슬개골 부유로 관절액 저류 유무를 본다.', whyKo: 'PR#30 선택 입력 effusion. 급성 외상 후 빠른 붓기는 인대·골 손상 맥락, 열감·발적 동반은 감염 안전 분기. 가설 근거이며 운동 뒷받침 쌍은 없다.' } },
    { id: 'knee_exam_quad_lag', title: '신전 지연(quad lag)', help: { howKo: '다리 들기에서 무릎이 완전 신전을 유지하지 못하는 각도를 본다.', whyKo: '대퇴사두근 억제·약화. POSITIVE면 대퇴사두근 활성화가 직접 뒷받침된다.' } },
    { id: 'knee_exam_stability', title: '인대 안정성(Lachman·내외반 스트레스)', help: { howKo: 'Lachman, 전방·후방 당김, 0°·30° 내외반 스트레스에서 이완·끝느낌·통증을 본다.', whyKo: '인대 손상·불안정 가설의 근거. POSITIVE(이완)면 한 발 균형과 감속·방향 전환 조절이 직접 뒷받침된다 — 진단명이 아니라 검사 소견이 뒷받침한다.' } },
    { id: 'knee_exam_pf_load', title: '슬개대퇴·슬개건 부하 재현(한 발 스쿼트·경사 스쿼트)', help: { howKo: '한 발 스쿼트 또는 경사판 스쿼트에서 무릎 앞 통증 재현과 위치(슬개골 주변 vs 힘줄)를 본다.', whyKo: 'PR#30 선택 입력 load response. POSITIVE면 슬개대퇴 단계적 부하와 슬개건 부하 점진이 직접 뒷받침된다.' } },
    { id: 'knee_exam_joint_line', title: '관절선 압통·반월판 유발(McMurray·Thessaly)', help: { howKo: '내외측 관절선 압통, McMurray, Thessaly 20°에서 통증·걸림을 본다.', whyKo: '반월판 가설의 근거(복합 소견으로 판단). 진성 잠김은 안전 분기. 운동 뒷받침 쌍은 없다.' } },
  ],
  // CLOSED §6 — 순위 버킷만. effusion·joint_line은 쌍 없음.
  directSupportByExam: {
    knee_exam_tke: ['KNEE_QUAD_01'],
    knee_exam_quad_lag: ['KNEE_QUAD_01'],
    knee_exam_squat: ['KNEE_QUAD_02'],
    knee_exam_step_down: ['KNEE_STEP_01', 'KNEE_GLUT_01'],
    knee_exam_single_leg_stance: ['KNEE_BAL_01'],
    knee_exam_rom: ['KNEE_MOB_01'],
    knee_exam_pf_load: ['KNEE_PF_01', 'KNEE_TEND_01'],
    knee_exam_stability: ['KNEE_BAL_01', 'KNEE_LIG_01'],
  },
  directionalResponseApplicable: false,
  provenance: {
    hypothesisPatterns: 'CLINICIAN_APPROVED',
    targetFunctions: 'CLINICIAN_APPROVED',
    coreExercises: 'CLINICIAN_APPROVED',
    stageTable: 'CLINICIAN_APPROVED',
    clinicianAddableExams: 'CLINICIAN_APPROVED',
    directSupportByExam: 'CLINICIAN_APPROVED',
  },
  // CLOSED §7 — 서버 `DETAIL_CHECK_REGION_QUESTION_IDS.knee`와 같아야 한다(C절 parity).
  detailCheckQuestionIds: ['KNEE_12', 'KNEE_13'],
  evaluateSafety: (payload) => evaluateKneeSafety(payload),
})
