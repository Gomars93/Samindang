# Multi-Workstation Doctor Contract v0.1

이 문서는 여러 원장 workstation(현재 B PC가 중앙 서버, A PC가 두 번째
workstation)이 하나의 Doctor 데이터 소스를 공유하면서도 각자 독립적인
"현재 진료 중인 방문"을 가질 수 있게 하는 규약이다.

## workstation_id란

- 각 Doctor 브라우저/PC를 구분하는 비식별 문자열. 예: `DOCTOR-A`, `DOCTOR-B`.
- 형식: `/^[A-Za-z0-9_-]{1,32}$/`.
- **환자 이름, 원장 실명, 전화번호, 이메일 등 PII를 절대 담지 않는다.**
- 코드에 A/B를 하드코딩하지 않는다 — 향후 `DOCTOR-C`는 프리셋 목록에 추가만
  하면 된다(`VITE_SAMINDANG_WORKSTATIONS` 환경변수, 쉼표 구분).
- 브라우저 localStorage에 최초 1회 저장되고, 이후 재시작해도 유지된다.
  같은 build를 여러 PC에서 열어도 각 브라우저의 localStorage가 다르므로
  workstation_id가 자동으로 충돌하지 않는다.
- 생략하면 서버는 내부적으로 `"default"` 키로 취급한다 — 기존
  single-workstation 동작과 완전히 하위호환된다.

## current visit ownership

- `server/activeVisit.js`가 `workstation_id -> entry` Map을 메모리에만
  들고 있다(디스크 저장 없음, 서버 재시작 시 전부 비워진다).
- 한 workstation의 activate/clear/TTL 만료는 다른 workstation의 entry에
  절대 영향을 주지 않는다 — Map 키가 다르기 때문에 구조적으로 보장된다.
- TTL: 기본 30분(`SAMINDANG_ACTIVE_VISIT_TTL_MINUTES`), workstation별로
  독립 적용.

## API

```
GET  /api/current-visit?workstation_id=<id>   (생략 시 "default")
POST /api/visits/:id/activate                 body: { workstation_id? }
POST /api/current-visit/clear                 body: { workstation_id? }
```

세 endpoint 모두 `requireDoctor()`(loopback 또는 `x-doctor-token`) +
doctor origin allowlist를 쓴다. `GET /api/current-visit`는 과거
loopback-only 별도 가드를 썼지만, 다른 workstation이 LAN으로 읽어야
하므로 다른 원장 라우트와 동일한 모델로 통합했다(2026-08 변경).

## Recorder 연동 규칙

`GET /api/current-visit`(폴링, 읽기 전용)는 이미 구현되어 있었다. 이번
스프린트(Recorder 결과 → Doctor → EMR 복사 v0.1)에서
`POST /api/visits/:visit_id/recorder-results`와
`GET /api/visits/:visit_id/recorder-results`를 추가해 Recorder(A PC)가
전사/구조화 결과를 이 workstation의 활성 `visit_id`로 되돌려보낼 수
있게 했다 — 자세한 계약은 이 파일이 아니라 `server/index.js`의 두
라우트와 `server/recorderResultStore.js`가 source of truth다.

- Recorder A는 `WORKSTATION_ID=DOCTOR-A` 환경변수를 가지고,
  `GET /api/current-visit?workstation_id=DOCTOR-A`만 조회한다.
- Recorder B는 `WORKSTATION_ID=DOCTOR-B`로 자기 workstation만 조회한다.
- **visit_id freeze**: 녹음 시작(F9) 순간의 `visit_id`를 그 recording
  session 동안 고정한다. 녹음 진행 중 Doctor가 같은 workstation에서 다른
  환자를 열어도(즉 current-visit이 바뀌어도) 이미 시작된 recording
  session은 영향받지 않는다 — 다음 녹음부터 새 visit_id가 적용된다.
- Recorder는 자기 workstation_id의 current-visit만 읽는다 — 다른
  workstation의 current-visit을 조회하거나 수정할 수 없다(권한이 아니라
  애초에 다른 workstation_id를 모른다는 설계).

## Privacy

- `GET /api/current-visit` 응답에는 `active`, `workstation_id`,
  `patient_id`, `visit_id`, `submission_id`, `active_since`만 포함된다.
  환자 이름/전화번호 등은 절대 포함하지 않는다(자동 테스트로 검증됨,
  `tests/server.spec.mjs`의 canary 테스트).

## 확장성

- A/B 외 C, D, ... workstation을 추가할 때 서버 코드 변경은 필요 없다 —
  클라이언트가 새 workstation_id로 요청하면 Map에 새 키가 자연히
  생긴다. 프리셋 드롭다운에 새 id를 추가하려면
  `VITE_SAMINDANG_WORKSTATIONS`만 갱신하면 된다.

## LAN Doctor 접근 수동 스모크 테스트

자동화된 단일 프로세스 테스트로는 실제 두 PC 간 네트워크 경로를 재현할
수 없다 — 아래를 A PC 브라우저에서 B PC 서버를 대상으로 실제로 실행해서
확인한다. `SAMINDANG_DOCTOR_TOKEN`을 B 서버에 설정하고,
`VITE_SAMINDANG_DOCTOR_TOKEN`을 A의 클라이언트 빌드/설정에 동일하게
맞춘 뒤:

- [ ] A 브라우저 → B Doctor View에서 제출목록 조회 성공
- [ ] visit 상세 조회 성공
- [ ] visit activate 성공
- [ ] `GET /api/current-visit?workstation_id=DOCTOR-A` 조회 성공
- [ ] clear 성공
- [ ] DOCTOR-A 상태 변경이 DOCTOR-B(B PC 자체 workstation)에 영향 없음
      (B PC 화면에서 교차 확인)
- [ ] 허용되지 않은 origin 또는 `x-doctor-token` 없는 요청은 거부됨
      (예: 토큰 없이 curl로 B 서버를 다른 LAN 기기에서 호출 → 403)
