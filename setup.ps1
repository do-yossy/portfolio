#requires -Version 5
# Social Quality - Dev environment setup (Windows)
# ------------------------------------------------------------
# Usage: run inside the 'portfolio' folder in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Checks Git / Node.js 22 / VS Code (installs via winget if missing),
# then runs npm install in sales-platform and creates .env.
# (ASCII only on purpose: Windows PowerShell 5.1 mis-reads non-ASCII .ps1)
# ------------------------------------------------------------
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "==== Social.Quality dev setup (Windows) ====" -ForegroundColor Cyan

$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

function EnsureTool($label, $cmd, $wingetId) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) {
    Write-Host ("  [OK] {0} found" -f $label) -ForegroundColor Green
    return
  }
  if ($hasWinget) {
    Write-Host ("  [..] Installing {0} via winget..." -f $label) -ForegroundColor Yellow
    try {
      winget install -e --id $wingetId --accept-source-agreements --accept-package-agreements --silent
    } catch {
      Write-Host ("  [!!] Auto-install of {0} failed. Please install it manually." -f $label) -ForegroundColor Red
    }
  } else {
    Write-Host ("  [!!] {0} missing and winget not available. Please install it manually." -f $label) -ForegroundColor Red
  }
}

Write-Host "1) Checking required tools..." -ForegroundColor White
EnsureTool "Git"     "git"  "Git.Git"
EnsureTool "Node.js" "node" "OpenJS.NodeJS.LTS"
EnsureTool "VS Code" "code" "Microsoft.VisualStudioCode"

# Refresh PATH (newly installed tools may not be on PATH yet)
try {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
} catch { }

Write-Host "2) Checking Node.js version..." -ForegroundColor White
if (Get-Command node -ErrorAction SilentlyContinue) {
  $v = (node -v)
  Write-Host ("   Node {0}" -f $v)
  try {
    $major = [int]($v.TrimStart('v').Split('.')[0])
    if ($major -lt 22) {
      Write-Host "   [!] Node 22+ required. Reopen PowerShell or reinstall, then run again." -ForegroundColor Red
    }
  } catch { }
} else {
  Write-Host "   [!] node not found. Reopen PowerShell, then run this script again." -ForegroundColor Red
}

Write-Host "3) Setting up sales-platform..." -ForegroundColor White
$sp = Join-Path $PSScriptRoot "sales-platform"
Push-Location $sp
try {
  npm install
  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "   Created .env  (open it in VS Code and set ADMIN_PASSWORD)" -ForegroundColor Yellow
  } else {
    Write-Host "   .env already exists (kept)."
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "==== Setup complete ====" -ForegroundColor Cyan
Write-Host "Start the kanseito (sales-platform):" -ForegroundColor White
Write-Host "  cd sales-platform"
Write-Host "  npm run dev:local"
Write-Host "  -> open http://localhost:3100/admin in your browser"
Write-Host ""
