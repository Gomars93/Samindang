# Task: v1.0 Final Regression & Release Check

## Goal
Treat the questionnaire as a near-release v1.0 prototype and perform a final regression, consistency, safety, UX, and documentation pass.

This task is primarily verification and targeted fixes. Avoid redesigning working modules.

## Acceptance checklist

### Full route coverage
- [x] Verify female first screen route.
- [x] Verify male first screen route.
- [x] Verify symptom primary routes: Sleep, GI, Bowel, Pain, Urinary, Fatigue, Stress.
- [x] Verify Women route.
- [x] Verify Pregnancy route.
- [x] Verify Postpartum route.
- [x] Verify Weight route.
- [x] Verify constitution/tonic route remains functional.
- [x] Verify secondary concern selection and max-two behavior.
- [x] Verify representative combinations of primary + two secondary concerns.

### Stale cleanup
- [x] Change every major primary route away and back; old hidden module responses do not leak.
- [x] Conditional `other` text is nulled after trigger deselection.
- [x] Conditional nocturia/incontinence/radiation/etc. branches clean correctly.
- [x] Women/Pregnancy/Postpartum conditional branches clean correctly.
- [x] Secondary removal cleans secondary answers.
- [x] Dev JSON demonstrates `null ≠ none ≠ unknown`.

### Safety
- [x] Common SAFETY_01 still triggers StaffCheck correctly.
- [x] GI/Bowel module safety triggers behave correctly.
- [x] Reproductive safety does not duplicate or conflict.
- [x] `not_sure` does not incorrectly trigger urgent staff review unless explicitly intended.
- [x] StaffCheck does not diagnose conditions.
- [x] Back/forward navigation does not repeatedly trap the patient in StaffCheck loops.

### UX / 800×1280
- [x] Review every screen for the 800×1280 portrait reference.
- [x] No outer page scrollbar.
- [x] Long option lists use inner scroll only.
- [x] Question, option, button sizing remain consistent.
- [x] Long Korean text does not overflow or truncate.
- [x] SingleChoice remains `선택 → 계속`.
- [x] MultiChoice remains `선택 완료`.
- [x] Back / Help behavior is consistent.
- [x] Progress labeling is understandable to patients.
- [x] No developer terminology appears in patient UI.

### Data / routing consistency
- [x] `routing.router_targets` matches current selections.
- [x] `routing.modules_activated` matches actually executed modules only.
- [x] No stale module object fields retain hidden values.
- [x] No common duration/impact/safety duplication inside module payloads.
- [x] Dev JSON remains readable and internally consistent.

### Code quality / regression
- [x] No unnecessary new architecture introduced.
- [x] Existing shared components are reused.
- [x] No dead duplicate questions or obsolete route branches remain.
- [x] No accidental changes to unrelated app behavior.
- [x] Git diff is reviewed for unintended files.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.

### Master Spec
- [x] Master Spec accurately matches implementation.
- [x] Section numbering is consistent.
- [x] Primary-only vs secondary-short behavior is clearly documented.
- [x] Safety / StaffCheck behavior is documented.
- [x] Deferred v1.1 items are listed separately instead of silently left ambiguous.

### Final report
- [x] Provide a concise v1.0 readiness report.
- [x] State any remaining blocker as BLOCKER / NON-BLOCKER.
- [x] If no questionnaire-core blocker remains, explicitly state `questionnaire core v1.0 ready for Saju / doctor-dashboard integration`.
- [x] List only genuinely deferred items for future versions.

## Handoff
- [x] After PASS, allow queue auto-advance to 0350 Saju Birth Data Engine.
