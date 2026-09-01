import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback: ReactNode
}

type State = {
  hasError: boolean
}

/**
 * Malformed/legacy submission resilience batch: a local error boundary
 * around the payload-dependent portion of a single Doctor record view
 * (module safety panels, DoctorWorkspace, JudgmentPanel, EMR/myungri
 * surfaces -- everything downstream of `recordToPayload()`).
 *
 * Doctor Clinical Workspace 자체를 감싸는 별도 boundary가 필요한 이유:
 * `PatientErrorBoundary`(src/components/PatientErrorBoundary.tsx)는 App
 * 전체의 마지막 안전망이라 여기서 잡히면 세션 전체가 리셋된다 -- 원장이 한
 * 레거시/손상된 제출건을 열었다고 진료 워크스테이션 전체가 초기화되는 것은
 * 파일럿 운영 실패 모드다. 이 boundary는 그 기록 하나의 상세 뷰만 격리해서,
 * 나머지 화면(제출목록, 재진 큐, Micro Follow-up 발급, CRM/투약 코스 섹션 --
 * 전부 이 컴포넌트 밖에서 렌더링됨)은 계속 정상 동작하게 한다.
 *
 * `DoctorView.tsx`는 이 boundary를 반드시 `key={selectedRecord?.id ?? 'fixtures'}`
 * 로 렌더링해야 한다 -- React는 하위 트리의 props가 바뀌었다고 해서 error
 * boundary의 `hasError` state를 스스로 리셋하지 않으므로, key 없이는 손상된
 * 기록 A를 본 뒤 정상 기록 B로 전환해도 그 fallback이 그대로 남아있게 된다
 * (레코드 간 stale error state 누출 -- 다른 회차들이 patientUuid 등으로 이미
 * 쓰는 것과 같은 remount 패턴).
 */
export class DoctorRecordErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // 환자 개인정보가 에러 객체/스택 안에 섞여 나올 수 있는 값(예: 답변
    // 내용을 그대로 담은 콘텍스트)은 이 배치의 범위에서 이 코드가 만들지
    // 않는다 -- 표준 JS 에러 메시지/스택만 남긴다(기존 PatientErrorBoundary
    // 와 동일한 원칙).
    // eslint-disable-next-line no-console
    console.error('[DoctorRecordErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
