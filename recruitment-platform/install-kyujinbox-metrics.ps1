# 求人ボックスの実績取得（scripts/kyujinbox_autoloop.js・DRY-RUN）を
# 「毎朝4:00（このPCのローカル時刻）」に自動実行するタスクを登録します。
# 3:00の採用ファネル日次レポート、3:30の新規求人提案の後に十分な余裕を持たせるため、
# 1時間後に設定しています（Playwrightでの各社ログイン処理に時間がかかるため）。
#
# 動作: 各社の求人ボックスアカウントにログインし、閲覧数・応募数を取得してjob_metricsに保存
#（--apply/--push なしでも保存自体は行われます）。その後、成績の低い求人にはAIが改善案を
# 提示しますが、DBへの反映（--apply）・求人ボックスへの反映（--push）は一切行いません。
# 結果は logs\kyujinbox-metrics\YYYY-MM-DD.txt に保存されます（.gitignore済み・コミットされません）。
#
# 【重要】このタスクは実績の取得と改善案の提示のみです。実際に求人内容を変更するには、
# 内容を確認した上で手動で --apply を実行してください。
#
# 使い方: PowerShellをこのフォルダ（recruitment-platform）で開き、
#   powershell -ExecutionPolicy Bypass -File install-kyujinbox-metrics.ps1
#
# 削除: 同じコマンドに -Uninstall を付けて実行
#   powershell -ExecutionPolicy Bypass -File install-kyujinbox-metrics.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'RecruitmentKyujinboxMetrics'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "登録解除しました: タスク『$taskName』"
    exit 0
}

$batPath = Join-Path $here 'scripts\run-kyujinbox-metrics.bat'
if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: $batPath が見つかりません。" -ForegroundColor Red
    exit 1
}

$action   = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $here
$trigger  = New-ScheduledTaskTrigger -Daily -At '4:00AM'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "登録しました: タスク『$taskName』（毎朝4:00に実行）" -ForegroundColor Cyan
Write-Host "保存先: $here\logs\kyujinbox-metrics\YYYY-MM-DD.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "手動テスト:" -ForegroundColor Gray
Write-Host "  $batPath" -ForegroundColor Gray
Write-Host ""
Write-Host "※ これは実績取得と改善案の提示のみです。求人内容を実際に変更するには、内容を確認した上で" -ForegroundColor Yellow
Write-Host "  次のコマンドを手動実行してください: node --experimental-sqlite scripts\kyujinbox_autoloop.js --company all --apply" -ForegroundColor Yellow
