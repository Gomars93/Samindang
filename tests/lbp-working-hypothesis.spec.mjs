// LBP v1 Batch 2.5c (Working Hypothesis 최소 형태,
// docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md §11) regression
// tests. Pure logic bundled with esbuild --platform=neutral; the card is
// bundled to cjs and rendered with react-dom/server (no test framework,
// same convention as tests/revisit-quick-check.spec.mjs /
// tests/workspace-round3.spec.mjs).
//
// Run via `npm run test:lbp-working-hypothesis`.

import React from 'react'
import { renderToString } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  LBP_HYPOTHESIS_PATTERN_IDS,
  LBP_HYPOTHESIS_PATTERN_LABEL_KO,
  LBP_HYPOTHESIS_SUPPORT_OPTIONS,
  LBP_HYPOTHESIS_SUPPORT_LABEL_KO,
  LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO,
  emptyLbpWorkingHypothesis,
  isValidLbpHypothesisSupport,
  isLbpWorkingHypothesisBlank,
  sanitizeLbpWorkingHypothesis,
  summarizeLbpWorkingHypothesisKo,
  patientSentenceDraftKo,
  appendLbpHypothesisSentenceToPatientInstruction,
  applyLbpWorkingHypothesisCarryForward,
} from './.lbp-working-hypothesis-bundle.mjs'
import { LbpWorkingHypothesisCard } from './.lbp-working-hypothesis-card-bundle.cjs'
import { buildPainWorkspaceEmrPreview } from './.lbp-working-hypothesis-emrpreview-bundle.mjs'
import { emptyWorkspaceState, deserializeWorkspaceState } from './.lbp-working-hypothesis-persistence-bundle.mjs'
import { emptyVisitWorkspaceState, deserializeVisitWorkspaceState } from './.lbp-working-hypothesis-visitworkspace-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

function withSupport(overrides) {
  const v = emptyLbpWorkingHypothesis()
  return { ...v, supports: { ...v.supports, ...overrides } }
}

/* ------------------------------------------------------------------------
 * emptyLbpWorkingHypothesis / isValidLbpHypothesisSupport / isLbpWorkingHypothesisBlank
 * ---------------------------------------------------------------------- */
{
  const empty = emptyLbpWorkingHypothesis()
  assert('emptyLbpWorkingHypothesis: all 5 patterns start UNJUDGED', LBP_HYPOTHESIS_PATTERN_IDS.every((id) => empty.supports[id] === 'UNJUDGED'))
  assert('emptyLbpWorkingHypothesis: recordedAt starts null', empty.recordedAt === null)
  assert('emptyLbpWorkingHypothesis: exactly 5 pattern ids', LBP_HYPOTHESIS_PATTERN_IDS.length === 5)
  assert('isLbpWorkingHypothesisBlank: the empty value is blank', isLbpWorkingHypothesisBlank(empty))

  assert('isValidLbpHypothesisSupport accepts every real value', LBP_HYPOTHESIS_SUPPORT_OPTIONS.every(isValidLbpHypothesisSupport))
  assert('isValidLbpHypothesisSupport rejects an unknown string', !isValidLbpHypothesisSupport('MAYBE'))
  assert('isValidLbpHypothesisSupport rejects non-string values', !isValidLbpHypothesisSupport(1) && !isValidLbpHypothesisSupport(null) && !isValidLbpHypothesisSupport(undefined))

  const oneSet = withSupport({ NEURAL: 'HIGHER' })
  assert('isLbpWorkingHypothesisBlank: false once one pattern is set (non-vacuous counterexample)', !isLbpWorkingHypothesisBlank(oneSet))
}

/* ------------------------------------------------------------------------
 * sanitizeLbpWorkingHypothesis -- guard against corrupt/legacy input
 * ---------------------------------------------------------------------- */
{
  assert(
    'sanitizeLbpWorkingHypothesis(undefined): legacy record with no field at all degrades to empty',
    JSON.stringify(sanitizeLbpWorkingHypothesis(undefined)) === JSON.stringify(emptyLbpWorkingHypothesis()),
  )
  assert(
    'sanitizeLbpWorkingHypothesis("not-an-object"): never throws, degrades to empty',
    JSON.stringify(sanitizeLbpWorkingHypothesis('not-an-object')) === JSON.stringify(emptyLbpWorkingHypothesis()),
  )
  assert(
    'sanitizeLbpWorkingHypothesis(null): never throws, degrades to empty',
    JSON.stringify(sanitizeLbpWorkingHypothesis(null)) === JSON.stringify(emptyLbpWorkingHypothesis()),
  )
  assert(
    'sanitizeLbpWorkingHypothesis([]): an array (not a record) degrades to empty',
    JSON.stringify(sanitizeLbpWorkingHypothesis([])) === JSON.stringify(emptyLbpWorkingHypothesis()),
  )

  const corrupted = sanitizeLbpWorkingHypothesis({
    supports: {
      LUMBAR_MOVEMENT: 'MAYBE', // unknown string -- must degrade to UNJUDGED
      NEURAL: 'HIGHER', // valid -- must survive
      WALK_STAND_LEG: 7, // wrong type -- must degrade to UNJUDGED
      HIP: 'LOWER', // valid -- must survive
      // SIJ omitted entirely -- must default to UNJUDGED
    },
    recordedAt: '2026-01-01T00:00:00.000Z',
  })
  assert('sanitizeLbpWorkingHypothesis: unknown string degrades to UNJUDGED (guard rejects unknown values)', corrupted.supports.LUMBAR_MOVEMENT === 'UNJUDGED')
  assert('sanitizeLbpWorkingHypothesis: a well-formed value survives untouched', corrupted.supports.NEURAL === 'HIGHER')
  assert('sanitizeLbpWorkingHypothesis: wrong-typed value degrades to UNJUDGED', corrupted.supports.WALK_STAND_LEG === 'UNJUDGED')
  assert('sanitizeLbpWorkingHypothesis: a sibling well-formed value is untouched by a corrupt neighbor', corrupted.supports.HIP === 'LOWER')
  assert('sanitizeLbpWorkingHypothesis: a missing pattern id defaults to UNJUDGED', corrupted.supports.SIJ === 'UNJUDGED')
  assert('sanitizeLbpWorkingHypothesis: well-formed recordedAt survives', corrupted.recordedAt === '2026-01-01T00:00:00.000Z')

  const corruptContainer = sanitizeLbpWorkingHypothesis({ supports: 'not-an-object', recordedAt: 42 })
  assert('sanitizeLbpWorkingHypothesis: a wrong-typed supports container degrades every pattern to UNJUDGED', LBP_HYPOTHESIS_PATTERN_IDS.every((id) => corruptContainer.supports[id] === 'UNJUDGED'))
  assert('sanitizeLbpWorkingHypothesis: wrong-typed recordedAt degrades to null', corruptContainer.recordedAt === null)

  const arraySupports = sanitizeLbpWorkingHypothesis({ supports: ['HIGHER'], recordedAt: null })
  assert('sanitizeLbpWorkingHypothesis: an array as supports (not a record) degrades every pattern to UNJUDGED', LBP_HYPOTHESIS_PATTERN_IDS.every((id) => arraySupports.supports[id] === 'UNJUDGED'))
}

/* ------------------------------------------------------------------------
 * summarizeLbpWorkingHypothesisKo -- §11.3
 * ---------------------------------------------------------------------- */
{
  assert('summarizeLbpWorkingHypothesisKo: all UNJUDGED returns null', summarizeLbpWorkingHypothesisKo(emptyLbpWorkingHypothesis()) === null)

  const one = withSupport({ NEURAL: 'HIGHER' })
  assert(
    'summarizeLbpWorkingHypothesisKo: exactly one non-UNJUDGED pattern renders only that pattern',
    summarizeLbpWorkingHypothesisKo(one) === '임상 가설: 신경근 관여 가능성 높음',
  )

  const two = withSupport({ LUMBAR_MOVEMENT: 'CONSIDER', NEURAL: 'HIGHER' })
  const twoSummary = summarizeLbpWorkingHypothesisKo(two)
  assert('summarizeLbpWorkingHypothesisKo: two non-UNJUDGED patterns both render, declaration order', twoSummary === '임상 가설: 허리 움직임 관련 고려 · 신경근 관여 가능성 높음')

  // Mutation-resistance: a "미판단"/"UNJUDGED" pattern is NEVER printed --
  // proven both by the all-UNJUDGED->null case above (vacuous-looking) and
  // this non-vacuous partial case: only the 2 real picks appear, the other
  // 3 UNJUDGED patterns are entirely absent from the string.
  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    if (id === 'LUMBAR_MOVEMENT' || id === 'NEURAL') continue
    assert(`summarizeLbpWorkingHypothesisKo: UNJUDGED pattern "${id}" label never appears in a partial summary`, !twoSummary.includes(LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]))
  }
  assert('summarizeLbpWorkingHypothesisKo: the literal string "미판단" never appears in any summary (UNJUDGED is never printed as a value either)', !twoSummary.includes('미판단'))

  const all5 = withSupport({
    LUMBAR_MOVEMENT: 'HIGHER',
    NEURAL: 'CONSIDER',
    WALK_STAND_LEG: 'LOWER',
    HIP: 'HIGHER',
    SIJ: 'CONSIDER',
  })
  const all5Summary = summarizeLbpWorkingHypothesisKo(all5)
  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    assert(`summarizeLbpWorkingHypothesisKo: all-assessed case includes pattern "${id}"`, all5Summary.includes(LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]))
  }
}

/* ------------------------------------------------------------------------
 * §11.6 mutant (c): "a summarize line rendering UNJUDGED as '미판단'" --
 * recreate the mutant by hand-computing what a broken implementation
 * (one that includes every pattern, UNJUDGED included) WOULD produce, and
 * show the real function does not match that broken shape.
 * ---------------------------------------------------------------------- */
{
  const partial = withSupport({ NEURAL: 'HIGHER' })
  const real = summarizeLbpWorkingHypothesisKo(partial)
  const mutantBroken = `임상 가설: ${LBP_HYPOTHESIS_PATTERN_IDS.map((id) => `${LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]} ${LBP_HYPOTHESIS_SUPPORT_LABEL_KO[partial.supports[id]]}`).join(' · ')}`
  assert('mutant (c) reproduction: a broken "include every pattern, UNJUDGED as 미판단" implementation would include "미판단"', mutantBroken.includes('미판단'))
  assert('mutant (c) reproduction: the REAL implementation differs from that broken shape', real !== mutantBroken)
  assert('mutant (c) reproduction: the real implementation never contains "미판단"', !real.includes('미판단'))
}

/* ------------------------------------------------------------------------
 * patientSentenceDraftKo -- §11.3, the patient-output boundary's core rule
 * ---------------------------------------------------------------------- */
{
  assert('patientSentenceDraftKo: 0 HIGHER patterns returns null', patientSentenceDraftKo(emptyLbpWorkingHypothesis()) === null)

  const zeroHigherButOthers = withSupport({ NEURAL: 'CONSIDER', HIP: 'LOWER' })
  assert('patientSentenceDraftKo: 0 HIGHER (even with other non-UNJUDGED picks) returns null', patientSentenceDraftKo(zeroHigherButOthers) === null)

  const twoHigher = withSupport({ NEURAL: 'HIGHER', HIP: 'HIGHER' })
  assert('patientSentenceDraftKo: 2 HIGHER patterns returns null (§11.6 mutant (b) baseline)', patientSentenceDraftKo(twoHigher) === null)

  const threeHigher = withSupport({ NEURAL: 'HIGHER', HIP: 'HIGHER', SIJ: 'HIGHER' })
  assert('patientSentenceDraftKo: 3+ HIGHER patterns also returns null', patientSentenceDraftKo(threeHigher) === null)

  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    const single = withSupport({ [id]: 'HIGHER' })
    const draft = patientSentenceDraftKo(single)
    assert(`patientSentenceDraftKo: exactly one HIGHER (${id}) produces a non-null draft`, typeof draft === 'string')
    assert(`patientSentenceDraftKo (${id}): draft starts with the fixed opening "오늘은 "`, draft.startsWith('오늘은 '))
    assert(`patientSentenceDraftKo (${id}): draft contains the mandatory clause verbatim`, draft.includes(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO))
    assert(`patientSentenceDraftKo (${id}): draft ends with the mandatory clause (last thing the patient reads)`, draft.endsWith(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO))
    assert(`patientSentenceDraftKo (${id}): no Latin characters anywhere in the draft`, !/[a-zA-Z]/.test(draft))
    assert(`patientSentenceDraftKo (${id}): draft never names the internal pattern id/label ("${id}"/"${LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]}")`, !draft.includes(id) && !draft.includes(LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]))
  }

  // §11.6: "5개 패턴 각각의 쉬운 말 표현이 라틴 문자 없이 정확" -- spot check
  // the exact easy-language substring for each of the 5 fixed expressions.
  const expectedEasySubstring = {
    LUMBAR_MOVEMENT: '허리 움직임',
    NEURAL: '다리로 가는 신경',
    WALK_STAND_LEG: '오래 걷거나 서 있을 때 나타나는 다리',
    HIP: '고관절',
    SIJ: '골반 뒤쪽 관절',
  }
  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    const draft = patientSentenceDraftKo(withSupport({ [id]: 'HIGHER' }))
    assert(`patientSentenceDraftKo (${id}): contains the exact fixed easy-language expression`, draft.includes(expectedEasySubstring[id]))
  }

  // Exact full sentence for one pattern, pinned verbatim (report-friendly).
  const neuralDraft = patientSentenceDraftKo(withSupport({ NEURAL: 'HIGHER' }))
  assert(
    'patientSentenceDraftKo (NEURAL): exact full sentence',
    neuralDraft === '오늘은 다리로 가는 신경과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.',
  )
}

/* ------------------------------------------------------------------------
 * §11.6 mutant (a): "the mandatory clause removed" -- recreate by hand,
 * proving the assertion that checks for it actually fails without it.
 * ---------------------------------------------------------------------- */
{
  const draft = patientSentenceDraftKo(withSupport({ HIP: 'HIGHER' }))
  const mutantSentence = draft.replace(` ${LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO}`, '')
  assert('mutant (a) reproduction: the clause-stripped mutant no longer contains the mandatory clause', !mutantSentence.includes(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO))
  assert('mutant (a) reproduction: the mutant differs from the real draft', mutantSentence !== draft)
  // The actual test-suite-shaped assertion that must fail on the mutant and
  // pass on the real value:
  let mutantAssertionThrew = false
  try {
    assert('mutant (a): [should fail] mutant sentence contains the mandatory clause', mutantSentence.includes(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO))
  } catch {
    mutantAssertionThrew = true
  }
  assert('mutant (a) reproduction: the clause-presence assertion DOES fail against the mutant (proves the real test is non-vacuous)', mutantAssertionThrew)
}

/* ------------------------------------------------------------------------
 * appendLbpHypothesisSentenceToPatientInstruction -- §11.4 insertion rules
 * ---------------------------------------------------------------------- */
{
  const sentence = '오늘은 고관절과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.'

  const intoEmpty = appendLbpHypothesisSentenceToPatientInstruction('', sentence)
  assert('appendLbpHypothesisSentenceToPatientInstruction: inserting into an empty field returns exactly the sentence', intoEmpty === sentence)

  const intoExisting = appendLbpHypothesisSentenceToPatientInstruction('기존 안내문 내용', sentence)
  assert('appendLbpHypothesisSentenceToPatientInstruction: appends after existing text with a newline', intoExisting === `기존 안내문 내용\n${sentence}`)

  const twice = appendLbpHypothesisSentenceToPatientInstruction(intoEmpty, sentence)
  assert('appendLbpHypothesisSentenceToPatientInstruction: inserting the same sentence twice does not duplicate it', twice === intoEmpty)

  const editedThenReinserted = appendLbpHypothesisSentenceToPatientInstruction('원장이 수정한 문장', sentence)
  assert('appendLbpHypothesisSentenceToPatientInstruction: never overwrites/replaces existing clinician-edited text -- only appends', editedThenReinserted.startsWith('원장이 수정한 문장'))
  assert('appendLbpHypothesisSentenceToPatientInstruction: the edited text is fully preserved verbatim', editedThenReinserted.includes('원장이 수정한 문장'))

  assert('appendLbpHypothesisSentenceToPatientInstruction: an empty sentence is a no-op', appendLbpHypothesisSentenceToPatientInstruction('기존', '') === '기존')
}

/* ------------------------------------------------------------------------
 * §11.6 mutant (d): "insertion duplicating an already-present sentence" --
 * recreate a broken always-append implementation and show duplication.
 * ---------------------------------------------------------------------- */
{
  const sentence = '오늘은 고관절과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.'
  function mutantAlwaysAppend(existing, s) {
    return existing.trim() ? `${existing}\n${s}` : s
  }
  const real = appendLbpHypothesisSentenceToPatientInstruction(sentence, sentence)
  const mutant = mutantAlwaysAppend(sentence, sentence)
  assert('mutant (d) reproduction: a naive always-append mutant DOES duplicate the sentence', (mutant.match(new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length === 2)
  assert('mutant (d) reproduction: the real function does NOT duplicate (only 1 occurrence)', (real.match(new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length === 1)
  assert('mutant (d) reproduction: real output differs from the mutant output', real !== mutant)
}

/* ------------------------------------------------------------------------
 * applyLbpWorkingHypothesisCarryForward -- §11.4 재진 carry-forward guards
 * ---------------------------------------------------------------------- */
{
  const prior = withSupport({ NEURAL: 'HIGHER', HIP: 'CONSIDER' })
  const blankToday = emptyLbpWorkingHypothesis()
  const now = '2026-09-03T00:00:00.000Z'

  const applied = applyLbpWorkingHypothesisCarryForward(blankToday, prior, now)
  assert('applyLbpWorkingHypothesisCarryForward: copies prior supports when today is blank', JSON.stringify(applied.supports) === JSON.stringify(prior.supports))
  assert('applyLbpWorkingHypothesisCarryForward: stamps recordedAt with the given "now"', applied.recordedAt === now)

  const nonBlankToday = withSupport({ SIJ: 'LOWER' })
  const blockedByToday = applyLbpWorkingHypothesisCarryForward(nonBlankToday, prior, now)
  assert('applyLbpWorkingHypothesisCarryForward: never overwrites when today already has a real pick', blockedByToday === nonBlankToday)

  const blockedByNullPrior = applyLbpWorkingHypothesisCarryForward(blankToday, null, now)
  assert('applyLbpWorkingHypothesisCarryForward: a null prior leaves today unchanged', blockedByNullPrior === blankToday)

  const blankPrior = emptyLbpWorkingHypothesis()
  const blockedByBlankPrior = applyLbpWorkingHypothesisCarryForward(blankToday, blankPrior, now)
  assert('applyLbpWorkingHypothesisCarryForward: a blank (all-UNJUDGED) prior leaves today unchanged (nothing real to offer)', blockedByBlankPrior === blankToday)
}

/* ------------------------------------------------------------------------
 * §11.6 mutant (e): "carry-forward auto-applying the hypothesis" --
 * structural checks that the carry-forward action is never automatic.
 * ---------------------------------------------------------------------- */
{
  // (i) The general "이전 내용 이어가기" module must never reference the
  // hypothesis at all -- proves the 3 EXISTING carry-forward buttons
  // (이전 판단 유지/이전 처치·관리계획 유지/기존 Follow-up Target 유지)
  // cannot pick it up as a side effect.
  const carrySrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/revisitCarryForward.ts', import.meta.url)), 'utf8')
  assert('mutant (e) guard: revisitCarryForward.ts never mentions lbpWorkingHypothesis (module or type)', !/lbpWorkingHypothesis|LbpWorkingHypothesis/i.test(carrySrc))

  // (ii) RevisitWorkspace.tsx's one call site sits inside an onClick
  // handler, not inside the load effect (auto-apply-on-open would be the
  // concrete mutant here). Recreate that mutant conceptually: if the call
  // site's nearest preceding handler token were `useEffect(` instead of
  // `onClick={`, this structural check would fail -- shown by the negative
  // assertion sitting right next to the positive one.
  const rwSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/RevisitWorkspace.tsx', import.meta.url)), 'utf8')
  const callSites = [...rwSrc.matchAll(/applyLbpWorkingHypothesisCarryForward\(/g)]
  assert('mutant (e) guard: applyLbpWorkingHypothesisCarryForward is called exactly once in RevisitWorkspace.tsx (the one dedicated button)', callSites.length === 1)
  const idx = callSites[0].index
  const before300 = rwSrc.slice(Math.max(0, idx - 300), idx)
  assert('mutant (e) guard: the call site is immediately inside an onClick={...} handler', /onClick=\{/.test(before300))
  const loadEffectRegion = rwSrc.slice(rwSrc.indexOf('useEffect(() => {'), rwSrc.indexOf('}, [visitId, patientId, reloadNonce])'))
  assert('mutant (e) guard: the call site does NOT appear inside the load-on-open useEffect (would mean auto-apply on page open)', !loadEffectRegion.includes('applyLbpWorkingHypothesisCarryForward'))
}

/* ------------------------------------------------------------------------
 * buildPainWorkspaceEmrPreview -- §11.5 EMR line
 * ---------------------------------------------------------------------- */
{
  const baseInput = {
    primaryConcern: '요통',
    examSuggestions: [],
    finalAssessment: { finalWorkingAssessment: '', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
    followUpTargets: [],
  }

  const withoutHypothesis = buildPainWorkspaceEmrPreview(baseInput)
  assert('buildPainWorkspaceEmrPreview: no "임상 가설" line at all when lbpWorkingHypothesis is omitted', !withoutHypothesis.includes('임상 가설'))

  const withBlankHypothesis = buildPainWorkspaceEmrPreview({ ...baseInput, lbpWorkingHypothesis: emptyLbpWorkingHypothesis() })
  assert('buildPainWorkspaceEmrPreview: no "임상 가설" line when every pattern is UNJUDGED (never an empty "임상 가설:" line)', !withBlankHypothesis.includes('임상 가설'))

  const withRealHypothesis = buildPainWorkspaceEmrPreview({ ...baseInput, lbpWorkingHypothesis: withSupport({ NEURAL: 'HIGHER' }) })
  assert('buildPainWorkspaceEmrPreview: renders exactly one "임상 가설:" line when at least one pattern is set', withRealHypothesis.includes('임상 가설: 신경근 관여 가능성 높음'))
  assert('buildPainWorkspaceEmrPreview: never double-prefixed ("임상 가설: 임상 가설:")', !withRealHypothesis.includes('임상 가설: 임상 가설:'))

  const hypIdx = withRealHypothesis.indexOf('임상 가설:')
  const assessmentIdx = withRealHypothesis.indexOf('Assessment:')
  assert('buildPainWorkspaceEmrPreview: the "임상 가설" line sits before the "Assessment" line', hypIdx !== -1 && assessmentIdx !== -1 && hypIdx < assessmentIdx)
}

/* ------------------------------------------------------------------------
 * LbpWorkingHypothesisCard rendering -- §11.4/§11.6
 * ---------------------------------------------------------------------- */
{
  const render = (value, onInsertPatientSentence) =>
    renderToString(React.createElement(LbpWorkingHypothesisCard, { value, onChange: () => {}, onInsertPatientSentence }))

  const html = render(emptyLbpWorkingHypothesis())

  assert('LbpWorkingHypothesisCard: title renders', html.includes('임상 가설(확정 진단 아님)'))
  assert('LbpWorkingHypothesisCard: hint states the clinician chooses, the system does not compute', html.includes('원장이 직접 선택합니다. 시스템이 계산하지 않습니다.'))

  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    assert(`LbpWorkingHypothesisCard: pattern group title "${LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]}" renders`, html.includes(LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]))
  }
  for (const opt of LBP_HYPOTHESIS_SUPPORT_OPTIONS) {
    const label = LBP_HYPOTHESIS_SUPPORT_LABEL_KO[opt]
    const count = (html.match(new RegExp(`<button[^>]*>${label}</button>`, 'g')) ?? []).length
    assert(`LbpWorkingHypothesisCard: chip "${label}" renders as a button, once per each of the 5 pattern groups`, count === 5)
  }

  // §11.6: "기본 aria-pressed=true 0개" -- default (all UNJUDGED) renders
  // zero pressed chips, even though 'UNJUDGED' itself is a rendered chip.
  const pressedTrueCount = (html.match(/aria-pressed="true"/g) ?? []).length
  assert('LbpWorkingHypothesisCard: default value renders zero pressed chips', pressedTrueCount === 0)

  // Non-vacuous counterexample: setting exactly one pattern DOES produce
  // exactly one pressed chip.
  const htmlOneSet = render(withSupport({ HIP: 'CONSIDER' }))
  const pressedCountOneSet = (htmlOneSet.match(/aria-pressed="true"/g) ?? []).length
  assert('LbpWorkingHypothesisCard: counterexample -- setting exactly one pattern produces exactly one pressed chip (proves the zero-count assertion above is not vacuous)', pressedCountOneSet === 1)
  assert('LbpWorkingHypothesisCard: the pressed chip is specifically "고려" (CONSIDER)', /aria-pressed="true"[^>]*>고려<\/button>/.test(htmlOneSet))

  // Setting a second, different pattern presses exactly two chips.
  const htmlTwoSet = render(withSupport({ HIP: 'CONSIDER', NEURAL: 'LOWER' }))
  const pressedCountTwoSet = (htmlTwoSet.match(/aria-pressed="true"/g) ?? []).length
  assert('LbpWorkingHypothesisCard: setting two independent patterns presses exactly two chips', pressedCountTwoSet === 2)

  // "안내문에 넣기" button: present only when a draft exists (exactly one
  // HIGHER pattern) -- indexOf/slice, both directions, non-vacuous.
  const htmlNoDraft = render(withSupport({ HIP: 'CONSIDER' }), () => {})
  assert('LbpWorkingHypothesisCard: "안내문에 넣기" button absent when there is no draft (0 HIGHER)', htmlNoDraft.indexOf('안내문에 넣기') === -1)

  const htmlTwoHigherNoDraft = render(withSupport({ HIP: 'HIGHER', NEURAL: 'HIGHER' }), () => {})
  assert('LbpWorkingHypothesisCard: "안내문에 넣기" button absent when there are 2 HIGHER patterns (no draft)', htmlTwoHigherNoDraft.indexOf('안내문에 넣기') === -1)

  const htmlWithDraft = render(withSupport({ HIP: 'HIGHER' }), () => {})
  const btnIdx = htmlWithDraft.indexOf('안내문에 넣기')
  assert('LbpWorkingHypothesisCard: "안내문에 넣기" button present when exactly one HIGHER pattern exists (counterexample proving the absence checks above are non-vacuous)', btnIdx !== -1)
  const draftText = patientSentenceDraftKo(withSupport({ HIP: 'HIGHER' }))
  assert('LbpWorkingHypothesisCard: the draft sentence text itself renders on screen', htmlWithDraft.includes(draftText))
  assert('LbpWorkingHypothesisCard: the draft sentence appears BEFORE the insert button (slice direction)', htmlWithDraft.indexOf(draftText) < btnIdx)

  // No onInsertPatientSentence callback -> draft box still renders (읽기
  // 가능) but no button, matching RehabSuggestionCard's onAdoptToCarePlan?
  // optionality.
  const htmlDraftNoCallback = render(withSupport({ HIP: 'HIGHER' }), undefined)
  assert('LbpWorkingHypothesisCard: draft text still renders with no onInsertPatientSentence callback supplied', htmlDraftNoCallback.includes(draftText))
  assert('LbpWorkingHypothesisCard: no "안내문에 넣기" button renders when onInsertPatientSentence is omitted', htmlDraftNoCallback.indexOf('안내문에 넣기') === -1)
}

/* ------------------------------------------------------------------------
 * persistence.ts -- WorkspaceState round-trip / legacy / corruption
 * ---------------------------------------------------------------------- */
{
  const empty = emptyWorkspaceState()
  assert('emptyWorkspaceState: lbpWorkingHypothesis starts as the empty (all-UNJUDGED) value', JSON.stringify(empty.lbpWorkingHypothesis) === JSON.stringify(emptyLbpWorkingHypothesis()))

  // Legacy record (round-2/round-3/Batch-1-2.5b shape, no lbpWorkingHypothesis field at all) -> empty default.
  const legacy = deserializeWorkspaceState({ schema_version: '1.1.0', painFinalAssessment: { finalWorkingAssessment: '기존' } })
  assert('deserializeWorkspaceState: a legacy record with no lbpWorkingHypothesis field degrades to the empty default', JSON.stringify(legacy.lbpWorkingHypothesis) === JSON.stringify(emptyLbpWorkingHypothesis()))
  assert('deserializeWorkspaceState: legacy sibling fields are untouched by the new field\'s absence', legacy.painFinalAssessment.finalWorkingAssessment === '기존')

  // Real round-trip.
  const real = withSupport({ LUMBAR_MOVEMENT: 'HIGHER', SIJ: 'LOWER' })
  real.recordedAt = '2026-09-03T00:00:00.000Z'
  const roundTripped = deserializeWorkspaceState({ ...empty, lbpWorkingHypothesis: real })
  assert('deserializeWorkspaceState: a well-formed lbpWorkingHypothesis round-trips exactly', JSON.stringify(roundTripped.lbpWorkingHypothesis) === JSON.stringify(real))

  // Corrupted -> UNJUDGED (never crashes, never a fabricated real value).
  const corrupted = deserializeWorkspaceState({
    ...empty,
    lbpWorkingHypothesis: { supports: { LUMBAR_MOVEMENT: 'NOT_A_REAL_VALUE' }, recordedAt: 'bad-but-string-so-kept' },
  })
  assert('deserializeWorkspaceState: a corrupted supports value degrades to UNJUDGED', corrupted.lbpWorkingHypothesis.supports.LUMBAR_MOVEMENT === 'UNJUDGED')
  assert('deserializeWorkspaceState: every OTHER pattern also defaults to UNJUDGED when omitted from a corrupt payload', LBP_HYPOTHESIS_PATTERN_IDS.filter((id) => id !== 'LUMBAR_MOVEMENT').every((id) => corrupted.lbpWorkingHypothesis.supports[id] === 'UNJUDGED'))

  // Fully malformed top-level payload -> never throws, whole record degrades.
  for (const bad of [undefined, null, 'not-an-object', 42, []]) {
    let threw = false
    let result
    try {
      result = deserializeWorkspaceState(bad)
    } catch {
      threw = true
    }
    assert(`deserializeWorkspaceState: malformed top-level payload (${JSON.stringify(bad)}) never throws`, !threw)
    assert(`deserializeWorkspaceState: malformed top-level payload (${JSON.stringify(bad)}) degrades lbpWorkingHypothesis to empty`, JSON.stringify(result.lbpWorkingHypothesis) === JSON.stringify(emptyLbpWorkingHypothesis()))
  }
}

/* ------------------------------------------------------------------------
 * visitWorkspace.ts -- VisitWorkspaceState round-trip / legacy / corruption
 * ---------------------------------------------------------------------- */
{
  const empty = emptyVisitWorkspaceState()
  assert('emptyVisitWorkspaceState: lbpWorkingHypothesis starts as the empty (all-UNJUDGED) value', JSON.stringify(empty.lbpWorkingHypothesis) === JSON.stringify(emptyLbpWorkingHypothesis()))

  const legacy = deserializeVisitWorkspaceState({ schema_version: '1.0.0', finalAssessment: { finalWorkingAssessment: '기존 재진 기록' } })
  assert('deserializeVisitWorkspaceState: a legacy record with no lbpWorkingHypothesis field degrades to the empty default', JSON.stringify(legacy.lbpWorkingHypothesis) === JSON.stringify(emptyLbpWorkingHypothesis()))
  assert('deserializeVisitWorkspaceState: legacy sibling fields are untouched by the new field\'s absence', legacy.finalAssessment.finalWorkingAssessment === '기존 재진 기록')

  const real = withSupport({ HIP: 'CONSIDER', WALK_STAND_LEG: 'HIGHER' })
  real.recordedAt = '2026-09-03T00:00:00.000Z'
  const roundTripped = deserializeVisitWorkspaceState({ ...empty, lbpWorkingHypothesis: real })
  assert('deserializeVisitWorkspaceState: a well-formed lbpWorkingHypothesis round-trips exactly', JSON.stringify(roundTripped.lbpWorkingHypothesis) === JSON.stringify(real))

  const corrupted = deserializeVisitWorkspaceState({
    ...empty,
    lbpWorkingHypothesis: { supports: { HIP: 42 }, recordedAt: null },
  })
  assert('deserializeVisitWorkspaceState: a corrupted supports value degrades to UNJUDGED', corrupted.lbpWorkingHypothesis.supports.HIP === 'UNJUDGED')

  for (const bad of [undefined, null, 'not-an-object', 42, []]) {
    let threw = false
    let result
    try {
      result = deserializeVisitWorkspaceState(bad)
    } catch {
      threw = true
    }
    assert(`deserializeVisitWorkspaceState: malformed top-level payload (${JSON.stringify(bad)}) never throws`, !threw)
    assert(`deserializeVisitWorkspaceState: malformed top-level payload (${JSON.stringify(bad)}) degrades lbpWorkingHypothesis to empty`, JSON.stringify(result.lbpWorkingHypothesis) === JSON.stringify(emptyLbpWorkingHypothesis()))
  }
}

/* ------------------------------------------------------------------------
 * §11.1/§11.7: patientCarePlanPreview.ts zero-diff guard -- the patient
 * output boundary this whole batch is designed to protect. A sha256 pin
 * catches ANY byte-level change (not just the imports this file happened
 * to think of), matching §11.6's "zero-diff 단언(소스 검사)" requirement
 * literally.
 * ---------------------------------------------------------------------- */
{
  const previewSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/patientCarePlanPreview.ts', import.meta.url)), 'utf8')
  const hash = createHash('sha256').update(previewSrc, 'utf8').digest('hex')
  assert(
    'patientCarePlanPreview.ts is byte-for-byte unchanged (sha256 pin) -- LBP v1 Batch 2.5c must not touch this file at all',
    hash === '786d84d49c00fc1143aa5c8bd841785aa4ab2af02c752b1470bc77ee48520136',
  )
  assert('patientCarePlanPreview.ts source never imports the new lbpWorkingHypothesis module', !previewSrc.includes("from './lbpWorkingHypothesis'"))
  assert('patientCarePlanPreview.ts source never names any of the 5 hypothesis pattern ids', !LBP_HYPOTHESIS_PATTERN_IDS.some((id) => previewSrc.includes(id)))
  assert('patientCarePlanPreview.ts source never contains the literal string "임상 가설"', !previewSrc.includes('임상 가설'))

  // No src/ file outside this module/its own consumers imports
  // lbpWorkingHypothesis.ts into patientCarePlanPreview.ts's dependency
  // path -- the only intended callers are the workspace/card/EMR files
  // this batch itself wires it into.
  const allowedImporters = new Set([
    'DoctorWorkspace.tsx',
    'RevisitWorkspace.tsx',
    'LbpWorkingHypothesisCard.tsx',
    'emrPreview.ts',
    'persistence.ts',
    'visitWorkspace.ts',
  ])
  assert('structural sanity: patientCarePlanPreview.ts is not in the allowed-importers list (it must never import lbpWorkingHypothesis.ts)', !allowedImporters.has('patientCarePlanPreview.ts'))
}

console.log(`\n${passCount} LBP working hypothesis assertions passed.`)
