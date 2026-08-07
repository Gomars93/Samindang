# 로컬 핸드오프 서버 운영 가이드 (파일럿, 클리닉 LAN 전용)

이 문서는 환자 태블릿에서 작성한 문진이 사람이 직접 옮기지 않고 원장
PC 화면까지 도착하도록 하는 최소 서버(`server/index.js`)의 운영 절차를
설명한다. 데이터 계약은 Master Spec 13장 참고.

**전제**: 인터넷에 노출하지 않는다. 클리닉 원내 LAN(같은 공유기/스위치)
안에서만 동작하는 파일럿 등급 구성이며, 실제 인증/암호화(TLS)를 갖춘
프로덕션 시스템이 아니다.

## 1. 전체 흐름

```
[환자 태블릿]                [원장 PC]
   Vite 앱          POST      node server/index.js
 (문진 작성) ───────────────▶   (:4317, LAN 내부)
                              │
                              │  GET /api/submissions (5초 폴링)
                              │  GET /api/submissions/:id
                              ▼
                         [원장 PC 브라우저]
                          DoctorView (#doctor)
```

- 문진을 마친 태블릿이 로컬 서버로 결과를 **1회 POST**한다(조회 권한 없음).
- 서버는 파일 시스템(`SAMINDANG_DATA_DIR`)에 제출 1건당 JSON 파일 1개로
  저장한다. DB도, 클라우드도, EMR 연동도 없다.
- 원장 PC의 브라우저(`#doctor` 화면)가 같은 서버에 주기적으로 물어봐서
  목록/상세를 가져온다.

## 2. 서버 기동

원장 PC(또는 클리닉 LAN 안의 아무 PC)에서:

```bash
npm run server
# 내부적으로: node server/index.js
```

빌드 단계가 없다 — `server/` 아래는 순수 JS라 바로 실행된다. 시작하면
콘솔에 실제 host/port/데이터 디렉터리를 출력한다.

### 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SAMINDANG_HOST` | `0.0.0.0` | 바인드 주소. LAN의 다른 기기가 접속하려면 `0.0.0.0`(전체 인터페이스)이어야 한다. |
| `SAMINDANG_PORT` | `4317` | 서버 포트. |
| `SAMINDANG_DATA_DIR` | `./.data/submissions` | 제출 JSON을 저장할 디렉터리. |
| `SAMINDANG_DOCTOR_TOKEN` | (없음) | 설정하면, loopback이 아닌 원장 요청도 이 토큰으로 허용한다. 3절 참고. |
| `SAMINDANG_ALLOWED_ORIGINS` | (빈 목록) | 원장 엔드포인트를 브라우저에서 호출할 수 있는 origin을 쉼표로 구분해 지정한다(예: `http://localhost:5173,http://192.168.0.10:4317`). `http://localhost:<포트>`/`http://127.0.0.1:<포트>`는 항상 허용되므로 일반적인 단일 PC 구성에서는 이 값을 설정할 필요가 없다. 3절 참고. |

PowerShell 예시:

```powershell
$env:SAMINDANG_PORT = "4317"
$env:SAMINDANG_DATA_DIR = "C:\samindang-data\submissions"
npm run server
```

## 3. 보안 모델 (반드시 이해하고 운영할 것)

- **환자 엔드포인트(`POST /api/submissions`)는 쓰기 전용**이다. 태블릿은
  자기가 방금 낸 제출조차 다시 읽을 방법이 없다.
- **원장 엔드포인트**(목록/상세/상태변경/판단저장)는 다음 중 하나일 때만
  허용된다:
  1. 요청이 **loopback**(`127.0.0.1`/`::1`, 즉 서버가 돌고 있는 바로 그
     PC)에서 온다. 이것이 **진짜 보안 경계**다 — 이 서버는 원장 PC
     "위에서" 실행되는 것을 전제로 설계했다.
  2. `x-doctor-token` 헤더가 `SAMINDANG_DOCTOR_TOKEN` 환경변수 값과
     일치한다. 이 토큰은 원장이 **다른 기기**(예: 같은 진료실의 보조
     모니터/PC)에서 화면을 볼 때만 필요한 보조 수단이다.
     `SAMINDANG_DOCTOR_TOKEN`을 설정하지 않으면, loopback이 아닌 원장
     요청은 무조건 403으로 거부된다.
- **이것은 실제 인증이 아니다.** 토큰은 평문 헤더로 오가고, TLS도 없다.
  파일럿 규모(클리닉 원내 LAN, 소수 인원)에서만 안전하다고 간주한다.
  **인터넷에 절대 노출하지 말 것** — 공유기 포트포워딩, 클라우드 터널
  (ngrok 등) 사용 금지.
- **loopback만으로는 브라우저 기반 공격을 막지 못한다.** 원장 PC의
  브라우저가 (다른 탭에서) 악성 웹사이트를 열면, 그 사이트의 JavaScript가
  `fetch('http://127.0.0.1:4317/api/submissions')`를 호출할 수 있다. 이
  요청도 loopback에서 나가므로 위 1번 조건을 통과한다 — 문제는 서버가
  응답의 CORS 헤더(`access-control-allow-origin`)에 요청자의 Origin을
  그대로 반사해주면, 브라우저가 그 응답(환자 목록 등)을 악성 사이트의
  JavaScript에 넘겨준다는 점이다. 이를 막기 위해 원장 라우트는:
  1. Origin이 없는 요청(curl, 스크립트 등 브라우저가 아닌 클라이언트)은
     그대로 통과시킨다 — 브라우저는 cross-origin 요청에 항상 Origin을
     붙이므로, Origin 부재는 브라우저 공격이 아니라는 뜻이다.
  2. Origin이 `http://localhost:<포트>` 또는 `http://127.0.0.1:<포트>`이면
     허용한다 — 원장 PC 자신의 Vite 개발 서버(보통 `localhost:5173`)나
     서버 자신의 origin이 여기 해당하므로, 일반적인 단일 PC 구성은 별도
     설정 없이 그대로 동작한다.
  3. 그 외 Origin은 `SAMINDANG_ALLOWED_ORIGINS`에 정확히(대소문자
     무시) 등록돼 있지 않으면 **서버가 즉시 403으로 거부**한다(store를
     건드리기도 전에 차단 — CORS 헤더는 브라우저만 지켜주는 방어선이므로,
     서버 단에서도 한 번 더 막는다). 허용되지 않은 origin에는 절대
     `access-control-allow-origin`을 반사하거나 `*`를 쓰지 않는다.
  환자 제출(`POST /api/submissions`)은 이 규칙의 대상이 아니다 — 쓰기
  전용이고 응답에 `{id, created_at}`만 담기며, 태블릿은 LAN 내 임의의
  origin에서 접속하므로 기존처럼 origin을 그대로 반사한다.

## 4. 원장 PC의 LAN IP 찾기 (코드에 하드코딩하지 않는다)

`server/index.js`는 특정 IP를 알지 못한다 — `SAMINDANG_HOST=0.0.0.0`으로
모든 인터페이스에 바인드할 뿐이다. 태블릿이 접속할 실제 IP는 원장 PC에서
직접 확인한다.

Windows(원장 PC)에서:

```powershell
ipconfig | findstr /i "IPv4"
```

`무선 LAN 어댑터` 또는 `이더넷 어댑터` 아래 `192.168.x.x` 형태의 주소가
클리닉 공유기가 준 사설 IP다. (VPN이 떠 있으면 여러 개 나올 수 있으니
클리닉 Wi-Fi/유선 어댑터 것을 고른다.)

## 5. 태블릿(환자용) 빌드에 서버 주소 설정

`.env`(또는 `.env.local`, git에 커밋하지 않음)에:

```
VITE_SAMINDANG_SERVER_URL=http://192.168.0.10:4317
```

(4절에서 확인한 원장 PC의 실제 IP로 교체) 이 값을 설정하지 않으면 태블릿
앱은 오늘까지와 완전히 동일하게 동작한다 — 서버로 아무것도 보내지 않고,
전송 관련 UI도 나타나지 않는다.

설정 후 평소처럼 `npm run dev` / `npm run build`.

## 6. Windows 방화벽 (직접 설정해야 함 — 자동화하지 않음)

**이 프로젝트는 방화벽 규칙을 자동으로 바꾸지 않는다.** 기본적으로
Windows Defender 방화벽은 외부에서 들어오는(inbound) 임의 포트 연결을
막는다. 태블릿이 원장 PC의 4317 포트에 접속하려면, 원장 PC에서 관리자
권한으로 **Private(개인) 프로필에 한해** inbound 규칙을 열어줘야 한다.

GUI로:
1. Windows 보안 → 방화벽 및 네트워크 보호 → 고급 설정
2. 인바운드 규칙 → 새 규칙 → 포트 → TCP → 특정 로컬 포트: `4317`
3. 연결 허용 → **프로필: 개인(Private)만 체크, 도메인/공용은 해제**
4. 이름: 예) `samindang-handoff-4317`

또는 관리자 PowerShell에서 한 번에:

```powershell
New-NetFirewallRule -DisplayName "samindang-handoff-4317" `
  -Direction Inbound -Protocol TCP -LocalPort 4317 `
  -Action Allow -Profile Private
```

`-Profile Private`을 반드시 지정한다 — Public 프로필까지 열면 카페/공항
등 다른 네트워크에서도 노출될 수 있다. 클리닉 Wi-Fi가 Windows에
"공용 네트워크"로 잡혀 있다면 먼저 "개인 네트워크"로 바꾼 뒤 규칙을
적용한다.

## 7. 데이터 위치 / 백업 / 삭제

- 위치: `SAMINDANG_DATA_DIR`(기본 `./.data/submissions`) 아래 제출 1건당
  `<uuid>.json` 파일 1개.
- **git에 커밋되지 않는다** — `.gitignore`에 `.data/`가 등록돼 있다.
- **백업**: 이 디렉터리를 통째로 복사하면 된다(암호화된 외장 드라이브
  권장 — 환자 개인정보 포함).
- **삭제**: 특정 환자 데이터를 지우려면 해당 `<uuid>.json` 파일을
  삭제한다. 서버가 켜져 있는 동안 삭제해도 무방하다(다음 목록 조회 시
  자동으로 빠진다).
- 서버 재시작은 데이터를 잃지 않는다 — 파일 시스템이 곧 저장소다.

## 8. 태블릿이 서버에 연결되지 않을 때

1. 태블릿과 원장 PC가 **같은 Wi-Fi/네트워크**에 있는지 확인한다(게스트
   Wi-Fi는 기기간 통신을 막는 경우가 많다 — AP 격리 확인).
2. 원장 PC에서 서버가 실제로 떠 있는지 확인: 콘솔에 `listening on
   http://0.0.0.0:4317` 로그가 보이는지.
3. 원장 PC에서 `curl http://localhost:4317/api/health`(또는 브라우저로
   접속)로 로컬에서는 응답하는지 먼저 확인한다.
4. 6절의 방화벽 규칙이 적용됐는지 확인한다(Private 프로필, 올바른 포트).
5. `VITE_SAMINDANG_SERVER_URL`의 IP가 4절에서 확인한 **현재** IP와
   일치하는지 확인한다(DHCP로 IP가 바뀌었을 수 있다 — 필요하면 공유기에서
   고정 IP/예약을 설정).
6. 그래도 안 되면: 태블릿 앱은 서버 미설정 상태와 동일하게 동작하도록
   설계돼 있지 않다(전송 실패 UI가 뜬다) — 문진 내용은 화면의 개발자용
   JSON(Dev JSON)에 그대로 남아있으니 그동안 수기로 전달한다. 서버 없이도
   문진 자체는 끝까지 진행/완료된다.
