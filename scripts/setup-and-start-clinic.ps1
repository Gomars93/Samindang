<#
  삼인당 문진 — 클리닉 PC 원클릭 세팅 + 기동 (Windows)

  기존 `start-clinic.bat`은 "이미 빌드된 상태"를 전제로 서버 두 개만 띄운다.
  이 스크립트는 그 앞단계(코드 최신화 → LAN IP 확인 → .env.local 작성 →
  빌드)까지 한 번에 처리한 뒤 같은 두 서버를 띄운다. 원장이 태블릿 앞에
  앉기 전에 실행하는 단 하나의 파일이 되는 것이 목적이다.

  왜 필요한가: 클리닉 PC가 옛 커밋에 멈춰 있거나(pull 안 함), .env.local의
  변수명/IP가 틀리면(전송 실패) 증상이 "문진은 되는데 원장 화면에 안 뜬다"로
  똑같이 나타난다. 두 원인을 사람이 매번 눈으로 확인하는 대신 스크립트가
  확인하고 화면에 출력한다.

  환자 데이터 위치(SAMINDANG_DATA_DIR)를 저장소 바깥(기본
  C:\samindang-data\submissions)으로 지정하는 것도 이 스크립트의 역할이다 —
  저장소가 클라우드 동기화 폴더 안에 있으면 `.data/`가 통째로 외부로
  동기화되기 때문이다(RUNBOOK 2.3절).

  사용:
    scripts\setup-and-start-clinic.bat          (더블클릭)
    powershell -File scripts\setup-and-start-clinic.ps1 -Ip 192.168.0.10
    powershell -File scripts\setup-and-start-clinic.ps1 -SkipPull
#>
[CmdletBinding()]
param(
  # LAN IP를 직접 지정한다. 생략하면 자동 탐지하고, 후보가 2개 이상이면 멈춘다.
  [string]$Ip,
  # git pull을 건너뛴다(오프라인이거나 의도적으로 현재 커밋으로 돌릴 때).
  [switch]$SkipPull,
  # 환자 제출 JSON을 저장할 디렉터리. 저장소 바깥을 기본값으로 둔다.
  [string]$DataDir = 'C:\samindang-data\submissions',
  # 서버를 띄우지 않고 세팅(빌드)까지만 한다.
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

function Say([string]$m) { Write-Host $m }
function Warn([string]$m) { Write-Host $m -ForegroundColor Yellow }
function Die([string]$m) { Write-Host $m -ForegroundColor Red; Read-Host '엔터를 누르면 창이 닫힙니다'; exit 1 }
function AskContinue([string]$m) {
  Warn $m
  $a = Read-Host '그래도 계속할까요? (y/N)'
  if ($a -ne 'y' -and $a -ne 'Y') { Die '중단했습니다.' }
}

# --- 0. 도구 확인 -------------------------------------------------------
# 더블클릭 실행은 탐색기의 PATH를 물려받는다 -- node/npm이 PATH에 없으면 여기서
# 멈추고 이유를 말한다(빌드 중간에 알 수 없는 오류로 죽는 것보다 낫다).
# start-clinic.bat이 쓰던 기본 설치 경로를 동일하게 fallback으로 둔다.
$nodeDir = 'C:\Program Files\nodejs'
if (-not (Get-Command npm -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $nodeDir)) {
  $env:Path = "$nodeDir;$env:Path"
}
foreach ($tool in 'git', 'npm', 'node') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Die "'$tool' 를 찾을 수 없습니다 (PATH 미설정). Node.js/Git 설치를 확인하세요."
  }
}

Say '============================================================'
Say ' 삼인당 문진 — 클리닉 세팅 + 기동'
Say " 저장소: $repo"
Say '============================================================'

# --- 1. 코드 최신화 -------------------------------------------------------
if ($SkipPull) {
  Warn '[1/5] git pull 건너뜀 (-SkipPull)'
} else {
  Say '[1/5] 코드 최신화'
  $dirty = (& git status --porcelain) -join "`n"
  if ($dirty) {
    AskContinue "커밋되지 않은 변경이 있습니다. pull이 막히거나 충돌할 수 있습니다:`n$dirty"
  }
  $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main') {
    AskContinue "현재 브랜치가 '$branch' 입니다. 클리닉 PC는 보통 main 을 씁니다."
  }
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    AskContinue 'git pull 실패(네트워크/충돌). 지금 PC에 있는 코드로 계속합니다.'
  }
}
$head = (& git rev-parse --short HEAD).Trim()
$headDate = (& git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M').Trim()
Say "      현재 커밋: $head ($headDate)"

# --- 2. LAN IP ------------------------------------------------------------
Say '[2/5] LAN IP 확인'
if (-not $Ip) {
  $cands = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VMware|VirtualBox|Hyper-V|Docker|WSL|TAP|VPN'
    } | Select-Object -ExpandProperty IPAddress -Unique
  if (-not $cands) { Die 'LAN IP를 찾지 못했습니다. -Ip 192.168.x.x 로 직접 지정하세요.' }
  if ($cands.Count -gt 1) {
    Warn ('IP 후보가 여러 개입니다: ' + ($cands -join ', '))
    Die  '클리닉 Wi-Fi/유선 어댑터의 주소를 -Ip 로 직접 지정하세요.'
  }
  $Ip = $cands
}
Say "      LAN IP: $Ip"

# --- 3. .env.local --------------------------------------------------------
Say '[3/5] .env.local 작성'
$envPath = Join-Path $repo '.env.local'
$target  = "VITE_SAMINDANG_SERVER_URL=http://${Ip}:4317"
$keep = @()
if (Test-Path -LiteralPath $envPath) {
  $keep = Get-Content -LiteralPath $envPath | Where-Object { $_ -notmatch '^\s*VITE_SAMINDANG_SERVER_URL\s*=' }
}
# 변수명이 틀린 채로 쓰여 있던 과거 사고(HANDOFF 2026-09-08)를 막기 위해
# 이 줄만 항상 스크립트가 다시 쓴다. 나머지 줄은 손대지 않는다.
($keep + $target) | Set-Content -LiteralPath $envPath -Encoding ASCII
Say "      $target"

# --- 4. 빌드 --------------------------------------------------------------
Say '[4/5] 빌드 (tsc -b && vite build)'
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules'))) {
  Say '      node_modules 없음 → npm install'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'npm install 실패.' }
}
& npm run build
if ($LASTEXITCODE -ne 0) { Die '빌드 실패. 위 오류를 확인하세요 (코드가 깨진 상태로 진료에 쓰지 마세요).' }

# --- 5. 기동 --------------------------------------------------------------
if (-not (Test-Path -LiteralPath $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
$env:SAMINDANG_DATA_DIR = $DataDir

Say ''
Say '============================================================'
Say "  태블릿(환자):  http://${Ip}:4173"
Say "  원장 화면:     http://localhost:4173/#doctor"
Say "  환자 데이터:   $DataDir"
Say '============================================================'
Say ''

if ($NoStart) { Say '세팅만 완료(-NoStart). 서버는 띄우지 않았습니다.'; Read-Host '엔터를 누르면 창이 닫힙니다'; exit 0 }

Say '[5/5] 서버 2개 기동 (각각 새 창)'
# `set VAR=값 && ...` 은 && 앞의 공백까지 값에 넣는다(경로 끝에 공백이 붙는 고전적 버그).
# 반드시 `set "VAR=값"` 형태로 쓴다. -WorkingDirectory도 명시해 더블클릭 실행에서 흔들리지 않게 한다.
Start-Process -FilePath 'cmd.exe' -WorkingDirectory $repo -ArgumentList '/k', "title samindang-handoff-server && set \"SAMINDANG_DATA_DIR=$DataDir\" && node server\index.js"
Start-Process -FilePath 'cmd.exe' -WorkingDirectory $repo -ArgumentList '/k', 'title samindang-patient-preview && npm run preview -- --host'

Say ''
Say '두 창을 닫거나 Ctrl+C 하면 종료됩니다. 하루 끝에 그렇게 끄시면 됩니다.'
Read-Host '엔터를 누르면 이 창이 닫힙니다(서버 두 창은 그대로 남습니다)'
