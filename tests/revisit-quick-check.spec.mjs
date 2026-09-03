// Revisit Quick Check (LBP v1 Batch 3, docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md
// §9) regression tests. Pure logic bundled with esbuild --platform=neutral;
// the card is bundled to cjs and rendered with react-dom/server (no test
// framework, same convention as tests/workspace-round3.spec.mjs /
// tests/doctor-workspace.spec.mjs).
//
// Run via `npm run test:revisit-quick-check`.

import React from 'react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  emptyRevisitQuickCheck,
  isValidQuickCheckChange,
  isValidQuickCheckYesNo,
  isValidQuickCheckExerciseAdherence,
  sanitizeRevisitQuickCheck,
  deriveRevisitQuickCheckGuidance,
  REVISIT_QUICK_CHECK_SAFETY_LINE,
  computeDetailCheckDue,
  summarizeRevisitQuickCheckKo,
  QUICK_CHECK_CHANGE_OPTIONS,
  QUICK_CHECK_CHANGE_LABEL,
  QUICK_CHECK_YES_NO_OPTIONS,
  QUICK_CHECK_YES_NO_LABEL,
  QUICK_CHECK_EXERCISE_ADHERENCE_OPTIONS,
  QUICK_CHECK_EXERCISE_ADHERENCE_LABEL,
  REVISIT_QUICK_CHECK_GROUP_TITLE,
} from './.revisit-quick-check-bundle.mjs'
import { RevisitQuickCheckCard } from './.revisit-quick-check-card-bundle.cjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

/* ------------------------------------------------------------------------
 * emptyRevisitQuickCheck / isValid* guards
 * ---------------------------------------------------------------------- */
{
  const empty = emptyRevisitQuickCheck()
  assert(
    'emptyRevisitQuickCheck: all 5 chip fields start NOT_ASSESSED',
    empty.targetFunctionChange === 'NOT_ASSESSED' &&
      empty.overallResponse === 'NOT_ASSESSED' &&
      empty.newNeuroOrRedFlag === 'NOT_ASSESSED' &&
      empty.exerciseAdherence === 'NOT_ASSESSED' &&
      empty.adverseEffect === 'NOT_ASSESSED',
  )
  assert('emptyRevisitQuickCheck: note starts as empty string', empty.note === '')
  assert('emptyRevisitQuickCheck: recordedAt starts null', empty.recordedAt === null)

  assert('isValidQuickCheckChange accepts every real value', ['NOT_ASSESSED', 'BETTER', 'SAME', 'WORSE'].every(isValidQuickCheckChange))
  assert('isValidQuickCheckChange rejects an unknown string', !isValidQuickCheckChange('IMPROVED'))
  assert('isValidQuickCheckChange rejects non-string values', !isValidQuickCheckChange(1) && !isValidQuickCheckChange(null) && !isValidQuickCheckChange(undefined))

  assert('isValidQuickCheckYesNo accepts every real value', ['NOT_ASSESSED', 'NO', 'YES'].every(isValidQuickCheckYesNo))
  assert('isValidQuickCheckYesNo rejects an unknown string', !isValidQuickCheckYesNo('MAYBE'))
  assert('isValidQuickCheckYesNo rejects non-string values', !isValidQuickCheckYesNo(true) && !isValidQuickCheckYesNo({}))

  assert(
    'isValidQuickCheckExerciseAdherence accepts every real value',
    ['NOT_ASSESSED', 'NOT_PRESCRIBED', 'NOT_DONE', 'PARTIAL', 'DONE_AS_PLANNED', 'DONE_TOO_HARD', 'DONE_TOO_EASY'].every(
      isValidQuickCheckExerciseAdherence,
    ),
  )
  assert('isValidQuickCheckExerciseAdherence rejects an unknown string', !isValidQuickCheckExerciseAdherence('SKIPPED'))
  assert('isValidQuickCheckExerciseAdherence rejects non-string values', !isValidQuickCheckExerciseAdherence(5))
}

/* ------------------------------------------------------------------------
 * sanitizeRevisitQuickCheck
 * ---------------------------------------------------------------------- */
{
  assert(
    'sanitizeRevisitQuickCheck(undefined): legacy record with no field at all degrades to empty',
    JSON.stringify(sanitizeRevisitQuickCheck(undefined)) === JSON.stringify(emptyRevisitQuickCheck()),
  )
  assert(
    'sanitizeRevisitQuickCheck("not-an-object"): never throws, degrades to empty',
    JSON.stringify(sanitizeRevisitQuickCheck('not-an-object')) === JSON.stringify(emptyRevisitQuickCheck()),
  )

  const corrupted = sanitizeRevisitQuickCheck({
    targetFunctionChange: 'IMPROVED', // unknown enum value
    overallResponse: 'SAME', // valid
    newNeuroOrRedFlag: 7, // wrong type
    exerciseAdherence: 'DONE_AS_PLANNED', // valid
    adverseEffect: 'YES', // valid
    note: 42, // wrong type
    recordedAt: '2026-01-01T00:00:00.000Z', // valid
  })
  assert('sanitizeRevisitQuickCheck: unknown enum value degrades to NOT_ASSESSED (never a normal/negative value)', corrupted.targetFunctionChange === 'NOT_ASSESSED')
  assert('sanitizeRevisitQuickCheck: a well-formed enum value survives untouched', corrupted.overallResponse === 'SAME')
  assert('sanitizeRevisitQuickCheck: wrong-typed enum degrades to NOT_ASSESSED', corrupted.newNeuroOrRedFlag === 'NOT_ASSESSED')
  assert('sanitizeRevisitQuickCheck: sibling well-formed fields are untouched by a corrupt neighbor', corrupted.exerciseAdherence === 'DONE_AS_PLANNED' && corrupted.adverseEffect === 'YES')
  assert('sanitizeRevisitQuickCheck: wrong-typed note degrades to empty string', corrupted.note === '')
  assert('sanitizeRevisitQuickCheck: well-formed recordedAt survives', corrupted.recordedAt === '2026-01-01T00:00:00.000Z')
}

/* ------------------------------------------------------------------------
 * deriveRevisitQuickCheckGuidance -- rules 1-8, §9.2(b)
 * ---------------------------------------------------------------------- */
{
  const base = emptyRevisitQuickCheck()

  // Rule 1 + mutation-resistance (ii): neuro YES ALONE (everything else
  // NOT_ASSESSED) still raises the safety flag.
  const rule1 = deriveRevisitQuickCheckGuidance({ ...base, newNeuroOrRedFlag: 'YES' })
  assert('rule 1: newNeuroOrRedFlag=YES sets safetyRefreshSuggested', rule1.safetyRefreshSuggested === true)
  assert('rule 1: the exact safety sentence is present', rule1.lines.includes(REVISIT_QUICK_CHECK_SAFETY_LINE))
  assert('mutation-resistance (ii): neuro YES alone (others unanswered) still produces the safety line and NOTHING else', rule1.lines.length === 1)

  // Rule 2.
  const rule2 = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'BETTER', overallResponse: 'BETTER', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'YES' })
  assert('rule 2: adverseEffect=YES produces "치료 후 이상반응 기록됨" line', rule2.lines.includes('치료 후 이상반응 기록됨: 처치 계획 재검토.'))
  assert('rule 2: no other rule fires alongside it in this scenario', rule2.lines.length === 1)
  assert('rule 2: does not itself raise the safety flag', rule2.safetyRefreshSuggested === false)

  // Rule 3 (both the target-function and overall-response branches).
  const rule3a = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'WORSE', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'NO' })
  assert('rule 3a: targetFunctionChange=WORSE produces "악화: 계획 재검토."', rule3a.lines.includes('악화: 계획 재검토.'))
  const rule3b = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'WORSE', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'NO' })
  assert('rule 3b: overallResponse=WORSE alone also produces "악화: 계획 재검토."', rule3b.lines.includes('악화: 계획 재검토.'))

  // Rule 4: requires ALL THREE of exerciseAdherence=DONE_AS_PLANNED,
  // targetFunctionChange=SAME, overallResponse=SAME.
  const rule4 = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'NO' })
  assert('rule 4: 계획대로 시행 + SAME/SAME produces the plateau line', rule4.lines.includes('계획대로 시행했는데 변화 없음: 운동·처치 계획 재검토 고려.'))
  assert('rule 4: no other rule fires alongside it in this scenario', rule4.lines.length === 1)
  // Counterexample proving the AND is real, not vacuous: dropping just
  // overallResponse to BETTER must remove the plateau line.
  const rule4Counter = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'BETTER', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'NO' })
  assert('rule 4 counterexample: overallResponse=BETTER (not SAME) removes the plateau line', !rule4Counter.lines.includes('계획대로 시행했는데 변화 없음: 운동·처치 계획 재검토 고려.'))

  // Rule 5 (both branches).
  const rule5hard = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_TOO_HARD', adverseEffect: 'NO' })
  assert('rule 5 (too hard): produces "운동이 어려움" line', rule5hard.lines.includes('운동이 어려움: 쉬운 단계 또는 다른 운동 고려.'))
  assert('rule 5 (too hard): does not also fire rule 4 (DONE_AS_PLANNED-only)', !rule5hard.lines.includes('계획대로 시행했는데 변화 없음: 운동·처치 계획 재검토 고려.'))
  const rule5easy = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_TOO_EASY', adverseEffect: 'NO' })
  assert('rule 5 (too easy): produces "운동이 쉬움" line', rule5easy.lines.includes('운동이 쉬움: 진행 단계 고려(원장 판단).'))

  // Rule 6 (both branches).
  const rule6notDone = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'NOT_DONE', adverseEffect: 'NO' })
  assert('rule 6 (not done): produces "운동 시행 부족" line', rule6notDone.lines.includes('운동 시행 부족: 장애 요인 확인.'))
  const rule6partial = deriveRevisitQuickCheckGuidance({ ...base, targetFunctionChange: 'SAME', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'PARTIAL', adverseEffect: 'NO' })
  assert('rule 6 (partial): produces "운동 시행 부족" line', rule6partial.lines.includes('운동 시행 부족: 장애 요인 확인.'))

  // Rule 7 + mutation-resistance (iii): all 5 assessed and both safety
  // items negative, nothing else fired -> exactly the maintain line.
  const rule7 = deriveRevisitQuickCheckGuidance({ targetFunctionChange: 'BETTER', overallResponse: 'BETTER', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'NO', note: '', recordedAt: null })
  assert('mutation-resistance (iii): 5 items all favorable/NO -> exactly ONE line, "유지·진행 가능(원장 판단)."', rule7.lines.length === 1 && rule7.lines[0] === '유지·진행 가능(원장 판단).')
  assert('rule 7: does not raise the safety flag', rule7.safetyRefreshSuggested === false)

  // Rule 8 (dedicated scenario, distinct from mutation (i) below): one of
  // the 5 not yet assessed (exerciseAdherence), rest favorable/NO -> no
  // line at all, not even a partial "유지" claim.
  const rule8 = deriveRevisitQuickCheckGuidance({ targetFunctionChange: 'SAME', overallResponse: 'SAME', newNeuroOrRedFlag: 'NO', exerciseAdherence: 'NOT_ASSESSED', adverseEffect: 'NO', note: '', recordedAt: null })
  assert('rule 8: one item still NOT_ASSESSED and nothing else matched -> zero lines', rule8.lines.length === 0)

  // Mutation-resistance (i): neuro NOT_ASSESSED, the other 4 favorable/NO
  // -> "유지·진행" must NOT appear, and safety must be false. Proven
  // non-vacuous by the counterexample (rule7 above, same values except
  // neuro=NO) which DOES produce the line.
  const mutationI = deriveRevisitQuickCheckGuidance({ targetFunctionChange: 'BETTER', overallResponse: 'BETTER', newNeuroOrRedFlag: 'NOT_ASSESSED', exerciseAdherence: 'DONE_AS_PLANNED', adverseEffect: 'NO', note: '', recordedAt: null })
  assert('mutation-resistance (i): neuro NOT_ASSESSED blocks "유지·진행" even though the other 4 are favorable', !mutationI.lines.some((l) => l.includes('유지·진행')))
  assert('mutation-resistance (i): counterexample -- the identical scenario with neuro=NO (rule 7 above) DOES produce "유지·진행" (proves this assertion is not vacuous)', rule7.lines.some((l) => l.includes('유지·진행')))
  assert('mutation-resistance (i): safetyRefreshSuggested stays false when neuro is merely unanswered (NOT_ASSESSED != NO)', mutationI.safetyRefreshSuggested === false)
}

/* ------------------------------------------------------------------------
 * computeDetailCheckDue -- §9.2(c)
 * ---------------------------------------------------------------------- */
{
  const visit = (createdAt, plan) => ({ createdAt, nextReassessmentPlan: plan })
  const unsetPlan = { status: 'UNSET', targetDate: '', afterVisitCount: null, note: '' }

  // DATE: due exactly on the day, not the day before, and never guessed
  // when the format is wrong.
  const dateDuePlan = { status: 'DATE', targetDate: '2026-09-03', afterVisitCount: null, note: '' }
  const dueToday = computeDetailCheckDue([visit('2026-08-01T00:00:00.000Z', dateDuePlan)], '2026-09-03')
  assert('computeDetailCheckDue (DATE): due exactly on the target date', dueToday !== null && dueToday.reason === 'DATE' && dueToday.planLabel === '날짜 지정 2026-09-03')
  assert('computeDetailCheckDue (DATE): sourceVisitCreatedAt names the visit that set the plan', dueToday.sourceVisitCreatedAt === '2026-08-01T00:00:00.000Z')

  const notYetDue = computeDetailCheckDue([visit('2026-08-01T00:00:00.000Z', dateDuePlan)], '2026-09-02')
  assert('computeDetailCheckDue (DATE): the day before the target date is NOT due', notYetDue === null)

  const badFormat = computeDetailCheckDue(
    [visit('2026-08-01T00:00:00.000Z', { status: 'DATE', targetDate: '2026/09/03', afterVisitCount: null, note: '' })],
    '2026-09-03',
  )
  assert('computeDetailCheckDue (DATE): a non-yyyy-mm-dd targetDate returns null (never guessed)', badFormat === null)

  // VISIT_COUNT: due when k+1 >= n, not before, never guessed for
  // 0/negative/non-integer n.
  const countDuePlan = { status: 'VISIT_COUNT', targetDate: '', afterVisitCount: 1, note: '' }
  const countDue = computeDetailCheckDue([visit('2026-08-01T00:00:00.000Z', countDuePlan)], '2026-09-03')
  assert('computeDetailCheckDue (VISIT_COUNT): k+1 >= n is due', countDue !== null && countDue.reason === 'VISIT_COUNT' && countDue.planLabel === '방문 1회 후')

  const countNotDuePlan = { status: 'VISIT_COUNT', targetDate: '', afterVisitCount: 2, note: '' }
  const countNotDue = computeDetailCheckDue([visit('2026-08-01T00:00:00.000Z', countNotDuePlan)], '2026-09-03')
  assert('computeDetailCheckDue (VISIT_COUNT): k+1 < n is NOT due', countNotDue === null)

  for (const bad of [0, -1, 1.5]) {
    const r = computeDetailCheckDue([visit('2026-08-01T00:00:00.000Z', { status: 'VISIT_COUNT', targetDate: '', afterVisitCount: bad, note: '' })], '2026-09-03')
    assert(`computeDetailCheckDue (VISIT_COUNT): afterVisitCount=${bad} returns null (never guessed)`, r === null)
  }

  // "직전 UNSET + 그 이전 DATE -> 그 이전 plan 사용" (9.1's plan-loss fix).
  const skipUnset = computeDetailCheckDue(
    [visit('2026-08-20T00:00:00.000Z', unsetPlan), visit('2026-07-01T00:00:00.000Z', dateDuePlan)],
    '2026-09-03',
  )
  assert('computeDetailCheckDue: an UNSET immediately-prior plan is skipped in favor of the older real plan', skipUnset !== null && skipUnset.reason === 'DATE')
  assert('computeDetailCheckDue: the reported source visit is the OLDER one that actually set the plan, not the UNSET one', skipUnset.sourceVisitCreatedAt === '2026-07-01T00:00:00.000Z')

  // CLINICIAN_DECIDES is never due.
  const clinicianDecides = computeDetailCheckDue(
    [visit('2026-08-01T00:00:00.000Z', { status: 'CLINICIAN_DECIDES', targetDate: '', afterVisitCount: null, note: '추후 결정' })],
    '2026-09-03',
  )
  assert('computeDetailCheckDue (CLINICIAN_DECIDES): never due', clinicianDecides === null)

  // Robustness: never throws, degrades to null.
  const malformedInputs = [undefined, null, 'not-an-array', 42, [null], [undefined], [42], ['x']]
  for (const bad of malformedInputs) {
    let threw = false
    let result
    try {
      result = computeDetailCheckDue(bad, '2026-09-03')
    } catch {
      threw = true
    }
    assert(`computeDetailCheckDue: malformed priorVisits input (${JSON.stringify(bad)}) never throws`, !threw)
    assert(`computeDetailCheckDue: malformed priorVisits input (${JSON.stringify(bad)}) returns null`, result === null)
  }

  // A visit whose nextReassessmentPlan is genuinely absent (null -- the
  // server's own default for "no plan set on this visit") IS skipped, same
  // as UNSET: it carries no information, so the scan keeps looking further
  // back.
  const nullPlan = computeDetailCheckDue(
    [visit('2026-08-20T00:00:00.000Z', null), visit('2026-07-01T00:00:00.000Z', dateDuePlan)],
    '2026-09-03',
  )
  assert('computeDetailCheckDue: a null nextReassessmentPlan is skipped in favor of the older real plan', nullPlan !== null && nullPlan.reason === 'DATE')

  // A visit whose nextReassessmentPlan is present but NOT an object (e.g. a
  // stray string) is a different kind of corruption from "absent" -- it
  // halts the scan and returns null immediately, the same fail-safe as an
  // unreadable plan.status, rather than falling through to an older
  // (possibly superseded) plan.
  const corruptPlanContainer = computeDetailCheckDue(
    [visit('2026-08-20T00:00:00.000Z', 'not-an-object'), visit('2026-07-01T00:00:00.000Z', dateDuePlan)],
    '2026-09-03',
  )
  assert('computeDetailCheckDue: a non-object (but non-null) nextReassessmentPlan halts the scan (returns null) rather than guessing at an older plan', corruptPlanContainer === null)

  // A visit whose plan.status itself is wrong-typed (present but corrupted)
  // stops the scan right there (never falls through to an older, cleaner
  // plan) -- this is a deliberate "unknown, don't guess" choice, verified
  // by comparing against the otherwise-identical UNSET-skip case above,
  // which DOES fall through.
  const corruptStatus = computeDetailCheckDue(
    [visit('2026-08-20T00:00:00.000Z', { status: 7, targetDate: '', afterVisitCount: null, note: '' }), visit('2026-07-01T00:00:00.000Z', dateDuePlan)],
    '2026-09-03',
  )
  assert('computeDetailCheckDue: a wrong-typed plan.status halts the scan (returns null) rather than guessing at an older plan', corruptStatus === null)
}

/* ------------------------------------------------------------------------
 * summarizeRevisitQuickCheckKo -- §9.2(e)
 * ---------------------------------------------------------------------- */
{
  assert('summarizeRevisitQuickCheckKo: all 5 NOT_ASSESSED returns null', summarizeRevisitQuickCheckKo(emptyRevisitQuickCheck()) === null)

  // Exactly the brief's own illustrative example (§9.2(e)).
  const partial = {
    targetFunctionChange: 'BETTER',
    overallResponse: 'NOT_ASSESSED',
    newNeuroOrRedFlag: 'NOT_ASSESSED',
    exerciseAdherence: 'DONE_AS_PLANNED',
    adverseEffect: 'NO',
    note: '',
    recordedAt: '2026-09-03T00:00:00.000Z',
  }
  assert(
    'summarizeRevisitQuickCheckKo: matches the brief\'s own example line exactly, omitting NOT_ASSESSED items',
    summarizeRevisitQuickCheckKo(partial) === '이전 간단 체크: 목표 기능 좋아짐 · 운동 계획대로 · 이상반응 없음',
  )

  const full = {
    targetFunctionChange: 'WORSE',
    overallResponse: 'SAME',
    newNeuroOrRedFlag: 'YES',
    exerciseAdherence: 'NOT_DONE',
    adverseEffect: 'YES',
    note: '',
    recordedAt: '2026-09-03T00:00:00.000Z',
  }
  const fullSummary = summarizeRevisitQuickCheckKo(full)
  assert('summarizeRevisitQuickCheckKo: all 5 answered renders all 5, in group order', fullSummary === '이전 간단 체크: 목표 기능 나빠짐 · 전체 반응 비슷함 · 신경증상·위험신호 있음 · 운동 안 함 · 이상반응 있음')
}

/* ------------------------------------------------------------------------
 * RevisitQuickCheckCard rendering -- §9.2(d)/(f)
 * ---------------------------------------------------------------------- */
{
  const render = (value) => renderToString(React.createElement(RevisitQuickCheckCard, { value, onChange: () => {} }))

  const html = render(emptyRevisitQuickCheck())

  assert('RevisitQuickCheckCard: title renders', html.includes('재진 간단 체크(30~60초)'))
  assert(
    'RevisitQuickCheckCard: hint states the patient tablet response is never auto-copied',
    html.includes('환자 태블릿 응답(위)은 자동으로 옮겨오지 않습니다'),
  )

  for (const title of Object.values(REVISIT_QUICK_CHECK_GROUP_TITLE)) {
    assert(`RevisitQuickCheckCard: group title "${title}" renders`, html.includes(title))
  }

  for (const v of QUICK_CHECK_CHANGE_OPTIONS) {
    const label = QUICK_CHECK_CHANGE_LABEL[v]
    assert(`RevisitQuickCheckCard: chip "${label}" renders as a button`, new RegExp(`<button[^>]*>${label}</button>`).test(html))
  }
  for (const v of QUICK_CHECK_YES_NO_OPTIONS) {
    const label = QUICK_CHECK_YES_NO_LABEL[v]
    assert(`RevisitQuickCheckCard: chip "${label}" renders as a button`, new RegExp(`<button[^>]*>${label}</button>`).test(html))
  }
  for (const v of QUICK_CHECK_EXERCISE_ADHERENCE_OPTIONS) {
    const label = QUICK_CHECK_EXERCISE_ADHERENCE_LABEL[v]
    assert(`RevisitQuickCheckCard: chip "${label}" renders as a button`, new RegExp(`<button[^>]*>${label}</button>`).test(html))
  }

  // Default (all NOT_ASSESSED): zero pressed chips.
  const pressedTrueCount = (html.match(/aria-pressed="true"/g) ?? []).length
  assert('RevisitQuickCheckCard: default value renders zero pressed chips', pressedTrueCount === 0)
  // Non-vacuous counterexample: setting exactly one field DOES produce exactly one pressed chip.
  const htmlOneSet = render({ ...emptyRevisitQuickCheck(), adverseEffect: 'NO' })
  const pressedCountOneSet = (htmlOneSet.match(/aria-pressed="true"/g) ?? []).length
  assert(
    'RevisitQuickCheckCard: counterexample -- setting exactly one field produces exactly one pressed chip (proves the zero-count assertion above is not vacuous)',
    pressedCountOneSet === 1,
  )
  assert(
    'RevisitQuickCheckCard: the pressed chip is specifically the one that was set ("없음")',
    /aria-pressed="true"[^>]*>없음<\/button>/.test(htmlOneSet),
  )

  // Setting a second, different-group field pressed exactly that chip too, and nothing else.
  const htmlTwoSet = render({ ...emptyRevisitQuickCheck(), overallResponse: 'WORSE', adverseEffect: 'NO' })
  const pressedCountTwoSet = (htmlTwoSet.match(/aria-pressed="true"/g) ?? []).length
  assert('RevisitQuickCheckCard: setting two independent fields presses exactly two chips', pressedCountTwoSet === 2)
  assert('RevisitQuickCheckCard: one of the two pressed chips is "나빠짐"', /aria-pressed="true"[^>]*>나빠짐<\/button>/.test(htmlTwoSet))

  // Safety notice: present only when newNeuroOrRedFlag === 'YES', with the
  // role/class the spec requires -- indexOf/slice, both directions.
  const htmlNeuroYes = render({ ...emptyRevisitQuickCheck(), newNeuroOrRedFlag: 'YES' })
  const safetyIdx = htmlNeuroYes.indexOf(REVISIT_QUICK_CHECK_SAFETY_LINE)
  assert('RevisitQuickCheckCard: safety sentence renders when neuro=YES', safetyIdx !== -1)
  const safetyTagStart = htmlNeuroYes.lastIndexOf('<p', safetyIdx)
  const safetyTag = htmlNeuroYes.slice(safetyTagStart, htmlNeuroYes.indexOf('>', safetyTagStart) + 1)
  assert('RevisitQuickCheckCard: the safety sentence <p> carries workspace__revisit__safetyNotice', safetyTag.includes('workspace__revisit__safetyNotice'))
  assert('RevisitQuickCheckCard: the safety sentence <p> carries role="status" (not role="alert")', safetyTag.includes('role="status"'))
  assert('RevisitQuickCheckCard: the safety sentence <p> never carries role="alert"', !safetyTag.includes('role="alert"'))

  const htmlNeuroNo = render({ ...emptyRevisitQuickCheck(), newNeuroOrRedFlag: 'NO' })
  assert(
    'RevisitQuickCheckCard: safety sentence absent when neuro=NO (the neuro=YES case just above proves this assertion is not vacuous)',
    htmlNeuroNo.indexOf(REVISIT_QUICK_CHECK_SAFETY_LINE) === -1,
  )

  const htmlNeuroNotAssessed = render(emptyRevisitQuickCheck())
  assert('RevisitQuickCheckCard: safety sentence absent when neuro is NOT_ASSESSED (unanswered != negative)', htmlNeuroNotAssessed.indexOf(REVISIT_QUICK_CHECK_SAFETY_LINE) === -1)
}

/* ------------------------------------------------------------------------
 * Structural guard: the patient's own MicroFollowUpResponse must never be
 * reachable from this module or this card (§9.3 "출처 분리 원칙").
 * ---------------------------------------------------------------------- */
{
  // Checks actual import statements only -- both files' own doc comments
  // legitimately NAME MicroFollowUpResponse in prose (explaining exactly
  // why it must stay unreachable here), so a bare text search over the
  // whole file would be a false positive against that prose. An `import
  // ... from './microFollowUp'` line is the one thing that would actually
  // make the patient's response reachable, so that is what this checks.
  const logicSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/revisitQuickCheck.ts', import.meta.url)), 'utf8')
  assert('revisitQuickCheck.ts has no import statement naming microFollowUp.ts', !/from ['"]\.\/microFollowUp['"]/.test(logicSrc))

  const cardSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/RevisitQuickCheckCard.tsx', import.meta.url)), 'utf8')
  assert('RevisitQuickCheckCard.tsx has no import statement naming microFollowUp.ts', !/from ['"]\.\/microFollowUp['"]/.test(cardSrc))
}

console.log(`\n${passCount} revisit quick check assertions passed.`)
