/**
 * EMR용 plain-text 차트 요약 빌더. 순수 함수만 있고 React가 없다 — 입력에
 * 없는 값은 절대 채우지 않는다(환각 금지, v0.1 작업지시서 5번).
 *
 * Assessment / 치료·처방 / 계획 세 줄은 ClinicianJudgment(원장이
 * JudgmentPanel에 직접 타이핑한 값)에서만 채운다. Recorder의
 * structured_note.assessment/treatment/plan은 여기로 흘러들어오지 않는다
 * — 자동 Assessment 확정/자동 처방 생성 금지 원칙 때문이다.
 * structured_note.assessment는 "진찰 소견"(Recorder가 받아적은 서술)
 * 줄에만 쓴다 — 확정된 임상 판단이 아니다.
 *
 * Batch 4.1-A 이후 프로덕션 호출자 0 + 데이터 소스 0 (이중 사문). 삭제 여부는
 * 별도 결정 대기.
 */
import type { ClinicianJudgment } from './judgment'
import type { RecorderStructuredNote } from '../lib/serverClient'

export type EmrSummaryInput = {
  primaryConcern: string | null
  structuredNote: RecorderStructuredNote | null
  judgment: ClinicianJudgment | null
}

const EMR_LINES: Array<{ label: string; pick: (i: EmrSummaryInput) => string | null }> = [
  { label: '주호소', pick: (i) => i.primaryConcern ?? i.structuredNote?.chief_complaint ?? null },
  { label: '경과', pick: (i) => i.structuredNote?.history ?? null },
  { label: '주요 문진', pick: (i) => i.structuredNote?.key_findings ?? null },
  { label: '진찰 소견', pick: (i) => i.structuredNote?.assessment ?? null },
  { label: 'Assessment', pick: (i) => i.judgment?.revised_after_exam ?? null },
  { label: '치료/처방', pick: (i) => i.judgment?.final_treatment_axis ?? null },
  { label: '계획', pick: (i) => i.judgment?.prescription_direction ?? null },
]

// EMR 붙여넣기 시 줄바꿈이 깨지지 않도록 CRLF를 쓴다(구형 Windows
// 메모장/일부 EMR 입력창은 단독 LF를 줄바꿈으로 인식하지 못한다).
const CRLF = '\r\n'

export function buildEmrSummary(input: EmrSummaryInput): string {
  return EMR_LINES.map(({ label, pick }) => {
    const value = pick(input)
    const trimmed = value?.trim()
    return trimmed ? `${label}: ${trimmed}` : `${label}:`
  }).join(CRLF)
}
