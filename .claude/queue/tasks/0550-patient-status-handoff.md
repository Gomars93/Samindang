# Task: Patient Completion / Preparation Status Flow

## Goal
Complete the patient-facing handoff state after questionnaire submission so the waiting experience matches the original operating plan and staff do not need to manually explain every step.

## Acceptance checklist
- [ ] After successful submission, clear questionnaire entry controls from the patient-facing screen.
- [ ] Show a simple patient status flow:
      접수 완료 → 상세문진 완료 → 체질분석 준비 중 → 원장님 진료
- [ ] Do not promise an exact appointment minute.
- [ ] If a waiting-time message exists, use a range/configurable message rather than a precise promise.
- [ ] Server/network submission failure must not falsely show completion.
- [ ] Prevent accidental resubmission from the completion screen.
- [ ] Provide a clear staff-help path when submission fails.
- [ ] Do not expose another patient's data after completion.
- [ ] Keep the display suitable for elderly patients.
- [ ] Document the operational state transitions.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] After PASS, allow queue auto-advance.
