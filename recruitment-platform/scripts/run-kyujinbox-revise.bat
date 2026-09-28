@echo off
REM Runs the kyujinbox auto-improve loop (kyujinbox_autoloop.js) for every company
REM that uses kyujinbox (sq/bg/st/bi/nl/sl/am — nx is engage-only, excluded), 25 postings
REM each, and saves the output under logs\kyujinbox-revise\.
REM
REM IMPORTANT: This runs with --apply (writes AI-rewritten title/description/tags to the
REM local DB) but WITHOUT --push, so it does NOT publish changes to the live kyujinbox
REM listing by itself. Review the log, then push to kyujinbox manually via the admin
REM screen (or re-run kyujinbox_autoloop.js with --push --push-save) once you're satisfied
REM with the AI-generated content. This mirrors the existing kyujinbox-metrics task's
REM safety design (dry-run by default for anything that touches the live platform).
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
  node --experimental-sqlite scripts\kyujinbox_autoloop.js --company %%C --apply --limit 25 >> "%LOGFILE%" 2>&1
)

echo Done: %LOGFILE%
