# Task: v1.0 Integration Sprint

## Goal
Integrate the completed primary-detail modules into a coherent questionnaire flow and finish the deferred cross-module routing work.

## Scope
Focus only on integration of the existing questionnaire v1.0. Do not add backend, DB, AI/LLM features, EMR integration, or unrelated refactors.

## Acceptance checklist

### Secondary short screens
- [ ] Implement short-screen behavior for secondary Sleep.
- [ ] Implement short-screen behavior for secondary GI.
- [ ] Implement short-screen behavior for secondary Bowel.
- [ ] Implement short-screen behavior for secondary Urinary.
- [ ] Implement short-screen behavior for secondary Pain.
- [ ] Implement secondary behavior for Fatigue / Stress / Women / Weight only if already implied by the current v1.0 design and can be done without expanding scope.
- [ ] Secondary screens stay concise and do not duplicate full primary modules.
- [ ] Maximum two secondary concerns remains enforced.
- [ ] Primary concern is not redundantly shown again as secondary.

### Router integration
- [ ] Expand routing so primary concern + secondary concerns + module results produce coherent `router_targets`.
- [ ] `modules_activated` continues to represent actually executed detailed modules, not placeholders.
- [ ] Preserve `null ≠ none ≠ unknown`.
- [ ] Hidden/non-executed branches do not leak stale responses.
- [ ] No new router framework unless required; prefer extension of existing architecture.

### Women / reproductive safety
- [ ] Resolve WOMEN_SAFETY_01 duplicate-skip behavior or remove the duplicate path cleanly.
- [ ] Avoid asking the same pregnancy/postpartum/breastfeeding safety fact twice.
- [ ] Preserve StaffCheck behavior for clinically important safety responses.
- [ ] Do not create duplicate or conflicting red-flag architectures.

### GI/Bowel safety UX
- [ ] Review current GI/Bowel safety flags that exist mainly in Dev JSON.
- [ ] If flagged responses require staff awareness, connect them to the existing StaffCheck UX consistently.
- [ ] Do not over-trigger staff checks for `not_sure` or ambiguous answers.
- [ ] Keep StaffCheck wording patient-friendly and non-diagnostic.

### Navigation / stale cleanup
- [ ] Back-navigation across primary/secondary/module branches preserves only currently valid answers.
- [ ] Changing primary concern removes old primary-module current payload.
- [ ] Removing a secondary concern removes its secondary responses.
- [ ] Conditional text fields clean up when their trigger is deselected.
- [ ] StaffCheck does not create loops when navigating backward/forward.

### Dev JSON / payload
- [ ] Dev JSON clearly separates common responses, module responses, routing, and flags.
- [ ] Non-visible fields remain null, not implicit normal/none.
- [ ] Payload contains no duplicated duration/severity data where common fields already exist.
- [ ] Existing module payload schemas remain backward-compatible where practical.

### UX
- [ ] Review the full flow on the 800×1280 portrait reference.
- [ ] No outer page scrollbar.
- [ ] Only `.shell__main` scrolls when truly needed.
- [ ] Back / Help / progress indicators remain consistent.
- [ ] Patient-facing screens contain no Router / Module / Red Flag / developer terminology.
- [ ] Elderly-user readability and touch targets are preserved.

### Documentation / validation
- [ ] Update Master Spec to reflect integrated routing and secondary-screen behavior.
- [ ] Run `npx tsc -b`.
- [ ] Run `npx vite build`.
- [ ] Run representative end-to-end logical scenarios across at least symptom, women/pregnancy/postpartum, weight, and multi-secondary routes.
- [ ] Provide completion report with changed files, secondary-screen flows, routing behavior, safety behavior, stale-cleanup results, Dev JSON changes, tsc/build, UX review, and remaining issues.

## Handoff
- [ ] After PASS, allow queue auto-advance to Final Regression.
