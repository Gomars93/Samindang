# Task: Patient Tablet → Doctor PC Local Handoff

## Goal
Implement the simplest reliable local handoff so a completed questionnaire and deterministic Myungri calculation can appear on the doctor-facing screen without manual copying.

Use a local-network architecture suitable for clinic pilot testing. Avoid cloud services and EMR integration in this task.

## Design constraints
- Keep patient data inside the clinic LAN for this pilot.
- Prefer a small local Node server/API over browser localStorage hacks.
- Do not add Supabase/Firebase/cloud DB.
- Persist only the minimum needed for pilot reliability.
- Do not expose patient data to the public internet.
- Keep raw questionnaire facts, deterministic Myungri calculation, and clinician-entered judgment as separate data layers.

## Acceptance checklist

### Submission / retrieval
- [x] Add a minimal local server/API for questionnaire submissions.
- [x] Patient app can submit a completed questionnaire plus normalized birth/Myungri calculation payload.
- [x] Server issues a submission ID and timestamp.
- [x] Doctor dashboard can list recent submissions and open one.
- [x] New submissions become visible without manual copy/paste; polling is acceptable for v1 pilot.
- [x] Add status such as new/viewed/in-consultation/completed as appropriate.
- [x] Patient-facing endpoints cannot list or retrieve other patients' submissions.

### Persistence
- [x] Use a simple reliable local persistence method suitable for pilot use.
- [x] Persist questionnaire payload, calculation version/policy, and later clinician judgment without merging them into one opaque blob.
- [x] Restarting the local server does not lose recent submissions.
- [x] Runtime patient-data files are excluded from git.
- [x] Avoid logging full sensitive payloads.

### Configuration
- [x] Bind safely for LAN use.
- [x] Do not hardcode clinic IP addresses.
- [x] Add configurable server host/port and tablet client server URL.
- [x] Add graceful offline/server-unreachable UX.
- [x] Document Windows firewall implications without automatically changing firewall rules.

### Doctor workflow
- [x] Doctor dashboard shows questionnaire summary and deterministic Myungri calculation from the same submission.
- [x] Clinician judgment fields from 0450 can be persisted/reloaded for that submission.
- [x] Viewing a submission can update viewed/status state without altering patient-entered data.
- [x] Safety flags remain prominent.

### Validation / docs
- [x] Add submit/list/open/status/persistence tests where practical.
- [x] Add README/runbook section describing tablet → local server → doctor PC flow.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] No regression in questionnaire, Myungri calculation, or doctor dashboard.
- [x] After PASS, allow queue auto-advance to 0550.
