@echo off
REM Patient app preview server (dist/, port 4173) - Task Scheduler autostart.
setlocal
set "PROJ=c:\Users\ASUS\Desktop\google drive\samindang-questionnaire"
set "NPM=C:\Program Files\nodejs\npm.cmd"
cd /d "%PROJ%" || exit /b 1
call "%NPM%" run preview -- --host
endlocal
