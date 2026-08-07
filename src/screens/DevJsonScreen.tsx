type SubmissionInfo = {
  state: 'idle' | 'sending' | 'sent' | 'error'
  id: string | null
  error: string | null
  onRetry: () => void
}

type Props = {
  payload: unknown
  onRestart: () => void
  /** null이면 로컬 서버 미설정 — 기존과 동일하게 동작(전송 UI 없음). */
  submission?: SubmissionInfo | null
}

/**
 * 개발자용 확인 화면. v0.1 프로토타입 전용이며 실제 환자 흐름에는 노출하지 않는다.
 * 서버(server/index.js)가 설정된 경우에만 자동 제출 상태를 함께 보여준다.
 */
export function DevJsonScreen({ payload, onRestart, submission }: Props) {
  const json = JSON.stringify(payload, null, 2)

  return (
    <div className="shell">
      <main className="shell__main devJson">
        <div className="devJson__inner">
          <h2>정밀문진이 완료되었습니다.</h2>
          <ul className="checkList">
            <li>현재 불편한 부분</li>
            <li>전반적인 몸 상태</li>
          </ul>

          {submission && (
            <p className="helper" role="status">
              {submission.state === 'sending' && '원장님 화면으로 전송 중...'}
              {submission.state === 'sent' && `전송 완료 (접수번호: ${submission.id})`}
              {submission.state === 'error' && (
                <>
                  전송 실패: {submission.error ?? '알 수 없는 오류'}{' '}
                  <button type="button" onClick={submission.onRetry}>
                    다시 시도
                  </button>
                </>
              )}
              {submission.state === 'idle' && '전송 준비 중...'}
            </p>
          )}

          <p className="helper">
            아래는 개발자 확인용 응답 JSON입니다. (v0.1 프로토타입 전용)
          </p>
          <pre>{json}</pre>
        </div>
      </main>
      <footer className="shell__bottom">
        <div className="shell__bottomInner">
          <button type="button" className="primaryBtn" onClick={onRestart}>
            처음 화면으로 (세션 초기화)
          </button>
        </div>
      </footer>
    </div>
  )
}
