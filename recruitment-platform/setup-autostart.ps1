# 合同会社ニクール 採用管理システム - 自動起動セットアップ
# 管理者権限なしで実行可能（ログオン時タスク）

$taskName = "NikoolRecruitmentPlatform"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$vbsPath   = Join-Path $scriptDir "start.vbs"

# ログフォルダ作成
$logsDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

# 既存タスクがあれば削除
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "既存のタスクを削除しました"
}

# タスク定義
$action  = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "合同会社ニクール 採用管理システム (http://localhost:3000)" | Out-Null

Write-Host ""
Write-Host "✅ 自動起動の設定が完了しました！" -ForegroundColor Green
Write-Host ""
Write-Host "  タスク名 : $taskName"
Write-Host "  起動条件 : Windowsログオン時"
Write-Host "  アクセス : http://localhost:3000"
Write-Host ""
Write-Host "今すぐ起動する場合は以下を実行してください:"
Write-Host "  node `"$scriptDir\server.js`"" -ForegroundColor Cyan
