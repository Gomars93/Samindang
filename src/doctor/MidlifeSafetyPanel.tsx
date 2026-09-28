/**
 * Midlife v0.2 원장 화면 안전 패널 — 레인1(안전 확인)의 부위 패널 목록에 한
 * 칸으로 들어간다. 그래서 좌측 요약 칩(lane1Summary)이 **같은 판정**을 읽어
 * URGENT/확인 필요를 띄운다(부위 패널들과 같은 className 계약:
 * `doctor__lbpSafety--urgent_review|review_required|clear|unavailable`).
 *
 * 표시 전용: 저장된 `safety_flags.midlife`를 믿지 않고 원본 응답에서
 * `midlifeLogic`으로 다시 계산한다(다른 부위 패널과 같은 원칙). 새 판정·
 * 해석을 만들지 않는다 — URGENT와 PRIORITY 두 단계를 섞지 않고 근거만 적는다.
 */
import { toMidlifeStateFromDoctorPayload } from '../spec/midlifeAdapter'
import {
  computeMidlifeSafety,
  MIDLIFE_PRIORITY_REASON_LABEL,
  MIDLIFE_SELF_HARM_PROTOCOL,
  MIDLIFE_URGENT_REASON_LABEL,
  type MidlifeSafetyStatus,
} from '../spec/midlifeLogic'
import type { DoctorPayload } from './types'

export const MIDLIFE_SAFETY_LABEL = '갱년기'

const CLASS_SUFFIX: Record<MidlifeSafetyStatus, string> = {
  URGENT_REVIEW: 'urgent_review',
  PRIORITY_EVALUATION: 'review_required',
  CLEAR: 'clear',
  INCOMPLETE: 'unavailable',
}

const STATUS_LABEL: Record<MidlifeSafetyStatus, string> = {
  URGENT_REVIEW: 'URGENT — 진료 중단 후 즉시 대응',
  PRIORITY_EVALUATION: '우선 외부평가 — 한의원 진료 가능, 외부평가 지연 금지',
  CLEAR: '안전',
  INCOMPLETE: '계산 불가 — 원장 확인 필요',
}

/** 갱년기 문진을 받은 기록인지. 아니면 패널 자체가 없다(해당 없음). */
export function isMidlifeRecord(payload: DoctorPayload): boolean {
  return payload.responses?.primary_concern?.key === 'midlife'
}

export function MidlifeSafetyPanel({ payload }: { payload: DoctorPayload }) {
  if (!isMidlifeRecord(payload)) return null
  const safety = computeMidlifeSafety(toMidlifeStateFromDoctorPayload(payload.responses))

  return (
    <div
      className={`doctor__lbpSafety doctor__lbpSafety--${CLASS_SUFFIX[safety.status]}`}
      data-midlife-safety={safety.status}
    >
      <span className="doctor__safetyGlance__title">안전 확인 — {MIDLIFE_SAFETY_LABEL}</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {STATUS_LABEL[safety.status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>비정상 출혈</strong> {safety.abnormalBleeding ? '예' : '아니요'}
        </span>
      </div>
      {safety.urgentReasons.length > 0 && (
        <ul className="midlife__reasons midlife__reasons--urgent" aria-label="URGENT 근거">
          {safety.urgentReasons.map((r) => (
            <li key={r}>{MIDLIFE_URGENT_REASON_LABEL[r]}</li>
          ))}
        </ul>
      )}
      {safety.urgentReasons.includes('self_harm_plan') && (
        <ol className="midlife__protocol" data-midlife-protocol="self_harm" aria-label="자살·자해 응대 절차">
          {MIDLIFE_SELF_HARM_PROTOCOL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      )}
      {safety.priorityReasons.length > 0 && (
        <ul className="midlife__reasons midlife__reasons--priority" aria-label="우선 외부평가 근거">
          {safety.priorityReasons.map((r) => (
            <li key={r}>{MIDLIFE_PRIORITY_REASON_LABEL[r]}</li>
          ))}
        </ul>
      )}
      {safety.status === 'INCOMPLETE' && (
        <p className="doctor__derivedNote">
          저장된 갱년기 안전 응답 일부가 없거나 형식이 예상과 달라 자동으로 판정할 수 없습니다 — "안전"으로 읽지 마세요.
        </p>
      )}
      {safety.status !== 'CLEAR' && safety.status !== 'INCOMPLETE' && (
        <p className="doctor__derivedNote">
          환자 자가보고에서 나온 확인 신호입니다 — 진단이 아닙니다. 일반 care plan보다 외부평가를 먼저 정리합니다.
        </p>
      )}
    </div>
  )
}
