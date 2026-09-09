@echo off
REM Runs the kyujinbox performance collector (kyujinbox_autoloop.js, DRY-RUN only:
REM no --apply, no --push) and saves the output under logs\kyujinbox-metrics\.
REM This logs into each company's kyujinbox account via Playwright and stores the
REM latest views/applies into job_metrics (unconditional, even without --apply),
REM then prints AI-generated improvement suggestions for underperforming postings
REM for manual review. It never writes job content changes to the DB by itself.
REM Scheduled for 4:00 (after the 3:00 funnel report and 3:30 job suggestions have
REM time to finish) via install-kyujinbox-metrics.ps1.
REM Manual run: scripts\run-kyujinbox-metrics.bat

cd /d "%~dp0\.."

if not exist "logs\kyujinbox-metrics" mkdir "logs\kyujinbox-metrics"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"`) do set "REPORT_DATE=%%i"

echo REPORT_DATE=%REPORT_DATE%

node --experimental-sqlite scripts\kyujinbox_autoloop.js --company all > "logs\kyujinbox-metrics\%REPORT_DATE%.txt" 2>&1

echo Done: logs\kyujinbox-metrics\%REPORT_DATE%.txt
