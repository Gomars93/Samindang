# Task: Doctor Dashboard / Clinical Summary View

## Goal
Build a doctor-facing result screen that converts completed patient questionnaire responses into a concise clinical pre-visit summary suitable for viewing on the doctor's computer.

## Acceptance checklist
- [ ] Add a doctor-facing route/view separate from the patient questionnaire UI.
- [ ] Summarize patient identity, primary concern, secondary concerns, duration, impact, activated modules, safety/staff-check flags, medications/history/allergy/surgery/reproductive safety, and final free text.
- [ ] Prioritize safety items and chief complaint above lower-value details.
- [ ] Distinguish patient-entered facts from derived routing/flags.
- [ ] Do not generate medical diagnoses or treatment recommendations.
- [ ] Hide null/non-asked fields rather than displaying them as normal.
- [ ] Preserve `none`, `unknown`, and actual answers distinctly.
- [ ] Use easy-to-scan Korean labels appropriate for a clinician.
- [ ] Provide expandable/raw-answer detail without cluttering the default summary.
- [ ] Make the view usable on a normal desktop monitor.
- [ ] Add representative mock fixtures for major routes.
- [ ] Do not require EMR integration yet.
- [ ] Update Master Spec with doctor-view data contract and display hierarchy.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] After PASS, allow queue auto-advance.
