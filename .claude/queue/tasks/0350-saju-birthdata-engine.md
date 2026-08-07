# Task: Saju Birth Data & Deterministic Calendar Engine

## Goal
Add the birth-data pipeline required by the original Samindang Myungri clinical plan before the doctor dashboard work begins.

This task is an MVP calculation/data task, not an autonomous Myungri interpretation task.

## Source-of-truth design
The established plan requires:
- birth date
- sex
- solar / lunar / unknown calendar basis
- birth-time branch using 12 traditional two-hour periods (12시진) with an explicit unknown option
- deterministic calendar/Saju calculation
- human clinician remains responsible for Myungri interpretation

Do not let an LLM freely infer the Four Pillars or clinical meaning.

## Acceptance checklist

### Birth input UX
- [ ] Review the current birth-information screens and reconcile them with the original 12시진 design.
- [ ] Preserve birth date and sex from existing patient data rather than asking twice.
- [ ] Provide solar / lunar / unknown explicitly.
- [ ] Provide 12 time ranges in patient-friendly clock-time labels, with 자·축·인·묘... shown only as secondary labels.
- [ ] Provide `잘 모르겠어요`.
- [ ] If the existing UI already captures exact/approximate time, retain compatibility but map the value deterministically to the 12시진 representation; do not force duplicate entry.
- [ ] For lunar dates, do not silently guess leap-month status. If conversion is ambiguous, represent leap-month status explicitly as yes/no/unknown or mark conversion as unresolved.
- [ ] Free text is avoided unless technically unavoidable.
- [ ] Elderly usability and 800×1280 layout are preserved.

### Deterministic calculation
- [ ] Implement an independent Myungri/calendar calculation module separated from questionnaire UI code.
- [ ] Produce a structured calculation result with at least year/month/day/hour pillar fields where deterministically resolvable.
- [ ] Preserve the original raw input alongside normalized/calculated values.
- [ ] Record calculation library/algorithm version and timestamp.
- [ ] Never use an LLM to calculate calendar conversion or pillars.
- [ ] Add boundary tests around day/month/year transitions and all 12 time periods.
- [ ] Add tests for solar/lunar conversion paths that the chosen library supports.
- [ ] If an input cannot be resolved safely, return an explicit unresolved state instead of guessing.

### Unresolved policy guardrails
The original plan explicitly left these for clinician agreement:
- 야자시/조자시
- 진태양시 correction
- detailed birth-time rules
- clinical importance of the hour pillar

- [ ] Do not silently choose a controversial rule.
- [ ] Expose the calculation policy/version in developer/doctor data.
- [ ] Default unresolved policy decisions to a documented conservative mode and flag them for later clinician confirmation.
- [ ] Add a `docs/MYUNGri_CALCULATION_POLICY_PENDING.md` (or equivalent) listing the exact choices Park Kyungnam must eventually approve.

### Payload
- [ ] Add a stable `birth_info` / `myungri_calculation` data contract.
- [ ] Preserve `unknown` as unknown; do not convert it to a normal value.
- [ ] Calculation output is available to the future doctor dashboard and local handoff API.
- [ ] No autonomous clinical interpretation is added.

### Documentation / validation
- [ ] Update Master Spec with birth-data UX and deterministic calculation contract.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] Relevant calculation/unit tests pass.
- [ ] Final report states exactly which Myungri rules are implemented vs intentionally pending.
- [ ] After PASS, allow queue auto-advance.
