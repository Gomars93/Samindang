# Task: Clinic Pilot Hardening

## Goal
Harden the local tablet-to-doctor workflow so it is ready for a supervised real-device clinic pilot.

## Acceptance checklist
- [ ] Review patient-data minimization and runtime storage location.
- [ ] Add automatic cleanup/retention configuration suitable for pilot data.
- [ ] Add safe handling for duplicate submissions / accidental resubmit.
- [ ] Add clear tablet success screen after submission.
- [ ] Add clear doctor-side new submission indicator.
- [ ] Add empty/loading/error states.
- [ ] Add restart recovery so recent submissions are not lost after server restart.
- [ ] Add basic concurrency handling for multiple tablets/submissions.
- [ ] Confirm deterministic Myungri calculation travels with the correct submission and cannot become associated with another patient.
- [ ] Confirm clinician-entered Myungri judgment persists/reloads against the correct submission ID.
- [ ] Confirm patient-facing app cannot browse other patients' submissions.
- [ ] Confirm doctor-facing endpoints/views are separated from patient submission flow as much as practical for LAN pilot.
- [ ] No secrets or patient runtime data are committed to git.
- [ ] Add a pilot runbook: server start, tablet URL, doctor dashboard URL, shutdown, backup/cleanup, troubleshooting.
- [ ] Add one-command or minimal-command startup scripts where practical on Windows.
- [ ] Run automated regression tests.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] After PASS, allow queue auto-advance.
