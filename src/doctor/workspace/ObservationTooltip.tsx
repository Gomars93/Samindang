/**
 * 설맥복 체크 칩의 호버 설명 (PR-B1, PO 요청 2026-09-21).
 *
 * PO 원문: "마우스를 살짝 올려두면 간단한 설명이 보이면 좋겠어. (…) 마우스를
 * 치우면 바로 없어지는 식으로."
 *
 * ## HTML `title` 속성을 쓰지 않은 이유
 * 뜨는 데 브라우저 기본 ~1초가 걸리고(원장이 원한 "살짝 올려두면"과 다르다),
 * 스타일을 바꿀 수 없으며, 줄바꿈·길이 제어가 안 된다. 그래서 직접 만든다.
 *
 * ## 타이밍
 * 등장 150ms 지연(칩 위를 스쳐 지나가는 것만으로 툴팁이 번쩍이지 않게),
 * 소멸은 **지연 0** — PO 지시 그대로 "치우면 바로". 지연 타이머는 언마운트와
 * 이탈 양쪽에서 반드시 해제한다(떠난 뒤 뒤늦게 뜨는 유령 툴팁 방지).
 *
 * ## 마우스 전용
 * 닥터뷰는 PO 확인상 **PC 전용**이므로 터치 대체 경로(길게 누르기, ⓘ 탭)를
 * 만들지 않았다. 다만 키보드 포커스(`focus`/`blur`)에는 반응하게 해 두었다 --
 * 탭 이동으로도 설명을 읽을 수 있어야 하고, 비용이 이벤트 두 개뿐이다.
 * 태블릿에서 닥터뷰를 쓰기로 결정이 바뀌면 이 파일 하나만 고치면 된다.
 *
 * 툴팁 본문은 절대 이 파일이 만들지 않는다 -- observationOptions.ts의
 * `tooltip` 문자열을 그대로 표시할 뿐이다(그쪽 헤더의 "변증 귀속 금지" 규칙이
 * 내용의 경계를 정한다).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

const SHOW_DELAY_MS = 150

export function ObservationTooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  // 언마운트 시에도 반드시 해제한다 -- 해제하지 않으면 칩이 사라진 뒤에
  // 타이머가 깨어나 언마운트된 컴포넌트에 setState를 건다.
  useEffect(() => clear, [])

  const show = () => {
    clear()
    timerRef.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS)
  }
  const hide = () => {
    clear()
    setOpen(false)
  }

  return (
    <span
      className="workspace__obsTip"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span className="workspace__obsTip__bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
