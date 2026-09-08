# Opus Closing Review — LBP v1 Batch 2.5c (Working Hypothesis 최소 형태)

- Repo: `/home/user/Samindang`, branch `claude/clinical-os-lbp-architecture-xym6po`
- HEAD reviewed: `9f07541`; fix delta reviewed: `git diff 04d06cd..9f07541` (two commits, `f449502` + `9f07541`)
- Reviewer: Opus (Tech Lead / clinical authority per `CLAUDE.md` Team Roles)
- Prior report: `/tmp/…/opus-batch25c-delta-review-full.md` (delta review of `04d06cd`, disposition FAIL, D-1..D-9 + CDR-1/2/3)
- Working tree clean before and after. All mutants built in a scratch copy under `/tmp` (with `jsdom` installed there only) and deleted. **No repository file was modified by this review.**

## Closing disposition: **FAIL** — code and tests PASS; the gate cannot close on the project's own Definition of Done

Let me be precise about what this FAIL is and is not, because it is unusual.

**All nine defects are resolved.** D-1..D-9 are RESOLVED (one RESOLVED WITH ISSUE, described
below and not blocking). I re-ran every mechanical re-check criterion I wrote myself, and every
one of them behaves as specified. The two PO-approved sentences are implemented exactly, the
Korean is now correct in all five, the revisit LBP gate is wired to the right field — I proved
that by rendering the **real `RevisitWorkspace` component** against real `SubmissionRecord`
fixtures in both directions, not by trusting the extracted predicate. The test suite went from
160 to 214 assertions with nothing weakened, skipped or deleted. `patientCarePlanPreview.ts` and
every other forbidden file are zero-diff, FROZEN is zero-diff, and no new hypothesis↔exercise
coupling exists. On the code, this batch is done and I would ship it.

**What is not done is the record.** `DECISIONS.md` has no entry for CDR-1, CDR-2 or CDR-3, and
`HANDOFF.md` still says Batch 2.5c is "진행 중 / 착수 전 PO 결정 필요" — three commits behind the
actual state. This is not bookkeeping pedantry in this particular case: the D-7 fix I asked for
works by naming a `DECISIONS.md` entry that **does not exist** (`tests/lbp-working-hypothesis.spec.mjs:244-246`,
`:869`), and `RevisitWorkspace.tsx:489` / `lbpWorkingHypothesis.ts:226` both cite a "PO decision,
2026-09-04" that is written down nowhere. The literal that is supposed to stop a future session
from silently softening the patient-facing disclaimer points at a blank page. That is D-7's own
failure mode reintroduced through the back door, and `CLAUDE.md`'s Definition of Done lists
`HANDOFF.md` 갱신 as mandatory besides.

Two documentation defects (D-10, D-11). **No code change is required.** Fix them and the gate
closes; this does not need another delta review.

---

## 1. D-1 .. D-9 dispositions

| # | disposition | evidence |
|---|---|---|
| D-1 | **RESOLVED** | `lbpWorkingHypothesis.ts:48` easy label, `:57` particle |
| D-2 | **RESOLVED** | `LbpWorkingHypothesisCard.tsx:97,115-122,138-160`; `DoctorWorkspace.tsx:678`; `RevisitWorkspace.tsx:771` |
| D-3 | **RESOLVED WITH ISSUE** | same call sites; residual case E4 below |
| D-4 | **RESOLVED** | `RevisitWorkspace.tsx:489-506,745-786`; `lbpWorkingHypothesis.ts:226-267` |
| D-5 | **RESOLVED** | `RevisitWorkspace.tsx:629-635` |
| D-6 | **RESOLVED** | `tests/lbp-working-hypothesis.spec.mjs:744-807` |
| D-7 | **RESOLVED** (but see D-11) | `tests/…spec.mjs:234-262`, `:857-871` |
| D-8 | **RESOLVED** | `tests/…spec.mjs:810-853` |
| D-9 | **RESOLVED** | `tests/…spec.mjs:875-890`; helper `:54-75` |

### D-4 / CDR-3 — the data path, verified in both directions on the real component

This was the finding I was least willing to take on report, so I did not.

**The double-nesting is correct, and I confirmed it against the real types**, not against the
implementer's description. `rehabSourceSubmission` is declared at `RevisitWorkspace.tsx:237-240`
as `{ submission: SubmissionRecord; createdAt: unknown }` — so the *first* `.submission` is that
wrapper's own field. `SubmissionRecord` (`src/lib/serverClient.ts:154-169`) has its **own**
`submission: Record<string, unknown>` field holding the raw questionnaire payload. So
`rehabSourceSubmission.submission.submission.responses.safety_flags.lbp` is the correct path, and
it is the same unwrapping `recordToPayload` performs at `src/doctor/DoctorView.tsx:2309,2312`
(`const s = record.submission` → `responses: s.responses`) to feed
`DoctorWorkspace.tsx:473`'s `payload.responses.safety_flags.lbp != null`. The sibling accessor in
the same file, `acceptedRehabTitlesFromSubmission(rehabSourceSubmission?.submission)`
(`:466` → `:169-172`, reads `sub.workspace`), independently corroborates that
`rehabSourceSubmission.submission` is a `SubmissionRecord`.

**But a type argument is not a wiring proof, so I built one.** In the scratch copy I installed
`jsdom`, bundled the real `RevisitWorkspace.tsx` with `import.meta.env` defined, stubbed `fetch`
with real-shaped wire payloads (`VisitRecord` for today's no-submission revisit,
`PatientHistoryWire` for the history, a full `SubmissionRecord` for the prior visit) and rendered
the actual component through `react-dom/client` + `act` until all four fetches settled. Four
fixtures:

| fixture | prior submission `safety_flags` | today's hypothesis | card + carry-forward button |
|---|---|---|---|
| genuine LBP revisit | `{ lbp: {...} }` | blank | **rendered** ✅ |
| neck revisit | `{ neck: {...} }`, no `lbp` key | blank | **absent** ✅ |
| neck revisit, hypothesis already recorded today | `{ neck: {...} }` | `NEURAL: HIGHER` | **rendered** ✅ (second disjunct works) |
| no submission-backed history at all | — | blank | absent (see observation 3) |

So: **not** always-null (the genuine LBP revisit patient keeps the feature — the clinician can
record and carry forward a hypothesis), and **not** always-truthy (the neck patient no longer
sees lumbar chips or a lumbar patient sentence). The original defect is fixed and no functional
regression was introduced. The second disjunct is confirmed on the real component, not just on
the predicate.

**And I proved the accessor is load-bearing.** Mutating `.submission?.submission?.responses` →
`.submission?.responses` in the scratch copy made the card vanish for the genuine-LBP fixture
(`cardAriaLabel: false, carryForwardButton: false`) — i.e. exactly the always-null functional
regression, which is what a wrong path would look like. That mutant is caught by `npx tsc -b`
(`error TS2339: Property 'responses' does not exist on type 'SubmissionRecord'`), which is real
protection. See observation 2 for the one mutation shape that is **not** caught.

`isLbpPatientForRevisitHypothesisGate` (`lbpWorkingHypothesis.ts:260-266`) takes `unknown` and
imports nothing, so extracting it added no dependency; the module still has **zero imports**.

### D-1 / CDR-1 / CDR-2 — the five sentences, read as a clinician

Generated from the real module at `9f07541`:

| pattern | sentence | clause last |
|---|---|---|
| `LUMBAR_MOVEMENT` | 오늘은 **허리 움직임**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. | ✅ |
| `NEURAL` | 오늘은 **다리로 뻗치는 증상**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. | ✅ |
| `WALK_STAND_LEG` | 오늘은 **오래 걷거나 서 있을 때 나타나는 다리 증상**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. | ✅ |
| `HIP` | 오늘은 **고관절**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. | ✅ |
| `SIJ` | 오늘은 **골반 뒤쪽 관절**과 관련된 통증으로 보고 치료했습니다. 확정 진단이 아니라 경과를 보며 다시 판단합니다. | ✅ |

- **The two changed sentences are exactly the PO-approved strings.** `다리로 뻗치는 증상` and
  `오래 걷거나 서 있을 때 나타나는 다리 증상`, character for character.
- **The three unchanged sentences were not disturbed.** `허리 움직임과`, `고관절과`,
  `골반 뒤쪽 관절과` are byte-identical to the `04d06cd` output I recorded in the delta review.
  The module diff touches only the two easy labels and the one particle.
- **Particles are correct Korean in every sentence.** 움직임(ㅁ)+과, 증상(ㅇ)+과, 증상(ㅇ)+과,
  고관절(ㄹ)+과, 관절(ㄹ)+과 — all five take 과, all five have 과. `WALK_STAND_LEG` was correctly
  flipped 와→과 at `:57` when its label gained the 받침-final 증상; leaving it as 와 was the
  obvious way to get this wrong and it was not gotten wrong.
- **The mandatory clause is intact and last** in all five (`endsWith` verified programmatically),
  and `appendLbpHypothesisSentenceToPatientInstruction` still inserts the two sentences as one
  atomic unit.

**CDR-1 as a clinician: `다리로 뻗치는 증상` succeeds.** It names no anatomical structure — 신경
is gone entirely — and it is not a euphemism that loses the clinical content: 뻗치다 is exactly
the verb Korean patients use for radiating symptoms ("다리로 뻗쳐요"), so the sentence still
identifies, in the patient's own idiom, *which* of their symptoms the clinician treated as the
leading one. That is the whole clinical job of this sentence. The paraphrase risk I raised in
CDR-1 is materially reduced rather than merely relabelled: the patient is no longer handed a
structure word to anchor "신경이 눌렸대요" on. I would defend this string in front of another
clinician.

**CDR-2: the `WALK_STAND_LEG` sentence is now grammatical.** 나타나는 now modifies 증상, and
증상이 나타나다 is ordinary Korean; the missing head noun that made "a leg that appears" was the
entire defect and it is supplied. It is the longest of the five but parses cleanly on one read,
and it still correctly avoids naming 협착증 / 신경인성 파행.

One stylistic note, **not** a defect and **not** a re-litigation of the PO's choice: with a
symptom-level label, the template reads "…증상과 관련된 통증" — "pain related to the
leg-radiating symptom" — which is mildly circular, since the radiating symptom usually *is* the
pain. It is comprehensible and nothing like the D-1 parse failure, so it ships. I record it under
observations only because if the PO ever revisits patient wording, the cleanest fix is a template
variant for symptom-level labels (`…을 중심으로 보고 치료했습니다`) rather than another label change.

### D-7 — re-ran my own proof

Rewording the constant at `lbpWorkingHypothesis.ts:156` to drop "확정 진단이 아니라" (the exact
mutant that previously left 159/160 assertions green) now fails **six** real assertions, not one:

```
FAILED: patientSentenceDraftKo (LUMBAR_MOVEMENT): exact full sentence matches the hard-coded PO-approved literal
FAILED: patientSentenceDraftKo (NEURAL): …
FAILED: patientSentenceDraftKo (WALK_STAND_LEG): …
FAILED: patientSentenceDraftKo (HIP): …
FAILED: patientSentenceDraftKo (SIJ): …
FAILED: the mandatory clause literal is exactly the PO-approved wording (do NOT update this literal without a DECISIONS.md entry)
```

(Measured by temporarily making `assert` collect instead of throw, so I could see all failures
rather than only the first; the two `mutant (a)` reproduction entries that also appear depend on
`assert` throwing and are an artefact of that instrumentation, not real failures.) All five
sentence literals are written out in the spec file itself, independent of every constant imported
from the module under test — I confirmed by reading `:234-262`. A future session cannot make this
green by "fixing the one brittle string test". **The one thing still missing is the referent of
that assertion's own name** → D-11.

### D-2 / D-3 — scenarios recreated against the real module and the real card

Rendered the real `LbpWorkingHypothesisCard` (bundled from source) with real drafts and real
`appendLbpHypothesisSentenceToPatientInstruction` output:

| scenario | button | "이미 안내문에 들어 있습니다" | stale warning | `onChange` fired on render |
|---|---|---|---|---|
| (a) clinician **edited** the inserted sentence, same chips | shown | — | **shown** | no |
| (a2) draft present verbatim, unedited | **absent** | **shown** | — | no |
| (b) chips changed NEURAL→HIP after insertion | shown | — | **shown** | no |
| (c) clean, clinician-authored text only | shown | — | — | no |
| (d) `currentPatientInstruction` undefined | shown | — | — | no |
| (e) empty string | shown | — | — | no |

- **(a)** The original is no longer resurrected silently: the clinician is warned before they can
  click. The button deliberately remains (that was my own prescription — warn, never auto-edit),
  and the spec pins the append function's unchanged additive behaviour explicitly at
  `tests/…spec.mjs:638` rather than quietly changing it.
- **(b)** The stale-text warning fires on the exact D-3 scenario.
- **(c)** Neither cue in the clean case — the counterexample that makes (a)/(b) non-vacuous.
- **The field is never auto-edited.** `onChange` never fires during render in any of the six
  cases, and `onInsertPatientSentence` was invoked **0** times across a render with a non-empty
  instruction. The card is still a pure render plus two callbacks; the fix added two derived
  booleans (`LbpWorkingHypothesisCard.tsx:115-122`) and no effect.

**D-3's residual issue (E4), why it is not blocking.** The cues live inside the `{draft && …}`
block, so when the draft is `null` the whole box — and every cue with it — disappears. If the
clinician inserts the NEURAL sentence and then marks a **second** pattern HIGHER (or clears all
chips), `patientSentenceDraftKo` returns `null` by design, the box vanishes, and the neural
sentence sits in the 안내문 with no cue at all. This is a strictly smaller subset of the original
D-3 (the safety-relevant half — a contradictory sentence being *inserted* unwarned — is fixed),
and it is a direct consequence of the fix shape I myself prescribed, so I am not going to fail the
implementer for it. It is a small local fix and belongs on the backlog → observation 1.

Two narrower holes I also probed, both by design rather than by oversight, both recorded under
observations: if the clinician deletes only the disclaimer half (E1) or rewrites the sentence past
recognition (E3), the fixed-clause detector cannot see it — that is the same draft-time-vs-output-time
trade-off as no-action observation 1 of the delta review, and closing it would require
`patientCarePlanPreview.ts` to learn about the hypothesis, which is exactly the boundary this
batch exists to protect. Leave it.

### D-6 — semantic guards replaced the sha256 pin, both directions run

| mutation to `patientCarePlanPreview.ts` | required | actual |
|---|---|---|
| append `// cosmetic comment` (zero behaviour) | PASS | **PASS**, 214 assertions |
| add `import { patientSentenceDraftKo } from './lbpWorkingHypothesis'` | FAIL | **FAIL** — `patientCarePlanPreview.ts imports exactly {'./carePlan'} …` |

The false-failure that would have driven a future session to re-pin the hash is gone, and the
real threat is caught. The output-level property assertion (`tests/…spec.mjs:788-806`) is
implemented as I described — hypothesis sentence in patient output **iff** the clinician's own
text contains it — and the never-appears list is extended to the five easy labels and the fixed
clause. `patientCarePlanPreview.ts` itself is untouched (`git diff dfa8f05..9f07541` on it: 0 lines).

### D-8 — the importer guard now reads real files

Adding `import type { LbpWorkingHypothesis } from './lbpWorkingHypothesis'` to
`src/doctor/workspace/carePlan.ts` (an eighth file) fails the suite:
`structural (D-8, real): the actual set of src/**/*.{ts,tsx} files importing lbpWorkingHypothesis.ts equals the allowed-importers list exactly …`.
The tautology is gone, the scan is a real recursive walk of `src/`, and `PainWorkspace.tsx` was
added to the allowed set, so the list is now factually correct. One narrower residual gap remains
→ observation 4.

### D-5 — verified against my stated criterion

Rendered the real component with a prior visit carrying a hypothesis. The recap line is now:

```html
<p class="workspace__priorVisit__assessment"><strong>이전 임상 가설</strong> 신경근 관여 가능성 높음 · 고관절 기여 고려</p>
```

`이전` marker present, bold label matching every sibling line in `이전 방문 참고`, and the
shared summarizer's own `임상 가설: ` prefix stripped at the render site so there is no doubled
label. The EMR path is unaffected — `summarizeLbpWorkingHypothesisKo` is unchanged and still
returns the un-prefixed `임상 가설: 신경근 관여 가능성 높음` (pinned at `tests/…spec.mjs:740`),
and `emrPreview.ts` is zero-diff in this delta. The ambiguity I flagged is gone.

### D-9 — verified against my stated criterion

Two mutants of `DoctorWorkspace.tsx`, both caught:

- adding a second call inside a `useEffect` → fails "called exactly once …";
- relocating the **single** call site into a `useEffect` → fails "the 300 chars before the call
  site contain `onInsertPatientSentence={` …".

The `useEffectSpans` helper (`tests/…spec.mjs:54-75`) is a genuine brace-balanced scan, not a
regex approximation. The initial-visit path now has the same structural protection as the revisit
path.

---

## 2. The fix delta introduced nothing new

- `git diff --stat 04d06cd..9f07541` → exactly the expected 8 files: `.gitignore` (+1, the new
  test bundle), `package.json` (the `patientCarePlanPreview.ts` bundle step added to
  `test:lbp-working-hypothesis`; no dependency change), `DoctorWorkspace.tsx` (+1),
  `LbpWorkingHypothesisCard.tsx`, `RevisitWorkspace.tsx`, `lbpWorkingHypothesis.ts`,
  `workspace.css` (+14, two new classes only), `tests/lbp-working-hypothesis.spec.mjs`.
- **Forbidden files zero-diff**, each checked individually across `04d06cd..9f07541`:
  `patientCarePlanPreview.ts`, `provenance.ts`, `examSuggestion.ts`, `revisitQuickCheck.ts`,
  `lbpExerciseEligibility.ts`, `revisitCarryForward.ts`, and additionally `emrPreview.ts`,
  `persistence.ts`, `visitWorkspace.ts` — 0 lines each. `patientCarePlanPreview.ts` is also
  0-diff across the whole batch (`dfa8f05..9f07541`).
- **FROZEN zero-diff**: `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` → empty.
- **No assertion weakened, skipped or deleted.** I read every one of the 26 removed `-` lines in
  the test diff. The only removed assertions are the three D-6/D-7/D-8 replacements — the sha256
  pin (→ three stronger semantic guards), the vacuous `allowedImporters` tautology (→ a real
  source scan), and the single NEURAL exact-sentence pin (→ all five pinned). Nothing else: no
  `.skip`, no `.todo`, no commented-out `assert(`. Assertion count 104 → 147 statements,
  160 → 214 executed assertions.
- **No new coupling.** `lbpWorkingHypothesis.ts` still has **zero imports**; every
  `safety_flags` / `lbpExercise*` occurrence in it and in the card is a doc comment. Reverse
  direction (`grep WorkingHypothesis` over `lbpExercise*.ts`, `rehabSuggestion.ts`,
  `patientCarePlanPreview.ts`) → no hits. The new gate reads the questionnaire's *region
  applicability* flag, which is the same signal `isLbpRecord` already uses on the initial-visit
  screen — it is not a dependency on safety or eligibility *logic*.
- Neither generated bundle is tracked (`git ls-files tests/.*` empty); `.gitignore` covers the new one.

## 3. Verification commands (all at `9f07541`, clean tree)

| command | result |
|---|---|
| `npx tsc -b` | **PASS** (exit 0, no output) |
| `npm run test:lbp-working-hypothesis` | **PASS** — 214 assertions (was 160) |
| `npm run test:workspace-round3` | **PASS** — 179 assertions |
| `npm run test:doctor-workspace` | **PASS** — 240 assertions |
| `npm run test:emrSummary` | **PASS** — 14 assertions, 0 failed |
| `npm run test:doctor-reset-key` | **PASS** — 11 assertions |
| `npm run test:lbp-exercise-recommendation` | **PASS** — 23 tests |

---

## Remaining concrete defects

### D-10 — `HANDOFF.md` contradicts the actual Git state by three commits — **blocking (documentation only)**

- **Where:** `HANDOFF.md:3` (heading "Batch 2.5b CLOSED → Batch 2.5c(임상 가설) **착수**"),
  `:18` ("**진행 중** — Batch 2.5c"), `:31` ("**사람 판단 대기**: 없음"), and `:111` whose
  "다음 행동(하나)" is still "Batch 2.5c … 착수 전 PO 결정이 필요하다".
- **Problem:** Batch 2.5c is implemented (`04d06cd`), delta-reviewed FAIL, and fixed twice
  (`f449502`, `9f07541`); the three CDRs are decided. `HANDOFF.md` records none of it and still
  presents the batch as not yet started with PO decisions outstanding. `CLAUDE.md` is explicit:
  "`HANDOFF.md`의 기록과 실제 Git/GitHub 상태가 어긋나면 **Git이 항상 맞다** — 발견 즉시
  `HANDOFF.md`를 실제 상태에 맞게 고친다. 오래된 HANDOFF를 방치한 채 다음 작업을 진행하지 않는다."
  A session picking this branch up today would re-ask the PO for decisions already made and could
  re-implement work already merged. Definition of Done also lists `HANDOFF.md` 갱신 outright.
- **Minimal fix:** add a new top entry (최신 12) recording: the three commits and what each did;
  the delta review FAIL with D-1..D-9 and CDR-1/2/3; the PO's three decisions and that `HIP`
  (`고관절`) was deliberately left undecided (backlog); this closing review's disposition and the
  two items below; and a "다음 행동(하나)" pointing at Batch 4. Cite the delta and closing review
  files as evidence, as the 2.5b entry does.
- **Mechanical re-check:** `HANDOFF.md`'s newest entry names `9f07541` and states Batch 2.5c's
  gate status; `grep -n "진행 중 — Batch 2.5c" HANDOFF.md` no longer describes current state.

### D-11 — the D-7 guard cites a `DECISIONS.md` entry that does not exist — **blocking (documentation only)**

- **Where:** `tests/lbp-working-hypothesis.spec.mjs:244-246` ("PO-approved wording -- do NOT
  update these literals without a DECISIONS.md entry (CDR-1 NEURAL, CDR-2 WALK_STAND_LEG,
  2026-09-04)") and `:867-870` (the clause literal assertion whose *name* is
  "…do NOT update this literal without a DECISIONS.md entry"); source side
  `src/doctor/workspace/RevisitWorkspace.tsx:489`, `:726`, `src/doctor/workspace/lbpWorkingHypothesis.ts:226`
  ("Opus delta review D-4 / CDR-3 (PO decision, 2026-09-04)"). `DECISIONS.md`'s most recent 2.5c
  content is the pre-implementation brief at `:2053-2099`; `grep -n "CDR-1\|CDR-2\|CDR-3\|다리로 뻗치는"
  DECISIONS.md` returns nothing.
- **Problem:** D-7's whole mechanism is a literal whose assertion name redirects a future session
  from "just re-pin the string" to "go read the decision". The decision is not written down, so
  the redirect dead-ends and the session is left to re-pin anyway — D-7's failure mode restored
  through the back door, on the batch's single most important patient-safety property. The same
  applies to CDR-3: the LBP gate is a deliberate narrowing of who sees the card, justified only by
  a PO decision that exists nowhere in the repository. `CLAUDE.md` requires the record ("Record the
  decision in `DECISIONS.md` either way" was also my own CDR wording).
- **Minimal fix:** one dated `DECISIONS.md` entry under 2026-09-04 recording all three:
  **CDR-1** — `NEURAL` easy label → `다리로 뻗치는 증상`, chosen as option (b) (symptom-level,
  names no anatomical structure) to reduce the "신경이 눌렸대요/디스크래요" paraphrase risk;
  **CDR-2** — `WALK_STAND_LEG` → `오래 걷거나 서 있을 때 나타나는 다리 증상` (+ particle 와→과),
  fixing broken Korean; **CDR-3** — the revisit hypothesis card is LBP-gated
  (submission `safety_flags.lbp != null` **OR** a hypothesis already recorded today), matching
  §11.2's LBP-전용 scope and `DoctorWorkspace.tsx`'s `isLbpRecord`. Note explicitly that `HIP`
  (`고관절`) was **not** decided and remains open (delta review A-4). Add the delta review's
  no-action observation 1 as a stated trade-off: the mandatory clause is a **draft-time**
  guarantee only, deliberately not enforced at output time, because enforcing it would require
  `patientCarePlanPreview.ts` to know about the hypothesis.
- **Mechanical re-check:** `grep -n "CDR-1\|CDR-2\|CDR-3" DECISIONS.md` returns the new entry, and
  it contains the two approved strings verbatim so a future session can diff them against
  `tests/lbp-working-hypothesis.spec.mjs:248-259`.

---

## CLINICAL DECISION REQUIRED

**None.** CDR-1, CDR-2 and CDR-3 are decided and correctly implemented; I verified the
implementations rather than re-opening the choices. `HIP` (`고관절`) remains deliberately
undecided by the PO and stays on the backlog as observation 5 — it is not a blocker and does not
need a decision to close this gate.

## No-action observations

Carrying forward the delta review's open items (1-3 below are new; 5, 8-12 are carried).

1. **(new, top backlog item) D-3 residual: the stale-text cue disappears when the draft does.**
   Both cues render inside the `{draft && (` block (`LbpWorkingHypothesisCard.tsx:138`), so marking a
   *second* pattern HIGHER — or clearing all chips — after an insertion removes the entire box and
   with it any indication that a hypothesis sentence is still sitting in the 안내문. Verified by
   render (fixture E4: draft `null`, instruction contains the NEURAL sentence → button no,
   status no, warning no). Minimal fix: hoist the `staleHypothesisInInstruction` computation and
   its `<p>` out of the `{draft && …}` block, so the warning renders whenever
   `currentPatientInstruction` contains the fixed clause and the current draft is absent or
   different. Re-check: render with `emptyLbpWorkingHypothesis()` and an instruction containing a
   generated sentence → warning present; clean instruction → absent.

2. **(new) A typo at the last hop of the D-4 accessor fails silently and nothing catches it.**
   `RevisitWorkspace.tsx:503-506` reaches through `SubmissionRecord.submission`, which is
   `Record<string, unknown>` — so mutating `.responses` → `.response` type-checks, passes all 214
   assertions **and** all of `test:doctor-workspace`, and silently closes the gate for every
   genuine LBP revisit patient (verified: card and button absent for the LBP fixture). Dropping a
   *level* is caught by `tsc`; a wrong *field name* at that level is caught by nothing. The D-4
   structural guard checks only that `isLbpPatient` is derived from the predicate and that both
   blocks sit inside the conditional — not what the accessor reads. Suggested guard, matching the
   file's existing source-scan convention: assert `RevisitWorkspace.tsx` contains
   `?.submission?.submission?.responses` and `?.safety_flags?.lbp` literally, with a comment
   pointing at `recordToPayload`. Better still if a future batch ever bundles `RevisitWorkspace`
   for render tests — the jsdom harness I used for this review took about twenty lines and would
   pin the behaviour instead of the syntax.

3. **(new) The gate fails closed on a transient fetch failure, silently.** If
   `getPatientHistory` or the `getSubmission` for the rehab-source visit fails, both are silent by
   design (`RevisitWorkspace.tsx:322-326`, "A failure here is silent (stays null) — it must never
   affect the other prior-visit recap lines"), so `rehabSourceSubmission` stays `null` and the
   card disappears for a genuine LBP patient with `loadError: false` and no other visible change.
   Verified on both failure paths. Fail-closed is the right direction for patient-facing text and
   the second disjunct means an already-recorded hypothesis stays reachable, so I would not change
   the behaviour — but a clinician who saw the card yesterday and not today gets no explanation.
   Worth a line in the eventual user-facing notes rather than code.

4. **(new) The D-8 scan only sees same-directory imports.** The regex is
   `/from '\.\/lbpWorkingHypothesis'/` (`tests/…spec.mjs:845`), so a file outside
   `src/doctor/workspace/` importing via `'./workspace/lbpWorkingHypothesis'` or
   `'../workspace/lbpWorkingHypothesis'` is invisible — verified: adding such a probe file left
   the suite green. The file that actually matters (`patientCarePlanPreview.ts`) is a sibling, so
   the primary boundary is covered; this is a completeness gap, not a hole in the protected
   boundary. One-character fix: `/from '[^']*lbpWorkingHypothesis'/`. The set is also compared by
   basename (`file.split('/').pop()` at `:846`), so two same-named files in different directories would
   alias.

5. **(carried, A-4) `HIP`'s easy label `고관절` is a medical term doing no plain-language work.**
   §11.3 asks for 쉬운 말; here the easy label is the clinician label minus one word, and many
   patients confuse 고관절 with 골반. Not a clinical risk (no disease named, no overclaim).
   Suggested `엉덩관절(고관절)` whenever patient wording next goes to the PO. Note that the
   per-pattern "never names the internal pattern label" assertion still passes for HIP only on a
   technicality (`'고관절 기여'` absent, `'고관절'` present).

6. **(new, minor) The symptom-level labels make the template mildly circular.** "…증상과 관련된
   통증" reads as "pain related to the symptom" for `NEURAL` and `WALK_STAND_LEG`. Comprehensible
   and shippable; if patient wording is ever revisited, a template variant for symptom-level
   labels (`…을 중심으로 보고 치료했습니다`) is cleaner than changing the labels again.

7. **(new, minor) The particle table now holds a single distinct value.** All five entries are
   `'과'` (`lbpWorkingHypothesis.ts:54-60`). The doc comment was correctly updated to say so and
   to explain why the per-pattern table is kept for future labels. Correct as-is; flagged only so
   nobody "simplifies" it away and then adds a 받침-less label.

8. **(carried) The mandatory clause is a draft-time guarantee, not an output-time one.** Once
   inserted, the clinician can delete the disclaimer sentence and keep the hypothesis sentence;
   nothing detects it and nothing should, because detection at output time would require
   `patientCarePlanPreview.ts` to know about the hypothesis. Re-verified (fixture E1: no warning
   in that state). The trade-off is correct — it just needs to be *stated*, which is part of D-11.

9. **(carried) Clicking "안내문에 넣기" stamps `carePlan.recordedAt`**, flipping "관리 계획 입력"
   to done in `ClinicalLoopStatusBar` even with no other care-plan field filled. Unchanged in this
   delta and consistent with the pre-existing exercise-adoption flow. Revisit both together if the
   loop bar is ever meant to indicate real completeness.

10. **(carried) `recordedAt` is stamped on every chip change**, including a re-click that resets a
    pattern to `UNJUDGED`, so a fully-blank hypothesis can carry a non-null `recordedAt`. Harmless
    today (`isLbpWorkingHypothesisBlank` reads only `supports`, and the new D-4 gate uses that
    same helper, so the gate is unaffected). Flagged so a future consumer does not read
    `recordedAt !== null` as "a hypothesis was recorded".

11. **(carried) Mixed line endings.** The inserted sentence joins with `\n` while
    `buildPainPatientCarePlanPreview` joins lines with `\r\n`. Identical to the pre-existing
    `appendLbpAdoptionText` behaviour. Relevant only when Batch 4's 고정 6키 EMR format lands.

12. **(carried) Deliberately not importing `appendLbpAdoptionText`** from
    `lbpExerciseRecommendation.ts`, and documenting why (`lbpWorkingHypothesis.ts:186-190`),
    remains the right call. Endorsed.

Test-suite craft is now high across the board: the two exceptions I named at delta stage (D-7's
self-referential clause checks, D-8's tautology) are both fixed, the new blocks carry paired
counterexamples (`PainFinalAssessmentCard` outside the gated region; the clean-case render; the
AND-gate mutant), and the in-place mutant reproductions demonstrate their own failure. The
`useEffectSpans` helper is a genuine improvement over the `lastIndexOf` walk-backs this suite's
siblings use.

---

## Verification state

`git status --porcelain` empty; `HEAD` = `9f07541`. Every mutant was made and destroyed under
`/tmp/…/scratchpad/work` (a `git archive` copy with its own `node_modules` and a scratch-only
`jsdom` install), which has been deleted along with the render harness and every `.orig` backup.
No repository file was modified by this review; the only file written is this report.
