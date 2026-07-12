$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profile = Join-Path $root "data\profiles\beta"
$users = Join-Path $profile "auth-users.json"
$port = 8876

python (Join-Path $PSScriptRoot "prepare-beta-profile.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath $users)) {
    throw "No beta account exists. Run scripts\manage-beta-users.py add <username> first."
}

$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrok) {
    $fallback = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    if (Test-Path -LiteralPath $fallback) {
        $ngrok = Get-Item -LiteralPath $fallback
    } else {
        throw "ngrok is not installed. Run: winget install --id Ngrok.Ngrok"
    }
}
$ngrokPath = if ($ngrok.Source) { $ngrok.Source } else { $ngrok.FullName }
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use. Stop the existing beta service first."
}

$env:PAPERFIELD_DATA_DIR = $profile
$env:PAPERFIELD_AUTH_USERS_PATH = $users
$env:PAPERFIELD_AUTH_REQUIRED = "1"
$env:PAPERFIELD_HOST = "127.0.0.1"
$env:PAPERFIELD_PORT = "$port"
$env:PAPERFIELD_DISABLE_CLOUD = "0"
$env:PAPERFIELD_CLOUD_PREFIX = "community-beta"
$env:PAPERFIELD_SHARED_STORAGE_MAX_MB = "2048"
$env:PAPERFIELD_PDF_STORAGE_MODE = "cloud"

$stdout = Join-Path $profile "paperfield-share.log"
$stderr = Join-Path $profile "paperfield-share-error.log"
$ngrokLog = Join-Path $profile "ngrok.log"
$python = (Get-Command python).Source
$paperfield = Start-Process -FilePath $python `
    -ArgumentList "app.py", "--host", "127.0.0.1", "--port", "$port" `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Set-Content -LiteralPath (Join-Path $profile "paperfield.pid") -Value $paperfield.Id
$tunnel = $null

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2
            if ($health.status -eq "ok") { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { throw "Paperfield beta service did not start. Check $stderr" }

    Remove-Item -LiteralPath $ngrokLog -ErrorAction SilentlyContinue
    $tunnel = Start-Process -FilePath $ngrokPath `
        -ArgumentList "http", "$port", "--log", $ngrokLog, "--log-format", "json" `
        -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath (Join-Path $profile "ngrok.pid") -Value $tunnel.Id

    $shareUrl = ""
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
            $shareUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
            if ($shareUrl) { break }
        } catch {}
        if ($tunnel.HasExited) { break }
    }
    if (-not $shareUrl) {
        $details = Get-Content $ngrokLog -Tail 8 -ErrorAction SilentlyContinue
        throw "ngrok did not return an HTTPS URL. Add your free Authtoken first. $details"
    }
    Set-Content -LiteralPath (Join-Path $profile "share-url.txt") -Value $shareUrl
    Write-Host "Paperfield beta is protected by account login." -ForegroundColor Green
    Write-Host "Share URL: $shareUrl" -ForegroundColor Cyan
    Write-Host "Keep this window open. Press Ctrl+C to stop sharing." -ForegroundColor Yellow
    Wait-Process -Id $tunnel.Id
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
    if (-not $paperfield.HasExited) { Stop-Process -Id $paperfield.Id -Force }
    Remove-Item -LiteralPath (Join-Path $profile "paperfield.pid") -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $profile "ngrok.pid") -ErrorAction SilentlyContinue
}
