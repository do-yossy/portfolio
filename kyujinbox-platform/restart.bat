@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Kyujinbox Platform (port 3200) ===
echo [1/3] Updating to latest...
git pull
echo [2/3] Stopping any existing instance on port 3200...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3200 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 >nul
echo [3/3] Starting server... (a browser tab will open automatically)
echo.
echo ***************************************************************
echo *  DO NOT CLOSE THIS WINDOW - closing it stops the server.  *
echo *  Access:  http://localhost:3200/login                      *
echo ***************************************************************
echo.
rem Open the browser a few seconds after the server starts (server runs below)
start "" cmd /c "timeout /t 4 >nul & explorer http://localhost:3200/login"
node server.js
echo.
echo (The server has stopped. Run this file again to restart.)
pause
