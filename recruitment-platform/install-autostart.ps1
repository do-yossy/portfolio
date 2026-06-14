# =====================================================================
# Recruitment Platform - Install auto-start
#
# Registers the server launcher in the Windows Startup folder so the
# admin panel opens automatically every time you sign in to this PC.
#
# Usage:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\install-autostart.ps1
#
# To remove later, run: .\install-autostart.ps1 -Uninstall
# =====================================================================
param([switch]$Uninstall)

$ErrorActionPreference = "Continue"

$batPath  = "$env:USERPROFILE\portfolio\recruitment-platform\start-recruitment.bat"
$startup  = [Environment]::GetFolderPath('Startup')
$linkPath = Join-Path $startup "Recruitment Platform.lnk"

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
    Write-Host "Run setup.ps1 first to fetch the latest files." -ForegroundColor Yellow
    exit 1
}

# Create a shortcut to the launcher in the Startup folder.
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($linkPath)
$sc.TargetPath       = $batPath
$sc.WorkingDirectory = Split-Path $batPath
$sc.WindowStyle      = 7   # minimized
$sc.Description       = "Start Recruitment Platform and open admin panel"
$sc.Save()

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Auto-start installed!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  From the next sign-in, the server starts" -ForegroundColor Gray
Write-Host "  automatically and the admin panel opens:" -ForegroundColor Gray
Write-Host "    http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Shortcut location:" -ForegroundColor Gray
Write-Host "    $linkPath" -ForegroundColor Gray
Write-Host ""
Write-Host "  To disable later, run:" -ForegroundColor Gray
Write-Host "    .\install-autostart.ps1 -Uninstall" -ForegroundColor Gray
Write-Host ""
Write-Host "  Launching now for a test..." -ForegroundColor Yellow
Start-Process -FilePath $batPath
