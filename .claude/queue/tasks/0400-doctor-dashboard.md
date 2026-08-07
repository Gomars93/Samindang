# Task: Doctor Dashboard / Clinical Summary View

## Goal
Build a doctor-facing result screen that converts completed patient questionnaire responses into a concise clinical pre-visit summary suitable for viewing on the doctor's computer.

## Acceptance checklist
- [x] Add a doctor-facing route/view separate from the patient questionnaire UI.
- [x] Summarize patient identity, primary concern, secondary concerns, duration, impact, activated modules, safety/staff-check flags, medications/history/allergy/surgery/reproductive safety, and final free text.
- [x] Prioritize safety items and chief complaint above lower-value details.
- [x] Distinguish patient-entered facts from derived routing/flags.
- [x] Do not generate medical diagnoses or treatment recommendations.
- [x] Hide null/non-asked fields rather than displaying them as normal.
- [x] Preserve `none`, `unknown`, and actual answers distinctly.
- [x] Use easy-to-scan Korean labels appropriate for a clinician.
- [x] Provide expandable/raw-answer detail without cluttering the default summary.
- [x] Make the view usable on a normal desktop monitor.
- [x] Add representative mock fixtures for major routes.
- [x] Do not require EMR integration yet.
- [x] Update Master Spec with doctor-view data contract and display hierarchy.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] After PASS, allow queue auto-advance.
