@echo off
chcp 65001 >nul
REM 採用ファネル日次レポートを実行し、logs\funnel-reports\ に日付付きで保存する。
REM さらに専用ブランチ reports/funnel-data へ自動push し、クラウド側の日次分析ルーティンが
REM 貼り付けなしで当日分を読めるようにする（sync-funnel-report-to-git.js。失敗してもここは無視される）。
REM タスクスケジューラ（install-daily-funnel-report.ps1）から毎朝3時に呼ばれる想定。
REM 手動実行も可能: scripts\run-daily-funnel-report.bat

cd /d "%~dp0\.."

if not exist "logs\funnel-reports" mkdir "logs\funnel-reports"

for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(''yyyy-MM-dd'')"') do set REPORT_DATE=%%i

node --experimental-sqlite scripts\daily-funnel-report.js > "logs\funnel-reports\%REPORT_DATE%.txt" 2>&1

echo 完了: logs\funnel-reports\%REPORT_DATE%.txt

node scripts\sync-funnel-report-to-git.js "logs\funnel-reports\%REPORT_DATE%.txt" "%REPORT_DATE%"
