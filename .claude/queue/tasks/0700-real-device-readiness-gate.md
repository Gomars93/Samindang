# Task: Real-Device Readiness Gate

## Goal
Perform every verification possible without human physical interaction, then stop exactly at the point where real clinic devices/network must be checked by a person.

## Acceptance checklist
- [x] Run full questionnaire regression.
- [x] Run doctor dashboard regression.
- [x] Run deterministic Myungri calculation regression including unknown/unresolved birth-time cases.
- [x] Verify questionnaire + Myungri calculation stay linked to the same submission ID.
- [x] Verify clinician judgment save/reload against the correct submission.
- [x] Run local API submit/list/open/status tests.
- [x] Run restart/persistence test.
- [x] Run malformed payload validation tests.
- [x] Run duplicate submission test.
- [x] Run simulated multiple-patient submissions.
- [x] Verify no patient runtime data is tracked by git.
- [x] Verify no API keys/secrets are present in repo.
- [x] Verify local server is not configured for public internet exposure.
- [x] Verify all documented startup commands are internally consistent.
- [x] Produce exact real-device pilot checklist requiring human action only for:
      1) doctor PC server start,
      2) Windows firewall/LAN reachability if prompted,
      3) tablet opening the configured LAN URL,
      4) one test questionnaire submission,
      5) confirming it appears correctly on the doctor PC.
- [x] Clearly state the exact commands/URLs/config values to use, but do not invent a LAN IP; provide command to discover it.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] Produce `docs/REAL_DEVICE_PILOT_CHECKLIST.md`.
- [x] Mark blockers vs non-blockers.
- [x] Stop after this task. Do not create additional roadmap tasks automatically.
