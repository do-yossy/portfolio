@echo off
rem =====================================================================
rem  Recruitment Platform - Server launcher
rem  Starts the server (minimized) and opens the admin panel in browser.
rem =====================================================================
cd /d "%USERPROFILE%\portfolio\recruitment-platform"

rem Start the server in its own minimized window so it keeps running.
start "Recruitment Server" /min cmd /k "node --experimental-sqlite server.js"

rem Wait for the server to boot, then open the admin panel.
timeout /t 4 /nobreak >nul
start "" "http://localhost:3000/admin"

exit
