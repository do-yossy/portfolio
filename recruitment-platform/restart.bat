@echo off
chcp 65001 >nul
REM === 採用管理システム 再起動（最新取得→Node停止→起動）===
cd /d "%~dp0"
echo [1/3] 最新を取得します...
git pull origin main
echo [2/3] 起動中のNodeを停止します...
taskkill /F /IM node.exe >nul 2>&1
echo [3/3] サーバーを起動します... ( http://localhost:3000/admin )
npm start
