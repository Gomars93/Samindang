@echo off
REM ============================================================
REM  삼인당 문진 - 클리닉 파일럿 원클릭 기동 (Windows)
REM
REM  하는 일: 로컬 핸드오프 서버(node server/index.js)와, 빌드된 환자 앱을
REM  LAN에 서빙하는 프리뷰 서버(npm run preview -- --host)를 각각 새
REM  콘솔 창으로 띄운다. 둘 다 0.0.0.0에 바인드되므로 같은 Wi-Fi/스위치의
REM  태블릿에서 접속할 수 있다.
REM
REM  먼저 `npm run build`로 빌드가 되어 있어야 한다 — 이 스크립트는 빌드를
REM  하지 않는다.
REM ============================================================

setlocal

set "PROJ=c:\Users\ASUS\Desktop\google drive\samindang-questionnaire"
REM node를 절대경로로 부른다. PATH가 없는 환경(더블클릭 실행 등)에서도 동작하도록.
set "NODE=C:\Program Files\nodejs\node.exe"

if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo ERROR: node.exe not found at "%NODE%" and not on PATH.
    exit /b 1
  )
  set "NODE=node"
)

cd /d "%PROJ%"
if errorlevel 1 (
  echo ERROR: cannot cd to "%PROJ%"
  exit /b 1
)

if not exist "%PROJ%\dist" (
  echo WARNING: dist\ not found. Run "npm run build" first, then re-run this script.
  echo.
)

echo ============================================================
echo  samindang clinic pilot - starting local servers
echo ============================================================
echo.
echo  Handoff server (patient submissions + doctor dashboard API)
echo    command: "%NODE%" server\index.js
echo    default port: 4317  (set SAMINDANG_PORT to change)
echo.
echo  Patient app preview server (serves the built tablet app over LAN)
echo    command: npm run preview -- --host
echo    default port: 4173
echo.
echo  To find THIS PC's LAN IP for the tablet to connect to, run in a
echo  separate window:
echo    ipconfig ^| findstr /i "IPv4"
echo.
echo  Then on the tablet browser, open:
echo    http://^<이 PC의 LAN IP^>:4173
echo  Doctor dashboard (on this PC or any allowed doctor device):
echo    http://localhost:4173/#doctor
echo ============================================================
echo.

start "samindang-handoff-server" cmd /k ""%NODE%" server\index.js"
start "samindang-patient-preview" cmd /k "npm run preview -- --host"

echo Two windows were opened - one per server. Close them (or press
echo Ctrl+C inside each) to stop the servers at end of day.

endlocal
