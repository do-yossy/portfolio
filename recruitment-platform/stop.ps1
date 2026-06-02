# 採用管理システムを停止する
$proc = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -eq "" -or $true
} | Where-Object {
    (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*server.js*"
}

if ($proc) {
    $proc | Stop-Process -Force
    Write-Host "✅ サーバーを停止しました" -ForegroundColor Green
} else {
    Write-Host "サーバーは起動していません" -ForegroundColor Yellow
}
