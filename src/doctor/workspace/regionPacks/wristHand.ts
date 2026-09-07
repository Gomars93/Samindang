/**
 * 손목/손(WRIST_HAND) 부위 팩 — **승인**, `productionApproved: true` (2026-09-07).
 *
 * 원장 승인 문서: `docs/WRIST_HAND_EXERCISE_DECISIONS_v1.0_CLOSED.md` (PO "허리를 기준으로 모든 파트 진행", 2026-09-07).
 * 2026-09-06 조사에서 Notion·Drive 어디에도 손목·손 문서가 없었다 — 이 팩은 **원장 문서 없이** CPG·SR의 관리 범주
 * (B수준, `docs/REHAB_REFERENCE_VERIFICATION_LOG_v0.1.md` §7)에서 Claude가 초안을 만들고 PO 위임 승인으로 확정한
 * 첫 팩이다. 파일럿 첫 10건에서 원장이 카드 문장을 읽고 고칠 항목을 모은다(CLOSED §10).
 *
 * 내용 요약(CLOSED §2~§8):
 *   hypothesisPatterns     관리 지향 7(수근관 패턴·요측 엄지 힘줄 부하·엄지 CMC 관절염·척측 손목 부하·손가락 관절염·
 *                          고정 후 강직·비특이 손목 부하).
 *   clinicianAddableExams  8 (ROM·악력·정중신경 객관 검사·Phalen/Tinel·Finkelstein·CMC grind·척측 부하·저항 손목).
 *   rehabDomains           8 (PR #30 범위 밖 부위 — 이 문서에서 신설).
 *   coreExercises          Core 10. 편심성 손목 신근 부하(WH_ECC_01)는 근거 범주 없음 → v1.1 보류.
 *   stageTable             1단계 6 / 2단계 3 / 3단계 1.
 *   eligibilityRules       WH_NERVE_01만 신경 안정 요구(목 NEURAL_01과 대칭). 나머지 기본값. 방향성 카드 미적용.
 *   neuroExamIds           정중신경 객관 검사 1개(D-1) — POSITIVE(무지구 위축·객관적 감각/운동 결손)면 전체 차단.
 *   directSupportByExam    검사 5 → 운동(순위 버킷만).
 *   detailCheckQuestionIds WH_11(딸깍·걸림).
 *
 * 골절·개방창·감염·진행성 신경 결손·DRUJ 불안정은 L0 안전(`wristHandLogic.ts`, FROZEN).
 */
import { buildDraftPack } from './draftPack'
import { evaluateWristHandSafety } from './regionSafety'

/** 전 운동 공통 중단·재검토 첫 항목(CLOSED §4) — 비네트 0절이 단언한다. */
const STOP_COMMON = '새로운 또는 진행하는 신경증상(손 힘빠짐·엄지 두덩 위축·지속 감각저하) 또는 손가락이 갑자기 움직이지 않음'

export const WRIST_HAND_REGION_PACK = buildDraftPack({
  region: 'wrist_hand',
  productionApproved: true,
  sourceDocument:
    'docs/WRIST_HAND_EXERCISE_DECISIONS_v1.0_CLOSED.md (2026-09-07, PO 승인; 원장 문서 없음 — CPG·SR 관리 범주 B수준 + Claude 초안 + PO 위임 승인)',
  hypothesisPatterns: [
    { id: 'MEDIAN_NERVE_ENTRAPMENT_PATTERN', labelKo: '수근관(정중신경) 패턴', patientEasyLabelKo: '손목에서 눌리는 신경', particleKo: '과' },
    { id: 'RADIAL_THUMB_TENDON_LOAD', labelKo: '요측·엄지 힘줄 부하 통증', patientEasyLabelKo: '엄지 쪽 힘줄 부하', particleKo: '와' },
    { id: 'THUMB_CMC_OA_PATTERN', labelKo: '엄지 기저 관절염 패턴', patientEasyLabelKo: '엄지 뿌리 관절 마모', particleKo: '와' },
    { id: 'ULNAR_SIDED_WRIST_LOAD', labelKo: '척측 손목 부하 통증', patientEasyLabelKo: '새끼손가락 쪽 손목 부하', particleKo: '와' },
    { id: 'HAND_FINGER_OA_PATTERN', labelKo: '손가락 관절염 패턴', patientEasyLabelKo: '손가락 마디 마모', particleKo: '과' },
    { id: 'POST_IMMOBILIZATION_STIFFNESS', labelKo: '고정 후 강직·근력 저하', patientEasyLabelKo: '깁스·고정 뒤 굳은 손목', particleKo: '과' },
    { id: 'NONSPECIFIC_WRIST_LOAD_PAIN', labelKo: '비특이 손목 부하 통증', patientEasyLabelKo: '쓸수록 아픈 손목', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'wrist_hand_tf_typing', label: '타이핑·스마트폰' },
    { id: 'wrist_hand_tf_grip', label: '쥐기·병뚜껑 열기' },
    { id: 'wrist_hand_tf_lifting_childcare', label: '들기·아이 안기' },
    { id: 'wrist_hand_tf_weight_bearing', label: '손 짚기·푸시업' },
    { id: 'wrist_hand_tf_custom', label: '기타 목표 동작', placeholder: '예: 칼질, 악기 연주 — 목표 동작을 적어주세요' },
  ],
  rehabDomains: [
    { id: 'EDUCATION_ACTIVITY_MODIFICATION', labelKo: '교육·활동 조절·인체공학' },
    { id: 'MOBILITY', labelKo: '가동성' },
    { id: 'TENDON_NERVE_GLIDING', labelKo: '건·신경 활주' },
    { id: 'GRIP_STRENGTH', labelKo: '악력' },
    { id: 'WRIST_LOADING', labelKo: '손목 부하' },
    { id: 'THUMB_STABILIZATION', labelKo: '엄지 안정화' },
    { id: 'HAND_OA_PROGRAM', labelKo: '손 관절염 운동 프로그램' },
    { id: 'FUNCTIONAL_GRADED_EXPOSURE', labelKo: '단계적 기능 노출' },
  ],
  // CLOSED §3·§4 — Core 10. 용량은 삼인당 시작 기본값(임상 임계값 아님).
  exercises: [
    {
      id: 'WH_EDU_01',
      sourceName: 'Education — activity pacing, ergonomics, neutral wrist (night splint advised alongside)',
      displayNameKo: '활동 조절·인체공학(손목 중립, 페이싱; 야간 보조기 병행 안내)',
      domain: 'EDUCATION_ACTIVITY_MODIFICATION',
      startingCriteriaKo: ['안전 확인 CLEAR', '환자가 악화 동작·자세(타이핑·쥐기·손 짚기)를 말할 수 있음'],
      startingDoseKo: '매일: 악화 동작 목록 + 손목 중립 유지 방법 1~2개, 반복 작업은 20~30분마다 1~2분 휴식. 야간 저림이 있으면 손목 중립 보조기 착용을 함께 안내.',
      acceptableResponseKo: ['야간 저림·악화 빈도가 늘지 않음', '손을 완전히 쉬게 하지 않고 통증 허용 범위에서 사용함'],
      stopReviewKo: [STOP_COMMON, '야간 저림 급증', '쥐기가 갑자기 불가능해짐'],
      regressionKo: '반복 작업 시간을 더 줄이고 휴식을 늘림',
      progressionKo: '악화 동작을 한 번에 1개씩 재도입',
      targetFunctions: ['TYPING', 'GRIP', 'LIFTING_CHILDCARE', 'WEIGHT_BEARING'],
    },
    {
      id: 'WH_MOB_01',
      sourceName: 'Wrist active ROM (flexion / extension / radial-ulnar deviation)',
      displayNameKo: '손목 능동 가동범위(굽힘·펴기·좌우 기울이기)',
      domain: 'MOBILITY',
      startingCriteriaKo: ['골절 우려가 없음(안전 CLEAR)', '능동 움직임에서 날카로운 통증이 없음'],
      startingDoseKo: '각 방향 10회 × 2세트, 하루 2~3회부터 시작. 통증 허용 범위 안에서.',
      acceptableResponseKo: ['뻣뻣함이 반복하면서 줄어듦', '종료 후 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '움직임 중 통증 급증', '붓기 증가'],
      regressionKo: '범위를 줄이고 반대 손으로 보조',
      progressionKo: '범위 또는 횟수 중 한 가지만 증가',
      targetFunctions: ['TYPING', 'GRIP', 'WEIGHT_BEARING'],
    },
    {
      id: 'WH_MOB_02',
      sourceName: 'Forearm pronation-supination mobility',
      displayNameKo: '전완 회내·회외 가동',
      domain: 'MOBILITY',
      startingCriteriaKo: ['팔꿈치를 옆구리에 붙인 채 손바닥 뒤집기가 가능함', '손목 척측 날카로운 통증이 없음'],
      startingDoseKo: '손바닥 뒤집기 10회 × 2세트, 하루 2회부터 시작.',
      acceptableResponseKo: ['전완의 당김만 느껴짐'],
      stopReviewKo: [STOP_COMMON, '손목 척측 통증 급증', '딸깍거림 증가'],
      regressionKo: '범위를 줄이고 막대 없이',
      progressionKo: '범위를 먼저, 그다음 가벼운 막대',
      targetFunctions: ['GRIP', 'TYPING'],
    },
    {
      id: 'WH_GLIDE_01',
      sourceName: 'Tendon gliding (fist sequence)',
      displayNameKo: '건 활주(주먹 순서: 편 손 → 갈고리 → 주먹)',
      domain: 'TENDON_NERVE_GLIDING',
      startingCriteriaKo: ['손가락 능동 굽힘·펴기가 가능함', '손가락 감염·급성 붓기가 없음'],
      startingDoseKo: '5자세 순서 × 5회, 하루 3회부터 시작.',
      acceptableResponseKo: ['손가락 뻣뻣함이 줄어듦', '저림이 늘지 않음'],
      stopReviewKo: [STOP_COMMON, '손가락 붓기·열감', '걸림이 풀리지 않음'],
      regressionKo: '자세 수를 줄이고 천천히',
      progressionKo: '횟수만 증가',
      targetFunctions: ['GRIP', 'TYPING'],
    },
    {
      id: 'WH_NERVE_01',
      sourceName: 'Median nerve gliding (symptom-free range)',
      displayNameKo: '정중신경 활주(저림 없는 범위)',
      domain: 'TENDON_NERVE_GLIDING',
      startingCriteriaKo: ['정중신경 객관 검사(무지구 근력·감각)가 안정으로 기록됨', '저림 없는 범위에서만'],
      startingDoseKo: '저림 없는 범위의 활주 10회, 하루 2회부터 시작.',
      acceptableResponseKo: ['가벼운 당김만 느껴짐', '종료 후 저림이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '저림이 지속·확산', '감각 변화 → 중단 후 신경 재평가'],
      regressionKo: '범위를 줄이고 손목을 중립으로 고정',
      progressionKo: '범위만 증가(텐셔너 전환은 원장 판단)',
      targetFunctions: ['TYPING', 'GRIP'],
      rule: { requiresStableNeuro: true },
    },
    {
      id: 'WH_GRIP_01',
      sourceName: 'Grip strengthening (putty / ball, submaximal progressive)',
      displayNameKo: '악력 강화(퍼티·볼, 준최대 점진)',
      domain: 'GRIP_STRENGTH',
      startingCriteriaKo: ['쥐기에 날카로운 통증이 없음', '골절 고정 후라면 원장이 부하 시작을 허용함'],
      startingDoseKo: '부드러운 퍼티·볼 5초 쥐기 × 10회 × 2세트, 하루 2회부터 시작. 최대 힘의 절반 정도.',
      acceptableResponseKo: ['전완의 피로만 느껴짐', '다음 날 통증이 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '쥐기 중 통증 급증', '손가락 걸림 증가'],
      regressionKo: '더 부드러운 도구, 유지 시간 절반',
      progressionKo: '유지 시간 → 저항 강도 중 한 가지만',
      targetFunctions: ['GRIP', 'LIFTING_CHILDCARE'],
    },
    {
      id: 'WH_RES_01',
      sourceName: 'Wrist extensor / flexor resistance (isometric → light dumbbell / band)',
      displayNameKo: '손목 신근·굴근 저항(등척성 → 가벼운 덤벨·밴드)',
      domain: 'WRIST_LOADING',
      startingCriteriaKo: ['손목 능동 가동범위를 수행할 수 있음', '등척성 수축 중 통증이 허용 범위'],
      startingDoseKo: '등척성 5초 × 10회부터 시작, 하루 2회. 통증 허용 강도.',
      acceptableResponseKo: ['전완의 피로만 느껴짐', '다음 날 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '통증 누적', '힘이 갑자기 빠짐'],
      regressionKo: '강도를 절반으로, 등척성만',
      progressionKo: '등척성 → 0.5~1 kg 덤벨 → 밴드 중 한 단계씩',
      targetFunctions: ['LIFTING_CHILDCARE', 'GRIP', 'WEIGHT_BEARING'],
    },
    {
      id: 'WH_THUMB_01',
      sourceName: 'Thumb CMC dynamic stabilization (first dorsal interosseous / opponens, web-space stretch)',
      displayNameKo: '엄지 기저 관절 안정화(제1배측골간근·대립근 + 손샅 스트레칭)',
      domain: 'THUMB_STABILIZATION',
      startingCriteriaKo: ['엄지 벌리기·맞대기가 통증 허용 범위', '엄지 기저 급성 붓기가 없음'],
      startingDoseKo: '엄지-검지 맞대고 벌리기 등척성 5초 × 10회 + 손샅 스트레칭 20초 × 3회, 하루 2회부터 시작.',
      acceptableResponseKo: ['엄지 두덩의 피로만 느껴짐', '쥐기 통증이 늘지 않음'],
      stopReviewKo: [STOP_COMMON, '엄지 기저 통증 급증', '엄지가 빠지는 느낌'],
      regressionKo: '등척성 강도를 절반으로',
      progressionKo: '유지 시간 → 가벼운 밴드',
      targetFunctions: ['GRIP', 'TYPING', 'LIFTING_CHILDCARE'],
    },
    {
      id: 'WH_HAND_01',
      sourceName: 'Hand / finger OA program (ROM + strengthening)',
      displayNameKo: '손가락·손 관절 운동 프로그램(가동 + 강화)',
      domain: 'HAND_OA_PROGRAM',
      startingCriteriaKo: ['손가락 마디 열감·급성 붓기가 없음(염증성 관절염 우려 없음)', '능동 굽힘·펴기가 가능함'],
      startingDoseKo: '손가락 굽힘·펴기·벌리기 각 10회 + 부드러운 퍼티 쥐기 10회, 하루 2회부터 시작.',
      acceptableResponseKo: ['아침 뻣뻣함이 주 단위로 줄어듦', '운동 후 통증이 2시간 안에 기저로 회복됨'],
      stopReviewKo: [STOP_COMMON, '마디 열감·붓기 증가', '아침 강직이 1시간 이상 지속되며 악화'],
      regressionKo: '강화를 빼고 가동만',
      progressionKo: '횟수 → 저항 중 한 가지만',
      targetFunctions: ['GRIP', 'TYPING'],
    },
    {
      id: 'WH_FUNC_01',
      sourceName: 'Graded functional exposure (typing / lifting / childcare / weight-bearing tolerance)',
      displayNameKo: '단계적 기능 노출(타이핑·들기·손 짚기 내성)',
      domain: 'FUNCTIONAL_GRADED_EXPOSURE',
      startingCriteriaKo: ['목표 동작을 환자가 말할 수 있음', '현재 허용 시간·무게를 파악함'],
      startingDoseKo: '허용 시간·무게의 70%부터, 구간 사이 1~2분 손목 리셋. 하루 1회.',
      acceptableResponseKo: ['다음 날 기저로 회복됨', '허용량이 세션마다 유지되거나 늘어남'],
      stopReviewKo: [STOP_COMMON, '세션마다 허용량이 뚜렷하게 감소'],
      regressionKo: '구간을 짧게, 휴식을 길게',
      progressionKo: '시간 또는 무게 중 한 가지만 변경',
      targetFunctions: ['TYPING', 'LIFTING_CHILDCARE', 'WEIGHT_BEARING', 'GRIP'],
    },
  ],
  // CLOSED §5 — 1단계 6 / 2단계 3 / 3단계 1.
  stageTable: {
    WH_EDU_01: 1,
    WH_MOB_01: 1,
    WH_MOB_02: 1,
    WH_GLIDE_01: 1,
    WH_NERVE_01: 1,
    WH_HAND_01: 1,
    WH_GRIP_01: 2,
    WH_RES_01: 2,
    WH_THUMB_01: 2,
    WH_FUNC_01: 3,
  },
  // 검사 8 — 자동 삽입 없음.
  clinicianAddableExams: [
    { id: 'wrist_hand_exam_rom', title: '손목·전완 가동범위(능동/수동, 좌우 비교)', help: { howKo: '굽힘·펴기·좌우 기울임·회내·회외를 능동·수동으로 좌우 비교한다.', whyKo: 'POSITIVE(제한)면 가동 운동 2개가 직접 뒷받침된다. 고정 후 강직 가설의 근거.' } },
    { id: 'wrist_hand_exam_grip', title: '악력(좌우 비교, 통증 재현)', help: { howKo: '악력계 또는 손 맞잡기로 좌우 힘과 통증 재현을 본다.', whyKo: 'POSITIVE(감소·통증)면 악력 강화가 직접 뒷받침된다. 갑작스런 뚜렷한 약화는 신경·건 손상 안전 분기.' } },
    { id: 'wrist_hand_exam_median_neuro', title: '정중신경 객관 검사(무지구 근력·위축, 2점 식별)', help: { howKo: '엄지 벌림(APB) 근력, 무지구 위축, 손끝 2점 식별을 좌우 비교한다.', whyKo: 'POSITIVE = 객관적 감각·운동 결손 또는 위축 → 운동 추천이 잠기고 신경 재평가·의뢰가 우선(D-1, 보존치료 단독 지속에 신중). NEGATIVE = 안정 → 신경 활주 후보. 미시행은 "이상 없음"으로 가정하지 않는다.' } },
    { id: 'wrist_hand_exam_phalen_tinel', title: 'Phalen·Tinel(정중신경 유발)', help: { howKo: '손목 굴곡 유지(Phalen)와 수근관 두드림(Tinel)에서 정중신경 분포 저림 재현을 본다.', whyKo: '수근관 가설의 근거(유발 검사, 단독 진단 아님). POSITIVE면 신경 활주·건 활주가 직접 뒷받침된다(객관 검사가 안정일 때만 신경 활주 후보).' } },
    { id: 'wrist_hand_exam_finkelstein', title: 'Finkelstein/Eichhoff(요측 엄지 힘줄)', help: { howKo: '엄지를 쥐고 척측으로 기울여 요측 손목 통증 재현을 본다.', whyKo: '요측·엄지 힘줄 부하 가설의 근거. 운동 뒷받침 쌍은 없다(능동 부하 근거 공백 — 보조기·활동 조절이 1차).' } },
    { id: 'wrist_hand_exam_cmc_grind', title: '엄지 CMC grind·압통', help: { howKo: '엄지 기저를 축 압박하며 회전해 통증·마찰음을 보고 기저 압통을 확인한다.', whyKo: '엄지 기저 관절염 가설의 근거. POSITIVE면 엄지 안정화가 직접 뒷받침된다.' } },
    { id: 'wrist_hand_exam_ulnar_load', title: '척측 손목 부하(fovea 압통·척측 편위 부하)', help: { howKo: '척골 fovea 압통과 척측 편위+회전 부하에서 통증 재현을 본다. DRUJ 불안정은 정형외과 평가.', whyKo: '척측 손목 부하 가설의 근거. 운동 뒷받침 쌍은 없다.' } },
    { id: 'wrist_hand_exam_resisted_wrist', title: '저항 손목 펴기·굽히기(통증·근력)', help: { howKo: '손목 펴기·굽히기에 저항을 주어 통증 재현과 근력을 본다.', whyKo: 'POSITIVE(통증·약화)면 손목 신근·굴근 저항이 직접 뒷받침된다.' } },
  ],
  // CLOSED §6 — 순위 버킷만. finkelstein·ulnar_load·median_neuro는 쌍 없음.
  directSupportByExam: {
    wrist_hand_exam_rom: ['WH_MOB_01', 'WH_MOB_02'],
    wrist_hand_exam_grip: ['WH_GRIP_01'],
    wrist_hand_exam_resisted_wrist: ['WH_RES_01'],
    wrist_hand_exam_cmc_grind: ['WH_THUMB_01'],
    wrist_hand_exam_phalen_tinel: ['WH_NERVE_01', 'WH_GLIDE_01'],
  },
  // E-2 (D-1): 객관적 결손 검사만. Phalen/Tinel(유발)은 넣지 않는다.
  neuroExamIds: ['wrist_hand_exam_median_neuro'],
  directionalResponseApplicable: false,
  provenance: {
    hypothesisPatterns: 'CLINICIAN_APPROVED',
    targetFunctions: 'CLINICIAN_APPROVED',
    coreExercises: 'CLINICIAN_APPROVED',
    stageTable: 'CLINICIAN_APPROVED',
    clinicianAddableExams: 'CLINICIAN_APPROVED',
    directSupportByExam: 'CLINICIAN_APPROVED',
  },
  // CLOSED §7 — 서버 `DETAIL_CHECK_REGION_QUESTION_IDS.wrist_hand`와 같아야 한다(C절 parity).
  detailCheckQuestionIds: ['WH_11'],
  evaluateSafety: (payload) => evaluateWristHandSafety(payload),
})
