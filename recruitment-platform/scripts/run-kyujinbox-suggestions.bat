@echo off
REM Runs the kyujinbox new-job suggestion generator (generate-kyujinbox-from-performance.js,
REM DRY-RUN only) and saves the output under logs\kyujinbox-suggestions\.
REM IMPORTANT: no --apply here. Whether to actually create jobs is a manual decision after
REM reviewing this output (existing published jobs are never touched automatically).
REM Scheduled for 3:30 (after the 3:00 funnel report sync and the cloud routine's analysis
REM have time to finish) via install-kyujinbox-suggestions.ps1.
REM Manual run: scripts\run-kyujinbox-suggestions.bat

cd /d "%~dp0\.."

if not exist "logs\kyujinbox-suggestions" mkdir "logs\kyujinbox-suggestions"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"`) do set "REPORT_DATE=%%i"

echo REPORT_DATE=%REPORT_DATE%

node --experimental-sqlite scripts\generate-kyujinbox-from-performance.js > "logs\kyujinbox-suggestions\%REPORT_DATE%.txt" 2>&1

echo Done: logs\kyujinbox-suggestions\%REPORT_DATE%.txt (review before running --apply manually)
