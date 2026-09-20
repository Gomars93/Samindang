@echo off
REM ============================================================
REM  samindang - clinic one-click setup + start (Windows)
REM
REM  Runs scripts\setup-and-start-clinic.ps1, which does:
REM    git pull -> LAN IP -> .env.local -> npm run build -> start 2 servers
REM
REM  start-clinic.bat only starts the servers and assumes an existing
REM  build. Use THIS file when you want the PC brought up to date first.
REM
REM  Patient data is stored OUTSIDE the repository
REM  (default C:\samindang-data\submissions) so a cloud-synced repo
REM  folder never carries .data\ off the PC. See RUNBOOK section 2.3.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-and-start-clinic.ps1" %*
