@echo off
REM Patient app preview server (dist/, port 4173) - Task Scheduler autostart.
setlocal
REM Project root = parent of this scripts\ folder (works wherever the repo is cloned).
for %%I in ("%~dp0..") do set "PROJ=%%~fI"
set "NPM=C:\Program Files\nodejs\npm.cmd"
cd /d "%PROJ%" || exit /b 1
call "%NPM%" run preview -- --host
endlocal
