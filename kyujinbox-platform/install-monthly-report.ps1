# 月次レポートを「毎月1日 朝9時」に自動生成するタスクを登録します。
# 使い方: PowerShellをこのフォルダで開き、  powershell -ExecutionPolicy Bypass -File install-monthly-report.ps1
# （サーバー起動時にも前月分は自動生成されますが、これを入れると確実に毎月生成されます）

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'node が見つかりません。Node.jsをインストールしてください。'; exit 1 }

$taskName = 'KyujinboxMonthlyReport'
$script   = Join-Path $here 'scripts\monthly_report.js'

$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $here
# 毎日09:00に起動（スクリプトは前月分を対象に生成。月初に確実に前月レポートが揃います）
$trigger = New-ScheduledTaskTrigger -Daily -At 9am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

# 毎日9時に起動し、スクリプト側で「前月分が未生成なら生成」する運用（月初に確実に前月分が出来ます）
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "登録しました: タスク『$taskName』（毎日9:00に実行し、前月分レポートが無ければ生成）"
Write-Host "手動テスト: node `"$script`""
