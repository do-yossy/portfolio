# =====================================================================
# 求人ボックス専用システム - PC起動時の自動起動を登録
#
# Windowsのスタートアップにショートカットを作り、サインインするたびに
# 求人ボックス専用システムが自動で立ち上がるようにします（ポート3200）。
#
# 使い方（PowerShellをこのフォルダで開いて実行）:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\install-autostart.ps1
#
# 解除するには:  .\install-autostart.ps1 -Uninstall
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
        Write-Host "自動起動を解除しました。" -ForegroundColor Green
    } else {
        Write-Host "自動起動は登録されていません。" -ForegroundColor Yellow
    }
    return
}

if (-not (Test-Path $batPath)) {
    Write-Host "エラー: 起動ファイルが見つかりません:" -ForegroundColor Red
    Write-Host "  $batPath" -ForegroundColor Red
    exit 1
}

# スタートアップフォルダに restart.bat へのショートカットを作成
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($linkPath)
$sc.TargetPath       = $batPath
$sc.WorkingDirectory = $here
$sc.WindowStyle      = 7   # 最小化で起動
$sc.Description       = "求人ボックス専用システムを起動 (http://localhost:3200/)"
$sc.Save()

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  自動起動を登録しました！" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  次回サインインから、PC起動時に自動で立ち上がります:" -ForegroundColor Gray
Write-Host "    http://localhost:3200/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ショートカットの場所:" -ForegroundColor Gray
Write-Host "    $linkPath" -ForegroundColor Gray
Write-Host ""
Write-Host "  解除するには:" -ForegroundColor Gray
Write-Host "    .\install-autostart.ps1 -Uninstall" -ForegroundColor Gray
Write-Host ""
Write-Host "  テスト起動します..." -ForegroundColor Yellow
Start-Process -FilePath $batPath
