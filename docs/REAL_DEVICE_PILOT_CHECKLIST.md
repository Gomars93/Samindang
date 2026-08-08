# 실기기 파일럿 체크리스트 (원장 PC + 태블릿)

이 문서는 사람이 실제 기기(원장 PC, 태블릿, Wi-Fi)를 손으로 조작해야만
확인할 수 있는 부분만 다룬다. 그 외 모든 것(코드 정확성, 테스트, 빌드,
보안 설정, git 위생)은 이미 자동 검증을 통과했다 — 아래 "자동 검증 결과"
절 참고. 개발자가 아니어도 순서대로 따라 하면 된다.

전제: 이 문서의 명령은 프로젝트 루트
`c:\Users\ASUS\Desktop\google drive\samindang-questionnaire`에서 실행한다.
더 자세한 배경/보안 설명은 `docs/RUNBOOK_LOCAL_HANDOFF.md`를 참고.

---

## 사전 준비 (파일럿 시작 전, 한 번만)

1. 원장 PC에서 프로젝트 빌드:
   ```
   npm run build
   ```
   성공 기준: 마지막 줄에 `✓ built in ...`가 뜨고 `dist/` 폴더가 생긴다.
   에러가 나면 여기서 멈춘다 — 이건 사람이 손댈 부분이 아니라 코드
   문제이므로 개발자에게 알린다.

---

## 1) 원장 PC에서 서버 시작

`scripts\start-clinic.bat` 파일을 탐색기에서 더블클릭한다.

- **성공 기준**: 새 콘솔 창 2개가 뜬다.
  - 하나는 `samindang-handoff-server` 제목, `samindang handoff server
    listening on http://0.0.0.0:4317` 로그가 보인다.
  - 다른 하나는 `samindang-patient-preview` 제목, `Local:` /
    `Network:` 주소가 뜬다(포트 4173).
- **실패 시**: 창이 바로 닫히거나 에러 문구가 보이면, 사전 준비의
  `npm run build`를 다시 실행했는지 확인한다(`dist\` 폴더가 없으면 경고가
  뜬다). 그래도 안 되면 수동 기동으로 대체한다:
  ```
  npm run server
  ```
  (별도 터미널에서) `npm run preview -- --host`

---

## 2) Windows 방화벽 / LAN 도달성 확인 (프롬프트가 뜰 경우)

포트 4317(핸드오프 서버)에 처음 접속을 시도할 때 Windows 보안 경고
("Windows Defender 방화벽에서 이 앱의 일부 기능을 차단했습니다")가 뜰 수
있다.

- **뜬 경우**: **개인 네트워크(사설 네트워크)** 체크박스만 선택하고
  **공용 네트워크는 체크하지 않은 채** "액세스 허용"을 클릭한다.
- **안 뜨는데 태블릿이 연결이 안 되는 경우**: 관리자 권한 PowerShell에서
  아래를 한 번 실행한다.
  ```powershell
  New-NetFirewallRule -DisplayName "samindang-handoff-4317" `
    -Direction Inbound -Protocol TCP -LocalPort 4317 `
    -Action Allow -Profile Private
  ```
- **성공 기준**: 원장 PC 자신에서 아래가 응답하면 서버는 정상이다(이 단계는
  방화벽과 무관하게 항상 되어야 한다):
  ```
  curl http://localhost:4317/api/health
  ```
  `{"ok":true,...}`가 보이면 통과.
- **LAN IP 확인** (다음 단계에서 필요):
  ```
  ipconfig | findstr /i "IPv4"
  ```
  `무선 LAN 어댑터` 또는 `이더넷 어댑터` 아래 `192.168.x.x` 형태의 주소를
  적어둔다. **이 값은 코드에 하드코딩하지 않는다** — 매번 이 명령으로 다시
  확인한다(DHCP로 바뀔 수 있음).

---

## 3) 태블릿에서 설정된 LAN URL 열기

이 단계 전에, 원장 PC 프로젝트 루트에 `.env.local` 파일을 만들고(없으면
새로 만든다) 2)에서 확인한 IP를 넣는다:

```
VITE_SAMINDANG_SERVER_URL=http://<2번에서 확인한 IP>:4317
```

예: `VITE_SAMINDANG_SERVER_URL=http://192.168.0.10:4317`

파일을 저장한 뒤 **다시 빌드**해야 반영된다:
```
npm run build
```
그리고 1)의 `start-clinic.bat`을 다시 실행(또는 두 콘솔 창을 닫았다가
재실행)한다.

- 태블릿 브라우저에서:
  ```
  http://<2번에서 확인한 IP>:4173
  ```
- **성공 기준**: 문진 시작 화면이 뜬다(원장 PC와 같은 화면).
- **실패 시**:
  1. 태블릿과 원장 PC가 **같은 Wi-Fi**에 있는지 확인(게스트 Wi-Fi는 기기간
     통신을 막을 수 있음 — AP 격리 확인).
  2. IP가 바뀌지 않았는지 2)의 `ipconfig` 명령으로 재확인.
  3. 2)의 방화벽 규칙이 적용됐는지 재확인.

---

## 4) 테스트 문진 1건 제출

태블릿에서 실제 환자인 것처럼 문진을 끝까지 진행한다. 이름/전화번호 등은
**테스트임을 알아볼 수 있는 값**을 쓴다(예: 이름 "테스트환자", 전화번호
뒷자리 `0000`) — 5)에서 완료 후 반드시 삭제할 것이므로 실제 개인정보를
쓰지 않는다.

- **성공 기준**: 문진 마지막에 "문진이 접수되었습니다" 류의 완료 화면이
  뜨고, 오류 배너가 없다.
- **실패 시("전송에 실패했습니다" 류의 오류 화면이 뜨면)**:
  - 화면에 재시도 버튼("다시 시도")이 있으니 눌러본다.
  - 그래도 안 되면 3)의 URL이 정확한지, 서버 콘솔 창이 아직 떠 있는지
    확인한다.
  - 문진 내용 자체는 사라지지 않는다 — 서버가 안 되더라도 문진은 끝까지
    진행/완료되며, 개발자용 화면에 남은 내용을 수기로 옮길 수 있다(이건
    임시 우회 수단이지 정상 경로가 아니다).

---

## 5) 원장 PC 화면에 올바르게 나타나는지 확인

원장 PC(서버가 떠 있는 그 PC)의 브라우저에서:
```
http://localhost:4173/#doctor
```

- 목록 헤더의 데이터 소스가 "서버 제출목록"으로 되어 있는지 확인한다(아니면
  화면에서 전환).
- **성공 기준**:
  - 방금 제출한 테스트 문진이 목록에 나타난다(빨간 "신규 1" 배지).
  - 항목을 클릭해서 열면 방금 입력한 테스트 이름/증상 등이 그대로
    보인다 — 다른 제출과 섞이지 않았는지 확인(오늘 처음이면 비교 대상이
    없을 수 있음).
  - 명리(사주) 결과 섹션이 채워져 있다(계산 실패 표시가 없어야 함).
- **실패 시**:
  - "불러오는 중…"이 계속 떠 있으면 최대 5초(폴링 주기) 기다린다.
  - "서버에 연결할 수 없습니다"가 뜨면 **다시 시도** 버튼을 누르고, 그래도
    안 되면 서버 콘솔 창이 살아있는지, `curl
    http://localhost:4317/api/health`가 응답하는지 확인한다.

---

## 테스트 제출 정리 (파일럿 리허설 종료 후)

테스트로 넣은 가짜 문진은 실제 파일럿 시작 전에 지운다.

- **개별 삭제**: 서버를 켠 채로 `SAMINDANG_DATA_DIR`(기본
  `.data\submissions\`) 안에서 방금 만든 `<uuid>.json` 파일을 지우면 된다
  (원장 대시보드에서 열어봤을 때 뜬 화면에 id가 보이지 않으면, 폴더 안에서
  파일 수정 시각으로 가장 최근 파일을 확인).
- **전체 삭제(리허설을 여러 건 했다면 이쪽이 더 간편)**:
  ```
  npm run purge:data
  ```
  터미널에 `DELETE`를 정확히 입력해야 실제로 지워진다(대화형). 실행하면
  제출 데이터와 audit 로그가 함께 삭제된다.

---

## 직원 리셋 제스처 (다음 환자를 위해)

완료 화면 **오른쪽 맨 아래 구석**의 표시 없는 영역을 **2초 이상 길게
누르면** 그 태블릿의 화면이 시작 화면으로 초기화된다(응답이 즉시
지워짐). 짧게 탭하는 것으로는 반응하지 않아 환자가 실수로 초기화할 일은
없다. 이 위치/동작은 환자에게 안내하지 않는다 — 접수 직원만 알면 된다.

---

# 자동 검증 결과 (사람이 다시 할 필요 없음)

아래는 실기기 없이 이 세션에서 **실제로 실행하고 확인한** 결과다. 주장이
아니라 실행 로그 기준.

## 테스트 스위트 (`npm run test:all`)

| 스위트 | 결과 |
|---|---|
| test:integration | 399 assertions passed, 0 failed |
| test:layout | 87 screens total — 84 fit within 936px, 3 need inner scroll (allowlisted); 7 assertions passed |
| test:saju | 93 passed |
| test:doctor | 91 assertions passed |
| test:server | **102** assertions passed (was 92 — added 10 assertions for "simulated multiple-patient submissions" so each of 5 distinct patients also gets its own clinician judgment verified round-trip, not just myungri) |
| test:patient | 46 assertions passed |
| **합계** | **738 assertions, 0 failed** (기존 728 + 이번에 추가한 10) |

## 빌드

- `npx tsc -b` → 종료 코드 0, 에러 없음.
- `npx vite build` → 종료 코드 0. `102 modules transformed`, `dist/assets/index-*.js 262.49 kB (gzip 89.61 kB)`.

## 서버 핵심 시나리오 (tests/server.spec.mjs 안에서 실행/확인됨)

- 중복 제출(idempotency, 동일 `session_id`) — 통과 (동시 5개 중 1개만 201,
  나머지 4개는 `duplicate:true`).
- 잘못된 payload(배열 body, `responses` 누락, 1MB 초과) → 400/413 — 통과.
- 재시작 후 지속성(restart persistence) — 통과(재시작 후에도 목록에
  남음).
- 여러 환자 동시 제출(5명) — 각자 다른 id, 자기 myungri만 매칭, **자기
  판단(judgment)만 매칭**(이번에 추가한 부분) — 통과.
- 문진+명리계산이 같은 submission id로 묶이는지, 임상 판단(judgment)이
  올바른 submission에 저장/재조회되는지 — 여러 건에서 개별 검증, 통과.

## git 위생

- `git ls-files`에 `.data/` 아래 파일이나 `audit.log`, `.env*`가 전혀
  없음(테스트에서도 자동 검증: "git tracks no files under .data/", "git
  tracks no .env files").
- `.gitignore`가 `.data/`, `.data/audit.log`, `.env`, `.env.*`를 명시적으로
  덮음.

## 시크릿/API 키 검사

- 커밋된 파일 전체에서 `sk-...`, `api_key=`, `password=`, `token=<값>`,
  `BEGIN PRIVATE KEY` 패턴을 검색. 실제 시크릿 값은 발견되지 않음.
- `SAMINDANG_DOCTOR_TOKEN`은 **설정 이름**(환경변수 키)일 뿐 저장소 어디에도
  실제 토큰 값이 하드코딩돼 있지 않음 — 문서/코드는 전부 "이 환경변수를
  설정하면"이라는 설명뿐.
- `.claude/queue/`의 `OPENAI_API_KEY` 참조 2건도 환경변수 **이름**만 나오고
  실제 키 값은 없음(파일럿 서버/환자 문진 경로와도 무관 — 내부 작업 큐
  자동화 스크립트).

## 공개 인터넷 노출 여부

- 서버 기본 바인드는 `0.0.0.0`(모든 인터페이스)이지만, 이는 **LAN 안의
  다른 기기(태블릿)가 접속하기 위해 필요한 설정**이며 공유기 포트포워딩과는
  다르다. `docs/RUNBOOK_LOCAL_HANDOFF.md`가 인터넷 노출 금지, 포트포워딩
  금지, ngrok 등 터널링 금지를 명시하고, Windows 방화벽 규칙도 **Private
  프로필 한정**으로만 열도록 안내한다(코드는 방화벽을 자동으로 건드리지
  않음).
- 코드에 하드코딩된 공인/사설 IP 없음(LAN IP는 매번 `ipconfig`로 사람이
  확인하도록 설계).
- ngrok/cloudflared/localtunnel 등 터널링 관련 코드/설정 없음 — 문서에서
  금지 문구로만 언급됨.

## 문서 ↔ 실제 명령 일치성 점검

`docs/RUNBOOK_LOCAL_HANDOFF.md`, Master Spec 문서들에 나오는 모든
`npm run *`/`npx *`/`node *` 명령을 `package.json`의 `scripts`와
`scripts/`, `server/` 안의 실제 파일과 대조:

| 문서상 명령 | 실제 존재 여부 |
|---|---|
| `npm run build` | 일치 (`tsc -b && vite build`) |
| `npm run dev` | 일치 (`vite --host`) |
| `npm run server` | 일치 (`node server/index.js`) |
| `npm run preview -- --host` | 일치(다만 `preview` 스크립트 자체가 이미 `vite preview --host`라 `--host`가 중복 전달됨 — 동작에는 문제 없음, 단순 중복) |
| `npm run purge:data` / `node scripts/purge-data.mjs --yes` | 일치, 파일 존재 확인(`scripts/purge-data.mjs`) |
| `npm run test:integration` / `test:saju` / `test:doctor` / `test:server` / `test:patient` | 전부 `package.json`과 일치 |
| `scripts\start-clinic.bat` | 파일 존재, 내부에서 `node server\index.js`와 `npm run preview -- --host`를 실행 — 둘 다 유효한 명령 |
| `ipconfig | findstr /i "IPv4"` | Windows 표준 명령, 문제 없음 |
| `New-NetFirewallRule ...` | PowerShell 표준 cmdlet, 문법 확인 |

**발견된 실제 불일치: 없음.** (`npm run preview -- --host`의 `--host` 중복
전달은 동작상 문제가 되지 않는 사소한 중복이라 수정하지 않음 — vite는 같은
플래그가 두 번 와도 그대로 동작함.)

`scripts/` 안의 `register-scheduled-task.ps1`, `unregister-scheduled-task.ps1`,
`run-queue-unattended.bat`은 내부 작업 큐(`.claude/queue/`) 자동화용이며
클리닉 서버 운영과 무관 — 이 체크리스트/런북 어디서도 참조하지 않음(정상).

---

# 최종 준비 상태 (BLOCKER / NON-BLOCKER)

파일럿을 시작하기 전에 반드시 짚어야 할 항목을 정직하게 나열한다. 목록을
깔끔하게 보이려고 BLOCKER를 NON-BLOCKER로 낮추지 않았다.

## BLOCKER (감독 하 파일럿이라도 시작 전에 반드시 해결)

1. **야자시/조자시 + 진태양시(眞太陽時) 정책 미승인.**
   `docs/MYUNGRI_CALCULATION_POLICY_PENDING.md` 1~2번 항목이 원장
   미승인(☐) 상태로 남아 있다. 23:00~00:59 출생자, 그리고 절기 경계 근처
   출생자는 채택하는 규칙에 따라 일주/월주/연주까지 달라질 수 있는 명리학적
   판단이라 코드가 임의로 정할 수 없다. 이 구간에 해당하는 환자가 파일럿
   중 나오면 결과가 "잠정치"임을 원장이 알고 있어야 한다 — 원장 승인 전
   임상 판단의 최종 근거로 그대로 쓰면 안 된다.
2. **실기기 시각 검증이 아직 없다.** 이 세션의 레이아웃 검증(87개 화면,
   936px budget)은 전부 **계산된** 값이며, 실제 800×1280 태블릿 화면에
   렌더링해서 눈으로 본 적은 아직 없다. 폰트 렌더링, 터치 히트 영역,
   실제 스크롤 동작, 브라우저 확대/축소 설정 등은 기기에서만 확인
   가능하다. 위 1)~5) 단계가 바로 이 검증이다 — **아직 수행 전**이므로
   지금 시점에서는 블로커다. 1)~5)를 완료하면 이 항목은 해소된다.
3. **원장 PC의 실제 방화벽/네트워크 환경이 아직 검증되지 않았다.** 클리닉
   Wi-Fi가 Windows에 "공용 네트워크"로 잡혀 있는지, 게스트 Wi-Fi AP
   격리가 걸려 있는지는 코드로 알 수 없다. 2)~3) 단계를 실기기에서 완료해야
   확인된다.

## NON-BLOCKER (알고 있어야 하지만, 감독 하 소규모 파일럿 규모에서는 진행 가능)

1. **프로덕션급 인증 없음.** loopback 경계 + 선택적 토큰 헤더만 있고,
   사용자 계정/로그인/역할별 권한이 없다. `docs/RUNBOOK_LOCAL_HANDOFF.md`
   3절/3.1절에 정확히 문서화돼 있고, 클리닉 원내 LAN·소수 인원·물리적
   PC 통제라는 좁은 전제 안에서만 "안전"하다고 명시돼 있다. 파일럿 규모라면
   진행 가능하지만, 정식 서비스 확장 전에는 반드시 실제 인증으로
   교체해야 한다.
2. **저장 데이터 암호화(encryption at rest) 없음.** `.data/submissions/`
   아래 평문 JSON. 원장 PC에 대한 물리적 통제(잠금, 접근 제한)가 실질적
   방어선이라는 점이 문서에 명시돼 있다. 파일럿 규모(소수 환자, 짧은 기간)
   에서는 감내 가능한 리스크로 판단하되, 백업 시 반드시 암호화된 외장
   드라이브를 쓰라고 문서가 안내한다.
3. **TLS(HTTPS) 없음.** 평문 HTTP로 LAN 내부 통신. LAN이 신뢰 경계라는
   전제 하에서만 허용되는 파일럿 등급 구성.
4. **audit.log 자체는 날짜 기준 자동 보존기한이 없다**(제출 데이터는 30일
   기본 자동삭제되지만, audit.log는 `npm run purge:data` 실행 시에만 함께
   삭제됨). 파일럿 규모(하루 수십 건, 줄당 200바이트 미만)에서는 문서가
   의도적으로 미룬 부분이라고 명시하고 있어 리스크가 작다.
5. **`npm run preview -- --host`의 `--host` 플래그 중복.** 동작에 영향
   없음, 문서 정확성 문제일 뿐(선택적으로 나중에 `npm run preview`로
   단순화 가능하나 이번 게이트 범위 밖).
6. **`docs/` 안에 정체불명의 stray 임시 파일 발견**:
   `삼인당_태블릿_상세문진_Master_Spec_v1.0.md.tmp.22936.ac37e1d9a8d5`
   — git에 추적되지 않는 편집기/스크립트 잔여 파일로 보인다. 파일럿
   동작에는 영향 없음(코드/문서 어디서도 참조하지 않음). 원한다면 나중에
   수동으로 지워도 된다 — 이번 게이트 범위(테스트/빌드/문서 정합성)
   밖이라 자동으로 지우지 않았다.

## 결론

BLOCKER 3건이 남아 있는 한 "감독 없는" 정식 파일럿은 시작하면 안 된다.
다만 이 문서의 1)~5) 단계 자체가 BLOCKER #2와 #3을 해소하기 위한 절차이므로,
**원장/직원이 입회한 상태로 1)~5)를 한 번 끝까지 수행하고 성공 기준을 모두
통과하면, 그 시점부터 "감독 하 소규모 파일럿"을 시작해도 된다** — 단
BLOCKER #1(명리 정책 미승인)은 별도로 원장이 명시적으로 승인해야
해소된다(코드/테스트로는 해소할 수 없는 항목).
