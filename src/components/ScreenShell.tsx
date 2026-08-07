import type { ReactNode } from 'react'
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
}: Props) {
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

      <main className="shell__main">
        <div className="shell__mainInner">{children}</div>
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
