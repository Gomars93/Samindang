<#
  삼인당 문진 — 클리닉 PC 원클릭 진단 (Windows)

  왜 필요한가: 2026-09-21 실기기 세션에서 "왜 접속이 안 되냐"는 질문에
  답하려고 매번 명령을 하나씩 불러주고 결과를 받아 다음 명령을 주는
  왕복이 반복됐다(IP 확인 -> 방화벽 -> 네트워크 프로필 -> 포트 상태 -> ...).
  이 스크립트는 그 왕복 전부를 한 번에 실행해 한 블록으로 결과를 낸다 --
  이 출력 전체를 그대로 복사해서 붙여넣으면 원격 세션에서도 첫 턴에
  원인을 좁힐 수 있다.

  이 스크립트가 볼 수 없는 것(구조적 한계, 숨기지 않는다):
  - 브라우저 안에서 실제로 무슨 에러가 뜨는지(CORS, JS 예외 등)는
    F12 개발자 도구로만 보인다 -- 이 스크립트는 그 부분은 대신하지 못한다.
  - 태블릿이 별도 물리 기기라면, 이 스크립트는 "이 PC" 기준으로만 진단한다.

  사용:
    scripts\diagnose-clinic.bat          (더블클릭)
    powershell -File scripts\diagnose-clinic.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

function Section([string]$title) {
  Write-Host ''
  Write-Host "== $title ==" -ForegroundColor Cyan
}
function Ok([string]$m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Bad([string]$m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Info([string]$m) { Write-Host "  $m" }

$issues = @()

Write-Host '============================================================'
Write-Host ' 삼인당 문진 — 클리닉 진단'
Write-Host " 시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host '============================================================'

# --- 1. LAN IP ------------------------------------------------------------
Section '1) 이 PC의 LAN IP'
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
    $_.PrefixOrigin -ne 'WellKnown' -and
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VMware|VirtualBox|Hyper-V|Docker|WSL|TAP|VPN'
  }
foreach ($ip in $ips) { Info "$($ip.InterfaceAlias): $($ip.IPAddress)" }

$envPath = Join-Path $repo '.env.local'
$builtUrl = $null
if (Test-Path -LiteralPath $envPath) {
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*VITE_SAMINDANG_SERVER_URL\s*=' }
  if ($line) { $builtUrl = ($line -split '=', 2)[1].Trim() }
}
if ($builtUrl) {
  Info "빌드에 박힌 서버 주소(.env.local): $builtUrl"
  $builtIp = [regex]::Match($builtUrl, '://([\d\.]+):').Groups[1].Value
  if ($builtIp -and ($ips.IPAddress -contains $builtIp)) {
    Ok "빌드된 IP($builtIp)가 현재 이 PC의 IP와 일치한다."
  } elseif ($builtIp) {
    Bad "빌드된 IP($builtIp)가 지금 이 PC의 어떤 IP와도 안 맞는다 -- IP가 바뀌었다."
    $issues += "IP 불일치: .env.local=$builtIp, 현재 PC IP=$($ips.IPAddress -join ', ') -> setup-and-start-clinic.bat 재실행 필요"
  }
} else {
  Bad ".env.local이 없거나 VITE_SAMINDANG_SERVER_URL 줄이 없다."
  $issues += ".env.local 없음/서버 주소 없음 -> setup-and-start-clinic.bat 실행 필요"
}

# --- 2. 네트워크 프로필 ----------------------------------------------------
Section '2) 네트워크 프로필 (Public이면 다른 기기 접속이 방화벽에 막힐 수 있음)'
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
foreach ($p in $profiles) {
  if ($p.NetworkCategory -eq 'Public') {
    Bad "$($p.Name) ($($p.InterfaceAlias)) = Public"
    $issues += "$($p.InterfaceAlias) 네트워크가 Public -> Set-NetConnectionProfile -InterfaceAlias `"$($p.InterfaceAlias)`" -NetworkCategory Private (관리자 권한 필요)"
  } else {
    Ok "$($p.Name) ($($p.InterfaceAlias)) = $($p.NetworkCategory)"
  }
}

# --- 3. 방화벽 규칙 ---------------------------------------------------------
Section '3) 방화벽 인바운드 규칙 (포트 4317)'
$fwRules = Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' } |
  Where-Object {
    $portFilter = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    $portFilter -and ($portFilter.LocalPort -contains '4317' -or $portFilter.LocalPort -eq '4317')
  }
if ($fwRules) {
  foreach ($r in $fwRules) {
    if ($r.Enabled -eq 'True' -or $r.Enabled -eq $true) {
      Ok "$($r.DisplayName) (Profile=$($r.Profile), Enabled=$($r.Enabled))"
    } else {
      Bad "$($r.DisplayName)이 있지만 비활성화(Enabled=False)"
      $issues += "방화벽 규칙 '$($r.DisplayName)' 비활성화 -> Enable-NetFirewallRule -DisplayName `"$($r.DisplayName)`""
    }
  }
} else {
  Bad '포트 4317을 허용하는 인바운드 규칙을 찾지 못했다.'
  $issues += '4317 인바운드 규칙 없음 -> New-NetFirewallRule -DisplayName "samindang-handoff-4317" -Direction Inbound -Protocol TCP -LocalPort 4317 -Action Allow -Profile Private (관리자 권한 필요)'
}

# --- 4. 서버 프로세스(포트 리스닝) ------------------------------------------
Section '4) 핸드오프 서버 (포트 4317)'
$listening = Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  foreach ($l in $listening) {
    $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
    Ok "포트 4317 리스닝 중 (PID=$($l.OwningProcess), 프로세스=$($proc.ProcessName))"
  }
} else {
  Bad '포트 4317에 아무도 리스닝하고 있지 않다 -- 서버가 꺼져 있다.'
  $tokenHint = if ($env:SAMINDANG_DOCTOR_TOKEN) { $env:SAMINDANG_DOCTOR_TOKEN } else { '<아까 정한 토큰 값>' }
  $issues += "서버 꺼짐 -> `$env:SAMINDANG_DOCTOR_TOKEN=`"$tokenHint`"; `$env:SAMINDANG_DATA_DIR=`"C:\samindang-data\submissions`"; node server\index.js"
}

# --- 5. 프리뷰 서버(포트 4173) ----------------------------------------------
Section '5) 태블릿 프리뷰 서버 (포트 4173)'
$listening4173 = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if ($listening4173) {
  Ok '포트 4173 리스닝 중'
} else {
  Bad '포트 4173에 아무도 리스닝하고 있지 않다 -- 태블릿 화면 서버가 꺼져 있다.'
  $issues += '프리뷰 서버 꺼짐 -> npm run preview -- --host'
}

# --- 6. 실제 HTTP 응답 -------------------------------------------------------
Section '6) 서버 응답 확인 (localhost / LAN IP 둘 다)'
function TestHealth([string]$url) {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
    Ok "$url -> $($res.StatusCode) $($res.Content)"
    return $true
  } catch {
    Bad "$url -> 실패: $($_.Exception.Message)"
    return $false
  }
}
$localOk = TestHealth 'http://localhost:4317/api/health'
$lanIp = ($ips | Select-Object -First 1).IPAddress
if ($lanIp) {
  $lanOk = TestHealth "http://${lanIp}:4317/api/health"
  if ($localOk -and -not $lanOk) {
    $issues += 'localhost는 되는데 LAN IP는 안 됨 -> 방화벽/네트워크 프로필 문제 (위 2·3번 확인)'
  }
}

# --- 요약 --------------------------------------------------------------
Write-Host ''
Write-Host '============================================================'
if ($issues.Count -eq 0) {
  Write-Host ' 요약: 이 PC 기준 인프라는 전부 정상으로 보인다.' -ForegroundColor Green
  Write-Host ' 그래도 브라우저에서 안 되면 -> F12 -> Console 탭에서' -ForegroundColor Green
  Write-Host ' 빨간 에러 메시지를 확인해야 한다(이 스크립트가 못 보는 유일한 부분).' -ForegroundColor Green
} else {
  Write-Host ' 요약: 다음 문제(들)을 찾았다 —' -ForegroundColor Yellow
  foreach ($i in $issues) { Write-Host "  - $i" -ForegroundColor Yellow }
}
Write-Host '============================================================'
Read-Host '엔터를 누르면 창이 닫힙니다'
