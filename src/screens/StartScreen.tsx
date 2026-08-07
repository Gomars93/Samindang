type Props = {
  onStart: () => void
}

/** CORE_00 시작 */
export function StartScreen({ onStart }: Props) {
  return (
    <div className="center">
      <div className="center__inner">
        <div className="brand">삼인당 한의원</div>
        <h1 className="title">몸 상태를 자세히 확인하기 위한 문진입니다.</h1>
        <p className="lead">
          평소 몸 상태와 현재 불편한 점을 알려주세요. 답변에 따라 필요한 질문만
          이어집니다.
        </p>
        <button type="button" className="primaryBtn" onClick={onStart}>
          문진 시작하기
        </button>
      </div>
    </div>
  )
}
