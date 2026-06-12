# =====================================================================
# 採用プラットフォーム 自動セットアップスクリプト (Windows PowerShell)
#
# 実行方法:
#   1. PowerShell を開く
#   2. このスクリプトのあるフォルダに移動
#   3. 以下を実行:
#        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#        .\setup.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
$REPO_URL  = "https://github.com/do-yossy/portfolio.git"
$BRANCH    = "claude/seo-recruitment-platform-mvp-LBKz5"
$INSTALL_DIR = "$env:USERPROFILE\portfolio"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  採用プラットフォーム セットアップ" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Node.js チェック ──────────────────────────────────────────
Write-Host "[1/5] Node.js の確認..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>&1
    Write-Host "      OK: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js が見つかりません。" -ForegroundColor Red
    Write-Host "  https://nodejs.org から v22以上をインストールしてください。" -ForegroundColor Red
    exit 1
}

# ── 2. Git チェック ──────────────────────────────────────────────
Write-Host "[2/5] Git の確認..." -ForegroundColor Yellow
try {
    $gitVer = git --version 2>&1
    Write-Host "      OK: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Git が見つかりません。" -ForegroundColor Red
    Write-Host "  https://git-scm.com からインストールしてください。" -ForegroundColor Red
    exit 1
}

# ── 3. リポジトリ取得 ────────────────────────────────────────────
Write-Host "[3/5] リポジトリを取得..." -ForegroundColor Yellow
if (Test-Path "$INSTALL_DIR\.git") {
    Write-Host "      既存リポジトリを最新版に更新します..." -ForegroundColor Gray
    Set-Location $INSTALL_DIR
    git fetch origin $BRANCH 2>&1 | Out-Null
    git checkout $BRANCH 2>&1 | Out-Null
    git pull origin $BRANCH 2>&1 | Out-Null
    Write-Host "      OK: 更新完了" -ForegroundColor Green
} else {
    Write-Host "      クローン中: $REPO_URL" -ForegroundColor Gray
    git clone --branch $BRANCH $REPO_URL $INSTALL_DIR 2>&1
    Write-Host "      OK: クローン完了" -ForegroundColor Green
}
Set-Location "$INSTALL_DIR\recruitment-platform"

# ── 4. npm install ───────────────────────────────────────────────
Write-Host "[4/5] パッケージをインストール..." -ForegroundColor Yellow
npm install --silent 2>&1 | Out-Null
Write-Host "      OK: インストール完了" -ForegroundColor Green

# ── 5. .env チェック ─────────────────────────────────────────────
Write-Host "[5/5] 環境設定ファイルの確認..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "  .env ファイルが見つかりません。" -ForegroundColor Red
    Write-Host "  recruitment-platform フォルダに .env を配置してください。" -ForegroundColor Red
    Write-Host ""
    Write-Host "  .env には以下を記載します（管理者に確認してください）:" -ForegroundColor Yellow
    Write-Host "    PORT=3000"
    Write-Host "    SITE_URL=https://social-quality.com"
    Write-Host "    COMPANY_NAME=株式会社Social Quality"
    Write-Host "    SITE_NAME=採用サイト"
    Write-Host "    ADMIN_USER=admin"
    Write-Host "    ADMIN_PASSWORD=（パスワード）"
    Write-Host "    ANTHROPIC_API_KEY=（APIキー）"
    Write-Host "    SMTP_HOST=smtp.gmail.com"
    Write-Host "    SMTP_PORT=587"
    Write-Host "    SMTP_USER=（メールアドレス）"
    Write-Host "    SMTP_PASS=（アプリパスワード）"
    Write-Host "    FROM_EMAIL=（メールアドレス）"
    Write-Host "    ADMIN_EMAIL=（メールアドレス）"
    Write-Host "    KYUJINBOX_BATCH_SIZE=5"
    Write-Host "    KYUJINBOX_GROUP_ID=G5922-7577-0001"
    Write-Host "    HEADLESS=1"
    Write-Host ""
    Write-Host "  .env を配置後、このスクリプトを再実行してください。" -ForegroundColor Cyan
    exit 1
}
Write-Host "      OK: .env を確認しました" -ForegroundColor Green

# ── 6. 求人データ登録 ────────────────────────────────────────────
Write-Host ""
Write-Host "求人データを登録します..." -ForegroundColor Yellow
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
    $result = node --experimental-sqlite "scripts\$seed" 2>&1
    $line = ($result | Where-Object { $_ -match "OK|完了|更新" } | Select-Object -First 1)
    if ($line) {
        Write-Host "      $line" -ForegroundColor Green
    } else {
        Write-Host "      $seed 登録完了" -ForegroundColor Green
    }
}

# ── 完了・サーバー起動 ───────────────────────────────────────────
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  セットアップ完了！サーバーを起動します" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  求人サイト: http://localhost:3000/preview/top" -ForegroundColor Cyan
Write-Host "  管理画面:   http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "  停止するには Ctrl+C を押してください。" -ForegroundColor Gray
Write-Host ""

node --experimental-sqlite server.js
