@echo off
chcp 65001 >nul
title 家にあるお金

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js が見つかりません。
  echo  https://nodejs.org/ からインストールしてください。
  echo.
  pause
  exit /b 1
)

echo.
echo  ╔══════════════════════════════════════╗
echo  ║            LIFE  CHOICE              ║
echo  ╚══════════════════════════════════════╝
echo.
echo  ブラウザを開いています...
echo.

start "" http://localhost:3500/
node serve.mjs 3500

echo.
echo  終了しました。
pause
