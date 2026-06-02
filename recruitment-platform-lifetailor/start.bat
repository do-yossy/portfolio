@echo off
cd /d C:\Users\sqtan\portfolio\recruitment-platform-lifetailor
set PORT=3002
set INDEED_EMAIL=iife@ymail.ne.jp
set INDEED_PASSWORD=iife20262019
set SITE_NAME=株式会社Life Tailor 採用サイト
set SITE_URL=http://localhost:3002
set ADMIN_USER=admin
set ADMIN_PASSWORD=admin123

:: サーバーをバックグラウンドで起動
start /B node server.js

:: 起動を待つ（3秒）
timeout /t 3 /nobreak > nul

:: 管理画面をブラウザで開く
start http://localhost:3002/admin
