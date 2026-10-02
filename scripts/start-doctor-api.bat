@echo off
REM Doctor handoff API (server/index.js, port 4317) - Task Scheduler autostart.
REM Reads SAMINDANG_DOCTOR_TOKEN / SAMINDANG_ALLOWED_ORIGINS from persisted
REM Windows User env vars (see docs/RUNBOOK_LOCAL_HANDOFF.md section 2.3).
setlocal
REM Project root = parent of this scripts\ folder (works wherever the repo is cloned).
for %%I in ("%~dp0..") do set "PROJ=%%~fI"
set "NODE=C:\Program Files\nodejs\node.exe"
cd /d "%PROJ%" || exit /b 1
"%NODE%" server\index.js
endlocal
