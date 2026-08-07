@echo off
REM ============================================================
REM  삼인당 문진 - 무인 큐 실행 (Windows 작업 스케줄러용)
REM
REM  하는 일: 프로젝트 폴더로 이동해 로컬 task 큐 러너를 실행한다.
REM  러너(.claude/queue/run-next.js)가 claude CLI 절대경로를 스스로 찾고,
REM  남은 task를 순서대로 비대화형(-p)으로 실행한다.
REM
REM  안전장치(러너 내부):
REM    - 시작 전 working tree가 지저분하면 아예 실행하지 않음
REM    - 중복 실행 lock (runner_active)
REM    - task당 검증 실패 3회면 큐 자동 비활성화
REM    - 1회 실행당 최대 10개 task
REM    - task당 예산 상한
REM    - requires-human 표시된 task는 실행하지 않고 정지
REM    - 각 task 통과 시 git 체크포인트 커밋 (되돌릴 수 있음)
REM ============================================================

setlocal

set "PROJ=c:\Users\ASUS\Desktop\google drive\samindang-questionnaire"
REM node를 절대경로로 부른다. 작업 스케줄러 환경은 PATH가 로그인 세션과 다를 수 있다.
set "NODE=C:\Program Files\nodejs\node.exe"
set "LOG=%PROJ%\.claude\queue\reports\scheduler-run.log"

if not exist "%NODE%" (
  echo [%date% %time%] ERROR: node.exe not found at "%NODE%" >> "%LOG%"
  exit /b 1
)

cd /d "%PROJ%"
if errorlevel 1 (
  echo [%date% %time%] ERROR: cannot cd to "%PROJ%" >> "%LOG%"
  exit /b 1
)

echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo [%date% %time%] unattended queue run start >> "%LOG%"
echo ============================================================ >> "%LOG%"

"%NODE%" ".claude\queue\control.js" start >> "%LOG%" 2>&1
set "RC=%errorlevel%"

echo [%date% %time%] unattended queue run finished (exit=%RC%) >> "%LOG%"
exit /b %RC%
