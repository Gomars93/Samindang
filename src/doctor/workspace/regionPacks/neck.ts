/**
 * 목(NECK) 부위 팩 — DRAFT, 원장 승인 전 (`productionApproved: false`).
 *
 * 출처: Notion 「매선 프로토콜 › 경추 패턴」(2025-12-01, 아카이브 "통합 완료"),
 * 패턴 4개 + 패턴별 운동 2개 + 움직임 평가 6개. 「매선 프로토콜 목차」에 "원장님이
 * 만든 발목 프로토콜 포맷 그대로 전신으로 확장했습니다"라고 적혀 있어, 경추
 * 페이지는 원장 원안이 아니라 **그 포맷을 AI가 확장한 초안**일 수 있다 — 승인
 * 시 원장이 행마다 확인한다. 같은 프로젝트의 정본(「1권 근골격 통증」 4장
 * 경항부 v0.3)은 3단계 연쇄(풀린다/헐거워진다/굳고 좁아진다) + 안정축/보상축
 * 틀이라 이 4패턴과 다르다 — 어느 틀을 가설 패턴으로 쓸지는 원장 결정.
 *
 * Claude가 만든 초안 필드(원장 문서에 없음): `patientEasyLabelKo`(환자용 쉬운 말),
 * `targetFunctions`(목표 기능 후보), 운동 한글 표시명. 시작 기준·용량·중단 기준·
 * 단계표는 비어 있다 — `packContentGaps`가 나열한다.
 */
import { buildDraftPack } from './draftPack'
import { evaluateNeckSafety } from './regionSafety'

export const NECK_REGION_PACK = buildDraftPack({
  region: 'neck',
  sourceDocument: 'DRAFT — Notion 매선 프로토콜 › 경추 패턴 (2025-12-01, 아카이브). 원장 승인 전.',
  hypothesisPatterns: [
    { id: 'FHP', labelKo: '전방머리자세(FHP)형', patientEasyLabelKo: '앞으로 나온 머리 자세', particleKo: '와' },
    { id: 'UPPER_TRAP_LEVATOR', labelKo: '승모·견갑거근 과활성형', patientEasyLabelKo: '어깨 위 근육의 과긴장', particleKo: '과' },
    { id: 'FLAT_NECK', labelKo: '플랫넥·하부경추 굴곡형', patientEasyLabelKo: '목 앞쪽 당김', particleKo: '과' },
    { id: 'THORACIC_RESTRICTION', labelKo: '흉추 제한형', patientEasyLabelKo: '등 위쪽(흉추)의 뻣뻣함', particleKo: '과' },
  ],
  targetFunctions: [
    { id: 'neck_tf_looking_back', label: '뒤돌아보기(운전)' },
    { id: 'neck_tf_desk_work', label: '컴퓨터·책상 작업' },
    { id: 'neck_tf_sleep', label: '수면·베개' },
    { id: 'neck_tf_overhead', label: '팔 올리기·높은 곳 보기' },
    { id: 'neck_tf_custom', label: '기타 목표 동작', placeholder: '예: 머리 감기, 운전 후진 — 목표 동작을 적어주세요' },
  ],
  exercises: [
    { id: 'NECK_FHP_01', sourceName: 'Chin tuck + Deep neck flexor activation', displayNameKo: '턱 당기기 + 심부경부굴곡근 활성화', strategyLabelKo: '전방머리자세(FHP)형' },
    { id: 'NECK_FHP_02', sourceName: 'Wall slide with chin control', displayNameKo: '벽 슬라이드(턱 조절)', strategyLabelKo: '전방머리자세(FHP)형' },
    { id: 'NECK_TRAP_01', sourceName: 'Scapular depression drill', displayNameKo: '견갑 하강 드릴', strategyLabelKo: '승모·견갑거근 과활성형' },
    { id: 'NECK_TRAP_02', sourceName: 'Lower trap Y-raise', displayNameKo: '하부 승모근 Y-레이즈', strategyLabelKo: '승모·견갑거근 과활성형' },
    { id: 'NECK_FLAT_01', sourceName: 'Deep neck flexor endurance (DNF hold)', displayNameKo: '심부경부굴곡근 지구력 유지', strategyLabelKo: '플랫넥·하부경추 굴곡형' },
    { id: 'NECK_FLAT_02', sourceName: 'Foam roller thoracic extension', displayNameKo: '폼롤러 흉추 신전', strategyLabelKo: '플랫넥·하부경추 굴곡형' },
    { id: 'NECK_THX_01', sourceName: 'Quadruped thoracic rotation', displayNameKo: '네발기기 흉추 회전', strategyLabelKo: '흉추 제한형' },
    { id: 'NECK_THX_02', sourceName: 'Serratus wall slide + thoracic lift', displayNameKo: '전거근 벽 슬라이드 + 흉추 들기', strategyLabelKo: '흉추 제한형' },
  ],
  clinicianAddableExams: [
    { id: 'neck_exam_chin_tuck', title: '턱 당기기 유지 검사(Chin-tuck test)', help: { howKo: '턱을 당긴 자세를 유지하게 한다.', whyKo: '유지 불가면 FHP 패턴, 하부경추 지지력 평가.' } },
    { id: 'neck_exam_scapular_assist', title: '견갑 보조 검사(Scapular assist test)', help: { howKo: '견갑을 후하방·상방으로 보조하며 통증 변화를 본다.', whyKo: '보조 시 통증이 줄면 경추가 아니라 견갑 문제.' } },
    { id: 'neck_exam_thoracic_rotation', title: '흉추 회전 검사', help: { howKo: '상부 흉추 회전 범위를 본다.', whyKo: '상부 흉추 회전 제한은 거의 항상 경추 보상으로 이어진다.' } },
    { id: 'neck_exam_cervical_rotation', title: '경추 회전 범위(70° 기준)', help: { howKo: '좌우 회전 범위와 상부/하부 어디서 제한되는지 본다.', whyKo: '70° 미만이면 회전 제한.' } },
  ],
  evaluateSafety: (payload) => evaluateNeckSafety(payload),
})
