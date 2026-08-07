<#
  삼인당 문진 - 무인 큐 실행 예약 해제

  사용:
    powershell -ExecutionPolicy Bypass -File scripts\unregister-scheduled-task.ps1
#>

[CmdletBinding()]
param(
  [string] $TaskName = 'SamindangQueueUnattended'
)

$ErrorActionPreference = 'Stop'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "예약 작업 '$TaskName' 을(를) 삭제했습니다."
} else {
  Write-Host "예약 작업 '$TaskName' 이(가) 없습니다. 할 일 없음."
}

Write-Host ''
Write-Host '참고: 큐 자체를 멈추려면 (예약과 별개로)'
Write-Host '  node .claude/queue/control.js stop'
