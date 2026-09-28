@echo off
REM Runs the kyujinbox auto-improve loop (kyujinbox_autoloop.js) for every company
REM that uses kyujinbox (sq/bg/st/bi/nl/sl/am — nx is engage-only, excluded), 25 postings
REM each, and saves the output under logs\kyujinbox-revise\.
REM
REM IMPORTANT: This runs with --apply --push --push-save, so AI-rewritten title/
REM description/tags are written to the local DB AND published live to the kyujinbox
REM listing automatically, with no human review step (2026-09-28, explicit user request).
REM kyujinbox_autoloop.js's built-in cooldown (OPT_COOLDOWN_DAYS, default 5 days) and
REM maxOptimize (OPT_MAX_COUNT, default 3) still apply, so a given posting won't be
REM rewritten/re-pushed indefinitely, but there is no manual approval gate before a
REM live kyujinbox listing is changed. Check logs\kyujinbox-revise\ periodically.
REM
REM Scheduled Mon/Wed/Fri 7:00 via install-kyujinbox-revise.ps1.
REM Manual run: scripts\run-kyujinbox-revise.bat

cd /d "%~dp0\.."

if not exist "logs\kyujinbox-revise" mkdir "logs\kyujinbox-revise"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"`) do set "REPORT_DATE=%%i"

echo REPORT_DATE=%REPORT_DATE%

set "LOGFILE=logs\kyujinbox-revise\%REPORT_DATE%.txt"
echo. > "%LOGFILE%"

for %%C in (sq bg st bi nl sl am) do (
  echo ===== %%C ===== >> "%LOGFILE%"
  node --experimental-sqlite scripts\kyujinbox_autoloop.js --company %%C --apply --push --push-save --limit 25 >> "%LOGFILE%" 2>&1
)

echo Done: %LOGFILE%
