<#
  삼인당 문진 — 클리닉 PC 업데이트 (Windows) : 새 버전 받기 → 빌드 → 서버 재시작

  왜 필요한가: 새 기능이 main에 합쳐질 때마다 클리닉 PC에서 명령 서너 개를 손으로 쳐야 했고,
  그 과정에서 같은 사고가 반복됐다(2026-10-02 실기기).
    - 저장소가 구글 드라이브 폴더 안이라 `git pull`이 끝에서 ".git/objects 삭제 실패 (y/n)"로 멈춘다.
    - PowerShell 기본 보안 설정이 `npm.ps1` 실행을 막는다(`npm` 대신 `npm.cmd`가 필요).
    - 패키지가 늘었는데 `npm install`을 빼먹거나, 서버 코드가 바뀌었는데 서버를 안 다시 켠다.
  이 스크립트는 그 순서를 한 번에, 안전하게 처리한다.

  안전 규칙(바꾸지 말 것):
    - main 브랜치가 아니거나, 커밋 안 된 변경이 있으면 **아무것도 바꾸지 않고** 멈춘다.
    - 코드를 받는 방법은 `merge --ff-only` 하나뿐이다. 합칠 수 없으면 멈춘다(덮어쓰기·강제 이동 없음).
    - 환자 데이터(.data, SAMINDANG_DATA_DIR)와 .env.local은 건드리지 않는다.
    - 구글 드라이브가 .git 안 파일을 잡고 있어도 멈추지 않게 자동 정리(gc)를 이 실행에서만 끈다.

  주의: 서버를 다시 켜는 몇 초 동안 태블릿 제출이 실패할 수 있다 — 환자가 문진 중이 아닐 때 실행한다.

  사용:
    scripts\update-clinic.bat          (더블클릭)
    powershell -File scripts\update-clinic.ps1 -NoRestart     (서버는 그대로 두고 빌드까지만)
    powershell -File scripts\update-clinic.ps1 -ForceBuild    (이미 최신이어도 다시 빌드)
#>
[CmdletBinding()]
param(
  # 서버(작업 스케줄러) 재시작을 건너뛴다.
  [switch]$NoRestart,
  # 이미 최신 커밋이어도 빌드와 재시작을 한다.
  [switch]$ForceBuild
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

function Say([string]$m) { Write-Host $m }
function Warn([string]$m) { Write-Host $m -ForegroundColor Yellow }
function Die([string]$m) { Write-Host $m -ForegroundColor Red; Read-Host '엔터를 누르면 창이 닫힙니다'; exit 1 }

# git 자동 정리를 이 실행에서만 끈다(구글 드라이브 폴더 안 .git 삭제 실패 질문 방지). 설정 파일은 바꾸지 않는다.
$gitQuiet = @('-c', 'gc.auto=0', '-c', 'maintenance.auto=false')

# --- 0. 도구 확인 -------------------------------------------------------
$nodeDir = 'C:\Program Files\nodejs'
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $nodeDir)) {
  $env:Path = "$nodeDir;$env:Path"
}
foreach ($tool in 'git', 'node', 'npm.cmd') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Die "'$tool' 를 찾을 수 없습니다 (PATH 미설정). Node.js/Git 설치를 확인하세요."
  }
}

Say '============================================================'
Say ' 삼인당 문진 — 클리닉 PC 업데이트'
Say " 저장소: $repo"
Say '============================================================'

# --- 1. 안전 확인 -------------------------------------------------------
Say '[1/5] 안전 확인'
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') {
  Die "현재 브랜치가 '$branch' 입니다. 자동 업데이트는 main 에서만 합니다 (아무것도 바꾸지 않았습니다)."
}
# 추적 중인 파일의 변경만 본다 -- 추적 안 되는 임시 파일(예: docs 안 편집기 잔여물) 때문에 매번 멈추면 안 된다.
# 받을 파일과 겹치는 추적 안 되는 파일이 있으면 아래 merge 가 스스로 실패하고 멈춘다.
$dirty = (& git status --porcelain --untracked-files=no) -join "`n"
if ($dirty) {
  Die "커밋되지 않은 변경이 있어 멈춥니다 (덮어쓰지 않았습니다):`n$dirty"
}
$before = (& git rev-parse HEAD).Trim()
Say "      현재 커밋: $(& git log -1 --format='%h %s')"

# --- 2. 코드 받기 -------------------------------------------------------
Say '[2/5] 새 코드 받기 (fetch → merge --ff-only)'
& git @gitQuiet fetch origin main
if ($LASTEXITCODE -ne 0) { Die 'git fetch 실패 (네트워크/인증). 아무것도 바꾸지 않았습니다.' }
& git @gitQuiet merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) {
  Die "합칠 수 없습니다 (이 PC에만 있는 커밋이 있을 수 있습니다). 강제로 덮어쓰지 않고 멈춥니다. 개발자에게 알려 주세요."
}
$after = (& git rev-parse HEAD).Trim()
if ($before -eq $after -and -not $ForceBuild) {
  Say "      이미 최신입니다: $(& git log -1 --format='%h %s')"
  Read-Host '변경이 없어 빌드와 재시작을 하지 않았습니다. 엔터를 누르면 창이 닫힙니다'
  exit 0
}
$changed = @()
if ($before -ne $after) { $changed = @(& git diff --name-only $before $after) }
Say "      업데이트됨: $(& git log -1 --format='%h %s')"
Say "      바뀐 파일 $($changed.Count)개"

# --- 3. 패키지 -----------------------------------------------------------
Say '[3/5] 패키지 확인'
$needInstall = (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules'))) -or ($changed -contains 'package.json') -or ($changed -contains 'package-lock.json')
if ($needInstall) {
  Say '      package.json 이 바뀌었거나 node_modules 가 없어 npm install 을 합니다.'
  & npm.cmd install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'npm install 실패. 위 오류를 확인하세요.' }
} else {
  Say '      패키지 변경 없음 — 건너뜁니다.'
}

# --- 4. 빌드 -------------------------------------------------------------
Say '[4/5] 빌드 (tsc -b && vite build)'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { Die '빌드 실패. 위 오류를 확인하세요 (코드가 깨진 상태로 진료에 쓰지 마세요).' }

# --- 5. 서버 재시작 ------------------------------------------------------
if ($NoRestart) {
  Warn '[5/5] 서버 재시작 건너뜀 (-NoRestart)'
} else {
  Say '[5/5] 서버 재시작 (작업 스케줄러)'
  $tasks = 'SamindangDoctorAPI', 'SamindangPatientPreview'
  $missing = @()
  foreach ($t in $tasks) {
    if (-not (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue)) { $missing += $t; continue }
    Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  # 옛 서버가 포트를 쥐고 있으면 새 서버가 못 뜬다(작업 스케줄러가 1분마다 재시도만 한다) -- 미리 알린다.
  foreach ($port in 4317, 4173) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
      Warn "      포트 $port 를 아직 이전 서버가 쓰고 있습니다. 새 코드가 안 뜰 수 있습니다 - 1분 뒤에도 같으면 PC를 재시작하세요."
    }
  }
  foreach ($t in $tasks) {
    if ($missing -contains $t) { continue }
    Start-ScheduledTask -TaskName $t
  }
  if ($missing.Count -gt 0) {
    Warn ('      등록되지 않은 작업: ' + ($missing -join ', ') + ' — 서버를 직접 켜세요 (scripts\register-clinic-autostart.ps1 로 등록).')
  }
  # 응답할 때까지 최대 20초 기다린다.
  foreach ($target in @(@('원장 서버(4317)', 'http://localhost:4317/api/health'), @('환자 앱(4173)', 'http://localhost:4173'))) {
    $ok = $false
    for ($i = 0; $i -lt 10; $i++) {
      try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $target[1] -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ok = $true; break }
      } catch { }
      Start-Sleep -Seconds 2
    }
    if ($ok) { Say "      $($target[0]) 응답 정상" } else { Warn "      $($target[0]) 응답 없음 — 잠시 뒤 다시 확인하세요." }
  }
}

Say '============================================================'
Say " 완료: $(& git log -1 --format='%h %s')"
Say ' 브라우저에서 Ctrl+Shift+R 로 새로고침하세요.'
Say '============================================================'
Read-Host '엔터를 누르면 창이 닫힙니다'
