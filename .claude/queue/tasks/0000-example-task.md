# 0000 - example task (template, not active)

이 파일은 task 형식 예시다. 실제 큐에서 쓰려면 `state.json`의
`current_task`가 이 파일명(예: `0001-add-x.md`)을 가리켜야 하고
`active`가 `true`여야 hook이 동작한다.

## 완료 조건 (checklist)

Stop hook은 이 파일에서 `- [ ]` (미완료) 항목 수를 세서, 0개가 될 때까지
"검증은 통과했지만 아직 할 일이 남았다"고 판단하고 작업을 계속하게 만든다.

- [ ] 예시 항목 1
- [ ] 예시 항목 2

체크박스를 전부 `- [x]`로 바꾸고 `npx tsc -b` / `npx vite build`가 모두
통과하면 Stop hook이 더 이상 막지 않는다.
