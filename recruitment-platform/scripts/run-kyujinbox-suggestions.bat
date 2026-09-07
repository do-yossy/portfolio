@echo off
REM 求人ボックス新規求人の提案（generate-kyujinbox-from-performance.js・DRY-RUN）を実行し、
REM logs\kyujinbox-suggestions\ に日付付きで保存する。
REM 【重要】ここでは --apply を付けない。実際に求人を作成するかどうかは、この提案を見た上で
REM 人が判断して手動で --apply 実行する（既存の掲載中求人と同様、自動では反映しない）。
REM
REM daily-funnel-report.js のgit同期（3:00〜）→ クラウド側ルーティンの解釈レポートpush の後に
REM 実行したいので、install-kyujinbox-suggestions.ps1 では3:30に登録している。
REM 手動実行も可能: scripts\run-kyujinbox-suggestions.bat

cd /d "%~dp0\.."

if not exist "logs\kyujinbox-suggestions" mkdir "logs\kyujinbox-suggestions"

for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(''yyyy-MM-dd'')"') do set REPORT_DATE=%%i

node --experimental-sqlite scripts\generate-kyujinbox-from-performance.js > "logs\kyujinbox-suggestions\%REPORT_DATE%.txt" 2>&1

echo 完了: logs\kyujinbox-suggestions\%REPORT_DATE%.txt （--applyでの反映は内容確認後に手動で行ってください）
