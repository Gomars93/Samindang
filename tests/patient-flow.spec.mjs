// Patient completion/waiting screen suite.
// Run via `npm run test:patient` (bundles src/screens/PatientCompleteScreen.tsx
// with esbuild first, same style as the other suites -- React itself is kept
// external so the component uses the same React instance as this test file,
// avoiding the "invalid hook call" duplicate-copy failure).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import React from 'react'
import { renderToString } from 'react-dom/server'
import { PatientCompleteScreen } from './.patient-complete-bundle.cjs'

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

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
