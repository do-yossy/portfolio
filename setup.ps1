# 株式会社Social Quality 開発環境セットアップ（Windows用・自動）
# ------------------------------------------------------------
# 使い方: portfolio フォルダの中で、PowerShell に下記を貼り付けて実行
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# やること: Git / Node.js 22 / VS Code を確認（無ければ winget で導入）
#           → sales-platform の npm install → .env を作成
# ------------------------------------------------------------
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "==== Social.Quality 開発環境セットアップ (Windows) ====" -ForegroundColor Cyan

$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

function Ensure-Tool($label, $cmd, $wingetId) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) {
    Write-Host ("  [OK] {0} は導入済み" -f $label) -ForegroundColor Green
    return
  }
  if ($hasWinget) {
    Write-Host ("  [..] {0} を導入します (winget)..." -f $label) -ForegroundColor Yellow
    try {
      winget install -e --id $wingetId --accept-source-agreements --accept-package-agreements --silent
    } catch {
      Write-Host ("  [!!] {0} の自動導入に失敗。手動でインストールしてください。" -f $label) -ForegroundColor Red
    }
  } else {
    Write-Host ("  [!!] {0} が未導入で winget もありません。手動でインストールしてください。" -f $label) -ForegroundColor Red
  }
}

Write-Host "1) 必要なソフトを確認..." -ForegroundColor White
Ensure-Tool "Git"     "git"  "Git.Git"
Ensure-Tool "Node.js" "node" "OpenJS.NodeJS.LTS"
Ensure-Tool "VS Code" "code" "Microsoft.VisualStudioCode"

# 新規インストール直後は PATH が未反映のことがあるので更新を試みる
try {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
} catch { }

Write-Host "2) Node.js バージョン確認..." -ForegroundColor White
if (Get-Command node -ErrorAction SilentlyContinue) {
  $v = (node -v)
  Write-Host ("   Node {0}" -f $v)
  try {
    $major = [int]($v.TrimStart('v').Split('.')[0])
    if ($major -lt 22) {
      Write-Host "   [!] Node 22以上が必要です。PowerShellを開き直すか、再インストール後にもう一度実行してください。" -ForegroundColor Red
    }
  } catch { }
} else {
  Write-Host "   [!] node が見つかりません。PowerShellを開き直してから、このスクリプトを再実行してください。" -ForegroundColor Red
}

Write-Host "3) 管制塔(sales-platform) をセットアップ..." -ForegroundColor White
$sp = Join-Path $PSScriptRoot "sales-platform"
Push-Location $sp
try {
  npm install
  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "   .env を作成しました。VS Codeで開いて ADMIN_PASSWORD を設定してください。" -ForegroundColor Yellow
  } else {
    Write-Host "   .env は既にあります（そのまま使用）。"
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "==== セットアップ完了 ====" -ForegroundColor Cyan
Write-Host "管制塔の起動方法:" -ForegroundColor White
Write-Host "  cd sales-platform"
Write-Host "  npm run dev:local"
Write-Host "  -> ブラウザで http://localhost:3100/admin を開く"
Write-Host ""
