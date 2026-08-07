# Task: Patient Completion / Preparation Status Flow

## Goal
Complete the patient-facing handoff state after questionnaire submission so the waiting experience matches the original operating plan and staff do not need to manually explain every step.

## Acceptance checklist
- [x] After successful submission, clear questionnaire entry controls from the patient-facing screen.
- [x] Show a simple patient status flow:
      접수 완료 → 상세문진 완료 → 체질분석 준비 중 → 원장님 진료
- [x] Do not promise an exact appointment minute.
- [x] If a waiting-time message exists, use a range/configurable message rather than a precise promise.
- [x] Server/network submission failure must not falsely show completion.
- [x] Prevent accidental resubmission from the completion screen.
- [x] Provide a clear staff-help path when submission fails.
- [x] Do not expose another patient's data after completion.
- [x] Keep the display suitable for elderly patients.
- [x] Document the operational state transitions.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] After PASS, allow queue auto-advance.
