type Props = {
  onContinue: () => void
}

/**
 * Red Flag(SAFETY_01) UX 규칙 (스펙 8장):
 * 선택 즉시 경고 팝업 금지, 화면 제출 후 안내한다.
 * 환자 화면에서 질환명·응급 진단 추정은 하지 않는다.
 */
export function StaffCheckScreen({ onContinue }: Props) {
  return (
    <div className="center">
      <div className="center__inner">
        <p className="notice">
          먼저 확인이 필요한 내용이 있습니다. 태블릿을 직원에게 보여주세요.
        </p>
        <button type="button" className="primaryBtn" onClick={onContinue}>
          확인했어요, 계속하기
        </button>
      </div>
    </div>
  )
}
