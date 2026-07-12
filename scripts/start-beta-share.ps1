$ErrorActionPreference = "Stop"

Write-Host "Cloudflare Quick Tunnel has been retired for beta sharing. Starting ngrok instead." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "start-beta-ngrok.ps1")
exit $LASTEXITCODE
