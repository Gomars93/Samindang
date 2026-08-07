# Task: Privacy, Session Reset & Audit Hardening

## Goal
Close the privacy/session gaps that matter before real-device use of a clinic tablet containing health and birth information.

## Acceptance checklist

### Tablet privacy
- [ ] A completed submission cannot be recovered by pressing Back in the patient UI.
- [ ] Patient-identifiable screen state is cleared/reset after successful completion.
- [ ] Add inactivity/session expiry behavior appropriate for a shared clinic tablet.
- [ ] New patient workflow starts from a clean session.
- [ ] Do not leave prior patient's questionnaire visible in browser UI.

### Runtime data
- [ ] Runtime patient data remains excluded from git.
- [ ] Retention/cleanup configuration is explicit and documented.
- [ ] Application logs avoid full questionnaire payloads, birth data, medication/history details, and API keys.
- [ ] Error logs use submission IDs where possible rather than patient-identifiable content.

### Doctor access / audit
- [ ] Doctor-facing viewing and patient submission paths remain separated.
- [ ] Record minimal operational audit events such as submission created/viewed/status-changed without copying the full sensitive payload into logs.
- [ ] Document who/what can access locally stored questionnaire data in the pilot architecture.
- [ ] Do not claim production-grade authentication if it has not been implemented.

### Version traceability
- [ ] Each stored submission includes questionnaire/spec version.
- [ ] Myungri calculation records include calculation-policy/version.
- [ ] Clinician judgment records include judgment/schema version.
- [ ] Timestamps use a consistent documented convention.

### Validation
- [ ] Add automated session-reset/privacy tests where practical.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] Update pilot/security documentation.
- [ ] After PASS, allow queue auto-advance.
