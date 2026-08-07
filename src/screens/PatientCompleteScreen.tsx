import { useState } from 'react'

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
 * 직원 리셋 배치 결정: "처음 화면으로 (세션 초기화)" 버튼은 개발자 JSON과 같은
 * dev 전용 문(devMode && '개발자 보기' 토글) 뒤에 둔다. 이 태블릿은 접수처 직원이
 * 매 환자마다 직접 조작하므로, 실기기에서는 devMode=false(프로덕션 빌드)로 두고
 * 직원이 태블릿 자체(OS 홈 버튼 등)로 다음 환자를 위해 새로고침하는 운영을 전제한다.
 * 개발/스테이징에서는 '개발자 보기'로 즉시 리셋 가능해야 하므로 같은 문 뒤에 둔다.
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
            <p className="notice">{errorReason ?? '알 수 없는 오류가 발생했습니다.'}</p>
            <p className="helper helper--strong">
              직원에게 태블릿 화면을 보여주세요.
            </p>

            <StatusFlow statuses={stepStatuses(submitState)} />

            <button type="button" className="primaryBtn" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        </main>
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
      </div>
    </footer>
  )
}
