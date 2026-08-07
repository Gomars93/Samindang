# Task: Clinician Myungri Review & Knowledge Capture Foundation

## Goal
Extend the doctor-facing workflow so Park Kyungnam can review the calculated Saju structure together with questionnaire data and record the minimum structured clinical judgment needed for future rule extraction.

This task does NOT build an autonomous Rule Engine.

## Acceptance checklist

### Doctor review panel
- [ ] Show raw birth information and deterministic Myungri calculation separately.
- [ ] Clearly show unknown/unresolved birth-time or calculation-policy states.
- [ ] Place current chief complaint / duration / key questionnaire findings beside the Myungri structure.
- [ ] Safety and medication/history information remains visually higher priority than Myungri interpretation.
- [ ] Do not present a machine-generated disease diagnosis from Saju.

### Structured clinician judgment
Provide concise fields aligned with the original plan:
- [ ] `핵심 선천 특징` — maximum 3.
- [ ] `현재 증상과 연결되는 핵심` — maximum 2.
- [ ] `사주만 보고 예상한 임상 문제` — concise clinician-entered summary.
- [ ] `실제 문진·맥·설·복진 후 수정된 판단` — concise clinician-entered summary.
- [ ] `최종 치료축`.
- [ ] `처방 방향` (direction only; no automatic prescription).
- [ ] `★ 학습 케이스` toggle.
- [ ] Judgment record stores timestamp and judgment/schema version.

### One-minute debrief support
The original learning workflow uses four debrief questions:
1. 이 사주에서 제일 중요하게 본 것은 무엇인가?
2. 사주만 보고 어떤 임상문제를 예상했는가?
3. 실제 문진·맥·설을 보고 무엇을 수정했는가?
4. 그 수정이 처방을 어떻게 바꿨는가?

- [ ] Make these four fields available as an optional post-visit structured debrief.
- [ ] Keep the debrief fast; do not create a long documentation burden.
- [ ] Do not require audio recording for MVP.
- [ ] Leave hooks/data contracts for later transcript import without implementing always-on recording.

### Data/versioning
- [ ] Store patient snapshot version, Myungri calculation version, and clinician judgment version.
- [ ] Keep calculated facts separate from clinician interpretation.
- [ ] Keep clinician interpretation separate from later AI-generated rule candidates.
- [ ] Data can later support Shadow Mode comparison without changing the patient questionnaire.

### Explanation support
- [ ] Add an optional clinician-only explanation outline matching the established 15–20 minute structure:
      1) 선천 특징 최대 3,
      2) 현재 증상 연결 최대 2,
      3) 치료 우선순위/한약 방향,
      4) 질문.
- [ ] This is a presentation scaffold only; do not have AI invent Myungri content.

### Validation
- [ ] Update documentation/data contract.
- [ ] `npx tsc -b` passes.
- [ ] `npx vite build` passes.
- [ ] No regression in doctor dashboard or patient flow.
- [ ] After PASS, allow queue auto-advance.
