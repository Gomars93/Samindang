# Task: v1.0 Final Regression & Release Check

## Goal
Treat the questionnaire as a near-release v1.0 prototype and perform a final regression, consistency, safety, UX, and documentation pass.

This task is primarily verification and targeted fixes. Avoid redesigning working modules.

## Acceptance checklist

### Full route coverage
- [ ] Verify female first screen route.
- [ ] Verify male first screen route.
- [ ] Verify symptom primary routes: Sleep, GI, Bowel, Pain, Urinary, Fatigue, Stress.
- [ ] Verify Women route.
- [ ] Verify Pregnancy route.
- [ ] Verify Postpartum route.
- [ ] Verify Weight route.
- [ ] Verify constitution/tonic route remains functional.
- [ ] Verify secondary concern selection and max-two behavior.
- [ ] Verify representative combinations of primary + two secondary concerns.

### Stale cleanup
- [ ] Change every major primary route away and back; old hidden module responses do not leak.
- [ ] Conditional `other` text is nulled after trigger deselection.
- [ ] Conditional nocturia/incontinence/radiation/etc. branches clean correctly.
- [ ] Women/Pregnancy/Postpartum conditional branches clean correctly.
- [ ] Secondary removal cleans secondary answers.
- [ ] Dev JSON demonstrates `null ≠ none ≠ unknown`.

### Safety
- [ ] Common SAFETY_01 still triggers StaffCheck correctly.
- [ ] GI/Bowel module safety triggers behave correctly.
- [ ] Reproductive safety does not duplicate or conflict.
- [ ] `not_sure` does not incorrectly trigger urgent staff review unless explicitly intended.
- [ ] StaffCheck does not diagnose conditions.
- [ ] Back/forward navigation does not repeatedly trap the patient in StaffCheck loops.

### UX / 800×1280
- [ ] Review every screen for the 800×1280 portrait reference.
- [ ] No outer page scrollbar.
- [ ] Long option lists use inner scroll only.
- [ ] Question, option, button sizing remain consistent.
- [ ] Long Korean text does not overflow or truncate.
- [ ] SingleChoice remains `선택 → 계속`.
- [ ] MultiChoice remains `선택 완료`.
- [ ] Back / Help behavior is consistent.
- [ ] Progress labeling is understandable to patients.
- [ ] No developer terminology appears in patient UI.

### Data / routing consistency
- [ ] `routing.router_targets` matches current selections.
- [ ] `routing.modules_activated` matches actually executed modules only.
- [ ] No stale module object fields retain hidden values.
- [ ] No common duration/impact/safety duplication inside module payloads.
- [ ] Dev JSON remains readable and internally consistent.

### Code quality / regression
- [ ] No unnecessary new architecture introduced.
- [ ] Existing shared components are reused.
- [ ] No dead duplicate questions or obsolete route branches remain.
- [ ] No accidental changes to unrelated app behavior.
- [ ] Git diff is reviewed for unintended files.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.

### Master Spec
- [ ] Master Spec accurately matches implementation.
- [ ] Section numbering is consistent.
- [ ] Primary-only vs secondary-short behavior is clearly documented.
- [ ] Safety / StaffCheck behavior is documented.
- [ ] Deferred v1.1 items are listed separately instead of silently left ambiguous.

### Final report
- [ ] Provide a concise v1.0 readiness report.
- [ ] State any remaining blocker as BLOCKER / NON-BLOCKER.
- [ ] If no questionnaire-core blocker remains, explicitly state `questionnaire core v1.0 ready for Saju / doctor-dashboard integration`.
- [ ] List only genuinely deferred items for future versions.

## Handoff
- [ ] After PASS, allow queue auto-advance to 0350 Saju Birth Data Engine.
