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
- [x] Primary fatigue activates Fatigue module only.
- [x] Capture fatigue pattern, worst time, and recovery after rest.
- [x] Secondary fatigue does not run full module.
- [x] Leaving primary fatigue stale-cleans module responses.

### Stress
- [x] Primary stress activates Stress module only.
- [x] Capture core stress patterns and associated body symptoms.
- [x] Do not duplicate existing common impact question.
- [x] Secondary stress does not run full module.
- [x] Leaving primary stress stale-cleans module responses.

### Women
- [x] Women-health primary route activates Women module.
- [x] Cover irregular cycle / dysmenorrhea / flow change / premenstrual / discharge-discomfort / menopause / other.
- [x] `other` opens short text and stale-cleans when deselected.
- [x] Menstrual-status detail appears only when relevant.
- [x] Menopause detail appears only when relevant.
- [x] Reproductive-safety questions are not duplicated unnecessarily.
- [x] Leaving women route stale-cleans module responses.

### Pregnancy
- [x] Pregnancy route activates Pregnancy module.
- [x] Capture pregnant / possible / trying / fertility / unknown status.
- [x] Trimester appears only when pregnant.
- [x] Capture main pregnancy-related concerns.
- [x] `other` opens short text and stale-cleans.
- [x] Reuse existing reproductive-safety / StaffCheck architecture.
- [x] Leaving pregnancy route stale-cleans module responses.

### Postpartum
- [x] Postpartum route activates Postpartum module.
- [x] Capture time since delivery.
- [x] Capture main postpartum recovery concerns.
- [x] `other` opens short text and stale-cleans.
- [x] Reuse existing breastfeeding/reproductive-safety data where possible.
- [x] Leaving postpartum route stale-cleans module responses.

### Weight
- [x] Weight route activates Weight module.
- [x] Capture management goal.
- [x] Capture contributing factors.
- [x] Capture recent weight trend.
- [x] Capture prior attempts.
- [x] `unknown` behaves exclusively where appropriate.
- [x] Leaving weight route stale-cleans module responses.

### Shared
- [x] `null ≠ none ≠ unknown` preserved.
- [x] Hidden branch responses removed from current payload.
- [x] Secondary concerns remain router-target placeholders only.
- [x] `responses.modules.*` extended for all six modules.
- [x] `routing.modules_activated` extended correctly.
- [x] No regression to Sleep/GI/Bowel/Urinary/Pain.
- [x] Avoid duplicate common duration/impact/safety questions.
- [x] Patient-facing wording stays simple Korean.
- [x] No developer terminology in patient UI.
- [x] 800×1280 portrait does not introduce outer page scrollbar.

### Documentation / validation
- [x] Update `docs/삼인당_태블릿_상세문진_Master_Spec_v1.0.md`.
- [x] Run `npx tsc -b`.
- [x] Run `npx vite build`.
- [x] Run stale-cleanup / routing logic scenarios where practical.
- [x] Final report includes changed files, each module flow, show_if/exclusive, stale cleanup, safety handling, Dev JSON, modules_activated, common-question deduplication, tsc/build, 800×1280 review, regression result, remaining TODOs.

## Handoff
- [x] After PASS, allow queue auto-advance to 0200 Integration Sprint.
