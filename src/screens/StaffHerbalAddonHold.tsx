import { useRef, useState } from 'react'

/** 실수로 스치는 접촉으로는 발동하지 않도록 StaffResetHold와 동일 길이로 맞춘다. */
const HOLD_MS = 2000

/**
 * Tablet UX v2.2 §20-23: "한약 추가문진 시작" 진입점.
 *
 * 왜 여기(질문 진행 중 화면)인가: App.tsx는 `phase === 'done'`이 되는 즉시
 * 자동으로 서버 제출을 시도하고(useEffect [phase]), 제출이 성공/미구성으로
 * 확정되는 순간 공유 태블릿 프라이버시를 위해 `responses`를 즉시 비운다
 * (App.tsx의 "privacy wipe" useEffect, submitState success/unconfigured
 * 의존). 이 두 동작은 이번 작업에서 절대 건드리지 않는다(§0/§23 지시).
 * 즉 완료 화면에 도달한 뒤에는 그 시점이 네트워크 타이밍에 좌우돼 안전하게
 * 걸어둘 confirm 지점이 없고, 실제로 in-memory 상태가 이미 비워져 있을
 * 수도 있다 -- "완료 화면에 add-on 버튼"은 근본적으로 레이스 컨디션이다.
 *
 * 그래서 herbal_addon 전환은 `phase === 'question'`(아직 제출 전, 응답이
 * 메모리에 살아있는 동안)에만 노출한다 -- 새 세션/토큰/서버 인프라
 * 없이도 100% 안전한 "같은 세션"이 성립하는 유일한 지점이다. 이미 제출·
 * wipe된 이후(원장이 진료 중 결과를 보고 나서 결정하는 경우)의 재개는
 * 이 아키텍처에서 지원하지 않는다 -- docs/TABLET_V2_2_...md의
 * "Cross-device add-on" 섹션에 OPERATIONAL INTEGRATION REQUIRED로 남긴다.
 *
 * 신뢰 모델은 PatientCompleteScreen의 `StaffResetHold`와 동일하다 -- 새
 * 암호화/토큰 기반 보안이 아니라 "태블릿을 물리적으로 쥔 사람"을 직원으로
 * 신뢰하는 기존 관행을 그대로 재사용한다(§22: 새 인프라를 만들지 않는다).
 * 짧은 탭으로는 절대 발동하지 않고, 2초 이상 눌러야 한다.
 */
export function StaffHerbalAddonHold({ onActivate }: { onActivate: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holding, setHolding] = useState(false)

  const cancel = () => {
    setHolding(false)
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const start = () => {
    setHolding(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setHolding(false)
      onActivate()
    }, HOLD_MS)
  }

  return (
    <button
      type="button"
      className={`staffHerbalAddonHold${holding ? ' staffHerbalAddonHold--holding' : ''}`}
      aria-label="직원용: 2초 이상 눌러서 한약 추가문진 시작"
      title="직원용: 한약 추가문진 시작 (2초 이상 누르기)"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    />
  )
}
