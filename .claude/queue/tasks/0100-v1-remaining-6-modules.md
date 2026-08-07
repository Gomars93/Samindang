# Task: v1.0 Remaining 6 Modules Sprint

## Goal
Implement the remaining six primary-detail modules:
- Fatigue
- Stress
- Women
- Pregnancy
- Postpartum
- Weight

Reuse the existing architecture and patterns already established by Sleep / GI / Bowel / Urinary / Pain.

## Scope
- Implement only these six modules.
- Reuse existing `showIf`, `pruneStaleResponses`, `modulesActivated`, payload grouping, StaffCheck/safety patterns, and shared UI components.
- Preserve primary-detail / secondary-placeholder policy.
- Do not implement secondary short screens, Router expansion, WOMEN_SAFETY_01 duplicate-skip logic, backend, DB, AI, EMR, or unrelated refactors.

## Acceptance checklist

### Fatigue
- [ ] Primary fatigue activates Fatigue module only.
- [ ] Capture fatigue pattern, worst time, and recovery after rest.
- [ ] Secondary fatigue does not run full module.
- [ ] Leaving primary fatigue stale-cleans module responses.

### Stress
- [ ] Primary stress activates Stress module only.
- [ ] Capture core stress patterns and associated body symptoms.
- [ ] Do not duplicate existing common impact question.
- [ ] Secondary stress does not run full module.
- [ ] Leaving primary stress stale-cleans module responses.

### Women
- [ ] Women-health primary route activates Women module.
- [ ] Cover irregular cycle / dysmenorrhea / flow change / premenstrual / discharge-discomfort / menopause / other.
- [ ] `other` opens short text and stale-cleans when deselected.
- [ ] Menstrual-status detail appears only when relevant.
- [ ] Menopause detail appears only when relevant.
- [ ] Reproductive-safety questions are not duplicated unnecessarily.
- [ ] Leaving women route stale-cleans module responses.

### Pregnancy
- [ ] Pregnancy route activates Pregnancy module.
- [ ] Capture pregnant / possible / trying / fertility / unknown status.
- [ ] Trimester appears only when pregnant.
- [ ] Capture main pregnancy-related concerns.
- [ ] `other` opens short text and stale-cleans.
- [ ] Reuse existing reproductive-safety / StaffCheck architecture.
- [ ] Leaving pregnancy route stale-cleans module responses.

### Postpartum
- [ ] Postpartum route activates Postpartum module.
- [ ] Capture time since delivery.
- [ ] Capture main postpartum recovery concerns.
- [ ] `other` opens short text and stale-cleans.
- [ ] Reuse existing breastfeeding/reproductive-safety data where possible.
- [ ] Leaving postpartum route stale-cleans module responses.

### Weight
- [ ] Weight route activates Weight module.
- [ ] Capture management goal.
- [ ] Capture contributing factors.
- [ ] Capture recent weight trend.
- [ ] Capture prior attempts.
- [ ] `unknown` behaves exclusively where appropriate.
- [ ] Leaving weight route stale-cleans module responses.

### Shared
- [ ] `null ≠ none ≠ unknown` preserved.
- [ ] Hidden branch responses removed from current payload.
- [ ] Secondary concerns remain router-target placeholders only.
- [ ] `responses.modules.*` extended for all six modules.
- [ ] `routing.modules_activated` extended correctly.
- [ ] No regression to Sleep/GI/Bowel/Urinary/Pain.
- [ ] Avoid duplicate common duration/impact/safety questions.
- [ ] Patient-facing wording stays simple Korean.
- [ ] No developer terminology in patient UI.
- [ ] 800×1280 portrait does not introduce outer page scrollbar.

### Documentation / validation
- [ ] Update `docs/삼인당_태블릿_상세문진_Master_Spec_v1.0.md`.
- [ ] Run `npx tsc -b`.
- [ ] Run `npx vite build`.
- [ ] Run stale-cleanup / routing logic scenarios where practical.
- [ ] Final report includes changed files, each module flow, show_if/exclusive, stale cleanup, safety handling, Dev JSON, modules_activated, common-question deduplication, tsc/build, 800×1280 review, regression result, remaining TODOs.

## Handoff
- [ ] After PASS, allow queue auto-advance to 0200 Integration Sprint.
