# Task: Privacy, Session Reset & Audit Hardening

## Goal
Close the privacy/session gaps that matter before real-device use of a clinic tablet containing health and birth information.

## Acceptance checklist

### Tablet privacy
- [x] A completed submission cannot be recovered by pressing Back in the patient UI.
- [x] Patient-identifiable screen state is cleared/reset after successful completion.
- [x] Add inactivity/session expiry behavior appropriate for a shared clinic tablet.
- [x] New patient workflow starts from a clean session.
- [x] Do not leave prior patient's questionnaire visible in browser UI.

### Runtime data
- [x] Runtime patient data remains excluded from git.
- [x] Retention/cleanup configuration is explicit and documented.
- [x] Application logs avoid full questionnaire payloads, birth data, medication/history details, and API keys.
- [x] Error logs use submission IDs where possible rather than patient-identifiable content.

### Doctor access / audit
- [x] Doctor-facing viewing and patient submission paths remain separated.
- [x] Record minimal operational audit events such as submission created/viewed/status-changed without copying the full sensitive payload into logs.
- [x] Document who/what can access locally stored questionnaire data in the pilot architecture.
- [x] Do not claim production-grade authentication if it has not been implemented.

### Version traceability
- [x] Each stored submission includes questionnaire/spec version.
- [x] Myungri calculation records include calculation-policy/version.
- [x] Clinician judgment records include judgment/schema version.
- [x] Timestamps use a consistent documented convention.

### Validation
- [x] Add automated session-reset/privacy tests where practical.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] Update pilot/security documentation.
- [x] After PASS, allow queue auto-advance.
