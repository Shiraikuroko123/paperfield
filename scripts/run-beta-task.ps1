$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profile = Join-Path $root "data\profiles\beta"
$stdout = Join-Path $profile "share-launcher.out.log"
$stderr = Join-Path $profile "share-launcher.err.log"

New-Item -ItemType Directory -Force -Path $profile | Out-Null
& (Join-Path $PSScriptRoot "start-beta-ngrok.ps1") 1> $stdout 2> $stderr
