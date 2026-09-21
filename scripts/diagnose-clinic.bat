@echo off
REM ============================================================
REM  samindang - clinic one-click diagnosis (Windows)
REM
REM  Runs scripts\diagnose-clinic.ps1, which checks in ONE pass:
REM  LAN IP vs built .env.local, network profile (Public/Private),
REM  firewall rule for port 4317, whether the handoff server (4317)
REM  and preview server (4173) are listening, and live HTTP health
REM  checks on both localhost and the LAN IP.
REM
REM  Copy the WHOLE console output and paste it back when asking
REM  for help -- one paste covers what used to take five separate
REM  round trips.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-clinic.ps1" %*
