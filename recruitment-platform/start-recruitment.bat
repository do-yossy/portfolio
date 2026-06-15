@echo off
rem =====================================================================
rem  Recruitment Platform - Server launcher
rem  Starts the server (minimized) and opens the admin panel in Chrome.
rem =====================================================================
cd /d "%USERPROFILE%\portfolio\recruitment-platform"

rem Start the server in its own minimized window so it keeps running.
start "Recruitment Server" /min cmd /k "node --experimental-sqlite server.js"

rem Wait for the server to boot, then open the admin panel.
timeout /t 4 /nobreak >nul

set "URL=http://localhost:3000/admin"

rem Locate Chrome; fall back to the default browser if not found.
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
    start "" "%CHROME%" "%URL%"
) else (
    start "" "%URL%"
)

exit
