@echo off
chcp 65001 >nul
title 採用プラットフォーム

cd /d "%~dp0"

echo.
echo  採用プラットフォーム を起動しています...
echo  管理画面: http://localhost:3000/admin
echo  求人サイト: http://localhost:3000/jobs
echo.
echo  停止するには Ctrl+C を押してください
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

node --experimental-sqlite server.js

echo.
echo サーバーが停止しました。
pause
