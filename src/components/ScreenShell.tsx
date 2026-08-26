import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StepProgress } from './StepProgress'

type Props = {
  steps: readonly string[]
  currentStep: string
  /** 현재 단계 안에서의 진행률 0~1 */
  stepProgress: number
  onBack?: () => void
  canGoBack: boolean
  onHelp: () => void
  children: ReactNode
  /** 하단 고정 영역 (다음 / 선택 완료 버튼 등) */
  footer?: ReactNode
  /**
   * 현재 표시 중인 질문 id (App.tsx의 `current.id`). 새 질문으로 전환될
   * 때만 본문 스크롤을 맨 위로 되돌리기 위한 식별자 -- `children`은 같은
   * 질문 안에서 선택지를 고를 때마다도 매번 새 객체로 바뀌므로(리렌더마다
   * 새 JSX 엘리먼트), children 자체를 스크롤 리셋 트리거로 쓰면 안 된다
   * (긴 목록을 스크롤해 내려간 상태에서 옵션을 누를 때마다 스크롤이
   * 맨 위로 튀는 회귀가 생긴다).
   */
  questionId?: string
}

/**
 * 스펙 2.1 화면 규격.
 * 상단: 뒤로가기 + progress / 중앙: 질문 / 하단: 버튼 + `입력이 어려워요`
 * 뒤로가기와 도움 버튼은 항상 같은 위치에 있다.
 */
export function ScreenShell({
  steps,
  currentStep,
  stepProgress,
  onBack,
  canGoBack,
  onHelp,
  children,
  footer,
  questionId,
}: Props) {
  const mainRef = useRef<HTMLElement>(null)
  const [hasMore, setHasMore] = useState(false)

  // 새 질문으로 전환될 때만 본문 스크롤을 맨 위로 되돌린다. 이전 질문에서
  // 아래로 스크롤해 내려간 상태로 다음/이전 질문으로 넘어가면, 새 질문의
  // 첫 줄(문항 텍스트)이 아니라 이전 스크롤 위치가 그대로 유지되어 환자가
  // 새 질문이 시작된 줄 모르고 화면 중간부터 보게 되는 문제를 막는다.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [questionId])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const recompute = () => {
      const scrollable = el.scrollHeight > el.clientHeight + 1
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      setHasMore(scrollable && !atBottom)
    }

    recompute()
    el.addEventListener('scroll', recompute)
    window.addEventListener('resize', recompute)
    return () => {
      el.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
    }
  }, [children])

  return (
    <div className="shell">
      <header className="shell__top">
        <div className="shell__topInner">
          <div className="shell__topRow">
            <button
              type="button"
              className="backBtn"
              onClick={onBack}
              disabled={!canGoBack}
              aria-label="이전 질문으로"
            >
              <span aria-hidden="true">←</span> 이전
            </button>
            <span className="stepLabel">{currentStep}</span>
          </div>
          <StepProgress
            steps={steps}
            currentStep={currentStep}
            stepProgress={stepProgress}
          />
        </div>
      </header>

      <main
        className={`shell__main${hasMore ? ' shell__main--hasMore' : ''}`}
        ref={mainRef}
      >
        <div className="shell__mainInner">{children}</div>
        {hasMore && (
          <div className="shell__scrollHint" aria-hidden="true">
            <span className="shell__scrollHintPill">
              아래에 항목이 더 있어요
              <span className="shell__scrollHintIcon">↓</span>
            </span>
          </div>
        )}
      </main>

      <footer className="shell__bottom">
        <div className="shell__bottomInner">
          {footer}
          <button type="button" className="helpBtn" onClick={onHelp}>
            입력이 어려워요
          </button>
        </div>
      </footer>
    </div>
  )
}
