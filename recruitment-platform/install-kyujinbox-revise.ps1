# 求人ボックスの求人修正（kyujinbox_autoloop.js、各社25件・--apply --push --push-save）を
# 「月・水・金 7:00（このPCのローカル時刻）」に自動実行するタスクを登録します。
# 対象会社: sq, bg, st, bi, nl, sl, am（nxはengage専業のため対象外）。
#
# 【重要・2026-09-28 ユーザー指示によりフル自動化】AI(Claude)が生成したタイトル・本文・
# タグの改善案は自社DBに反映されたうえで、そのまま求人ボックスの実際の掲載へも自動で
# 反映されます（--push --push-save）。人による確認・承認ステップはありません。
# kyujinbox_autoloop.js側のcooldownDays（既定5日）・maxOptimize（既定3回）により
# 同じ求人を短期間に繰り返し修正・反映しない制御は入っていますが、それ以外の歯止めは
# ないため、垢BANの兆候（掲載停止・警告メール等）が無いか定期的にログを確認してください。
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
Write-Host "※ DBへの反映に加えて、求人ボックスの実際の掲載も自動で更新されます(--push --push-save)。" -ForegroundColor Yellow
Write-Host "  人による確認ステップは無いので、垢BANの兆候が無いか定期的にログを確認してください。" -ForegroundColor Yellow
