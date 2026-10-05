@echo off
REM ============================================================
REM  samindang - clinic PC update (Windows)
REM
REM  Runs scripts\update-clinic.ps1, which does:
REM    safety check -> git fetch + merge --ff-only -> npm install (only if needed)
REM    -> npm run build -> restart the two scheduled-task servers
REM
REM  It never overwrites local changes and never touches patient data (.data)
REM  or .env.local. Run it when no patient is filling in the questionnaire.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-clinic.ps1" %*
