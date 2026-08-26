# TABLET_V2_TEXT_INPUT_AUDIT.md

Tablet Questionnaire Routing/UX v2 — full audit of every `short_text` question
that existed in `src/spec/coreSpec.ts` before this task, per each field:
current wording, display condition, keep/remove/convert decision and reason,
DoctorView replacement cue, and safety impact.

This is a UI/routing-expression and input-minimization change only. No
clinical threshold, safety rule, or enum meaning changes. Fields tied to a
CLOSED clinical module's own safety questions (e.g. `PAIN_02`/`LBP_*`/
`NECK_*`/... free-standing safety text inputs) do not exist in this codebase
as `short_text` — every CLOSED module's protected safety inputs are already
`single_choice`/`multi_choice`, so none required the "do not delete" carve-out
in practice; this was confirmed by inspecting every `short_text` id below and
cross-checking it does not appear in any `src/spec/*Logic.ts` / `*Adapter.ts`.

## Summary

| Before | After |
|---|---|
| 12 `short_text` questions | 1 `short_text` question (`ID_01`, patient name — explicitly exempted, §22) |

11 of 12 free-text screens were removed or converted to choice-based input.
`ID_02` (phone last 4 digits) was already `numeric`, not `short_text`, and is
also explicitly exempted (§22); it is listed here for completeness only.

## Per-field audit

### ID_01 — patient name (KEEP, exempt)
- Screen id: `ID_01`
- Wording: "이름을 입력해주세요" (unchanged)
- Display condition: always (patient identity step)
- Decision: **KEEP** — explicitly excluded from this task's minimization
  effort (§22: name and last-4 phone digits stay free/numeric input).
- Reason: identity fields are not clinical free text; no clinician
  confirmation workflow applies.
- DoctorView replacement cue: none (not applicable — value shown directly).
- Safety impact: none.

### ID_02 — phone last 4 digits (KEEP, exempt)
- Screen id: `ID_02`
- Input type: `numeric` (not `short_text`, listed for completeness)
- Decision: **KEEP** — same §22 exemption as `ID_01`.
- Safety impact: none.

### VISIT_02A_SYMPTOM_OTHER (REMOVED)
- Screen id: `VISIT_02A_SYMPTOM_OTHER`
- Old wording: "가장 불편한 증상을 짧게 적어주세요."
- Old display condition: `VISIT_02_SYMPTOM_MAIN === 'other'`
- Decision: **REMOVE** — the parent question `VISIT_02_SYMPTOM_MAIN` keeps
  its `'other'` option/value; only the follow-up free-text screen is
  removed.
- Reason: §12 priority target ("기타 주호소"). The choice itself
  (`primary_symptom: 'other'`) is fully sufficient for triage; the detail is
  not needed before the doctor sees the patient.
- DoctorView replacement cue: folded into the shared "기타 확인" bucket cue
  (`otherDetailFlags` in `DoctorView.tsx`) as "기타 주호소" when
  `visit_goal.primary_symptom === 'other'`, rendered as
  "기타 주호소, ... — 진료 중 확인".
- Safety impact: none — `primary_symptom: 'other'` was already a valid,
  fully-routed payload value before this change; global safety screening
  (`SAFETY_01` etc.) is entirely independent of this field.

### SECONDARY_01A (REMOVED)
- Screen id: `SECONDARY_01A`
- Old wording: "가장 불편한 그 밖의 증상을 짧게 적어주세요."
- Old display condition: `SECONDARY_01` includes `'other'`
- Decision: **REMOVE** — §12 priority target ("secondary other").
- Reason: same rationale as above; the `'other'` flag in
  `secondary_concerns` is preserved in the payload.
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 동반증상"
  when `secondary_concerns.secondary_concerns` includes `'other'`.
- Safety impact: none — secondary concern routing (`SEC_*` module screens)
  is keyed off the category value, never off this free-text field.

### SLEEP_03A (REMOVED)
- Screen id: `SLEEP_03A`
- Old wording: "다른 이유가 있다면 짧게 적어주세요."
- Old display condition: primary=sleep AND `SLEEP_03` includes `'other'`
- Decision: **REMOVE** — §13 "other-text series", not tied to a CLOSED
  module safety input (Sleep module has no CLOSED/FROZEN status).
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 수면 원인"
  when `modules.sleep.awakening_reasons` includes `'other'`.
- Safety impact: none — sleep safety flags (`sleep_disorder_review`,
  `witnessed_apnea`, etc.) are computed from other, unaffected fields.

### PAIN_01A (REMOVED)
- Screen id: `PAIN_01A`
- Old wording: "어느 부위인지 짧게 적어주세요."
- Old display condition: primary=pain AND `PAIN_01 === 'other'`
- Decision: **REMOVE** — §13 other-text series; `PAIN_01` itself is
  unaffected (still the existing enum, still routes CLOSED regional modules
  for every non-`'other'` value).
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 통증 부위"
  when `modules.pain.primary_location === 'other'`.
- Safety impact: none — `'other'` was never a value any CLOSED regional
  module (LBP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND/ANKLE_FOOT/HIP/TMJ)
  routes on; those modules only activate on their own specific `PAIN_01`
  enum values, which are untouched.

### PAIN_04A (REMOVED)
- Screen id: `PAIN_04A`
- Old wording: "어디로 퍼지는지 짧게 적어주세요."
- Old display condition: primary=pain AND `PAIN_04 === 'other'`
- Decision: **REMOVE** — §13 other-text series.
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 방사통 부위"
  when `modules.pain.radiation === 'other'`.
- Safety impact: none — radiation detail text was descriptive only; no
  CLOSED module logic reads `PAIN_04A`/`radiation_other`.

### WOMEN_01A (REMOVED)
- Screen id: `WOMEN_01A`
- Old wording: "어떤 내용인지 짧게 적어주세요."
- Old display condition: primary=women AND `WOMEN_01` includes `'other'`
- Decision: **REMOVE** — §13 other-text series.
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 여성 건강
  상담" when `modules.women.problems` includes `'other'`.
- Safety impact: none — Women module safety (`WOMEN_SAFETY_01` reproductive
  status) is a separate, always-shown question untouched by this removal.

### PREGNANCY_03A (REMOVED)
- Screen id: `PREGNANCY_03A`
- Old wording: "어떤 내용인지 짧게 적어주세요."
- Old display condition: primary=pregnancy AND `PREGNANCY_03` includes
  `'other'`
- Decision: **REMOVE** — §13 other-text series.
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 임신 상담"
  when `modules.pregnancy.concerns` includes `'other'`.
- Safety impact: none.

### POSTPARTUM_02A (REMOVED)
- Screen id: `POSTPARTUM_02A`
- Old wording: "어떤 내용인지 짧게 적어주세요."
- Old display condition: primary=postpartum AND `POSTPARTUM_02` includes
  `'other'`
- Decision: **REMOVE** — §13 other-text series.
- DoctorView replacement cue: shared "기타 확인" bucket, "기타 산후 상담"
  when `modules.postpartum.problems` includes `'other'`.
- Safety impact: none.

### ALLERGY_02 (CONVERTED, not removed — §14 exception)
- Screen id: `ALLERGY_02`
- Old wording: "어떤 알레르기나 이상반응이 있었는지 짧게 적어주세요."
  (`short_text`, freeform)
- New wording: "어떤 종류의 알레르기·이상반응이었나요?" (`multi_choice`)
  with options 약(medication) / 음식(food) / 한약(herbal) /
  주사·약침(injection) / 기타(other) / 잘 모르겠음(unknown)
- Display condition: unchanged — `ALLERGY_01 === 'yes'`
- Decision: **CONVERT to category selection**, per §14's explicit exception
  ("keep only '있음', don't lose info — convert free text to category
  selection"). This is the only field converted rather than removed
  outright, because the allergy signal is a pre-treatment/pre-injection
  safety cue for the clinician, not merely descriptive color.
- Reason: category selection keeps the clinically useful signal (which
  broad class of allergy/reaction) without requiring patient handwriting
  input, while still flagging "care before medication/acupuncture-injection"
  the same way free text did.
- DoctorView replacement cue: the existing `SafetyGlanceItems` allergy entry
  now renders the selected categories directly (via `answerLabel('ALLERGY_02', ...)`,
  falling back to "있음" if somehow empty), framed as "약물 투여/시침 전
  확인" context — no new clinical threshold introduced; this is presentation
  of an already-structured answer, not a new inference.
- Safety impact: none — no clinical logic reads `ALLERGY_02`'s value for any
  automated decision; it has always been clinician-facing informational
  content only.

### SURGERY_02 (REMOVED)
- Screen id: `SURGERY_02`
- Old wording: "어떤 수술·입원이었는지 중요한 내용만 짧게 적어주세요."
- Old display condition: `SURGERY_01 === 'yes'`
- Decision: **REMOVE**. `SURGERY_01` itself gains a `layout: 'compact3'`
  hint and a third `'unknown'` option ("잘 모르겠어요") per §12, so the
  patient now only ever answers 있음/없음/잘 모르겠음.
- Reason: §12 priority target. History detail (type/timing of surgery) is
  something the clinician needs to ask directly during the visit anyway;
  keeping it as tablet free text added patient burden without adding
  triage value.
- DoctorView replacement cue: new dedicated cue — "수술·입원력" / "있음 —
  종류/시기 확인" — added to `safetyGlanceItems()` whenever
  `surgery_history.surgery_yn === 'yes'`.
- Safety impact: none — no CLOSED module reads surgical history text; it
  was always narrative-only.

### FREE_02 (REMOVED)
- Screen id: `FREE_02`
- Old wording: "원장에게 전하고 싶은 내용을 적어주세요." (max 100 chars)
- Old display condition: `FREE_01 === 'yes'`
- Decision: **REMOVE**. `FREE_01` (yes/no "문진에서 묻지 않았지만 원장에게
  꼭 말씀하고 싶은 내용이 있나요?") is kept as-is.
- Reason: §12 priority target. The yes/no flag alone is sufficient to
  prompt the clinician to ask in person; the free-text detail is not needed
  for triage and is the single largest source of unstructured PHI-adjacent
  patient input in this screen.
- DoctorView replacement cue: new dedicated cue — "추가로 전달할 내용" /
  "있음 — 진료 중 확인" — added to `safetyGlanceItems()` whenever
  `free_text.free_text_yn === 'yes'`.
- Safety impact: none — `FREE_02` was never read by any clinical logic
  path; it was patient-to-doctor narrative only.

## Cue priority ordering (§21)

`safetyGlanceItems()` in `src/doctor/DoctorView.tsx` appends the new cues in
this fixed order, after every pre-existing item, so that none of them can
ever visually outrank the urgent safety banner or the pre-existing
red-flag/medication items:

1. Safety/urgent (pre-existing, unchanged — general_red, module-specific
   review flags, sleep disorder screen, response-consistency review)
2. Medication/allergy (pre-existing, unchanged)
3. Surgery/history — **new** (수술·입원력)
4. Patient wants clinician follow-up — **new** (추가 전달사항)
5. Other-detail confirmation — **new**, single combined "기타 확인" badge
   aggregating all 7 "other"-selected flags to avoid badge clutter

All five new/adjusted cue types use only "확인 필요" / "진료 중 확인" /
"— 종류/시기 확인" wording — never a diagnosis or objective finding. Patient
selection alone never produces a clinical conclusion.
