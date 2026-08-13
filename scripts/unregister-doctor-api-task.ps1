<#
  Doctor handoff API 자동시작 예약 해제

  사용:
    powershell -ExecutionPolicy Bypass -File scripts\unregister-doctor-api-task.ps1
#>

[CmdletBinding()]
param(
  [string] $TaskName = 'SamindangDoctorAPI'
)

$ErrorActionPreference = 'Stop'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "예약 작업 '$TaskName' 을(를) 삭제했습니다."
} else {
  Write-Host "예약 작업 '$TaskName' 이(가) 없습니다. 할 일 없음."
}
