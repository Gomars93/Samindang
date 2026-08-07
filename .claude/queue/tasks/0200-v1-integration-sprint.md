# Task: v1.0 Integration Sprint

## Goal
Integrate the completed primary-detail modules into a coherent questionnaire flow and finish the deferred cross-module routing work.

## Scope
Focus only on integration of the existing questionnaire v1.0. Do not add backend, DB, AI/LLM features, EMR integration, or unrelated refactors.

## Acceptance checklist

### Secondary short screens
- [x] Implement short-screen behavior for secondary Sleep.
- [x] Implement short-screen behavior for secondary GI.
- [x] Implement short-screen behavior for secondary Bowel.
- [x] Implement short-screen behavior for secondary Urinary.
- [x] Implement short-screen behavior for secondary Pain.
- [x] Implement secondary behavior for Fatigue / Stress / Women / Weight only if already implied by the current v1.0 design and can be done without expanding scope.
- [x] Secondary screens stay concise and do not duplicate full primary modules.
- [x] Maximum two secondary concerns remains enforced.
- [x] Primary concern is not redundantly shown again as secondary.

### Router integration
- [x] Expand routing so primary concern + secondary concerns + module results produce coherent `router_targets`.
- [x] `modules_activated` continues to represent actually executed detailed modules, not placeholders.
- [x] Preserve `null ≠ none ≠ unknown`.
- [x] Hidden/non-executed branches do not leak stale responses.
- [x] No new router framework unless required; prefer extension of existing architecture.

### Women / reproductive safety
- [x] Resolve WOMEN_SAFETY_01 duplicate-skip behavior or remove the duplicate path cleanly.
- [x] Avoid asking the same pregnancy/postpartum/breastfeeding safety fact twice.
- [x] Preserve StaffCheck behavior for clinically important safety responses.
- [x] Do not create duplicate or conflicting red-flag architectures.

### GI/Bowel safety UX
- [x] Review current GI/Bowel safety flags that exist mainly in Dev JSON.
- [x] If flagged responses require staff awareness, connect them to the existing StaffCheck UX consistently.
- [x] Do not over-trigger staff checks for `not_sure` or ambiguous answers.
- [x] Keep StaffCheck wording patient-friendly and non-diagnostic.

### Navigation / stale cleanup
- [x] Back-navigation across primary/secondary/module branches preserves only currently valid answers.
- [x] Changing primary concern removes old primary-module current payload.
- [x] Removing a secondary concern removes its secondary responses.
- [x] Conditional text fields clean up when their trigger is deselected.
- [x] StaffCheck does not create loops when navigating backward/forward.

### Dev JSON / payload
- [x] Dev JSON clearly separates common responses, module responses, routing, and flags.
- [x] Non-visible fields remain null, not implicit normal/none.
- [x] Payload contains no duplicated duration/severity data where common fields already exist.
- [x] Existing module payload schemas remain backward-compatible where practical.

### UX
- [x] Review the full flow on the 800×1280 portrait reference.
- [x] No outer page scrollbar.
- [x] Only `.shell__main` scrolls when truly needed.
- [x] Back / Help / progress indicators remain consistent.
- [x] Patient-facing screens contain no Router / Module / Red Flag / developer terminology.
- [x] Elderly-user readability and touch targets are preserved.

### Documentation / validation
- [x] Update Master Spec to reflect integrated routing and secondary-screen behavior.
- [x] Run `npx tsc -b`.
- [x] Run `npx vite build`.
- [x] Run representative end-to-end logical scenarios across at least symptom, women/pregnancy/postpartum, weight, and multi-secondary routes.
- [x] Provide completion report with changed files, secondary-screen flows, routing behavior, safety behavior, stale-cleanup results, Dev JSON changes, tsc/build, UX review, and remaining issues.

## Handoff
- [x] After PASS, allow queue auto-advance to Final Regression.
