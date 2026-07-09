# =====================================================================
# Kyujinbox Platform - Install auto-start
#
# Registers a shortcut in the Windows Startup folder so the kyujinbox
# system (port 3200) launches automatically every time you sign in.
#
# Usage (run PowerShell in this folder):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\install-autostart.ps1
#
# To remove later:  .\install-autostart.ps1 -Uninstall
# =====================================================================
param([switch]$Uninstall)

$ErrorActionPreference = "Continue"
$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath  = Join-Path $here "restart.bat"
$startup  = [Environment]::GetFolderPath('Startup')
$linkPath = Join-Path $startup "Kyujinbox Platform.lnk"

if ($Uninstall) {
    if (Test-Path $linkPath) {
        Remove-Item $linkPath -Force
        Write-Host "Auto-start removed." -ForegroundColor Green
    } else {
        Write-Host "Auto-start was not registered." -ForegroundColor Yellow
    }
    return
}

if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: launcher not found at:" -ForegroundColor Red
    Write-Host "  $batPath" -ForegroundColor Red
    exit 1
}

# Create a shortcut to restart.bat in the Startup folder
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($linkPath)
$sc.TargetPath       = $batPath
$sc.WorkingDirectory = $here
$sc.WindowStyle      = 7   # minimized
$sc.Description       = "Start Kyujinbox Platform (http://localhost:3200/)"
$sc.Save()

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Auto-start installed!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  From the next sign-in, the kyujinbox system" -ForegroundColor Gray
Write-Host "  starts automatically at:" -ForegroundColor Gray
Write-Host "    http://localhost:3200/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Shortcut location:" -ForegroundColor Gray
Write-Host "    $linkPath" -ForegroundColor Gray
Write-Host ""
Write-Host "  To disable later, run:" -ForegroundColor Gray
Write-Host "    .\install-autostart.ps1 -Uninstall" -ForegroundColor Gray
Write-Host ""
Write-Host "  Launching now for a test..." -ForegroundColor Yellow
Start-Process -FilePath $batPath
