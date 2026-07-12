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

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    $fallback = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    if (Test-Path -LiteralPath $fallback) {
        $cloudflared = Get-Item -LiteralPath $fallback
    } else {
        throw "cloudflared is not installed. Run: winget install --id Cloudflare.cloudflared"
    }
}
$cloudflaredPath = if ($cloudflared.Source) { $cloudflared.Source } else { $cloudflared.FullName }
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use. Stop the existing beta service first."
}

$env:PAPERFIELD_DATA_DIR = $profile
$env:PAPERFIELD_AUTH_USERS_PATH = $users
$env:PAPERFIELD_AUTH_REQUIRED = "1"
$env:PAPERFIELD_HOST = "127.0.0.1"
$env:PAPERFIELD_PORT = "$port"
$env:PAPERFIELD_DISABLE_CLOUD = "1"
$env:PAPERFIELD_S3_PROVIDER = ""
$env:PAPERFIELD_S3_ENDPOINT = ""
$env:PAPERFIELD_S3_REGION = ""
$env:PAPERFIELD_S3_BUCKET = ""
$env:PAPERFIELD_S3_ACCESS_KEY_ID = ""
$env:PAPERFIELD_S3_SECRET_ACCESS_KEY = ""

$stdout = Join-Path $profile "paperfield-share.log"
$stderr = Join-Path $profile "paperfield-share-error.log"
$tunnelOut = Join-Path $profile "cloudflared.out.log"
$tunnelErr = Join-Path $profile "cloudflared.err.log"
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
    if (-not $ready) {
        throw "Paperfield beta service did not start. Check $stderr"
    }

    Write-Host "Paperfield beta is protected by account login." -ForegroundColor Green
    Remove-Item -LiteralPath $tunnelOut,$tunnelErr -ErrorAction SilentlyContinue
    $tunnel = Start-Process -FilePath $cloudflaredPath `
        -ArgumentList "tunnel", "--url", "http://127.0.0.1:$port", "--protocol", "http2", "--no-autoupdate" `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr
    Set-Content -LiteralPath (Join-Path $profile "cloudflared.pid") -Value $tunnel.Id

    $shareUrl = ""
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        $logs = ((Get-Content $tunnelOut,$tunnelErr -Raw -ErrorAction SilentlyContinue) -join "`n")
        $match = [regex]::Match($logs, "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($match.Success) { $shareUrl = $match.Value; break }
    }
    if (-not $shareUrl) { throw "Cloudflare Quick Tunnel did not return a URL. Check $tunnelErr" }
    Set-Content -LiteralPath (Join-Path $profile "share-url.txt") -Value $shareUrl
    Write-Host "Share URL: $shareUrl" -ForegroundColor Cyan
    Write-Host "Keep this window open. Press Ctrl+C to stop sharing." -ForegroundColor Yellow
    Wait-Process -Id $tunnel.Id
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
    if (-not $paperfield.HasExited) { Stop-Process -Id $paperfield.Id -Force }
    Remove-Item -LiteralPath (Join-Path $profile "paperfield.pid") -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $profile "cloudflared.pid") -ErrorAction SilentlyContinue
}
