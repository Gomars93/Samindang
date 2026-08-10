# Multi-Workstation Doctor Foundation v0.1 — 설계

작업 대상: B PC (중앙 Tablet/Doctor 서버). A PC Recorder는 이번 범위 밖.

## 1. 현재 구조 (audit 결과)

- `server/activeVisit.js`: 전역 단일 변수 `let activeVisit`. memory-only, 서버 재시작 시 항상 클리어(설계 의도). shape: `{ patient_id, visit_id, submission_id, active_since, last_touched }`.
- TTL: `DEFAULT_TTL_MINUTES = 30` (env `SAMINDANG_ACTIVE_VISIT_TTL_MINUTES`로 override). lazy check — read 시점에만 만료 판정, heartbeat/touch 없음.
- Doctor UI: `DoctorView.tsx`에서 `selectedRecord.visit_id` 바뀌면 `activateVisit()` 호출, unmount/change 시 `clearActiveVisit()`.
- `server/auth.js`:
  - `isLoopback` — 127.0.0.1/::1만.
  - `isDoctorRequestAllowed` (= `requireDoctor()`) — loopback OR `x-doctor-token` 일치. 현재 9개 route에 적용 (submissions ×4, visits ×4, current-visit/clear ×1).
  - `isLocalOnly` — loopback만, 토큰 우회 없음. **`GET /api/current-visit` 전용**, CORS 헤더 없음(`{}`).
- CORS: doctor route는 `isOriginAllowedForDoctor` — localhost/127.0.0.1:포트 정규식 또는 `SAMINDANG_ALLOWED_ORIGINS` allowlist만 반영. patient 제출 route는 origin 반영 또는 `*`.
- 저장: `server/store.js`(submissions), `server/visitStore.js`(visits) — 파일당 JSON, ID는 순수 `randomUUID()` (VIS-/PAT- 접두사 없음, 실제 코드 기준 이걸 그대로 사용).
- workstation/multi-instance 개념 전무. greenfield.

**결론: A PC는 현재 `GET /api/current-visit`에 도달 불가** — loopback-only라 B 입장에서 A는 loopback이 아님. 이번 작업의 핵심 blocker.

## 2. Workstation Identity

- 방식: **localStorage 최초 등록, known-ID 선택형 우선**.
  - Doctor 화면 최초 로드 시 localStorage에 `workstation_id` 없으면 setup 화면 표시.
  - setup 화면은 **드롭다운/버튼 선택**이 기본 (예: DOCTOR-A / DOCTOR-B, 서버가 알려주는 목록 또는 코드에 정의된 프리셋 목록에서 고름). 오타 방지 목적이라 자유 텍스트 입력은 "기타" 케이스로만 보조 제공, 위 validation regex 통과해야 저장.
  - 저장 후 브라우저/PC 재시작해도 유지. 매번 random 생성 금지.
- validation: `/^[A-Za-z0-9_-]{1,32}$/`. 위반 시 서버가 400 거부, 클라이언트도 저장 전에 동일 검사.
- workstation_id에 환자명/원장 실명/이메일 등 PII 절대 금지 — 코드 주석 + 문서에 명시.
- A/B 하드코딩 없음. 향후 DOCTOR-C는 프리셋 목록에 추가만 하면 됨(코드 로직 변경 없음).

## 3. Current Visit — workstation별 확장

- `server/activeVisit.js`: `let activeVisit` → `Map<workstation_id, entry>`.
- workstation_id 생략 시 `"default"` 키 사용 → 기존 single-workstation 호출/테스트 그대로 backward compatible.
- entry shape 변경 없음. TTL/lazy-expiry 로직은 키별로 독립 적용.
- 서버 재시작 시 Map 전체가 비워짐 → **모든 workstation이 inactive로 시작**. 기존 memory-only 정책 그대로, 새로 명시 테스트 추가(§6 G).

## 4. API Contract (최소 변경)

```
GET  /api/current-visit?workstation_id=DOCTOR-A   (없으면 "default")
POST /api/visits/:id/activate   body: { workstation_id? }
POST /api/current-visit/clear   body: { workstation_id? }
```

- 응답 shape 동일, `workstation_id` 필드 추가.
- 서버 검증: workstation_id regex 위반 → 400. unknown visit_id → 기존 정책대로 거부(404/400, 기존 코드 그대로). 다른 workstation의 entry는 절대 건드리지 않음(키 분리로 구조적으로 보장).
- 이름 기반 매칭 금지 — 기존 patient_id/visit_id UUID 기반 그대로.

## 5. Doctor API LAN 접근 — 최소 수정 (audit 우선)

작업 순서:
1. **audit 먼저**: `requireDoctor()`가 실제 보호하는 9개 route를 코드 기준으로 재확인(`tests/server.spec.mjs`의 9-route 카운트 테스트 활용), `isOriginAllowedForDoctor`가 반영하는 origin 범위, `SAMINDANG_ALLOWED_ORIGINS` 실제 사용 여부 확인.
2. `GET /api/current-visit`을 `isLocalOnly` → `requireDoctor()`로 전환. 이 route만 변경, 다른 route 손대지 않음.
3. CORS: 이 route에 기존 doctor CORS 로직(`isOriginAllowedForDoctor` 기반)을 그대로 재사용 — 새 allowlist 개념 만들지 않음.
4. `x-doctor-token`은 기존 `SAMINDANG_DOCTOR_TOKEN` env 그대로 사용, 새 토큰 종류 도입 안 함.
5. 범위 최소화: submissions/visits 등 다른 endpoint는 이번에 안 건드림(이미 requireDoctor 적용돼 있어 A가 토큰 세팅하면 접근 가능 — 실제 접근 가능 여부만 audit해서 보고, 코드 변경 없음).
6. 보안모델 자체(예: 완전 공개, `*` CORS)는 바꾸지 않음. 더 큰 변경 필요하면 다음 task로 분리 보고.

## 6. 동시진료 테스트 (필수, `tests/server.spec.mjs` 확장)

A. DOCTOR-A→VIS-1, DOCTOR-B→VIS-2 → GET 각각 독립 확인
B. A만 VIS-3로 변경 → A 변경, B 유지
C. A clear → A inactive, B unaffected
D. A TTL expire (`__setLastTouchedForTest` 활용) → A만 expired, B 유지
E. invalid workstation_id → 400 거부
F. unknown visit_id → 기존 정책대로 거부
G. **서버 재시작(모듈 재로드) 후 모든 workstation inactive로 시작** — 명시 테스트
H. 기존 single-workstation(=default key) regression — 기존 테스트 그대로 PASS

## 6b. LAN Doctor smoke test (수동 or 자동화, A PC ↔ B PC)

A PC 브라우저 → B PC Doctor View 실제 LAN 접속 기준, PASS 조건:

- submissions 목록 조회 성공
- visit 상세 조회 성공
- visit activate 성공
- workstation별 current-visit 조회 성공 (DOCTOR-A로 조회)
- clear 성공
- DOCTOR-A 상태 변경이 DOCTOR-B에 영향 없음 (교차 확인)
- 허용 안 된 origin 또는 토큰 없는 요청은 거부됨

## 7. Doctor UI

- 상단 작게 "진료 워크스테이션: DOCTOR-A" 표시.
- 미설정 시: "워크스테이션 설정 필요" 표시, activate 호출 자체를 막아 전역/default entry에 잘못 반영되지 않게 처리.
- Patient Tablet UI 변경 없음.

## 8. Recorder future contract (문서만, 코드 변경 없음)

- `WORKSTATION_ID=DOCTOR-A`인 Recorder는 `GET /api/current-visit?workstation_id=DOCTOR-A`만 조회.
- 녹음 시작 순간 visit_id freeze, 이후 Doctor가 다른 환자를 열어도 진행 중 세션 불변 — 원칙만 문서화, 이번엔 미구현.

## 9. 하지 않는 것 (scope 밖)

A Recorder 코드 수정 / B Recorder 설치 / 녹음 로직 / transcript / structured output / 자동요약 / LLM / 명리 Rule Engine / EMR 연동 / cloud backend / 이름 기반 매칭 / IP 하드코딩 / SMB 파일 구현 / submissions·visits 등 다른 route의 보안모델 변경.

## 10. 문서화 산출물

`docs/MULTI_WORKSTATION_CONTRACT.md` 신규 — workstation_id 의미, current visit ownership, Recorder 연동 규칙, visit_id freeze 원칙, privacy, TTL, A/B/C 확장성.

## 11. 검증

`npm run test:all`, `npx tsc -b`, `npx vite build`, server tests 전부 PASS.
