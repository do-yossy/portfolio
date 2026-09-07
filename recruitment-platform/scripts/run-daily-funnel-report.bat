@echo off
REM Runs the daily recruitment funnel report and saves it under logs\funnel-reports\.
REM Also pushes it to the reports/funnel-data branch via sync-funnel-report-to-git.js
REM so the cloud-side daily analysis routine can read it without a manual paste.
REM Called daily at 3:00 by Task Scheduler (see install-daily-funnel-report.ps1).
REM Manual run: scripts\run-daily-funnel-report.bat

cd /d "%~dp0\.."

if not exist "logs\funnel-reports" mkdir "logs\funnel-reports"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"`) do set "REPORT_DATE=%%i"

echo REPORT_DATE=%REPORT_DATE%

node --experimental-sqlite scripts\daily-funnel-report.js > "logs\funnel-reports\%REPORT_DATE%.txt" 2>&1

echo Done: logs\funnel-reports\%REPORT_DATE%.txt

node scripts\sync-funnel-report-to-git.js "logs\funnel-reports\%REPORT_DATE%.txt" "%REPORT_DATE%"
