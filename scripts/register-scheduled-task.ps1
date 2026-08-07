<#
  삼인당 문진 - 무인 큐 실행 예약 등록 (Windows 작업 스케줄러)

  사용:
    # 지금부터 5시간 뒤 1회 실행
    powershell -ExecutionPolicy Bypass -File scripts\register-scheduled-task.ps1

    # 시간을 직접 지정
    powershell -ExecutionPolicy Bypass -File scripts\register-scheduled-task.ps1 -HoursFromNow 3
    powershell -ExecutionPolicy Bypass -File scripts\register-scheduled-task.ps1 -At "2026-08-08 07:30"

  해제:
    powershell -ExecutionPolicy Bypass -File scripts\unregister-scheduled-task.ps1

  주의:
    - 현재 로그인 사용자 계정으로 등록된다(관리자 권한 불필요).
    - 절전에서 깨워서 실행하도록 WakeToRun을 켠다. 다만 "최대 절전 모드"나
      완전 종료 상태에서는 깨어나지 않는다. PC는 켜두거나 절전까지만 두는 것을 권장.
    - 노트북이면 배터리에서도 실행되도록 옵션을 켠다.
#>

[CmdletBinding()]
param(
  [double] $HoursFromNow = 5,
  [string] $At,
  [string] $TaskName = 'SamindangQueueUnattended'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $PSScriptRoot 'run-queue-unattended.bat'

if (-not (Test-Path $batPath)) {
  throw "실행 배치 파일을 찾을 수 없습니다: $batPath"
}

if ($At) {
  $runAt = [datetime]::Parse($At)
} else {
  $runAt = (Get-Date).AddHours($HoursFromNow)
}

if ($runAt -le (Get-Date)) {
  throw "예약 시각이 이미 지났습니다: $runAt"
}

Write-Host "프로젝트     : $projectRoot"
Write-Host "실행 파일    : $batPath"
Write-Host "예약 시각    : $runAt"
Write-Host "작업 이름    : $TaskName"

$action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Once -At $runAt

$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
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
  -Description '삼인당 문진 로컬 task 큐를 무인으로 이어서 실행한다.' | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host ''
Write-Host '등록 완료.'
Write-Host ("  상태        : {0}" -f $task.State)
Write-Host ("  다음 실행   : {0}" -f $info.NextRunTime)
Write-Host ''
Write-Host '해제하려면:'
Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\unregister-scheduled-task.ps1'
Write-Host ''
Write-Host '로그 위치:'
Write-Host ('  {0}\.claude\queue\reports\scheduler-run.log' -f $projectRoot)
