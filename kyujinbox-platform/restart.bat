@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Kyujinbox Platform (port 3200) ===
echo Independent from the main system. Keep this window open.
echo [1/3] Updating to latest...
git pull
echo [2/3] Stopping any existing instance on port 3200...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3200 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 >nul
echo [3/3] Starting server...
node server.js
pause
