$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profile = Join-Path $root "data\profiles\beta"
$pidPath = Join-Path $profile "paperfield.pid"
$tunnelPidPath = Join-Path $profile "cloudflared.pid"
$ngrokPidPath = Join-Path $profile "ngrok.pid"

if (Test-Path -LiteralPath $ngrokPidPath) {
    $ngrokId = [int](Get-Content -LiteralPath $ngrokPidPath -Raw).Trim()
    $ngrok = Get-CimInstance Win32_Process -Filter "ProcessId = $ngrokId" -ErrorAction SilentlyContinue
    if ($ngrok -and $ngrok.Name -eq "ngrok.exe") {
        Stop-Process -Id $ngrokId -Force
        Write-Host "Stopped ngrok beta tunnel."
    }
    Remove-Item -LiteralPath $ngrokPidPath -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $tunnelPidPath) {
    $tunnelId = [int](Get-Content -LiteralPath $tunnelPidPath -Raw).Trim()
    $tunnel = Get-CimInstance Win32_Process -Filter "ProcessId = $tunnelId" -ErrorAction SilentlyContinue
    if ($tunnel -and $tunnel.Name -eq "cloudflared.exe" -and $tunnel.CommandLine -like "*127.0.0.1:8876*") {
        Stop-Process -Id $tunnelId -Force
        Write-Host "Stopped Cloudflare beta tunnel."
    }
    Remove-Item -LiteralPath $tunnelPidPath -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $pidPath) {
    $processId = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -like "*app.py*--port*8876*") {
        Stop-Process -Id $processId -Force
        Write-Host "Stopped Paperfield beta service."
    }
    Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $pidPath) -and -not (Test-Path -LiteralPath $tunnelPidPath)) {
    Write-Host "Paperfield beta sharing is stopped."
}
