import { useRef, useState } from 'react'
import { ALL_QUESTIONS, SYSTEMIC_BLOCK_QUESTION_IDS } from '../spec/coreSpec'

/**
 * Tablet UX v2.2 §24: GitHub Pages NO-PHI preview(및 로컬 dev)에서만 보이는
 * QA 전용 시뮬레이션 -- 실제 서버 trigger나 세션 재개 없이, herbal_addon
 * mode가 활성화되면 어떤 질문들이 새로 열리는지만 읽기 전용으로 보여준다.
 * production 빌드에서는 이 조건이 항상 false라 아예 렌더링되지 않는다
 * (staff-only 기능이 실제 환자 UI에 노출되지 않게 하라는 §24 단서 준수).
 */
const isPreviewOrDevBuild = (): boolean =>
  import.meta.env.DEV || import.meta.env.VITE_PREVIEW_MODE === 'true'

const SYSTEMIC_BLOCK_LABELS = SYSTEMIC_BLOCK_QUESTION_IDS.map(
  (id) => ALL_QUESTIONS.find((q) => q.id === id)?.question ?? id,
)

/**
 * 환자 제출 상태. App.tsx가 실제 전송 흐름(server/index.js 유무, 응답 성공/실패)을
 * 이 5개 값으로 요약해 이 화면에 넘긴다.
 *  - idle       : 아직 전송 시도 전 (렌더링 순간적으로만 존재)
 *  - submitting : 전송 요청 진행 중
 *  - success    : 전송 성공
 *  - error      : 전송 실패 (네트워크/타임아웃/서버 오류)
 *  - unconfigured: 서버 미설정(dev/standalone) — 전송 자체를 시도하지 않음
 */
export type SubmitState = 'idle' | 'submitting' | 'success' | 'error' | 'unconfigured'

/** 스펙 문서 "운영 상태 흐름" 4단계 (질문 스텝 STEPS와는 다른 개념). */
const OPERATIONAL_STEPS = [
  '접수 완료',
  '상세문진 완료',
  '체질분석 준비 중',
  '원장님 진료',
] as const

const DEFAULT_WAIT_MESSAGE = '순서대로 안내해 드립니다. 잠시만 기다려 주세요.'

/** 직원 리셋 길게 누르기 시간(ms). 실수로 스칠 때 발동하지 않도록 충분히 길게 잡는다. */
const STAFF_RESET_HOLD_MS = 2000

type StepStatus = 'done' | 'active' | 'pending'

function stepStatuses(submitState: SubmitState): StepStatus[] {
  if (submitState === 'error') {
    // 전송되지 않았으므로 "체질분석 준비 중"에 도달했다고 말하지 않는다.
    return ['done', 'done', 'pending', 'pending']
  }
  // success / unconfigured: 상세문진까지는 끝났고 체질분석 준비 중이 현재 단계.
  return ['done', 'done', 'active', 'pending']
}

type Props = {
  submitState: SubmitState
  submitId?: string | null
  errorReason?: string | null
  onRetry?: () => void
  /** 개발자 확인용 원본 JSON (dev 전용 문). 환자에게는 절대 노출하지 않는다. */
  payload: unknown
  /** import.meta.env.DEV 기반, App.tsx가 명시적으로 넘긴다 (테스트에서 false 주입 가능). */
  devMode: boolean
  /** 직원 세션 초기화. dev 전용 문 뒤에 둔다 — 자세한 내용은 이 파일 하단 주석 참고. */
  onStaffReset: () => void
}

/**
 * 환자용 완료/대기 화면.
 *
 * 직원 리셋 배치 결정: 개발자 JSON과 같은 dev 전용 문(devMode && '개발자
 * 보기' 토글) 뒤의 "처음 화면으로 (세션 초기화)" 버튼은 개발/스테이징
 * 전용이다. 프로덕션 빌드(devMode=false)에서는 그 버튼이 없으므로, 화면
 * 맨 아래 구석에 눈에 띄지 않는 `StaffResetHold`(2초 길게 누르기) 컨트롤을
 * 항상 하나 둔다 — 태블릿을 매 환자마다 직접 조작하는 접수처 직원이 이전
 * 환자의 응답이 화면에 남아 다음 환자에게 보이는 일 없이 세션을 초기화할
 * 수 있게 하기 위함이다. 짧은 탭/스치는 접촉으로는 절대 발동하지 않는다.
 */
export function PatientCompleteScreen({
  submitState,
  submitId,
  errorReason,
  onRetry,
  payload,
  devMode,
  onStaffReset,
}: Props) {
  const [showJson, setShowJson] = useState(false)

  if (submitState === 'submitting') {
    return (
      <div className="center">
        <div className="center__inner">
          <p className="waitStatus" role="status">
            전송 중입니다
          </p>
        </div>
      </div>
    )
  }

  if (submitState === 'error') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">아직 전송되지 않았습니다</h1>
            <p className="notice" role="alert">{errorReason ?? '알 수 없는 오류가 발생했습니다.'}</p>
            <p className="helper helper--strong">
              직원에게 태블릿 화면을 보여주세요.
            </p>

            <StatusFlow statuses={stepStatuses(submitState)} />

            <button type="button" className="primaryBtn" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        </main>
        <StaffResetHold onReset={onStaffReset} />
        {devMode && (
          <DevDoor
            payload={payload}
            showJson={showJson}
            onToggle={() => setShowJson((s) => !s)}
            onStaffReset={onStaffReset}
          />
        )}
      </div>
    )
  }

  // success | unconfigured
  const waitMessage =
    import.meta.env?.VITE_SAMINDANG_WAIT_MESSAGE?.trim() || DEFAULT_WAIT_MESSAGE

  return (
    <div className="shell">
      <main className="shell__main complete">
        <div className="complete__inner">
          <h1 className="title">문진이 접수되었습니다</h1>

          <StatusFlow statuses={stepStatuses(submitState)} />

          <p className="helper">{waitMessage}</p>

          {submitState === 'success' && submitId && (
            <p className="submitIdMuted">접수번호 {submitId}</p>
          )}
        </div>
      </main>
      <StaffResetHold onReset={onStaffReset} />
      {devMode && (
        <DevDoor
          payload={payload}
          showJson={showJson}
          onToggle={() => setShowJson((s) => !s)}
          onStaffReset={onStaffReset}
        />
      )}
    </div>
  )
}

function StatusFlow({ statuses }: { statuses: StepStatus[] }) {
  return (
    <ol className="statusFlow">
      {OPERATIONAL_STEPS.map((label, i) => (
        <li
          key={label}
          className={`statusFlow__item statusFlow__item--${statuses[i]}`}
          data-status={statuses[i]}
        >
          <span className="statusFlow__mark" aria-hidden="true">
            {statuses[i] === 'done' ? '✓' : i + 1}
          </span>
          <span className="statusFlow__label">{label}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * 항상 존재하는(devMode 무관) 직원 전용 세션 초기화 컨트롤. 화면 맨 아래
 * 구석에 작고 눈에 띄지 않게 두고, 2초 이상 누르고 있어야 발동한다 — 짧은
 * 탭이나 실수로 스치는 접촉으로는 절대 초기화되지 않는다. 환자 흐름의
 * 일부처럼 보이지 않도록 라벨/문구를 넣지 않는다.
 */
function StaffResetHold({ onReset }: { onReset: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holding, setHolding] = useState(false)

  const cancel = () => {
    setHolding(false)
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const start = () => {
    setHolding(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setHolding(false)
      onReset()
    }, STAFF_RESET_HOLD_MS)
  }

  return (
    <button
      type="button"
      className={`staffResetHold${holding ? ' staffResetHold--holding' : ''}`}
      aria-label="직원용: 2초 이상 눌러서 다음 환자를 위해 초기화"
      title="직원용 초기화 (2초 이상 누르기)"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    />
  )
}

/** 개발자 전용 문: JSON 원본 확인 + 직원 세션 초기화. 환자 화면 맨 아래, 눈에 띄지 않게. */
function DevDoor({
  payload,
  showJson,
  onToggle,
  onStaffReset,
}: {
  payload: unknown
  showJson: boolean
  onToggle: () => void
  onStaffReset: () => void
}) {
  const [showAddonPreview, setShowAddonPreview] = useState(false)

  return (
    <footer className="shell__bottom">
      <div className="shell__bottomInner">
        <button type="button" className="devToggle" onClick={onToggle}>
          개발자 보기
        </button>
        {showJson && (
          <>
            <pre className="devJson-pre">{JSON.stringify(payload, null, 2)}</pre>
            <button type="button" className="primaryBtn" onClick={onStaffReset}>
              처음 화면으로 (세션 초기화)
            </button>
          </>
        )}
        {isPreviewOrDevBuild() && (
          <>
            <button type="button" className="devToggle" onClick={() => setShowAddonPreview((s) => !s)}>
              한약 추가문진 미리보기 (QA)
            </button>
            {showAddonPreview && (
              <div className="devJson-pre" aria-label="herbal-addon-preview">
                <p>실제 서버 전송/세션 재개 없이, 진료 중 "한약 추가문진 시작"을 누르면 아래 질문이 새로 열립니다.</p>
                <ul>
                  {SYSTEMIC_BLOCK_LABELS.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </footer>
  )
}
