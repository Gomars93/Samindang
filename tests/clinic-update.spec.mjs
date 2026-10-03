/*
 * 클리닉 PC 업데이트 스크립트 계약 — 2026-10-03.
 *
 * 왜 이 스크립트가 생겼나: PR을 합칠 때마다 클리닉 PC에서 명령 서너 개를 사람이 쳐야 했고, 2026-10-02 실기기에서
 * 같은 사고가 반복됐다 -- (1) 저장소가 구글 드라이브 폴더 안이라 `git pull`이 ".git/objects 삭제 실패 (y/n)"에서 멈춤,
 * (2) PowerShell이 `npm.ps1` 실행을 막음, (3) 코드는 받았는데 병합이 중단돼 옛 코드 그대로 빌드, (4) 서버를 안 다시 켬.
 *
 * 이 스크립트는 **파괴적이면 안 된다.** 환자 PC의 코드를 덮어쓰거나 환자 데이터를 건드리는 스크립트는
 * 업데이트 편의보다 훨씬 위험하다. 그래서 이 파일은 "무엇을 하는가"보다 "무엇을 절대 안 하는가"를 먼저 고정한다.
 *
 * 이 리눅스 세션에는 PowerShell이 없어 실행 검증은 못 한다 -- 정적 대조로만 확인한다는 한계를 안고 간다
 * (tests/clinic-diagnose.spec.mjs와 같다). 첫 실기기 실행 결과로 보강한다.
 *
 * `npm run test:clinic-update` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const PS = 'scripts/update-clinic.ps1'
const BAT = 'scripts/update-clinic.bat'
check('업데이트 스크립트(.ps1)와 런처(.bat)가 존재한다', existsSync(new URL(`../${PS}`, import.meta.url)) && existsSync(new URL(`../${BAT}`, import.meta.url)))

const raw = readFileSync(new URL(`../${PS}`, import.meta.url))
check('.ps1이 UTF-8 BOM으로 시작한다 (Windows PowerShell 5.1이 한글 메시지를 깨지 않고 읽는 조건)', raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf)
const ps = raw.toString('utf8')
const bat = read(BAT)
// 주석(`<# ... #>`, `# ...`)을 뗀 코드만 본다 -- 주석에 "git pull은 쓰지 않는다"고 적어도 통과/실패가 뒤집히면 안 된다.
const code = ps.replace(/<#[\s\S]*?#>/g, '').replace(/^\s*#.*$/gm, '')

check('.bat이 같은 폴더의 .ps1을 ExecutionPolicy Bypass로 부른다(PowerShell 기본 보안 설정에 막히지 않는다)', bat.includes('%~dp0update-clinic.ps1') && bat.includes('-ExecutionPolicy Bypass'))
check('.bat은 ASCII만 쓴다(cmd 코드페이지에서 한글 REM이 깨지는 사고 방지)', !/[^\x00-\x7F]/.test(bat))
check('.ps1이 깨지는 백슬래시-쌍따옴표(\\") 이스케이프를 쓰지 않는다(2026-09-21 실기기 사고 재발 방지)', !ps.includes('\\"'))

/* ---- 하지 않는 것 (파괴적 명령 금지) ---- */
for (const [label, re] of [
  ['git pull(병합이 구글 드라이브 정리 질문에서 중단되던 경로)', /git\s+pull/],
  ['git reset', /git\s+(?:@\w+\s+)*reset/],
  ['git clean', /git\s+(?:@\w+\s+)*clean/],
  ['git checkout/restore (로컬 변경 덮어쓰기)', /git\s+(?:@\w+\s+)*(?:checkout|restore|stash)/],
  ['--force / -f 강제 옵션', /--force\b|\s-f\s/],
  ['파일·폴더 삭제(Remove-Item, rm, del)', /Remove-Item|\brm\s|\bdel\s|\brmdir\b/i],
  ['.data·환자 데이터 경로 접근', /\.data|SAMINDANG_DATA_DIR|submissions/],
  ['.env.local 쓰기', /Set-Content|Out-File|Add-Content/],
]) {
  check(`.ps1은 ${label}를 쓰지 않는다`, !re.test(code))
}

/* ---- 하는 것 ---- */
check('main 브랜치가 아니면 멈춘다', code.includes("rev-parse --abbrev-ref HEAD") && code.includes("$branch -ne 'main'") && /Die "현재 브랜치가/.test(code))
check('커밋 안 된 변경이 있으면 멈춘다(덮어쓰지 않는다) -- 추적 안 되는 잔여 파일 때문에 매번 멈추지는 않는다(--untracked-files=no)', code.includes('status --porcelain --untracked-files=no') && /if \(\$dirty\)\s*\{\s*Die/.test(code))
check('코드는 `merge --ff-only origin/main` 하나로만 받고, 실패하면 멈춘다', /merge --ff-only origin\/main/.test(code) && /LASTEXITCODE -ne 0\)\s*\{\s*\n?\s*Die "합칠 수 없습니다/.test(code))
check('구글 드라이브 정리 질문을 막는다 -- fetch·merge가 이 실행에서만 gc.auto=0, maintenance.auto=false를 쓴다', code.includes("'gc.auto=0'") && code.includes("'maintenance.auto=false'") && (code.match(/git @gitQuiet/g) || []).length === 2)
check('npm 대신 npm.cmd를 쓴다(PowerShell 실행 정책 우회 없이 npm.ps1을 피한다)', code.includes('npm.cmd run build') && code.includes('npm.cmd install') && !/&\s*npm\s/.test(code))
check('npm install은 package.json·package-lock.json이 바뀌었거나 node_modules가 없을 때만 한다', /\$changed -contains 'package\.json'/.test(code) && /\$changed -contains 'package-lock\.json'/.test(code) && /Test-Path -LiteralPath \(Join-Path \$repo 'node_modules'\)/.test(code))
check('빌드가 실패하면 서버를 다시 켜지 않고 멈춘다(Die가 재시작 단계보다 먼저다)', code.indexOf('빌드 실패') > 0 && code.indexOf('빌드 실패') < code.indexOf('SamindangDoctorAPI'))
check('이미 최신이면 빌드·재시작 없이 끝난다(-ForceBuild로만 강제)', /\$before -eq \$after -and -not \$ForceBuild/.test(code) && code.includes('[switch]$ForceBuild'))
check('옛 서버가 포트를 쥐고 있으면 재시작 전에 알린다(4317·4173)', /foreach \(\$port in 4317, 4173\)/.test(code) && code.includes('Get-NetTCPConnection -LocalPort $port -State Listen'))
check('-NoRestart로 서버 재시작을 건너뛸 수 있다', code.includes('[switch]$NoRestart') && /if \(\$NoRestart\)/.test(code))

/* ---- 문서·다른 스크립트와의 일치 ---- */
const regDoctor = read('scripts/register-doctor-api-task.ps1')
const regPreview = read('scripts/register-patient-preview-task.ps1')
check('재시작하는 작업 이름이 자동 시작 등록 스크립트의 이름과 같다', regDoctor.includes("'SamindangDoctorAPI'") && regPreview.includes("'SamindangPatientPreview'") && code.includes("'SamindangDoctorAPI', 'SamindangPatientPreview'"))
check('확인하는 주소가 서버 코드에 실제로 있다(/api/health)', /parts\[0\] === 'api' && parts\[1\] === 'health' && req\.method === 'GET'/.test(read('server/index.js')) && code.includes('http://localhost:4317/api/health') && code.includes('http://localhost:4173'))
check('등록되지 않은 작업은 에러가 아니라 안내로 처리한다(첫 설치 PC에서 안 죽는다)', code.includes('등록되지 않은 작업') && code.includes('register-clinic-autostart.ps1'))
const checklist = read('docs/REAL_DEVICE_PILOT_CHECKLIST.md')
check('실기기 체크리스트에 "업데이트" 절이 있고 .bat 이름을 안내한다', checklist.includes('## 업데이트') && checklist.includes('scripts\\update-clinic.bat'))
check('체크리스트가 환자가 문진 중일 때 실행하지 말라고 경고한다', /환자가 문진 중이 아닐 때/.test(checklist))

console.log(`\nSUMMARY: ${passed} assertions passed, 0 failed (total ${passed})`)
