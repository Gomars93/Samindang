# LBP Action-Adaptive Engine v0.2 — Stress Result

Status: **DRAFT EXPERIMENT ONLY — NOT PRODUCTION CDS**

## What changed

v0.2 does not change the v0.1 clinical candidate rules. It wraps them with:

1. **Decision Key** — each suggested check must answer a clinically distinct management question.
2. **Current vs deferred tranche** — automatic suggestions expose at most three current checks; additional distinct candidates are preserved as deferred, not deleted.
3. **Visit-scoped exam freshness** — `NOT_PERFORMED` / `LIMITED` only suppress re-suggestion when they are explicitly current-visit results. Prior-visit or unknown freshness is re-evaluated when the branch is still actionable.
4. **Consistency warnings** — contradictory normalized facts remain visible as adapter/derived-fact quality warnings instead of being silently normalized.

The automatic presentation budget is an interaction budget, **not a clinical hard cap**. Clinician-requested override checks can exceed three.

## Exhaustive result

The same 243 cue combinations were run through v0.1 and v0.2.

### Candidate set preserved

v0.1 candidate histogram and v0.2 `allCandidateChecks` are identical:

- 0 candidates: 16
- 1 candidate: 48
- 2 candidates: 84
- 3 candidates: 68
- 4 candidates: 24
- 5 candidates: 3

Total independent candidate/Decision Key resolutions across the matrix remain **531**.

This is intentional: v0.2 must not obtain a lower click count by silently deleting a clinically distinct unresolved question.

### Current-tranche burden

v0.2 current automatic checks:

- 0 current: 16
- 1 current: 48
- 2 current: 84
- 3 current: 95
- >3 automatic current: **0**

27/243 cases have deferred candidates. Maximum deferred count is 2.

Worst-case all-cue candidate set remains five:

1. objective neuro baseline
2. walking function baseline
3. neurodynamic response
4. hip treatment target
5. SIJ treatment target

Current tranche exposes the first three and keeps Hip/SIJ explicit as deferred Decision Keys.

### Sequential convergence

- 243/243 synthetic patients converge without loops.
- Total neutral Decision Key resolutions: 531.
- Maximum sequential resolutions for one synthetic patient: 5.

So v0.2 solves **simultaneous cognitive burden**, but does **not yet prove total encounter burden is optimal**. This distinction is important.

## Freshness result

The prior v0.1 stale-state gap is now executable:

- `CURRENT_VISIT + NOT_PERFORMED/LIMITED` → same-visit re-suggestion suppressed.
- `PRIOR_VISIT + NOT_PERFORMED/LIMITED` → current actionable branch may re-open.
- FOLLOW_UP terminal result with missing freshness → explicit warning + re-evaluation rather than stale suppression.

Production wiring must therefore provide visit/result provenance rather than carrying one scalar exam state forward indefinitely.

## What v0.2 deliberately does not claim

- It does not prove that 3 is the clinically optimal number of checks.
- It does not prove that all five worst-case Decision Keys must be completed in the same encounter.
- It does not use coarse management-category set cover to delete checks; that was shown unsafe in v0.1 stress testing.
- It does not alter clinical thresholds, diagnosis logic, rehab mapping, tablet questions, FROZEN logic/adapter, Doctor UI, CRM, or EMR.

## Next design question

The next experiment should test **decision sufficiency**, not merely presentation count:

> After the current higher-value Decision Keys are resolved, does each deferred Decision Key still have a plausible result that changes today's management?

A deferred check should only re-open if at least one plausible outcome can still change safety, treatment target, rehab selection, reassessment, or imaging/referral **after incorporating the results already obtained**.

This is the point where true encounter-burden reduction can be tested without deleting clinically independent information by fiat.
