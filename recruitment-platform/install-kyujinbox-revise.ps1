# 求人ボックスの求人修正（kyujinbox_autoloop.js、各社25件・--apply）を
# 「月・水・金 7:00（このPCのローカル時刻）」に自動実行するタスクを登録します。
# 対象会社: sq, bg, st, bi, nl, sl, am（nxはengage専業のため対象外）。
#
# 【重要・安全設計】--apply のみで --push は付けていません。AI(Claude)が生成した
# タイトル・本文・タグの改善案は自社DBには反映されますが、求人ボックスの実際の掲載へは
# 自動で反映されません（垢BANリスクを避けるため、ライブ反映は人が内容を確認してから
# 手動で行う想定）。反映するには、内容を確認のうえ次を手動実行してください:
#   node --experimental-sqlite scripts\kyujinbox_autoloop.js --company <会社> --apply --push --push-save --limit 25
#
# また、それぞれの求人は kyujinbox_autoloop.js 側の cooldownDays（既定5日）・maxOptimize
# （既定3回）で「同じ求人を短期間に繰り返し修正しない」制御が既に入っています。
#
# 使い方: PowerShellをこのフォルダ（recruitment-platform）で開き、
#   powershell -ExecutionPolicy Bypass -File install-kyujinbox-revise.ps1
#
# 削除: 同じコマンドに -Uninstall を付けて実行
#   powershell -ExecutionPolicy Bypass -File install-kyujinbox-revise.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'RecruitmentKyujinboxRevise'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "登録解除しました: タスク『$taskName』"
    exit 0
}

$batPath = Join-Path $here 'scripts\run-kyujinbox-revise.bat'
if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: $batPath が見つかりません。" -ForegroundColor Red
    exit 1
}

$action   = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $here
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Wednesday,Friday -At '7:00AM'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 3)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "登録しました: タスク『$taskName』（月・水・金 7:00に実行、各社25件）" -ForegroundColor Cyan
Write-Host "保存先: $here\logs\kyujinbox-revise\YYYY-MM-DD.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "手動テスト:" -ForegroundColor Gray
Write-Host "  $batPath" -ForegroundColor Gray
Write-Host ""
Write-Host "※ これはDBへの反映(--apply)のみです。求人ボックスの実際の掲載を更新するには、" -ForegroundColor Yellow
Write-Host "  内容を確認した上で --push --push-save を付けて手動実行してください。" -ForegroundColor Yellow
