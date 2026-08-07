# Task: Real-Device Readiness Gate

## Goal
Perform every verification possible without human physical interaction, then stop exactly at the point where real clinic devices/network must be checked by a person.

## Acceptance checklist
- [ ] Run full questionnaire regression.
- [ ] Run doctor dashboard regression.
- [ ] Run deterministic Myungri calculation regression including unknown/unresolved birth-time cases.
- [ ] Verify questionnaire + Myungri calculation stay linked to the same submission ID.
- [ ] Verify clinician judgment save/reload against the correct submission.
- [ ] Run local API submit/list/open/status tests.
- [ ] Run restart/persistence test.
- [ ] Run malformed payload validation tests.
- [ ] Run duplicate submission test.
- [ ] Run simulated multiple-patient submissions.
- [ ] Verify no patient runtime data is tracked by git.
- [ ] Verify no API keys/secrets are present in repo.
- [ ] Verify local server is not configured for public internet exposure.
- [ ] Verify all documented startup commands are internally consistent.
- [ ] Produce exact real-device pilot checklist requiring human action only for:
      1) doctor PC server start,
      2) Windows firewall/LAN reachability if prompted,
      3) tablet opening the configured LAN URL,
      4) one test questionnaire submission,
      5) confirming it appears correctly on the doctor PC.
- [ ] Clearly state the exact commands/URLs/config values to use, but do not invent a LAN IP; provide command to discover it.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] Produce `docs/REAL_DEVICE_PILOT_CHECKLIST.md`.
- [ ] Mark blockers vs non-blockers.
- [ ] Stop after this task. Do not create additional roadmap tasks automatically.
