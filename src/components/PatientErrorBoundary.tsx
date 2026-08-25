import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** 세션을 초기화하고 처음 화면으로 되돌린다 (App.tsx의 restart와 동일한 개념). */
  onReset: () => void
}

type State = {
  hasError: boolean
}

/**
 * 환자용 문진 트리 전체를 감싸는 최상위 error boundary.
 *
 * React 렌더링 중 처리되지 않은 예외가 발생하면 기본적으로 트리 전체가
 * unmount되어 흰 화면만 남는다(직원이 새로고침해야 하고, 환자는 아무 안내도
 * 받지 못한다). 이 컴포넌트는 그 대신 항상 "직원을 불러주세요" 안내와 처음
 * 화면으로 돌아가는 버튼을 보여준다 -- 원인이 된 에러 메시지/스택은 환자
 * 화면에 절대 노출하지 않는다(콘솔에만 남긴다, 운영 중 디버깅용).
 *
 * App.tsx의 `phase === 'done'` payload 조립 자체는 이미 try/catch로 보호되어
 * 있다(계산 오류가 나도 완료 화면의 기존 에러 경로로 떨어짐) -- 이 boundary는
 * 그 외 모든 렌더링 단계(질문 화면, StaffCheck, 시작 화면 등)에서 발생할 수
 * 있는 예외까지 포괄하는 마지막 안전망이다.
 */
export class PatientErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[PatientErrorBoundary]', error, info.componentStack)
  }

  private handleReset = () => {
    this.setState({ hasError: false })
    this.props.onReset()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="center">
        <div className="center__inner">
          <p className="notice" role="alert">
            문제가 발생했습니다. 태블릿을 직원에게 보여주세요.
          </p>
          <button type="button" className="primaryBtn" onClick={this.handleReset}>
            처음 화면으로
          </button>
        </div>
      </div>
    )
  }
}
