type Props = {
  payload: unknown
  onRestart: () => void
}

/**
 * 개발자용 확인 화면. v0.1 프로토타입 전용이며 실제 환자 흐름에는 노출하지 않는다.
 * (서버 저장 / DB는 이번 범위 밖)
 */
export function DevJsonScreen({ payload, onRestart }: Props) {
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
          <p className="helper">
            아래는 개발자 확인용 응답 JSON입니다. (v0.1 프로토타입 전용 —
            서버 저장 없음)
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
