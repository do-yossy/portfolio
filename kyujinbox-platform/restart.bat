@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 求人ボックス専用システム 起動 ===
echo （現システムには影響しません。別ウィンドウ・別ポートで独立稼働します）
echo このウィンドウは開いたままにしてください。
node server.js
pause
