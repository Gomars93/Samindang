/**
 * 턱관절(TMJ) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 출처: Notion 「매선 프로토콜 › 턱관절」(2025-12-06, 아카이브) — 안면비대칭·턱편위·
 * 목어깨통증 통합 프로토콜(CCMFU). 이 문서는 A~D 패턴 분류가 아니라 하나의 사슬
 * (저작근 → 설골 → 경추 앞 근육 → C1–C2 → 견갑 안정근)을 설명하므로, 아래
 * 패턴 3개는 그 문서의 치료 전략 표(과긴장 reset / C1–C2 안정 / 견갑 안정)를
 * **Claude가 관리지향 패턴으로 옮겨 적은 초안**이다 — 원장이 다시 정한다.
 * 운동 3개(Home Exercise 3분 루틴)와 검사 4개(3~5분 Quick Test)는 문서 그대로.
 */
import { buildDraftPack } from './draftPack'
import { evaluateTmjSafety } from './regionSafety'

export const TMJ_REGION_PACK = buildDraftPack({
  region: 'tmj',
  sourceDocument: 'DRAFT — Notion 매선 프로토콜 › 턱관절 (2025-12-06, CCMFU 통합 프로토콜). 패턴 3개는 Claude 초안. 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'MASTICATORY_HYPERTONUS', labelKo: '저작근 과긴장형', patientEasyLabelKo: '씹는 근육의 과긴장', particleKo: '과' },
    { id: 'UPPER_CERVICAL_HYOID', labelKo: 'C1–C2·설골 보상형', patientEasyLabelKo: '목 위쪽과 목 앞 근육의 보상', particleKo: '과' },
    { id: 'SCAPULAR_BASE', labelKo: '견갑대 기반 불안정형', patientEasyLabelKo: '어깨뼈 기반의 불안정', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'tmj_tf_opening', label: '입 크게 벌리기' },
    { id: 'tmj_tf_chewing', label: '딱딱한 음식 씹기' },
    { id: 'tmj_tf_talking', label: '오래 말하기' },
    { id: 'tmj_tf_custom', label: '기타 목표 동작', placeholder: '예: 하품, 노래 — 목표 동작을 적어주세요' },
  ],
  exercises: [
    { id: 'TMJ_SCAP_01', sourceName: 'Scapular posterior tilt + depression', displayNameKo: '견갑 후방경사 + 하강 유지', startingDoseKo: '벽 기대고 아래→뒤 유지 10초 × 10회', strategyLabelKo: '견갑 안정 기반 회복' },
    { id: 'TMJ_DNF_01', sourceName: 'Deep neck flexor (Chin-tuck lift)', displayNameKo: '턱 당기고 들기(심부경부굴곡근)', startingDoseKo: '2cm 들기 10초 × 10', strategyLabelKo: 'C1–C2 안정' },
    { id: 'TMJ_JAW_01', sourceName: 'Jaw midline drill', displayNameKo: '거울 보고 직선 개구', startingDoseKo: '거울 보고 직선 개구 10회', strategyLabelKo: '패턴 저장' },
  ],
  clinicianAddableExams: [
    { id: 'tmj_exam_jaw_midline', title: '개구 경로 검사(Jaw midline test)', help: { howKo: 'S-curve/편위를 본다.', whyKo: '과긴장측 예측.' } },
    { id: 'tmj_exam_c1c2_rotation', title: 'C1–C2 회전', help: { howKo: '70–80° 정상, 좌우 10° 차이면 문제.', whyKo: '경추 보상 패턴.' } },
    { id: 'tmj_exam_scapular_alignment', title: '견갑 정렬(하강/전인)', help: { howKo: '견갑 하강·전인을 본다.', whyKo: '패턴 근원.' } },
    { id: 'tmj_exam_sls_eyes_closed', title: '눈 감고 한 발 서기', help: { howKo: '10초 기준, 좌우 3초 이상 차이.', whyKo: '고유수용성/기능 불균형.' } },
  ],
  evaluateSafety: (payload) => evaluateTmjSafety(payload),
})
