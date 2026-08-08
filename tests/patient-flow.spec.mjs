// Patient completion/waiting screen suite.
// Run via `npm run test:patient` (bundles src/screens/PatientCompleteScreen.tsx
// with esbuild first, same style as the other suites -- React itself is kept
// external so the component uses the same React instance as this test file,
// avoiding the "invalid hook call" duplicate-copy failure).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import React from 'react'
import { renderToString } from 'react-dom/server'
import { PatientCompleteScreen } from './.patient-complete-bundle.cjs'
import { IdleWarningModal } from './.idle-warning-bundle.cjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

function render(props) {
  return renderToString(
    React.createElement(PatientCompleteScreen, {
      payload: { session_id: 'sess-test' },
      devMode: false,
      onStaffReset: () => {},
      onRetry: () => {},
      ...props,
    }),
  )
}

const STEP_LABELS = ['접수 완료', '상세문진 완료', '체질분석 준비 중', '원장님 진료']

/* ---------------------------------------------------------------------
 * 1. All four operational-status step labels render.
 * ------------------------------------------------------------------- */

{
  const html = render({ submitState: 'success', submitId: 'abc123' })
  for (const label of STEP_LABELS) {
    assert(`success screen shows step label "${label}"`, html.includes(label))
  }
}

/* ---------------------------------------------------------------------
 * 2. No precise-minute promise, ever, in the success state.
 * ------------------------------------------------------------------- */

{
  const html = render({ submitState: 'success', submitId: 'abc123' })
  assert(
    'success screen makes no digit-based minute promise (e.g. "5분 후")',
    !/\d+\s*분\s*(후|뒤)/.test(html),
  )
}

/* ---------------------------------------------------------------------
 * 3. Error state: no false transmission-success claim, staff-help
 *    instruction present, retry control present, status flow does not
 *    show "체질분석 준비 중" as reached.
 * ------------------------------------------------------------------- */

{
  const html = render({ submitState: 'error', errorReason: '서버에 연결할 수 없습니다.' })
  assert('error screen does not claim "전송 완료"', !html.includes('전송 완료'))
  assert('error screen tells the patient to show staff the tablet', html.includes('직원'))
  assert('error screen has a retry control ("다시 시도")', html.includes('다시 시도'))
  assert(
    'error screen keeps the patient\'s answers (reason shown, not lost)',
    html.includes('서버에 연결할 수 없습니다.'),
  )

  const items = [...html.matchAll(/<li[^>]*>[\s\S]*?<\/li>/g)]
  assert('error screen has no step marked "active"', !items.some((m) => m[0].includes('data-status="active"')))

  const step3 = items.find((m) => m[0].includes('체질분석 준비 중'))
  assert('error screen "체질분석 준비 중" step exists', step3 !== undefined)
  assert(
    'error screen "체질분석 준비 중" step is not reached (done/active)',
    step3 !== undefined &&
      !step3[0].includes('data-status="done"') &&
      !step3[0].includes('data-status="active"'),
  )
}

/* ---------------------------------------------------------------------
 * 4. Success screen has no re-submit / restart control reachable by a
 *    patient (devMode off, as it is in a production build).
 * ------------------------------------------------------------------- */

{
  const html = render({ submitState: 'success', submitId: 'abc123', devMode: false })
  for (const banned of ['다시 제출', '처음 화면', '문진 시작']) {
    assert(`success screen (patient/prod) has no "${banned}" control`, !html.includes(banned))
  }
}

/* ---------------------------------------------------------------------
 * 5. devMode=false (production-equivalent): raw JSON payload never
 *    reaches the DOM, from any submission state.
 * ------------------------------------------------------------------- */

{
  for (const submitState of ['success', 'error', 'unconfigured']) {
    const html = render({
      submitState,
      submitId: 'abc123',
      errorReason: '서버에 연결할 수 없습니다.',
      payload: { secret_marker: 'PATIENT_PAYLOAD_MARKER' },
      devMode: false,
    })
    assert(
      `${submitState} screen (devMode=false) never renders the raw JSON payload`,
      !html.includes('PATIENT_PAYLOAD_MARKER') && !html.includes('개발자 보기'),
    )
  }
}

/* ---------------------------------------------------------------------
 * 6. unconfigured (dev/standalone) state is honest: shows the completed
 *    status flow but never claims a transmission happened.
 * ------------------------------------------------------------------- */

{
  const html = render({ submitState: 'unconfigured' })
  assert('unconfigured screen shows step labels', STEP_LABELS.every((l) => html.includes(l)))
  assert('unconfigured screen never claims "전송 완료"', !html.includes('전송 완료'))
}

/* ---------------------------------------------------------------------
 * 7. submitting state: simple status only, not the completed flow.
 * ------------------------------------------------------------------- */

{
  const html = render({ submitState: 'submitting' })
  assert('submitting screen shows a simple in-progress message', html.includes('전송 중입니다'))
  assert(
    'submitting screen does not show the completed status flow yet',
    !html.includes('체질분석 준비 중'),
  )
}

/* ---------------------------------------------------------------------
 * 8. Staff reset hold control: present on every completion state
 *    (devMode-independent), but requires a deliberate press-and-hold —
 *    it must not render any patient-visible label/text and must not be
 *    reachable via the banned single-tap restart strings.
 * ------------------------------------------------------------------- */

{
  for (const submitState of ['success', 'error', 'unconfigured']) {
    const html = render({ submitState, submitId: 'abc123', errorReason: '서버에 연결할 수 없습니다.', devMode: false })
    assert(
      `${submitState} screen (devMode=false) still has the staff reset hold control`,
      html.includes('staffResetHold'),
    )
    assert(
      `${submitState} screen staff reset control has no patient-visible on-screen text`,
      !html.includes('>초기화<') && !html.includes('>리셋<'),
    )
    for (const banned of ['다시 제출', '처음 화면', '문진 시작']) {
      assert(
        `${submitState} screen staff reset control does not surface "${banned}" text`,
        !html.includes(banned),
      )
    }
  }
}

/* ---------------------------------------------------------------------
 * 9. devMode=false success screen (real-world shaped payload): patient
 *    name, phone digits, and the raw payload marker never reach the DOM —
 *    App.tsx's post-success wipe + the devMode gate are what make this true.
 * ------------------------------------------------------------------- */

{
  const html = render({
    submitState: 'success',
    submitId: 'abc123',
    payload: {
      responses: { patient: { patient_name: '홍길동', phone_last4: '1234' } },
      secret_marker: 'PATIENT_PAYLOAD_MARKER',
    },
    devMode: false,
  })
  assert('devMode=false success screen has no patient name', !html.includes('홍길동'))
  assert('devMode=false success screen has no phone digits', !html.includes('1234'))
  assert(
    'devMode=false success screen has no raw payload marker string',
    !html.includes('PATIENT_PAYLOAD_MARKER'),
  )
}

/* ---------------------------------------------------------------------
 * 10. Completion screen never renders the '이전' (back) control — patients
 *     cannot navigate back into the filled questionnaire from here.
 * ------------------------------------------------------------------- */

{
  for (const submitState of ['success', 'error', 'unconfigured']) {
    const html = render({ submitState, submitId: 'abc123', errorReason: '서버에 연결할 수 없습니다.' })
    assert(`${submitState} screen has no "이전" back control`, !html.includes('이전'))
  }
}

/* ---------------------------------------------------------------------
 * 11. Idle-warning modal: elderly-friendly Korean copy + a 계속하기
 *     control. Tested directly with props — no real timers here, App.tsx
 *     owns the timing logic (see src/App.tsx idle-timeout effect).
 * ------------------------------------------------------------------- */

{
  const html = renderToString(React.createElement(IdleWarningModal, { onContinue: () => {} }))
  assert('idle warning modal shows "아직 계신가요?"', html.includes('아직 계신가요?'))
  assert('idle warning modal has a 계속하기 control', html.includes('계속하기'))
  assert(
    'idle warning modal 계속하기 is a real button element',
    /<button[^>]*>[\s\S]*?계속하기[\s\S]*?<\/button>/.test(html),
  )
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
