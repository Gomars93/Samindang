<#
  삼인당 문진 - 로그온 시 서버 2개(핸드오프 API 4317 + 환자 앱 프리뷰 4173)를
  모두 자동 시작 + 자동 복구로 등록하는 래퍼.

  두 서비스는 register-doctor-api-task.ps1 / register-patient-preview-task.ps1
  이 각각 이미 처리한다 -- 이 스크립트는 그 둘을 순서대로 부르기만 한다
  (로직 중복 없음, 한쪽만 필요하면 개별 스크립트를 직접 쓰면 된다).

  사용:
    powershell -ExecutionPolicy Bypass -File scripts\register-clinic-autostart.ps1

  전제: `npm run build`로 dist\ 가 이미 있어야 한다(RUNBOOK 2.1).

  해제: scripts\unregister-clinic-autostart.ps1
#>

$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'register-doctor-api-task.ps1')
Write-Host ''
Write-Host '------------------------------------------------------------'
Write-Host ''
& (Join-Path $PSScriptRoot 'register-patient-preview-task.ps1')

Write-Host ''
Write-Host '------------------------------------------------------------'
Write-Host '두 작업 모두 등록 완료 -- 다음 로그온부터 자동으로 뜬다.'
Write-Host ''
Write-Host '둘 다 지금 바로 시작하려면:'
Write-Host '  Start-ScheduledTask -TaskName SamindangDoctorAPI'
Write-Host '  Start-ScheduledTask -TaskName SamindangPatientPreview'
Write-Host ''
Write-Host '상태 확인:'
Write-Host '  Get-ScheduledTask -TaskName SamindangDoctorAPI, SamindangPatientPreview | Get-ScheduledTaskInfo'
Write-Host '  curl http://localhost:4317/api/health'
Write-Host '  curl http://localhost:4173'
