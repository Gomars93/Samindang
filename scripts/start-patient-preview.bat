@echo off
REM Patient app preview server (vite preview --host, port 4173) - Task
REM Scheduler autostart. Mirrors start-doctor-api.bat's structure exactly.
REM Calls vite's node entry directly (not "npm run preview") so this doesn't
REM depend on npm.cmd being resolvable in the Task Scheduler process context.
REM
REM Prerequisite: `npm run build` must have produced dist\ already (this
REM script does not build). If dist\ is missing, vite preview exits
REM immediately with an error and Task Scheduler's restart policy (see
REM register-patient-preview-task.ps1) will keep retrying every minute --
REM harmless, but the tablet screen won't load until you build.
setlocal
set "PROJ=c:\Users\ASUS\Desktop\google drive\samindang-questionnaire"
set "NODE=C:\Program Files\nodejs\node.exe"
cd /d "%PROJ%" || exit /b 1
"%NODE%" node_modules\vite\bin\vite.js preview --host
endlocal
