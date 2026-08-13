<#
  Doctor handoff API(server/index.js, 포트 4317) - 부팅/로그온 시 자동 시작 +
  비정상 종료 시 자동 재시작 예약 등록 (Windows 작업 스케줄러)

  사용:
    powershell -ExecutionPolicy Bypass -File scripts\register-doctor-api-task.ps1

  해제:
    powershell -ExecutionPolicy Bypass -File scripts\unregister-doctor-api-task.ps1

  주의:
    - 현재 로그인 사용자 계정으로 등록된다(관리자 권한 불필요). 로그온
      트리거를 쓰는 이유: start-doctor-api.bat이 SAMINDANG_DOCTOR_TOKEN 등
      "Windows 사용자 환경변수"를 읽는데(RUNBOOK 2.3), 그 값은 로그온한
      사용자 세션에서만 보인다 — SYSTEM 계정의 AtStartup 트리거로는 못 본다.
    - Task Scheduler 자체의 "실패 시 재시작" 기능을 그대로 쓴다(커스텀
      supervisor 프로세스를 새로 만들지 않는다) - RestartCount/RestartInterval.
      ExecutionTimeLimit을 0(무제한)으로 둬서 장시간 실행 중에도 타임아웃으로
      강제 종료되지 않게 한다.
#>

[CmdletBinding()]
param(
  [string] $TaskName = 'SamindangDoctorAPI'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $PSScriptRoot 'start-doctor-api.bat'

if (-not (Test-Path $batPath)) {
  throw "실행 배치 파일을 찾을 수 없습니다: $batPath"
}

Write-Host "프로젝트     : $projectRoot"
Write-Host "실행 파일    : $batPath"
Write-Host "작업 이름    : $TaskName"

$action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

# 이미 있으면 지우고 다시 등록
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host "기존 작업이 있어 삭제 후 재등록합니다."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Doctor handoff API(포트 4317)를 로그온 시 자동 시작하고, 죽으면 자동 재시작한다.' | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName

Write-Host ''
Write-Host '등록 완료.'
Write-Host ("  상태        : {0}" -f $task.State)
Write-Host ''
Write-Host '지금 바로 시작하려면:'
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
Write-Host ''
Write-Host '상태 확인:'
Write-Host "  Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo"
Write-Host ''
Write-Host '해제하려면:'
Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\unregister-doctor-api-task.ps1'
