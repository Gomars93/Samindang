## What changed


## Why


## Files changed


## Tests / Verification
<!-- 실행한 명령과 결과를 구체적으로 적는다 (예: npm run build, npm run test:all, pytest). -->
<!-- "테스트함" 같은 서술 대신 실제 실행 결과를 붙여넣는다. -->


## Clinical / patient-data safety checklist
<!-- 환자 문진·진료 시스템이므로 코드 변경이 없는 PR이라도 아래 항목에 답한다.
     해당 없으면 "해당 없음"이라고 명시한다 — 빈 칸으로 두지 않는다. -->
- Clinical logic changed? (임상 판단/분기 로직 변경 여부 — `tablet core/`, `src/spec/`, `src/saju/`, doctor judgment 관련):
- Clinical source/validation (변경한 임상 규칙의 근거와 검증 방법, 해당 시 `tablet core/*_review*.md` 등 참고 문서 링크):
- Patient-data / PHI impact (환자 개인정보·문진 데이터 취급 방식이 바뀌는가):
- Data / schema migration (기존에 저장된 문진 데이터와의 호환성 영향):
- Security boundary changed (LAN 서버, 인증 토큰, API 노출 범위 등 변경 여부):
- Regression tests added (임상 안전 로직 변경 시 회귀 테스트 추가 여부):


## Known risks


## Remaining work


## Handoff notes for ChatGPT review
<!-- ChatGPT가 이 PR만 보고 별도 설명 없이 검수할 수 있도록, 반드시 확인해야 할
     맥락(관련 HANDOFF.md/DECISIONS.md 항목, 임상 안전 관련 변경 여부 등)을 적는다. -->
