# Tablet Questionnaire — Preview Deployment

작성일: 2026-08-25
Branch: `chore/tablet-preview-deploy`
Base: `main` @ `8985c72` (post-UX-verification merge, PR #17)
Final head (이 문서 작성 시점): `50d8a6a361e0d63d14e66c87c559351fd9df228a`

## Scope

**UI 체험용 배포만 수행한다.** 임상 로직/routing/thresholds/CLOSED/FROZEN
semantics는 한 글자도 변경하지 않았다 — §"Zero-diff clinical verification"에서
`git diff` 결과로 확인.

## Preview URL

예상 URL: **`https://gomars93.github.io/Samindang/`**

**아직 실제로 확인하지 못했다** — 이유는 §"Deployment method"와
§"HUMAN ACTION REQUIRED" 참고. GitHub의 `workflow_dispatch` API는 워크플로가
**default branch(main)에 이미 존재해야만** 그 워크플로를 인식한다 — 이
브랜치(`chore/tablet-preview-deploy`)에서 `pages-preview.yml`을 직접
dispatch 시도했더니 `404 Not Found`가 반환됐다(워크플로가 아직 GitHub에
등록되지 않음, main에 merge된 적이 없기 때문). 이 PR의 HARD STOP(merge
금지) 때문에 이 세션 안에서는 실제로 한 번도 배포를 실행/확인할 수 없다 —
main에 merge된 후 첫 push 또는 수동 `workflow_dispatch`로 처음 실행된다.

## Deployment method

**GitHub Pages + GitHub Actions** (요청 우선순위 1번, 그대로 사용 가능 —
repository 구조상 Pages를 막는 요소 없음, 대체 방안 불필요).

- Workflow: `.github/workflows/pages-preview.yml`
- Trigger: `push` to `main`, 그리고 `workflow_dispatch`(수동 실행 지원)
- Build: `npm ci` → `npm run build:preview`(`tsc -b && vite build --mode
  ghpages`) → `actions/configure-pages` → `actions/upload-pages-artifact`
  (`dist/`) → `actions/deploy-pages`
- Node 22, 기존 `ci.yml`과 동일한 setup-node 설정

## Preview env vars

빌드 시점에만 설정되고 `import.meta.env`를 통해 정적으로 치환된다(런타임
secret 없음):

| 변수 | 값 (preview 빌드) | 값 (일반 production 빌드) |
|---|---|---|
| `VITE_PREVIEW_MODE` | `'true'` | 미설정 |
| `VITE_SAMINDANG_SERVER_URL` | `''` (명시적으로 빈 문자열) | 배포 환경마다 설정 |

`vite.config.ts`의 `base`는 env var가 아니라 Vite `mode`로 분리했다 —
`vite build --mode ghpages`일 때만 `/Samindang/`, 그 외(로컬 dev, 기존
`npm run build`)는 항상 `/`. 별도 코드 분기 없이 build 설정만으로 해결했다
(요청 §3의 "가능하면 별도 코드 분기 추가 없이 build env만으로 해결" 충족).

Secret은 전혀 필요 없다 — OpenAI API key 등 어떤 시크릿도 preview 빌드에
관여하지 않는다(`devDependencies`의 `openai` 패키지는 이 preview 경로에서
전혀 import되지 않는다).

## NO-PHI guarantees

- **Server submission 비활성**: `VITE_SAMINDANG_SERVER_URL`을 빈 문자열로
  명시 설정 → `isServerConfigured()`(`src/lib/serverClient.ts`, 미변경)가
  `false` → `submitQuestionnaire()`/`listSubmissions()` 등 모든 서버 호출
  함수가 `fetch`를 한 번도 호출하지 않고 `{ok:false}`로 즉시 반환한다.
  `tests/preview-build.spec.mjs`가 `global.fetch`를 던지도록 monkey-patch해
  실제로 호출되지 않음을 회귀 테스트로 고정했다.
- **실제 API endpoint 미사용**: 빌드된 JS 번들 전체를 검사해 `http(s)://`
  형태의 URL이 React/SVG 네임스페이스(w3.org, reactjs.org) 외에는 전혀
  없음을 확인했다(같은 테스트 파일).
- **local/session persistent storage 장기 저장 금지**: 기존 앱 자체가 이미
  이렇게 동작한다(변경하지 않음) — 문진 응답은 React state에만 존재하고
  `localStorage`/`sessionStorage`에 저장되지 않으며, 제출 성공/server
  미구성/restart 시 즉시 wipe된다(PR #17에서 이미 회귀 테스트로 고정됨).
- **Analytics/telemetry 외부 전송 금지**: 이 저장소에는 애초에 analytics
  SDK가 없다 — 추가하지 않았다.
- **실제 운영 server URL 하드코딩 금지**: 코드 전체에 하드코딩된 URL이
  없음(기존부터 그랬음, `grep`으로 재확인) — 모든 서버 접근은
  `import.meta.env.VITE_SAMINDANG_SERVER_URL` 하나를 거친다.
- **Secret 불필요**: 위 참고.
- **Production patient endpoint 미호출**: 위 "server submission 비활성"과
  동일한 근거.

## Doctor route (`#doctor`) behavior

**막지 않았다** — 막을 필요가 없다는 것을 구조적으로 확인했다:

`src/doctor/DoctorView.tsx`는 기본적으로 `mode: 'fixtures'`로 시작하며(예시
데이터만 표시), 화면 안에 "서버 제출목록" 옵션으로 전환할 수 있는 select가
있다. 하지만 그 모드로 전환해도 `listSubmissions()`가
`isServerConfigured()`를 먼저 확인하므로, preview 빌드(`VITE_SAMINDANG_SERVER_URL`
미설정)에서는 실제 네트워크 요청이 전혀 발생하지 않고 "서버가 설정되지
않았습니다" 에러만 표시된다 — 실제 운영 데이터에 접근할 방법이 코드
구조상 존재하지 않는다. `tests/preview-build.spec.mjs`가 이를 회귀 테스트로
고정했다.

## Vite base path

```ts
// vite.config.ts
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'ghpages' ? '/Samindang/' : '/',
  server: { port: 5173 },
}))
```

실제로 두 빌드를 모두 실행해 `dist/index.html`의 asset 경로를 확인했다:

- `npm run build` (일반) → `/assets/...` (base `/`)
- `npm run build:preview` (`--mode ghpages`) → `/Samindang/assets/...`

## Test results

| 명령 | 결과 |
|---|---|
| `npx tsc -b --force` | clean |
| `npm run build` | 134 modules, clean, base `/` |
| `npm run build:preview` (VITE_PREVIEW_MODE=true, VITE_SAMINDANG_SERVER_URL=) | 134 modules, clean, base `/Samindang/` |
| `npm run test:preview-build` (신규) | 25 passed, 0 failed |
| `npm run test:all` | 전체 green, exit 0 |
| `python -m pytest "tablet core/tests" -q` | 80 passed |

로컬 정적 서버(`python -m http.server`)로 preview 빌드 산출물을 서빙해
`curl`로 `HTTP_STATUS:200` + `<div id="root">` + viewport meta 존재를
확인했다(빌드 산출물 자체의 정적 스모크 테스트 — 실제 GitHub Pages
공개 URL의 살아있는 HTTP 200 확인은 배포 후에만 가능, 아래 참고).

## Redeploy 방법

1. `main`에 push되면 자동 배포된다(`pages-preview.yml`의 `push: branches:
   [main]` 트리거).
2. 수동 재배포: GitHub 저장소 → Actions → "Deploy Tablet Preview to GitHub
   Pages" → "Run workflow" (`workflow_dispatch`), 원하는 branch/ref 선택.

## Rollback / remove 방법

- **일시 중단**: GitHub 저장소 Settings → Pages → "Build and deployment"에서
  Source를 변경하거나 비활성화한다. 코드 변경 불필요.
- **완전 제거**: `.github/workflows/pages-preview.yml` 삭제 + 저장소
  Settings → Pages에서 site 삭제. `vite.config.ts`/`build:preview`/
  `PreviewBanner.tsx`는 dead code가 되지만 production 빌드 동작에는 아무
  영향이 없으므로 급하게 같이 지울 필요는 없다(원한다면 별도 후속 PR로
  정리).
- **이전 배포로 되돌리기**: GitHub Pages는 각 배포를 하나의 GitHub
  Deployment로 기록한다 — 저장소의 "Environments" → `github-pages`에서
  과거 배포 이력을 확인/재실행할 수 있다.

## HUMAN ACTION REQUIRED

이 저장소의 GitHub Pages 설정(Settings → Pages → Build and deployment →
Source: **GitHub Actions**)이 이미 활성화되어 있는지 이 세션에서는 확인할
수단이 없다(사용 가능한 GitHub MCP 도구 중 repository/Pages 설정을
조회·변경하는 도구가 없음). 또한 `workflow_dispatch`는 워크플로가 default
branch에 존재해야 GitHub API가 인식하므로, 이 PR이 merge되기 전에는 실제
배포를 한 번도 실행/검증할 수 없었다(직접 시도해 `404 Not Found` 확인,
위 참고).

**사람이 할 일**: 이 PR을 merge한 뒤,
1. 저장소 Settings → Pages에서 Source가 "GitHub Actions"로 설정되어 있는지
   확인(안 되어 있으면 활성화)한다.
2. `main`으로의 merge가 워크플로를 자동 트리거하거나, 필요하면 Actions
   탭에서 "Deploy Tablet Preview to GitHub Pages"를 수동 실행한다.
3. 배포 완료 후 `https://gomars93.github.io/Samindang/` (또는 워크플로
   실행 결과에 표시되는 실제 URL)이 HTTP 200으로 열리고 문진 시작 화면이
   정상 렌더링되는지, 그리고 화면 상단에 미리보기 배너가 보이는지 최종
   확인한다.

## Zero-diff clinical verification

```
git diff --stat origin/main -- src/spec/ src/doctor/
```

→ **빈 출력**(완전 zero-diff). 이번 작업이 실제로 건드린 파일:

- `vite.config.ts` (base path만)
- `src/components/PreviewBanner.tsx` (신규)
- `src/App.tsx` (배너 렌더링 한 줄 추가)
- `src/styles.css` (`.previewBanner` 규칙만)
- `package.json` (`build:preview`/`test:preview-build` 스크립트)
- `.github/workflows/pages-preview.yml` (신규)
- `tests/preview-build.spec.mjs` (신규)
- `.gitignore` (신규 테스트 번들 산출물)

질문 문구/option label/clinical wording은 단 한 글자도 수정하지 않았다.

## Final head SHA

`50d8a6a361e0d63d14e66c87c559351fd9df228a`
