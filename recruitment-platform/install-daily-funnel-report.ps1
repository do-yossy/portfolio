# 採用ファネル日次レポート（scripts/daily-funnel-report.js）を
# 「毎朝3:00（このPCのローカル時刻）」に自動実行するタスクを登録します。
# 結果は logs\funnel-reports\YYYY-MM-DD.txt に保存されます（.gitignore済み・コミットされません）。
#
# 使い方: PowerShellをこのフォルダ（recruitment-platform）で開き、
#   powershell -ExecutionPolicy Bypass -File install-daily-funnel-report.ps1
#
# 削除: 同じコマンドに -Uninstall を付けて実行
#   powershell -ExecutionPolicy Bypass -File install-daily-funnel-report.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'RecruitmentDailyFunnelReport'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "登録解除しました: タスク『$taskName』"
    exit 0
}

$batPath = Join-Path $here 'scripts\run-daily-funnel-report.bat'
if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: $batPath が見つかりません。" -ForegroundColor Red
    exit 1
}

$action   = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $here
$trigger  = New-ScheduledTaskTrigger -Daily -At 3am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -WakeToRun

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "登録しました: タスク『$taskName』（毎朝3:00に実行）" -ForegroundColor Cyan
Write-Host "保存先: $here\logs\funnel-reports\YYYY-MM-DD.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "手動テスト:" -ForegroundColor Gray
Write-Host "  $batPath" -ForegroundColor Gray
Write-Host ""
Write-Host "※ PCの電源が入っていない時刻は実行されません（WakeToRunを有効にしていますが、" -ForegroundColor Yellow
Write-Host "  スリープ復帰にはPC/BIOS側の設定も必要な場合があります）。" -ForegroundColor Yellow
