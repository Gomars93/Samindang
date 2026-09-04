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
import TestRenderer, { act } from 'react-test-renderer'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join as joinPath } from 'node:path'
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
  isLbpPatientForRevisitHypothesisGate,
} from './.lbp-working-hypothesis-bundle.mjs'
import { LbpWorkingHypothesisCard } from './.lbp-working-hypothesis-card-bundle.cjs'
import { buildPainWorkspaceEmrPreview } from './.lbp-working-hypothesis-emrpreview-bundle.mjs'
import { emptyWorkspaceState, deserializeWorkspaceState } from './.lbp-working-hypothesis-persistence-bundle.mjs'
import { emptyVisitWorkspaceState, deserializeVisitWorkspaceState } from './.lbp-working-hypothesis-visitworkspace-bundle.mjs'
import { buildPainPatientCarePlanPreview } from './.lbp-working-hypothesis-carepreview-bundle.mjs'

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

/**
 * D-9: brace-balanced scan for every `useEffect(...)` call's full source
 * span in `src`, used to check whether a given index falls INSIDE one (a
 * structural stand-in for "was this call moved into an effect").
 */
function useEffectSpans(src) {
  const spans = []
  const re = /useEffect\(/g
  let m
  while ((m = re.exec(src))) {
    const openParenIdx = m.index + 'useEffect'.length
    let depth = 0
    let end = -1
    for (let i = openParenIdx; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end !== -1) spans.push([m.index, end])
  }
  return spans
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
    NEURAL: '다리로 뻗치는 증상',
    WALK_STAND_LEG: '오래 걷거나 서 있을 때 나타나는 다리 증상',
    HIP: '고관절',
    SIJ: '골반 뒤쪽 관절',
  }
  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    const draft = patientSentenceDraftKo(withSupport({ [id]: 'HIGHER' }))
    assert(`patientSentenceDraftKo (${id}): contains the exact fixed easy-language expression`, draft.includes(expectedEasySubstring[id]))
  }

  // ------------------------------------------------------------------
  // D-7 (remaining half) / CDR-1 / CDR-2: all FIVE full patient sentences,
  // pinned verbatim as hard-coded literals written out IN THIS FILE -- NOT
  // built from LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO or any other
  // constant imported from the module under test. This is deliberately
  // redundant with the per-pattern easy-substring checks above: those check
  // for a SUBSTRING and are satisfied even if surrounding wording changes;
  // these five pin the ENTIRE string, so any wording change to any of the 5
  // easy labels, the particle, the opening, or the mandatory clause breaks
  // one of these five assertions. PO-approved wording -- do NOT update these
  // literals without a DECISIONS.md entry (CDR-1 NEURAL, CDR-2 WALK_STAND_LEG,
  // 2026-09-04).
  // ------------------------------------------------------------------
  const expectedFullSentenceKo = {
    LUMBAR_MOVEMENT:
      '오늘은 허리 움직임과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.',
    NEURAL:
      '오늘은 다리로 뻗치는 증상과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.',
    WALK_STAND_LEG:
      '오늘은 오래 걷거나 서 있을 때 나타나는 다리 증상과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.',
    HIP:
      '오늘은 고관절과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.',
    SIJ:
      '오늘은 골반 뒤쪽 관절과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.',
  }
  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    const draft = patientSentenceDraftKo(withSupport({ [id]: 'HIGHER' }))
    assert(`patientSentenceDraftKo (${id}): exact full sentence matches the hard-coded PO-approved literal`, draft === expectedFullSentenceKo[id])
  }
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
 * Opus delta review D-4 / CDR-3 (PO decision, 2026-09-04):
 * isLbpPatientForRevisitHypothesisGate -- the pure predicate that gates the
 * revisit hypothesis card + carry-forward button. Extracted specifically so
 * it can be unit-tested directly, independent of RevisitWorkspace.tsx's own
 * network-loading state (that file is not bundled/rendered by this spec --
 * see the mutant (e) block above's own comment on why).
 * ---------------------------------------------------------------------- */
{
  const blank = emptyLbpWorkingHypothesis()
  const recorded = withSupport({ NEURAL: 'HIGHER' })

  // (1) No submission-backed LBP signal, no hypothesis recorded today -->
  // gate CLOSED (the exact D-4 defect scenario: a neck/knee/etc. revisit
  // with nothing LBP-specific about it yet).
  assert('isLbpPatientForRevisitHypothesisGate: no LBP signal + blank hypothesis -> false (gate closed)', isLbpPatientForRevisitHypothesisGate(null, blank) === false)
  assert('isLbpPatientForRevisitHypothesisGate: undefined LBP signal + blank hypothesis -> false (gate closed)', isLbpPatientForRevisitHypothesisGate(undefined, blank) === false)

  // (2) A real submission-backed LBP signal (`safety_flags.lbp != null`) +
  // blank hypothesis -> gate OPEN. Exercises non-boolean/non-truthy real
  // values, matching this codebase's `!= null` applicability convention
  // (never a truthiness check -- `false`/`0` would still be a real flag).
  for (const lbpFlagValue of ['some-recorded-value', false, 0, {}, []]) {
    assert(
      `isLbpPatientForRevisitHypothesisGate: LBP signal present (${JSON.stringify(lbpFlagValue)}, != null) + blank hypothesis -> true (gate open)`,
      isLbpPatientForRevisitHypothesisGate(lbpFlagValue, blank) === true,
    )
  }

  // (3) REQUIRED disjunct: no submission-backed LBP signal at all, but
  // today's own hypothesis is already non-blank -> gate stays OPEN. Without
  // this, a hypothesis recorded on this visit would become
  // unreachable/uneditable the moment the first signal reads false.
  assert(
    'isLbpPatientForRevisitHypothesisGate: no LBP signal BUT a hypothesis is already recorded today -> true (a recorded hypothesis must never become unreachable)',
    isLbpPatientForRevisitHypothesisGate(null, recorded) === true,
  )
  assert(
    'isLbpPatientForRevisitHypothesisGate: no LBP signal (undefined) BUT a hypothesis is already recorded today -> true',
    isLbpPatientForRevisitHypothesisGate(undefined, recorded) === true,
  )

  // (4) Both true -> still true (non-vacuous "or", not exclusive-or).
  assert('isLbpPatientForRevisitHypothesisGate: LBP signal present AND hypothesis recorded -> true', isLbpPatientForRevisitHypothesisGate('lbp', recorded) === true)

  // Mutant reproduction: a broken gate that used AND instead of OR would
  // wrongly close the gate on case (3) -- prove the real function does NOT
  // exhibit that behaviour, and that a hand-built AND-mutant would fail the
  // same assertion.
  const mutantAndGate = (lbp, hyp) => lbp != null && !isLbpWorkingHypothesisBlank(hyp)
  assert('mutant (D-4 AND-gate) reproduction: an AND-based mutant wrongly closes the gate for "no LBP signal but hypothesis recorded"', mutantAndGate(null, recorded) === false)
  assert('mutant (D-4 AND-gate) reproduction: the REAL function differs from the mutant on that exact case', isLbpPatientForRevisitHypothesisGate(null, recorded) !== mutantAndGate(null, recorded))
}

/* ------------------------------------------------------------------------
 * Opus delta review D-4 / CDR-3: structural guard on RevisitWorkspace.tsx --
 * both the carry-forward button and the hypothesis card must sit INSIDE the
 * same `{isLbpPatient && (...)}` conditional block, and `isLbpPatient` must
 * itself be derived from isLbpPatientForRevisitHypothesisGate(...). Source-
 * scan, same convention as the D-9/mutant-(e) guards above (RevisitWorkspace.tsx
 * is not bundled/rendered by this spec).
 * ---------------------------------------------------------------------- */
{
  const rwSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/RevisitWorkspace.tsx', import.meta.url)), 'utf8')

  assert(
    'D-4 guard: RevisitWorkspace.tsx derives isLbpPatient via isLbpPatientForRevisitHypothesisGate(...)',
    /const isLbpPatient = isLbpPatientForRevisitHypothesisGate\(/.test(rwSrc),
  )

  const gateIdx = rwSrc.indexOf('{isLbpPatient && (')
  assert('D-4 guard: a "{isLbpPatient && (" conditional block exists in the JSX', gateIdx !== -1)

  // Find this conditional's matching close by balancing parens from the "("
  // right after "&& ".
  const openParenIdx = rwSrc.indexOf('(', gateIdx + '{isLbpPatient && '.length)
  let depth = 0
  let closeParenIdx = -1
  for (let i = openParenIdx; i < rwSrc.length; i++) {
    if (rwSrc[i] === '(') depth++
    else if (rwSrc[i] === ')') {
      depth--
      if (depth === 0) {
        closeParenIdx = i
        break
      }
    }
  }
  assert('D-4 guard: the "{isLbpPatient && (...)}" block\'s matching close paren is found', closeParenIdx !== -1)
  const gatedRegion = rwSrc.slice(gateIdx, closeParenIdx)

  // Search for the button's visible label text starting AFTER gateIdx --
  // the doc comment immediately above the gated block also mentions the
  // same phrase in quotes, so an unqualified indexOf would find that
  // instead of the actual JSX text node.
  const btnIdx = rwSrc.indexOf('이전 가설 이어받기', gateIdx)
  const cardIdx = rwSrc.indexOf('<LbpWorkingHypothesisCard')
  const finalAssessmentIdx = rwSrc.indexOf('<PainFinalAssessmentCard')
  assert('D-4 guard: sanity -- the carry-forward button label, the card, and the next sibling card all exist in the file', btnIdx !== -1 && cardIdx !== -1 && finalAssessmentIdx !== -1)

  assert('D-4 guard: the "이전 가설 이어받기" carry-forward button sits INSIDE the isLbpPatient-gated block', btnIdx > gateIdx && btnIdx < closeParenIdx)
  assert('D-4 guard: <LbpWorkingHypothesisCard sits INSIDE the isLbpPatient-gated block', cardIdx > gateIdx && cardIdx < closeParenIdx)
  assert('D-4 guard: gatedRegion actually contains both (non-vacuous slice check)', gatedRegion.includes('이전 가설 이어받기') && gatedRegion.includes('<LbpWorkingHypothesisCard'))

  // Counterexample proving this is not vacuously true for every card: the
  // NEXT card down (<PainFinalAssessmentCard>, always shown regardless of
  // LBP status) sits OUTSIDE the gated block.
  assert(
    'D-4 guard (counterexample): <PainFinalAssessmentCard sits OUTSIDE the isLbpPatient-gated block (proves the region check above is not trivially "everything after gateIdx")',
    finalAssessmentIdx > closeParenIdx,
  )

  // Mutant reproduction: the D-4 defect as originally found -- the button
  // and card as unconditional top-level JSX siblings, with NO
  // "{isLbpPatient && (" wrapper at all. Prove the structural check above
  // (a regex/indexOf search for that wrapper) correctly fails to find one
  // in this hand-built ungated snippet, i.e. it is non-vacuous.
  const mutantUngatedSnippet = `
      <div className="workspace__revisit__carryForward__actions">
        <button type="button" onClick={() => {}}>이전 가설 이어받기</button>
      </div>
      <LbpWorkingHypothesisCard value={workspaceState.lbpWorkingHypothesis} onChange={() => {}} />
      <PainFinalAssessmentCard value={workspaceState.finalAssessment} onChange={() => {}} />
  `
  assert('mutant (D-4) reproduction: the hand-built ungated mutant snippet contains no "{isLbpPatient && (" wrapper at all', !mutantUngatedSnippet.includes('{isLbpPatient && ('))
  assert('mutant (D-4) reproduction: yet the mutant snippet DOES still contain the button label and the card (the defect is real, not just missing content)', mutantUngatedSnippet.includes('이전 가설 이어받기') && mutantUngatedSnippet.includes('<LbpWorkingHypothesisCard'))
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
  assert('buildPainWorkspaceEmrPreview: no "임상 가설" clause at all when lbpWorkingHypothesis is omitted', !withoutHypothesis.includes('임상 가설'))

  const withBlankHypothesis = buildPainWorkspaceEmrPreview({ ...baseInput, lbpWorkingHypothesis: emptyLbpWorkingHypothesis() })
  assert('buildPainWorkspaceEmrPreview: no "임상 가설" clause when every pattern is UNJUDGED (never an empty "A: 임상 가설:" clause)', !withBlankHypothesis.includes('임상 가설'))

  // LBP v1 Batch 4 (§14.1): the 6-key reformat folds "임상 가설" into the
  // fixed "A" (평가) key's value, immediately before "최종 임상 판단" --
  // there is no longer a standalone "임상 가설:"/"Assessment:" line pair.
  const withRealHypothesis = buildPainWorkspaceEmrPreview({ ...baseInput, lbpWorkingHypothesis: withSupport({ NEURAL: 'HIGHER' }) })
  assert('buildPainWorkspaceEmrPreview: the A line carries "임상 가설: 신경근 관여 가능성 높음" when at least one pattern is set', withRealHypothesis.includes('A: 임상 가설: 신경근 관여 가능성 높음'))
  assert('buildPainWorkspaceEmrPreview: never double-prefixed ("임상 가설: 임상 가설:")', !withRealHypothesis.includes('임상 가설: 임상 가설:'))

  const withHypothesisAndJudgment = buildPainWorkspaceEmrPreview({
    ...baseInput,
    finalAssessment: { ...baseInput.finalAssessment, finalWorkingAssessment: '요추 기계적 통증' },
    lbpWorkingHypothesis: withSupport({ NEURAL: 'HIGHER' }),
  })
  const aLine = withHypothesisAndJudgment.split('\r\n').find((l) => l.startsWith('A:'))
  assert('buildPainWorkspaceEmrPreview: the "A:" line exists', aLine != null)
  assert(
    'buildPainWorkspaceEmrPreview: within that single "A:" line, "임상 가설" sits before "최종 임상 판단"',
    aLine.includes('임상 가설:') && aLine.includes('최종 임상 판단: 요추 기계적 통증') && aLine.indexOf('임상 가설:') < aLine.indexOf('최종 임상 판단:'),
  )
  assert(
    'buildPainWorkspaceEmrPreview: no separate "Assessment:" line -- both clauses live on the fixed "A:" key',
    !withHypothesisAndJudgment.includes('Assessment:'),
  )
}

/* ------------------------------------------------------------------------
 * LBP v1 Batch 4 §14.1/§14.6 -- the fixed 6-key skeleton (always exactly
 * six lines, in this order, even when every value is empty) and the O
 * boundary (clinical safety, mandatory mutant per §14.6: a patient
 * self-reported value must NEVER reach the O line).
 * ---------------------------------------------------------------------- */
{
  const allEmptyInput = {
    primaryConcern: null,
    examSuggestions: [],
    finalAssessment: { finalWorkingAssessment: '', treatmentFocus: '', interventionPerformedOrPlanned: '', immediateRetestTarget: '', recordedAt: null },
    followUpTargets: [],
  }
  const allEmpty = buildPainWorkspaceEmrPreview(allEmptyInput)
  const expectedSkeleton = ['C/C:', 'O/S:', 'S:', 'O:', 'A:', 'P:'].join('\r\n')
  assert(
    '§14.1 6-key skeleton: every value empty -> exactly the 6 fixed keys, in order (C/C, O/S, S, O, A, P), nothing else',
    allEmpty === expectedSkeleton,
  )

  // A filled example -- one value per key, confirming the fixed key
  // LITERALS ('C/C', 'O/S', 'S', 'O', 'A', 'P') are hardcoded, not derived
  // from any label table (§14.6: "키 이름·순서가 하드코딩 리터럴로 고정된다").
  //
  // Opus delta review defect #6: the ORIGINAL version of this fixture only
  // populated 2 of the O key's 4 possible clauses (검사 결과/객관적
  // 근력저하) -- 허리 움직임 반응/오늘 재검 소견 were never exercised by any
  // exact-match assertion, so a mutant that smuggled a patient-reported
  // value into either of those two clauses SURVIVED (verified: M6 pushed
  // onsetDurationText into the 오늘 재검 소견 clause, M6b pushed
  // aggravatingText into the 허리 움직임 반응 clause -- both passed every
  // suite unmodified). All 4 O clauses are now populated here, and the
  // exact-match assertion below covers the whole O line, so any such
  // smuggling breaks it. Also extended (still exact-match) to cover defect
  // #2 (clinicianJudgment*, in A/A/P) and defect #7 (revisitRecapText in
  // O/S, microFollowUpText in S).
  const filled = buildPainWorkspaceEmrPreview({
    primaryConcern: '요통',
    examSuggestions: [
      {
        id: 'e1',
        title: 'SLR(하지직거상) 검사',
        priority: 'MUST_CHECK',
        reasonFacts: [],
        source: 'SUGGESTED',
        result: { status: 'NEGATIVE', laterality: 'NOT_APPLICABLE', note: '', recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ],
    finalAssessment: {
      finalWorkingAssessment: '요추 기계적 통증',
      treatmentFocus: '가동성 회복',
      interventionPerformedOrPlanned: '침, 물리치료',
      immediateRetestTarget: '숙일 때 통증 재현 여부',
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
    followUpTargets: [{ id: 'pain_intensity', label: '통증 강도', baseline: '7', postTreatmentValue: '' }],
    onsetDurationText: '1~3개월 · 매일',
    revisitRecapText: '전체 반응 호전',
    aggravatingText: '움직일 때 악화',
    impactText: '가벼운 지장',
    microFollowUpText: '어제부터 조금 나아짐',
    lbpDirectionalResponse: 'FLEXION_FAVORABLE',
    reassessment: {
      items: [
        {
          id: 'r1',
          title: 'SLR(하지직거상) 재검',
          previous: null,
          source: 'OBSERVED',
          result: { status: 'POSITIVE', laterality: 'NOT_APPLICABLE', note: '', recordedAt: '2026-01-02T00:00:00.000Z' },
        },
      ],
      finalReassessmentNote: '',
      recordedAt: '2026-01-02T00:00:00.000Z',
    },
    lbpObjectiveMotorDeficit: 'NONE',
    clinicianJudgmentAssessment: '신경근 증상 동반 가능성 낮음',
    clinicianJudgmentTreatment: '가동성 회복 위주',
    clinicianJudgmentPlan: '2주 후 재평가',
  })
  const filledLines = filled.split('\r\n')
  assert('§14.1 filled example: exactly 6 lines', filledLines.length === 6)
  assert('§14.1 filled example: keys are C/C, O/S, S, O, A, P in that exact order', filledLines.every((l, i) => l.startsWith(['C/C:', 'O/S:', 'S:', 'O:', 'A:', 'P:'][i])))
  assert('§14.1 filled example: C/C carries the chief concern', filledLines[0] === 'C/C: 요통')
  assert(
    '§14.1 filled example: O/S carries the tablet onset/duration text + (defect #7) the revisit recap text',
    filledLines[1] === 'O/S: 1~3개월 · 매일; 전체 반응 호전',
  )
  assert(
    '§14.1 filled example: S carries only patient self-report (악화요인/일상 영향/micro follow-up), never a clinician value',
    filledLines[2] === 'S: 악화요인: 움직일 때 악화; 일상 영향: 가벼운 지장; 최근 경과(환자 응답): 어제부터 조금 나아짐',
  )
  assert(
    '§14.1 filled example (defect #6, all 4 O clauses populated): O carries the clinician exam finding + directional response + today\'s reassessment finding + the objective-motor-deficit finding, and nothing patient-reported',
    filledLines[3] ===
      'O: 검사 결과: SLR(하지직거상) 검사: 음성/정상; 허리 움직임 반응: 숙이면(굴곡) 호전; 오늘 재검 소견: SLR(하지직거상) 재검: 양성/이상 소견; 객관적 근력저하: 없음',
  )
  assert(
    '§14.1 filled example: A carries 최종 임상 판단 + (defect #2) 원장 평가 + 치료/처방 방향 + 치료 초점',
    filledLines[4] === 'A: 최종 임상 판단: 요추 기계적 통증; 원장 평가: 신경근 증상 동반 가능성 낮음; 치료/처방 방향: 가동성 회복 위주; 치료 초점: 가동성 회복',
  )
  assert(
    '§14.1 filled example: P carries 시행/예정 처치 + (defect #2) 진료 계획 + 즉시 재검 대상 + 재평가 대상',
    filledLines[5] ===
      'P: 시행/예정 처치: 침, 물리치료; 진료 계획: 2주 후 재평가; 즉시 재검 대상: 숙일 때 통증 재현 여부; 재평가 대상: 통증 강도 — 기준 7',
  )

  // §14.1 O boundary (CLINICAL SAFETY, mandatory per §14.6): every value
  // fed here ONLY as a patient-self-report input (onsetDurationText/
  // aggravatingText/impactText -- the tablet-derived S/O-S sources) must
  // never reach O. Verified by hand as the mandatory mutant: temporarily
  // adding `if (input.aggravatingText) oParts.push(input.aggravatingText)`
  // inside buildPainWorkspaceEmrPreview's O computation made this
  // assertion fail with "FAIL: §14.1 O boundary (CLINICAL SAFETY,
  // mandatory): a patient self-reported value never appears on the O
  // line" (observed, then reverted -- exact transcript in the batch's
  // final report).
  const patientSelfReportValue = '환자가 태블릿에 직접 적은 자가보고 문구'
  const oBoundaryInput = {
    ...allEmptyInput,
    primaryConcern: '요통',
    onsetDurationText: patientSelfReportValue,
    aggravatingText: patientSelfReportValue,
    impactText: patientSelfReportValue,
  }
  const oBoundaryText = buildPainWorkspaceEmrPreview(oBoundaryInput)
  assert(
    '§14.1 O boundary sanity: the patient self-report value DOES reach the text (via O/S and S, not silently dropped)',
    oBoundaryText.includes(patientSelfReportValue),
  )
  const oBoundaryOLine = oBoundaryText.split('\r\n').find((l) => l.startsWith('O:'))
  assert(
    '§14.1 O boundary (CLINICAL SAFETY, mandatory): a patient self-reported value never appears on the O line -- O stays bare',
    oBoundaryOLine === 'O:',
  )

  // Opus delta review defect #7 extension: revisitRecapText/microFollowUpText
  // reach O/S and S respectively, and never O -- isolated from the `filled`
  // fixture above so a mutant that drops EITHER of these two specific
  // inputs (as opposed to the pre-existing three) is caught even if it
  // happens to leave the other clauses in `filled` intact.
  const defect7Input = {
    ...allEmptyInput,
    primaryConcern: '요통',
    revisitRecapText: patientSelfReportValue,
    microFollowUpText: patientSelfReportValue,
  }
  const defect7Text = buildPainWorkspaceEmrPreview(defect7Input)
  const defect7Lines = defect7Text.split('\r\n')
  assert(
    'defect #7: revisitRecapText reaches the O/S line',
    defect7Lines.find((l) => l.startsWith('O/S:')) === `O/S: ${patientSelfReportValue}`,
  )
  assert(
    'defect #7: microFollowUpText reaches the S line (labeled 최근 경과(환자 응답))',
    defect7Lines.find((l) => l.startsWith('S:')) === `S: 최근 경과(환자 응답): ${patientSelfReportValue}`,
  )
  assert(
    'defect #7: neither revisitRecapText nor microFollowUpText ever reaches the O line -- O stays bare',
    defect7Lines.find((l) => l.startsWith('O:')) === 'O:',
  )

  // Opus delta review defect #2: the three still clinician-typed
  // JudgmentPanel fields (revised_after_exam/final_treatment_axis/
  // prescription_direction) reach A/A/P and never O -- isolated so a
  // mutant that drops exactly one of the three is caught even independent
  // of the `filled` fixture above.
  const defect2Text = buildPainWorkspaceEmrPreview({
    ...allEmptyInput,
    primaryConcern: '요통',
    clinicianJudgmentAssessment: '원장 평가값',
    clinicianJudgmentTreatment: '치료 방향값',
    clinicianJudgmentPlan: '진료 계획값',
  })
  const defect2Lines = defect2Text.split('\r\n')
  const defect2ALine = defect2Lines.find((l) => l.startsWith('A:'))
  const defect2PLine = defect2Lines.find((l) => l.startsWith('P:'))
  assert('defect #2: clinicianJudgmentAssessment reaches A (원장 평가)', defect2ALine.includes('원장 평가: 원장 평가값'))
  assert('defect #2: clinicianJudgmentTreatment reaches A (치료/처방 방향)', defect2ALine.includes('치료/처방 방향: 치료 방향값'))
  assert('defect #2: clinicianJudgmentPlan reaches P (진료 계획)', defect2PLine.includes('진료 계획: 진료 계획값'))
  assert(
    'defect #2: none of the three clinician judgment fields ever reach O -- O stays bare',
    defect2Lines.find((l) => l.startsWith('O:')) === 'O:',
  )

  // Opus delta review defect #8: an unrecognized/invalid lbpDirectionalResponse
  // value must degrade exactly like the omitted/NOT_ASSESSED default --
  // never an empty "허리 움직임 반응: " clause on the O line.
  const defect8Text = buildPainWorkspaceEmrPreview({
    ...allEmptyInput,
    primaryConcern: '요통',
    lbpDirectionalResponse: 'NOT_A_REAL_VALUE',
  })
  assert(
    'defect #8: an invalid lbpDirectionalResponse value never produces an empty "허리 움직임 반응: " clause on O',
    defect8Text.split('\r\n').find((l) => l.startsWith('O:')) === 'O:',
  )
}

/* ------------------------------------------------------------------------
 * LbpWorkingHypothesisCard rendering -- §11.4/§11.6
 * ---------------------------------------------------------------------- */
{
  const render = (value, onInsertPatientSentence, currentPatientInstruction) =>
    renderToString(
      React.createElement(LbpWorkingHypothesisCard, { value, onChange: () => {}, onInsertPatientSentence, currentPatientInstruction }),
    )

  const html = render(emptyLbpWorkingHypothesis())

  assert('LbpWorkingHypothesisCard: title renders', html.includes('임상 가설(확정 진단 아님)'))
  assert('LbpWorkingHypothesisCard: hint states the clinician chooses, the system does not compute', html.includes('원장이 직접 선택합니다. 시스템이 계산하지 않습니다.'))

  for (const id of LBP_HYPOTHESIS_PATTERN_IDS) {
    assert(`LbpWorkingHypothesisCard: pattern group title "${LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]}" renders`, html.includes(LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]))
  }
  for (const opt of LBP_HYPOTHESIS_SUPPORT_OPTIONS) {
    const label = LBP_HYPOTHESIS_SUPPORT_LABEL_KO[opt]
    const count = (html.match(new RegExp(`<button[^>]*>${label}</button>`, 'g')) ?? []).length
    if (opt === 'UNJUDGED') {
      // Batch 2.6 (E-2): "미판단" is never itself a rendered chip -- it is
      // the untouched default (nothing to press it FOR), matching the
      // sibling convention RevisitQuickCheckCard already uses for its own
      // NOT_ASSESSED value. The stored default is unchanged; only this
      // always-visible, never-clicked button is gone.
      assert(`LbpWorkingHypothesisCard: chip "${label}" (UNJUDGED) does NOT render as a button in any of the 5 pattern groups`, count === 0)
    } else {
      assert(`LbpWorkingHypothesisCard: chip "${label}" renders as a button, once per each of the 5 pattern groups`, count === 5)
    }
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

  // ------------------------------------------------------------------
  // Opus delta review D-2/D-3: `currentPatientInstruction` insertion-state
  // cues -- the card must never auto-edit/auto-delete `patientInstruction`,
  // only tell the clinician what state it is in.
  // ------------------------------------------------------------------

  // (i) today's draft already an exact substring of the current
  // instruction -> button absent, static "이미 안내문에 들어 있습니다" shown.
  const htmlAlreadyPresent = render(withSupport({ HIP: 'HIGHER' }), () => {}, `기존 안내문\n${draftText}`)
  assert('LbpWorkingHypothesisCard (D-2): no "안내문에 넣기" button when the current draft is already present verbatim', htmlAlreadyPresent.indexOf('안내문에 넣기') === -1)
  assert('LbpWorkingHypothesisCard (D-2): shows "이미 안내문에 들어 있습니다" when the current draft is already present verbatim', htmlAlreadyPresent.includes('이미 안내문에 들어 있습니다'))

  // (ii) the instruction contains a DIFFERENT generated hypothesis sentence
  // (detected via the fixed clause) but not today's exact draft -> button
  // stays, AND a warning renders above it.
  const staleNeuralSentence = patientSentenceDraftKo(withSupport({ NEURAL: 'HIGHER' }))
  const htmlStale = render(withSupport({ HIP: 'HIGHER' }), () => {}, `기존 안내문\n${staleNeuralSentence}`)
  assert('LbpWorkingHypothesisCard (D-3): "안내문에 넣기" button still present when a DIFFERENT hypothesis sentence is stale in the instruction', htmlStale.indexOf('안내문에 넣기') !== -1)
  assert('LbpWorkingHypothesisCard (D-3): warns "안내문에 이전 가설 문장이 남아 있습니다..." when a stale hypothesis sentence is present', htmlStale.includes('안내문에 이전 가설 문장이 남아 있습니다. 직접 확인·수정하세요.'))
  const warnIdx = htmlStale.indexOf('안내문에 이전 가설 문장이 남아 있습니다')
  const staleBtnIdx = htmlStale.indexOf('안내문에 넣기')
  assert('LbpWorkingHypothesisCard (D-3): the warning renders BEFORE the button (clinician sees the warning first)', warnIdx !== -1 && staleBtnIdx !== -1 && warnIdx < staleBtnIdx)

  // (iii) clean case (non-vacuous counterexample) -- neither the "already
  // present" status nor the warning renders when the instruction has
  // nothing hypothesis-related in it; the plain button still renders.
  const htmlClean = render(withSupport({ HIP: 'HIGHER' }), () => {}, '원장이 직접 쓴 안내문')
  assert('LbpWorkingHypothesisCard: clean case -- no "이미 안내문에 들어 있습니다" status when the instruction has no hypothesis sentence', !htmlClean.includes('이미 안내문에 들어 있습니다'))
  assert('LbpWorkingHypothesisCard: clean case -- no stale-hypothesis warning when the instruction has no hypothesis sentence', !htmlClean.includes('안내문에 이전 가설 문장이 남아 있습니다'))
  assert('LbpWorkingHypothesisCard: clean case (counterexample) -- the plain "안내문에 넣기" button still renders', htmlClean.indexOf('안내문에 넣기') !== -1)

  // (iv) currentPatientInstruction omitted entirely (backwards-compatible
  // default) -- behaves exactly like the clean case, plain button only.
  const htmlOmitted = render(withSupport({ HIP: 'HIGHER' }), () => {})
  assert('LbpWorkingHypothesisCard: currentPatientInstruction omitted -- no "이미 안내문에 들어 있습니다" status', !htmlOmitted.includes('이미 안내문에 들어 있습니다'))
  assert('LbpWorkingHypothesisCard: currentPatientInstruction omitted -- no stale-hypothesis warning', !htmlOmitted.includes('안내문에 이전 가설 문장이 남아 있습니다'))
  assert('LbpWorkingHypothesisCard: currentPatientInstruction omitted -- the plain "안내문에 넣기" button still renders', htmlOmitted.indexOf('안내문에 넣기') !== -1)

  // (v) pure guard: appending an edited sentence, then the ORIGINAL, over
  // the edited text is what D-2 reported as "resurrection" -- pin that the
  // append function itself still exhibits this today (the card-level fix is
  // a UI cue, not a change to the append function, which stays additive-only
  // and clinician-owned per its own doc comment).
  const original = patientSentenceDraftKo(withSupport({ NEURAL: 'HIGHER' }))
  const edited = '오늘은 허리에서 다리로 이어지는 불편감과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다.'
  const resurrected = appendLbpHypothesisSentenceToPatientInstruction(edited, original)
  assert('appendLbpHypothesisSentenceToPatientInstruction (D-2 baseline): the function itself still appends the original after an edited version (unchanged by design -- the UI-level fix is the warning cue, not a function change)', resurrected === `${edited}\n${original}`)
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
 * Opus delta review D-5: the prior-visit hypothesis recap line in
 * RevisitWorkspace.tsx rendered the bare `summarizeLbpWorkingHypothesisKo`
 * string with no `이전` marker, unlike every sibling line in the same
 * "이전 방문 참고" block -- readable as TODAY's judgment. Fixed at the
 * render site only (the shared summarizer itself, and the EMR line it also
 * feeds, must keep the un-prefixed "임상 가설: " form). RevisitWorkspace.tsx
 * is not bundled/rendered by this spec (see doctor-workspace.spec.mjs's own
 * comment on why -- it is not wired into any esbuild bundle here), so this
 * is a source-scan structural check, matching every other RevisitWorkspace
 * assertion in this test suite's sibling specs.
 * ---------------------------------------------------------------------- */
{
  const rwSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/RevisitWorkspace.tsx', import.meta.url)), 'utf8')
  assert('D-5: RevisitWorkspace.tsx renders "<strong>이전 임상 가설</strong>" for the prior-visit hypothesis recap line', rwSrc.includes('<strong>이전 임상 가설</strong>'))
  assert(
    'D-5: the prior-visit hypothesis recap strips the shared summarizer\'s own "임상 가설: " prefix at the render site (replace(/^임상 가설: /, \'\'))',
    /priorHypothesisSummary\.replace\(\/\^임상 가설: \/, ''\)/.test(rwSrc),
  )

  // The shared summarizer itself must be UNCHANGED (the EMR line needs the
  // un-prefixed form) -- non-vacuous re-check of the same property already
  // pinned above, restated here next to the D-5 fix for traceability.
  const summaryForEmr = summarizeLbpWorkingHypothesisKo(withSupport({ NEURAL: 'HIGHER' }))
  assert('D-5: summarizeLbpWorkingHypothesisKo (shared with the EMR line) still returns the "임상 가설: " prefix unstripped', summaryForEmr === '임상 가설: 신경근 관여 가능성 높음')
}

/* ------------------------------------------------------------------------
 * §11.1/§11.7: patientCarePlanPreview.ts boundary guard -- Opus delta
 * review D-6. The original whole-file sha256 pin was semantically blind: a
 * PROVEN comment-only, zero-behaviour edit broke it, and its one obvious
 * remedy (re-pin the hash) would silently re-baseline the very boundary it
 * exists to protect without anyone re-reading the file. Replaced with
 * three guards that are behavioural/semantic instead of byte-level: an
 * exact import-list assertion (a new import is the only mechanism by which
 * hypothesis content could enter this module), the existing never-appears
 * content checks extended to the 5 easy labels + the fixed clause, and an
 * output-level property assertion (patient output = clinician text).
 * ---------------------------------------------------------------------- */
{
  const previewSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/patientCarePlanPreview.ts', import.meta.url)), 'utf8')

  // (1) Exact import-list assertion.
  const importPaths = new Set([...previewSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1]))
  assert(
    "patientCarePlanPreview.ts imports exactly {'./carePlan'} -- a new import here is the only mechanism by which hypothesis content could reach this module",
    importPaths.size === 1 && importPaths.has('./carePlan'),
  )

  // (2) Never-appears content checks (kept from before D-6, extended per
  // D-6's minimal fix to the 5 patient-facing easy labels and the fixed
  // disclaimer clause).
  assert('patientCarePlanPreview.ts source never imports the new lbpWorkingHypothesis module', !previewSrc.includes("from './lbpWorkingHypothesis'"))
  assert('patientCarePlanPreview.ts source never names any of the 5 hypothesis pattern ids', !LBP_HYPOTHESIS_PATTERN_IDS.some((id) => previewSrc.includes(id)))
  assert('patientCarePlanPreview.ts source never contains the literal string "임상 가설"', !previewSrc.includes('임상 가설'))
  const hypothesisEasyLabelsKo = ['허리 움직임', '다리로 뻗치는 증상', '오래 걷거나 서 있을 때 나타나는 다리 증상', '고관절', '골반 뒤쪽 관절']
  for (const label of hypothesisEasyLabelsKo) {
    assert(`patientCarePlanPreview.ts source never contains the easy-label literal "${label}"`, !previewSrc.includes(label))
  }
  assert('patientCarePlanPreview.ts source never contains the fixed disclaimer clause literal', !previewSrc.includes(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO))

  // (3) Output-level property assertion: build a PainCarePlan whose only
  // non-empty field is patientInstruction and confirm the hypothesis
  // sentence appears in the rendered patient output IF AND ONLY IF the
  // clinician's own text contains it -- i.e. pin the PROPERTY (patient
  // output = clinician text), not the file's bytes.
  const emptyCarePlanForPreview = {
    currentTreatmentGoal: '',
    rehabilitationGoal: '',
    homeActionPlan: '',
    activityPrecaution: '',
    patientInstruction: '',
    nextVisitCheckItem: '',
    recordedAt: null,
  }
  const hypothesisSentenceForPreview = patientSentenceDraftKo(withSupport({ NEURAL: 'HIGHER' }))

  const previewWithout = buildPainPatientCarePlanPreview({
    primaryConcern: '요통',
    carePlan: { ...emptyCarePlanForPreview, patientInstruction: '원장이 직접 쓴 안내문' },
  })
  assert('buildPainPatientCarePlanPreview: the hypothesis sentence is ABSENT from patient output when the clinician text does not contain it', !previewWithout.includes(hypothesisSentenceForPreview))

  const previewWith = buildPainPatientCarePlanPreview({
    primaryConcern: '요통',
    carePlan: { ...emptyCarePlanForPreview, patientInstruction: hypothesisSentenceForPreview },
  })
  assert(
    'buildPainPatientCarePlanPreview: the hypothesis sentence is PRESENT in patient output only because the clinician text contains it (patient output = clinician text, no separate hypothesis-aware path)',
    previewWith.includes(hypothesisSentenceForPreview),
  )
}

/* ------------------------------------------------------------------------
 * Opus delta review D-8: the previous "allowedImporters" block was a
 * tautology -- `!new Set([6 literals]).has('a 7th literal')` never opened a
 * single source file and could not fail for any state of the repository,
 * while its own comment claimed it verified "no src/ file outside this
 * module/its own consumers imports lbpWorkingHypothesis.ts". It was also
 * already factually wrong: PainWorkspace.tsx genuinely imports the module
 * and was missing. Replaced with a real source-tree scan.
 * ---------------------------------------------------------------------- */
{
  const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
  function listSourceFiles(dir) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = joinPath(dir, entry.name)
      if (entry.isDirectory()) out.push(...listSourceFiles(full))
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
  }
  // The complete, up-to-date set of src/ files allowed to import
  // lbpWorkingHypothesis.ts -- the workspace screens that wire the card in,
  // the card itself, the EMR/persistence/visit-state modules that carry the
  // field, and PainWorkspace.tsx (the read-model type consumer).
  const allowedImporters = new Set([
    'DoctorWorkspace.tsx',
    'RevisitWorkspace.tsx',
    'LbpWorkingHypothesisCard.tsx',
    'PainWorkspace.tsx',
    'emrPreview.ts',
    'persistence.ts',
    'visitWorkspace.ts',
  ])
  const actualImporters = new Set()
  for (const file of listSourceFiles(srcRoot)) {
    const fileSrc = readFileSync(file, 'utf8')
    if (/from '\.\/lbpWorkingHypothesis'/.test(fileSrc)) {
      actualImporters.add(file.split('/').pop())
    }
  }
  assert(
    'structural (D-8, real): the actual set of src/**/*.{ts,tsx} files importing lbpWorkingHypothesis.ts equals the allowed-importers list exactly (no unintended new importer, none stale/missing)',
    actualImporters.size === allowedImporters.size && [...actualImporters].every((f) => allowedImporters.has(f)),
  )
  assert('structural (D-8): patientCarePlanPreview.ts is not among the actual importers of lbpWorkingHypothesis.ts', !actualImporters.has('patientCarePlanPreview.ts'))
}

/* ------------------------------------------------------------------------
 * Opus delta review D-7: the mandatory-clause guarantee rested on a SINGLE
 * assertion (the hard-pinned exact NEURAL sentence); every other
 * clause-presence check imports `LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO`
 * FROM the module under test, so rewording the constant carries those
 * assertions along with it (self-referential, proven to still pass 159/160
 * assertions after the clause was reworded to drop "확정 진단이 아니라").
 * This literal is independent of the module and is that failure point made
 * explicit -- the parenthetical in its name is deliberate, to stop a future
 * session from treating a failure here as "just re-pin the string".
 * ---------------------------------------------------------------------- */
{
  assert(
    'the mandatory clause literal is exactly the PO-approved wording (do NOT update this literal without a DECISIONS.md entry)',
    LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO === '확정 진단이 아니라 경과를 보며 다시 판단합니다.',
  )
}

/* ------------------------------------------------------------------------
 * Opus delta review D-9: the mutant-(e) structural "must be inside an
 * explicit click handler, never an effect" guard existed only for
 * RevisitWorkspace.tsx. DoctorWorkspace.tsx:683 -- the INITIAL-VISIT
 * insertion path, the one most patients actually go through -- had no
 * equivalent guard in any spec. Mirrored here.
 * ---------------------------------------------------------------------- */
{
  const dwSrc = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url)), 'utf8')
  const callSites = [...dwSrc.matchAll(/appendLbpHypothesisSentenceToPatientInstruction\(/g)]
  assert('D-9 guard: appendLbpHypothesisSentenceToPatientInstruction is called exactly once in DoctorWorkspace.tsx (the one dedicated button)', callSites.length === 1)
  const idx = callSites[0].index
  const before300 = dwSrc.slice(Math.max(0, idx - 300), idx)
  assert('D-9 guard: the 300 chars before the call site contain "onInsertPatientSentence={" (it is inside that prop closure, not a bare effect)', /onInsertPatientSentence=\{/.test(before300))
  const insideAnyUseEffect = useEffectSpans(dwSrc).some(([start, end]) => idx > start && idx < end)
  assert('D-9 guard: the call site does NOT appear inside any useEffect(...) in DoctorWorkspace.tsx (would mean auto-insertion on render/mount rather than an explicit click)', !insideAnyUseEffect)
}

/* ------------------------------------------------------------------------
 * Batch 2.6 (E-2), interactive: with the "미판단" chip gone, clearing a
 * pattern back to UNJUDGED must still work by re-clicking the already-
 * active chip (LbpWorkingHypothesisCard.tsx's onClick already resolves
 * `activeValue === opt ? 'UNJUDGED' : opt`, unchanged by this batch --
 * this pins that the removal of the UNJUDGED button did not also remove
 * the only remaining path back to it). Uses react-test-renderer (already a
 * devDependency, same tool tests/doctor-reset-key.spec.mjs uses) because
 * this needs a real click to fire, not just static HTML.
 * ---------------------------------------------------------------------- */
{
  let current = withSupport({ HIP: 'CONSIDER' })
  const onChange = (next) => {
    current = next
  }

  let renderer
  act(() => {
    renderer = TestRenderer.create(React.createElement(LbpWorkingHypothesisCard, { value: current, onChange }))
  })

  const hipGroup = renderer.root.find(
    (node) => node.props && node.props['aria-label'] === `${LBP_HYPOTHESIS_PATTERN_LABEL_KO.HIP} 선택`,
  )
  const considerButton = hipGroup.findAll(
    (node) => node.type === 'button' && node.props['aria-pressed'] === true,
  )[0]
  assert('interactive: the active (CONSIDER) chip in the HIP group is the one rendered as pressed before the re-click', considerButton !== undefined)

  act(() => {
    considerButton.props.onClick()
  })
  assert('interactive: re-clicking the active chip resolves HIP back to UNJUDGED (the field itself, not a button, carries the cleared state)', current.supports.HIP === 'UNJUDGED')
  assert('interactive: clearing HIP leaves every other pattern untouched', LBP_HYPOTHESIS_PATTERN_IDS.filter((id) => id !== 'HIP').every((id) => current.supports[id] === 'UNJUDGED'))

  // Counterexample: clicking a DIFFERENT (non-active) chip in the same
  // group does not clear -- it sets that chip's own value instead. Proves
  // the assertion above is exercising the deselect branch, not any click.
  act(() => {
    renderer.update(React.createElement(LbpWorkingHypothesisCard, { value: withSupport({ HIP: 'CONSIDER' }), onChange }))
  })
  const hipGroup2 = renderer.root.find(
    (node) => node.props && node.props['aria-label'] === `${LBP_HYPOTHESIS_PATTERN_LABEL_KO.HIP} 선택`,
  )
  const lowerButton = hipGroup2.findAll((node) => node.type === 'button').find((b) => b.children.join('') === LBP_HYPOTHESIS_SUPPORT_LABEL_KO.LOWER)
  act(() => {
    lowerButton.props.onClick()
  })
  assert('interactive counterexample: clicking a DIFFERENT chip (LOWER) while CONSIDER is active sets LOWER, not UNJUDGED', current.supports.HIP === 'LOWER')
}

console.log(`\n${passCount} LBP working hypothesis assertions passed.`)
