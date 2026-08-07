# Task: Clinician Myungri Review & Knowledge Capture Foundation

## Goal
Extend the doctor-facing workflow so Park Kyungnam can review the calculated Saju structure together with questionnaire data and record the minimum structured clinical judgment needed for future rule extraction.

This task does NOT build an autonomous Rule Engine.

## Acceptance checklist

### Doctor review panel
- [x] Show raw birth information and deterministic Myungri calculation separately.
- [x] Clearly show unknown/unresolved birth-time or calculation-policy states.
- [x] Place current chief complaint / duration / key questionnaire findings beside the Myungri structure.
- [x] Safety and medication/history information remains visually higher priority than Myungri interpretation.
- [x] Do not present a machine-generated disease diagnosis from Saju.

### Structured clinician judgment
Provide concise fields aligned with the original plan:
- [x] `핵심 선천 특징` — maximum 3.
- [x] `현재 증상과 연결되는 핵심` — maximum 2.
- [x] `사주만 보고 예상한 임상 문제` — concise clinician-entered summary.
- [x] `실제 문진·맥·설·복진 후 수정된 판단` — concise clinician-entered summary.
- [x] `최종 치료축`.
- [x] `처방 방향` (direction only; no automatic prescription).
- [x] `★ 학습 케이스` toggle.
- [x] Judgment record stores timestamp and judgment/schema version.

### One-minute debrief support
The original learning workflow uses four debrief questions:
1. 이 사주에서 제일 중요하게 본 것은 무엇인가?
2. 사주만 보고 어떤 임상문제를 예상했는가?
3. 실제 문진·맥·설을 보고 무엇을 수정했는가?
4. 그 수정이 처방을 어떻게 바꿨는가?

- [x] Make these four fields available as an optional post-visit structured debrief.
- [x] Keep the debrief fast; do not create a long documentation burden.
- [x] Do not require audio recording for MVP.
- [x] Leave hooks/data contracts for later transcript import without implementing always-on recording.

### Data/versioning
- [x] Store patient snapshot version, Myungri calculation version, and clinician judgment version.
- [x] Keep calculated facts separate from clinician interpretation.
- [x] Keep clinician interpretation separate from later AI-generated rule candidates.
- [x] Data can later support Shadow Mode comparison without changing the patient questionnaire.

### Explanation support
- [x] Add an optional clinician-only explanation outline matching the established 15–20 minute structure:
      1) 선천 특징 최대 3,
      2) 현재 증상 연결 최대 2,
      3) 치료 우선순위/한약 방향,
      4) 질문.
- [x] This is a presentation scaffold only; do not have AI invent Myungri content.

### Validation
- [x] Update documentation/data contract.
- [x] `npx tsc -b` passes.
- [x] `npx vite build` passes.
- [x] No regression in doctor dashboard or patient flow.
- [x] After PASS, allow queue auto-advance.
