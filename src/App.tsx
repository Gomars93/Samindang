import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpModal } from './components/HelpModal'
import { IdleWarningModal } from './components/IdleWarningModal'
import { PatientErrorBoundary } from './components/PatientErrorBoundary'
import { PreviewBanner } from './components/PreviewBanner'
import { ScreenShell } from './components/ScreenShell'
import { DoctorView } from './doctor/DoctorView'
import { PatientCompleteScreen, type SubmitState } from './screens/PatientCompleteScreen'
import {
  QuestionBody,
  confirmLabel,
  isAnswered,
  needsConfirmButton,
} from './screens/QuestionScreen'
import { StaffCheckScreen } from './screens/StaffCheckScreen'
import { StartScreen } from './screens/StartScreen'
import { isServerConfigured, submitQuestionnaire } from './lib/serverClient'
import { computeSaju } from './saju'
import {
  ALL_QUESTIONS,
  STAFF_CHECK_TRIGGERS,
  STEPS,
  buildResponsePayload,
  buildRoutingPayload,
  buildSajuInput,
  computeFlags,
  pruneStaleResponses,
  visibleQuestions,
} from './spec/coreSpec'
import type { AnswerValue, Question, Responses } from './types'

type Phase = 'start' | 'question' | 'staff_check' | 'done'

type AnswerMeta = {
  answered_at: string
  source_screen: string
  changed_after_back: boolean
  /** stale branch cleanup으로 current responses에서 제거된 응답 (audit용) */
  discarded?: true
}

const emptyResponses = (): Responses =>
  // 스펙 3.3: 보지 않은 질문은 null. none/unknown과 구분한다.
  Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))

const newSessionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}`

/** 문진(question phase) 전용 유휴 타임아웃. 완료 화면/원장 화면에는 절대 적용하지 않는다. */
const IDLE_MINUTES = Number(import.meta.env.VITE_SAMINDANG_IDLE_MINUTES) || 10
const IDLE_MS = IDLE_MINUTES * 60_000
const IDLE_WARNING_BEFORE_MS = 60_000

/**
 * 최상위 export. AppContent 트리 어딘가에서 처리되지 않은 렌더링 예외가
 * 나도(흰 화면 대신) PatientErrorBoundary가 안내 화면을 보여주고, "처음
 * 화면으로"를 누르면 `resetKey`를 바꿔 AppContent를 통째로 새 key로
 * remount한다 -- 무엇이 깨졌는지와 무관하게 모든 state(useState 초기값)가
 * 확실히 새로 시작되는, 가장 안전한 복구 방법이다(깨진 트리 내부의 개별
 * setState 핸들러에 의존하지 않는다).
 */
export default function App() {
  const [resetKey, setResetKey] = useState(0)
  return (
    <>
      <PreviewBanner />
      <PatientErrorBoundary onReset={() => setResetKey((k) => k + 1)}>
        <AppContent key={resetKey} />
      </PatientErrorBoundary>
    </>
  )
}

function AppContent() {
  const [isDoctorView, setIsDoctorView] = useState(
    () => typeof window !== 'undefined' && window.location.hash.startsWith('#doctor'),
  )

  useEffect(() => {
    const onHashChange = () => setIsDoctorView(window.location.hash.startsWith('#doctor'))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const [phase, setPhase] = useState<Phase>('start')
  const [responses, setResponses] = useState<Responses>(emptyResponses)
  const [meta, setMeta] = useState<Record<string, AnswerMeta>>({})
  const [currentId, setCurrentId] = useState<string>(ALL_QUESTIONS[0].id)
  const [visited, setVisited] = useState<string[]>([])
  const [helpOpen, setHelpOpen] = useState(false)
  const [sessionId, setSessionId] = useState(newSessionId)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  // MENOPAUSE_SLEEP v0.2 Compact UX telemetry (delta 9장) — PII 없음, 이 패널
  // 화면(MS_ prefix)에서만 계측한다. 다른 패널로 확장하지 않는다.
  const [panelStartedAt, setPanelStartedAt] = useState<string | null>(null)
  const [panelScreens, setPanelScreens] = useState<string[]>([])
  const [panelBackCount, setPanelBackCount] = useState(0)
  const [panelHelpCount, setPanelHelpCount] = useState(0)
  /** 화면별 직원 확인 안내는 한 번씩만 노출 (SAFETY_01 / GI_03 / BOWEL_03) */
  const [staffNoticeShownFor, setStaffNoticeShownFor] = useState<Set<string>>(
    () => new Set(),
  )

  const visible = useMemo(() => visibleQuestions(responses), [responses])
  const current: Question | undefined =
    visible.find((q) => q.id === currentId) ?? visible[0]

  const flags = useMemo(() => computeFlags(responses), [responses])

  useEffect(() => {
    if (!current || !current.id.startsWith('MS_')) return
    setPanelStartedAt((s) => s ?? new Date().toISOString())
    setPanelScreens((s) => (s.includes(current.id) ? s : [...s, current.id]))
  }, [current])

  /* ---------- server handoff (optional) ---------- */

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitId, setSubmitId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  // 전송용 payload 스냅샷. phase가 'done'이 되는 순간 한 번만 만들어 ref에
  // 담는다 — 이후 프라이버시 wipe로 responses/meta가 비워져도 재전송(dosSubmit
  // retry)이 옛 스냅샷을 그대로 쓸 수 있게 하기 위함이다.
  const donePayloadRef = useRef<unknown>(null)
  // 완료 화면의 dev 전용 JSON 뷰어에 넘길 값. 프로덕션(devMode=false)에서는
  // success/unconfigured 도달 즉시 비운다 — dev 모드에서는 개발자가 명시적으로
  // 확인해야 하므로 유지한다(아래 wipe 이펙트 참고).
  const [devPayload, setDevPayload] = useState<unknown>(null)

  const doSubmit = () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitState('submitting')
    setSubmitError(null)
    submitQuestionnaire(donePayloadRef.current).then((result) => {
      if (result.ok) {
        setSubmitId(result.data.id)
        setSubmitState('success')
      } else {
        setSubmitState('error')
        setSubmitError(result.error)
        submittingRef.current = false // allow retry
      }
    })
  }

  useEffect(() => {
    if (phase !== 'done') return
    // 계산 단계(특히 computeSaju)가 던지면 useEffect 밖으로 예외가 나가 트리가
    // 통째로 unmount되어 화면이 하얗게 멈춘다(직원이 새로고침해야 하고, 그동안
    // 응답도 잃는다) — payload 조립을 통째로 감싸서 실패해도 항상 완료 화면의
    // 기존 error 경로("다시 시도"/직원 안내)로 떨어지게 한다.
    try {
      // responses/meta가 아직 비워지기 전에 딱 한 번 payload를 스냅샷한다.
      donePayloadRef.current = {
        questionnaire_version: '1.0',
        session_id: sessionId,
        responses: buildResponsePayload(responses),
        // 계산된 사실(derived)과 환자가 답한 문진(responses)을 데이터상 분리한다.
        myungri_calculation: computeSaju(buildSajuInput(responses)),
        flags,
        routing: buildRoutingPayload(responses),
        metadata: {
          session_started_at: startedAt,
          answers: meta,
        },
        // MENOPAUSE_SLEEP v0.2 Compact UX telemetry (delta 9장). PII 없음 —
        // panelStartedAt이 null이면(Gate까지 도달하지 않음) 아예 만들지 않는다.
        panelTelemetry: panelStartedAt
          ? {
              panel_id: 'menopause_sleep_v0_2',
              started_at: panelStartedAt,
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - new Date(panelStartedAt).getTime(),
              screens_shown: panelScreens.length,
              back_count: panelBackCount,
              help_count: panelHelpCount,
              completed: responses['MS_GATE_01'] === 'yes' || responses['MS_GATE_01'] === 'unsure',
            }
          : null,
      }
    } catch {
      donePayloadRef.current = null
      setSubmitState('error')
      setSubmitError('문진 결과를 처리하는 중 오류가 발생했습니다.')
      return
    }
    setDevPayload(donePayloadRef.current)
    if (!isServerConfigured()) {
      // dev/standalone: 전송을 시도하지 않는다 — 완료 화면은 "전송됨"을 주장하지 않는다.
      setSubmitState('unconfigured')
      return
    }
    doSubmit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 공유 태블릿 프라이버시: 제출이 끝났다고 확정되는 순간(성공 또는 서버
  // 미구성으로 더 이상 아무것도 보내지 않음) 환자 식별 정보를 담은 state를
  // 즉시 비운다. 다음 환자가 태블릿을 넘겨받기 전에 화면에 남지 않게 한다.
  useEffect(() => {
    if (submitState !== 'success' && submitState !== 'unconfigured') return
    setResponses(emptyResponses())
    setMeta({})
    setVisited([])
    setStartedAt(null)
    setPanelStartedAt(null)
    setPanelScreens([])
    setPanelBackCount(0)
    setPanelHelpCount(0)
    donePayloadRef.current = null
    // 프로덕션 빌드에는 dev JSON 뷰어 자체가 없으므로 payload도 메모리에서
    // 지운다. dev 모드는 개발자가 명시적으로 확인해야 하므로 유지한다.
    if (!import.meta.env.DEV) setDevPayload(null)
  }, [submitState])

  // 완료 화면 도달 후 뒤로가기(브라우저 Back / 태블릿 뒤로가기 제스처)가
  // 채워진 문진 화면으로 되돌아가지 못하게 막는다. #doctor 해시 라우팅은
  // hashchange로만 판단하므로 여기서 건드리지 않는다.
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    window.history.pushState({ samindangDone: true }, '', window.location.href)
  }, [phase])

  useEffect(() => {
    const onPopState = () => {
      if (phaseRef.current === 'done') {
        window.history.pushState({ samindangDone: true }, '', window.location.href)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // 유휴 타임아웃: question phase에서만 동작한다(완료 화면/원장 화면 절대
  // 아님). 만료 60초 전 안내 모달을 띄우고, 그래도 조작이 없으면 restart().
  const [idleWarning, setIdleWarning] = useState(false)

  useEffect(() => {
    if (phase !== 'question') {
      setIdleWarning(false)
      return
    }
    let warnTimer: ReturnType<typeof setTimeout>
    let expireTimer: ReturnType<typeof setTimeout>

    const arm = () => {
      clearTimeout(warnTimer)
      clearTimeout(expireTimer)
      setIdleWarning(false)
      const warnDelay = Math.max(IDLE_MS - IDLE_WARNING_BEFORE_MS, 0)
      warnTimer = setTimeout(() => setIdleWarning(true), warnDelay)
      expireTimer = setTimeout(() => restart(), IDLE_MS)
    }

    arm()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      clearTimeout(warnTimer)
      clearTimeout(expireTimer)
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  /* ---------- navigation ---------- */

  const nextQuestion = (from: string, r: Responses): Question | undefined => {
    const list = visibleQuestions(r)
    const idx = list.findIndex((q) => q.id === from)
    return idx >= 0 ? list[idx + 1] : list[0]
  }

  const goNext = () => {
    if (!current) return

    // Red Flag / module safety flag 제출 직후에만 직원 확인 안내 (스펙 8장 UX)
    const trigger = STAFF_CHECK_TRIGGERS[current.id]
    if (trigger && !staffNoticeShownFor.has(current.id) && trigger(responses)) {
      setStaffNoticeShownFor((s) => new Set(s).add(current.id))
      setPhase('staff_check')
      return
    }

    const next = nextQuestion(current.id, responses)
    setVisited((v) => [...v, current.id])
    if (next) setCurrentId(next.id)
    else setPhase('done')
  }

  const goBack = () => {
    if (current && current.id.startsWith('MS_')) setPanelBackCount((c) => c + 1)
    // show_if 변경으로 더 이상 표시되지 않는 화면은 건너뛴다
    const stack = [...visited]
    while (stack.length > 0) {
      const prev = stack.pop() as string
      if (visible.some((q) => q.id === prev)) {
        setVisited(stack)
        setCurrentId(prev)
        return
      }
    }
    setVisited([])
  }

  const setAnswer = (q: Question, value: AnswerValue) => {
    // 상위 선택이 바뀌면 더 이상 표시되지 않는 화면의 응답을 즉시 정리한다.
    const { responses: pruned, removed } = pruneStaleResponses({
      ...responses,
      [q.id]: value,
    })

    setResponses(pruned)
    setMeta((m) => {
      const next: Record<string, AnswerMeta> = {
        ...m,
        [q.id]: {
          answered_at: new Date().toISOString(),
          source_screen: q.id,
          changed_after_back: m[q.id] !== undefined,
        },
      }
      for (const id of removed) {
        if (next[id]) next[id] = { ...next[id], discarded: true }
      }
      return next
    })
  }

  const restart = () => {
    // 세션 종료 시 환자 식별 정보를 포함한 client state를 모두 비운다
    setResponses(emptyResponses())
    setMeta({})
    setVisited([])
    setCurrentId(ALL_QUESTIONS[0].id)
    setStaffNoticeShownFor(new Set())
    setStartedAt(null)
    setPanelStartedAt(null)
    setPanelScreens([])
    setPanelBackCount(0)
    setPanelHelpCount(0)
    setSessionId(newSessionId())
    setPhase('start')
  }

  /* ---------- progress ---------- */

  const stepInfo = useMemo(() => {
    if (!current) return { step: STEPS[STEPS.length - 1], progress: 1 }
    const inStep = visible.filter((q) => q.step === current.step)
    const idx = inStep.findIndex((q) => q.id === current.id)
    return {
      step: current.step,
      progress: inStep.length > 0 ? idx / inStep.length : 0,
    }
  }, [current, visible])

  /* ---------- render ---------- */

  if (isDoctorView) {
    return <DoctorView />
  }

  if (phase === 'start') {
    return (
      <StartScreen
        onStart={() => {
          setStartedAt(new Date().toISOString())
          setPhase('question')
        }}
      />
    )
  }

  if (phase === 'staff_check') {
    return (
      <StaffCheckScreen
        onContinue={() => {
          if (!current) return
          const next = nextQuestion(current.id, responses)
          setVisited((v) => [...v, current.id])
          if (next) {
            setCurrentId(next.id)
            setPhase('question')
          } else {
            setPhase('done')
          }
        }}
      />
    )
  }

  if (phase === 'done') {
    return (
      <PatientCompleteScreen
        submitState={submitState}
        submitId={submitId}
        errorReason={submitError}
        onRetry={doSubmit}
        payload={devPayload}
        devMode={import.meta.env.DEV}
        onStaffReset={restart}
      />
    )
  }

  if (!current) return null

  const value = responses[current.id]
  const answered = !current.required || isAnswered(current, value)
  const showConfirm = needsConfirmButton()

  return (
    <>
      <ScreenShell
        steps={STEPS}
        currentStep={stepInfo.step}
        stepProgress={stepInfo.progress}
        questionId={current.id}
        canGoBack={visited.length > 0}
        onBack={goBack}
        onHelp={() => {
          if (current.id.startsWith('MS_')) setPanelHelpCount((c) => c + 1)
          setHelpOpen(true)
        }}
        footer={
          showConfirm ? (
            <button
              type="button"
              className="primaryBtn"
              disabled={!answered}
              onClick={goNext}
            >
              {confirmLabel(current)}
            </button>
          ) : null
        }
      >
        <QuestionBody
          key={current.id}
          question={current}
          value={value}
          responses={responses}
          onChange={(v) => setAnswer(current, v)}
        />
      </ScreenShell>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {idleWarning && <IdleWarningModal onContinue={() => setIdleWarning(false)} />}
    </>
  )
}
