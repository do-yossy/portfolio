# 求人ボックス新規求人の提案（scripts/generate-kyujinbox-from-performance.js・DRY-RUN）を
# 「毎朝3:30（このPCのローカル時刻）」に自動実行するタスクを登録します。
# 3:00の採用ファネル日次レポート（と、その後のクラウド側ルーティンの市場分析push）に
# 十分な余裕を持たせるため、30分後に設定しています。
#
# 結果は logs\kyujinbox-suggestions\YYYY-MM-DD.txt に保存されます（.gitignore済み・コミットされません）。
# 【重要】ここで自動生成されるのはDRY-RUNの提案内容のみです。実際に求人を作成する --apply は、
# 内容を確認した上で手動で実行してください（既存の掲載中求人と同様、無人では反映しません）。
#
# 使い方: PowerShellをこのフォルダ（recruitment-platform）で開き、
#   powershell -ExecutionPolicy Bypass -File install-kyujinbox-suggestions.ps1
#
# 削除: 同じコマンドに -Uninstall を付けて実行
#   powershell -ExecutionPolicy Bypass -File install-kyujinbox-suggestions.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'RecruitmentKyujinboxSuggestions'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "登録解除しました: タスク『$taskName』"
    exit 0
}

$batPath = Join-Path $here 'scripts\run-kyujinbox-suggestions.bat'
if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: $batPath が見つかりません。" -ForegroundColor Red
    exit 1
}

$action   = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $here
$trigger  = New-ScheduledTaskTrigger -Daily -At 3:30am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -WakeToRun

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "登録しました: タスク『$taskName』（毎朝3:30に実行）" -ForegroundColor Cyan
Write-Host "保存先: $here\logs\kyujinbox-suggestions\YYYY-MM-DD.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "手動テスト:" -ForegroundColor Gray
Write-Host "  $batPath" -ForegroundColor Gray
Write-Host ""
Write-Host "※ これはDRY-RUNの提案のみを自動生成します。実際に求人を作成するには、内容を確認した上で" -ForegroundColor Yellow
Write-Host "  次のコマンドを手動実行してください: node --experimental-sqlite scripts\generate-kyujinbox-from-performance.js --apply" -ForegroundColor Yellow
