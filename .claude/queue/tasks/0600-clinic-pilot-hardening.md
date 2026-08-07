# Task: Clinic Pilot Hardening

## Goal
Harden the local tablet-to-doctor workflow so it is ready for a supervised real-device clinic pilot.

## Acceptance checklist
- [x] Review patient-data minimization and runtime storage location.
- [x] Add automatic cleanup/retention configuration suitable for pilot data.
- [x] Add safe handling for duplicate submissions / accidental resubmit.
- [x] Add clear tablet success screen after submission.
- [x] Add clear doctor-side new submission indicator.
- [x] Add empty/loading/error states.
- [x] Add restart recovery so recent submissions are not lost after server restart.
- [x] Add basic concurrency handling for multiple tablets/submissions.
- [x] Confirm deterministic Myungri calculation travels with the correct submission and cannot become associated with another patient.
- [x] Confirm clinician-entered Myungri judgment persists/reloads against the correct submission ID.
- [x] Confirm patient-facing app cannot browse other patients' submissions.
- [x] Confirm doctor-facing endpoints/views are separated from patient submission flow as much as practical for LAN pilot.
- [x] No secrets or patient runtime data are committed to git.
- [x] Add a pilot runbook: server start, tablet URL, doctor dashboard URL, shutdown, backup/cleanup, troubleshooting.
- [x] Add one-command or minimal-command startup scripts where practical on Windows.
- [x] Run automated regression tests.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] After PASS, allow queue auto-advance.
