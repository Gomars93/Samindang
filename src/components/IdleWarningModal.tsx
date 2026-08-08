type Props = {
  onContinue: () => void
}

/**
 * 문진 중 60초간 조작이 없을 때(만료 60초 전) 뜨는 안내. 만료 자체는
 * App.tsx의 idle 타이머가 처리한다 — 이 컴포넌트는 순수 표시 + 버튼일 뿐.
 * 큰 글씨/큰 버튼 — 어르신 환자가 당황하지 않도록 부드러운 문구를 쓴다.
 */
export function IdleWarningModal({ onContinue }: Props) {
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__box">
        <h2 className="modal__title">아직 계신가요?</h2>
        <p className="modal__body">
          잠시 후 화면이 처음으로 돌아갑니다. 계속 작성하시려면 아래 버튼을
          눌러주세요.
        </p>
        <button type="button" className="primaryBtn" onClick={onContinue}>
          계속하기
        </button>
      </div>
    </div>
  )
}
