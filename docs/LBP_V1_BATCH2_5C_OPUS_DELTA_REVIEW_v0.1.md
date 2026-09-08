# Opus Delta Review — LBP v1 Batch 2.5c (Working Hypothesis 최소 형태)

- Repo: `/home/user/Samindang`, branch `claude/clinical-os-lbp-architecture-xym6po`
- HEAD reviewed: `04d06cd` (delta vs `dfa8f05`), working tree clean before and after
- Reviewer: Opus (Tech Lead / clinical authority per `CLAUDE.md` Team Roles)
- Scope: delta-only. Mutants were built in a scratch copy under `/tmp` and deleted; no repository file was modified.

## Disposition: **FAIL** (fix-then-merge — architecture sound, patient-facing text not shippable as written)

The boundary design is correct and, structurally, holds: I could not find any path by which a
hypothesis reaches patient output other than a clinician click. Verification commands all pass.
**But this is the batch where clinical text first reaches the patient, and three of the findings
below are in exactly that surface**: one of the five patient sentences is ungrammatical Korean
(D-1), a second click after the clinician edits the sentence resurrects the original text alongside
the edit (D-2), and on the revisit screen the whole card is not LBP-gated, so a neck/knee revisit
patient can have a *lumbar* sentence inserted into their 안내문 (D-4). None of these are design
errors; all are small, local fixes. I would not ship 04d06cd to a live clinic, and I would merge
it after D-1..D-4.

---

## A. The patient-facing sentence — clinician judgment

I ran `patientSentenceDraftKo` for each of the five patterns. Verbatim output:

| pattern | generated sentence |
|---|---|
| `LUMBAR_MOVEMENT` | 오늘은 **허리 움직임**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. |
| `NEURAL` | 오늘은 **다리로 가는 신경**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. |
| `WALK_STAND_LEG` | 오늘은 **오래 걷거나 서 있을 때 나타나는 다리**와 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. |
| `HIP` | 오늘은 **고관절**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. |
| `SIJ` | 오늘은 **골반 뒤쪽 관절**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. |

**Frame verdict (applies to all five): good.** The template names *no disease entity* — no
디스크/추간판탈출증/협착증/좌골신경통/관절염 anywhere. It reports a *management stance*
("…으로 **보고** 치료했습니다" = "regarded as, and treated on that basis"), not a finding
("…입니다") and not an act of diagnosis ("…진단했습니다"). 보고 is the right verb; I would not
change it. Because no X is named, the literal form "the doctor said I have X" has no X to quote.
That is the single most important property of this design and it is met.

**Positioning of the mandatory clause: correct, and structurally inseparable.** The clause is the
second sentence of the same string, and `appendLbpHypothesisSentenceToPatientInstruction`
(`lbpWorkingHypothesis.ts:192`) inserts the two sentences as one atomic unit — the insertion
mechanism cannot deliver the hypothesis half without the disclaimer half. It is the last thing on
the line (`tests/lbp-working-hypothesis.spec.mjs:186` pins `endsWith`), immediately adjacent, same
paragraph, and it renders inside `안내사항:` in `buildPainPatientCarePlanPreview`. This is where a
patient will actually read it. Sufficient as *draft-time* mitigation — see the caveat in "No-action
observations" about output-time.

Per pattern:

1. **`LUMBAR_MOVEMENT` — ships as written.** Non-specific mechanical framing, no structure named,
   no lay disease association. Lowest risk of the five.

2. **`NEURAL` — defensible, but the one that needs the PO's own sign-off.** 쉬운 말 = "다리로 가는
   신경". Judged strictly: it renders 신경근 관여 *without* overclaiming radiculopathy — it says pain
   *related to* the nerve that runs to the leg; it does not say the nerve is compressed, pinched,
   damaged, or herniated (눌렸다/디스크 appear nowhere), and it does not localise to a root level.
   As **written text** it is medically defensible and I would defend it.
   The residual risk is not in the text, it is in the **paraphrase**: in Korean lay usage
   "다리로 가는 신경 + 통증" is very likely to be re-told as "신경이 눌렸대요" or "디스크래요", and
   that paraphrase is what gets quoted at the next clinic. The disclaimer sentence only protects
   against this to the extent the patient reports it too. This is the only one of the five whose
   plain-language rendering names an anatomical structure carrying a strong lay disease association,
   so it is a wording call that belongs to the Product Owner, not to me → **CLINICAL DECISION
   REQUIRED #1**. Note in mitigation: the clinician only reaches this sentence by having *already*
   marked NEURAL as HIGHER themselves, so the sentence records the clinician's own judgment rather
   than manufacturing one.

3. **`WALK_STAND_LEG` — must not ship as written.** Not for overclaiming (it correctly avoids naming
   neurogenic claudication / stenosis — the safe direction) but because it is **ungrammatical
   Korean**. `오래 걷거나 서 있을 때 나타나는 다리` attaches the relative clause 나타나는 to 다리:
   "the leg that appears when you walk or stand for a long time." A leg does not 나타나다. The head
   noun (증상 / 저림 / 불편감) is missing. The full phrase reads "…나타나는 다리와 관련된 통증",
   which a patient will stumble over and may simply not parse. In a patient-facing string this is a
   comprehension failure. See D-1 (`lbpWorkingHypothesis.ts:48`, particle at `:57`).

4. **`HIP` — ships, but it is not 쉬운 말.** 고관절 is a medical term. §11.3 requires 쉬운 말
   표현, and here the "easy label" is the clinician label (`고관절 기여`) minus one word — it does
   no plain-language work at all, and many patients confuse 고관절 with 골반. Clinical risk is low
   (no disease named, no overclaim), so this is a quality recommendation, not a blocker.
   Note that `tests/…spec.mjs`'s "never names the internal pattern label" assertion passes here only
   on a technicality (`'고관절 기여'` is absent but `'고관절'` is present). Suggested:
   `'엉덩관절(고관절)'`.

5. **`SIJ` — ships as written, best of the five.** "골반 뒤쪽 관절" is an accurate and genuinely
   lay-accessible rendering of 천장관절; names no disease; cannot be quoted as a diagnosis.

**Summary answer to "should any sentence not ship as written":** yes — `WALK_STAND_LEG` (grammar,
D-1). `NEURAL` should ship only with PO sign-off (CDR-1). `HIP` should be improved but is not a
blocker.

## B. The boundary holds — **PASS** (with a test-form recommendation)

- `git diff dfa8f05..04d06cd -- src/doctor/workspace/patientCarePlanPreview.ts` → **0 lines**. Confirmed.
- No new import path into it. The file imports only `./carePlan` (`patientCarePlanPreview.ts:20`);
  nothing in the batch adds an import there, and nothing it depends on references the hypothesis.
- **Structural proof that the only path is an explicit click.** `appendLbpHypothesisSentenceToPatientInstruction`
  has exactly two call sites in `src/`: `DoctorWorkspace.tsx:683` and `RevisitWorkspace.tsx:743`.
  Both sit *inside* the `onInsertPatientSentence={(sentence) => …}` prop closure. That prop is
  invoked in exactly one place in the whole codebase — `LbpWorkingHypothesisCard.tsx:112`, the
  `onClick` of the "안내문에 넣기" button — and the card contains **no `useEffect`, no `useMemo`
  side effect, and no default/auto-invocation** (whole file read; it is a pure render + two
  callbacks). Therefore: no effect, no auto-fill, no default, no seeding.
- **Re-render / state-restore cannot re-insert.** `emptyWorkspaceState()` (`persistence.ts:258`) and
  `emptyVisitWorkspaceState()` (`visitWorkspace.ts:96`) seed only `emptyLbpWorkingHypothesis()`;
  neither touches `patientInstruction`. On reload, `deserializeWorkspaceState` restores
  `painCarePlan.patientInstruction` as already-authored clinician text and restores the hypothesis
  independently — the two are never re-joined. Grepping the revisit load effect for the hypothesis
  returns nothing.
- **`patientCarePlanPreview.ts` is structurally incapable of learning about the hypothesis**: it
  receives only `{ primaryConcern, carePlan }` and renders `carePlan.patientInstruction` as
  `안내사항:`. Correct — the sentence reaches the patient *as clinician-authored care-plan text*,
  which is precisely what the file's header contract permits.

**Judgment on the sha256 pin (`tests/…spec.mjs:494-497`).** As a *boundary* protection it is sound
in one respect and unsound in another, and I recommend changing its form.

- Sound: it is total. It catches any byte change, including one the author did not anticipate, which
  is literally what §11.6 asked for ("zero-diff 단언(소스 검사)").
- Unsound: it is **semantically blind and self-defeating**. I mutated `patientCarePlanPreview.ts`
  with a *comment-only, zero-behaviour* edit (appending `// cosmetic comment` after `const CRLF`)
  and the assertion failed. That is a false failure. The failure message ("must not touch this file
  at all") gives a future session exactly one obvious remedy — recompute the hash and paste it in —
  which is a mechanical edit that silently re-baselines the very boundary the assertion exists to
  protect, and does so without anyone re-reading the file. A typo fix, a lint rule, or a Prettier
  version bump will trigger it. The realistic failure mode is not "someone breaks the boundary and
  is caught"; it is "someone fixes a comment, re-pins the hash out of annoyance, and the guard is
  now worthless" — or deletes it outright, which `CLAUDE.md`'s "failing test 삭제로 문제 해결하지
  않기" forbids but a mechanical re-pin does not even feel like violating.

  **Recommended better form (D-6):** keep the pin but make it *behavioural and semantic*, so it
  fails on what actually matters and stays quiet on cosmetics:
  1. Replace the sha256 of the whole file with an assertion on the file's **import list**:
     parse out every `from '...'` and assert the set equals exactly `{'./carePlan'}`. A new import
     is the only mechanism by which hypothesis content can enter this module.
  2. Keep the three existing content assertions (`:498-500` — no `lbpWorkingHypothesis` import, no
     pattern id, no `임상 가설`) and add the 5 easy-labels and the fixed clause to the
     never-appears list.
  3. Add an **output-level** assertion: build a `PainCarePlan` whose every field except
     `patientInstruction` is empty, run `buildPainPatientCarePlanPreview`, and assert the output
     contains the hypothesis sentence **only** when the clinician text itself contains it —
     i.e. pin the property (patient output = clinician text) rather than the bytes.
  This is strictly stronger against the real threat and produces zero false failures.

## C. Insertion behavior — **FAIL** (three findings)

Tested directly against the real bundled module. Results:

| behaviour | result |
|---|---|
| explicit click only | **PASS** — see §B; two call sites, both in `onInsertPatientSentence` |
| insert into empty field | **PASS** — returns exactly the sentence |
| insert after existing text | **PASS** — `기존 안내문 내용\n오늘은 …` |
| whitespace-only existing field | **PASS** — treated as empty, no leading blank line |
| idempotent (same sentence twice) | **PASS** — `lbpWorkingHypothesis.ts:194` `includes` guard; no duplicate |
| additive-only, never overwrites/reorders | **PASS** — `:195` only ever concatenates; clinician text preserved verbatim and in position |
| **second click after clinician edits the inserted text** | **FAIL** → D-2 |
| **chips changed after insertion (stale text)** | **FAIL** → D-3 |

**D-2 evidence (the original is resurrected).** The idempotence guard is
`existingPatientInstruction.includes(sentence)` — an *exact-substring* test. Once the clinician
edits the inserted sentence, the exact original is no longer a substring, so a second click appends
it back. Reproduced:

```
before (clinician's edited version):
  오늘은 허리에서 다리로 이어지는 불편감과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 …
after a second "안내문에 넣기" click:
  오늘은 허리에서 다리로 이어지는 불편감과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 …
  오늘은 다리로 가는 신경과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 …
```

The patient now receives both the clinician's deliberately-softened wording **and** the wording the
clinician deliberately rejected. Nothing in the UI signals that the sentence was already inserted —
the button stays visible and enabled forever while exactly one pattern is HIGHER, and the card is
never told what `patientInstruction` currently contains. The existing test at `:249` asserts only
`startsWith('원장이 수정한 문장')`, i.e. "not overwritten" — it does not test for resurrection, so
this passes today's suite.

**D-3 evidence (stale text after chip change, and contradictory double insertion).** The hypothesis
chips and `patientInstruction` are fully decoupled after insertion. Two consequences:

- *Silent staleness (no click).* Clinician marks NEURAL HIGHER → inserts → re-examines → moves NEURAL
  to CONSIDER and HIP to HIGHER. `patientInstruction` still contains the neural sentence. The card
  now shows a *different* draft. There is no cue anywhere that the text already in the 안내문
  contradicts the current hypothesis, and the patient receives the abandoned one.
- *Contradictory double insertion (click).* If the clinician clicks again with the new draft, the
  `includes` guard does not fire (different sentence), so both go out:
  ```
  오늘은 다리로 가는 신경과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 …
  오늘은 고관절과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 …
  ```

**Is it acceptable, or does it need a cue?** It needs a cue. The general principle "the clinician
owns `patientInstruction`, so stale text is the clinician's responsibility" is right for text the
clinician *typed* — they can see what they wrote. It is not right for text the *system* composed and
placed there on their behalf: the clinician's mental model after a chip change is "the hypothesis is
now HIP", and nothing on screen contradicts that. The system created the divergence, so the system
should surface it. D-2 and D-3 share one minimal fix (see below): the card must be told the current
`patientInstruction` and must distinguish three states.

## D. Draft gating — **PASS**

I re-ran `patientSentenceDraftKo` over **all 32 subsets** of HIGHER assignments:

- 0 HIGHER → `null` (1/1 case)
- exactly 1 HIGHER → draft (5/5 cases, one per pattern)
- 2 HIGHER → `null` (all 10 combinations: LM+N, LM+WSL, N+WSL, LM+HIP, N+HIP, WSL+HIP, LM+SIJ,
  N+SIJ, WSL+SIJ, HIP+SIJ)
- 3 HIGHER → `null` (all 10), 4 HIGHER → `null` (all 5), 5 HIGHER → `null` (1)

CONSIDER / LOWER / UNJUDGED never produce a draft: I enumerated all 31 non-empty subsets for each of
the three values (93 cases) — every one returned `null`. Mixed case confirmed correct: exactly one
HIGHER plus any number of CONSIDER/LOWER siblings still drafts, and drafts only the HIGHER pattern
(`{NEURAL:HIGHER, HIP:CONSIDER, SIJ:LOWER, LUMBAR_MOVEMENT:LOWER}` → the neural sentence only).
Gate implementation: `lbpWorkingHypothesis.ts:169-170`, `higher.length !== 1 → null`. Correct and
unambiguous. The card honours it (`LbpWorkingHypothesisCard.tsx:91,108` — no draft box, hence no
button, when `draft === null`).

## E. No calculation, no diagnosis — **PASS**

- No score / threshold / ranking / promotion anywhere in `lbpWorkingHypothesis.ts`. `supports` is
  written only by `setSupport` (`LbpWorkingHypothesisCard.tsx:87-89`) from the clicked chip's own
  value, and by `applyLbpWorkingHypothesisCarryForward` from a prior visit's stored value. Nothing
  reads questionnaire answers, exam results, or any other `WorkspaceState` field to derive a level.
- Iteration order is the fixed declaration order (`:27-34`), explicitly never re-sorted by support
  level — so no implicit ranking leaks through the summary line either.
- No diagnosis name in any of: the 5 clinician labels, the 5 easy labels, the 4 support labels, the
  summary line, or the patient sentence.
- **Coupling grep clean.** `grep -n "lbpExerciseRecommendation|lbpExerciseEligibility|safety_flags|ExerciseEligib"`
  over `lbpWorkingHypothesis.ts` + `LbpWorkingHypothesisCard.tsx` returns exactly **one** hit:
  `lbpWorkingHypothesis.ts:186`, inside a doc comment explaining why the append helper is
  *deliberately duplicated rather than imported* from `lbpExerciseRecommendation.ts`. That is a
  comment, not a dependency. Reverse direction (`grep "WorkingHypothesis"` over
  `lbpExercise*.ts`, `rehabSuggestion.ts`) → **no hits**. The hypothesis gates nothing: it is not an
  input to eligibility, recommendation, safety flags, or any conditional render other than its own
  card and its own EMR line.
- Deliberate non-import of `appendLbpAdoptionText` is the right call and I endorse the reasoning at
  `:186-190`.

## F. Summarize line + EMR — **PASS**

- `summarizeLbpWorkingHypothesisKo` (`lbpWorkingHypothesis.ts:142-148`) filters
  `!== 'UNJUDGED'` *before* mapping, so an UNJUDGED pattern is omitted entirely — it can never be
  rendered as "미판단". Verified on a partial value (`{LUMBAR_MOVEMENT: CONSIDER, NEURAL: HIGHER}`):
  the other three labels and the literal string "미판단" are both absent.
- All-UNJUDGED → `null` → **no line at all**. Rendered EMR, all-UNJUDGED:
  ```
  주호소: 요통
  진찰 소견:
  Assessment: 요추 신전 부하 시 우측 하지 방사 증가
  ```
  (no `임상 가설:` line, and no empty-labelled one either).
- Placement matches §11.5 exactly — immediately **before** `Assessment`, after `허리 움직임 반응`:
  ```
  주호소: 요통
  진찰 소견:
  임상 가설: 허리 움직임 관련 고려 · 신경근 관여 가능성 높음 · 고관절 기여 가능성 낮음
  Assessment: 요추 신전 부하 시 우측 하지 방사 증가
  ```
- The free-text Assessment line is byte-identical to before
  (`emrPreview.ts:130` unchanged; `input.finalAssessment.finalWorkingAssessment` still rendered by
  the same label path). The `EmlLine`/`formatEmrLine` refactor (`:44-60`) preserves the previous
  behaviour exactly for label lines (`value.trim() ? label: value : label:`); `test:emrSummary` and
  `test:doctor-workspace` both pass unchanged.
- **Can the EMR text read as a confirmed diagnosis?** No. The line is self-labelled "임상 가설"
  (hypothesis), each entry carries an explicit uncertainty qualifier (가능성 높음 / 고려 / 가능성
  낮음), no disease name appears, and it sits *above* the clinician's own free-text Assessment rather
  than replacing or competing with it. The `raw` escape hatch is used only here and cannot
  double-prefix (asserted at `tests/…spec.mjs`).

## G. Persistence / revisit — **PASS on data, one cue defect on display**

- Additive on both states: `WorkspaceState.lbpWorkingHypothesis` (`persistence.ts:226-236`,
  default at `:261`, deserialize at `:333`) and `VisitWorkspaceState.lbpWorkingHypothesis`
  (`visitWorkspace.ts:78-86`, default `:99`, deserialize `:125`).
- **Schema versions unchanged**: `WORKSPACE_STATE_SCHEMA_VERSION = '1.1.0'` (`persistence.ts:171`)
  and `VISIT_WORKSPACE_SCHEMA_VERSION = '1.0.0'` (`visitWorkspace.ts:61`) — neither line is in the
  diff. Correct for a purely additive field with a safe default.
- Legacy records (no field) → `emptyLbpWorkingHypothesis()` on both paths; sibling fields untouched.
- Corrupted / unknown support values → `UNJUDGED`, **never a fabricated HIGHER**. Per-pattern
  independent validation (`lbpWorkingHypothesis.ts:127-130`) means one corrupt sibling cannot blank
  the other four, and a wrong-typed or array `supports` container degrades every pattern rather than
  throwing. I mutated the guard away (`supports[id] = (v ?? 'UNJUDGED')`) and the suite failed
  correctly.
- `visitWorkspaceStateEquals` (`visitWorkspace.ts:131-135`) is a `JSON.stringify` comparison over
  everything but `updated_at`, so the new field is detected automatically — a hypothesis change
  correctly marks the visit dirty and triggers autosave.
- **Carry-forward is explicit-click only.** `applyLbpWorkingHypothesisCarryForward` is called exactly
  once in `src/` (`RevisitWorkspace.tsx:722`), inside the `onClick` of the dedicated
  "이전 가설 이어받기" button (`:715-733`). It is double-guarded in the *function itself*
  (`lbpWorkingHypothesis.ts:221`: null prior → no-op; blank prior → no-op; non-blank today → no-op),
  so the property belongs to the operation, not to the call site. `revisitCarryForward.ts` is
  **zero-diff** and contains no reference to the hypothesis (verified by `git diff` and by grep), so
  none of the three pre-existing "이전 내용 이어가기" buttons can pick it up as a side effect. I
  moved the call site out of `onClick` in a scratch mutant and the structural guard failed correctly.
- **Prior-visit hypothesis is read-only** — rendered as a bare `<p>` at `RevisitWorkspace.tsx:611-613`
  inside the `이전 방문 참고` recap block, with no control bound to it.
- **But it can be mistaken for today's → D-5.** Every sibling line in that block self-identifies as
  prior: `<strong>이전 최종 판단</strong>`, `<strong>이전 진찰/관찰 소견</strong>`,
  `<strong>이전 관리 계획</strong>`, and the directly-adjacent quick-check summary, whose own
  helper returns the string `"이전 간단 체크: …"` (`revisitQuickCheck.ts:375`). The new line is the
  only one with **no `이전` marker and no bold label** — it renders the string
  `"임상 가설: 신경근 관여 가능성 높음"`, which is *character-for-character the same wording as
  today's EMR line*. A clinician scanning the recap can read it as today's judgment. Small, but this
  is a clinical-record ambiguity in the batch whose whole purpose is separating hypothesis from
  confirmed fact.

## H. Tests non-vacuous — mostly strong, two real weaknesses

I recreated all five §11.6 mutants plus two of my own in a scratch copy and ran the real spec
against each. **All seven were caught**, each by the intended assertion:

| # | mutant | caught by |
|---|---|---|
| (a) | mandatory clause removed from the sentence | `patientSentenceDraftKo (LUMBAR_MOVEMENT): draft contains the mandatory clause verbatim` |
| (b) | draft gate weakened `!== 1` → `< 1` (2 HIGHER drafts) | `patientSentenceDraftKo: 2 HIGHER patterns returns null` |
| (c) | summarize includes UNJUDGED as "미판단" | `summarizeLbpWorkingHypothesisKo: all UNJUDGED returns null` |
| (d) | idempotence guard removed (duplicate insertion) | `…: inserting the same sentence twice does not duplicate it` |
| (e) | carry-forward call site moved out of `onClick` | `mutant (e) guard: the call site is immediately inside an onClick={...} handler` |
| (f) *mine* | support value passed through unvalidated (`supports[id] = v ?? 'UNJUDGED'`) | `sanitizeLbpWorkingHypothesis: unknown string degrades to UNJUDGED` |
| (g) *mine* | EMR emits `임상 가설:` when all UNJUDGED | `…: no "임상 가설" line when every pattern is UNJUDGED` |

Baseline: 160 assertions, all passing.

**Specific answer to "would the mandatory-clause test still fail if the clause were merely reworded
rather than removed?" — barely, and by a single assertion. This is the suite's most important
weakness.**

The clause-presence assertions at `:185` and `:186` test
`draft.includes(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO)` — where the constant is **imported
from the module under test**. They are therefore *self-referential*: rewrite the constant and the
sentence follows it, so `includes` still passes. The only thing standing between a reworded
disclaimer and a green suite is one hard-pinned literal at `:206-209` (the exact NEURAL sentence).

I proved this. I reworded the constant to drop the crucial words —
`'확정 진단이 아니라 경과를 보며 다시 판단합니다.'` → `'경과를 보며 다시 판단합니다.'`, i.e. the
sentence no longer denies being a diagnosis at all — and relaxed **only** that one verbatim
assertion. **The remaining 159 assertions all passed.** A future session that softens the disclaimer
and "fixes the one failing exact-string test" (a very natural-looking fix) removes the entire
protection with the suite still green. → D-7.

**Vacuous assertion found (`tests/…spec.mjs:507-515`).** The `allowedImporters` block is a tautology:
it builds a `Set` of six string literals and asserts that a seventh literal is not in it. It never
opens a single source file. It cannot fail for any state of the repository. Worse, its comment
(`:502-505`) claims it verifies "No src/ file outside this module/its own consumers imports
lbpWorkingHypothesis.ts" — it does nothing of the kind, so a future reader will believe a guard
exists where none does. The list is also already factually wrong: `PainWorkspace.tsx:65` genuinely
imports `LbpWorkingHypothesis` and is absent from it. → D-8.

Everything else I checked is non-vacuous and several assertions are notably well-built: the
zero-pressed-chip check is paired with explicit one-pressed and two-pressed counterexamples; the
button-absence checks are paired with a presence counterexample and a slice-direction ordering check;
the summarize test enumerates the three omitted labels rather than only checking the null case; the
mutant (a)/(c)/(d) reproduction blocks demonstrate their own failure in-place. The
`no Latin characters` and `never names the internal pattern label` per-pattern assertions are a good
idea (the latter is weak for HIP only, see A-4).

**Coverage gap (not vacuity):** the structural "must be inside `onClick`" guard exists only for
`RevisitWorkspace.tsx`. `DoctorWorkspace.tsx:683` — the *initial-visit* insertion path, the one most
patients will actually go through — has no equivalent guard in any spec. I verified it by reading;
nothing pins it. → D-9.

## I. Scope / invariants — **PASS, except the LBP gate (D-4)**

- **FROZEN / server / tablet zero-diff**: `git diff --stat dfa8f05..04d06cd -- server/ src/spec/ "tablet core/" index.html src/App.tsx` → **0 lines**.
- **Forbidden files zero-diff**, each confirmed individually: `provenance.ts` 0, `examSuggestion.ts` 0,
  `revisitQuickCheck.ts` 0, `lbpExerciseEligibility.ts` 0, `patientCarePlanPreview.ts` 0
  (and `revisitCarryForward.ts` 0).
- **`package.json`**: exactly two changes — the new `test:lbp-working-hypothesis` script and its
  insertion into `test:all` (after `test:revisit-quick-check`). Both are the declared minimal
  test-bundle additions. No dependency change.
- **`.gitignore`**: exactly the five generated esbuild bundles for the new spec, under a labelled
  comment matching the existing convention. No stray bundle is tracked.
- **Korean-first**: every user-visible string — card title, hint, 5 pattern labels, 4 support labels,
  button, draft, EMR line, carry-forward button and its title — is Korean. No English leaks into any
  clinician- or patient-facing surface.
- **No new tablet question**: `src/spec/` zero-diff confirms it.
- **Chip convention followed**: `aria-pressed` on every chip (`LbpWorkingHypothesisCard.tsx:59`),
  re-click clears to UNJUDGED (`:61`, `activeValue === opt ? 'UNJUDGED' : opt`), and `UNJUDGED`
  itself renders as a real 4th chip that is never `aria-pressed="true"` (`:54`) so the untouched
  default shows zero pressed chips — matching `RevisitQuickCheckCard`. Verified by render test
  (0 pressed by default, 1 after one pick, 2 after two).
- **44px touch target unaffected**: the new CSS (`workspace.css:1846-1876`) adds only
  `.workspace__hypothesis__group` / `…__patientDraft` / `…__patientDraftText`; it does not touch
  `.workspace__followUpChip` (`:843-853`, pre-existing `min-height: 36px` on a desktop clinician
  screen), so nothing about existing sizing changes.
- **Placement §11.4**: the card renders immediately before `PainFinalAssessmentCard` on both screens
  (`DoctorWorkspace.tsx:674-690` → `:691`; `RevisitWorkspace.tsx:735` → `:750`). Correct canonical
  route order.
- **Scope violation found — the revisit card is not LBP-gated.** On the initial-visit screen the card
  is correctly wrapped in `{isLbpRecord && …}` (`DoctorWorkspace.tsx:674`, from
  `payload.responses.safety_flags.lbp != null` at `:473`). On the revisit screen there is **no gate
  at all**: the carry-forward button (`RevisitWorkspace.tsx:714-733`) and the card (`:735-748`) are
  unconditional top-level siblings in the returned JSX. → D-4.

## J. Verification commands

All run at `04d06cd`, working tree clean:

| command | result |
|---|---|
| `npx tsc -b` | **PASS** (exit 0, no output) |
| `npm run test:lbp-working-hypothesis` | **PASS** — 160 assertions |
| `npm run test:workspace-round3` | **PASS** — 179 assertions |
| `npm run test:doctor-workspace` | **PASS** — 240 assertions |
| `npm run test:emrSummary` | **PASS** — 14 assertions, 0 failed |
| `npm run test:doctor-reset-key` | **PASS** — 11 assertions |
| `npm run test:lbp-exercise-recommendation` | **PASS** — 23 tests |

---

## Concrete defects

### D-1 — `WALK_STAND_LEG` patient sentence is ungrammatical Korean (patient-facing) — **blocking**
- **Where:** `src/doctor/workspace/lbpWorkingHypothesis.ts:48` (easy label), `:57` (particle).
- **Problem:** `'오래 걷거나 서 있을 때 나타나는 다리'` attaches 나타나는 to 다리 — "the leg that
  appears when walking/standing long". The head noun is missing; a leg cannot 나타나다. Full output:
  "오늘은 오래 걷거나 서 있을 때 나타나는 다리와 관련된 통증으로 보고 치료했습니다." A patient
  cannot cleanly parse this, and it is text they take home.
- **Minimal fix:** `:48` → `'오래 걷거나 서 있을 때 나타나는 다리 증상'`; `:57` → `'과'`
  (증상 has a 받침, so the particle must change). Result:
  "오늘은 오래 걷거나 서 있을 때 나타나는 다리 증상과 관련된 통증으로 보고 치료했습니다.
  확정 진단이 아니라 경과를 보며 다시 판단합니다." The final wording is patient-facing and should
  carry PO sign-off (CDR-2).
- **Mechanical re-check:** extend `tests/…spec.mjs` to assert the **exact full sentence for all five
  patterns** (today only NEURAL is pinned, `:206-209`) against hard-coded literals — not against the
  module's own constants. Then re-run `npm run test:lbp-working-hypothesis`.

### D-2 — a second click resurrects the original sentence after the clinician edits it — **blocking**
- **Where:** `src/doctor/workspace/lbpWorkingHypothesis.ts:194`; button
  `src/doctor/workspace/LbpWorkingHypothesisCard.tsx:112`.
- **Problem:** the idempotence guard is exact-substring. After the clinician edits the inserted
  sentence, a second click appends the *original* alongside the edit, so the patient receives both
  the deliberately-softened wording and the wording the clinician rejected. The button is always
  visible/enabled and the card is never told what `patientInstruction` contains, so nothing warns.
- **Minimal fix (shared with D-3):** pass the current instruction into the card —
  `<LbpWorkingHypothesisCard … currentPatientInstruction={s.painCarePlan.patientInstruction} />` at
  `DoctorWorkspace.tsx:675` and `RevisitWorkspace.tsx:736` — and in the card compute three states
  from it:
  1. current draft already present verbatim → replace the button with static text "이미 안내문에
     들어 있습니다" (no button);
  2. the instruction contains *some* generated hypothesis sentence but not this one (detect by the
     fixed clause `LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO`, which every generated sentence
     ends with) → keep the button but render a warning line above it: "안내문에 이전 가설 문장이
     남아 있습니다. 직접 확인·수정하세요." (never auto-edit — the field stays clinician-owned);
  3. otherwise → today's plain button.
- **Mechanical re-check:** new render assertions — (i) button absent when the draft is already
  present; (ii) warning string present when the instruction contains the fixed clause but not the
  current draft; (iii) neither present in the clean case (non-vacuous counterexample). Plus a pure
  assertion that `append(edited, original) === edited` under whatever guard is chosen, if the guard
  is moved into the function. `npm run test:lbp-working-hypothesis`.

### D-3 — stale hypothesis text stays in `patientInstruction` with no cue after a chip change — **blocking**
- **Where:** same call sites; the chips and `patientInstruction` are decoupled after insertion.
- **Problem:** clinician inserts the NEURAL sentence, then re-examines and moves HIGHER to HIP. The
  neural sentence is still in the 안내문 and goes to the patient; the card silently shows a different
  draft. If they click again, both contradictory sentences are delivered. The system composed the
  divergence, so the system must surface it.
- **Minimal fix:** state (2) of D-2's fix covers exactly this. Warn, never auto-delete.
- **Mechanical re-check:** as D-2 (ii).

### D-4 — the revisit hypothesis card is not LBP-gated; non-LBP patients can receive a lumbar sentence — **blocking**
- **Where:** `src/doctor/workspace/RevisitWorkspace.tsx:714-733` (carry-forward button) and
  `:735-748` (card) — unconditional; contrast `DoctorWorkspace.tsx:674` `{isLbpRecord && …}`.
- **Problem:** `RevisitWorkspace` serves *every* no-questionnaire revisit (`DoctorView.tsx:4096`),
  any region. A neck / shoulder / knee / TMJ revisit patient's clinician is shown
  "허리 움직임 관련 / 신경근 관여 / 천장관절 기여" chips and can insert
  "오늘은 허리 움직임과 관련된 통증으로 보고 치료했습니다" into that patient's 안내문. §11.2 declares
  this data LBP-전용; the initial-visit screen enforces it and the revisit screen does not.
- **Minimal fix:** derive an LBP signal already available in the file and gate both blocks. The
  cleanest available source is the submission-backed prior visit the file already loads:
  ```ts
  // near line 465, beside acceptedRehabTitles
  const isLbpPatient =
    (rehabSourceSubmission?.submission?.responses as { safety_flags?: { lbp?: unknown } } | undefined)
      ?.safety_flags?.lbp != null ||
    !isLbpWorkingHypothesisBlank(workspaceState.lbpWorkingHypothesis)
  ```
  then wrap `:714-733` and `:735-748` in `{isLbpPatient && ( … )}`. The second disjunct guarantees an
  already-recorded hypothesis never becomes unreachable/uneditable on a later visit. If the PO would
  rather show it to everyone, that is a legitimate product call — but then §11.2's "LBP 전용" must be
  amended in the brief and the 5 labels reconsidered, and it needs PO sign-off, not silence.
- **Mechanical re-check:** render `RevisitWorkspace` (or extract the predicate to a pure exported
  helper and unit-test it) asserting `임상 가설(확정 진단 아님)` is absent for a non-LBP prior and
  present for an LBP prior. Re-run `npm run test:doctor-workspace` and
  `npm run test:lbp-working-hypothesis`.

### D-5 — the prior-visit hypothesis line lacks the `이전` marker every sibling line carries — **should fix**
- **Where:** `src/doctor/workspace/RevisitWorkspace.tsx:611-613`.
- **Problem:** renders the bare string `임상 가설: …`, identical wording to today's EMR line, while
  every sibling uses `<strong>이전 …</strong>` or self-labels (`revisitQuickCheck.ts:375` →
  `"이전 간단 체크: …"`). It can be read as today's judgment.
- **Minimal fix:** keep `summarizeLbpWorkingHypothesisKo` shared (the EMR needs the un-prefixed form)
  and prefix at the render site:
  ```tsx
  <p className="workspace__priorVisit__assessment">
    <strong>이전 임상 가설</strong> {priorHypothesisSummary.replace(/^임상 가설: /, '')}
  </p>
  ```
- **Mechanical re-check:** assert the rendered recap contains `이전 임상 가설` and that the EMR
  preview still contains exactly `임상 가설: ` (unprefixed).

### D-6 — the sha256 pin is brittle in the direction that destroys it — **should fix**
- **Where:** `tests/lbp-working-hypothesis.spec.mjs:494-497`.
- **Problem:** proven false-failure on a comment-only, zero-behaviour edit to
  `patientCarePlanPreview.ts`. The obvious remedy (re-pin the hash) silently re-baselines the
  boundary; the other obvious remedy (delete the assertion) removes it. Neither requires anyone to
  re-read the contract.
- **Minimal fix:** replace the byte pin with the three semantic guards described in §B — an
  exact-set assertion on the file's import list (`{'./carePlan'}`), the existing never-appears
  content checks extended to the 5 easy labels and the fixed clause, and an output-level property
  assertion on `buildPainPatientCarePlanPreview`.
- **Mechanical re-check:** apply a comment-only edit to `patientCarePlanPreview.ts` → suite must
  **pass**; add `import { patientSentenceDraftKo } from './lbpWorkingHypothesis'` to it → suite must
  **fail**. Revert both.

### D-7 — the mandatory-clause guarantee rests on one assertion; the rest are self-referential — **should fix**
- **Where:** `tests/lbp-working-hypothesis.spec.mjs:185-186` (self-referential) vs `:206-209` (the
  only hard pin).
- **Problem:** proven — rewording the constant to drop "확정 진단이 아니라" and relaxing only `:206`
  left all 159 remaining assertions green. This is the batch's core safety property and it has a
  single point of failure that a future session would remove while believing they were fixing a
  brittle string test.
- **Minimal fix:** add, above the loop, a literal pin independent of the module:
  ```js
  assert('the mandatory clause literal is exactly the PO-approved wording (do NOT update this literal without a DECISIONS.md entry)',
    LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO === '확정 진단이 아니라 경과를 보며 다시 판단합니다.')
  ```
  and pin all five full sentences verbatim (see D-1). The parenthetical in the assertion name is the
  part that stops a mechanical re-pin.
- **Mechanical re-check:** reword the constant in a scratch copy → at least the new literal assertion
  and all five sentence assertions must fail.

### D-8 — vacuous assertion with a misleading comment — **should fix**
- **Where:** `tests/lbp-working-hypothesis.spec.mjs:502-515`.
- **Problem:** `!new Set([6 literals]).has('a 7th literal')` — a tautology that reads no file and
  cannot fail. Its comment claims it proves no unintended `src/` file imports the module. The list is
  also already wrong: `PainWorkspace.tsx:65` imports the type and is missing from it.
- **Minimal fix:** make it real — glob `src/**/*.{ts,tsx}`, collect files whose source matches
  `/from '\.\/lbpWorkingHypothesis'/`, and assert that set equals the allowed set (adding
  `PainWorkspace.tsx`). Or delete the block outright; a tautology dressed as a boundary guard is
  worse than no guard.
- **Mechanical re-check:** add the import to an eighth file in a scratch copy → must fail. Revert.

### D-9 — no structural guard on the initial-visit insertion path — **should fix**
- **Where:** guard exists only for `RevisitWorkspace.tsx` (`tests/…spec.mjs:310-322`);
  `DoctorWorkspace.tsx:683` is unpinned.
- **Problem:** the initial-visit path is the one most patients go through, and nothing prevents a
  future refactor from moving that insertion into an effect or a default.
- **Minimal fix:** mirror the existing mutant-(e) guard for `DoctorWorkspace.tsx` — assert
  `appendLbpHypothesisSentenceToPatientInstruction` appears exactly once, that the 300 chars before
  it contain `onInsertPatientSentence={`, and that it does not appear inside any `useEffect(`.
- **Mechanical re-check:** move the call into an effect in a scratch copy → must fail. Revert.

---

## CLINICAL DECISION REQUIRED

### CDR-1 — the `NEURAL` patient sentence needs the Product Owner's own sign-off
> "오늘은 **다리로 가는 신경**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며
> 다시 판단합니다."

As written the sentence is medically defensible and I would defend it: it names no disease, asserts
no compression or damage, localises to no root level, and is hedged by 보고 plus the disclaimer.
But it is the only one of the five whose plain-language rendering names an anatomical structure with
a strong lay disease association in Korean, and the realistic risk is the patient's **paraphrase**
("신경이 눌렸대요" / "디스크래요") being quoted at another clinic — which no wording of ours fully
controls. Whether that residual risk is acceptable is a Product Owner judgment about this clinic's
patients and referral environment, not a technical one. Options: (a) ship as written; (b) soften to a
symptom-level rendering that names no structure, e.g. "다리로 뻗치는 증상"; (c) drop `NEURAL` from
the patient-draft set entirely and let the clinician write the sentence themselves for this pattern
(the module already returns `null` for ≥2 HIGHER on exactly that reasoning, so the precedent exists).
Record the decision in `DECISIONS.md` either way.

### CDR-2 — the replacement wording for `WALK_STAND_LEG` (D-1) is patient-facing and needs sign-off
D-1 is unambiguously a defect (broken Korean), but its *fix* is a new patient-facing string, and
§11.7's stop-point discipline puts patient-facing wording with the PO. My proposal:
"오늘은 오래 걷거나 서 있을 때 나타나는 **다리 증상**과 관련된 통증으로 보고 치료했습니다.
확정 진단이 아니라 경과를 보며 다시 판단합니다." Please approve this or supply alternative wording
before the fix lands.

### CDR-3 — is the revisit hypothesis card intended for non-LBP patients? (D-4)
§11.2 says the data is LBP-전용 and the initial-visit screen enforces it; the revisit screen does not.
My recommendation is to gate it (D-4's fix). If the PO instead wants the 5 patterns available on
every revisit, that is a legitimate product decision but it changes the brief and the labels, and
must be recorded in `DECISIONS.md` rather than left implicit in the code.

---

## No-action observations

1. **The mandatory clause is a draft-time guarantee, not an output-time one.** Once inserted, the
   clinician can edit `patientInstruction` freely — including deleting only the disclaimer sentence
   while keeping the hypothesis sentence. Nothing detects this, and nothing should: enforcing it at
   output time would require `patientCarePlanPreview.ts` to know about the hypothesis, which is
   exactly the boundary §11.1 exists to protect. I judge the current trade-off **correct**, but it
   should be stated plainly somewhere (a line in `DECISIONS.md`) so a future reviewer does not assume
   an output-side guarantee exists.
2. **Clicking "안내문에 넣기" stamps `painCarePlan.recordedAt`**, which flips the
   "관리 계획 입력" item in `ClinicalLoopStatusBar` to done (`RevisitWorkspace.tsx:510`,
   `carePlan.ts:65`) even if no other care-plan field is filled. This is **not new**: the existing
   exercise-adoption flow does exactly the same (`DoctorWorkspace.tsx:734-735`). Consistent with
   precedent, so no action in this batch — but worth revisiting for both flows together if the loop
   status bar is ever meant to indicate real completeness.
3. `LbpWorkingHypothesisCard.tsx:88` stamps `recordedAt` on every chip change, including a re-click
   that resets a pattern back to `UNJUDGED` — so a fully-blank hypothesis can carry a non-null
   `recordedAt`. Harmless today: `isLbpWorkingHypothesisBlank` (`lbpWorkingHypothesis.ts:104`) reads
   only `supports`, so carry-forward gating and the summary line are unaffected. Flagged only so a
   future consumer does not treat `recordedAt !== null` as "the clinician recorded a hypothesis".
4. `HIP`'s easy label `고관절` is a medical term doing no plain-language work (A-4). Recommend
   `엉덩관절(고관절)` when D-1's wording is revisited, since both are patient-facing string changes
   and should go to the PO together.
5. The inserted sentence joins with `\n` while `buildPainPatientCarePlanPreview` joins *lines* with
   `\r\n`, so a multi-sentence 안내사항 field carries mixed line endings into the copied EMR/handout
   text. Identical to the pre-existing `appendLbpAdoptionText` behaviour, so consistent — noting it
   only in case a future EMR-format batch (Batch 4's 고정 6키 포맷) needs to normalise.
6. Deliberately **not** importing `appendLbpAdoptionText` from `lbpExerciseRecommendation.ts`, and
   documenting why (`lbpWorkingHypothesis.ts:186-190`), is the right call — a shared helper would
   create exactly the incidental hypothesis↔exercise dependency §11.7 forbids. Endorsed.
7. Test-suite craft is generally high: paired counterexamples for every count-based assertion,
   slice-direction ordering checks, in-place mutant reproduction blocks, and per-pattern
   no-Latin-characters checks. D-7 and D-8 are the exceptions, not the rule.

---

## Verification state

`git status --porcelain` empty; `HEAD` = `04d06cd`. All mutants were made and destroyed under
`/tmp/…/scratchpad/work`, which has been deleted. No repository file was modified by this review.
