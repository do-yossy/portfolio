@echo off
chcp 65001 >nul
title 採用プラットフォーム - Life Tailor

cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   株式会社Life Tailor 採用プラットフォーム   ║
echo  ╚══════════════════════════════════════╝
echo.
echo  管理画面: http://localhost:3001/admin
echo  求人サイト: http://localhost:3001/jobs
echo.
echo  停止するには Ctrl+C を押してください
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

set DATA_DIR=%~dp0data
node --experimental-sqlite ..\recruitment-platform\server.js

echo.
echo サーバーが停止しました。
pause
