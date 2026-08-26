import { useEffect, useMemo, useRef, useState } from 'react'
import { getBodyMapZoneLabel } from './components/BodyMap'
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
import { StaffHerbalAddonHold } from './screens/StaffHerbalAddonHold'
import { StartScreen } from './screens/StartScreen'
import { isServerConfigured, submitQuestionnaire } from './lib/serverClient'
import { computeSaju } from './saju'
import {
  ALL_QUESTIONS,
  HERBAL_ADDON_FIELD,
  LBP_LEG_AUTOFILL_FIELD,
  LBP_RAW_AGE_FIELD,
  STAFF_CHECK_TRIGGERS,
  STEPS,
  buildResponsePayload,
  buildRoutingPayload,
  buildSajuInput,
  computeFlags,
  mapLbpOnsetAgeToBefore45,
  primaryConcernKey,
  pruneStaleResponses,
  questionnaireMode,
  shouldAutoAdvancePast,
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

const emptyResponses = (): Responses => ({
  // 스펙 3.3: 보지 않은 질문은 null. none/unknown과 구분한다.
  ...Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null])),
  // Tablet UX v2.2.1 §12: HERBAL_ADDON_FIELD는 ALL_QUESTIONS에 속하지 않는
  // non-question 내부 플래그라 위 Object.fromEntries가 자동으로 초기화하지
  // 않는다 -- 매 새 세션(첫 로드/제출 후 privacy wipe/직원 restart 전부
  // 이 함수를 다시 호출한다)마다 명시적으로 null로 되돌려, 이전 환자
  // session에서 'yes'가 stale하게 남아 다음 pain_care 환자를 herbal_addon
  // 모드처럼 보이게 만드는 일이 구조적으로 불가능하게 한다(실제로 기존
  // 스프레드 경로에서도 이미 안전했다 -- 이 함수는 항상 완전히 새 객체를
  // 만들 뿐 이전 Responses를 절대 스프레드하지 않는다 -- 이 줄은 그
  // 보장을 명시적으로 코드에 남겨 감사 가능하게 하기 위함이다).
  [HERBAL_ADDON_FIELD]: null,
  // Tablet UX v2.3 §13: LBP_RAW_AGE_FIELD도 같은 이유로 non-question
  // metadata라 자동 초기화되지 않는다 -- 동일하게 명시적으로 null 처리.
  [LBP_RAW_AGE_FIELD]: null,
  // Tablet UX v2.3 §8-9 (PR #23 follow-up correction): LBP_LEG_AUTOFILL_FIELD도
  // 같은 이유로 non-question metadata라 자동 초기화되지 않는다 --
  // 동일하게 명시적으로 null 처리.
  [LBP_LEG_AUTOFILL_FIELD]: null,
})

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

  // Tablet UX v2.3 §8-9/§13 (PR #23 follow-up correction): navigation-layer
  // auto-skip for LBP_02/LBP_03 (when the LBP_01B_LEG_SCREEN shim auto-filled
  // them) and LBP_10 (always, once LBP_10A_ONSET_AGE has taken over). This
  // is deliberately separate from `visibleQuestions`/showIf -- those stay
  // completely unchanged so pruneStaleResponses keeps treating these
  // screens as normal, answered, visible questions (the FROZEN adapter
  // reads their stored values exactly as before). Only what actually gets
  // *rendered* to the patient changes; see shouldAutoAdvancePast in
  // coreSpec.ts for the exact skip conditions and safety writeup.
  const nextQuestion = (from: string, r: Responses): Question | undefined => {
    const list = visibleQuestions(r)
    const fromIdx = list.findIndex((q) => q.id === from)
    let idx = fromIdx >= 0 ? fromIdx + 1 : 0
    while (idx < list.length && shouldAutoAdvancePast(list[idx], r)) {
      idx += 1
    }
    return list[idx]
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
    // show_if 변경으로 더 이상 표시되지 않는 화면은 건너뛴다. Under normal
    // forward navigation, an auto-skipped question (shouldAutoAdvancePast)
    // is never pushed onto `visited` in the first place -- nextQuestion
    // already skips past it -- so this extra check is a defensive mirror
    // of that same navigation-layer skip, not the primary mechanism.
    const stack = [...visited]
    while (stack.length > 0) {
      const prev = stack.pop() as string
      const prevQuestion = visible.find((q) => q.id === prev)
      if (prevQuestion && !shouldAutoAdvancePast(prevQuestion, responses)) {
        setVisited(stack)
        setCurrentId(prev)
        return
      }
    }
    setVisited([])
  }

  const setAnswer = (q: Question, value: AnswerValue) => {
    let patch: Responses = { ...responses, [q.id]: value }

    // Tablet UX v2.3 §8-9 (PR #23 follow-up correction): LBP leg-symptom
    // compact-confirm presentation shim. LBP_02/LBP_03 stay unconditionally
    // visible (showIf unchanged) so pruneStaleResponses never nulls this
    // write -- see the LBP_01B_LEG_SCREEN question definition in
    // coreSpec.ts for the full safety writeup. "없어요" pre-fills the
    // exact FROZEN-required NONE/NONE pair AND sets LBP_LEG_AUTOFILL_FIELD
    // so nextQuestion/goBack (below) skip rendering LBP_02/LBP_03 to the
    // patient entirely; "있어요"/"잘 모르겠어요" clears both the pre-fill
    // and the provenance flag so the patient answers LBP_02/LBP_03 fresh
    // (and sees both screens normally).
    if (q.id === 'LBP_01B_LEG_SCREEN') {
      patch =
        value === 'no'
          ? { ...patch, LBP_02: ['NONE'], LBP_03: 'NONE', [LBP_LEG_AUTOFILL_FIELD]: 'yes' }
          : { ...patch, LBP_02: null, LBP_03: null, [LBP_LEG_AUTOFILL_FIELD]: null }
    }
    // Changing LBP_01 away from 'BACK_ONLY' after the leg-symptom shim
    // auto-filled LBP_02/LBP_03 (shim answered 'no') leaves those two
    // fields stale -- LBP_02/LBP_03's own showIf never depends on LBP_01,
    // so pruneStaleResponses can't catch this on its own. Only clears the
    // shim's own auto-fill (checked against the OLD, pre-patch state) --
    // genuinely patient-answered LBP_02/LBP_03 (shim was 'yes'/'unknown',
    // or a non-BACK_ONLY route) are never touched here. Also clears the
    // provenance flag, since there's nothing left to auto-skip.
    if (q.id === 'LBP_01' && responses['LBP_01'] === 'BACK_ONLY' && responses['LBP_01B_LEG_SCREEN'] === 'no' && value !== 'BACK_ONLY') {
      patch = { ...patch, LBP_02: null, LBP_03: null, [LBP_LEG_AUTOFILL_FIELD]: null }
    }
    // Provenance guard: if LBP_02/LBP_03 are ever answered directly (only
    // reachable if the shim's auto-fill was never active in the first
    // place, since an active auto-fill means these screens are skipped in
    // navigation -- see shouldAutoAdvancePast), clear the provenance flag
    // so a genuine patient answer is never later mistaken for the shim's
    // own auto-fill and silently skipped.
    if (q.id === 'LBP_02' || q.id === 'LBP_03') {
      patch = { ...patch, [LBP_LEG_AUTOFILL_FIELD]: null }
    }

    // Tablet UX v2.3 §13: LBP onset-age -> existing LBP_10 YES/NO/UNKNOWN
    // compatibility mapping (see mapLbpOnsetAgeToBefore45's own comment in
    // coreSpec.ts for the FROZEN-threshold safety reasoning). LBP_10 stays
    // unconditionally visible alongside LBP_10A (same showIf), so this
    // pre-fill also survives pruneStaleResponses.
    if (q.id === 'LBP_10A_ONSET_AGE') {
      patch = { ...patch, LBP_10: mapLbpOnsetAgeToBefore45(value), [LBP_RAW_AGE_FIELD]: value }
    }

    // 상위 선택이 바뀌면 더 이상 표시되지 않는 화면의 응답을 즉시 정리한다.
    const { responses: pruned, removed } = pruneStaleResponses(patch)

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

  /**
   * Tablet UX v2.2 §20-23: 통증 Fast Track 진료 도중 한약 추가문진으로
   * 전환한다 -- 처음부터 다시 묻지 않고, 이미 답한 응답은 그대로 둔 채
   * HERBAL_ADDON_FIELD만 켠다. 이 필드는 ALL_QUESTIONS에 속하지 않는
   * non-question 내부 플래그라 pruneStaleResponses가 절대 지우지 않는다
   * (coreSpec.ts questionnaireMode 주석 참고). 이후 다시 계산되는
   * visibleQuestions가 HERB_* / CONST_* systemic block을 새로 노출시키고,
   * reorderForDetailPhases가 그 블록을 "아직 답하지 않은 첫 지점" 바로
   * 앞으로 재배치하므로 기존 forward-only walk(nextQuestion)로도 반드시
   * 도달한다.
   */
  const activateHerbalAddon = () => {
    const { responses: pruned } = pruneStaleResponses({
      ...responses,
      [HERBAL_ADDON_FIELD]: 'yes',
    })
    setResponses(pruned)
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
  // Tablet UX v2.3 §11-12: Body Map 화면에서 landscape 우측 rail에 "지금
  // 뭘 선택했는지"를 항상 보여준다(스크롤과 무관). ScreenShell 자체는
  // BodyMap 내부를 모르므로, 여기서 미리 계산해 짧은 텍스트만 넘긴다.
  const railSelection =
    current.layout === 'body_map' && typeof value === 'string' ? (
      <>
        선택한 부위: <strong>{getBodyMapZoneLabel(value)}</strong>
      </>
    ) : null

  return (
    <>
      <ScreenShell
        steps={STEPS}
        currentStep={stepInfo.step}
        stepProgress={stepInfo.progress}
        questionId={current.id}
        // Tablet UX v2.2 §10: safety/protected/긴 문장 질문(layout 미지정,
        // 기본값 'list')은 wide landscape에서도 좁은 --content-max를
        // 유지하고, 짧은 카테고리 선택 화면(grid2/compact3/body_map)만
        // 더 넓게 쓴다.
        wideContent={current.layout != null && current.layout !== 'list'}
        railSelection={railSelection}
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
      {questionnaireMode(responses) === 'pain_fast' && primaryConcernKey(responses) === 'pain' && (
        <StaffHerbalAddonHold onActivate={activateHerbalAddon} />
      )}
    </>
  )
}
