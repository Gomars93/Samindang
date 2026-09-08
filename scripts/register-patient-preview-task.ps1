<#
  환자 앱 프리뷰 서버(vite preview --host, 포트 4173) - 부팅/로그온 시 자동
  시작 + 비정상 종료 시 자동 재시작 예약 등록 (Windows 작업 스케줄러)

  register-doctor-api-task.ps1과 완전히 같은 구조 -- 대상만 다르다(4317
  핸드오프 API가 아니라 4173 태블릿 프리뷰 서버). 두 서버는 독립적으로
  등록/해제된다 -- 한쪽만 죽어도 다른 쪽에 영향 없다.

  사용:
    powershell -ExecutionPolicy Bypass -File scripts\register-patient-preview-task.ps1

  해제:
    powershell -ExecutionPolicy Bypass -File scripts\unregister-patient-preview-task.ps1

  둘 다(핸드오프 API + 프리뷰) 한 번에 등록하려면:
    powershell -ExecutionPolicy Bypass -File scripts\register-clinic-autostart.ps1

  전제: `npm run build`로 dist\ 가 이미 있어야 한다 -- 이 작업은 빌드하지
  않는다(RUNBOOK 2.1 참고).
#>

[CmdletBinding()]
param(
  [string] $TaskName = 'SamindangPatientPreview'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $PSScriptRoot 'start-patient-preview.bat'

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
  -Description '환자 앱 프리뷰 서버(포트 4173)를 로그온 시 자동 시작하고, 죽으면 자동 재시작한다.' | Out-Null

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
Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\unregister-patient-preview-task.ps1'
