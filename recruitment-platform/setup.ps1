# =====================================================================
# Recruitment Platform - Auto Setup Script (Windows PowerShell)
#
# Usage:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup.ps1
# =====================================================================

# Native commands like git/npm write progress to stderr; with "Stop" that
# would abort the script, so use "Continue" and check exit codes manually.
$ErrorActionPreference = "Continue"
$REPO_URL    = "https://github.com/do-yossy/portfolio.git"
$BRANCH      = "claude/seo-recruitment-platform-mvp-LBKz5"
$INSTALL_DIR = "$env:USERPROFILE\portfolio"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Recruitment Platform Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Node.js check ------------------------------------------------
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>&1
    Write-Host "      OK: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found." -ForegroundColor Red
    Write-Host "  Install v22+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# -- 2. Git check ---------------------------------------------------
Write-Host "[2/5] Checking Git..." -ForegroundColor Yellow
try {
    $gitVer = git --version 2>&1
    Write-Host "      OK: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Git not found." -ForegroundColor Red
    Write-Host "  Install from https://git-scm.com" -ForegroundColor Red
    exit 1
}

# -- 3. Get repository ----------------------------------------------
Write-Host "[3/5] Fetching repository..." -ForegroundColor Yellow
if (Test-Path "$INSTALL_DIR\.git") {
    Write-Host "      Updating existing repository..." -ForegroundColor Gray
    Set-Location $INSTALL_DIR
    git fetch origin $BRANCH *> $null
    git checkout $BRANCH *> $null
    git pull origin $BRANCH *> $null
    Write-Host "      OK: updated" -ForegroundColor Green
} else {
    Write-Host "      Cloning: $REPO_URL" -ForegroundColor Gray
    git clone --branch $BRANCH $REPO_URL $INSTALL_DIR *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: git clone failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK: cloned" -ForegroundColor Green
}
Set-Location "$INSTALL_DIR\recruitment-platform"

# -- 4. npm install -------------------------------------------------
Write-Host "[4/5] Installing packages..." -ForegroundColor Yellow
npm install --silent *> $null
Write-Host "      OK: installed" -ForegroundColor Green

# -- 5. .env check --------------------------------------------------
Write-Host "[5/5] Checking .env file..." -ForegroundColor Yellow

# Cloud sync via OneDrive (same Microsoft account on multiple PCs).
# Shared copy lives outside the git repo so secrets never get committed.
$envShared = if ($env:OneDrive) { Join-Path $env:OneDrive "recruitment-config\.env" } else { $null }

# If local .env is missing, try to pull it from OneDrive.
if ((-not (Test-Path ".env")) -and $envShared -and (Test-Path $envShared)) {
    Write-Host "      Found .env in OneDrive. Copying in..." -ForegroundColor Gray
    Copy-Item $envShared ".env" -Force
}

if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "  .env file not found." -ForegroundColor Red
    Write-Host "  Place .env in the recruitment-platform folder." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Required keys (ask the administrator for values):" -ForegroundColor Yellow
    Write-Host "    PORT=3000"
    Write-Host "    SITE_URL=https://social-quality.com"
    Write-Host "    COMPANY_NAME=..."
    Write-Host "    SITE_NAME=..."
    Write-Host "    ADMIN_USER=admin"
    Write-Host "    ADMIN_PASSWORD=..."
    Write-Host "    ANTHROPIC_API_KEY=..."
    Write-Host "    SMTP_HOST=smtp.gmail.com"
    Write-Host "    SMTP_PORT=587"
    Write-Host "    SMTP_USER=..."
    Write-Host "    SMTP_PASS=..."
    Write-Host "    FROM_EMAIL=..."
    Write-Host "    ADMIN_EMAIL=..."
    Write-Host "    KYUJINBOX_BATCH_SIZE=5"
    Write-Host "    KYUJINBOX_GROUP_ID=G5922-7577-0001"
    Write-Host "    HEADLESS=1"
    Write-Host ""
    Write-Host "  After placing .env, run this script again." -ForegroundColor Cyan
    exit 1
}
Write-Host "      OK: .env found" -ForegroundColor Green

# Back up local .env to OneDrive so other PCs (same account) stay in sync.
if ($envShared) {
    $sharedDir = Split-Path $envShared
    New-Item -ItemType Directory -Force -Path $sharedDir | Out-Null
    Copy-Item ".env" $envShared -Force
    Write-Host "      Synced .env to OneDrive (recruitment-config)" -ForegroundColor Gray
}

# -- 6. Seed job data ----------------------------------------------
Write-Host ""
Write-Host "Registering job data..." -ForegroundColor Yellow
$seeds = @(
    "seed-cosme-factory-job.js",
    "seed-takuhai-driver-job.js",
    "seed-loke-driver-job.js",
    "seed-night-driver-job.js",
    "seed-ec-warehouse-driver-shigino-job.js",
    "seed-graphic-designer-job.js",
    "seed-dm-director-job.js",
    "seed-it-engineer-umeda-job.js",
    "seed-kikai-operator-sagamihara-job.js",
    "seed-factory-hachioji-job.js",
    "seed-factory-hino-job.js",
    "seed-factory-fuchu-job.js",
    "seed-welfare-driver-nakamozu-job.js"
)
foreach ($seed in $seeds) {
    node --experimental-sqlite "scripts\$seed" *> $null
    Write-Host "      OK: $seed" -ForegroundColor Green
}

# -- Done / start server -------------------------------------------
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Setup complete. Starting server..." -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Job site:    http://localhost:3000/preview/top" -ForegroundColor Cyan
Write-Host "  Admin panel: http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

node --experimental-sqlite server.js
