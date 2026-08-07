import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpModal } from './components/HelpModal'
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

export default function App() {
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
  /** 화면별 직원 확인 안내는 한 번씩만 노출 (SAFETY_01 / GI_03 / BOWEL_03) */
  const [staffNoticeShownFor, setStaffNoticeShownFor] = useState<Set<string>>(
    () => new Set(),
  )

  const visible = useMemo(() => visibleQuestions(responses), [responses])
  const current: Question | undefined =
    visible.find((q) => q.id === currentId) ?? visible[0]

  const flags = useMemo(() => computeFlags(responses), [responses])

  /* ---------- server handoff (optional) ---------- */

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitId, setSubmitId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const donePayload = useMemo(
    () => ({
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
    }),
    [sessionId, responses, flags, startedAt, meta],
  )

  const doSubmit = () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitState('submitting')
    setSubmitError(null)
    submitQuestionnaire(donePayload).then((result) => {
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
    if (!isServerConfigured()) {
      // dev/standalone: 전송을 시도하지 않는다 — 완료 화면은 "전송됨"을 주장하지 않는다.
      setSubmitState('unconfigured')
      return
    }
    doSubmit()
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
        payload={donePayload}
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
        canGoBack={visited.length > 0}
        onBack={goBack}
        onHelp={() => setHelpOpen(true)}
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
    </>
  )
}
