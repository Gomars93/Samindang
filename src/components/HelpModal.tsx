type Props = {
  onClose: () => void
}

/** `입력이 어려워요` — 직원 호출 안내 (v0.1에서는 화면 안내만) */
export function HelpModal({ onClose }: Props) {
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__box">
        <h2 className="modal__title">직원을 불러드릴까요?</h2>
        <p className="modal__body">
          태블릿을 들고 접수 직원에게 보여주세요. 남은 부분을 함께 도와드립니다.
        </p>
        <button type="button" className="primaryBtn" onClick={onClose}>
          계속 작성할게요
        </button>
      </div>
    </div>
  )
}
