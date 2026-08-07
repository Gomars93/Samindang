type Props = {
  steps: readonly string[]
  currentStep: string
  stepProgress: number
}

/** 단계형 progress (스펙 34-11: %가 아닌 단계형을 v0.1에서 사용) */
export function StepProgress({ steps, currentStep, stepProgress }: Props) {
  const currentIndex = steps.indexOf(currentStep)

  return (
    <div
      className="steps"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={currentIndex + 1}
      aria-label={`${steps.length}단계 중 ${currentIndex + 1}단계: ${currentStep}`}
    >
      {steps.map((step, i) => {
        const ratio = i < currentIndex ? 1 : i === currentIndex ? stepProgress : 0
        return (
          <span key={step} className="steps__item">
            <span
              className="steps__fill"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </span>
        )
      })}
    </div>
  )
}
