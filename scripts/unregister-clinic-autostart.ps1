<#
  register-clinic-autostart.ps1이 등록한 두 자동시작 작업을 모두 해제한다.
  개별 해제는 unregister-doctor-api-task.ps1 / unregister-patient-preview-task.ps1.

  사용:
    powershell -ExecutionPolicy Bypass -File scripts\unregister-clinic-autostart.ps1
#>

$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'unregister-doctor-api-task.ps1')
& (Join-Path $PSScriptRoot 'unregister-patient-preview-task.ps1')
